# cnjob

`cnjob` 是 Cab Lab → OmniCam 的制造接口。

```text
Cab Lab
→ cnjob
→ OmniCam
```

## 文件

```text
job.cnjob
├─ manifest.json
└─ snapshot.json
```

当前：

```text
schema: cabinetnc.manufacturing-snapshot
version: 1.1.0
unit: mm
```

## Cab Lab 输出

每块 Board 对应一个 Workpiece，包含：

- ID / Module / Role
- 材料与厚度
- 外轮廓
- A / B 面
- 饰面与木纹
- 封边
- 孔 / 槽 / Pocket / Cutout
- 加工面

## OmniCam 决定

- Nesting
- 库存板
- 刀具
- Feed / RPM
- Toolpath
- Post Processor
- NC / G-code

## 规则

- 一个 Board 对应一个稳定 Workpiece。
- 制造 Error 时禁止导出。
- 隐藏板件仍参与制造。
- 协议变更必须版本化。

## 运行时校验（T01）

导出链路在三个层级做结构化校验，与 OmniCam `ManufacturingSnapshotImporter` 的硬性规则对齐：

- `renderer/jobContract.js` — `loadJob` 加载时：先 `validateJobInput`（迁移前，只查 migrate 会解引用的字段 + 已知 moduleId），再 `migrate`，再 `validateJobV2`（版本 / units / space.kind / cabinet 结构）。违例拒绝载入并记入 `file.open.rejected`。
- `generators/_lib/boardContract.ts` — Board/Feature 不变量：外轮廓 ≥3 点 / 有面积 / 有限坐标，纹理板必有纹理方向；加工特征（groove / tgroove / hole / cutout）的深度、孔心孔径、槽宽、轮廓齐备。`buildCnjob` 复用同一检查器。
- `generators/_lib/snapshotContract.ts` — 发射后的 snapshot 全量校验：schema/版本、材料、轮廓绕向、特征 id 唯一、盲特征单面、深度 ≤ 板厚、EITHER 语义、面权限、封边索引。错误并入 `buildCnjob` 的 reasons 阻止导出；警告照常透出。

Fixture 回放：`fixtures/job/`（v1 旧档 + v2 + 违例）、`fixtures/snapshot/`（真实导出 + 11 类违例），分别由 `renderer/jobContract.test.js` 和 `generators/_lib/snapshotContract.test.ts` / `boardContract.test.ts` 断言。

job.json 的权威契约文档：`docs/job.schema.json`；snapshot 的权威契约在 OmniCam 仓 `docs/manufacturing-snapshot-v1.schema.json`（v1.1）。
