# dsh-mp-auditor

> 静态扫描 MyBatis Plus 项目源码,在 AI 写完 mapper/service 之后**一次性**挑出 SQL/事务性能与安全问题。

## 工具

| 名称 | 用途 |
|------|------|
| `audit_mp_code` | 扫 `{src}` 目录,返回 5 类问题的 findings 列表(severity + file + line + message + suggestion) |

## 检测项

| # | 严重度 | 检测内容 | 修复建议 |
|---|--------|----------|----------|
| 1 | ⚠️ warning | `SELECT *` (会拉取 TEXT/BLOB) | 改为显式列名 |
| 2 | ❌ error | `<update>` / `<delete>` 缺 `<where>` (全表更新/删除) | 加 `<where>...</where>` |
| 3 | ⚠️ warning | `LIKE '%xxx%'` (前导 % 致 B-tree 索引失效) | 用 FULLTEXT 或前缀匹配 |
| 4 | ❌ error | Service 方法 ≥2 处写操作但缺 `@Transactional` | 加 `@Transactional(rollbackFor = ...)` |
| 5 | ⚠️ warning | 循环里调 mapper.find/list/get/select/page (疑似 N+1) | 用 JOIN / IN (...) 批量,或预取 Map |

## 用法

工具注册名 `audit_mp_code`,参数:

```json
{ "src": "/path/to/your/project" }
```

`src` 不传则默认 `process.cwd()`。

返回结构:

```json
{
  "ok": false,
  "summary": {
    "filesScanned": 12,
    "javaFiles": 8,
    "xmlFiles": 4,
    "totalFindings": 5,
    "errors": 2,
    "warnings": 3
  },
  "findings": [
    {
      "severity": "error",
      "file": ".../UserService.java",
      "line": 15,
      "message": "方法 transferAndLog() 有 2 处写操作但缺少 @Transactional,部分失败会导致数据不一致",
      "suggestion": "在方法上添加 @Transactional(rollbackFor = Exception.class)"
    }
  ]
}
```

## 为什么对 AI 有用

AI 写 MyBatis Plus 代码时,最容易犯的错不是 SQL 语法错,而是 **N+1 / 漏 @Transactional / `LIKE '%xxx%'`** 这些"能跑但慢、崩了对账"的问题。让 AI 在写完代码后跑一次这个工具,5 类问题一次性摆出来,然后照着 `suggestion` 改——比让 AI 自己 review 可靠多了(它看自己的代码会有确认偏误)。

## 性能

| Case | Latency | Output | Tokens (est) |
|------|---------|--------|--------------|
| 01-all-bad | ~6 ms | ~2110 chars | ~469 |
| 02-clean | <1 ms | ~175 chars | ~39 |
| 03-empty-project | <1 ms | ~175 chars | ~39 |

## 不在范围内

- **不执行 SQL,不做 EXPLAIN** — 纯静态正则 + 文本扫描
- **不解析 MyBatis 注解里的 `${}` 拼接** — 只看 XML 和写方法签名
- **不识别自定义注解中的事务边界**(如 `@Transactional` 的 meta-annotation)
- **不替代 PMD / MyBatis 官方 inspector** — 那些是重量级工具,本工具追求"装上就能用、5 秒出结果"

## 测试

```bash
cd tests
node run.mjs
```

3/3 cases pass。REPORT.md 自动生成。
