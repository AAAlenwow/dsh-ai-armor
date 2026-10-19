# dsh-config-guard — Perf Notes

The test harness writes REPORT.md with a per-case table. Run:

```sh
cd plugins/dsh-config-guard/tests
node run.mjs
```

## Results from local run (Apple Silicon, Node 22)

| Case | Latency | Output | Tokens (est) | Assertions |
|------|---------|--------|--------------|------------|
| 01-valid-yaml | 2.76 ms | 504 chars | ~112 | 5 |
| 02-duplicate-keys | 0.35 ms | 512 chars | ~114 | 6 |
| 03-tab-yaml | 0.33 ms | 485 chars | ~108 | 6 |
| 04-bad-env | 0.40 ms | 569 chars | ~126 | 5 |
| 05-missing-required | 0.30 ms | 706 chars | ~157 | 7 |
| 06-typo-suggestion | 0.21 ms | 637 chars | ~142 | 5 |

All 6 cases pass. First case is a one-off Node module-load cost.
The remaining calls are sub-millisecond.
