// dsh-stackdecoder — parse a stack trace, look up each frame in the local
// codebase, return code context so the agent can see WHERE the bug is.

import { decodeStack } from "./decode-stack.js";

export const tools = [
  {
    name: "decode_stack",
    description:
      "把一段堆栈文本(Java/Node/Python/Go/通用)解析成 frame 列表,逐帧到本地代码里" +
      "取上下文(默认每帧 ±5 行),一次性返回。AI 拿到堆栈后不用逐 frame 再 read_file 来回问。" +
      "参数:trace(原始堆栈文本)、cwd(项目根目录)、maxFrames(默认 10,只解前 N 帧)。" +
      "返回:language, frameCount, frames[{file,line,context.snippet,context.found}]。" +
      "代价:1 次 trace 解析 + N 次本地文件读(<1ms/帧)。输出大小与 maxFrames 成正比," +
      "每帧约 100-400 字符代码片段。",
    parameters: {
      type: "object",
      properties: {
        trace: { type: "string", description: "原始堆栈文本" },
        cwd: { type: "string", description: "项目根目录,用于解析相对路径" },
        maxFrames: { type: "integer", description: "可选:最多解几帧,默认 10" },
        contextBefore: { type: "integer", description: "可选:每帧前几行,默认 5" },
        contextAfter: { type: "integer", description: "可选:每帧后几行,默认 5" },
      },
      required: ["trace", "cwd"],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: "object",
        properties: {
          ok: { type: "boolean" },
          language: { type: "string" },
          frameCount: { type: "integer" },
          resolvedCount: { type: "integer" },
          missingCount: { type: "integer" },
          truncated: { type: "boolean" },
          frames: { type: "array" },
          summary: { type: "string" },
          note: { type: "string" },
        },
      },
      render: (_args, value) => {
        if (!value.ok) return [{ type: "text", text: `❌ ${value.error || "解析失败"}` }];
        const head = `✅ ${value.language} 堆栈 — ${value.frameCount} 帧,已解 ${value.resolvedCount},缺失 ${value.missingCount}${value.truncated ? " (已截断)" : ""}\n   ${value.summary}`;
        const body = value.frames.map((f, idx) => {
          const tag = f.context?.found ? "  " : "❓";
          const loc = `${f.file}:${f.line} ${f.function || ""}`.trim();
          if (!f.context?.found) {
            return `${tag} [${idx + 1}] ${loc} — 无法定位本地代码`;
          }
          const snippet = (f.context.snippet || []).map(s => `       ${s.lineNo}| ${s.code}`).join("\n");
          return `${tag} [${idx + 1}] ${loc}\n${snippet}`;
        }).join("\n\n");
        return [{ type: "text", text: head + "\n\n" + body + (value.note ? `\n\n💡 ${value.note}` : "") }];
      },
    },
    isConcurrencySafe: () => true,
    timeoutMs: 10_000,
    async execute(args) {
      return decodeStack(args);
    },
  },
];
