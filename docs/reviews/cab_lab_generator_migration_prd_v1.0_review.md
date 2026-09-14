# 审核：Cab Lab Generator 全模块迁移 PRD v1.0

- 被审文档：`cab_lab_generator_migration_prd_v1.0.md`（v1.0，2026-09-14）
- 审核日期：2026-09-14
- 审核方式：通读全文；用 GitHub API 核对三个仓库的可见性、默认分支、固定 SHA、目录与脚本；对照当前 `the-cab-lab` 工作区

## 结论

文档结构完整、规则清晰，可以作为执行合同。但有一个阻断级问题必须先解决（目标仓库身份），另有若干缺口会让 Autonomous / No-Q&A 模式下的执行走偏。

---

## P0 — 目标仓库身份对不上（阻断）

PRD 中的 "Cab Lab" 指 `yzhan722/custom-flat-pack-platform`（Next.js monorepo、`@cfp/core`、`DesignSpec` / `compileCabinet` / `CabinetViewer.tsx`）。

当前工作区 `the-cab-lab` 是另一个**同名**项目：

| 项目 | PRD 中的 Cab Lab | 当前工作区 |
|---|---|---|
| Remote | `yzhan722/custom-flat-pack-platform` | `Trojanes/the-cab-lab` |
| 形态 | Next.js + React + Three.js monorepo | Electron + Three.js 桌面 CAD |
| 核心 | `packages/core/src/...`、`DesignSpec`、`compileCabinet` | `generators/` + `renderer/` + `job.json` |
| 脚本 | `build / test / typecheck / lint / dev` | `start / build:generators / shortcut` |
| Appendix B 的 8 个路径 | 存在 | **全部不存在** |
| 已有 generator | 无 | `overheadCabinet`（文件集与 Fusion 一致）、`smallCabinet`、`bedroom`、`bedBox` |

当前工作区的项目规则 `.cursor/rules/cab-lab-core.mdc` 还明确写着：generators 只属于 The Cab Lab，"must not be pointed back at" Fusion 的 `modules/` 树。

风险：PRD 1.2 的 `TARGET_ARCHITECTURE_DRIFT`（路径不存在 → 不提问、自行适配）与 0.1 的 No-Q&A 叠加后，agent 在这个工作区跑这份 PRD，最可能把 `@cfp/core` 那套结构硬塞进 Electron 应用，或跑去 clone 另一个仓库。

**建议**：在 0.1 的"允许停止"里增加硬前置校验——`git remote` 必须匹配 1.2 的 URL，且 Appendix B 的入口文件必须存在，否则 STOP。这是真正的基础设施级问题，不应被"自行适配"吞掉。

---

## 事实核对结果

### 已验证正确

- 三个仓库均为 public，默认分支 `main`
- Fusion 固定基线 `89bedb204c5aabe839409a62d56609f2ef86ce20`，同时也是当前 `main` HEAD（2026-07-14）
- Cab Lab 基线 `d1ba5de5f4e90f8a3b2be81f8c632d07e4c9263a`，同时也是当前 `main` HEAD（2026-09-09）
- 根 `package.json` 脚本 `build / test / typecheck / lint / dev / start`，`engines.node >= 20`
- `packages/core/src` 目录结构；`apps/web/src/components/CabinetViewer.tsx` 存在
- Fusion `modules/` 下正好四个目录：`generalTallCabinet`、`overheadCabinet`、`kitchenCabinet`、`loungeGenerator`
- Kitchen 模块确实只有 `generator.ts`、`types.ts`、`relationshipDeclarations.ts` 三个文件、零测试

### 小遗漏

- 9.1 General Tall 文件清单漏了 `validationCases.heightBalanced.ts`（基线 SHA 下存在）。32.2 禁止"忽略 helper"，清单应补全或明确标注"非穷尽"。
- 第 6 节的 core 目录列表漏了 `ai/`、`measurement/`、`ids.ts`、`units.ts`、`index.ts`。第 4 节把 "AI design agent" 划为 out of scope，但 core 里已有 `ai/`，应明确"不得破坏"。
- Kitchen 零测试意味着它的 parity 没有 source oracle（见 P1-1）。

---

## P1 — 会影响执行结果的缺口

### 1. Parity 的 "Source 期望值" 来源未定义

Fusion 四个 generator 都是纯 TypeScript，可以在 Vitest 里直接执行基线代码作为参考 oracle。但 5.2 禁止 "Fusion compatibility runtime"，边界没有写死。

建议：允许在 `test/` 下 vendored 一份 `89bedb2` 的 `modules/` 作为**测试专用 reference oracle**，禁止被 `src/` import。否则 Kitchen 这类无测试模块的 parity 只能靠"看起来像"，正好踩 32.7。前提：Round 0 需验证 Fusion 的 `modules/*.ts` 不依赖 `adsk`。

### 2. 下游合同对新 generator 的行为未定义

6.1 / 21 只要求"不破坏现有 O/D"，但 `runEngineering` 会把新 generator 的 `CompiledCabinet` 继续喂给 BOM / packaging / pricing / rules。遇到 shaped panel、新 Operation 类型，exhaustive switch 会直接 throw。

建议明确：下游对新 kind 至少"不抛错、可标记 unsupported"，还是必须给出有效 pricing / BOM。这直接决定 Round 1 工作量。

### 3. `engineeringHash` 稳定性应写成具体测试

6.1 提到 hash，但没有要求"现有 O/D 设计的 hash 逐字节不变"。这是防止 DesignSpec / Panel 扩展悄悄改变旧输出最便宜、最有效的回归门。

### 4. 7.3 与 15.1 冲突

7.3："不把 machine instruction 混入 customer design intent"。15.1：要求迁移 Kitchen 的 "V-panel machining preferences / through-half groove / slot requests" 到 UI。在 Fusion 里这些就是用户输入。

建议指明落点，例如 `generatorConfig.manufacturingPreferences`，否则 agent 会二选一。

### 5. Tolerance 与单位未给定

Round 5 只写"需要明确 tolerance"却没给值。建议直接写 mm、0.01（或 0.001）mm，并要求 Round 0 确认 Fusion TS 模块的单位是 mm 而非 Fusion API 的 cm。

### 6. 3D Preview 的验收主体缺位

第 8 节闭环末尾是 "User Verification"，24 节要求"看到 3D Preview"，25 节 DoD 有"3D preview 可用"——但模式是 No-Q&A 自主执行，Three.js 又无法 headless 渲染。

建议：agent 侧验收定义为可自动化的项（`CompiledCabinet → viewer mesh` 映射单测、bbox / 位置检查、可选浏览器截图），视觉确认明确留给人（Appendix D 第 9 项已有雏形）。

### 7. 单次自主执行的体量不现实

GT `generator.ts` 一个文件 124 KB，四模块源码加测试估计 300 KB+，再加 PRD 本身 2400 行与 Cab Lab 现有代码。17 节禁止逐模块推进、Round 1 要求"不得只完成一个模块就结束"，与 agent 上下文上限正面冲突，大概率结果是浅层 first pass 后报 PARTIAL。

建议：把 Round 0–6 明确定义为**独立 session 边界**，用 `source-inventory.md` / `target-baseline.md` 作为 session 间交接物。这与并行原则不矛盾——每个 session 内仍是四模块并行。

---

## P2 — 细节

- 2.3 `git worktree add ... -b feat/... origin/main`：分支已存在时（2.2 场景）`-b` 会失败，应给出 `git worktree add <path> feat/...` 备选。
- 22 节 `npm run test --workspace @cfp/web`：workspace 级命令没带 `--if-present`，若 web 无 test script 会报错，与"根级可跳过"不一致。
- 27 节推荐的 commit `feat(core): migrate general tall generator` 逐模块拆分，与 17 节"四模块并行、first pass 前不宣布任一完成"有张力，建议改成 `feat(core): first-pass all four generators` + 后续按能力域拆。
- 缺 feature flag / 回滚策略：新模板入口建议先 gate 起来，保证 `main` 在迁移中途仍可发布。
- Round 1 的"第一版有效输出"缺可判定标准，建议：默认参数 → 非空 boards、无 error、两次运行输出相同。
- 11 节"禁止过度抽象"与 7.1 `shared/` 目录之间可补一句：shared 只放四模块都用到的东西，否则留在各自模块里。

---

## 待决策

这份 PRD 到底要跑在哪个 "Cab Lab" 上？

- **`custom-flat-pack-platform`**：PRD 按 P1 / P2 补丁后即可执行，但**不要在 `the-cab-lab` 工作区执行**。
- **当前 Electron 版 `the-cab-lab`**：PRD 第 6、7、12、13、16、22 节与两个 Appendix 基本要重写——这里没有 DesignSpec、没有 Vitest、没有 Next.js 配置器，3D 层是 `renderer/cabinets3d.js`；本地 `overheadCabinet` 已先行迁入，Scope 应改为"三模块 + 校对已迁的 Overhead"。
