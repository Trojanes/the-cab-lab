# Cab Lab

Cab Lab 是木工设计端软件，目标是将空间和家具设计转换为可制造板件。

```text
用户设计
→ Cab Lab
→ cnjob
→ OmniCam
→ CNC
```

- **Cab Lab**：设计、板件、材料、加工意图
- **OmniCam**：Nesting、CAM、NC、机床

## 团队

- **Troy**：木工领域、产品、CAD、Generator、制造验证
- **Zyn**：软件架构、测试、平台、Cloud、集成、工程流程

## 文档

| 文件 | 内容 |
|---|---|
| `STATUS.md` | 当前进度 |
| `READING-GUIDE.md` | **先读这个**——路由索引 + AI/开发者检索规范（含 MODULE-MAP） |
| `DEV-LOOP.md` | **动手前读**——开发执行手册：每次改动必须过的 verify 门禁 |
| `ARCHITECTURE.md` | 系统结构 |
| `CNJOB.md` | Cab Lab → OmniCam 接口 |
| `TESTING.md` | 测试原则 |
| `adr/` | 关键架构决定 |
| `*-spec.md` | 具体 Generator / 模型规则 |

建议阅读顺序：

```text
README
→ READING-GUIDE   (定位东西)
→ DEV-LOOP        (动手开发 / AI 改代码前必读)
→ STATUS
→ ARCHITECTURE
→ 按需要阅读其他文档
```
