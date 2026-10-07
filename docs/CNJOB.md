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
