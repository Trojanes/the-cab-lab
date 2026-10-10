# Cab Lab Agent 接口 v2 — 目标契约（未实现）

> 状态：TARGET / 本文件定义下一阶段开发验收，不代表代码已具备。基于 `devops@6725ae2f`；v1 实际能力见 [INTERFACES-v1.md](INTERFACES-v1.md)。不得改 `job.json`、Board 或 `cnjob 1.1` 的结构来迁就 Agent。

## 1. 设计约束

1. **复用 v1 的 `renderer/commands.js` 业务动词**，不要并行造第二套设计模型；UI、CLI、MCP 逐步使用同一 `invoke` 语义。
2. 只通过 Application/Command 层改 Job，禁止直接改存档 JSON 或生成器输出板件。
3. 默认本地执行、可审计、可撤销；AI 不直接写 CNC 指令或执行机床发送。
4. v2 必须兼容现有 `cli.mjs` / `mcp.mjs` 常用动词；扩展以新能力/字段为主，不静默修改旧业务语义。

## 2. v2 需要补齐的接口能力

| 编号 | 目标接口/能力 | 输入/输出要点 | 验收 |
|---|---|---|---|
| C-A01 | `invoke` 严格执行策略 | `verb,args,mode,expectedRevision,operationId` → 一致回执 | 错参不修改状态；异常恢复；revision 冲突拒绝 |
| C-A02 | 原子批处理（v1 `cablab_batch` 升级） | `ops[],atomic:true` → `receipts[],committed` | 第 N 步异常或拒绝，整批回滚 |
| C-A03 | 结构化校验与异常码 | `ok,validation:{ok,issues[]},error:{code,message}` | 不把 `validate.ok:false` 当成完成；允许 UI 明确请求“未完成草稿态”，禁止制造导出 |
| C-A04 | 真正的 `.cnjob` 文件产出 | `jobId,path` → `artifactPath,sha256,schemaVersion` | 文件为 ZIP，含 manifest/snapshot，OmniCam 可导入；不再输出伪 ZIP |
| C-A05 | Agent 操作上下文 | `actor,taskId,allowedVerbs,allowedPaths,maxOps,maxDuration` | 调用前校验；包含拒绝操作的不可篡改运行记录（本地最小实现） |
| C-A06 | Generator 安全修改流程 | `moduleId,changeRequest,allowedDiffPaths,expectedChecks` | 捕获 baseline → 修改 → pins + 完整 Snapshot Diff → tests → 提交 Troy 审核 |
| C-A07 | 稳定机器可读描述 | `listVerbs` / `verbSpec` → JSON Schema + `mutates` / `risk` | 全部公开动词的必填、类型、范围均可自动验证 |
| C-A08 | UI 接线 | 主流 UI 编辑入口调用相同 Command Handler | 对比 UI / CLI 对同一输入生成一致 Job + Snapshot |

**仅约定的 v2 回执样例**（字段可扩展；不允许省略验证/修订）：

~~~json
{
  "ok": true,
  "apiVersion": "2",
  "operationId": "op-123",
  "revision": 12,
  "effect": {},
  "validation": {"ok": true, "issues": []},
  "diff": [],
  "auditId": "run-123"
}
~~~

约定错误码：`invalid_args`、`not_found`、`revision_conflict`、`scope_denied`、`validation_blocked`、`rollback_failed`、`internal`；必须保留可机器解析的稳定 `code`，不可仅返回自然语言。

## 3. 重点安全语义

- **两级结果**：调用是否成功（`ok`）和制造/空间是否合法（`validation.ok`）。Agent 默认在最终状态不合法时回滚并失败；UI 的中间草稿态必须显式区分且永远不能导出制造文件。
- **原子性**：命令异常、参数拒绝、校验拒绝及磁盘写失败时，Job/撤销栈与相关持久化数据有明确恢复策略；需要对 v1 `history.begin/end` 兼容。
- **最小权限**：`READ` / `EDIT` / `MANUFACTURE_PREVIEW` 分级。产品 Agent 不得获取源码修改、任意文件路径和机床控制权。
- **Golden 无自动放行**：`bench.presets.repin` 必须先提供变更理由和精确范围；代码/文件修改工作区隔离，测试由独立验证流程运行，不能让 Agent 自己改通过标准。
- **几何完整性**：Pins/Diff 补上 `centerline` 等槽/孔/轮廓关键制造字段，跨 Snapshot/NC 回放不得因小字段未 pin 而遗漏。
- **制造边界**：Job→Board→`cnjob 1.1` 的契约不变，任何新增云/远程执行必须仍走现有 export/validation gate。

## 4. 交付次序

`C-A01/A02/A03`（回滚与验证）→ `C-A04`（真 ZIP）→ `C-A06`（完整 Generator 差异）→ `C-A05/A07`（受限 Agent 工具）→ `C-A08`（增量 UI 接线）。

实现任务、禁止事项及验收命令以 [PRD-2026-10.md](PRD-2026-10.md) 为准。
