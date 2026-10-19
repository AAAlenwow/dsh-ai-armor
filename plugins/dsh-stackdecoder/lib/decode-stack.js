/**
 * dsh-stackdecoder — parse a stack trace, look up each frame in the local
 * codebase, return the code context so the agent can see WHERE the bug is.
 *
 * Inputs:
 *   - trace: the raw stack-trace text (paste from a log, terminal, etc.)
 *   - cwd:   the project root to resolve relative file paths against
 *   - maxFrames: cap how many frames to resolve (default 10, to keep token
 *               budget tight). The top frame is always included.
 *   - contextBefore / contextAfter: lines of context around the frame
 *
 * Output:
 *   - { ok, language, frameCount, frames: [{ ...frame, context }] }
 *   - Each frame includes the parsed location AND the file content so the
 *     agent doesn't have to do another file_read round-trip.
 */
import { parseTrace } from "./parse-trace.js";
import { contextForFrame } from "./context-finder.js";

export async function decodeStack({ trace, cwd, maxFrames = 10, contextBefore = 5, contextAfter = 5 } = {}) {
  if (!trace) {
    return { ok: false, error: "需要 trace 参数(粘贴完整堆栈文本)" };
  }
  if (!cwd) {
    return { ok: false, error: "需要 cwd 参数(项目根目录,用于解析文件路径)" };
  }

  const parsed = parseTrace(trace);
  if (parsed.frameCount === 0) {
    return { ok: false, error: parsed.note, language: parsed.language };
  }

  // Resolve contexts in parallel for speed (each frame is independent).
  // Cap to maxFrames — usually the top 5 frames are enough; deeper frames
  // are usually framework/library code with no actionable context.
  const framesToResolve = parsed.frames.slice(0, maxFrames);
  const resolved = await Promise.all(
    framesToResolve.map(async (frame) => {
      const ctx = contextForFrame({
        file: frame.file,
        line: frame.line,
        cwd,
        before: contextBefore,
        after: contextAfter,
      });
      return { ...frame, context: ctx };
    })
  );

  const foundCount = resolved.filter((f) => f.context.found).length;
  const missingCount = resolved.length - foundCount;

  return {
    ok: true,
    language: parsed.language,
    frameCount: parsed.frameCount,
    resolvedCount: foundCount,
    missingCount,
    truncated: parsed.frameCount > maxFrames,
    frames: resolved,
    summary: buildSummary(resolved, parsed),
    note: missingCount > 0
      ? `${missingCount} 帧的文件无法读取(可能是打包/混淆代码或已删除文件),只标注位置不展示上下文。`
      : "所有帧都已定位到本地代码。",
  };
}

/** Build a 1-2 sentence "what does this look like" summary. */
function buildSummary(frames, parsed) {
  const top = frames[0];
  if (!top) return "无可解析的帧。";
  const where = top.context.found
    ? `${top.file}:${top.line} (${top.function || "anonymous"})`
    : `${top.file}:${top.line} (本地代码无法读取)`;
  return `最可能的事故现场: ${where}。共 ${parsed.frameCount} 帧,已为前 ${frames.length} 帧加载源码上下文。`;
}
