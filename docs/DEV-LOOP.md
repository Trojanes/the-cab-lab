# 开发执行手册 — The Dev Loop

> 对人和 AI 同样生效：一次改动在**它该过的那道门禁变绿**之前不算完成。
> 这条规则不问工具 —— Cursor 走 `.cursor/rules/cab-lab-dev-loop.mdc`，
> 其他 agent 走 `AGENTS.md`，人类就走这份文档。

## 完整闭环

```
1. 路由     docs/READING-GUIDE.md  — @owns / MODULE-MAP 找到归属模块
2. 最小改   只改归属文件；共享助手进 widgets/shared/fit；新文件打 @tags
3. 门禁     按改动面选档（下表），跑完报结果
4. 上报     回复里写明跑了哪档 verify、绿不绿、跳过什么
```

## 门禁档位

| 改动面 | 命令 | 耗时 | 覆盖 |
|---|---|---|---|
| 文档 / 规则 / 测试本身 | `npm run verify:quick` | ~3s | 分层 + 地图时效 + job/app 契约 |
| `renderer/panel/*`、`interact/*`、渲染核心 | `npm run verify` | ~15s | 全 16 个 renderer 套件 + audit |
| `generators/*`、`cnjob`、`job` 契约、依赖 | `npm run verify:full` | ~4min | 上项 + golden 套件 + 跨仓回放 + 真机 E2E |
| 合并 / upstream 移植 / 多模块重构 | `npm run verify:full` | ~4min | 同上 |

两档之间拿不准就跑高档。verify 不交互，红色 = 真信号——修，别解释。

## 架构是冻结的 —— 往里填，不要重塑

分层结构（壳 → 注册模式/编辑器 → 模块目录 → 中立层 → `gen/*`）是**固定契约，不是建议**。新模块、新功能往里填：

- 新交互模式 → `renderer/interact/` 新文件 + `S` 槽 + 壳里 MODE 注册。**不**给它新目录、新调度层、不改壳的写法。
- 新编辑器 → `renderer/panel/` 新文件 + `@tags` 头 + 壳里注册。同上。
- 新助手 → 按分层进 `fit.js` / `boardSketch.js` / `widgets.js` / `shared.js`。绝不在旁边再开一个 utils，绝不引壳。
- 新生成器 → `generators/<module>/` 照现有模块的文件布局；`build:generators` 打进 `renderer/gen/`。

**绝不**自行重组目录、改名分层、拆分或合并壳、引入状态库/路由/框架、改 `S` 槽契约。如果你认为结构该改——**停下来问用户**。架构只在用户主动要求时才动。`check:deps` 管得住机械部分；它看不见的判断部分由这条规则管。

## 防回归的源头规则

1. **最小 diff**：不顺手重构、不闲着 rename —— 每行搬动都是 upstream 的合并债。
2. **只动归属文件**：按 `@owns` 路由表落位；共享助手按分层进 `widgets.js`/`shared.js`/`fit.js`，绝不进壳。
3. **新文件打标签**：`// @module … @owns …` + 同提交里 `npm run module-map` 再生成地图（`check:map` 会拦陈旧地图）。
4. **生成器输出有意漂移**？先 `node scripts/diff-snapshots.mjs --regen` 读字段级 diff，确认是意图才 `npm run regen:snapshots`。**绝不为变绿而重发** —— 那就是静默回归的通道。
5. **新行为配新 pin**：bug 修复 / 生成器新语义必须同提交带回归测试（层级见 TESTING.md）。没 pin 的修复注定回归。
6. **跨仓数据面**（`cnjob`/`job` 契约/快照字段）：`verify:full` 是地板 —— 回放必须绿，OmniCam golden 只在有理由时用 `CABINETNC_UPDATE_GOLDENS=1` 显式更新。

## 各门禁断言什么

`verify` 全绿意味着：

- `check:deps` —— 分层没破（panel ⟂ interact，模块目录归壳私有）
- `check:map` —— `MODULE-MAP.md` 与代码同新鲜度
- `test:job` / `test:app` —— 数据契约 + 无头全流程
- 16 个 renderer 套件 —— 各交互/面板机制 pin 住
- `audit` —— 39 个生成 case 零新增几何错误
- `--full` 追加：golden 快照逐字节 + OmniCam 跨仓回放 + Electron 真机 28 步

## 已知例外

- `audit` 报 `audit.known.json` 里登记的 71 个已知几何错误不算失败（0 new errors = 绿）。
- `module-map` 的 glob warning（动态 gen 热载）是预期噪音。
