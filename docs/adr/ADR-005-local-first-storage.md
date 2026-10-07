# ADR-005：本地优先存储

**状态：Accepted**

## 决定

```text
本地保存成功
→ 尝试 Cloud Mirror
```

## 原因

Cloud 故障不能阻止本地设计。

## 影响

当前 Cloud Storage 为 Best-effort，不作为项目唯一数据源。
