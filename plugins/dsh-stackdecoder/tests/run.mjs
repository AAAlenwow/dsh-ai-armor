/**
 * dsh-stackdecoder test harness — runs every case in ./cases and produces
 * REPORT.md with measurable metrics anyone can reproduce.
 *
 * A "case" is a directory under ./cases/<name>/ that contains:
 *   - setup.sh        : idempotent script that creates a sample project
 *   - input.json      : arguments to pass to the tool
 *   - expected.json   : assertions (frame counts, file resolution, etc.)
 *
 * The runner calls one tool from ../lib/ and measures:
 *   - latency_ms      : wall time of the tool call
 *   - output_chars    : what the agent would see
 *   - tokens_est/high/low : from tokenize.mjs
 *   - assertions      : which expected.json fields matched
 */
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { countTokens, simulateAgentView } from "./tokenize.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(here, "..");
const casesDir = join(here, "cases");
const reportPath = join(pluginRoot, "REPORT.md");

const results = [];

for (const caseName of readdirSync(casesDir).sort()) {
  const caseDir = join(casesDir, caseName);
  if (!existsSync(join(caseDir, "input.json"))) continue;
  const setup = join(caseDir, "setup.sh");
  if (existsSync(setup)) {
    console.log(`\n--- ${caseName}: setup ---`);
    try {
      execSync(`bash "${setup}"`, { cwd: caseDir, stdio: "inherit", timeout: 30_000 });
    } catch (e) {
      results.push({ case: caseName, tool: "(setup)", error: `setup failed: ${e.message}`, passed: false, latency_ms: 0, output_chars: 0, tokens_est: 0, tokens_high: 0, tokens_low: 0, assertions: [], input: {} });
      continue;
    }
  }
  const input = JSON.parse(readFileSync(join(caseDir, "input.json"), "utf8"));
  const expected = JSON.parse(readFileSync(join(caseDir, "expected.json"), "utf8"));
  const toolName = input.tool;
  const toolArgs = input.args;
  delete input.tool;

  // Resolve relative cwd to absolute (relative to the case dir).
  if (toolArgs.cwd && !toolArgs.cwd.startsWith("/")) {
    toolArgs.cwd = resolve(caseDir, toolArgs.cwd);
  }

  console.log(`\n--- ${caseName}: running ${toolName} ---`);
  const mod = await import(pathToFileURL(join(pluginRoot, "lib", `${toolName.replace(/_/g, "-")}.js`)).href);
  const fn = mod[Object.keys(mod).find((k) => typeof mod[k] === "function" && k !== "default")];

  const t0 = performance.now();
  const actual = await fn(toolArgs);
  const latency = performance.now() - t0;

  // Assertions
  const assertions = [];
  for (const [key, want] of Object.entries(expected)) {
    const got = getPath(actual, key);
    const ok = deepEqual(got, want);
    assertions.push({ key, want, got, ok });
  }
  const passed = assertions.every((a) => a.ok);
  const agentView = simulateAgentView(actual);
  const tok = countTokens(agentView);

  results.push({
    case: caseName,
    tool: toolName,
    input: toolArgs,
    latency_ms: Math.round(latency * 10) / 10,
    output_chars: agentView.length,
    tokens_est: tok.tokens_est,
    tokens_high: tok.tokens_high,
    tokens_low: tok.tokens_low,
    passed,
    assertions,
    actual,
  });
  console.log(`  latency=${latency.toFixed(1)}ms chars=${agentView.length} tokens≈${tok.tokens_est} passed=${passed}`);
}

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}
function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === "object") {
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    return ak.every((k) => deepEqual(a[k], b[k]));
  }
  // For "matches" assertions we use a substring check: pass a string with .matches: "..."
  if (typeof a === "string" && typeof b === "string" && b.startsWith("matches:")) {
    return a.includes(b.slice("matches:".length));
  }
  return false;
}

// --- Write REPORT.md ---
const lines = [];
lines.push(`# dsh-stackdecoder — Measured Report`);
lines.push(``);
lines.push(`Generated: ${new Date().toISOString()}`);
lines.push(`Node: ${process.version}, Platform: ${process.platform}/${process.arch}`);
lines.push(`Repo: https://github.com/AAAlenwow/dsh-ai-armor/tree/main/plugins/dsh-stackdecoder`);
lines.push(``);
lines.push(`## 摘要`);
const allPass = results.every((r) => r.passed);
lines.push(`- 总用例: **${results.length}**`);
lines.push(`- 通过: **${results.filter((r) => r.passed).length}**`);
lines.push(`- 失败: **${results.filter((r) => !r.passed).length}**`);
lines.push(`- 状态: **${allPass ? "✅ ALL PASS" : "❌ FAILED"}**`);
lines.push(``);
lines.push(`## 工具一览`);
lines.push(``);
lines.push(`| 工具 | 用途 | 平均延迟 | 平均输出 chars | 平均 tokens |`);
lines.push(`|---|---|---|---|---|`);
const byTool = groupBy(results, (r) => r.tool);
for (const [tool, items] of Object.entries(byTool)) {
  const lat = avg(items.map((i) => i.latency_ms));
  const chars = avg(items.map((i) => i.output_chars));
  const tok = avg(items.map((i) => i.tokens_est));
  lines.push(`| \`${tool}\` | ${describeTool(tool)} | ${lat.toFixed(1)}ms | ${chars.toFixed(0)} | ${tok.toFixed(0)} |`);
}
lines.push(``);
lines.push(`## 每个用例的明细`);
lines.push(``);
for (const r of results) {
  lines.push(`### ${r.case} — \`${r.tool}\` ${r.passed ? "✅" : "❌"}`);
  lines.push(``);
  // Truncate the trace for display readability
  const displayInput = { ...r.input };
  if (displayInput.trace) displayInput.trace = displayInput.trace.split("\n")[0] + " ... (" + displayInput.trace.split("\n").length + " lines)";
  lines.push(`- 输入: \`${JSON.stringify(displayInput)}\``);
  lines.push(`- 延迟: **${r.latency_ms}ms**`);
  lines.push(`- 输出大小: ${r.output_chars} chars / ~${r.tokens_est} tokens (高估 ${r.tokens_high}, 低估 ${r.tokens_low})`);
  lines.push(`- 断言:`);
  for (const a of r.assertions) {
    const gotStr = typeof a.got === "string" ? `"${a.got.slice(0, 60)}${a.got.length > 60 ? "..." : ""}"` : JSON.stringify(a.got);
    lines.push(`  - ${a.ok ? "✓" : "✗"} \`${a.key}\` = ${gotStr} (期望 \`${JSON.stringify(a.want)}\`)`);
  }
  lines.push(``);
  lines.push(`**实际返回(片段):**`);
  lines.push("```json");
  lines.push(JSON.stringify(r.actual, null, 2).slice(0, 1500));
  if (JSON.stringify(r.actual).length > 1500) lines.push("... [truncated for readability]");
  lines.push("```");
  lines.push(``);
}

lines.push(`## 注意事项(本机实测)`);
lines.push(``);
lines.push(`1. 解析器按"匹配帧数最多"自动选语言,所以**多语言混合堆栈**也能跑(选帧最多的)。`);
lines.push(`2. \`maxFrames\` 默认 10——只解析顶部几帧;更深层堆栈通常来自框架/库,没有可操作上下文。`);
lines.push(`3. \`contextBefore/After\` 默认 5——输出 token 随这两个值线性增长,别开太大。`);
lines.push(`4. 找不到的文件(打包/混淆代码/已删除源码)返回 \`context.found: false\` 和一个 \`reason\`,**不要**当成错误。`);
lines.push(``);
lines.push(`## 复现方法`);
lines.push(``);
lines.push("```bash");
lines.push("cd plugins/dsh-stackdecoder");
lines.push("node tests/run.mjs   # 重新跑全部 case,生成新的 REPORT.md");
lines.push("```");
lines.push("");
lines.push("任何第三方在干净 macOS / Linux 上复现本报告所需的:");
lines.push("- Node.js >= 18");
lines.push("- 本仓库(或 tarball)+ cd 到插件根目录");
lines.push("");

writeFileSync(reportPath, lines.join("\n"));
console.log(`\n\n✅ Report written to ${reportPath}`);

function groupBy(arr, fn) {
  return arr.reduce((acc, x) => {
    const k = fn(x); (acc[k] = acc[k] || []).push(x); return acc;
  }, {});
}
function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function describeTool(name) {
  return {
    "decode_stack": "解析堆栈并定位每帧到本地代码",
  }[name] || name;
}
