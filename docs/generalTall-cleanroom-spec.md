# 高柜（General Tall Cabinet）逻辑规格 — cleanroom 重实现提取

> 目的：从既有实现提取**行为与逻辑规格**（不含实现代码），供不照搬代码的重新实现使用。
> 验收方式：数值对拍（golden preset + pins，0.01 mm），与代码来源无关。
> 事实来源：参数/常量/接缝声明（数据）、单元测试断言（66 用例 + 冰箱 12 用例 + 堆叠/边界/审计各独立套）与 oracle 验证输出（验收基准）。
> 坐标：一套最终柜体坐标。核心板（端系统/Zi/H/VD/DS）y∈[0, midDepth]，midDepth = CD − FPT（**depth 含门厚**）；门板层 frontPanels 悬于 y∈[−FPT, 0]（数据层，非 Board）。立梃与侧板用同一套柜体 Y。毫米、Z 向上（地板 z=0）、x 左起。输出 boardFrame "final"、前脸 −Y。

---

## 1. 模块定位

- 单列高柜（衣柜/储物柜，最高模块）：zones **自下而上**堆叠切高。Z 堆叠模型：`bottom_system → (functional_zone → boundary_panel)* → top_system`（自下而上累积 z）。
- 骨架：前立梃 V1（左）/V2（右）**全高**，局部轮廓深 150，带 Zi 槽与端部插口；后立梃 V3/V4 为**深 150 的短条**（bbox 深恒 150），只含后段 Zi 槽与顶部 L 缺口；左右可选装饰侧板（16 mm，前脸向 −Y 包边 FPT）。
- 端系统：style_1 = 前脸轨（T1/B1，16 厚）+ 二轨（T2/B2，15 厚）+ 插板（T3/B3，厚跟 CPT，深 150、前缺口 75）；style_2 = 固定前脸（TH1/BH1）+ 顶盖 T4 + 后条 T5。
- 功能层：Zi 边界板（full_zi / half_zi / shortened_zi）、H 支撑桥（H13 左竖 / H24 右竖 / H34 后横，各 top/bottom/mid；冰箱腔另有 _fridge 组）、H12（blank_panel 区支撑）、VD（双门竖分隔）、DS 门层板、frontPanels 前脸层（含铰链杯/锁槽，数据层）。
- 料：门板料 16 用于 T1/B1 与 style_2 固定前脸（实测 15 厚 + 1 mm 缝）；其余柜身料 CPT（缺省 15；V 立梃/插板厚跟 CPT）。
- 板件 boardType 白名单（回归契约，28 种）：V1–V4、T1/T2/T3/T4/T5、TH1/BH1、B1/B2/B3、top/bottom_system_placeholder、style2_fixed_front_panel、full_zi/half_zi/shortened_zi、H12/H13/H24/H34、vertical_divider、side_panel、avoidance_horizontal/avoidance_vertical（冰箱另有 V5）。禁止出现：door_panel/drawer_front/flap_front/blank_front_panel/drawer_box/hinge_hole/lock_cutout/slide_hole/toolpath/nesting——门板一律走 frontPanels 数据层。
- featureType 白名单 5 种：zi_slot、zi_groove、h34_clearance_slot、b3_groove、divider_tongue（t3_drill_hole / b3_drill_hole 已移除，恒 0）。

## 2. 输入参数

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| cabinetHeight (CH) | 是 | — | 总高（z 0..CH，含底/顶系统） |
| cabinetWidth (CW) | 是 | — | 包络宽（含侧板）；midWidth = CW − leftT − rightT |
| cabinetDepth (CD) | 是 | — | 含门厚；midDepth = CD − FPT |
| panelThickness (CPT) | 否 | 15 | 柜身板厚（V 立梃、T3/B3、V5、槽宽基准） |
| frontPanelThickness (FPT) | 否 | 16 | **统一优先级：frontPanelThickness > frontFaceAllowance > doorPanelThickness > 16**，同时驱动 sideClearance 前脸包边、style_2 门厚、侧板凸出 |
| frontFaceAllowance / doorPanelThickness | 否 | 16 | FPT 旧别名（测试沿用） |
| ziThickness (ziT) | 否 | 15 | 边界板厚；Zi 槽高 = ziT + 1 |
| hThickness | 否 | 15 | H 支撑厚（H 板实测 15） |
| sideClearance | 否 | 3 | 侧隙 |
| dividerThickness | 否 | 15 | VD 厚；zi_groove 宽 = 此值 + 1 |
| topSystem / bottomSystem | 是 | — | `{style:"style_1", frontRailHeight, insertSlotThickness=16}` 或 `{style:"style_2", height}`；style_1 轨高下限：顶 40 / 底 53；style_2 高 ≥60 |
| avoidance | 否 | — | `{enabled, depth, height}`；depth/height 夹取 [0, CD]/[0, CH] |
| left/rightSidePanelThickness | 否 | 0 | **∈ {0, 15, 16} 硬编码白名单**，否则 error |
| left/rightSidePanelAdaptAvoidance | 否 | = !ignoreAvoidance | 侧板是否切避让缺口（per-side） |
| left/rightSidePanelIgnoreAvoidance | 否 | false | 旧参数（adapt 未显式给出时的默认来源） |
| zones[].type | 是 | — | 11 种：side_door / left_side_door / right_side_door / double_door / drawer / open_space / open_appliance / fridge / top_flap / bottom_flap / blank_panel |
| zones[].height | 是 | — | 区高（堆叠输入；冰箱区被 applianceHeightMm 覆盖） |
| zones[].shelfEnabled / shelfHeight | 否 | — | 门层板（DS）；区高 <350 不生成 |
| zones[].lockPosition / lockHeight | 否 | — | top / bottom / side / shelf_top / shelf_bottom；side 时 lockHeight 为距区底高度 |
| zones[].hingeSettings | 否 | — | {cupDiameter 35, cupDepth 12.5, cupCenterFromEdge 22.5, useThreeHinges, sideDistance:"auto"或数值} |
| zones[].verticalDivider | 否 | false | double_door 竖分隔（VD + 上下边界升级 full_zi） |
| zones[].dividerCenterX | 否 | midWidth/2 | VD 心线（**core 坐标**）；越界 error "outside MidWidth" |
| zones[].applianceWidthMm / DepthMm / HeightMm | 否 | — | 冰箱尺寸（宽度/深度/高度） |
| exteriorSide | 否 | none | left / right / none（冰箱装饰板侧） |
| syncCabinetWidthFromFridge | 否 | false | CW 按冰箱宽同步（见 §7.3） |
| frontHardware | 否 | — | {frontPanelsEnabled, frontClearance 2.5, locksEnabled, lockPresetId "razor_long_rounded_1", defaultHingeSettings} |

## 3. 规则常量

| 常量 | 值 | 语义 |
|---|---|---|
| DEFAULT_PANEL_THICKNESS | 15 | CPT 缺省 |
| DEFAULT_FRONT_FACE_ALLOWANCE | 16 | FPT 缺省 |
| DEFAULT_ZI_THICKNESS / H 厚 / sideClearance | 15 / 15 / 3 | 缺省 |
| DEFAULT_DOOR_PANEL_THICKNESS / DIVIDER | 16 / 15 | 旧别名缺省 |
| STYLE_1_INSERT_SLOT_THICKNESS | 16 | style_1 插板厚（T3/B3 z 段高） |
| TOP / BOTTOM_STYLE_1_MIN_FRONT_RAIL_HEIGHT | 40 / 53 | style_1 轨高下限（取 max） |
| STYLE_1_SECOND_RAIL_THICKNESS | 15 | T2/B2 厚（字面量，不随 CPT） |
| T1/B1 厚 | 16 | 字面量（不随 FPT 参数） |
| STYLE_1_INSERT_FRONT_NOTCH_DEPTH | 75 | T3/B3 前缺口深（Y 向） |
| STYLE_1_INSERT_BOARD_DEPTH | 150 | T3/B3 板深 |
| ZI_FULL_FRONT_REAR_NOTCH_DEPTH | 105 | full_zi 前后缺口深 |
| ZI_HALF_FRONT_NOTCH_DEPTH / ZI_HALF_DEPTH | 45 / 150 | half_zi 前缺口 / 板深 |
| ZI_SLOT_CLEARANCE / ZI_SLOT_DEPTH | 1 / 50 | Zi 槽高余量（槽高 = ziT+1）/ 槽深（数据字段） |
| B3_GROOVE 宽/深/支路数/支路宽 | 14.5 / 6.5 / 2 / 20 | B3 连通槽（feature-only） |
| V12_STYLE_1_Y_FRONT_FACE / STEP_INNER / REAR / ZI_INNER | 70 / 80 / 150 / 100 | V1/V2 局部 Y：前脸 / 台阶 / 后缘 / Zi 槽内缘（槽 y∈[100,150]） |
| V34_STYLE_1_Y_FRONT / ZI_INNER / REAR | 0 / 50 / 150 | V3/V4 局部 Y：前缘 / Zi 槽外缘（槽 y∈[0,50]）/ 后缘 |
| V34_TOP_NOTCH_FRONT_Y / INNER_Y / REAR_NOTCH_HEIGHT | 29 / 134 / 105 | V3/V4 顶部 L 缺口：前角 29 / 内角 134 / 高 105（自 CH 下量） |
| V34 底部 L 缺口 | 同顶镜像 | z∈[0,105]，y∈[29,134] |
| ZI_GROOVE_WIDTH_CLEARANCE / Y_OVERHANG | 1 / 5 | VD 槽宽 = dividerT+1；槽 y 超舌区 ±5 |
| DIVIDER_TONGUE_GROOVE_CLEARANCE | 0.5 | 舌插入 = CPT/2 − 0.5 |
| H34_CLEARANCE_DEPTH / Z_BELOW / Z_ABOVE_START | 16 / 5 / 105 | VD 后带让位槽：y∈[midDepth−16, midDepth]；z = [H34.z0−5, H34.z0+105] |
| H12_DEPTH / SPLIT_HEIGHT / RAIL_HEIGHT | 15 / 300 / 100 | blank 支撑深 / 拆分阈值（≥300 拆两条各 100，<300 单块整高） |
| H_SUPPORT_THICKNESS / HEIGHT | 15 / 100 | H 板厚 / 高 |
| H_SUPPORT_SIDE_DEPTH_START / SIDE_REAR_CLEARANCE | 150 / 150 | H13/H24 y 起点 / H34 与后缘间隙（y1 = midDepth−150） |
| H34_DEPTH | 15 | H34 板深（y 范围 15） |
| END_SYSTEM_FRONT_DEPTH / REAR_DEPTH | 105 / 105 | 端部前后让位深 |
| V_STYLE_2_END_NOTCH_DEPTH / V_END_NOTCH_THICKNESS | 105 / 16 | style_2 V1/V2 端缺口：深 105 × 厚 16 |
| MIN_END_SYSTEM_GAP | 50 | 端系统前后条最小间隙（低于→merge 候选 warning） |
| DEFAULT_FRONT_CLEARANCE | 2.5 | 门缝 fc |
| 铰链杯 ⌀/深/距边 | 35 / 12.5 / 22.5 | 杯心距门边 |
| 铰链侧距公式 | clamp[75,100] | sd = 75 + (长边−300)·25/300 |
| DEFAULT_LOCK_SIDE_DISTANCE | 80 | 侧锁心距门侧沿 |
| LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER | 30.5 | 安装面到锁槽心 |
| LOCK_SLOT 长×宽 / 圆角 | 55 × 15.5 / r7.75 | preset razor_long_rounded_1 |
| DOOR_SHELF_MIN_ZONE_HEIGHT | 350 | 区高低于此不生成门层板 |
| SIDE_PANEL_MM（冰箱） | 16 | exteriorSide 强制侧板厚 |
| 冰箱宽度余量 | 45 | CW = applianceWidth + 45（+16 有侧板） |
| 冰箱 raised 阈值 | 105 | 底隙 <105 → raised 避让模式 |
| 堆叠高度容差 | 0.001 | 高度差 > 此值 → mismatch warning |
| 侧板厚白名单 | {0,15,16} | 硬编码校验 |

## 4. 板件清单（逻辑推导）

核心板先在 **core 坐标** x∈[0, midWidth] 建型（y∈[0, midDepth]），最后统一 `+dx`（dx = leftT）平移；side_panel / avoidance_support / V1–V4 不平移（坑③）。

| 类别 | id | 料厚 | 平面/厚轴 | 几何逻辑（CD 含门厚；midDepth = CD−FPT） |
|---|---|---|---|---|
| vertical_structure | V1/V2 前立梃 | CPT | YZ/X | 全高 z[0,CH]；**bbox y∈[FPT, CD]**；V1 x[0,CPT]，V2 x = rspT>0 ? [CW−rspT, CW−rspT+CPT] : [CW−CPT, CW]（无右板时吃满右缘）；局部轮廓见 §4.1 |
| vertical_structure | V3/V4 后立梃 | CPT | YZ/X | z[0,CH]；**bbox 深恒 150**：y∈[FPT+max(0, midDepth−150), CD]；x 同 V1/V2 的 X slab；轮廓见 §4.1 |
| vertical_structure | V5 冰箱条 | CPT | YZ/X | 仅冰箱区；对侧放置（exteriorSide≠"left"→左）：左 x[leftT+CPT, leftT+2·CPT]，右 x[CW−rspT−2·CPT, CW−rspT−CPT]；**z = 冰箱腔 stacking z0..z1**；y bbox [FPT, CD]；profile = 局部矩形；仅首个冰箱腔 |
| side_panel | SidePanel_L/R | 输入(15/16) | YZ/X | x 左 [0,leftT] / 右 [CW−rspT, CW]；**y∈[−FPT, CD−FPT]**（前包边、后缘短 FPT）；z[0,CH]；adapt 时后下角避让缺口 (CD−avoidDepth, avoidHeight) |
| avoidance_support | avoidance_horizontal | 15 | XY/Z | x[leftT, leftT+midWidth]；y[CD−avoidDepth, CD]；z[avoidH−15, avoidH] |
| avoidance_support | Avoidance_Vertical | 15 | XZ/Y | x 同上；y[CD−avoidDepth, CD−avoidDepth+15]；z[0, avoidH−15] |
| top_system (style_1) | T1 前轨 | 16 | XZ/Y | x core[0,midWidth]；y[0,16]；z[CH−railH, CH] |
| top_system (style_1) | T2 二轨 | 15 | XZ/Y | y[16,31]；z 同 T1 |
| top_system (style_1) | T3 插板 | CPT | XY/Z | x core[0,midWidth]；y[0,150]；z[CH−railH−16, CH−railH]；轮廓 [[0,0],[0,75],[CPT,75],[CPT,150],[midWidth−CPT,150],[midWidth−CPT,75],[midWidth,75],[midWidth,0]]（前耳全宽，后段左右收进 CPT，避开立梃台阶） |
| bottom_system (style_1) | B1/B2/B3 | 16/15/CPT | XZ/Y·XY/Z | B1 y[0,16] z[0,railH]；B2 y[16,31]；B3 y[0,150] z[railH, railH+16]，轮廓同 T3 |
| top_system (style_2) | TH1 固定前脸 | 15 | XY/Z | y[0,100]；z[CH−sysH+1, CH−1]（实测 [2084,2099]，15 厚留 1 mm 缝） |
| top_system (style_2) | T4 顶盖 | 15 | XY/Z | y[midDepth−100, midDepth]；z[CH−sysH+1, CH−1]（[484,584]×[2084,2099]） |
| top_system (style_2) | T5 后条 | 15 | XZ/Y | y[midDepth, midDepth+15]；z[CH−sysH, CH]（[584,599]×[2000,2100]） |
| bottom_system (style_2) | BH1 固定前脸 | 15 | XY/Z | y[0,100]；z[1,16]（留 1 mm 缝） |
| boundary_panel | Zi（boundary-{上}-{下}） | ziT | XY/Z | x core[0,midWidth]；z = 堆叠边界段；full_zi y[0,midDepth] 前后 105 缺口（宽 CPT）、half_zi y[0,150] 前 45 缺口、shortened_zi y[0, CD−avoidDepth]（避让缩深，仅 generator 层产生） |
| h_support | H13_left / H24_right | 15 | YZ/X | 竖桥贴 V1/V2 内侧：H13 x core[0,15]、H24 x core[midWidth−15, midWidth]；y[150, midDepth−150]；z：top [CH−100,CH]、bottom [0,100]、mid [居中区段]（见 §8.5） |
| h_support | H34 后横桥 | 15 | XZ/Y | x core[15, midWidth−15]；**y[midDepth−15, midDepth]**；z 同 H13/H24 系列 |
| h_support | H13/H24/H34_fridge | 15 | 同上 | raised 模式：z 起于冰箱底之上（H13_fridge/H24_fridge/H34_fridge 三件），且 H*_bottom 省略 |
| blank_panel_support | H12（H12_blank…） | 15 | — | blank_panel 区支撑：区高 ≥300 → 顶/底两条各高 100；<300 → 单块整高；深 15 |
| vertical_divider | VD_{zoneId} | dividerT | YZ/X | y[0, midDepth]（实测 [0,584]）；z = 所属 double_door 区段；x = 心线 ±dividerT/2（**core 坐标后再平移**；默认心 midWidth/2） |
| door_shelf | DS_{zoneId}(_L/_R) | CPT | XY/Z | 门板区 shelfEnabled 且区高 ≥350：shelfTopZ = zone.z0 + shelfHeight；双门带 VD 时拆 _L/_R 两段 |
| frontPanels（非 Board） | FP_{zoneId}(_L/_R) | FPT | XZ/Y | y∈[−FPT,0]；定位见 §4.2 |

### 4.1 V 立梃局部 YZ 轮廓（profileVector = cutProfileVector，闭合）

- **V1/V2（style_1）**：前脸 70 / 台阶 80 / 后缘 150；Zi 槽内缘 100（槽 y∈[100,150]）；顶部插口 z[CH−railH−16, CH−railH]、底部插口 z[railH, railH+16]。单槽 17 点（uiDefault 2 槽 21 点、baseParams 3 槽 25 点，每槽 +4 点）：
  `[70,0],[150,0],…[150,slotZ0],[100,slotZ0],[100,slotZ1],[150,slotZ1]…,[150,CH],[70,CH],[70,CH−railH],[80,CH−railH],[80,CH−railH−16],[0,CH−railH−16],[0,railH+16],[80,railH+16],[80,railH],[70,railH],[70,0]`
- **V1/V2（style_2 端）**：端缺口深 105×厚 16：点 (105,0),(105,16),(105,CH),(105,CH−16)；底/顶基线段 (0,0)–(105,0) 移除。style1_* 插口特征名仍沿用（坑⑨）。
- **V3/V4（两种 style 通用顶部 L 缺口）**：Zi 槽 y∈[0,50]（仅 full_zi）；17 点基线 + 槽点：顶 L 缺口序 `[150,CH−105],[134,CH−105],[134,CH−16],[29,CH−16],[29,CH],[0,CH]`；底部镜像（z∈[0,105]）。
- **避让（V3/V4）**：partial（avoidDepth≤150）：底前角挖 `(0,0)→(70,0)→(70,avoidH)→(150,avoidH)`；full（>150）：底边整体抬到 avoidH 起 `(0,avoidH)…`；avoidHeight=0 无缺口；与 Zi 槽相交 → 槽省略 + warning（feature 保留）。
- V1/V2 与 V3/V4 在侧板 X slab 上**共位**（同 x 范围、不同 y/z 占用），audit 白名单允许（§7.4）。

### 4.2 前脸面板（frontPanels 数据层）

- 叶解析：side_door 族 → 单叶；double_door → 双叶 `_L/_R`（中缝各让 fc/2）；drawer → 单叶（无铰链）；top_flap / bottom_flap → 单叶；open_space / open_appliance / fridge / blank_panel → **无面板**（冰箱腔保持开放）。
- z 边缘按邻居类型决策：邻区有面板 → 缝 fc/2；邻区开放（open 族）→ 延伸盖边；顶/底贴系统边界 → 贴齐或留缝。
- 铰链杯（⌀35 深 12.5 距边 22.5）：侧门杯心贴铰链侧，Z = [z1−sd, z0+sd]（useThreeHinges 加中点）；sd = clamp[75,100]（公式 §3）；sideDistance 可显式给数。
- 锁槽（55×15.5 r7.75，razor_long_rounded_1）：面到心 30.5。五种 lockPosition：
  - shelf_top：mountingFace top，centerZ = shelf.z1 + 30.5；
  - shelf_bottom：face bottom，centerZ = shelf.z0 − 30.5；
  - side：orientation vertical，mountingBoardId = VD，centerZ = zone.z0 + lockHeight（超面板 → 夹取 + warning "outside panel Z"）；
  - top / bottom：贴上/下边界安装面 ∓30.5。
  - shelf_* 无层板 → fallback（mountingFace bottom、fallbackApplied=true，warning "no horizontal shelf board found"）。双门锁用各叶自身段（DS_…_L/_R）。

### 4.3 Zi 边界板轮廓（profileVector，XY 平面、core 坐标；notch 宽 = CPT）

- **full_zi**（13 点含闭合，mw=midWidth、md=midDepth）：
  `[CPT,0],[CPT,105],[0,105],[0,md−105],[CPT,md−105],[CPT,md],[mw−CPT,md],[mw−CPT,md−105],[mw,md−105],[mw,105],[mw−CPT,105],[mw−CPT,0],[CPT,0]`
  读法：前后各 105 带（y∈[0,105] 与 [md−105,md]）左右各内缩 CPT 让立梃；中带（y∈[105,md−105]）左右外伸至 core 全宽 [0,mw]——即舌带，穿入 V1/V2 立梃的 Zi 槽（V 板端部插口 z 带全深 0–150 开通，供 T3/B3/Zi 中带穿越互锁）。
- **half_zi**（9 点含闭合）：`[0,0],[0,45],[16,45],[16,150],[mw−16,150],[mw−16,45],[mw,45],[mw,0],[0,0]`
  读法：前缘 45 高横条全宽（封两立梃间前缝）；y∈[45,150] 段左右各内缩 CPT。板深 150。
- **shortened_zi**：full_zi 轮廓后缘改 y = CD−avoidDepth（缩深），仅避让启用且与避让带相交的 full_zi 转换；half_zi（深 150）不缩；double_door 竖分隔支撑 Zi 不缩。
- core 坐标 ↔ 绝对坐标：核心板最终 +leftT 平移；core x=0 对齐 SidePanel_L.x1（有左板时）；与 V1.x1=CPT 的对齐仅在 CPT=leftT 时成立（如 pt=15、leftT=16 的冰箱配置下存在 1 mm 错位——坑③的一部分）。

### 已知坑（十条，重实现必须处理）

1. **三套 Y 参考并存**：核心板 y∈[0, midDepth]、V1–V4/V5 bbox y∈[FPT, CD]（carcassY0=FPT）、侧板 y∈[−FPT, CD−FPT]。V 立梃后缘达 CD，比侧板后缘深 FPT；sidePanelOverlapAudit 只校验 y0 对齐（侧板 −FPT / 立梃 +FPT，差 2×FPT=32 为黄金值），不校验 y1。重实现必须统一为一套（推荐核心板系）。
2. **V 板 profile 局部坐标 vs bbox 绝对坐标**：profileVector y∈[0,150] 局部，bbox y 跨 midDepth（≠150），两者映射源码未定义（V5 注释自证 "profileVector uses local axes"）；zi_slot 特征 y 也是局部值。
3. **applyCoreBoardXOffset 事后平移 hack**：核心板先建 core 坐标再整体 +leftT；**zi_groove / divider_tongue 等 feature 的 x 仍是平移前 core 坐标**（黄金值：groove x[326,342] vs VD 板 x[342.5,357.5]，双重参考）。重实现应一步到位生成最终坐标。
4. **占位/deferred 分支**：B3 连通槽 feature-only（真实刀路 deferred）；V3/V4 顶/底 L 槽 "refinements deferred"；divider 舌 exact outline deferred（底舌已烘焙进 cutProfile）；half_zi 与 H 冲突的移动规则 deferred（仅检测）；顶/底 merge（端系统前后条间隙 <50）仅检测不执行；t3/b3 钻孔已移除恒 0。
5. **zi_groove 坐标双重参考**（坑③的数值后果）：验收时 groove x 与板 x 差 leftT，属源码固有行为。
6. **接缝声明覆盖不全**：仅 4 条骨架 + 4 条冰箱（§6）；Zi↔V 槽、H 板↔立梃、VD↔Zi/H34、DS/门板均无声明。
7. **V5 仅首个冰箱腔**：多冰箱腔未支持（源码 "ponytail" 注释自认）。
8. **left/right_side_door 结构层归并**：结构/边界/堆叠层与 side_door 同类处理，仅前脸层区分铰链侧；结构 params 与前脸 inputParams 是两份视图。
9. **style1_* 特征名在 style_2 下沿用**：style_2 端缺口（105×16）仍以 style1_top/bottom_insert_slot 命名挂载 V1/V2。
10. **字面量厚度**：T1/B1=16、T2/B2=15、H 板=15、避让支撑=15 均不随参数；侧板厚白名单 {0,15,16} 硬编码；V2 在 rspT=0 时吃满 [CW−CPT, CW]。

## 5. 面层特征挂载

| 特征 | 归属 | 类型 | 尺寸/定位 |
|---|---|---|---|
| zi_slot | V1/V2 profileFeatures + features | 槽 | V1/V2 局部 y[100,150]；V3/V4 y[0,50]（仅 full_zi 边界）；z = 边界心 ±(ziT+1)/2（15+1 → ±8）；depth 50 |
| zi_groove | full_zi 边界板（face top/bottom） | 槽 | 宽 dividerT+1、深 CPT/2（16/2=8）；x = VD 心 ±(dividerT+1)/2（**core 坐标** [326,342]）；y[2midDepth/3−(−5)… 即 midDepth/3−5, 2·midDepth/3+5]（舌区 ±5 悬出）；只挂 full_zi（half 无） |
| divider_tongue | VD 顶/底 | 舌 | 插入 CPT/2−0.5（7.5）；y[midDepth/3, 2·midDepth/3]；顶舌 z[VD.z1−7.5, VD.z1]、底舌 z[VD.z0, VD.z0+7.5]；底舌烘焙进 cutProfile（z0 = VD.z0−7.5=991.5 黄金值） |
| h34_clearance_slot | VD profileFeatures | 让位槽 | y[midDepth−16, midDepth]（后带 16）；z = [H34.z0−5, H34.z0+105]；越界保留 placeholder（z[−5,105]），有效切夹取到 VD z 范围；T5 版 z = [T5.z0, T5.z1]（"contact height only"，黄金 [1895,1944]，y[608,624]） |
| b3_groove | B3 | 连通槽（feature-only） | 14.5 宽 × 6.5 深，2 支路，支路宽 20 |
| style1_top/bottom_insert_slot | V1/V2 profileFeatures | 端部插口 | top z[CH−railH−16, CH−railH]、bottom z[railH, railH+16]；y[0,150]；style_2 下同名表示 105×16 端缺口 |
| 铰链杯 | frontPanels.hingeCupHoles | 孔 | ⌀35 深 12.5 距边 22.5；sd 公式 §3 |
| lockCutout | frontPanels.lockCutout | 圆角槽 | 55×15.5 r7.75；面到心 30.5；侧距 80（side 位） |
| 避让缺口 | SidePanel/V3/V4 轮廓 | notch | 折进外轮廓（§4.1） |
| debug | result.debug | — | midWidth/midDepth/mergeAndConflict/hZiConflicts/h34Clearance/fridgeAvoidance/sidePanelOverlapAudit/assemblyOverlapAudit（非验收项但 oracle 引用） |

## 6. 接缝声明（声明式数据）

| 声明 id | 关系 | 类型 | 几何 | 五金 |
|---|---|---|---|---|
| gt_b1_b3_bottom_rail_to_deck | B1↔B3 | structural_butt_joint | edge_to_surface | screw_hole |
| gt_t1_t3_top_rail_to_insert | T1↔T3 | structural_butt_joint | edge_to_surface | screw_hole |
| gt_b2_b3_carcass_rail_to_deck | B2↔B3 | structural_butt_joint | edge_to_surface | screw_hole |
| gt_t2_t3_carcass_rail_to_insert | T2↔T3 | structural_butt_joint | edge_to_surface | screw_hole |
| gt_sidepanel_l_v1 | SidePanel_L↔V1 | face_contact | surface_to_surface | — |
| gt_sidepanel_r_v2 | SidePanel_R↔V2 | face_contact | surface_to_surface | — |
| gt_v5_v1 / gt_v5_v2 | V5↔相邻立梃 | face_contact | surface_to_surface | — |

声明按现存板件 id 过滤；V5 配对规则：exteriorSide=left → V5 在右 → 声明 V2；=right → V1；none → V5 默认左 → V1（与强制侧板声明互斥出现）。其余接缝未声明（坑⑥）。

## 7. 校验规则

**errors（阻断）**：侧板厚 <0 或 ∉{0,15,16}；MidWidth ≤0（"MidWidth must be > 0 after side panel thickness…"）；avoidance depth ≤0（NEG-05 "Avoidance depth must be > 0; received -1."）；zone height ≤0（"Zone … height must be > 0."）；style_2 高 <60（"top/bottom Style 2 height must be >= 60 mm."）；dividerCenterX 越界（"outside MidWidth"）。

**warnings（不阻断）**：高度失配（见 7.1）；top_flap 非最高功能区（"Top flap must be the highest functional zone directly below Top System." / "…is not the highest functional zone…"）；bottom_flap 非最低（"…is not the lowest functional zone; hinge semantics still apply…"）；冰箱高度同步 note（含区 id 与 1470 等数值）；家电超内腔（applianceWidthMm/DepthMm/exceeds）；CW 同步（"Cabinet width synced…611/595"）；raised 模式（"…gap … < 105 mm: raised avoidance mode…"）；H 冲突移动评估/跳过（"H mid overlaps full_zi/shortened_zi; Stage 2 movement evaluated."、"…half Zi movement rule deferred."、"…movement below/above Zi would exceed cabinet bounds; movement skipped."）；merge 候选（"Top/bottom merge candidate detected: MidDepth front/rear gap is below 50mm"）；V3/V4 槽与避让相交省略；避让支撑尺寸无效跳过 / X 越界仍生成；Zi 槽重叠；"Assembly overlap: …"；侧板 y0 偏差（sidePanelOverlapAudit）；side lock 越界夹取提示。

**板件有效性**：三向尺寸任一 ≤0/非有限 → invalid boards（NEG-02 中置上翻门 22 块 invalid → FAIL；oracle 要求主用例 0 invalid）。

### 7.1 堆叠行为规则（stackingCalculator）

| 规则 | 行为 |
|---|---|
| style_1 端系统高 | max(frontRailHeight, 下限) + insertSlotThickness（默认 16）；顶下限 40、底下限 53 |
| style_2 端系统高 | height（≥60 校验） |
| 边界占位 | boundaryType = none → 厚 0；否则 ziT |
| 累积 | 自下而上：bottom → zone → boundary → … → top；item 记录 z0/z1/height/centerZ |
| 校验 | difference = CH − calculatedHeight；\|diff\| > 0.001 → warning "Height mismatch: expected CH = …; calculated CH = …; difference = …"；仍返回全部板件（不阻断） |
| 边界解析透传 | 内嵌 boundaryResolver（下表）；flap 位置 warning 一并透传 |

### 7.2 边界解析行为规则（boundaryResolver）

| above（上区类型） | below（下区类型） | boundaryType |
|---|---|---|
| top_system / blank_panel | 任意 | none |
| drawer | drawer | half_zi |
| top_flap / side_door 族 / double_door / drawer / open_space / open_appliance / fridge / bottom_flap | 其余功能区 | full_zi |
| bottom_system（默认兜底） | — | none |

- 双门升级：double_door(verticalDivider=true) 的**上下功能区边界**强制升级 full_zi（upgradedByDoubleDoorDivider，none/half_zi 均升；对 top_system/bottom_system 的 debug 边界仍 none）。
- shortened_zi **永不**由 resolver 输出（仅 generator 避让层把 full_zi 缩深改名）。
- 冰箱边界：fridge↔drawer/open_space/side_door 双向 full_zi；blank_panel 上方 → none。
- zone height ≤0 → error；flap 位置 → warning（§7）。

逐对验收表（above, below）→ boundaryType（测试直测）：

| above \ below | side_door | drawer | open_space | open_appliance | fridge | blank_panel |
|---|---|---|---|---|---|---|
| blank_panel | none | none | — | — | none | none |
| side_door | full_zi | full_zi | full_zi | — | full_zi | full_zi |
| drawer | full_zi | **half_zi** | full_zi | full_zi | full_zi | full_zi |
| open_space | — | — | — | full_zi | full_zi | — |
| open_appliance | — | full_zi | — | — | full_zi | — |
| fridge | full_zi | full_zi | full_zi | full_zi | — | — |

（"—" 为未直测组合，按 §7.2 主矩阵推导：above ∈ 门/抽/开族 → full_zi、above=blank/top_system → none。）

### 7.3 冰箱区约束

| 规则 | 行为 |
|---|---|
| 高度 | 冰箱区高度 = applianceHeightMm（覆盖 zone.height，warning 记录同步） |
| 前脸 | 冰箱腔**不生成 front panel**（保持开放） |
| 宽度同步 | syncCabinetWidthFromFridge：CW = applianceWidthMm + 45；exteriorSide=left/right 时强制该侧 16 侧板 → CW = 550+45+16 = 611（warning 含 611）；none → 595、不强制侧板 |
| V5 | 对侧立梃（§4 表）；z 贴冰箱腔 z0/z1（±0.5 断言）；仅首个冰箱腔 |
| 避让模式 | gap = 冰箱底 z − avoidH（底部空隙）；gap <105 → **raised**：avoidance_horizontal 顶面贴冰箱底、生成 H13/H24/H34_fridge 三件（z ≥ 冰箱底）、**省略 H*_bottom**、warning；gap ≥105 → **normal**：保持输入避让高（horizontal z1=avoidH）、仍生成 H*_bottom、无 _fridge 板 |
| 骨架保留 | 冰箱栈仍生成 T1/T2/T3/B1/B2/B3/V1/V2（结构与普通区一致） |
| 声明 | §6 冰箱四条按现存板件过滤（left 外饰 → gt_sidepanel_l_v1 + gt_v5_v2；none → gt_v5_v1） |

### 7.4 装配重叠审计（assemblyOverlapAudit 白名单制）

- 平行判定：profilePlane 且 thicknessAxis 均相同 → parallel_slab；否则 perpendicular。
- 面接触（无体积交）**不算**重叠；垂直角交**全部允许**（"corner intersection is expected joinery"）。
- 平行重叠白名单（字面 6 条）：SidePanel_L|V1、SidePanel_L|V3、SidePanel_R|V2、SidePanel_R|V4、V1|V3、V2|V4（前立梃+后立梃共 X slab 属"split boards with deferred union"）。
- 平行规则 3 条：V1/V3 ↔ H13*（左桥坐立梃缺口）、V2/V4 ↔ H24*、V3/V4 ↔ H34*。
- 平行未列名 → unexpectedOverlapCount++ → warning "Assembly overlap: A+B…"（如 V1+VD_zone-1）；整柜（uiDefault 双 16 侧板）断言 **0 unexpected**。
- sidePanelOverlapAudit（另一项）：SidePanel_L↔V1 / SidePanel_R↔V2 同 X slab 时校验 y0（−FPT / FPT），偏差 >0.01 → warning；结果含 overlaps 列表（L↔V1、R↔V2 均 overlaps=true）。

## 8. 黄金验收数值（测试提取，0.01 mm 对拍口径）

### 8.1 黄金参数集

- **baseParams**：CH2100 × CW664 × CD600，CPT16 / FPT16（frontFaceAllowance）/ ziT15 / hT15 / sideClearance3 / doorPanelThickness16，style_1 顶 40+16 / 底 53+16，无侧板、无避让。
- **uiDefaultParams**：CH2000 × CW600 × CD584，CPT16 / FPT16 / sideClearance3，style_1 顶 40 / 底 53（insertSlot 默认 16），avoidance off；zones：side_door 600 + drawer 300 + double_door 945（verticalDivider）。
- **冰箱参数集**：CH2100 × CW611 × CD616，CPT15 / frontFaceAllowance16 / ziT15 / hT15 / sideClearance3，style_1 40/53；zones 含 fridge 1470（appliance 550×580×1470）。
- **oracle 用例**（general-tall-validation-output.md）：GT-01..GT-10 全 READY（Height Diff 0、Invalid Boards 0、Can Generate true）；NEG-01 BLOCKED（diff −295）、NEG-02 FAIL（22 invalid，中置上翻门）、NEG-03 BLOCKED（+555）、NEG-04 BLOCKED（+240）、NEG-05 FAIL（depth −1，23 invalid）。

### 8.2 堆叠链（自下而上）

uiDefault（CH2000）：bottom 0–69；zone-1 69–669；full_zi 669–684；zone-2 684–984；full_zi 984–999；zone-3 999–1944；top 1944–2000（=40+16）。边界心 676.5 / 991.5；V 板 Zi 槽 z 668.5–684.5、983.5–999.5（= 心 ±8）。

baseParams 5 区链（stackingCalculator 直测，CH2100、mismatch −30 警告用例）逐项表：

| item id | type | z0 | z1 | height |
|---|---|---:|---:|---:|
| bottom-system | bottom_system | 0 | 69 | 69 |
| zone-side-door | functional_zone | 69 | 669 | 600 |
| boundary-side-door-drawer-a | boundary_panel (full_zi) | 669 | 684 | 15 |
| zone-drawer-a | functional_zone | 684 | 984 | 300 |
| boundary-drawer-a-drawer-b | boundary_panel (half_zi) | 984 | 999 | 15 |
| zone-drawer-b | functional_zone | 999 | 1299 | 300 |
| boundary-drawer-b-blank | boundary_panel (full_zi) | 1299 | 1314 | 15 |
| zone-blank | functional_zone | 1314 | 1714 | 400 |
| zone-open | functional_zone | 1714 | 2014 | 300 |
| top-system | top_system | 2014 | 2070 | 56 |

（blank→open 边界 above=blank → none，无占位；首边界 centerZ=676.5。style_2 用例：顶 80/底 100、zones side 800+blank 400+drawer 690 → 边界 [full_zi, none]、calculated 2085、diff −15。）

### 8.3 V 立梃轮廓（局部 YZ）与特征计数

- V1/V2 uiDefault 21 点：`[70,0],[150,0],[150,668.5],[100,668.5],[100,684.5],[150,684.5],[150,983.5],[100,983.5],[100,999.5],[150,999.5],[150,2000],[70,2000],[70,1960],[80,1960],[80,1944],[0,1944],[0,69],[80,69],[80,53],[70,53],[70,0]`。
- V1 单槽 17 点（baseParams，CH2100）：同上结构，槽点用 slot.z0/z1，端部 [0,2044]/[0,69]。
- V3/V4 uiDefault 17 点：`[0,0],[150,0],[150,1895],[134,1895],[134,1984],[29,1984],[29,2000],[0,2000],[0,999.5],[50,999.5],[50,983.5],[0,983.5],[0,684.5],[50,684.5],[50,668.5],[0,668.5],[0,0]`（顶 L 缺口 = CH−105/CH−16 带 29/134；槽 y[0,50]）。
- V3/V4 避让（uiDefault + avoidance 80×400）partial 19 点：`[0,0],[70,0],[70,400],[150,400],` + 上同；full（200×400）18 点：首点 `[0,400]` 替换底边。avoidHeight=0 → 无缺口原版。
- V1/V2 style_2 端缺口点：(105,0),(105,16),(105,CH),(105,CH−16)；V3/V4 顶 L 缺口与 style_1 相同（两种 style 通用）。
- bbox：uiDefault 双 16 侧板下 V1/V2 x[0,16]/[584,600]、y[16,584]；V2.y0 − SidePanel.y0 = 32（=2×FPT）。

轮廓点数与特征计数（验收口径）：

| 对象 | 点数/计数 | 说明 |
|---|---|---|
| V1/V2 cutProfile | 17（1 槽）/ 21（2 槽）/ 25（3 槽） | 每槽 +4 点；首尾闭合 |
| V3/V4 cutProfile | 17（uiDefault 2 槽） | baseParams 3 边界 [full,half,full] 下 V3/V4 仅 4 槽特征（两 full 边界 × 2 板，half 不给后梃） |
| baseParams V1/V2 槽角点（y=100） | z 668.5/684.5、983.5/999.5、1298.5/1314.5 | 三边界各 ±8 |
| zi_slot 特征总数 | 10（baseParams） | full 边界 ×4 板 + half 边界 ×2 板（仅 V1/V2）+ full ×4 |
| style1 端部插口特征 | V1/V2 各 1 top + 1 bottom | top z[2044,2060]（y[0,150]，source top_system）；bottom z[53,69]（source bottom_system）；V3/V4 无 |
| 避让 profile 点数 | partial 19 / full 18 | avoidHeight=0 → 原版 17 |

### 8.4 端系统（baseParams CH2100）

- style_1 z：T1/T2 [2060,2100]、T3 [2044,2060]、B1/B2 [0,53]、B3 [53,69]；自定义轨高 70/80：T1/T2 [2030,2100]、T3 [2014,2030]、B1/B2 [0,80]、B3 [80,96]。
- T3/B3（CW700 双 16 侧板，midWidth 668）：x[16,684]（=leftT..leftT+midWidth）、y[0,150]；profile `[[16,0],[16,75],[32,75],[32,150],[668,150],[668,75],[684,75],[684,0]]`（前耳全宽，后段收进 CPT16）；T1/T2/B1/B2 无 profileVector。
- 厚度：T1=16、T2=15、T3=CPT16、B1=16、B2=15、B3=CPT16。
- style_2（baseParams CH2100，顶 100/底 100）：TH1 [0,664, 0,100, 2084,2099]；T4 [0,664, 484,584, 2084,2099]；T5 [0,664, 584,599, 2000,2100]；BH1 [0,664, 0,100, 1,16]；不生成 T3/B3 及其特征。

### 8.5 H 支撑（CW700 双 16 侧板，midWidth 668，midDepth 584，单 open 区 1975）

8 块：H13_top [16,31, 150,434, 2000,2100]；H24_top [669,684, 150,434, 2000,2100]；H13_bottom [16,31, 150,434, 0,100]；H24_bottom [669,684, 150,434, 0,100]；H34_bottom [31,669, 569,584, 0,100]；H13_mid [16,31, 150,434, 1000,1100]；H24_mid [669,684, 150,434, 1000,1100]；H34_mid [31,669, 569,584, 1000,1100]（x 均为平移后：core+16；y 段 [150, midDepth−150]=[150,434]；H34 y=midDepth−15）。blank 区另出 H12：400 高 → 顶/底两条各 100；250 高 → 单块 250。

### 8.6 避让（uiDefault + 200×400，双 16 侧板）

avoidance_horizontal [16,584, 384,584, 385,400]（XY/Z）；Avoidance_Vertical [16,584, 384,399, 0,385]（XZ/Y）。shortened_zi：full_zi 缩深 y[0, CD−avoidDepth=384]（boardType 改 shortened_zi，材料 15）；half_zi 不缩（y[0,584]）。侧板缺口 profile：`[0,0],[384,0],[384,400],[584,400],[584,2000],[0,2000]`（adapt 开启侧）。

### 8.7 VD / 槽 / 舌 / H34（CW700 双 16 侧板，dividerT15，CPT16）

- VD_double：x[342.5,357.5]（=core 心 334 + 平移 16 ±7.5）、y[0,584]、z=double 区段；custom 心 300 → x[308.5,323.5]。
- zi_groove ×2（上下边界各一，face top/bottom）：x **[326,342]（core 坐标，平移前）**、深 8、y[584/3−5, 2·584/3+5]=[189.667,394.333]；只挂 full_zi。
- divider_tongue ×2：插入 7.5；y[194.667,389.333]；底舌 z[VD.z0, VD.z0+7.5]（uiDefault：VD.z0=999 → 舌底 991.5，cutProfile 顶点序 `[0,999],[y0,999],[y0,991.5],[y1,991.5],[y1,999]`）。
- h34_clearance_slot（VD 上）：y[568,584]（=midDepth−16）；H34_bottom → placeholder z[−5,105]（越界，effective cut 跳过）；H34_mid → 有效切 z[995,1105]（=H34.z0−5/z0+105，烘焙进 VD cutProfile）；T5 版 y[608,624]、z[1895,1944]。
- uiDefault VD z[999,1944]，cutProfile 范围 y[0,568]、z[991.5,1944]。

### 8.8 H mid 与 Zi 冲突移动（baseParams：side 930 + drawer 500 + open 600）

full_zi z[1000,1015] 与 H mid [1000,1100] 冲突（overlap [1000,1014]）：H13_mid/H24_mid 移至 **[899,999]**（below，newZ0=899=zi.z0−101）；H34_mid 移至 **[1014,1114]**（above）；warnings "Stage 2 movement evaluated"。shortened_zi 同规则。half_zi 仅检测不移动（"half Zi movement rule deferred"，板保持 [1000,1100]）。越界跳过：below newZ0=−1 → 不动；above newZ1=301>CH300 → 不动（H34_mid 保持 [114,214]）。

### 8.9 冰箱（冰箱参数集）

- 堆叠：冰箱区高 1470（applianceHeightMm 覆盖）；fridge 无 front panel；骨架 T/B/V 齐全。
- 宽度：exteriorSide=left → SidePanel_L 强制 16、CW=611（550+45+16）；none → 595（550+45）无侧板；right → SidePanel_R。
- V5：exteriorSide=left → V5 在右半（x0 > 611/2），z 贴冰箱腔 ±0.5；none → V5 在左（x1 < midWidth/2）。
- raised（drawer 200 底、avoidance 300×200，gap≈84<105）：finalMode=raised；avoidance_horizontal.z1 = 冰箱底；H13/H24/H34_fridge 三件 z ≥ 冰箱底；H*_bottom 无；warning 含 "raised"+"105"。normal（drawer 400，gap ≥105）：horizontal.z1=200；H*_bottom 保留；无 _fridge 板。
- 声明组合：left → {gt_b1_b3…, gt_sidepanel_l_v1, gt_v5_v2}（无 r_v2/v5_v1）；none → {gt_v5_v1}（无侧板声明）；right → {gt_v5_v1, gt_sidepanel_r_v2}。
- V1/V2 cutProfile 闭合、局部 y≤150、z 0..CH；V5 闭合矩形 profile（深×高=局部范围）。

### 8.10 前脸五金（uiDefault 系）

- shelf_top 锁：centerZ = DS.z1+30.5；shelf_bottom：DS.z0−30.5；side（lockHeight 500）：centerZ = zone.z0+500、mountingBoardId=VD_zone-3；lockHeight 99999 → 夹取 ≤ panel.z1 + warning；无层板 fallback mountingFace=bottom。
- 双门层板锁：cutL/cutR 分别挂 DS_zone-3_L/_R，centerZ = 各段 shelf.z1+30.5。
- 整柜（CH1965 × CW609 × CD600，CPT15/侧板 15/FPT16/fc2/sideClearance3.5，顶 style_1 40 / 底 style_2 100，避让 380×220，right_side_door 599 + bottom_flap 249 + double_door 931 分隔）：difference=0、errors=[]、invalid=[]、bottom_flap 位置 warning。

### 8.11 推导链示例（0.01 mm 对拍口径）

- H 系 z：top [CH−100, CH]、bottom [0,100]、mid [CH/2−50, CH/2+50]（2100 → [1000,1100]）。
- H mid 冲突移动：H13/H24_mid 新 z1 = zi.z0−1 = 999、z0 = 999−100 = 899；H34_mid 新 z0 = zi.z1−1 = 1014、z1 = 1014+100 = 1114（zi z[1000,1015]）。
- V34 顶 L 缺口 ← CH：z = CH−105 = 1895 / CH−16 = 1984，y = 29 / 134。
- T3 ← railH：z1 = CH−railH = 2060、z0 = z1−16 = 2044；V1/V2 顶部插口同段；底部插口 z = [railH, railH+16] = [53,69]。
- VD ← midWidth：core 心 668/2 = 334 → 板 x = 334+16（leftT）±7.5 = [342.5,357.5]；zi_groove x = 334±8 = [326,342]（core，坑⑤）。
- 底舌 ← VD.z0 与 CPT：z = 999 − (16/2−0.5) = 991.5。
- H34 让位槽 ← H34.z0：z = [z0−5, z0+105]（1000 → [995,1105]）。
- 冰箱 CW ← appliance：550+45+16 = 611（有外饰侧板）/ 550+45 = 595（none）。
- raised 判定：gap = 冰箱底 z − avoidH（≈284−200=84 < 105 → raised）。
- 锁 shelf_top ← DS.z1 + 30.5；side ← zone.z0 + lockHeight（夹取 ≤ panel.z1）。
- 侧板缺口 ← avoidance：(CD−depth, height) = (384, 400)，profile 折点 `[384,0],[384,400],[584,400]`。

## 9. 验收流程（与代码来源无关）

1. 按本规格在 Cab Lab 架构下独立实现（`generators/generalTall/` + rules.json + dim() 溯源 + boardFrame final、前脸 −Y）：**先统一三套 Y 参考与 core/绝对双坐标**（坑①②③）， Zi 槽/舌/让位一步生成最终坐标。
2. 以 §8.1 三大参数集建黄金 preset；`pin-presets.ts generalTall --write` 生成钉值，测试用 checkPins 逐点对比（0.01 mm），重点复算 §8.2–8.9 推导链（如 H13_mid z ← zi.z0(1000) − 101；V34 顶缺口 ← CH−105 / CH−16 与 29/134）。
3. audit：assemblyOverlapAudit 整柜 0 unexpected（白名单 §7.4）；声明接缝全部 touching；sidePanelOverlapAudit y0 断言（差 2×FPT）。
4. oracle 对拍：GT-01..10 全 READY（diff 0 / invalid 0）；NEG-01..05 按 §8.1 预期复现 BLOCKED/FAIL。
5. bench 爆炸视图：底系统 → V 立梃 → Zi/H/VD → 顶系统 → 门层板/frontPanels 装配次序合理；冰箱栈含 V5/侧板/raised HSet。
6. 补齐坑④⑥⑦（deferred 刀路、接缝声明、多冰箱腔）时须显式记录与源码的行为差异，不得静默变更黄金数值。
