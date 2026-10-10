# Cab Lab Agent 接口 v1 — 已实现基线

> 状态：CURRENT / 只记录可在 `yzhan722/the-cab-lab@6725ae2f`（`devops`，2026-10-10）查证的能力。这里的“v1”是 Agent 接口文档版本，不是 `job.json` 或 `cnjob` 的 Schema 版本。
> v2 目标见 [INTERFACES-v2.md](INTERFACES-v2.md)；执行任务见 [PRD-2026-10.md](PRD-2026-10.md)。

## 1. 可调用入口与源文件

| 调用层 | 已有入口 | 范围 |
|---|---|---|
| Application API（无 DOM） | `renderer/appApi.js` → `createApp()` | Job 加载/修改/生成/校验/快照，使用共享 `job.js` 状态 |
| Command Registry | `renderer/commands.js` → `invoke(verb,args,opts)`、`listVerbs()`、`verbSpec(verb)` | 参数化业务动词；以实际 `listVerbs()` 为准 |
| CLI | `node cli.mjs <verb> ... --json`、`--repl`、`--batch` | JSON 回执；会话存于运行目录下 `.cablab-session.json` |
| MCP (stdio) | `node mcp.mjs` | 5 个工具：`cablab_verbs`、`cablab_schema`、`cablab_status`、`cablab_invoke`、`cablab_batch` |
| Agent Task Runner | `node scripts/agent-run.mjs start/exec/finish/status` | 任务级允许动词、`maxOps`、审计日志、验收报告 |
| Generator Bench CLI | `cli.mjs` 的 `bench.*` 宿主动词 | 读/改 rules/layout/presets、pins、baseline、diff、范围 repin、重建 |

**入口互不等同**：`createApp()`、`invoke()` 和 `cli.mjs` 的宿主动词不是同一张完全重合的接口表。运行中 Electron 的统一 `window.__app.invoke` 仍未正式接线；UI 仍有直接 `job.setParams/setPose` 路径。

## 2. V1 主要业务能力

| 域 | 现有命令/方法 | 作用 |
|---|---|---|
| 只读 | `describe`、`module.list/schema`、`space.get/kinds`、`cabinet.get/list`、`board.list`、`zone.list`、`wall.get/list` | 查询项目、空间、模块、板件与分区 |
| 设计 | `space.define`、`cabinet.add/move/remove/set-param/set-params/resize-face`、`wall.*`、`plane.*` | 通过业务命令修改 Job |
| 制造意图 | `board.set-grooves/nudge/hide/show`、`material.set` | 修改板件加工意图和材料 |
| 验证/撤销 | `validate`、`history.undo/redo/begin/end`、`invoke(...,{dryRun:true})` | 检查、预演、撤销；并非完整 ACID 事务 |
| 无头流程 | `createApp().loadJob/generate/validate/exportCnjob` | 生成 Snapshot 对象 |
| Generator | `bench.rules.read/set`、`bench.layout.read/write`、`bench.pins`、`bench.baseline`、`bench.diff`、`bench.presets.repin`、`bench.rebuild` | 结构化规则修改与变化检查 |
| 跨项目验证 | `node scripts/replay-omnicam.mjs`、`cli.mjs omnicam.run` | 驱动同级目录 OmniCam 的 `VerifyJob`；依赖本地 .NET 构建 |

具体动词与参数以 `renderer/commands.js` 的 `verbSpec` 和 `cli.mjs` 的 `HOST` 为准；旧 `docs/AGENT-COMMANDS.md` 包含设计性条目，不可作为“全部已实现”的清单。

## 3. 返回约定及已知边界

Command Registry 成功通常返回：

~~~json
{"ok":true,"verb":"cabinet.set-param","effect":{},"validate":{"ok":true,"fitIssues":[],"generatorErrors":[]},"diff":[],"undoGroup":null}
~~~

- **`ok` 与 `validate.ok` 是两回事**：v1 的 `invoke()` 可在业务验证不通过时返回 `ok:true`；调用者必须再检查 `validate.ok`。
- `dryRun` 对注册表的 `mutates` 动词保存/恢复 Job 快照；CLI 的部分宿主命令（例如 `bench.rules.set`、`bench.layout.write`）直接写文件，**不能假定都支持同等回滚**。
- `invoke()` 普通执行异常时未统一 `restoreAll`；`cablab_batch` 顺序调用且非原子批处理。
- `scripts/agent-run.mjs` 的 allow-list / 预算 / transcript 只约束**经该 Runner 执行的动词**，不是对拥有 Shell/仓库写权限的编程 Agent 的操作系统隔离。
- **导出文件陷阱**：`createApp().exportCnjob()` 返回 `snapshot` 对象；当前 `cli.mjs file.export-cnjob --path ...` 写入的是 Snapshot JSON，而不是含 `manifest.json`、`snapshot.json` 的 ZIP。不要把扩展名为 `.cnjob` 的该输出直接当成可导入 ZIP。真正 ZIP 的生成/重放入口参见 `scripts/emit-replay-cnjob.mjs`、`cnjobZip.js`（如位置调整，以仓库实码为准）。
- `bench.pins` / `bench.diff` 对部分 `centerline` 槽特征存在覆盖盲区；制造语义仍要由 Snapshot Golden / 跨仓回放兜底。
- Golden / CI 全绿只代表未出现未豁免回归；`generators/_lib/audit.known.json` 中已登记的几何问题仍需单独裁决。

## 4. 已有测试与约束

~~~bash
npm run verify:quick
npm run verify
npm run verify:ci
npm run verify:full            # 需要本机 OmniCam + Electron
npm run test:cases
npm run test:agent
node scripts/diff-snapshots.mjs --regen
~~~

- ``job.schema.json` 与 `renderer/jobContract.js` 约束 Job；`generators/_lib/boardContract.ts` 约束 Board；`snapshotContract.ts` 约束制造快照。
- **制造协议以 OmniCam `docs/manufacturing-snapshot-v1.schema.json` 为真源**，当前 Snapshot `schemaVersion=1.1.0`，单位 mm，单面加工；协议版本独立于这里的 Agent API v1。
- 固化数据：`fixtures/snapshot`、`fixtures/projects`、`fixtures/replay`。Golden 变化必须解释字段差异并经人审，不得为绿灯直接重钉。

## 5. 不属于 v1 的能力

统一 Electron 业务命令入口、跨工具原子事务、异常自动回滚、完全的命令级 JSON Schema 校验、NC 发布审批、完整 Generator 自主改码闭环及远程 Agent 执行，均属于 v2 计划，不应被当成 v1 可用特性。
