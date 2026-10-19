// lib/config-parser.js
// Minimal zero-dep parser for YAML / ENV / .properties files.
// Scope: produce a flat list of (path, value, line) entries plus
// enough structure to detect common problems (duplicate keys, bad
// indent, malformed lines). NOT a full YAML 1.2 implementation — only
// the subset that real configs use in the wild.

import path from 'node:path';

const YAML_EXT = new Set(['.yml', '.yaml']);
const ENV_EXT = new Set(['.env']);
const PROPS_EXT = new Set(['.properties']);

function detectFileType(filePath) {
  const base = path.basename(filePath).toLowerCase();
  if (base === '.env' || base.endsWith('.env')) return 'env';
  const ext = path.extname(filePath).toLowerCase();
  if (YAML_EXT.has(ext)) return 'yaml';
  if (ENV_EXT.has(ext)) return 'env';
  if (PROPS_EXT.has(ext)) return 'properties';
  // No extension or unknown — try yaml first (most common for app config)
  return 'yaml';
}

// ---- shared utilities ----

function stripComment(line, type) {
  if (type === 'yaml') {
    // # starts a comment, unless inside quotes (good-enough heuristic)
    const hash = line.indexOf('#');
    if (hash === -1) return line;
    // count quotes before hash; if odd, leave alone
    let inQuote = false, q = null;
    for (let i = 0; i < hash; i++) {
      const c = line[i];
      if (q) {
        if (c === q && line[i - 1] !== '\\') q = null;
      } else if (c === '"' || c === "'") {
        q = c; inQuote = !inQuote;
      }
    }
    if (inQuote) return line;
    return line.slice(0, hash);
  }
  if (type === 'env' || type === 'properties') {
    const hash = line.indexOf('#');
    return hash === -1 ? line : line.slice(0, hash);
  }
  return line;
}

function unquote(value) {
  if (typeof value !== 'string') return value;
  const t = value.trim();
  if (t.length >= 2) {
    if ((t.startsWith('"') && t.endsWith('"')) ||
        (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1);
    }
  }
  return t;
}

// ---- YAML parser (minimal) ----
//
// Returns: { ok, error?, entries: [{ path, value, line, indent }], fileType }
// "path" is the dotted key path (e.g. "server.port" or
//   "logging.appenders[0]" for list items).
// "indent" is the leading-space count for that line.
// "value" is the raw string after stripping comment + unquote (null for "key:" with no value).

function parseYaml(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];

  // Track stack of (indent, key-path, listIndex) so nested keys build
  // the dotted path and list items get unique indexed paths.
  const stack = [{ indent: -1, path: [] }];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const stripped = stripComment(raw, 'yaml');
    if (!stripped.trim()) continue;

    // List item at current or deeper indent
    const listMatch = stripped.match(/^(\s*)-\s*(.*)$/);
    if (listMatch) {
      const indent = listMatch[1].length;
      // Pop stack until we find a parent with indent < this one
      while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
        stack.pop();
      }
      const parent = stack[stack.length - 1];
      const parentPath = parent.path.join('.');
      // Count how many list entries already exist at this parent (by tracking index in path)
      // Simpler: look at last entry to see if it's already a [N] item at this path
      let listIdx = 0;
      if (entries.length > 0) {
        const last = entries[entries.length - 1];
        const lastPath = last.path || '';
        if (lastPath.startsWith(parentPath + '[') && /\[\d+\]$/.test(lastPath)) {
          const m = lastPath.match(/\[(\d+)\]$/);
          if (m) listIdx = parseInt(m[1], 10) + 1;
        }
      }
      let rest = listMatch[2].trim();
      // Could be "- key: value" (object-in-list) or just "- value"
      const objMatch = rest.match(/^([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/);
      if (objMatch) {
        const key = objMatch[1];
        const value = objMatch[2] ? unquote(objMatch[2]) : null;
        const fullPath = parentPath + '[' + listIdx + '].' + key;
        entries.push({
          path: fullPath,
          value,
          line: lineNo,
          indent
        });
      } else if (rest) {
        entries.push({
          path: parentPath + '[' + listIdx + ']',
          value: unquote(rest),
          line: lineNo,
          indent
        });
      }
      continue;
    }

    // Key:value line
    const kvMatch = stripped.match(/^(\s*)([A-Za-z0-9_.\-]+)\s*:\s*(.*)$/);
    if (!kvMatch) continue;

    const indent = kvMatch[1].length;
    const key = kvMatch[2];
    const valueRaw = kvMatch[3];

    // Pop stack until parent indent < this indent
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }
    const parent = stack[stack.length - 1];
    const fullPath = parent.path.concat([key]);

    if (valueRaw.trim() === '') {
      // key: with no value — start a nesting block
      stack.push({ indent, path: fullPath });
    } else {
      entries.push({
        path: fullPath.join('.'),
        value: unquote(valueRaw),
        line: lineNo,
        indent
      });
    }
  }

  return { ok: true, entries, fileType: 'yaml' };
}

// ---- ENV parser ----

function parseEnv(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const stripped = stripComment(raw, 'env').trim();
    if (!stripped) continue;
    if (stripped.startsWith('export ')) {
      // export KEY=VALUE → treat as KEY=VALUE
      const m = stripped.slice(7).match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      entries.push({
        path: m[1],
        value: unquote(m[2]),
        line: lineNo
      });
      continue;
    }
    const m = stripped.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) {
      entries.push({
        path: m[1],
        value: unquote(m[2]),
        line: lineNo
      });
    }
  }
  return { ok: true, entries, fileType: 'env' };
}

// ---- properties parser ----

function parseProperties(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const stripped = stripComment(raw, 'properties').trim();
    if (!stripped) continue;
    // Try key=value or key:value (with optional whitespace)
    const m = stripped.match(/^([^=:\s]+)\s*[=:]\s*(.*)$/);
    if (m) {
      entries.push({
        path: m[1],
        value: unquote(m[2]),
        line: lineNo
      });
    } else {
      // key value (space separator) — uncommon, but valid
      const m2 = stripped.match(/^(\S+)\s+(\S.*)$/);
      if (m2) {
        entries.push({ path: m2[1], value: m2[2], line: lineNo });
      }
    }
  }
  return { ok: true, entries, fileType: 'properties' };
}

function parseConfig(filePath, text) {
  const fileType = detectFileType(filePath);
  if (fileType === 'yaml') return parseYaml(text);
  if (fileType === 'env') return parseEnv(text);
  if (fileType === 'properties') return parseProperties(text);
  return { ok: false, error: `unknown file type: ${fileType}`, fileType };
}

export { parseConfig, detectFileType, stripComment, unquote };
