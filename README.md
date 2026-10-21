# dsh-ai-armor

> **AI 写代码后,一次性定位 5 类常见生产事故的"护甲"。** 一次安装,5 个工具,8 个 tool slot,都是给"AI 写完代码"那一刻准备的——stack trace 来了、解码;git 出 bug 了、二分定位;config 改坏了、校验;shell 命令拼错了、跨平台转义;MyBatis Plus SQL 写糙了、静态审计。

## 这个 bundle 里有什么

| 子插件 | 工具 | 解决的生产问题 |
|--------|------|----------------|
| **[dsh-when-broke](./plugins/dsh-when-broke/README.md)** | `when_broke_find_introducer`<br>`when_broke_recent_changes`<br>`when_broke_bisect_with_repro`<br>`when_broke_blame_age` | 这段代码从哪个 commit 来的?最近谁动过这个文件?线上 bug 是哪个 commit 引入的?这行代码新写的还是老的? |
| **[dsh-stackdecoder](./plugins/dsh-stackdecoder/README.md)** | `decode_stack` | AI 拿到一段堆栈文本,1 次调用解析出每帧 file:line + 上下文代码片段,不用逐帧 read_file 来回问 |
| **[dsh-config-guard](./plugins/dsh-config-guard/README.md)** | `validate_config` | AI 改完 application.yml / .env / .properties 后,验证有没有重复键、tab 缩进、键名打错、缺必需字段 |
| **[dsh-cmd-shield](./plugins/dsh-cmd-shield/README.md)** | `build_shell_invocation` | AI 拼 shell 命令经常被引号/`$`/CJK/路径空格搞坏(尤其 Windows),这个工具替 agent 做转义,POSIX/PowerShell/cmd 各家规则都对齐 |
| **[dsh-mp-auditor](./plugins/dsh-mp-auditor/README.md)** | `audit_mp_code` | 扫 MyBatis Plus 项目,挑出 N+1 / 漏 `@Transactional` / `LIKE '%xxx%'` / `SELECT *` / 缺 WHERE 的 UPDATE/DELETE |

## 安装

```bash
dsh plugin add AAAlenwow/dsh-ai-armor
```

或者先克隆再 link:

```bash
git clone https://github.com/AAAlenwow/dsh-ai-armor.git
cd dsh-ai-armor
pnpm link --global  # 或 npm link
```

每个子插件都可以**单独安装**(如果你只需要其中一个):

```bash
dsh plugin add AAAlenwow/dsh-when-broke    # 4 个工具
dsh plugin add AAAlenwow/dsh-stackdecoder  # 1 个工具
dsh plugin add AAAlenwow/dsh-config-guard  # 1 个工具
dsh plugin add AAAlenwow/dsh-cmd-shield    # 1 个工具
dsh plugin add AAAlenwow/dsh-mp-auditor    # 1 个工具
```

## 为什么打包

这 5 个工具解决的问题有一个共同特征:**都是 AI 写完代码后那一刻最容易爆雷的地方**。

- 堆栈一贴,AI 不会自动定位本地代码 → `decode_stack`
- `git blame` / `git bisect` 在 shell 里跑可以但需要 AI 拼命令和解析输出 → `when_broke_*`
- YAML/ENV 写错一个 tab 或一个重复键,服务启动失败 → `validate_config`
- Windows PowerShell 跟 bash 转义规则不一样,AI 经常写错 → `build_shell_invocation`
- MyBatis Plus N+1 不会报错但会拖慢数据库,AI 自己看不到 → `audit_mp_code`

**一个 bundle,一个 PR,一个 review,搞定 8 个 tool slot。**比 5 次单独发布少 4 轮审核往返,普通用户一次安装全有。

## 性能(全本地,无外部依赖)

每个工具都是**纯本地、无网络调用、无第三方依赖**(只用 Node.js 内置 `fs`/`path`/`child_process`/`crypto`)。所有测试跑在普通 MacBook M1 上:

| 工具 | 典型 latency | 输出大小 | 适用场景 |
|------|-------------|---------|---------|
| `when_broke_find_introducer` | 15-300ms | ~1-2KB | 出 bug 后,反查可疑代码的来源 |
| `when_broke_recent_changes` | 5-30ms | ~1-2KB | 出 bug 后,看最近谁改过这个文件 |
| `when_broke_bisect_with_repro` | 1-60s(取决于 repro) | ~2-3KB | 出 bug 后,二分定位第一个坏 commit |
| `when_broke_blame_age` | <10ms | ~150 字节 | 一行代码是不是新写的 |
| `decode_stack` | <1ms/帧 | ~2-5KB(10 帧) | 拿到堆栈,定位到本地代码 |
| `validate_config` | <1ms | ~500-700 字节 | CI 前置检查、agent 自检 |
| `build_shell_invocation` | <2ms | ~120-380 字节 | AI 拼 shell 命令前先转义 |
| `audit_mp_code` | <10ms/1000 文件 | ~1-2KB | 写完 MyBatis Plus 代码后扫描 |

## 不在范围内

- **不执行任何代码 / 不发起网络请求** — 全部离线运行,适合企业内网
- **不依赖任何 npm 包** — 装上就能用,版本兼容问题为零
- **不替你"自动 fix"** — 给出 finding + suggestion,具体修改由人或 AI agent 自己来
- **不替代 IDE 静态分析** — IDE 看的是开发时实时反馈,这些工具是"AI 写完那一刻的最后一公里"

## 测试

每个子插件有自己的测试 harness,`cd plugins/<name>/tests && node run.mjs` 跑一遍。

bundle 自身的 smoke test:

```bash
cd tests && node run.mjs
```

应输出 `✅ All 8 expected tools registered. Bundle is loadable.`

## 致谢

- 设计参考了 `dsh-tool-pwsh-safe`(PowerShell 单工具)的思路
- ORCHESTRA 验证流程复用了本仓库的 `ORCHESTRA-PROGRESS.md` 7 步法

## License

MIT

## Standalone sub-plugins

Every tool in this bundle is also published as a standalone installable plugin:

| Repo | Tools |
|---|---|
| [dsh-when-broke](https://github.com/AAAlenwow/dsh-when-broke) | 4 — when_broke_find_introducer / when_broke_recent_changes / when_broke_bisect_with_repro / when_broke_blame_age |
| [dsh-stackdecoder](https://github.com/AAAlenwow/dsh-stackdecoder) | 1 — decode_stack |
| [dsh-config-guard](https://github.com/AAAlenwow/dsh-config-guard) | 1 — validate_config |
| [dsh-cmd-shield](https://github.com/AAAlenwow/dsh-cmd-shield) | 1 — build_shell_invocation |
| [dsh-mp-auditor](https://github.com/AAAlenwow/dsh-mp-auditor) | 1 — audit_mp_code |

Install either the bundle or the standalone packages, not both (tool ids would collide).
