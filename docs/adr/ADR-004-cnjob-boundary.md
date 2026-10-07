# ADR-004：cnjob 作为制造边界

**状态：Accepted**

## 决定

```text
Cab Lab
→ cnjob
→ OmniCam
```

Cab Lab 定义**制造什么**。

OmniCam 决定**如何制造**。

## 影响

Nesting、刀具、Toolpath、NC 不进入 Cab Lab。
