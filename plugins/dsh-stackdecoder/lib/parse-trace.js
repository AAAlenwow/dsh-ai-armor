/**
 * Trace parsers — turn a multi-language stack trace into a uniform list of
 * frames: { file, line, column?, function, raw, language }.
 *
 * Supported formats:
 *   - JavaScript / Node.js  ("    at fnName (path:line:col)" or "    at path:line:col")
 *   - Python              ('File "path", line N, in fnName' / 'File "path", line N')
 *   - Java                ('at pkg.Class.method(File.java:123)')
 *   - Go                  ('goroutine 1 [running]:\nmain.fn()\n\t/path:NN +0xNN')
 *
 * Anything we don't recognize falls through to `parseGeneric` which looks
 * for "path:line" pairs and tries to attach them to the nearest preceding
 * function-like token.
 */

const LANG = {
  JS: "javascript",
  PY: "python",
  JAVA: "java",
  GO: "go",
  UNKNOWN: "unknown",
};

/** JavaScript / Node.js parser. */
function parseNode(trace) {
  const frames = [];
  // Two formats to handle:
  //   1. "    at fnName (path:line:col)" — top-level functions
  //   2. "    at path:line:col"           — anonymous/eval/module
  const re1 = /^\s*at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)\s*$/;
  const re2 = /^\s*at\s+(.+?):(\d+):(\d+)\s*$/;
  for (const line of trace.split("\n")) {
    let m = line.match(re1);
    if (m) {
      frames.push({ language: LANG.JS, function: m[1], file: m[2], line: Number(m[3]), column: Number(m[4]), raw: line });
      continue;
    }
    m = line.match(re2);
    if (m) {
      frames.push({ language: LANG.JS, function: "<anonymous>", file: m[1], line: Number(m[2]), column: Number(m[3]), raw: line });
    }
  }
  return frames;
}

/** Python parser. */
function parsePython(trace) {
  const frames = [];
  // Standard: '  File "path", line N, in fnName'
  // Compressed: '  File "path", line N'
  const re1 = /^\s*File\s+"(.+?)",\s*line\s+(\d+)(?:,\s*in\s+(.+))?\s*$/;
  for (const line of trace.split("\n")) {
    const m = line.match(re1);
    if (m) {
      frames.push({ language: LANG.PY, file: m[1], line: Number(m[2]), function: m[3] || "<module>", raw: line });
    }
  }
  return frames;
}

/** Java parser. */
function parseJava(trace) {
  const frames = [];
  // '    at pkg.Class.method(File.java:123)'
  // '    at pkg.Class.method(File.java:123)'
  // '    at pkg.Class.method(Unknown Source)'
  const re = /^\s*at\s+([^\s(]+)\(([^):]+?)(?::(\d+))?\)\s*$/;
  for (const line of trace.split("\n")) {
    const m = line.match(re);
    if (m && m[2].endsWith(".java")) {
      frames.push({ language: LANG.JAVA, function: m[1], file: m[2], line: m[3] ? Number(m[3]) : null, raw: line });
    }
  }
  return frames;
}

/** Go parser. */
function parseGo(trace) {
  const frames = [];
  // After 'goroutine N [...]:' we have:
  //   pkg.fn(args)
  //   \t/path/to/file.go:NN +0xNN
  const lines = trace.split("\n");
  let i = 0;
  // Find the function name (non-\t line) followed by a \t/path:line line
  while (i < lines.length) {
    const line = lines[i];
    const fnMatch = line.match(/^([^\s].*?)\(.*\)\s*$/);
    if (fnMatch && i + 1 < lines.length) {
      const locMatch = lines[i + 1].match(/^\s+(.+?):(\d+)\s/);
      if (locMatch) {
        frames.push({ language: LANG.GO, function: fnMatch[1], file: locMatch[1], line: Number(locMatch[2]), raw: `${line}\n${lines[i + 1]}` });
        i += 2;
        continue;
      }
    }
    i++;
  }
  return frames;
}

/** Generic fallback: any "path:NN" pair on its own line. */
function parseGeneric(trace) {
  const frames = [];
  const re = /^\s*(.+?):(\d+)(?::(\d+))?\s*$/;
  for (const line of trace.split("\n")) {
    const m = line.match(re);
    if (m && /\.[a-zA-Z]{1,5}$/.test(m[1])) {
      // Looks like a file path with extension — accept it
      frames.push({ language: LANG.UNKNOWN, file: m[1], line: Number(m[2]), column: m[3] ? Number(m[3]) : null, function: null, raw: line });
    }
  }
  return frames;
}

/** Public API: dispatch to the right parser, or fall back. */
export function parseTrace(trace) {
  if (typeof trace !== "string" || !trace.trim()) {
    return { language: LANG.UNKNOWN, frames: [], note: "空或非字符串输入" };
  }
  // Heuristics: try each parser and pick the one that matched most frames.
  const candidates = [
    ["javascript", parseNode(trace)],
    ["python", parsePython(trace)],
    ["java", parseJava(trace)],
    ["go", parseGo(trace)],
    ["generic", parseGeneric(trace)],
  ];
  candidates.sort((a, b) => b[1].length - a[1].length);
  const [bestLang, bestFrames] = candidates[0];
  return {
    language: bestLang === "generic" ? LANG.UNKNOWN : bestLang,
    frameCount: bestFrames.length,
    frames: bestFrames,
    note: bestFrames.length === 0
      ? "未识别出任何 stack frame。请确认输入是 Node.js / Python / Java / Go 的错误堆栈。"
      : `识别为 ${bestLang} 格式,共 ${bestFrames.length} 帧。`,
  };
}
