# dsh-mp-auditor 性能测试

| Case | Latency | Output | Tokens (est) | Assertions |
|------|---------|--------|--------------|------------|
| 01-all-bad | 6.12 ms | 2110 chars | ~469 | 5 |
| 02-clean | 0.85 ms | 175 chars | ~39 | 5 |
| 03-empty-project | 0.1 ms | 175 chars | ~39 | 4 |

跑法:`cd tests && node run.mjs`。REPORT.md 自动写入。
