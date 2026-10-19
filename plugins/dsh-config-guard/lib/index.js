// lib/index.js
// dsh-config-guard: register the validate_config tool.

import { validateConfig } from './validate-config.js';

const TOOL_NAME = 'validate_config';

const TOOL_DESCRIPTION = [
  '校验配置文件(YAML / .env / .properties),返回错误和警告。',
  '检查项:重复键、tab 缩进、KEY=VALUE 格式、必需键缺失、近似键名提示(typo)。',
  '可选 schema 参数:{ required: ["server.port", ...], deprecated: ["old.key", ...] }。',
  '返回:ok, errors[], warnings[], info{fileType, lineCount, keyCount, keys[]}。',
  '适合:CI 前置检查、agent 修改配置后回写前自检。'
].join(' ');

const TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    file: { type: 'string', description: '相对 cwd 的配置文件路径,或绝对路径' },
    cwd: { type: 'string', description: '项目根目录,默认 process.cwd()' },
    schema: {
      type: 'object',
      description: '可选: { required: [...], deprecated: [...] }'
    }
  },
  required: ['file']
};

function render(result) {
  if (result.ok) {
    return [
      `✅ ${result.info.fileType} 配置 ${result.info.file} 校验通过`,
      `   ${result.info.keyCount} 个键,${result.info.lineCount} 行`,
      result.warnings.length
        ? `   ⚠️  ${result.warnings.length} 个警告(可继续,见下)`
        : `   无警告`,
      '',
      ...result.warnings.map(w => `  [WARN] L${w.line}: ${w.message}`),
      result.warnings.length ? '' : null,
      result.info.keys.length
        ? `   keys: ${result.info.keys.slice(0, 20).join(', ')}${result.info.keys.length > 20 ? '…' : ''}`
        : null
    ].filter(Boolean).join('\n');
  }
  return [
    `❌ ${result.info.fileType} 配置 ${result.info.file} 校验失败`,
    `   ${result.errors.length} 个错误,${result.warnings.length} 个警告`,
    '',
    ...result.errors.map(e => `  [ERROR] L${e.line}: ${e.message}`),
    ...(result.warnings.length ? [''] : []),
    ...result.warnings.map(w => `  [WARN] L${w.line}: ${w.message}`)
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
        errors: { type: 'array' },
        warnings: { type: 'array' },
        info: { type: 'object' }
      }
    },
    render
  },
  async execute({ file, cwd, schema }) {
    return validateConfig({ file, cwd, schema });
  }
}];
