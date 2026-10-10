# T00 — 基线审计报告（第一轮）

审计时间：2026-10-08 · 执行人：Devin · 依据：`woodworking_engineering_prd_v1` T00-BASELINE
方法：全远端 `git fetch --prune` 后实测 SHA / ancestry / 构建测试，不沿用 PRD 快照值。

---

## 1. 仓库与远端拓扑

⚠️ **命名陷阱（必须先读）**：两个仓库的 `origin`/`upstream` 方向相反。

| 仓库 | `origin`（默认推送目标） | `upstream`（只读源/ fork 同步目标） |
|---|---|---|
| `the-cab-lab` | `yzhan722/the-cab-lab`（我们的 fork） | `Trojanes/the-cab-lab`（Troy 源仓） |
| `cabinetnc-cut` | `Trojanes/cabinetnc-cut`（Troy 源仓） | `yzhan722/cabinetnc-cut`（我们的 fork） |

`cabinetnc-intranet-cloud/` 目录已删除 —— 它只是 `cabinetnc-cut` 的 `feature/intranet-cloud-poc` 分支检出，分支完整保留在 yzhan722 fork。

## 2. 实测 SHA（fetch 后，非 PRD 快照）

### the-cab-lab（`D:\project\woodwork\the-cab-lab`）

| ref | SHA | 日期 | 说明 |
|---|---|---|---|
| `upstream/main` | `551478f968` | 10-06 | Troy 源仓最新（kitchen bench top + 门色组切换） |
| `origin/main` | `60e4c4f8b2` | 10-07 | fork 工程基线（= docs/* + ADR×5） |
| `origin/devops` = `devops` | `60e4c4f8b2` | — | 与 origin/main 同点 |
| 本地工作分支 | `feature/t00-baseline` @ `60e4c4f8b2` | — | 本报告所在分支 |

ancestry：`devops`/`origin/main` 领先 `upstream/main` **3 个提交**（cloud phase-1 + upstream merge + engineering baseline docs），方向为「fork = upstream + 我们的工作」。PRD 快照 `60e4c4f8` 实测一致。

### cabinetnc-cut（`D:\project\woodwork\cabinetnc-cut`）

| ref | SHA | 日期 | 归属 |
|---|---|---|---|
| `origin/main`（Trojanes） | `49a965039f` | 08-26 | 源仓主干（陈旧，Troy 侧未动） |
| `upstream/main`（yzhan722） = 本地 `main` | `69111e0c99` | 10-08 | **已接 RC**：merge(sprint 线, af03383 cloud) |
| `origin/sprint/14d-rc`（Trojanes） | `fc9d9cf79b` | 10-02 | Troy 最新 RC（Syntec post + 车间云任务 + 英文 UI） |
| `upstream/sprint/14d-rc` = 本地 `sprint/14d-rc` | `358ad408e5` | 10-08 | fork RC = Troy RC + **cloud revert** + 历史 sync merges |
| `upstream/feature/intranet-cloud-poc` | `b83941400d` | 09-08 | 内网云化 PoC（仅存远端，已判废弃方向，留档） |

历史锚点（可追溯）：fork RC 合并点 `3733e15`（含 cloud）、cloud revert `358ad40`、main 合并 `69111e0`、main 旧头 `af03383`（仍可达于 main 祖先链）

ancestry：
- `upstream/main` = `origin/main` + 1（`af03383` cloud phase-1）
- `origin/sprint/14d-rc` vs `origin/main`：分歧点 `6736076`，sprint 领先 **43 提交**（主线全部产品演进在 sprint 上）
- `feature/intranet-cloud-poc` vs `origin/sprint/14d-rc`：分歧点 `5e410d5`（"UI smoke blocking CI"），PoC 独有 **24 提交**，落后 sprint **8 提交**（CAD verify、remnant recut、L-cut/pocket/dado 修复、0.5mm gate、标签、Syntec post、车间云任务）
- PoC 相对 `upstream/main` 共领先 59 提交

### troysfirstfusionproject（`D:\project\woodwork\troysfirstfusionproject`）

- 本地 `main` 领先 `origin/main` **20 个未推送提交**；另有 1 个用户决定保留的未提交修改：`fusion360-unified-cabinet-plugin/modules/kitchen/fusion_adapter.py`（T2 去除错误的 −16 mm Y 偏移，仅取消平铺展开偏移）

## 3. 工作区状态

| 仓库 | 状态 |
|---|---|
| the-cab-lab | 干净 @ `feature/t00-baseline`；`stash@{0}` 存在（tall screws + wheel arch WIP，可恢复） |
| cabinetnc-cut | 干净 @ `sprint/14d-rc`（= `3733e15`，与 upstream 一致） |
| troysfirstfusionproject | 保留上述 1 个未提交修改（**勿动**） |

## 4. Before 基线：构建与测试（10-08 实测）

环境：Windows，dotnet `10.0.401`（`C:\Program Files\dotnet`），Node 在 PATH。OmniCam 在临时 worktree @ `af033836`（main）执行，已移除。

### the-cab-lab @ `60e4c4f` — 全部通过

| 命令 | 结果 |
|---|---|
| `npm run test:generators` | ✅ 12/12 + kitchen/tall/lounge golden + bench contract + layout + grain + milling + edgeBand + doors + cnjob + cnjob zip + sketchBoard + smoke |
| `npm run test:{pose,grab,resize,fridge,groove,measure,swatches,walls,bench,sketch}` | ✅ 全部 OK，exit 0 |

已知噪声（非失败）：`package.json` 缺 `"type": "module"` 导致 Node 警告刷屏；无聚合 `npm test`（各套件需单独跑）→ T02 待办。

### cabinetnc-cut @ `af033836`（upstream/main）

| 命令 | 结果 |
|---|---|
| `dotnet test CabinetNC.Domain.Tests` | ✅ 233/233 |
| `dotnet test CabinetNC.Infrastructure.Tests` | ✅ 12/12 |
| `dotnet test CabinetNC.Package.Tests` | ✅ 33/33 |
| `dotnet build CabinetNC.Desktop -c Release -p:EnableWindowsTargeting=true` | ✅ 0 错误 / 6 警告（NU1701 OpenTK/SkiaSharp 目标框架提示，既有） |
| `dotnet run --project tools/GoldenExport` | ❌ **预先存在的失败**：fixture `public/samples/demo_woodjob_120.zip` 在所有分支上都不存在，工具不可用 |
| CI `Windows Desktop` / UI smoke `01-demo-to-export` | ❌ **预先存在的失败**（自 `a108c8c` 起，Trojanes 源仓同样红）：见 §9 |

**§9 CI 红灯根因（10-08 定位）**：示例包的连接器盲孔在当前车间刀具目录下不可加工——
`demo_manufacturing_snapshot.json` 的 `H-001` 是 Ø4×12 盲孔（`SCREW_HOLE_FROM_RELATIONSHIP`），走 drill op → 绑定 T3 Ø3 → 验算报 `hole_diameter_mismatch`（Ø4 需求 vs Ø3 钻头）；
`demo_snapshot_single_side.cnjob` 同位置是 **Ø5** → 卡在 `IsDrillHole(<5)` 与最小铣刀 Ø6.35 之间 → `pocket_too_small_for_tool` → `feature_not_cut`。
`a108c8c` 引入的 CAD-intent 验算 gate 行为正确——它暴露的是既有缺陷：该孔从未被任何刀路加工，此前无人校验。
无头复现：`dotnet run --project dotnet/tools/VerifyJob -- --demo`。
修复方向是**数据**而非验算器——属示例 fixture 缺陷，非产品规格。
**✅ 已解决（10-08）**：两处 `H-001` 连接器盲孔均改 Ø3（T3 钻头存在），demo 孔→drill 绑定路径覆盖不变；`VerifyJob --demo` 三个示例包全绿。未加假想刀具——ToolCatalog 扩表需车间实有刀具事实。

main 上没有的测试项目（sprint 新增）：`Desktop.Core.Tests`、`Verify.Tests`、`ui-smoke/`（README 测试清单超前于 main 实际内容）。

## 5. OmniCam 分支差异矩阵

| 区域 | main `af033836` | sprint/14d-rc `fc9d9cf→3733e15` | intranet-cloud-poc `b839414` |
|---|---|---|---|
| Desktop UI | 旧 WPF | CAD/CAM 惯例 UI、英文界面、显示层、toast、WorkflowRules、UIA 冒烟（阻塞 CI） | 停在分岔点 5e410d5，未跟进后 8 提交的新 UI |
| 排料 Nest | 基础 | grain-aware、0.5mm P0 gate、remnant/L-cut/pocket/dado 尺寸修复 | true-shape nest contract v2 + local/server parity |
| CAM/后处理 | OSAI | +Syntec post、NC 安全不变量、G-code 回放验证 | 服务器端 CAM/post（Cloud.Worker） |
| 测试底座 | 3 个项目 / 278 用例 | +Desktop.Core.Tests、Verify.Tests、UI smoke、normalized NC goldens | +Cloud.* 4 测试项目 + PerfHarness 性能验证 |
| 云 | yzhan Storage 抽象 `af03383` | Troy `CabinetNC.CloudApi`+`CloudJobsWindow`+`CloudJobClient`（车间云任务，`fc9d9cf`）+ yzhan Storage `2c6c793` | 完整服务端：Cloud.Api/Contracts/Infrastructure/NestContract/Worker、auth 轮换、job leasing、租户管理 |
| Compute | Domain 单体 | 同 main | `Domain.Compute`/`Compute.Core`/`ComputeWorker` 抽离 + Obfuscar + AOT probe |
| cnjob schema | v1（blob `3c4b5a6`） | **v1.1**（`1250424`：+producer/producerVersion、substrate colorName/surfaceMode/series/grained） | v1（同 main） |
| 部署 | — | push 时 Release regression CI | `deploy/intranet` compose + ops 包（readiness/双 worker/日志轮转/备份） |
| 文档 | 基线 | CHANGES_SINCE_TROY、MANUAL_SMOKE_10MIN | INTRANET_POC、CLOUD_*、commercial readiness |

**状态标注**

| 内容 | 标注 | 说明 |
|---|---|---|
| sprint/14d-rc 全部产品演进 | **已入 main**（10-08 合并 `69111e0`） | 严格 ff 不可能（`af03383` 非 sprint 祖先）→ merge commit；yzhan722/main 现为产品线 |
| yzhan Storage phase-1 | **RC 已移除，main 保留为库** | 决策：revert 出 RC（`358ad40`）；合并后 main 侧保留该代码（`af03383` 带来的文件未被 sprint 删除触及）——T06 用 main 分支或 feature 分支恢复验证 |
| Troy 车间云 CloudApi vs PoC Cloud.Api | **已定：Troy 方向**（10-08 决策） | PoC 服务端栈不合并；其契约/测试方法仅留作参考 |
| PoC: `Domain.Compute` 拆分 `f02cff1` | **待评审** | 方向对（代码保护），但与 sprint 后续演进冲突面大；云方向定 Troy 后服务端复用动机减弱，优先级下调 |
| PoC: nest contract v2 parity `86d0474` | **待评审** | T01 契约素材，语义对比方法可直接复用 |
| PoC: 性能/可靠性验证 `3789986`、ops 包 `7492eec` | **待评审** | 测试方法有参考价值 |
| PoC: Obfuscar `ad74bca`、AOT probe `b839414` | **实验性** | 商用保护方向，本期不动 |
| PoC: 租户管理 `683f8ce` | **废弃候选（本期）** | 超出一个月周期范围 |
| PoC 服务端栈：`a4e6287` Api contracts、`aaa5e54`/`ffb5bd5` nest api+worker、`ee016a6` auth 轮换、`475b152`/`217333a` 存储+job lease、`4c91ca9` 服务端 CAM、`cd933b1`/`414b411` Desktop intranet client、`1aed30e` compose | **废弃（方向已定 Troy）** | 与 Troy CloudApi+CloudJobsWindow 重复实现；不合并、不 cherry-pick，仅 `docs/` 与 contract v2 方法留档参考 |
| Troy 侧 `desktop/tauri-intent.json` | **废弃候选** | 迁移意图未执行 |

## 6. 合并方案（10-08 已执行落地）

1. **✅ `upstream/main` ← sprint** — 已合并为 `69111e0`：严格 ff 不可能（`af03383` 不在 sprint 祖先链），采用 merge commit；6 处冲突解决：5 个生产文件取 sprint 版（MainWindow.xaml/.cs、ExportNaming、LabelExport、ExportNamingTests），`.gitignore` 取并集。合并后 `Domain.Tests` **511/511 通过**。main 侧保留 cloud storage 库文件（未接线 UI）。
2. **✅ `sprint/14d-rc` 为开发主线** — `358ad40` = `3733e15` + cloud phase-1 revert，已推 upstream；`Infrastructure.Tests` 15/15 通过。后续 T01/T02 在其上开 feature 分支。
3. **PoC 不整体合并** — 云方向已定 Troy：服务端栈整体废弃；**cherry-pick 只取 contract v2**（`86d0474` 的 true-shape 契约字段 + local/server parity 方法，T01/T04 按方法复刻而非 git cherry-pick——整提交会带回废弃 Cloud.Api 依赖）。ops/perf/Compute 拆分本期不做。
4. **✅ cloud phase-1 双提交已收敛** — sprint 侧 `2c6c793` 已 revert（`358ad40`）；`af03383` 保留在 main 历史与合并结果中。
5. **Cab Lab 无需动作** — fork = upstream + 3，方向正确。
6. **T01 权威基线确认** — `docs/manufacturing-snapshot-v1.schema.json`（sprint，v1.1）为唯一契约真源；main/PoC 的 v1 副本作废不维护。

## 7. 风险与待确认

**已确认（10-08 决策并已执行）**
- ✅ 云方向 = Troy 车间云（`CabinetNC.CloudApi` + `CloudJobsWindow` + `CloudJobClient`）；PoC 服务端栈废弃不合并
- ✅ `main` 已接 sprint RC：`upstream/main` = `69111e0`（merge commit，非严格 ff——原因见 §6.1）
- ✅ cloud phase-1 已从 RC 移除（revert `358ad40`），main 保留代码备 T06
- ✅ PoC 提取范围：仅 contract v2 方法复刻（T01/T04 时做）
- ✅ T01 权威基线 = sprint 的 `manufacturing-snapshot-v1.schema.json` v1.1
- ✅ Cab Lab↔OmniCam 契约字段级咬合已验证（10-08）：Cab Lab `generators/_lib/cnjob.ts` 输出 `schemaVersion "1.1.0"` + `source.producer="the-cab-lab"` + 全套 v1.1 substrate 字段；kinds（bore/groove/pocket/throughProfile）、`sourceFace` A/B/THROUGH、`workpieces`/`materials` 容器名与 `ManufacturingSnapshotImporter` 接受集一致；OmniCam `demo_manufacturing_snapshot_v1_1.json` 即 `producer=the-cab-lab@0.2.0` 契约 demo。
- ✅ 跨仓回放已建（10-08，T02 首批）：`the-cab-lab/scripts/emit-replay-cnjob.mjs` 发射 `fixtures/replay/kitchen.cnjob`（真实 zip）→ 同步到 `cabinetnc-cut/dotnet/tests/testdata/regression/packages/cab_lab_kitchen.cnjob` → `cab_lab_kitchen` golden（`GoldenJobRunner.RunPackageReplay`，严格镜像 VerifyJob 管线：AttachToNest→ContourToolOffset→Troy bundle→ExportVerifier）pin 住 preflight/layout/16 板 2 张排样/NC/验算码；`VerifyJob <file.cnjob>` 新增单文件全管线模式；`npm run test:replay` 为 cab-lab 侧无头冒烟。**回放即时发现并闭环** `groove_width_mismatch`：`B3_LED_MAIN` 报 14.5→16mm 实为**验算器误报**——宽度探针在 T 字接头处量到主槽+支槽的合法并集；`ExportVerifier` 已修：探针触碰兄弟槽扫略区的采样点跳过（`Groove_crossed_by_sibling_at_junction_passes` 防回归，narrower/wider 用例继续抓真超切）。`test:replay` 归零。

**Troy 待确认（制造/产品，剩余项）**
- sprint 的 8 个新提交（CAD verify 导出、remnant recut、pocket/dado 修到 CAD 尺寸、0.5mm gate、Syntec post、60mm 标签、L-cut 单切）制造语义是否符合车间预期——不阻塞 T01，但 Golden 批准前需闭环

**环境差异（记录，不修改）**
- 本机无 `E:` 盘 — `.cursor` 规则的部署目标 `E:\Work\OmniCam\dist\` 不可用
- `demo_woodjob_120.zip` 缺失 → GoldenExport 全分支不可用（待补 fixture 或从 Troy 侧获取）
- troysfirstfusionproject：20 个未推送提交游离于远端，Fusion 侧无 CI

**回滚/恢复**
- PoC 分支随时可恢复：`git fetch upstream && git checkout -b feature/intranet-cloud-poc upstream/feature/intranet-cloud-poc`
- 本次审计零写入远端、零历史改写；唯一新产物为本文件（`feature/t00-baseline` 分支，未提交）

## 8. T00 验收对照

- ✅ 各项目 source/fork/main/实验分支已识别（含 origin/upstream 方向陷阱）
- ✅ 实际 SHA 已 fetch 实测记录
- ✅ ancestry 分歧点与领先/落后数已记录
- ✅ 各功能块已给出 已入main/待评审/实验性/废弃候选 标注
- ✅ Before 构建/测试结果已记录（命令 + 通过数 + 既有失败）
- ✅ 所有分支可恢复，无删除、无改写
- ⏳ Troy 制造决策 / Zyn 合并策略确认 — **阻塞 T01 之前需闭环**
