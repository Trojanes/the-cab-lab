# 测试

## 层级

### Unit Test

验证单个算法。

### Generator Golden Test

固定输入，验证：

- Board ID
- 数量
- 尺寸
- 位置
- 材料
- 加工 Feature

### Contract Test

验证 `job`、`cnjob` 等核心数据结构。

### Integration Test

```text
Cab Lab
→ cnjob
→ OmniCam
```

验证数据可以完整进入后续制造流程。

## 原则

- Bug 修复尽量增加回归测试。
- Generator 规则变化必须被测试发现。
- 核心 Contract 修改必须运行集成测试。
- 制造相关测试失败不得作为可信版本发布。

## 当前实现

### Cab Lab（`the-cab-lab`）

```bash
npm run test:generators   # 全部生成器 golden/pin + 契约测试（含下方三个）
npm run test:job          # job.json 契约：v1 回放 + v2 + 违例拒绝
npm run test:replay       # 跨仓冒烟：重发 kitchen.cnjob → OmniCam 全管线
```

- `generators/_lib/golden.test.ts` — 确定性回放：同一参数再生成必须与
  `fixtures/snapshot/kitchen-ok.json` 逐字节一致（`exportedAt` 除外）。
- `generators/_lib/snapshotContract.test.ts` — snapshot 契约：11 类违例
  fixture 必须报出对应错误码。
- `generators/_lib/boardContract.test.ts` — Board/Feature 不变量。
- `renderer/jobContract.test.js` — 加载链校验。
- `scripts/emit-replay-cnjob.mjs` — 发射 `fixtures/replay/kitchen.cnjob`
  （真实 zip，manifest + snapshot）。契约变更时先 `--check` 确认漂移，
  再重新发射并同步到 `cabinetnc-cut/dotnet/tests/testdata/regression/packages/`。

### OmniCam（`cabinetnc-cut`）

```bash
dotnet test dotnet/tests/CabinetNC.Domain.Tests --filter "Category=GoldenRegression"
dotnet dotnet/tools/VerifyJob/bin/Release/net10.0/VerifyJob.dll <job.cnjob>
```

- `cab_lab_kitchen` golden（`testdata/regression/goldens/`）= 跨仓契约回放：
  Cab Lab 真实 `.cnjob` → 导入 → 排料 → 刀路 → NC → 验算，全链 pin 住。
  变更须 `CABINETNC_UPDATE_GOLDENS=1` 显式更新，禁止静默漂移。
- `VerifyJob <file.cnjob>` 单文件全管线模式（T02 新增）。

### 待确认（Troy）

- `groove_width_mismatch`：`B3_LED_MAIN` LED 槽 CAD 14.5mm → 实际加工 16mm
  （超切 1.5mm）。已在 golden 中 pin 住。
- Ø4/Ø5 刀具空档：demo fixture 的孔径 vs `ToolCatalog`（同前，刀具目录决策）。
