# ADR-001：Space First

**状态：Accepted**

## 决定

所有设计先定义 Space。

```text
Space
→ Module
→ Board
```

## 原因

空间直接约束放置、尺寸、墙体、Roof 和碰撞。

## 影响

Space 是 Job 的一级对象。
