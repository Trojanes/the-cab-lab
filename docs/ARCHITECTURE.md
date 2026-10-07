# Cab Lab 架构

## 定位

Cab Lab 负责把设计意图转换为可制造板件。

```text
用户设计
→ Job
→ Generator
→ Board / Face / Feature
→ cnjob
→ OmniCam
```

Cab Lab 定义**制造什么**；OmniCam 负责 Nesting、CAM 和 NC。

## 核心模型

```text
Job
├─ Space
├─ Module
│  └─ Board
│     └─ Face
│        └─ Feature
├─ Wall
└─ Material / Finish
```

| 对象 | 职责 |
|---|---|
| Job | 项目设计状态 |
| Space | 空间与边界 |
| Module | 柜体/家具实例 |
| Generator | 参数生成板件 |
| Board | 实际制造板件 |
| Face | 表面与加工语义 |
| Feature | 孔、槽、开口等 |
| Wall | 独立空间构件 |

## 原则

- Job 保存设计意图，Generator 结果可重新生成。
- Board ID 应保持稳定。
- 外轮廓属于 Board，局部加工属于 Feature。
- 人工修改优先通过参数表达，必要时使用 Override。
- Generator 必须可测试、可重复。
- 制造错误阻止 cnjob 输出。

## 系统模块

```text
Electron     文件、窗口、IPC
Renderer     CAD 交互与显示
Generator    参数 → 板件
Bench        Generator 调试与验证
Cloud        可选远程存储
cnjob        OmniCam 制造接口
```

## 技术约定

- mm
- 右手坐标系
- Z 轴向上
- Electron + Three.js
- Generator 使用 TypeScript
