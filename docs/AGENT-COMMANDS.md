# Agent Command API（T05 早期设计草案）

> **2026-10-10 现状校准**：本文件含部分**约定/计划**动词，不能被编程 AI 视为全部已实现。实际已实现入口/限制以 [Agent 接口 v1](agent/INTERFACES-v1.md) 及 `renderer/commands.js`、`cli.mjs` 为准；新增目标见 [v2](agent/INTERFACES-v2.md)，实施按 [Agent PRD](agent/PRD-2026-10.md)。**不要把 MCP、CLI 宿主动词与 Registry 动词混为一谈。**

> 已知需修复：`invoke()` 失败回滚与原子 batch、`file.export-cnjob --path` 当前写 JSON 而非 ZIP、`bench.pins` 对部分 centerline 的覆盖。`history.begin/end` 是现有分组接口，不等同于自动回滚事务。


本文档定义 The Cab Lab 与 OmniCam 的**原子指令集**——每个操作源一条指令，
像 CMD 命令一样可被脚本、CLI 与 Agent 驱动。这是 Agent Tool 接口的权威契约：
实现以此文档为准，文档未列的指令不实现。

**状态**：契约草案（T05）。`已实装` = 现在可跑；`约定` = 语义已锁定待接线。

约定：

- **单位一律 mm**，Z 向上，原点为空间前左下角（`docs/model-spec.md`）。
- 指令名 `域.动词`，参数 CLI 侧 `--key value`，程序侧同名 JSON 字段。
- 每条变更指令执行后自动跑**验证门**（`validate`），回执见下。
- 所有指令永不抛异常；失败返回结构化错误。

## 0. 传输与回执

### 0.1 两种宿主

| 宿主 | 入口 | 说明 |
|---|---|---|
| Node 无头 | `node cli.mjs <verb> [args]` / `createApp()` | 无 DOM；覆盖除 raycast 外的全部指令 |
| Electron 内嵌 | `window.__app.invoke(verb, args)` | 运行中的 app 同一协议；bench 的 `screenOf`/`pickFace` 类交互仅此处可用 |

### 0.2 CLI 语法

```bash
node cli.mjs <verb> [--key <value>]... [--params '{"k":v}'] [--json] [--dry-run]
node cli.mjs --repl          # stdin 逐行指令，stdout 逐行回执
node cli.mjs --batch ops.jsonl
```

`--json` 输出单行 JSON（Agent 模式）；缺省为人类可读文本。退出码：`0` 全部 ok，
`1` 指令失败，`2` 用法/协议错误。

### 0.3 回执（envelope）

```jsonc
{
  "ok": true,                 // false = 指令被拒绝或执行失败
  "verb": "cabinet.set-param",
  "effect": { },              // 本指令的净效果（见各指令"返回"节）
  "validate": {               // 验证门：变更指令必带
    "ok": true,
    "fitIssues": [],          // 空间/重叠/墙合法性（exportFitIssues）
    "generatorErrors": []     // 各柜 validation.errors
  },
  "diff": null,               // 本次变更的语义差异（T04 snapshotDiff 摘要）
  "undoGroup": 17             // 可合并的撤销组号（见 history.mark）
}
```

失败：`{ "ok": false, "verb", "error": "...", "code": "...", "extra": {} }`。

### 0.4 错误码

| code | 含义 |
|---|---|
| `unknown_verb` | 指令名不存在（`help` 列出全集） |
| `bad_args` | 参数缺失/类型错/越界（`extra.fields` 指出哪几个） |
| `unknown_id` | cabinet/wall/plane/zone/board id 不存在 |
| `contract` | 触碰 job.v2 契约（`extra.reasons`） |
| `blocked` | 合法指令被业务规则拒绝（`extra.reason`，如模块最小尺寸、attch 体） |
| `conflict` | 变更会产生重叠，且未带 `--force`（见 yield） |
| `internal` | 生成器崩溃等非预期（`extra.error`） |

---

## 1. 对象模型（字段全集）

指令参数引用这些结构；所有字段均取自 `job.js` 真实存储。

### 1.1 Cabinet（`job.cabinets[i]`，唯一存储层）

```jsonc
{
  "id": "cab-7",                 // 字符串 id
  "moduleId": "kitchenCabinet",  // 见 §2.1 模块表
  "pose":  { "x": 0, "y": 16, "z": 0, "rotZ": 0 },  // mm + 度（90 的倍数）
  "params": { /* 模块参数，见 §4 */ },
  "placeCorner": { "x": -1, "y": 1, "z": 1 },       // 可选；尺寸变更的生长锚角
  "colorSlot": "A",              // 可选；缺省跟随组 A
  "attach": null,                // 可选；bedBox/bedSideTable 的依附目标
  "overrides": { "boards": { "B3": { "grooves": […] } } }
}
```

### 1.2 Space（`job.space`）与 Wall / Plane / Opening

```jsonc
// space
{ "kind": "box" | "vehicle", "params": { … } }
// box:      width ≥300, depth ≥300, height ≥300, walls: [0..3]（0前1右2后3左）
// vehicle:  width, rearDepth, height, frontMode: "points"|"dxf", front: {points|dxf}

// wall —— renderer/walls.js normalizeWall
{ "id": "w1", "axis": "x"|"y", "at": 1200,      // 墙线：axis 轴上的偏移
  "u0": 0, "u1": 800,                            // 沿墙线跨度（mm）
  "side": 1|-1,                                  // 厚度在哪一侧
  "split": […], "fit": {…}, "openings": [op…] }

// opening —— normalizeOpening
{ "id": "op1", "type": "slidingDoor"|"showerDoor",
  "from": "lo"|"hi", "offset": 0, "width": 700,
  "bottom": 0, "top": 20,                        // 离地/到顶留空
  "side": 1|-1, "overlap": 40, "doorHeight": 1880 }  // slidingDoor 专有

// plane（构造面）
{ "id": "plane-1", "axis": "x"|"y"|"z", "value": 600, "dir": 1|-1 }
```

### 1.3 材质（`job.finish` / `job.stock`）

```jsonc
finish: {
  "carcass": { "name": "White Stipple" },        // 固定
  "door": { "series": "acrylic"|"hpl", "mode": "one"|"two",
            "sides": "single"|"double",
            "colors": [{ "id": "A"|"B", "series": "…", "name": "…" }] },
  "benchTop": { "name": "<hpl 色名>" }
}
stock: {
  "carcass":   { "thickness": 16 },
  "partition": { "thickness": 16, "floorClearance": 0, "ceilingClearance": 0 },
  "door":      { "thickness": 18 }
}
```

### 1.4 用户槽（`overrides.boards.<boardId>.grooves[]`，grooveTool）

```jsonc
{ "id": "G1", "face": "B", "kind": "groove"|"tgroove",
  "u0": 0, "v0": 0, "u1": 100, "v1": 14.5,       // face 局部 (u,v) 矩形
  "depth": 6, "group": "L1", "width": 14.5 }     // tgroove 带 group；line 形态带 width
```

### 1.5 结果回执中的派生字段

`envelope` `{W,D,H}`，`boardCount`，`errors[]`（generator `validation.errors`），
`grainIssues[]`，`millingIssues[]`，`fits`（poseFits）。

---

## 2. space / cabinet / history / file

### 2.1 `space.*`

| 指令 | 功能 | 参数 | 返回 effect |
|---|---|---|---|
| `space.define` | 定义/重定义空间（第一步）。不改 cabinet pose，重定义后不适配的柜进 fitIssues | `kind`(必填,枚举), `--params`(必填) | `{space}` |
| `space.get` | 已解析空间 | — | `{floor,height,obstacles,bounds,walls,summary}` |
| `space.kinds` | 可用 kind | — | `["box","vehicle"]` |

### 2.2 `cabinet.*`

| 指令 | 功能 | 参数 | 返回 effect |
|---|---|---|---|
| `cabinet.add` | 放置并生成一个柜（= place 流程的语义结果） | `moduleId`(必填) `x,y,z,rotZ` `W,D,H` `--params`(JSON 补丁) | `{id,pose,envelope,boardCount,errors,fits}` |
| `cabinet.remove` | 删除 | `id` | `{}` |
| `cabinet.move` | 平移/旋转（move.free；仍过合法性检查） | `id` + `dx\|x\|y\|z\|rotZ` | `{id,pose,fits}` |
| `cabinet.align-face` | 面贴面移动（move.face：本柜一面贴上目标面所在平面） | `id`,`from`(面),`to`(面描述 `{kind:cabinet\|wall\|plane, id, axis, dir}`) | `{id,pose,fits}` 或 `blocked` |
| `cabinet.align-point` | 角点对齐（move.point，无旋转） | `id`,`from`(本柜角 `{x,y,z}±1`),`to`(`{x,y,z}` mm) | 同上 |
| `cabinet.orient` | Face 命令：包络不动、W/D 互换朝向 | `id`,`face`(`{axis,dir}`) | `{id,pose,envelope}`；`blocked` 含 reason |
| `cabinet.rotate` | 绕 Z 转 90°（R 键语义） | `id`,`rotZ` | `{id,pose}` |
| `cabinet.resize-face` | 拖一个面改尺寸（Resize；zone 规则跟随该模块） | `id`,`face`(`{axis,dir}`),`to`(mm) | `{id,pose,envelope,errors}` |
| `cabinet.copy` | 复制（Ctrl+Enter） | `id` | `{id,newId}` |
| `cabinet.set-param` | 单字段补丁（merge） | `id`,`key`,`value` | `{id,envelope,boardCount,errors,fits}` |
| `cabinet.set-params` | 多字段补丁 | `id`,`--params`(JSON) | 同上 |
| `cabinet.set-color-slot` | 颜色组 | `id`,`slot`("A"\|"B") | `{id,colorSlot}` |
| `cabinet.migrate` | 换模块 id（同尺寸迁移） | `id`,`moduleId` | `{id,moduleId,errors}` |
| `cabinet.get` | 单柜详情 | `id` | `{id,moduleId,pose,params,envelope,boardCount,errors,grainIssues,millingIssues,fits}` |
| `cabinet.list` | 柜清单 | `--moduleId`(可选) | `[{id,moduleId,pose,envelope,errors: n}]` |
| `cabinet.select` | 选择（Agent 上下文指针） | `id`,`--sub`(可选) | `{selected}` |

> `cabinet.move/orient/resize-face` 等对 `attach` 模块（bedBox/bedSideTable）返回
> `blocked{reason:"attached"}`——它们的位置由宿主给。

### 2.3 `history.*`

| 指令 | 功能 |
|---|---|
| `history.undo` / `history.redo` | 撤销/重做一步。effect `{applied:bool}` |
| `history.mark` | 开撤销组：此后到 `history.commit` 之间的变更算**一步** undo |

### 2.4 `file.*`

| 指令 | 功能 | 参数 |
|---|---|---|
| `file.new` | 新空 job | — |
| `file.open` | 载入 job.json（migrate+契约校验） | `path` 或 `--json`内嵌对象 |
| `file.save` | 序列化写盘 | `--path`(缺省回当前路径) |
| `file.export-cnjob` | 经 `buildCnjob` 出制造快照 | `--path`, `--jobId`；effect `{snapshot\|path, boardCount, materialIds}` |
| `dxf.import` | DXF → vehicle 前脸轮廓 | `path` |

---

## 3. wall / plane / board / material / yield

| 指令 | 功能 | 关键参数 |
|---|---|---|
| `wall.add` | 加隔墙 | `axis`,`at`,`u0`,`u1`,`side`,`--split`,`--fit` |
| `wall.remove` | 删墙（其开门随之删） | `id` |
| `wall.set-split` | 改分割段 | `id`,`split`(数组) |
| `wall.set-fit` | 贴柜放样（fitPick 结果） | `id`,`fit`(fit id),`how` |
| `wall.add-opening` | 加门/窗洞 | `id`,`type`,`from`,`offset`,`width`,`bottom`,`top`,滑动门专有 `side`/`overlap`/`doorHeight` |
| `wall.set-opening` | 改洞 | `id`,`op`,`--patch`(JSON) |
| `wall.remove-opening` | 删洞 | `id`,`op` |
| `wall.show` / `wall.hide` | 可见性 | `id` |
| `wall.get` / `wall.list` | 墙详情/清单 | — |
| `plane.add` | 构造面 | `axis`,`value`,`dir`,`offset`,`from` |
| `plane.remove` | 删面 | `id` |
| `board.set-grooves` | 替换一板的用户槽（一撤销步） | `id`(cab),`board`,`--grooves`(JSON 数组，见 §1.4) |
| `board.nudge` | 板级微调（overrides.boards） | `id`,`board`,`dx,dy,dz` |
| `board.hide` / `board.show` | 板可见性 | `id`,`--boards`(逗号分隔 roleId) |
| `material.set` | job 级材质（改组色=级联重生成全组） | `--finish`(JSON),`--stock`(JSON)，可只给一个 |
| `yield.apply` / `yield.decline` | 邻居让位冲突的接受/拒绝 | — |

---

## 4. 模块编辑指令（zone / cell / run）

所有模块编辑最终都是 `params` 的结构化补丁；以下指令把面板手势翻成稳定语义。

### 4.1 通用 zone 协议

| 指令 | 适用模块 | 功能 | 参数 |
|---|---|---|---|
| `zone.select` | all | 选 zone（上下文） | `id`,`zone` |
| `zone.drag-boundary` | tall,kitchen,small,ohc | 拖区间边界，邻位吸收差值 | `id`,`index`(第 index 个边界),`to`(mm) |
| `zone.set-type` | all | 改 zone 类型 | `id`,`zone`(id 或 index),`type`(枚举见各模块) |
| `zone.set-height` | tall,small,fridge | 改 zone 高 | `id`,`zone`,`height` |
| `zone.set-width` | ohc,kitchen | 改 zone/列宽 | `id`,`zone`,`width` |
| `zone.add` | ohc,tall,small,fridge | 从可让渡 zone 拿尺寸新增 | `id`,`--from`(可选) |
| `zone.remove` | 同上 | 删 zone，尺寸归 `heir` | `id`,`zone` |
| `zone.average` | ohc | 均分宽度 | `id` |
| `divider.set-x` | tall,fridge | 竖分板中线 x | `id`,`zone`,`to` |

约束（生成器会拒，指令层先拦）：zone 宽/高 ≥ 模块最小值（ohc 150、tall 60 等，见
`schema zone.*`），总和不脱离柜体尺寸。

### 4.2 `ohc.*`（overheadCabinet — 吊顶柜）

zone type 枚举：`up_flap` `fixed_panel` `open` `rangehood_flap`

| 指令 | 功能 | 参数 |
|---|---|---|
| `ohc.set` | 选项字段 | `id`,`key` ∈ `style`(style_1\|style_2) `ledGroove`(bool) `topClearanceHeight`(mm) `hingeHoleDiameter` `hingeHoleDepth` `hingeHoleFromTop` `hingeHoleFromSide`,`value` |
| `ohc.rangehood` | 烟机嵌入参数 | `id`,`key` ∈ `rangehoodClearHeight` `rangehoodAlignment` `rangehoodEdgeOffsetX`,`value` |
| `uohc.set` | U 形 overhead 专属键 | `id`,`key`,`value` |

### 4.3 `tall.*`（generalTallCabinet — 高柜·储物）

zone type 枚举：`side_door` `left_side_door` `right_side_door` `double_door`
`drawer` `open_space` `open_appliance` `top_flap` `bottom_flap` `blank_panel`

| 指令 | 功能 | 参数 |
|---|---|---|
| `tall.side` | 侧板方式与厚度 | `id`,`side`(left\|right),`mode`,`thickness` |
| `tall.preset` | 应用 presets.json 具名柜（除门色/纹理外全替换，从 placeCorner 生长） | `id`,`preset` |
| `tall.zone-appliance` | 电器 zone 尺寸 | `id`,`zone`,`--applianceWidthMm`,`--applianceHeightMm`,`--applianceDepthMm` |
| `tall.shelf` / `tall.shelf-height` | 层板数/层高 | `id`,`zone`,`value` |
| `tall.divider` | 竖分板 | `id`,`zone`,`to`(mm) |

### 4.4 `fridge.*`（tallFridgeCabinet — 高柜·冰箱）

冰箱**开孔**尺寸固定，柜宽 = 开孔 + 侧板 + 3×CPT（宽度拖不得，`noOrient`）。

| 指令 | 功能 | 参数 |
|---|---|---|
| `fridge.cutout` | 改开孔（机家开口，不是机身） | `id`,`key` ∈ `applianceWidthMm` `applianceHeightMm` `applianceDepthMm`,`value` |
| `fridge.side` | 单侧板 | `id`,`side`,`finish`,`thickness` |
| `fridge.above` / `fridge.below` | 冰箱上/下 zone 类型与高度 | `id`,`type`(`top_flap`\|`fixed_panel`\|…),`height` |
| `fridge.preset` | 具名冰箱预设（含全板 pin） | `id`,`preset`(如 `rogue-dometic`) |
| `fridge.top` / `fridge.system` | 顶部系统 | `id`,`value` |

### 4.5 `kitchen.*`（kitchenCabinet / ensuiteCabinet — 地柜）

列内 zone 自上而下存储（zones[0] 最高）。zone type = BASE_ZONE_TYPES +
`stove`（ensuite 无 stove——硬规则）：

`left_door` `right_door` `double_door` `drawer` `open` `down_flap` `stove` `custom`

| 指令 | 功能 | 参数 |
|---|---|---|
| `kitchen.cell.select` | 选列/格 | `id`,`column`(index),`zone`(id) |
| `kitchen.column.drag` | 列边界宽拖拽 | `id`,`index`,`to`(mm) |
| `kitchen.zone.drag` | 格列边界高拖拽 | `id`,`column`,`index`,`to` |
| `kitchen.column.add` / `kitchen.column.remove` | 增/删列（取最宽列一半 / 归 heir） | `id`,`--width`,`--column` |
| `kitchen.zone.add` / `kitchen.zone.remove` | 分裂 zone（抽屉优先拿 ≤200） / 归 heir | `id`,`column`,`--zone` |
| `kitchen.cell.set` | 单元字段 | `id`,`column`,`zone`,`key` ∈ `type` `height` `width` `shelf` `lock`,`value` |
| `kitchen.kick` | 踢脚样式 | `id`,`style`(`style_1` 内退 \| `style_2` 齐平) |
| `kitchen.side` | 端列侧键 | `id`,`column`,`side`(left\|right),`key` ∈ `panelType` `frontVisible` `grooveVisible` `bchNotchEnabled` `extendT2T3B4ToOuterFace` `strengtheningStripEnabled`,`value` |
| `kitchen.led` | B3 底 LED T 槽开关（style_1 专属） | `id`,`on`(bool) |
| `kitchen.wheel` | 轮拱避让 | `id`,`--add`(新避让) 或 `--edit/--remove --index N`；避让字段 `x0,x1,height,depth` |
| `kitchen.appliance-floor` | ensuite 洗衣机地台（B3 后 deck + 双支撑） | `id`,`zone`,`on`(bool)；厨房/style_2/深<450/净宽<500/撞轮拱 → `blocked` |

### 4.6 `small.*`（smallCabinet）与 `lounge.*`（loungeGenerator）

small zone type：`left_door` `right_door` `drawer`

| 指令 | 功能 | 参数 |
|---|---|---|
| `small.side` | 边侧门板 | `id`,`side`,`on`(bool) |
| `lounge.set` | run 尺寸 | `id`,`key` ∈ `mainWidth` `mainDepth` `lWidth` `lDepth` `totalWidth` `singleLoungeWidth` `depth`,`value` |
| `lounge.style` | 形态（I/L/U/PARALLEL） | `id`,`style` |
| `lounge.run-key` | run 键 | `id`,`run`(`i`\|`main`\|`l`\|`left`\|`right`),`key` ∈ `side` `lid` `midCab` `wheel` `lFrontAccess`,`value` |

### 4.7 其余模块

`bedroom` `bedBox` `bunkBed` `bedSideTable` `bedroomEast` `sketchBoard`：
通用 `cabinet.set-param`/`zone.*` 覆盖；模块参数 schema 经 `schema <moduleId>`
自描述（§6）。

---

## 5. bench.*（生成器工作台 —— Agent 的域数据写面）

| 指令 | 功能 | 参数 |
|---|---|---|
| `bench.modules` | 模块清单 | — |
| `bench.presets.read` / `bench.presets.write` | presets.json 读/写（pins） | `moduleId`, `--json` |
| `bench.rules.read` / `bench.rules.set` | rules.json 读 / 单条写（`{doc}` 必填） | `moduleId`,`name`,`value` |
| `bench.layout.read` / `bench.layout.write` | layout.json 读/写（placement/relation/corners/features） | `moduleId`,`--json` |
| `bench.pins` | 对 presets.json 逐 preset 断言 pins（结构化 failures） | `moduleId` |
| `bench.baseline` | 抓当前 pin 面快照到文件（agent-run 在任务开始时自动做） | `moduleId`,`--path` |
| `bench.diff` | 当前输出 vs baseline（或 pins）的字段级差异，`effect.changes[].path` | `moduleId`,`--baseline` |
| `bench.presets.repin` | 只重写 `--allow` 正则覆盖的 pin；范围外漂移 → `scope_denied` 不落盘 | `moduleId`,`--allow` |
| `bench.rebuild` | `npm run build:generators`（job 级动词吃 renderer/gen bundle，改完 json 必须跑） | — |
| `bench.report.write` | 写报告 | `moduleId`,`markdown` |

Electron 宿主附加（raycast 需要）：`bench.screen-of` `bench.pick-face`
`bench.select` `bench.set-kind` … 详见 `window.__bench`（bench/bench.js 壳尾部）。

## 6. meta.*（协议自描述）

| 指令 | 功能 |
|---|---|
| `help [verb]` | 全部指令 / 单指令说明 |
| `schema <verb>` | 参数 JSON Schema（Agent 拿它构造调用，不猜） |
| `describe` | `getJobSummary` —— 当前 job 压缩快照 |
| `validate` | 与导出按钮同一道门 `{ok,fitIssues,generatorErrors}` |
| `diff` | 距上一 `mark` 的语义差异 |
| `dry-run` | `cli --dry-run <verb>`：执行→验证→回滚，返回预测回执不落盘 |
| `replay` | 调 `scripts/replay-omnicam.mjs` 跨仓回放 |

## 7. omnicam.*（OmniCam 侧，CLI 已有载体）

载体：`dotnet dotnet/tools/VerifyJob/bin/Release/net10.0/VerifyJob.dll` +
后续 `omnicam` 包装命令。

| 指令 | 功能 | 现状 |
|---|---|---|
| `omnicam import <file>` | cnjob/cut.json → CutPackage | `已实装`（VerifyJob 内部第一步） |
| `omnicam run <file.cnjob> [--json]` | 全管线：import→nest→ops→post→NC→verify | `已实装`（VerifyJob 单文件模式） |
| `omnicam run --demo` | 跑 public/samples 全部示例包 | `已实装` |
| `omnicam preflight` | NC 预检（刀具/行程/安全） | `约定`（拆自 RunPipeline） |
| `omnicam nest [--sheet WxL]` | 只排样 | `约定` |
| `omnicam verify <bundleDir>` | 已导出 bundle 复验 | `已实装`（VerifyJob `<dir>`） |
| `omnicam repair [--max-rounds N]` | RepairPlanner 白名单闭环 | `约定`（现有 IRepairPlanner 封装） |
| `omnicam golden.reseed <name>` | 金标重种子 | `约定`（包 CABINETNC_UPDATE_GOLDENS） |

gRPC（`cabinetnc.compute.v1` 命名管道）作为高级宿主存在：
`WorkerHealth.Ping` `Nesting.StartNesting` `Operations.GenerateOperations`
`PostProcessor.GenerateNc` —— CLI 覆盖 90% 场景，gRPC 留给长驻进程。

## 8. 执行控制（T05 安全门）

1. **白名单**：指令注册表是唯一入口——没注册的动词不存在，Agent 无法绕过。
2. **dry-run**：任何变更指令可 `--dry-run`，回执含预测 diff，不落 job。
3. **验证门**：变更指令回执必带 `validate`；`ok:false` 时 effect 仍返回便于诊断。
4. **撤销组**：`history.mark … history.commit` 把一批指令并为一步 undo。
5. **有界**：`cabinet.set-param` 只接受该模块 `schema` 已知的 key；
   未知 key 直接 `bad_args`。
6. **冲突不静默**：会产生重叠的变更默认 `conflict` 拒绝，`--force` 才走
   yield.prompt 路径。
