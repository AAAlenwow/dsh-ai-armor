#!/usr/bin/env node
// tests/run.mjs — dsh-mp-auditor test harness.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { countTokens, simulateAgentView } from './tokenize.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HERE = __dirname;
const CASES_DIR = join(HERE, 'cases');
const TOOL_FILE = join(HERE, '..', 'lib', 'findings.js');

function getPath(obj, path) {
  const parts = path.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (/^\d+$/.test(p)) cur = cur[parseInt(p, 10)];
    else cur = cur[p];
  }
  return cur;
}

function deepEqual(actual, expected) {
  if (typeof expected === 'string' && expected.startsWith('matches:')) {
    const needle = expected.slice('matches:'.length);
    if (typeof actual === 'string') return actual.includes(needle);
    if (Array.isArray(actual)) return actual.some(v => typeof v === 'string' && v.includes(needle));
    return false;
  }
  if (expected === null || expected === undefined) return actual === expected;
  if (typeof expected !== typeof actual) return false;
  if (typeof expected !== 'object') return actual === expected;
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return false;
    if (expected.length !== actual.length) return false;
    return expected.every((v, i) => deepEqual(actual[i], v));
  }
  for (const k of Object.keys(expected)) {
    if (!deepEqual(actual[k], expected[k])) return false;
  }
  return true;
}

async function runCase(caseDir) {
  const name = caseDir.split('/').pop();
  const setup = join(caseDir, 'setup.sh');
  const input = JSON.parse(readFileSync(join(caseDir, 'input.json'), 'utf8'));
  const expected = JSON.parse(readFileSync(join(caseDir, 'expected.json'), 'utf8'));

  try {
    execSync(`bash "${setup}"`, { stdio: 'pipe' });
  } catch (e) {
    return { name, ok: false, msg: `setup.sh failed: ${e.message}`, assertions: [] };
  }

  let result, err;
  const t0 = performance.now();
  try {
    const mod = await import(TOOL_FILE);
    // Use case's sample-app as src
    const caseSrc = join(caseDir, 'sample-app');
    result = await mod.auditMpCode({ src: caseSrc });
  } catch (e) {
    err = e;
  }
  const latency = performance.now() - t0;

  if (err) {
    return { name, ok: false, msg: `tool threw: ${err.message}`, assertions: [] };
  }

  const assertions = [];
  let allOk = true;
  for (const [key, want] of Object.entries(expected)) {
    const got = getPath(result, key);
    const ok = deepEqual(got, want);
    assertions.push({ key, want, got, ok });
    if (!ok) allOk = false;
  }

  const view = simulateAgentView(result);
  const tokens = countTokens(view);
  return {
    name,
    ok: allOk,
    latency_ms: Math.round(latency * 100) / 100,
    chars: tokens.chars,
    tokens_est: tokens.tokens_est,
    assertions
  };
}

async function main() {
  const cases = readdirSync(CASES_DIR)
    .filter(d => existsSync(join(CASES_DIR, d, 'input.json')))
    .sort();

  console.log(`\n=== dsh-mp-auditor test harness ===\n`);
  console.log(`Found ${cases.length} test cases.\n`);

  const results = [];
  for (const c of cases) {
    const r = await runCase(join(CASES_DIR, c));
    results.push(r);
    const fail = r.assertions.filter(a => !a.ok);
    const msg = r.ok
      ? `${r.latency_ms}ms, ${r.chars} chars / ~${r.tokens_est} tokens, ${r.assertions.length} assertions`
      : `${fail.length}/${r.assertions.length} assertions failed: ` +
        fail.slice(0, 3).map(a => `${a.key}=${JSON.stringify(a.got)?.slice(0, 60)}`).join('; ');
    console.log(`${r.ok ? '✅' : '❌'} ${c} — ${msg}`);
  }

  const report = renderReport(results);
  writeFileSync(join(HERE, 'REPORT.md'), report);
  console.log(`\nReport: ${join(HERE, 'REPORT.md')}`);

  const passed = results.filter(r => r.ok).length;
  console.log(`\n${passed}/${results.length} cases passed.\n`);
  process.exit(results.every(r => r.ok) ? 0 : 1);
}

function renderReport(results) {
  const lines = [];
  lines.push('# dsh-mp-auditor — Test Report');
  lines.push('');
  lines.push('| Case | Result | Latency | Output | Tokens (est) | Assertions |');
  lines.push('|------|--------|---------|--------|--------------|------------|');
  for (const r of results) {
    lines.push(`| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.latency_ms ?? '—'} ms | ${r.chars ?? '—'} chars | ~${r.tokens_est ?? '—'} | ${r.assertions?.length ?? 0} |`);
  }
  lines.push('');
  lines.push('## Per-case details');
  for (const r of results) {
    lines.push(`### ${r.name}`);
    if (r.msg) lines.push(`\n**Failure:** ${r.msg}\n`);
    if (r.assertions) {
      for (const a of r.assertions) {
        const tag = a.ok ? '✅' : '❌';
        lines.push(`- ${tag} \`${a.key}\` → got \`${JSON.stringify(a.got)?.slice(0, 200)}\``);
      }
    }
    lines.push('');
  }
  return lines.join('\n');
}

main().catch(e => { console.error(e); process.exit(2); });
