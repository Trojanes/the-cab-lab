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
