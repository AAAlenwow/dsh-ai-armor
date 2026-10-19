// lib/findings.js
// Pattern detectors for MyBatis Plus SQL audit.
// Each detector scans files and returns findings: { severity, file, line, message, suggestion? }

import fs from 'node:fs';
import path from 'node:path';

// ---- helpers ----

function listFiles(root, extensions) {
  const out = [];
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (['node_modules', '.git', 'target', 'build', 'dist', '.idea', '.vscode'].includes(e.name)) continue;
        walk(full);
      } else if (extensions.some(ext => e.name.endsWith(ext))) {
        out.push(full);
      }
    }
  }
  walk(root);
  return out;
}

function readSafe(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return ''; }
}

function eachLineWithNumber(text) {
  return text.split(/\r?\n/).map((line, i) => ({ line, lineNo: i + 1 }));
}

// ---- detector: SELECT * in MyBatis XML ----

function detectSelectStar(xmlFiles) {
  const findings = [];
  for (const f of xmlFiles) {
    const text = readSafe(f);
    const matches = [...text.matchAll(/<select\b[^>]*>([\s\S]*?)<\/select>/gi)];
    for (const m of matches) {
      const body = m[1];
      const lineNo = text.slice(0, m.index).split(/\r?\n/).length;
      // Look for "select * from" or "SELECT  *  FROM" — case-insensitive, allow newlines
      if (/\bselect\s+\*\s+from\b/i.test(body)) {
        findings.push({
          severity: 'warning',
          file: f,
          line: lineNo,
          message: 'SELECT * 会拉取所有列,包括 TEXT/BLOB 等大字段,建议显式列名',
          suggestion: '改为 SELECT id, name, created_at ...'
        });
      }
    }
  }
  return findings;
}

// ---- detector: UPDATE/DELETE without WHERE in MyBatis XML ----

function detectMutateWithoutWhere(xmlFiles) {
  const findings = [];
  for (const f of xmlFiles) {
    const text = readSafe(f);
    for (const tag of ['update', 'delete']) {
      const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
      let m;
      while ((m = re.exec(text)) !== null) {
        const body = m[1];
        const lineNo = text.slice(0, m.index).split(/\r?\n/).length;
        if (!/\<where\>|\<where\s|\bwhere\b/i.test(body)) {
          findings.push({
            severity: 'error',
            file: f,
            line: lineNo,
            message: `<${tag.toUpperCase()}> 缺少 WHERE 子句,会全表更新/删除!`,
            suggestion: '加上 <where>...</where> 或显式 WHERE 条件'
          });
        }
      }
    }
  }
  return findings;
}

// ---- detector: LIKE leading wildcard (kills B-tree index) ----

function detectLikeLeadingWildcard(xmlFiles) {
  const findings = [];
  for (const f of xmlFiles) {
    let text = readSafe(f);
    // Strip XML comments so doc/example LIKE patterns don't trigger
    text = text.replace(/<!--[\s\S]*?-->/g, '');
    for (const m of text.matchAll(/\bLIKE\s+(['"])(%[^'"]*)\1/gi)) {
      const lineNo = text.slice(0, m.index).split(/\r?\n/).length;
      findings.push({
        severity: 'warning',
        file: f,
        line: lineNo,
        message: `LIKE '${m[2]}' 以 % 开头,B-tree 索引失效,会全表扫描`,
        suggestion: '考虑全文索引(FULLTEXT),或改用 ES /前缀匹配 LIKE \'xxx%\''
      });
    }
  }
  return findings;
}

// ---- detector: missing @Transactional on multi-write service method ----

function detectMissingTransactional(javaFiles) {
  const findings = [];
  for (const f of javaFiles) {
    if (!/Service|Manager/.test(path.basename(f))) continue;
    const text = readSafe(f);
    // Strip line and block comments first so `// see @Transactional` etc. don't count
    const codeOnly = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    // Find methods that contain multiple mapper write calls
    const methodRe = /(?:public|private|protected)\s+[\w<>,\s]+\s+(\w+)\s*\([^)]*\)\s*\{([^}]*(?:\{[^}]*\}[^}]*)*)\}/g;
    let m;
    while ((m = methodRe.exec(text)) !== null) {
      const methodName = m[1];
      const body = m[2];
      // Count write mapper calls
      const writeCalls = (body.match(/\.\s*(insert|update|delete|save|remove)\s*\(/gi) || []).length;
      if (writeCalls < 2) continue;
      const methodStart = text.slice(0, m.index).split(/\r?\n/).length;
      // Check preceding 500 chars of code (not comments) for an actual @Transactional annotation
      // (line that starts with optional whitespace + @)
      const beforeCode = codeOnly.slice(Math.max(0, m.index - 500), m.index);
      const hasTransactional = /^\s*@Transactional\b/m.test(beforeCode);
      if (!hasTransactional) {
        findings.push({
          severity: 'error',
          file: f,
          line: methodStart,
          message: `方法 ${methodName}() 有 ${writeCalls} 处写操作但缺少 @Transactional,部分失败会导致数据不一致`,
          suggestion: '在方法上添加 @Transactional(rollbackFor = Exception.class)'
        });
      }
    }
  }
  return findings;
}

// ---- detector: N+1 (loop calling mapper.find*) ----

function detectNPlusOne(javaFiles) {
  const findings = [];
  for (const f of javaFiles) {
    if (!/Service|Manager|Controller/.test(path.basename(f))) continue;
    const text = readSafe(f);
    // Find for/while loops
    const loopRe = /\b(for|while)\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/g;
    let m;
    while ((m = loopRe.exec(text)) !== null) {
      const body = m[2];
      // Count mapper find/list/get calls inside
      const mapperCalls = (body.match(/\.\s*(find|list|get|select|query|page)\w*\s*\(/gi) || []).length;
      if (mapperCalls >= 1) {
        const lineNo = text.slice(0, m.index).split(/\r?\n/).length;
        // Look for a comment marker that this was intentional
        const isMarked = /N\+1.*ok|N\+1.*intentional|@SuppressWarnings.*n\+1/i.test(body);
        if (!isMarked) {
          findings.push({
            severity: 'warning',
            file: f,
            line: lineNo,
            message: `疑似 N+1 查询:循环内调用 mapper 方法 ${mapperCalls} 次`,
            suggestion: '用 JOIN 一次查出,或用 in (?, ?, …) 批量查询,或在循环外预取 Map'
          });
        }
      }
    }
  }
  return findings;
}

// ---- main entry ----

function auditMpCode({ src }) {
  const root = src || process.cwd();
  const javaFiles = listFiles(root, ['.java']);
  const xmlFiles = listFiles(root, ['.xml']);

  const findings = [
    ...detectSelectStar(xmlFiles),
    ...detectMutateWithoutWhere(xmlFiles),
    ...detectLikeLeadingWildcard(xmlFiles),
    ...detectMissingTransactional(javaFiles),
    ...detectNPlusOne(javaFiles)
  ].sort((a, b) => {
    const sa = a.severity === 'error' ? 0 : 1;
    const sb = b.severity === 'error' ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.file.localeCompare(b.file) || a.line - b.line;
  });

  const errors = findings.filter(f => f.severity === 'error').length;
  const warnings = findings.filter(f => f.severity === 'warning').length;

  return {
    ok: errors === 0,
    summary: {
      filesScanned: javaFiles.length + xmlFiles.length,
      javaFiles: javaFiles.length,
      xmlFiles: xmlFiles.length,
      totalFindings: findings.length,
      errors,
      warnings
    },
    findings
  };
}

export { auditMpCode, listFiles, readSafe };
