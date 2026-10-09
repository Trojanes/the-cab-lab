# Reading Guide — 先路由，后读取

> 给所有开发者（人类或 AI）：**不要通读文件找东西**。先经索引路由到归属文件，
> 再读需要的窄段。本规范使任何工具在 1–2 次检索内定位功能归属。

renderer 已从巨石（interact.js 5628、panel.js 3914、bench.js 3841、modules.js 2425 行）拆为壳 + 模块目录
（`interact/` `panel/` `bench/` `modules/`；place.js 的吊顶段在 `interact/place-ceiling.js`）。
这套索引是让拆分**对工具可见**的那一层：没有它，模块化只是搬了家。

## 三个索引

| 索引 | 位置 | 用法 |
|---|---|---|
| **模块地图** | `docs/MODULE-MAP.md` | 文件 → `@tags` + 导出符号。`npm run module-map` 重新生成（勿手改） |
| **文件头标签** | 每个 `interact/*` `panel/*` `bench/*` `modules/*` 首行 | `// @module <目录族名> @owns <事件前缀/功能>` |
| **路由表** | 本文末节 + `.cursor/rules/cab-lab-index.mdc` | 概念 → 文件 |

### 标签检索（最快路径）

```bash
rg "@owns kitchen.cell"        # 谁的代码发出 kitchen.cell.* 日志 → panel/kitchen.js
rg "@module panel"             # 列出全部面板编辑器
rg "@owns" renderer/interact   # 列出交互各模式的归属声明
```

**日志事件前缀 = 归属文件**：`kitchen.cell.drag` → `panel/kitchen.js`，
`ohc.zone.*` → `panel/overhead.js`，`place.*` → `interact/place.js`，
`move.*` → `interact/move.js`。事件语义全集见 `.cursor/rules/cab-lab-usage-log.mdc`。

## 分层与 import 规则（`npm run check:deps` 强制）

```text
L0 中立层（任何代码可依赖）
  job.js  modules.js  fit.js  spaces.js  walls.js  pose.js
  snap.js  hud.js  materials.js  log.js  renderer/gen/*

L1 几何/显示  space.js cabinets3d.js walls3d.js floorplan.js boardGeom.js ...

L2 交互壳    interact.js ── owns ──▶ interact/*
L3 面板壳    panel.js    ── owns ──▶ panel/*
注册表       modules.js  ── owns ──▶ modules/*   （纯 helper 域，经壳 re-export）
L4 应用      ui.js  main.js
独立窗口     bench/index.html → bench/bench.js ── owns ──▶ bench/*
```

- `panel/*` 不得 import `interact*`；`interact/*` 不得 import `panel*`。
  需要共享时：纯几何 → `fit.js`，面板控件 → `panel/widgets.js`。
- `interact/*`、`panel/*`、`modules/*` 由各自壳私有——外部代码 import 壳，不是模块文件。
- `bench/*` 是独立窗口——外部代码不得 import 其中**任何**文件（壳也在目录内）。
  bench 内部允许兄弟循环 import，但仅限 `export function` 声明；
  共享可变状态经属主函数改（如 `resetExplodePlan()`），不得跨模块给 import 绑定赋值。
- `renderer/gen/*` 是 `npm run build:generators` 的产物，**永不手改**。
- interact 各模式经 `interact/shared.js` 的 `S` 槽袋共享可变状态；
  不要新建第二个可变注册表，扩展 `S`。

## 编辑守则（保持索引为真）

- 函数放进 `@owns` 覆盖它的文件；新文件必须写 `@module` 头并重跑 `npm run module-map`。
- 改模块前先跑 `npm run check:deps`；加了跨层 import 会立刻被拦。
- 移动/改名函数后重跑 module-map。

## 量化对比（实测，非估算口径）

| 量 | 巨石版（upstream/main） | 拆分+索引 |
|---|---|---|
| 单文件规模 | 5628 / 3914 行 | 壳 ≤436 行；模块典型 ≤800 行 |
| 模块顶层可变作用域（改动需 aware 的符号） | 303 / 97 个 | place.js 94，其余模块 13–16 |
| grep `drag` 定位 kitchen 拖拽 | panel.js 内 69 命中需逐个甄别 | kitchen.js 内 10 命中同归属 |
| 定位一次典型任务 | 3–6 次检索往返 | 1–2 次 |

## 常见任务路由

| 你要做 | 去 |
|---|---|
| 改 job 状态/选择/撤销 | `renderer/job.js` |
| 改 envelope↔params 映射、模块 API | `renderer/modules.js`（+ 对应 `generators/<dir>/`）；纯 helper 域在 `modules/stackFit.js` `modules/fridge.js` |
| 「是否可放/被挡住/重叠」纯几何判断 | `renderer/fit.js` |
| 3D 网格/手柄/移动三轴 | `renderer/cabinets3d.js` |
| 放置流程（arm→face→extrude，kitchen 边扫） | `interact/place.js`（吊顶专属段在 `interact/place-ceiling.js`） |
| 拖面改尺寸 | `interact/resize.js` + `interact/shared.js` |
| 改 generator bench（生成器调试窗） | `bench/bench.js`（壳）+ `bench/<域>.js`（`@owns` 路由） |
| 面板控件/`outerSizeFields`/板件抽屉 | `panel/widgets.js` |
| 某模块编辑器 | `panel/<前缀>.js`（对日志前缀） |
| 生成器逻辑 | `generators/<dir>/generator.ts` |
| cnjob 导出契约 | `generators/_lib/cnjob.ts` → `docs/CNJOB.md` |
| 几何审计/已知问题清单 | `npm run audit` · `generators/_lib/audit.known.json` |
| 快照语义 diff | `npm run test:generators` · `fixtures/snapshot/` |
| 真实 App 端到端驱动 | `node scripts/e2e-drive.mjs` |

## 验证命令（改动完成前）

```bash
npm run check:deps      # 分层违规
npm run module-map      # --check 时校验 MODULE-MAP 未漂移
npm run test:job && npm run test:generators
node scripts/e2e-drive.mjs   # 真机 28 项（Electron + CDP 真实键鼠）
```
