# dsh-cmd-shield

> Stop the AI from writing a shell command that the shell then mangles
> — quotes, `$vars`, paths with spaces, CJK characters. Generate the
> correct, safe invocation for the target shell and let the agent run
> that.

A DSH plugin in the `dsh-ai-armor` bundle.

## The tool

`build_shell_invocation({ shell, command, cwd? })`

- **shell**: `bash` | `zsh` | `sh` | `dash` | `pwsh` | `powershell` | `cmd` | `cmd.exe`
- **command**: the command line you want to run (can contain anything)
- **cwd**: optional working directory (will be `cd`'d into first)

Returns:
```json
{
  "ok": true,
  "shell": "pwsh",
  "family": "powershell",
  "method": "encodedcommand-utf16le",
  "script": "Set-Location -LiteralPath \"C:\\Work\"; Get-ChildItem",
  "invocation": "pwsh -NoProfile -NonInteractive -EncodedCommand <BASE64>",
  "note": "使用 -EncodedCommand(UTF-16LE base64)彻底避开引号/$/CJK 解析,适合跨平台投递"
}
```

The `invocation` field is what the agent should actually execute. The
`script` field is the human-readable form for logging.

## Why this is useful for an AI agent

The failure mode this prevents:

```sh
# AI writes this on Windows:
$ pwd && ls "/Users/My Name/笔记.md"
'pwd' 不是内部或外部命令,也不是可运行的程序
```

What's happening: the AI wrote bash syntax, the shell is PowerShell,
quotes got broken, `pwd` was interpreted as a cmdlet instead of a
command. The same kind of breakage happens in reverse on Linux.

`build_shell_invocation` enforces one thing: the command you wrote is
what the shell receives, byte-for-byte. No reinterpretation, no
expansion, no surprise.

## The encoding per shell family

| Family | Method | Why it works |
|--------|--------|--------------|
| POSIX (bash/zsh/sh/dash) | Wrap in single quotes; escape `'` as `'\''` | POSIX single-quoted strings are literal — no `$var`, no `\` escape, no CJK mangling |
| PowerShell (pwsh/powershell) | UTF-16LE base64 + `-EncodedCommand` | Same trick dsh-tool-pwsh-safe uses; bypasses all parsing |
| cmd (cmd.exe) | Wrap in double quotes; caret-escape `& \| < > ^`; double `%` | cmd's quoting is the worst; this is "good enough" for most cases but for complex commands, prefer PowerShell |

## Measured performance (test fixtures, see REPORT.md)

- Latency: **<1ms per call** (pure string manipulation)
- Output: ~250 chars / ~55 tokens for a typical invocation
- Zero dependencies — runs anywhere Node runs

## What's NOT in scope

- **Doesn't actually run the command.** The agent still has to call
  DSH's `run_command` or similar. We just hand back the safe string
  to run.
- **No shell-syntax translation.** `build_shell_invocation` does NOT
  translate `ls` to `Get-ChildItem`. It preserves the command as-is
  in the target shell's expected syntax. For a true "write once, run
  anywhere" cross-shell tool, you'd need a shell-translator on top.
- **No interactive shells.** Designed for single-shot commands.

## Install

This plugin is part of the `dsh-ai-armor` bundle — see the bundle
README for the one-line install.
