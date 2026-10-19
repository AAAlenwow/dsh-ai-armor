// lib/validate-config.js
// Validate a parsed config (from config-parser.js) and produce
// errors[] / warnings[] / info{}. Pure function — no I/O.

import fs from 'node:fs';
import path from 'node:path';
import { parseConfig, detectFileType } from './config-parser.js';

// ---- heuristic checks ----

function checkYamlRawIssues(text) {
  const issues = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Skip pure whitespace / empty / comments
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    // Tab in indentation is invalid YAML
    const leading = raw.match(/^(\s*)/)[1];
    if (leading.includes('\t')) {
      issues.push({
        severity: 'error',
        line: i + 1,
        message: 'YAML 不允许使用 tab 缩进,请改为空格'
      });
    }
    // Trailing whitespace
    if (raw !== raw.replace(/[ \t]+$/, '')) {
      issues.push({
        severity: 'warning',
        line: i + 1,
        message: '行尾有冗余空白字符'
      });
    }
  }
  return issues;
}

function checkEnvRawIssues(text) {
  const issues = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const stripped = raw.split('#')[0]; // strip comments
    const trimmed = stripped.trim();
    if (!trimmed) continue;
    // Must have KEY=VALUE form (with optional "export " prefix)
    const m = trimmed.match(/^(?:export\s+)?(.+?)\s*=\s*(.*)$/);
    if (!m) {
      issues.push({
        severity: 'error',
        line: lineNo,
        message: `无法解析为 KEY=VALUE: "${trimmed.slice(0, 60)}"`
      });
      continue;
    }
    const key = m[1].trim();
    // Identifier check
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      issues.push({
        severity: 'error',
        line: lineNo,
        message: `键名 "${key}" 不是合法的标识符(应以字母或下划线开头)`
      });
    }
    // Spaces around =
    if (/^\s.*=|=\s*\S.*\s+\S/.test(m[0]) && /\s=\s|\s=/.test(m[0])) {
      // detect "KEY = VALUE" with spaces
      const raw2 = trimmed.replace(/^export\s+/, '');
      if (/^[A-Za-z_][A-Za-z0-9_]*\s+=\s+/.test(raw2) ||
          /\s=\s/.test(raw2) && /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(raw2)) {
        issues.push({
          severity: 'warning',
          line: lineNo,
          message: `"=" 两侧有空格,某些工具会拒绝`
        });
      }
    }
  }
  return issues;
}

function checkPropertiesRawIssues(text) {
  const issues = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const stripped = raw.split('#')[0];
    const trimmed = stripped.trim();
    if (!trimmed) continue;
    // Must have a separator (= or :)
    if (!/^[A-Za-z0-9_.\-]+\s*[=:]/.test(trimmed) && !/^\S+\s+\S/.test(trimmed)) {
      issues.push({
        severity: 'error',
        line: lineNo,
        message: `缺少 = 或 : 分隔符: "${trimmed.slice(0, 60)}"`
      });
    }
  }
  return issues;
}

// ---- duplicate-key detection ----

function checkDuplicates(entries) {
  const issues = [];
  const seen = new Map(); // path → first line
  for (const e of entries) {
    if (seen.has(e.path)) {
      issues.push({
        severity: 'error',
        line: e.line,
        message: `重复的键 "${e.path}"(第一次出现在第 ${seen.get(e.path)} 行)`
      });
    } else {
      seen.set(e.path, e.line);
    }
  }
  return issues;
}

// ---- typo suggestions (Levenshtein) ----

function levenshtein(a, b) {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const prev = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;
  for (let i = 1; i <= al; i++) {
    let curr = i;
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= bl; j++) {
      const tmp = prev[j];
      if (a[i - 1] === b[j - 1]) {
        curr = last;
      } else {
        curr = 1 + Math.min(last, prev[j], prev[j - 1]);
      }
      last = prev[j];
      prev[j] = curr;
    }
  }
  return prev[bl];
}

// ---- main ----

function validateConfig({ file, cwd, schema, _skipIo }) {
  const absFile = path.isAbsolute(file) ? file : path.join(cwd || process.cwd(), file);
  let text;
  if (_skipIo) {
    text = _skipIo;
  } else {
    try {
      text = fs.readFileSync(absFile, 'utf8');
    } catch (e) {
      return {
        ok: false,
        errors: [{ severity: 'error', line: 0, message: `无法读取文件: ${e.message}` }],
        warnings: [],
        info: { fileType: 'unknown', lineCount: 0, keyCount: 0, keys: [] }
      };
    }
  }

  const fileType = detectFileType(absFile);

  // Raw checks
  let rawIssues = [];
  if (fileType === 'yaml') rawIssues = checkYamlRawIssues(text);
  else if (fileType === 'env') rawIssues = checkEnvRawIssues(text);
  else if (fileType === 'properties') rawIssues = checkPropertiesRawIssues(text);

  // Parse
  const parsed = parseConfig(absFile, text);
  if (!parsed.ok) {
    return {
      ok: false,
      errors: [{ severity: 'error', line: 0, message: parsed.error }],
      warnings: rawIssues.filter(i => i.severity === 'warning'),
      info: { fileType, lineCount: text.split(/\r?\n/).length, keyCount: 0, keys: [] }
    };
  }

  // Duplicate keys
  const dupIssues = checkDuplicates(parsed.entries);

  // Schema / required keys
  const schemaIssues = checkSchema(parsed.entries, schema, fileType);

  // Typo suggestions (compare required keys against file keys)
  const typoWarnings = checkTypos(parsed.entries, schema, fileType);

  const all = [...rawIssues, ...dupIssues, ...schemaIssues, ...typoWarnings];
  const errors = all.filter(i => i.severity === 'error');
  const warnings = all.filter(i => i.severity === 'warning');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    info: {
      fileType,
      lineCount: text.split(/\r?\n/).length,
      keyCount: parsed.entries.length,
      keys: parsed.entries.map(e => e.path),
      file: absFile
    }
  };
}

function checkSchema(entries, schema, fileType) {
  if (!schema) return [];
  const issues = [];
  const fileKeys = new Set(entries.map(e => e.path));

  // Simple schema format:
  // { required: ["server.port", ...], expectedKeys: [...], deprecated: [...] }
  if (Array.isArray(schema.required)) {
    for (const req of schema.required) {
      if (!fileKeys.has(req)) {
        issues.push({
          severity: 'error',
          line: 0,
          message: `缺少必需键 "${req}"`
        });
      }
    }
  }
  if (Array.isArray(schema.deprecated)) {
    for (const dep of schema.deprecated) {
      if (fileKeys.has(dep)) {
        issues.push({
          severity: 'warning',
          line: 0,
          message: `键 "${dep}" 已废弃,建议移除`
        });
      }
    }
  }
  return issues;
}

function checkTypos(entries, schema, fileType) {
  if (!schema || !Array.isArray(schema.required)) return [];
  const fileKeys = entries.map(e => e.path);
  const fileKeySet = new Set(fileKeys);
  const issues = [];
  for (const req of schema.required) {
    if (fileKeySet.has(req)) continue;
    // Find closest file key by edit distance
    let best = null;
    let bestDist = Infinity;
    for (const k of fileKeys) {
      const d = levenshtein(req, k);
      if (d < bestDist) {
        bestDist = d;
        best = k;
      }
    }
    if (best && bestDist > 0 && bestDist <= Math.max(2, Math.floor(req.length / 4))) {
      issues.push({
        severity: 'warning',
        line: 0,
        message: `缺少 "${req}",是否想写 "${best}"?(编辑距离 ${bestDist})`
      });
    }
  }
  return issues;
}

export { validateConfig, levenshtein };
