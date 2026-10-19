// lib/shell-escape.js
// Encode a command for safe invocation across shells.
// The whole point: when an AI agent runs shell commands, the
// command must not be mangled by quote/var/CJK interpretation by
// the receiving shell. Each shell has its own escape rules.
// We pick the safest per shell:
//   - POSIX (bash/zsh/sh)  : single-quote + escape internal '
//   - PowerShell           : UTF-16LE base64 (like dsh-tool-pwsh-safe)
//   - cmd                  : double-quote + escape ^ & | < > ( )

const SHELL_ALIASES = {
  'sh': 'posix',
  'bash': 'posix',
  'zsh': 'posix',
  'dash': 'posix',
  'ash': 'posix',
  'pwsh': 'powershell',
  'powershell': 'powershell',
  'cmd': 'cmd',
  'cmd.exe': 'cmd'
};

function normalizeShell(shell) {
  if (!shell) return 'posix';
  const key = String(shell).toLowerCase().trim();
  return SHELL_ALIASES[key] || null;
}

// ---- POSIX escape (bash/zsh/sh) ----
//
// Wrap in single quotes. The only character that breaks single-quote
// strings is ' itself. The standard trick: close-quote, escape ', open-quote.
function escapePosix(command) {
  if (command == null) return "''";
  const escaped = String(command).replace(/'/g, `'\\''`);
  return `'${escaped}'`;
}

function buildPosixInvocation({ command, cwd }) {
  const quoted = escapePosix(command);
  const cdPart = cwd ? `cd ${escapePosix(cwd)} && ` : '';
  // For interactive shells you'd use `bash -c`, but for a single
  // command we can just pass it directly to the shell.
  return {
    method: 'single-quote',
    script: command,
    invocation: `bash -c ${quoted}`,
    note: cwd ? `运行前先 cd 到 ${cwd}` : '无 cwd 切换,使用当前目录'
  };
}

// ---- PowerShell escape (base64 UTF-16LE) ----
//
// PowerShell has a -EncodedCommand flag that takes a base64-encoded
// UTF-16LE string. This bypasses ALL quote/var/$ interpretation.
// It's the most reliable way to ship a script from one machine to
// another.
function escapePowershell(command) {
  // UTF-16LE base64
  const buf = Buffer.from(String(command), 'utf16le');
  return buf.toString('base64');
}

function buildPowershellInvocation({ command, cwd }) {
  const encoded = escapePowershell(command);
  const cdBlock = cwd
    ? `Set-Location -LiteralPath ${JSON.stringify(cwd)}; `
    : '';
  const script = cdBlock + String(command);
  const encodedScript = escapePowershell(script);
  return {
    method: 'encodedcommand-utf16le',
    script: script,
    invocation: `pwsh -NoProfile -NonInteractive -EncodedCommand ${encodedScript}`,
    note: '使用 -EncodedCommand(UTF-16LE base64)彻底避开引号/$/CJK 解析,适合跨平台投递'
  };
}

// ---- cmd escape (Windows cmd.exe) ----
//
// cmd's quoting rules are the worst. We use double-quotes and escape:
//   ^ & | < > ( ) " % !
// For paths with %, we double them (%%) to escape variable expansion.
function escapeCmd(command) {
  // First: escape carets that precede special chars
  // Order matters: % first (otherwise we'd double-escape)
  let s = String(command);
  // Double % to escape variable expansion
  s = s.replace(/%/g, '%%');
  // Escape these special chars by prepending ^
  // In cmd, these are: & | < > ^ (in some contexts)
  s = s.replace(/([&|<>^])/g, '^$1');
  return s;
}

function buildCmdInvocation({ command, cwd }) {
  const cdPart = cwd ? `cd /d "${String(cwd).replace(/"/g, '\\"')}" && ` : '';
  const escaped = escapeCmd(command);
  return {
    method: 'caret-escape + double-quote',
    script: command,
    invocation: `cmd /c ${cdPart}${escaped}`,
    note: 'cmd 引号规则最严,如果命令里含 !/% 仍可能出问题,建议优先用 PowerShell'
  };
}

// ---- dispatcher ----

function buildShellInvocation({ shell, command, cwd }) {
  const family = normalizeShell(shell);
  if (!family) {
    return {
      ok: false,
      errors: [`不支持的 shell: ${shell}(支持的: ${Object.keys(SHELL_ALIASES).join(', ')})`]
    };
  }
  if (typeof command !== 'string' || !command.length) {
    return {
      ok: false,
      errors: ['command 不能为空']
    };
  }
  let result;
  if (family === 'posix') result = buildPosixInvocation({ command, cwd });
  else if (family === 'powershell') result = buildPowershellInvocation({ command, cwd });
  else if (family === 'cmd') result = buildCmdInvocation({ command, cwd });
  return {
    ok: true,
    shell,
    family,
    ...result
  };
}

export {
  buildShellInvocation,
  normalizeShell,
  escapePosix,
  escapePowershell,
  escapeCmd,
  SHELL_ALIASES
};
