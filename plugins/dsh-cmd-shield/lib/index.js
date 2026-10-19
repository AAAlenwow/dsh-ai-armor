// lib/index.js
// dsh-cmd-shield: register the build_shell_invocation tool.

import { buildShellInvocation } from './shell-escape.js';

const TOOL_NAME = 'build_shell_invocation';
const TOOL_DESCRIPTION = [
  '把一段 shell 命令编码成"在该 shell 里能安全执行"的调用串。',
  'AI agent 直接拼字符串经常被引号/$/CJK/路径空格搞坏(尤其 Windows),这个工具替 agent 做转义。',
  '支持 shell:bash / zsh / sh / dash / pwsh / powershell / cmd。',
  'POSIX 用单引号包裹,PowerShell 用 -EncodedCommand(UTF-16LE base64)投递,cmd 用 ^ 转义。',
  '返回:ok, shell, family, invocation(可直接执行), script(原文), method(转义方式), note。',
  '⚠️ 只生成调用串,不会真的执行命令。'
].join(' ');

const TOOL_PARAMETERS = {
  type: 'object',
  properties: {
    shell: {
      type: 'string',
      enum: ['bash', 'zsh', 'sh', 'dash', 'pwsh', 'powershell', 'cmd', 'cmd.exe'],
      description: '目标 shell,默认 posix 类'
    },
    command: {
      type: 'string',
      description: '要执行的命令'
    },
    cwd: {
      type: 'string',
      description: '可选:执行前切换到的目录'
    }
  },
  required: ['shell', 'command']
};

function render(result) {
  if (!result.ok) {
    return `❌ 编码失败\n   ${result.errors.join('\n   ')}`;
  }
  return [
    `✅ ${result.shell} (${result.family}) 编码完成`,
    `   方法: ${result.method}`,
    `   调用: ${result.invocation}`,
    result.cwd ? `   cwd:  ${result.cwd}` : null,
    `   说明: ${result.note}`,
    '',
    `   原文:`,
    result.script.split('\n').map(l => `     ${l}`).join('\n')
  ].filter(Boolean).join('\n');
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
        shell: { type: 'string' },
        family: { type: 'string' },
        method: { type: 'string' },
        script: { type: 'string' },
        invocation: { type: 'string' },
        note: { type: 'string' }
      }
    },
    render
  },
  async execute({ shell, command, cwd }) {
    return buildShellInvocation({ shell, command, cwd });
  }
}];
