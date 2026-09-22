# 吊柜（Overhead Cabinet）逻辑规格 — cleanroom 重实现提取

> 目的：从既有实现提取**行为与逻辑规格**（不含实现代码），供不照搬代码的重新实现使用。
> 验收方式：数值对拍（golden preset + pins，0.01 mm），与代码来源无关。
> 本文事实来源：需求语义（README/规格文档）、常量与钉值（数据）、接缝声明（结构描述）。
> 验收基准以当前 presets.json 的钉值为准（T3/T4 位置按装配修正）。

---

## 1. 模块定位

- 吊柜：从天花板吊挂、背板贴墙、门朝房间内开。
- 外包络（box）= 生成器外部尺寸：箱体含柜身 + 顶部 40 mm 结构 + 门厚（box 深度 = 柜身深 + 门厚，与 Small 柜一致）。
- 门按设计低于包络下沿 30 mm 悬挂。
- 顶面贴天花板（盒子只向下生长）；W 沿墙走向。
- 非门板全部柜身料（carcass stock），门为门板料（door stock）。

### 坐标约定（Cab Lab 全局契约）

- 毫米，Z 向上，右手系，原点在空间左前下角。
- 柜体局部原点：前柜身面、地板高度；**前脸在局部 −Y**。
- 板件输出采用最终装配位（boardFrame "final"）；所有板在柜体局部坐标系中给出 x0..z1。

## 2. 输入参数

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| cabinetWidth (W) | 是 | — | 包络宽（沿墙） |
| cabinetDepth (D) | 是 | — | 包络深（含门厚） |
| cabinetHeight (H) | 否 | 见规则 | 包络高；从天花板向下量 |
| style | 否 | style_1 | style_1 / style_2（顶部结构差异） |
| zones[] | 否 | — | 分区表：`{ type: up_flap \| fixed_panel \| open, width }`，宽度和必须 = W |
| internalDividerCenterlines[] | 否 | — | 分隔件中心线（旧式输入；无 zones 时按中心线切分区，类型交替 up_flap/fixed_panel） |
| topClearanceHeight (TCH) | 否 | 40 | 顶部隐藏轨区域高 |
| frontPanelThickness (FPT) | 否 | 16 | 门板厚 |
| featureWidth (CPT) | 否 | 15 | 柜身板厚（分隔件/底板等） |
| clearance | 否 | 2.5 | 相邻门缝与柜边缝 |
| hingeHoleDiameter/Depth | 否 | 35 / 12 | 铰链杯 |
| hingeHoleFromTop/FromSide | 否 | 22.5 / 100 | 铰链杯定位 |
| bottomThickness | 否 | = CPT | 底板厚（旧别名） |
| dividerTongueHeight / routerDiameter | 否 | 15 / 10 | 旧别名 |

## 3. 规则常量（rules.json 全量，数据非代码）

| 常量 | 值 | 语义 |
|---|---|---|
| DIVIDER_THICKNESS_MM | 15 | CPT 缺省：柜身/分隔件板厚 |
| FEATURE_CLEARANCE_MM | 1 | 槽宽余量：槽 = CPT + 此值 |
| DEFAULT_ROUTER_DIAMETER_MM | 10 | 铣刀直径假设 |
| BOTTOM_THICKNESS_MM | 15 | 旧入口底板厚 |
| T1_HEIGHT_MM | 40 | TCH 缺省：顶部隐藏轨高 |
| T3_DEPTH_MM | 90 | 顶后板从前量深度，坐在分隔件前台阶里 |
| T3_THICKNESS_MM | 15 | T3 厚（旧预览） |
| T3_NOTCH_DEPTH_MM | 20 | T3 让位每个分隔件的缺口深 |
| T4_THICKNESS_MM | 15 | T4 厚（旧预览） |
| T4_HEIGHT_MM | 50 | 分隔件后缺口上的竖顶板 T4 高 |
| T4_NOTCH_HEIGHT_MM | 20 | T4 让位分隔件的缺口高 |
| T4_SCREW_HOLE_NOTCH_CLEARANCE_MM | 8 | T4 螺丝孔离缺口余量 |
| T4_SCREW_HOLE_UP_SHIFT_MM | 10 | T4 螺丝孔上移 |
| FRONT_TOP_NOTCH_Y_OFFSET_MM | 70 | 分隔件前顶缺口起始 Y（style 1） |
| FRONT_TOP_STEP_Y_MM | 10 | 分隔件前台阶 Y 向延伸 |
| SCREW_HOLE_DIAMETER_MM | 3 | 面板螺丝导孔径 |
| SCREW_HOLE_DEPTH_MM | 15 | 螺丝导孔深 |
| DEFAULT_FRONT_PANEL_THICKNESS_MM | 16 | FPT 缺省 |
| DEFAULT_CLEARANCE_MM | 2.5 | 门缝缺省 |
| DEFAULT_HINGE_HOLE_DIAMETER_MM | 35 | 铰链杯径 |
| DEFAULT_HINGE_HOLE_DEPTH_MM | 12 | 铰链杯深 |
| DEFAULT_HINGE_HOLE_FROM_TOP_MM | 22.5 | 杯心距门上沿 |
| DEFAULT_HINGE_HOLE_FROM_SIDE_MM | 100 | 杯心距门侧沿 |
| LED_GROOVE_WIDTH_MM | 14.5 | LED 插槽宽 |
| LED_GROOVE_DEPTH_MM | 6.5 | LED 插槽深 |
| LED_GROOVE_FRONT_LAND_MM | 18 | T3 前沿到主槽近壁净条 |
| LED_GROOVE_BRANCH_END_INSET_MM | 80 | T 型支路中心距两端缩进 |
| RANGEHOOD_CUTOUT_WIDTH_MM | 555 | 油烟机 BP 开孔宽 |
| RANGEHOOD_CUTOUT_DEPTH_MM | 285 | 油烟机 BP 开孔深 |
| RANGEHOOD_MIN_EDGE_MM | 40 | 开孔四周最小留料 |
| RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM | 75 | BP 顶到插入件顶净高缺省 |

## 4. 板件清单（逻辑推导）

| id | 名称 | 料 | 平面/厚轴 | 几何逻辑 |
|---|---|---|---|---|
| BP | Bottom Panel 底板 | carcass | XY / Z | 全幅 W×D；z ∈ [0, CPT]（厚 = CPT） |
| T1 | Top Front Rail 顶前轨 | door | XZ / Y | 前脸处 y 全 FPT；z ∈ [H−TCH, H]；厚 FPT |
| T2 | Top Front Rail 顶前轨2 | carcass | XZ / Y | 紧贴 T1 之后 y ∈ [FPT, FPT+CPT]；同 z 段；厚 CPT |
| T3 | Top Rear Panel 顶后板 | carcass | XY / Z | 从前面量深 T3_DEPTH_MM(90)；z 顶 = H − TCH − 1（留 1mm 缝于轨下）；轮廓按分隔件修剪（XY 轮廓向量） |
| T4 | Top Front Panel 顶前板 | carcass | XZ / Z | 竖顶板，置于分隔件后缺口上，高 T4_HEIGHT_MM(50)；style 相关 |
| D0..Dn | Divider 分隔件 | carcass | YZ / X | x = 中心线 ± CPT/2（板身；槽/缺口用 CPT+1 宽）；z ∈ [2·CPT, H+CPT]（坐于底板抬升面，顶部插入顶板结构）；侧视轮廓含舌片（入 BP）、T3 台阶、T4 后缺口 |
| FP0..FPn | Front Panel 门板 | door | XZ / Y | 按分区 x 段（含 2.5 缝）；z 覆盖门高，整体低于包络下沿 30 mm；up_flap 带铰链杯 |
| RGHD_TOP | 油烟机顶板 | carcass | XY / Z | 仅油烟机配置：BP 上方，内分隔件立于其上 |

要点：
- 分隔件**实体厚 = CPT**，但入槽特征（BP 槽、缺口）用槽宽 CPT + 1。
- 分隔件 z0 = 2·CPT：底板顶面再抬一块（原始后处理为 +2·FGw 平移，实现时应直接烘焙进坐标）。
- 门侧选择在创建盒子时决定（不得朝墙/邻柜）。

## 5. 面层特征挂载（model-spec 语义）

| 特征 | 挂载面 | 类型 | 尺寸/定位 |
|---|---|---|---|
| 分隔件槽 BG_D<i> | BP.A | groove | 槽宽 CPT+1；for: D<i> |
| 油烟机开孔 | BP.A | cutout（through） | 555×285，最小边缘 40 |
| 分隔件舌片 | D<i>.E*（v<0 段） | tongue 标签 | 入 BP，轮廓即真值 |
| T3 台阶（分隔件前） | D<i>.E* | notch 标签 | T3 座位 |
| T4 后缺口 | D<i>.E* | notch 标签 | 高 20 |
| 油烟机侧槽 | D<i>.A / .B | groove | 油烟机配置时 |
| 螺丝导孔 T2SH/T3SH/T4SH_D<i> | T2.A / T3.A / T4.A | hole（through） | ⌀3 深 15；T4 孔上移 10、离缺口 8 |
| LED T 型槽 | T3.A | tgroove ×3 | 宽 14.5 深 6.5；主槽前留 18；支路距两端 80 |
| 铰链杯 | FP<i>.A（背面 +Y） | hole | ⌀35 深 12；距上 22.5 距侧 100 |
| 内分隔件槽 | RGHD_TOP.A | groove | 油烟机配置时 |

## 6. 接缝声明（结构关系，声明式数据）

| 关系 | 类型 | 几何 | 允许五金 |
|---|---|---|---|
| BP ↔ D0（后部分隔件） | structural_butt_joint | edge_to_surface | screw_hole |
| BP ↔ FP0（背对门） | structural_butt_joint | edge_to_surface | screw_hole |
| D0 ↔ FP0（分隔件对门） | structural_butt_joint | edge_to_surface | screw_hole |
| T1 ↔ T2（顶轨叠放） | face_contact | surface_to_surface | — |

（声明按现存板件过滤生效。）

## 7. 校验规则

- cabinetWidth / cabinetDepth 必须为正数。
- cabinetHeight 提供时必须为正。
- 分区（Cab Lab 端）：每区 ≥ 150 mm，总和恒 = W。
- 油烟机开孔四周留料 ≥ RANGEHOOD_MIN_EDGE_MM。
- 门侧不得朝墙或邻柜（交互层保证）。

## 8. 黄金预设与验收数值（golden-2000-3）

参数：W 2000 × D 400 × H 400，三个等宽 up_flap 分区。

T3 钉值（验收示例，0.01 mm）：

```
x0 = 0, x1 = 2000, y0 = 0, y1 = 90   （深 = T3_DEPTH_MM）
z1 = H − TCH − 1 = 359, z0 = z1 − 15 = 344
```

推导链：T3.z1 ← H、TCH（param）；T3.z0 ← ref(T3.z1)、CPT（rule）。

## 9. 验收流程（与代码来源无关）

1. 按本规格独立实现生成器（cab-lab 架构：`generators/<module>/` + dim() 溯源 + rules.json + faces.ts）。
2. `pin-presets.ts <module> --write` 生成黄金预设钉值；与现存钉值**逐点对比**（0.01 mm）。
3. audit：无未声明重叠；声明接缝全部 touching。
4. bench 爆炸视图：装配顺序合理、轨迹沿接缝方向。
5. 保留少量手写行为断言（分区切分、特征 id 存在性）。
