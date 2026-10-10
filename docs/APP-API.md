# Application API

> **2026-10-10**：此页只说明 `createApp()` 结构化 JS 入口；当前还有独立的 `renderer/commands.js` 注册表、`cli.mjs` 宿主命令与 `mcp.mjs`。完整现状见 [Agent 接口 v1](agent/INTERFACES-v1.md)，实施目标见 [v2](agent/INTERFACES-v2.md) 和 [PRD](agent/PRD-2026-10.md)。UI 仍有直接调用 `job.setParams()` 的路径，不应假定 UI/Agent 已统一接线。


> 原子指令集契约见 `docs/AGENT-COMMANDS.md`（T05：每个操作源一条指令 + CLI）。
> 本文件描述其下的结构化 JS 调用面。

`renderer/appApi.js` — the UI-free surface for driving a job. The same module
runs inside the Electron renderer and headless under Node (tests today, an
Agent Tool layer next). Every command returns a structured outcome:

```text
{ ok: true, ... }            — result payload on the key the verb documents
{ ok: false, error, extra? } — machine-readable failure, never a thrown stack
```

```js
import { createApp } from "./renderer/appApi.js";
const app = createApp();
```

## Reads

| Verb | Returns |
|---|---|
| `getJobSummary()` | `{ version, space, cabinets[{id, moduleId, pose, envelope, boardCount, errors, selected}], walls, planes, finish, stock, dirty }` — compact state for deciding the next call |
| `listModules()` | `[{ id, label, sub, panel, defaultSize, minSize }]` — what `addCabinet` accepts |
| `listSpaceKinds()` | `["box", "vehicle", ...]` — what `defineSpace` accepts |
| `serialize()` | the job.json string |
| `isDirty()` | unsaved-changes flag |

## Commands

| Verb | Effect | Notes |
|---|---|---|
| `reset()` | new empty job | |
| `loadJob(obj, {filePath?})` | contract-validate → migrate → load | same path as File → Open; violations return `ok:false` with `reasons` |
| `defineSpace(kind, params, {finish?, stock?})` | set the space | step one — cabinets need a space |
| `setMaterials(finish, stock)` | job-level carcass/door stock | omit either to keep current |
| `addCabinet(moduleId, {pose, size, params})` | place + generate | `size` = `{W,D,H}` mm; `params` replaces generated defaults |
| `updateCabinet(id, {params?, pose?})` | patch a cabinet | `params` **merges** into existing (job.setParams replaces wholesale — the API patches) |
| `removeCabinet(id)` | delete | |
| `undo()` / `redo()` | history | `{ applied }` |

`addCabinet` / `updateCabinet` results include `envelope`, `boardCount`,
`errors` (generator `validation.errors`), and `fits` — so a caller sees the
consequence of its command immediately.

## Generate / validate / export

| Verb | Returns |
|---|---|
| `generate(id?)` | boards + errors + grain/milling issues for one cabinet or all |
| `validate()` | `{ ok, fitIssues, generatorErrors }` — space fit, overlaps, wall legality, generator errors; the same gate the UI export button runs |
| `exportCnjob({jobId?})` | `{ ok, snapshot, boardCount, materialIds }` or `ok:false` with `reasons` — identical inputs to the UI export path |

## Example session

```js
app.defineSpace("box", { width: 4000, depth: 2600, height: 2400 });
const c = app.addCabinet("kitchenCabinet", { pose: { x: 0, y: 16 }, size: { W: 887, D: 270, H: 880 } });
if (!c.ok || c.errors.length) /* react */;
const check = app.validate();          // { ok: false } — inspect fitIssues
const out = app.exportCnjob();         // { ok: true, snapshot } → hand to OmniCam
```

## Layering

```text
appApi.js  — stable verbs, structured results (THIS file is the agent contract)
  ├─ job.js       — job.json store, commands, history, migrate+contract on load
  ├─ fit.js       — space-fit legality (envelope/footprints/overlaps/statusOf)
  ├─ modules.js   — module catalogue → generators (renderer/gen bundles;
  │                 pure helpers re-exported from modules/stackFit.js, modules/fridge.js)
  └─ gen/cnjob.js — boards → manufacturing snapshot
```

DOM / THREE / Electron live below this line **nowhere**: `3d`, `snap`,
`interact`, `panel`, `floorplan`, `ui` are display+input only.
