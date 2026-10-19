# dsh-config-guard

> Validate a config file (YAML / .env / .properties) and surface
> problems *before* the AI agent writes the file back — duplicates,
> bad indent, malformed KEY=VALUE, missing required keys, and
> "did you mean …?" typo hints.

A DSH plugin in the `dsh-ai-armor` bundle.

## The tool

`validate_config({ file, cwd, schema? })`

- **file**: relative-to-cwd or absolute path
- **cwd**: project root (defaults to `process.cwd()`)
- **schema** (optional): `{ required: ["server.port", …], deprecated: ["old.key", …] }`
  Simple flat list — no full JSON-Schema. Just "must exist" / "should not exist".

Returns:
```json
{
  "ok": true,
  "errors": [
    { "severity": "error", "line": 7, "message": "重复的键 \"app.name\"(第一次出现在第 4 行)" }
  ],
  "warnings": [
    { "severity": "warning", "line": 0, "message": "缺少 \"dataSource.url\",是否想写 \"datasource.url\"?(编辑距离 1)" }
  ],
  "info": {
    "fileType": "yaml",
    "lineCount": 24,
    "keyCount": 8,
    "keys": ["server.port", "server.host", "dataSource.url", "logging.level", "logging.appenders[0]", "logging.appenders[1]"],
    "file": "/abs/path/to/application.yml"
  }
}
```

## Checks (when no schema)

| Severity | Check | Applies to |
|----------|-------|------------|
| error | duplicate keys at the same path | YAML, ENV, properties |
| error | tab in YAML indentation | YAML |
| error | bad KEY=VALUE shape (missing `=`) | ENV |
| error | illegal identifier (must match `[A-Za-z_][A-Za-z0-9_]*`) | ENV |
| error | missing required key | YAML, ENV, properties (when `schema.required` given) |
| warning | trailing whitespace | YAML |
| warning | `KEY = VALUE` with spaces around `=` | ENV |
| warning | `did you mean "<closest-key>"?` (Levenshtein ≤ ⌊len/4⌋) | YAML, ENV, properties (when `schema.required` given) |
| warning | `deprecated: ["x"]` keys present | YAML, ENV, properties (when `schema.deprecated` given) |

## Why this is useful for an AI agent

Most agents edit config files blindly:
- add a key
- overwrite an existing key (silently — the user notices a week later)
- add a typo (`datasource.url` vs `dataSource.url`) and only find out at app boot
- hand-craft YAML with a tab indent and the parser blows up at runtime

`validate_config` runs **before the agent's edit is committed**:
1. Agent reads the file
2. Agent mutates in memory
3. `validate_config` against the new content
4. If `ok: false`, agent fixes the errors and re-validates
5. Only then does the agent write the file back

## Measured performance (test fixtures, see REPORT.md)

- Latency: **<1ms per call** (pure local, in-memory parser)
- Output: ~550 chars / ~125 tokens for a 24-line YAML
- Zero dependencies — runs anywhere Node runs

## What's NOT in scope

- No full JSON-Schema. `schema.required` is a flat string list. If you
  need real type validation (int, regex, enum), layer a real schema
  library on top.
- No cross-file references (`${other-file.key}`). The plugin only
  validates one file at a time.
- No auto-fix. We tell you the line and the problem; the agent decides
  how to fix.
- No JSON config support (yet) — only YAML, ENV, properties. JSON is
  strict enough that "validation" usually means "schema," which is
  out of scope.

## Install

This plugin is part of the `dsh-ai-armor` bundle — see the bundle
README for the one-line install.
