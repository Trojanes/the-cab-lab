# Agent Playbook — Cab Lab 操作手册

写给驱动 Cab Lab 的 Agent。协议细节见 `docs/AGENT-COMMANDS.md`（商业级契约），
本文档是**怎么把活干对**的实操手册：连接方式、标准工作流、门禁规则、反模式。

## 0. 连接方式（二选一）

| 方式 | 用法 | 适合 |
|---|---|---|
| **MCP server** | `node mcp.mjs`（stdio）——client 配置：`{"mcpServers":{"cablab":{"command":"node","args":["<repo>/mcp.mjs"],"cwd":"<repo>"}}}` | Cursor/Devin/Claude 等 MCP client |
| **CLI 直连** | `node cli.mjs <verb> --k v --json` / `--repl` / `--batch ops.jsonl` | 任意 shell 权限的 Agent |

两条路共用同一个会话文件 `.cablab-session.json`（cwd 下）——**混用是安全的**，
MCP 进程内存态与 CLI 单发调用经文件衔接。

### MCP 工具面（5 个）

| tool | 作用 |
|---|---|
| `cablab_verbs` | 列全部 92+ 动词 |
| `cablab_schema` | 某动词的参数 spec（用前必查） |
| `cablab_status` | job 快照：空间/柜/墙/面/finish/dirty |
| `cablab_invoke` | 执行一个动词 → 回执（含 dryRun 预览） |
| `cablab_batch` | 顺序执行一组动词，首个失败即停 |

## 1. 会话模型

- **一个进程 = 一个 job**。`file.new` 开新档，`file.open --path x.job` 读档，
  `file.save --path x.job` 写档（host 动词）。
- 每个 mutation 动词成功后自动持久化会话；`dryRun:true` 不碰会话也不碰 undo 栈。
- 回执统一 `{ok, verb, effect, validate, diff, undoGroup, error, code}`。

## 2. 标准工作流（照着走）

### 2.1 从零做一个柜子

```
file.new                                    # 清空会话
space.define --kind box --params {"width":4000,"depth":2600,"height":2400}
                                            # 空间必须先定义——一切合法性以它为基准
cabinet.add <moduleId> --x 0 --y 16 --z 0 --rotZ 0 --W 887 --D 570 --H 880
                                            # pose/尺寸是平铺参数；--params 是模块参数 JSON patch
validate                                    # 全量体检（也可只看回执里的 validate）
file.export-cnjob --path out.cnjob          # 导出制造数据
omnicam.run --file out.cnjob                # 制造验证（VerifyJob 全管线）
```

模块 id 枚举：`module.list`；某模块的参数面：`module.schema --moduleId`。

### 2.2 改一个已有柜

```
cablab_status                               # 先读快照，别瞎猜 id
cabinet.get <id>                            # 拿全量 params
zone.list --id <cabId>                      # zone/column 的真实 id（z1/c1 这类，不是 zone-1）
cabinet.set-param <id> --key k --value v    # 单参数改
# 或 zone.* / kitchen.* / tall.* / fridge.* / ohc.* / lounge.* 专属动词
```

### 2.3 试探性改动（强烈推荐）

```
cablab_invoke {verb, args, dryRun:true}     # 回执给 effect+validate+diff，不落地
```

dry-run 是 Agent 最重要的安全工具：**先看 diff 和 validate 再决定真改**。

### 2.4 一串改动当成一步撤销

```
history.begin                             # 开撤销组（无参数）
...若干动词...
history.end                               # 整组成为一步 undo
```

### 2.5 出错了

- `ok:false` + `code` ∈ `bad_args | unknown_id | blocked | conflict | internal`
- `blocked` = 业务拒绝（贴墙/重叠/小于最小值/attached 模块）——**换参数重试**，
  不要原样重发
- `conflict` = 与现有对象冲突，回执带细节
- 撤销：`history.undo`；查栈：`history.can-undo` / `history.can-redo`

## 3. 硬规则（违反 = 改错数据）

1. **先看 validate 再继续**。每个 mutation 回执内建 validate 门
   （fitIssues + generatorErrors）。出现红字先修，不要在脏状态上继续叠。
2. **空间先于柜子**。`space.define` 之前 `cabinet.add` 无意义。
3. **不要绕过门禁**。`file.export-cnjob` 经 buildCnjob 契约校验——生成器错误或
   fitIssues 未清会以 `code:"contract"` block，这是设计意图，修问题不要找旁路。
4. **几何单位永远是 mm**，Z 向上，原点在空间前左下角。
   `pose.rotZ` 以 90° 步进（Face 语义）；任意角度只有 free move 给出。
5. **模块专属动词语义** ≠ UI 手势翻译。`zone.drag-boundary` 的参数是
   "第 N 边界到 X mm"，不是模拟拖拽轨迹。
6. **attached 模块**（bedBox/bedSideTable）不能 move/orient——回执
   `blocked{reason:"attached"}`，跟随母体。
7. **改 bench 生成器规则**走 `bench.rules.set` / `bench.layout.write` +
   `bench.diff` 语义 diff——**别直接写 generators/*.json**，那是数据文件。

## 4. 反模式（见过会挂的做法）

- ❌ 一次 invoke 里塞"做完整个厨房"的复合意图 → 拆成逐动词调用，每步看回执
- ❌ 失败后原参数重发 → 读 error.code 与 effect 里的拒绝原因
- ❌ 凭记忆猜模块参数名 → `module.schema` / `cablab_schema` 查
- ❌ 在 undo 栈上叠 dry-run 后当真值用 → dry-run 不落地，状态无变化
- ❌ 跳过的 validate 红字攒着最后看 → 红字会叠加扩散，越早修越便宜
- ❌ 手写 job.json 字段塞给 file.open → 走动词；job 有 schema 校验

## 5. 边界（这些走不通，别试）

- 新增柜型 / 写 generator.ts 公式 —— 走 generators 的 T 系列开发流程，不动词
- Electron 内嵌 `window.__app.invoke` —— 契约已定待接线，MCP/CLI 已可用
- omnicam 分步动词（preflight/nest/repair）—— `omnicam.run` 整管线可用，分步待接
- `bench.screen-of` / `bench.pick-face` —— 需要活 app 的 raycast，仅 Electron 宿主

## 6. 任务运行（agent-run）——受控执行 + 审计

`scripts/agent-run.mjs` 是任务的执行壳：任务单限定动词面（`allow` 前缀，
越界即 `scope_denied`）、操作预算（`maxOps`）、验收断言（`accept`），
全程写 `logs/agent/<id>-<ts>/transcript.jsonl` + `run.json` + `report.md`。

```bash
node scripts/agent-run.mjs start  agent/tasks/<x>.task.json   # 建运行目录 + 打开 input
node scripts/agent-run.mjs exec   <runDir> <verb> [args…]     # 逐动词执行（回执同 CLI）
node scripts/agent-run.mjs finish <runDir>                    # 跑 accept，exit 0/1
```

任务单示例见 `agent/tasks/fix-overlap.task.json`。规则：修 job 的任务
不给 `bench.*`；改生成器数据的任务才有 `bench.rules.set` 等。审计文件
是 REGRESSION-LOG 生态的一部分——agent 修好的场景顺手 `--pin` 成 fixture。

`node scripts/agent-run.mjs check <task.json>` 是任务单体检查：
必填字段形状、`input` 文件存在、`writes` 正则合法、proposal 形状、
以及「声明了红前置就必须有 validate 验收」的红绿配对。`test:agent`
对 `agent/tasks/` 全部任务单跑 check——任务目录本身被钉住。

### 6.0 Bug 任务（修 job，不动生成器）

Bug 任务的契约是**红→绿弧线**，由任务单两个字段声明：

```json
"precondition": [{ "verb": "validate", "expect": "effect.ok", "negate": true }],
"accept":       [{ "verb": "validate", "expect": "effect.ok" }, { "verb": "file.export-cnjob" }]
```

- `precondition` 在 start 时逐条执行（在 input 打开之后）：`negate:true`
  表示断言**必须不成立**——fixture 此刻是坏的。前提不满足 → start 直接
  中止（`code:"precondition"`），这是**任务单畸形**，不是 run 判负：
  一个修 bug 任务在好 fixture 上"通过"毫无意义。
- `accept` 是修复后的绿断言，和普通任务一致。
- Review 侧 `precondition` 检查要求 transcript 里有等量的全绿前置条目——
  伪造 transcript 跳不过：没有验证过「之前是坏的」，之后的绿不可信。

任务目录（每个都在 `test:agent` 里跑真实 start→修复→finish 全链）：

| 任务 | bug 类 | fixture | 报错 |
|---|---|---|---|
| `fix-overlap` | 出界 | `case-overlap.json` | `cab-2 is outside the space` |
| `fix-cab-overlap` | 柜间重叠 | `case-cab-overlap.json` | `cab-1 overlaps cabinet cab-2` |
| `fix-wall-overlap` | 横穿隔墙 | `case-wall-overlap.json` | `cab-2 overlaps partition wall-1` |
| `fix-zone-height` | 生成器错误 | `case-zone-height.json` | `Zone zone-2 height must be > 0` |

写新 bug 任务 = 新 fixture（确认 `validate` 单独报这个错）+ 任务单
（precondition 红 + accept 绿 + 最小动词面）。**注意**：`validate` 只管
fit/generator 错误——attach 模块间的"重叠"按设计不报（`cabinetHits`
过滤 attach），尺寸下限是模块 schema 约束不在 validate 面，不要为
不存在的检查编 bug 类。

### 6.1 Generator 任务（改 rules/layout，不动 generator.ts）

任务单加 `"generator": "<moduleId>"`：start 时把该模块全部 preset 的
pin 面抓进 `run.json` 旁的 `baseline.json`，运行中 `bench.diff` 自动
以它为基准（`CABLAB_RUN_DIR` 注入，agent 无法伪造基准）。

标准循环（pilot: `agent/tasks/kitchen-strip-width.task.json`）：

```
bench.rules.read <mod>                      # 读规则+doc
bench.rules.set  <mod> --name X --value V   # 改常量
bench.pins     <mod>                        # 红了——pin 面差异=预期漂移
bench.diff     <mod>                        # 字段级 diff，逐条 {path,from,to}
bench.presets.repin <mod> --allow <regex>   # 只重写范围内的 pin；
                                            # 范围外漂移 → scope_denied 不落盘
bench.pins     <mod>                        # 转绿
finish                                      # accept 判定
```

accept 除 `expect:"ok"` / 字段路径外支持 `expect:"diff.scope"`：
diff 的每条 `path` 必须匹配 `scope` 正则之一，`mustChange` 拒绝空 diff。

边界：`presets.write`（全文件覆写）默认不给——pin 是期望值，改了等于
自己改考卷；重钉只能走 `presets.repin`（只允许声明过的路径动）。
`layout.write` 是全文件级，T2 任务先打 diff 再人工审。

### 6.2 Review —— 独立复核（不信 run.json 自己的判定）

`scripts/agent-review.mjs` 对一个 run dir 做**事后独立审计**：harness 的
verdict 只是"执行时没被抓到"，review 是"轨迹本身经得起重验"——

```bash
node scripts/agent-run.mjs  review <runDir>    # 或 scripts/agent-review.mjs <runDir>
```

判定三档，**只有 `approved` 算过**（exit 0；其余 exit 1）：

| 检查 | 级别 | 含义 |
|---|---|---|
| `verdict` | block | run.json 自报 PASS |
| `scope` | block | 每个**已执行** op 的动词 ⊆ `task.allow`（伪造 transcript 在这道门翻船） |
| `budget` | block | agent ops ≤ `maxOps` |
| `accept` | block | accept 断言**当场重跑**——不信用 run.json 缓存的判定 |
| `diff.scope` | block | generator 任务：`bench.diff` 现场重算，漂移 ⊆ 声明 scope |
| `denials` | warn | 被拒 op > 0：探围栏不违规，但值得人看一眼 |
| `vacuous` | warn | 0 个 agent op 却 PASS——空过 |
| `files` | block（可选） | 任务单声明 `writes` 正则时，`git status` 脏文件 ⊆ 白名单 |
| `judge` | warn（接缝） | `--judge x.mjs` 外挂语义判定：`default async (evidence) → {verdict, reasoning}`，**只能降级不能升级** |

结果写 `review.json` / `review.md` 进 run dir。三档语义：
`approved` 可发布 · `needs_human` 机械全绿但有值得看的痕迹 ·
`validation_blocked` 有硬违规。LLM 语义层经 `--judge` 挂点接入，
永远只能把好结果拉下来，不能把烂的顶上去。

### 6.3 Generator 任务加 `proposal` —— 先声明意图，再动手

Generator Agent 的完整回路由**提案文件**驱动：任务单里的 `proposal`
块是 Agent 在动手前写下的"我要改什么"，之后每一道门都拿运行实况
对照这份声明——而不是事后看 diff 猜意图。

```json
"proposal": {
  "changes": [
    { "surface": "rules", "name": "SUPPORT_STRIP_WIDTH",
      "from": 100, "to": 95, "reason": "收窄支撑条 5mm" },
    { "surface": "layout", "reason": "…" }
  ],
  "scope": ["^kitchen-base\\.(B3|T1-1)\\."],
  "maxChanges": 60
}
```

- **start**：快照每个声明规则的现值进 `run.proposalBase`
- **exec**：`bench.rules.set` 只许碰声明过的 name，未声明 → `scope_denied`；
  `bench.layout.write` 需要声明过 layout 变更才放行
- **finish/review**：四道闸门自动跑——
  `stale`（声明 `from` ≠ 快照值 → 心智模型错了，拒）·
  `applied`（声明 `to` 未落地）· `scoped`（漂移路径 ⊆ scope）·
  `bounded`（漂移条数 ≤ maxChanges）

范式任务单：`agent/tasks/kitchen-strip-width.task.json`。标准循环：
`rules.set` → `pins`（红=预期漂移）→ `diff` → `presets.repin --allow <scope>`
→ `pins`（绿）→ `finish` → `review`。实测：60 处漂移全落 scope，
finish 6 项全过，review approved。

`writes`（可选）：任务单声明允许改动的仓库路径正则数组，review 时
`git status` 脏文件必须 ⊆ 白名单（logs/、.cablab-session 豁免）——
抓绕过动词面直接写文件的行为。
