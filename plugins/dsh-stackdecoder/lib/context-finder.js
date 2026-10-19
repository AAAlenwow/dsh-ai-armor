/**
 * context_for_frame — given a parsed frame (file, line, optional column),
 * read the file from disk and return the line plus N lines of context
 * before and after.
 *
 * If the file doesn't exist (typical for minified/stripped traces), we
 * return context: null and a clear note. The agent should treat that as
 * "we know WHERE the bug is, but can't see the code" — common for
 * library code or production stack traces.
 */
import { readFileSync, existsSync } from "node:fs";
import { isAbsolute, resolve, dirname, basename } from "node:path";

const DEFAULT_CONTEXT = 5;

/** Resolve a possibly-relative file path against a base cwd. */
function resolveFile(file, cwd) {
  if (isAbsolute(file)) return file;
  // Strip trailing "(file.js:NN)" parens or anything after a colon
  // Some traces have "  at fn (file.js:10:5)" — file is already extracted.
  // This function is called with the already-extracted file.
  return resolve(cwd, file);
}

/** Find the closest existing file by stripping leading path components. */
function fuzzyFind(file, cwd) {
  // Try the full path first
  const fullPath = resolveFile(file, cwd);
  if (existsSync(fullPath)) return fullPath;
  // Try just the basename
  const base = basename(file);
  // Search a few common subdirs (src/, lib/, app/)
  for (const sub of ["src", "lib", "app", "src/main", "."]) {
    const candidate = resolve(cwd, sub, base);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function contextForFrame({ file, line, cwd, before = DEFAULT_CONTEXT, after = DEFAULT_CONTEXT } = {}) {
  if (!file || !line) {
    return { file, line, found: false, reason: "缺 file 或 line" };
  }
  const realPath = fuzzyFind(file, cwd);
  if (!realPath) {
    return { file, line, found: false, reason: `文件不存在: ${file} (cwd=${cwd})`, hint: "堆栈来自打包/混淆代码或被删除的源码,无法直接读取。" };
  }
  let text;
  try {
    text = readFileSync(realPath, "utf8");
  } catch (e) {
    return { file: realPath, line, found: false, reason: `读取失败: ${e.message}` };
  }
  const lines = text.split("\n");
  if (line < 1 || line > lines.length) {
    return { file: realPath, line, found: false, reason: `行号越界 (文件共 ${lines.length} 行)`, totalLines: lines.length };
  }
  const start = Math.max(1, line - before);
  const end = Math.min(lines.length, line + after);
  const snippet = [];
  for (let i = start; i <= end; i++) {
    snippet.push({ line: i, code: lines[i - 1], highlight: i === line });
  }
  return {
    file: realPath,
    line,
    found: true,
    snippet,
    startLine: start,
    endLine: end,
    totalLines: lines.length,
  };
}
