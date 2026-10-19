// lib/index.js — dsh-mp-auditor

import path from 'node:path';
import { auditMpCode } from './findings.js';

const TOOL_NAME = 'audit_mp_code';

const TOOL_DESCRIPTION = [
  '静态扫描 MyBatis Plus 项目源码,挑出常见的 SQL/事务性能与安全问题。',
  '检查项:',
  '- SELECT * (应改用显式列名)',
  '- UPDATE/DELETE 缺 WHERE (会全表更新/删除!)',
  '- LIKE \'%xxx\' (前导 %,B-tree 索引失效)',
  '- Service 方法 ≥2 处写操作但缺 @Transactional (部分失败数据不一致)',
  '- 循环里调 mapper.find*/list* (疑似 N+1)',
  '返回 ok / summary / findings[]。'
].join(' ');

const TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    src: {
      type: 'string',
      description: '项目根目录,默认 process.cwd()'
    }
  },
  required: [],
  additionalProperties: false
};

function render(result) {
  if (!result.ok) {
    return [
      `❌ MyBatis Plus 静态审计 — ${result.summary.errors} 个错误`,
      `   扫描文件: ${result.summary.filesScanned} (Java ${result.summary.javaFiles} / XML ${result.summary.xmlFiles})`,
      '',
      ...result.findings.slice(0, 20).map(f =>
        `  [${f.severity.toUpperCase()}] ${path.basename(f.file)}:${f.line}\n    ${f.message}\n    → ${f.suggestion || ''}`
      )
    ].join('\n');
  }
  return [
    `✅ MyBatis Plus 静态审计通过`,
    `   扫描文件: ${result.summary.filesScanned} (Java ${result.summary.javaFiles} / XML ${result.summary.xmlFiles})`,
    result.summary.warnings > 0
      ? `   ⚠️  ${result.summary.warnings} 个警告(可继续,见下)`
      : `   无警告`,
    '',
    ...result.findings.map(f =>
      `  [${f.severity.toUpperCase()}] ${path.basename(f.file)}:${f.line}\n    ${f.message}\n    → ${f.suggestion || ''}`
    )
  ].join('\n');
}

export const tools = [{
  name: TOOL_NAME,
  description: TOOL_DESCRIPTION,
  parameters: TOOL_PARAMETERS,
  isConcurrencySafe: () => true,
  output: {
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean' },
        summary: { type: 'object' },
        findings: { type: 'array' }
      }
    },
    render
  },
  async execute({ src }) {
    return auditMpCode({ src });
  }
}];
