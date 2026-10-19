# dsh-stackdecoder

> Paste a stack trace, get the bug site with code context — no more
> 20-tool-calls to "find the right file:line then read the right region".

A DSH plugin that turns raw stack traces (Node.js, Python, Java, Go)
into a structured walk-through: parsed frames + actual source code at
the bug site. Lives in the dsh-ai-armor bundle (production-problem
plugins for everyday dev pain).

## The tool

`decode_stack({ trace, cwd, maxFrames?, contextBefore?, contextAfter? })`

- **trace**: the raw stack-trace text (paste from a log, terminal, error report)
- **cwd**: project root to resolve relative file paths against
- **maxFrames**: cap how many frames to resolve (default 10). Top frame is always included.
- **contextBefore / contextAfter**: lines of code around each frame (default 5 each)

Returns:
```json
{
  "ok": true,
  "language": "javascript" | "python" | "java" | "go" | "unknown",
  "frameCount": 7,
  "resolvedCount": 4,        // how many frames had readable source
  "missingCount": 3,         // typically: minified/lib code
  "truncated": true,         // true if frameCount > maxFrames
  "frames": [
    {
      "function": "getUserById",
      "file": "src/handler.js",
      "line": 4,
      "column": 11,
      "context": {
        "file": "/abs/path/to/src/handler.js",
        "line": 4,
        "found": true,
        "snippet": [
          { "line": 2, "code": "function getUserById(id) {", "highlight": false },
          { "line": 3, "code": "  if (id == null) {", "highlight": false },
          { "line": 4, "code": "    throw new TypeError(...);", "highlight": true },
          ...
        ]
      }
    },
    ...
  ],
  "summary": "最可能的事故现场: src/handler.js:4 (getUserById)。共 7 帧...",
  "note": "3 帧的文件无法读取(可能是打包/混淆代码)..."
}
```

## Why this is useful for an AI agent

Without this plugin, the typical agent flow is:
1. See stack trace in user message
2. Call `file_read` on the top frame's file (round-trip 1)
3. Re-read with offset to get the right line range (round-trip 2)
4. Call `file_read` on the next frame (round-trip 3)
5. ... × 5 frames = 10 round-trips before the agent even knows where to look

With `decode_stack`: **1 tool call, all the code context for the bug
investigation already in hand**. The agent can immediately write a
diagnosis and fix.

## Measured performance (test fixtures, see REPORT.md)

- Latency: **<1ms per call** (pure local, no subprocess)
- Output: ~3200 chars / ~700 tokens for a 5-frame trace
- Truncation: `maxFrames` caps work; deeper frames are usually framework
  code with no actionable context anyway

## What's NOT in scope

- No remote source maps. For minified JS / WASM you'd need to plug in
  a source-map resolver. This plugin trusts the trace as-is.
- No language-aware error-type hints. We surface the code; the agent
  reasons about the type.
- No crash-dump parsing (e.g. `.dmp`, `core` files). Only text stack
  traces.

## Install

This plugin is part of the `dsh-ai-armor` bundle — see the bundle
README for the one-line install.
