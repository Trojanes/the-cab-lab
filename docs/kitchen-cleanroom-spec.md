# 厨房底柜（Kitchen Base Cabinet）逻辑规格 — cleanroom 重实现提取

> 目的：从既有实现提取**行为与逻辑规格**（不含实现代码），供不照搬代码的重新实现使用。
> 验收方式：数值对拍（golden preset + pins，0.01 mm），与代码来源无关。
> 事实来源：参数/常量/接缝声明（数据）、桥接脚本实测输出（验收基准）。
> 坐标：y=0 为结构前缘（门侧）、y=+cd 为墙侧，门板悬于 y∈[−FPT, 0]。吊柜的 y=0 在墙侧，厨房不要套用那套翻转。毫米、Z 向上（地板 z=0）、x 左起。输出 boardFrame "final"。

---

## 1. 模块定位

- 房车厨房落地底柜：列×区两级布局。columns 沿 x 切宽，zones 在列内**自顶向下**切高（区和 = H − BCH）。
- 结构深 cd = depth − frontThickness（**depth 参数含门厚**，门板挂 y∈[−FPT,0]）。
- 竖板体系 V0..Vn：V0 = 左外侧板、Vn = 右外侧板（可用门板料加厚）、中间 V = 列分隔板（柜身料）。
- 底部系统：B1/B2（前竖板，style_1 趾踢内缩）、B3（底板/deck）、B4（后下竖条）；顶部系统：T1（前条）、T2（后条）、T3（后竖条）；V 板与各条以缺口互锁。
- 功能板：drawer_divider / full_depth_shelf / door_shelf（舌入 V 板槽）。门板：left/right/double door、drawer 面板、down_flap。
- 料：门板料用于门板与 frontVisible 的侧板；其余全部柜身料（CPT）。

## 2. 输入参数

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| globalSettings.length (W) | 是 | — | 包络长（x 向） |
| globalSettings.depth | 是 | — | 含门厚；结构深 cd = depth − FPT |
| globalSettings.height (H) | 是 | — | 总高（z 0..H，含 BCH） |
| materialThickness (CPT) | 否 | 15 | 柜身板厚 |
| frontThickness (FPT) | 否 | 16 | 门板厚 |
| bottomClearanceHeight (BCH) | 否 | 70 | 底部净空高（趾踢/轮拱区） |
| bottomClearanceStyle | 否 | style_1 | style_2 或**任意其他值按 style_1**（else 兜底） |
| frontClearance (fc) | 否 | 2.5 | 门缝（⚠️ 隐藏参数，types.ts 未声明） |
| lockEnabled | 否 | true | 全局锁开关（⚠️ 隐藏参数） |
| columns[].width / id | 是 | — | 列宽（累加得 logicalX 边界） |
| columns[].columnType | 否 | — | ⚠️ 记录性字段，不参与几何 |
| zones[].height / zoneType | 是 | — | 自顶向下；zoneType ∈ left_door/right_door/double_door/drawer/open/down_flap/stove/custom（unassigned 报错） |
| zones[].shelfEnabled / shelfHeight | 否 | true / round(h/2) | 门板区层板 |
| zones[].left/rightSidePanelOptions | 否 | 见下 | 仅首列左端/末列右端侧板生效 |
| zones[].hingeSettings | 否 | — | {sideDistance, cupDiameter 35, cupDepth 12.5, cupCenterFromEdge 22.5, useThreeHinges}（⚠️ 隐藏） |
| zones[].lockEnabled / lockSideCenterOffset | 否 | true / 80 | ⚠️ 隐藏参数 |
| wheelAvoidances[] | 否 | [] | {id, x0, x1, height, depth}，x/y/z 外夹取整 |
| vPanelMachiningPreferences[] | 否 | — | {vPanelIndex, mode}，11 种双侧半槽加工模式 |

SidePanelOptions 默认：panelType=carcass、frontVisible=false、bchNotchEnabled=true、grooveVisible=true、extendT2T3B4ToOuterFace=true、strengtheningStripEnabled=false。外侧板选项解析：取该列含此选项的区中**优先门板区 → 可见区 → 首区**。派生：na = CPT + 1（让位宽）。

## 3. 规则常量

| 常量 | 值 | 语义 |
|---|---|---|
| notchAllowanceExtra | 1 | 让位缺口/槽宽余量；na = CPT+1 |
| style1ToeKickY | 70 | style_1 趾踢：V 板底段前缘 Y；B1 前脸 = 70−CPT−FPT |
| bottomSlotRearY | 80 | V 板 B3 台阶前缘 Y（z∈[BCH, BCH+na] 段） |
| receiverNotchDepth (r) | 85 | V 板顶前 T1 让位深（Y 向）；亦为 T3/B4 后接收缺口高（Z 向） |
| supportStripWidth | 100 | B3 深度；T1/T2 条宽；T3/B4 条高；加强条深度 |
| b3Depth | 150 | 抽屉分隔板深 |
| b3InternalNotchDepth | 75 | ⚠️ 定义未使用（残留常量） |
| supportStripNotchDepth | 20 | 支撑条让 V 板的缺口深 |
| minStripSegmentLength | 30 | 条切分后最小段长，小于即丢弃 |
| drawerSlotLength | 110 | 抽屉槽 Y 长：y∈[45, 155]（舌 ±5） |
| drawerTongueY | 50 | 抽屉舌 Y ∈ [50, b3Depth] |
| 功能板舌区 | cd/3 .. 2cd/3 | 非抽屉功能板舌在深度中三分位；槽 = 舌 ±6 |
| 铰链杯 ⌀/深/距边 | 35 / 12.5 / 22.5 | 杯心距门侧沿 |
| 铰链侧距公式 | clamp[75,100] | 75 + (长边−300)·25/300；侧门长边=高，下翻=宽 |
| frontClearance (fc) | 2.5 | 门缝 |
| 锁槽 | 55×15.5, r=7.75 | razor_long_rounded_1 圆角槽；心距侧 80（lockSideCenterOffset） |
| 锁 Z 偏移 | 上分隔心 − CPT/2 − 30.5 | 上分隔心 = (z1=H ? H−CPT/2 : zone.z1) |
| doorShelfMinZoneHeight | 350 | 区高低于此不生成门层板 |
| stove 切割区 | y ∈ [0, FPT+100] | 按 y 相交过滤——实际只切到 T1 |
| raised B4 高 / 避让缩短带 | 100 | 字面量 100（= supportStripWidth 但硬编码） |
| 加强条让位 | 缺口 y∈[0,85]；条槽 y∈[80,100] | 条↔层板接口，余量 1 |
| 舌长兜底 | CPT/2 − 0.5 | 槽信息缺失时 |
| 轮廓清理阈值 | 0.001 | 去重/共线/闭合判定（DXF 前） |

## 4. 板件清单（逻辑推导）

| id | 名称 | 料 | 平面/厚轴 | 几何逻辑 |
|---|---|---|---|---|
| B1 | 底前板 | FPT | XZ/Y | x∈[frontStopX0, frontStopX1]；z∈[0, BCH]；style_1: y∈[70−CPT−FPT, 70−CPT]（趾踢内缩 39）；style_2: y∈[−FPT, 0]（平前） |
| B2 | 底柜身板 | CPT | XZ/Y | 紧贴 B1 之后：style_1 y∈[70−CPT, 70]；style_2 y∈[0, CPT] |
| B3 | 底板 deck | CPT | XY/Z | y∈[0, 100]；z∈[BCH, BCH+CPT]；对每块 V 板后缘让位缺口（y∈[80,100], x = V 心 ± (CPT/2+0.5)） |
| T1-n | 顶前条 | CPT | XY/Z | y∈[0, 100]；z∈[H−CPT, H]；V 板缺口 y∈[80,100]（后缘）；灶台列按 x 切分 |
| T2-n | 顶后条 | CPT | XY/Z | y∈[cd−100, cd]；z∈[H−CPT, H]；V 板缺口 y∈[y0, y0+20]（前缘） |
| T3-n | 顶后竖条 | CPT | XZ/Y | y∈[cd−CPT, cd]；z∈[H−100, H]；V 板缺口 z∈[z0, z0+20]（底缘） |
| B4-n | 后下竖条 | CPT | XZ/Y | y∈[cd−CPT, cd]；z∈[0, 100]；V 板缺口 z∈[z1−20, z1]（顶缘）；轮拱 x 段切分 |
| drawer_divider | 抽屉分隔板 | CPT | XY/Z | 非底区 zoneType∈{drawer, down_flap} 在 zone.z0：z = z0 ± CPT/2；y∈[0, 150]；舌 y∈[50,150] |
| full_depth_shelf | 全深层板 | CPT | XY/Z | 非底区 zoneType∈{门, open, stove, custom} 在 zone.z0；y∈[0, cd]；舌 y∈[cd/3, 2cd/3] |
| door_shelf | 门层板 | CPT | XY/Z | 门板区 shelfEnabled 时；shelfTopZ = zone.z0+shelfHeight，centerZ = shelfTopZ−CPT/2；区高 ≥350 |
| avoidance-top / front / {id}-B4 | 轮拱封板 | CPT | XY·XZ | 见 §4.2 |
| {side}-side-strengthening-strip | 侧加强条 | CPT | YZ/X | 仅 frontVisible+strengtheningStripEnabled 门板区：y∈[0,100]；x 左 [innerX, innerX+CPT] / 右 [innerX−CPT, innerX]；z ∈ [max(zone.z0, BCH+CPT, 下邻z1+CPT/2), min(zone.z1, H−CPT, 上邻z0−CPT/2)] |
| FP（frontPanels） | 门板 | FPT | XZ/Y | y∈[−FPT, 0]；定位见 §4.3；含铰链杯/锁槽 |
| V0..Vn | 竖板 | CPT（外侧可 FPT） | YZ/X | 见 §4.1 |

条板 x 范围：B1/B2/B3/T1 用 frontStop = 侧板前可见时缩至 innerX，否则 [0, W]；T2/T3/B4 用 rearSupport = 前可见且**不** extend 时缩至 innerX，否则 [0, W]（默认 extend=true → 全宽）。

id 命名约定（pin 对拍须一致）：骨架板 B1/B2/B3；切分段 `T1-1`/`T2-2`…（segmentIndex 从 1）；区界功能板 `${column.id}-${zone.id}-bottom`；门层板 `${zone.id}-door-shelf`；加强条 `${side}-side-strengthening-strip-${zone.id}`；轮拱板 `${avoidance.id}-avoidance-top/-front`、`${avoidance.id}-B4`；门板 `${zone.id}-front-panel`（双门加 `-left/-right`，铰链孔 `-hinge-N`，锁 `-lock`）；竖板 `V0..Vn`。

### 4.1 V 板 YZ 轮廓（无轮拱、无前可见）

```
[frontY,0],[frontY,BCH],[bottomSlotRearY,BCH],[bottomSlotRearY,BCH+na],[0,BCH+na],[0,H−na],
[r,H−na],[r,H],[cd−na−r,H],[cd−na−r,H−na],[cd−na,H−na],[cd−na,H−r],
[cd,H−r],[cd,r],[cd−na,r],[cd−na,0],[frontY,0]
```
frontY = style_2 ? CPT : 70。按 z 分带读：z∈[0,BCH) 前缘 frontY；z∈[BCH,BCH+na) 前缘退到 80（B3 台阶）；z∈[BCH+na, H−na) 全深 [0, cd]（后缘 z<r 段在 cd−na——B4 接收缺口）；z∈[H−r, H−na) 后缘退到 cd−na（T3 接收缺口）；z∈[H−na, H] 仅存 y∈[r, cd−na−r]（前让 T1、后让 T3/T2，自成顶盖）。
- 位置：V0 x∈[0, 左板厚]，Vn x∈[W−右板厚, W]，中间 Vi x = 列边界 ± CPT/2。列净宽 clearX = V(i).x1 .. V(i+1).x0。
- 轮拱（替换末 4 点）：后下角挖 depth×height，上方留 B4 接收缺口：(cd, ah+r),(cd−na, ah+r),(cd−na, ah),(cd−ad, ah),(cd−ad, 0)。
- 前可见（frontVisible）：板前缘延伸至 y=−FPT；bchNotchEnabled=true 仅 z ≥ BCH+板厚+na 段延伸（保趾踢），false 则全高平直并封掉顶部让位（阈值 0.001 点改写实现）。
- 灶台列在最左/最右列时，相应外侧 V 板前顶接收缺口被移除（removeUnsupportedEdgeStoveVPanelNotches）。

### 4.2 轮拱避让（wheelAvoidances）

- B4 按 avoidance x 范围切分（<30 丢弃）；每个避让生成：avoidance-top（XY，y∈[cd−ad, cd]，z∈[ah−CPT, ah]）、raised B4（XZ，y∈[cd−CPT, cd]，z∈[ah, ah+100]，ah+100≤H 才生成）、avoidance-front（XZ，y∈[cd−ad, cd−ad+CPT]，z∈[0, ah−CPT]，ah>CPT 才生成）。
- 功能板缩后：z 与 [0,ah] 相交 → y1 ≤ max(y0, cd−ad−CPT)；与 [ah, ah+100] 相交 → y1 ≤ cd−CPT。

### 4.3 门板定位（frontPanels）

- x：首列 x0 = fc（左板前可见则 innerX+fc）；末列 x1 = W−fc（右板前可见则 innerX−fc）；中间边界：邻列含门板 → 各让 fc/2，邻列无门板 → 延伸边界 + CPT/2 盖住 V 板。
- z1（按优先级）：顶区（z1=H）→ H−fc；非顶区上邻为门板区 → zone.z1−fc/2；否则 → zone.z1+CPT/2（盖分隔板）。z0 对称：底区（z0=BCH）→ BCH（style_1）/ BCH+fc（style_2）；下邻门板区 → +fc/2；否则 → −CPT/2。
- double_door 拆两扇：中缝各让 fc/2。y∈[−FPT, 0]，厚 FPT。
- 铰链杯（⌀35 深12.5，距边 22.5）：侧门杯心 X = 铰链侧 +22.5，Z = [z1−sd, z0+sd]（useThreeHinges 加中点）；下翻杯心 Z = z0+22.5，X = [x0+sd, x1−sd]。sd = clamp[75,100]（公式见 §3）。
- 锁槽（55×15.5 圆角槽）：left_door 心 X = x1−80；right_door = x0+80；其余（抽屉/下翻/双门叶）= 宽中点；心 Z = 上分隔心 − CPT/2 − 30.5。

### 4.4 槽请求与解析（slotRequests → resolvedSlots）

- 每块功能板两端各发一条槽请求：左端对 V[列首]（side="right"），右端对 V[列末+1]（side="left"）——side 是 V 板视角。
- 槽型判定：侧板 grooveVisible=false（外侧不可见）**或**对侧邻区可见（门板/open/custom 区）→ half；否则 through。
- 舌长：through → CPT（**与侧板厚无关**，V0 门料 16 厚时舌仍 15）；half → 侧板厚/2；解析为 none → 0（板缩回齐身）。
- 槽 y 范围：抽屉板 [45, 155]；其他板 [cd/3−6, 2cd/3+6]（= 舌 ±6，上限夹板 y1）。槽 z = 板 z ± na/2。
- 双侧冲突解析（V 板左右都有 half 时）：无 machiningPreference → **error**；有偏好或仅单侧 → 按模式表解析。11 种模式语义：`left_half_right_none`（左半右无）、`right_half_left_none`（右半左无）、`*_half_*_through`（一侧半一侧贯通）、`left_half`/`right_half`/`left_through`/`right_through`（单侧）、`left/right_face_half_allowed`（对应侧半槽、另一侧贯通）、`through_only`（全贯通）。
- 解析后 through 槽若落在可见面 → warning（"Through slot may appear on visible side"）。
- 解析结果回写功能板轮廓：x0/x1 与 profileXY 按左/右舌长重算（bodyX 取 clearX，舌向外伸）。

### 已知坑（四条，重实现必须处理）

1. **坐标**：吊柜 y=0 在墙侧，厨房 y=0 在前缘（门在 −Y）。厨房按前缘这一套生成，不要套用吊柜的翻转。depth 含门厚（cd = depth−FPT），V0 前可见时 y 延伸至 −FPT。
2. **fallback/占位分支**：bottomClearanceStyle 非 "style_2" 一律按 style_1 兜底；`custom` 区行为等同 open 无专属形态；stove 切割区 y∈[0, FPT+100] 按相交过滤后**实际只切 T1**（T2/T3 的 y 范围永不相交），且 stove 区不生成任何门板/台面特征——半成品形态；columnType、lockPresetId 传入未用；b3InternalNotchDepth 残留；frontClearance/lockEnabled/hingeSettings 等经类型断言读取，types.ts 未声明。
3. **残留后处理 hack**（lounge 平移 hack 的同类）：侧板前可见与灶台 V 板缺口修正均为 0.001 阈值**事后点改写**（applySideFrontVisibility / removeUnsupportedEdgeStoveVPanelNotches），重实现应直接生成目标轮廓；功能板舌**两阶段**生成（先按 CPT/2 建型，槽解析后重写 x0/x1/profileXY）应一步到位；B3 对不相交的 V 板也产零宽 notch（仅 DXF 层丢弃）；raised B4 与缩短带用字面量 100。
4. **接缝声明覆盖不全**：仅 2 条（见 §6），源码注释自认 "v1: bottom rail-to-deck only"；V 板互锁、功能板舌槽、T 系与 V/B3、门板铰链均无声明。黄金 preset 13 个 DXF 面板中只覆盖 2 对。

## 5. 面层特征挂载（model-spec 语义映射）

kitchen 生成器无 faces 层，特征以数据结构直接给出（panelDxf + frontPanels）：

| 特征 | 归属 | 类型 | 尺寸/定位 |
|---|---|---|---|
| 功能板槽 | V*.body（YZ 面） | slot（through=贯通 / half=半厚 grooveDepth=板厚/2） | 槽 y = 舌 ±6（抽屉 ±5）；z = 板 z ± na/2；x = V 板全厚 |
| V 板让位缺口 | B3/T1/T2/T3/B4 | notch（折进外轮廓 notchVectors） | 各条让 V：位置见 §4 表；宽 = V 厚 + 1 |
| 层板让位缺口 | door_shelf | notch（front） | 宽 CPT+1，贴板身左/右缘（左：bodyX0..bodyX0+CPT+1），y∈[0,85]，配加强条 |
| 加强条槽 | side_strengthening_strip 轮廓 | 内槽 | y∈[80,100] × [shelf.z0−0.5, shelf.z1+0.5] |
| 铰链杯 | 门板背面（y=0 面） | hole ⌀35 深 12.5 | 定位见 §4.3 |
| 锁槽 | 门板正面 | rounded_slot 55×15.5 r7.75 | razor_long_rounded_1；定位见 §4.3 |
| 轮拱挖缺 | V 板轮廓 | notch | 后下角 depth×height |
| DXF audit | 全部面板 | — | closed / pointCount / duplicate / collinear / area + "Profile is not closed."/"Profile area is zero." 警告 |
| 调试输出 | debug | — | phase "kitchen_geometry_v0"：xBoundaries + 前立面/V 板轮廓/板俯视三张 SVG（非验收项） |

## 6. 接缝声明（声明式数据，kitchen v1）

| 声明 | 关系 | 几何 | 五金 |
|---|---|---|---|
| kt_b1_b3_bottom_rail_to_deck | B1 ↔ B3 | structural_butt_joint, edge_to_surface | screw_hole |
| kt_b2_b3_carcass_rail_to_deck | B2 ↔ B3 | structural_butt_joint, edge_to_surface | screw_hole |

声明按现存板件 id 过滤生效。host=B1/B2，target=B3。其余接缝未声明（见 §4 已知坑④）。

## 7. 校验规则

**errors（阻断）**：length/depth(cd)/height/materialThickness ≤ 0；BCH < 0 或 ≥ H；columns 空或缺失；列含 unassigned 区；列净宽 ≤ 0；**V 板左右同时 half 槽且无 machiningPreference（"Unresolved double-sided half-slot conflict"）**。

**warnings（不阻断）**：列区和 ≠ H−BCH（0.01 容差）；轮拱高 < BCH（V 板与底部系统冲突）；轮拱支板 bounds 无效跳过；raised B4 超 H 跳过；avoidance-front 高 ≤ CPT 跳过；灶台切空全部顶部条；门层板：区高 <350 / shelfTopZ 越区界；门板叶宽 ≤0 跳过；贯通槽出现在可见面；功能板因轮拱缩后；加强条 Z 区间无效。

## 8. 黄金验收数值（kitchen_base.json）

参数：W 887 × D 270 × H 880，CPT 15 / FPT 16 / fc 2.5 / BCH 55 style_1 / lock on；列1 k-col-1 宽 444（left_door 区 825，左板 door 料·前可见·无趾踢缺口·加强条·shelf 400）；列2 k-col-2 宽 443（drawer 区 300 上 + right_door 区 525 下）。cd = 254。

**errors = ["Unresolved double-sided half-slot conflict on V1."]（黄金集本身含此错误，属预期输出）；warnings = []。**

- 计数：boards 10 / vPanels 3 / frontPanels 3 / slots 4 / panelDxf 13 / declarations 2。xBoundaries [0, 444, 887]；列1 clear[16, 436.5]、列2 clear[451.5, 872]。
- V0（door 料 16）：x[0,16]，轮廓 [[−16,0],[−16,880],[152,880],[152,863],[237,863],[237,795],[254,795],[254,85],[237,85],[237,0],[−16,0]]。
- V1 = V2（mat 15）：V1 x[436.5,451.5]，V2 x[872,887]，轮廓 [[70,0],[70,55],[80,55],[80,71],[0,71],[0,864],[85,864],[85,880],[153,880],[153,864],[238,864],[238,795],[254,795],[254,85],[238,85],[238,0],[70,0]]。
- 板件 bbox：B1 [16,887, 39,55, 0,55]；B2 [16,887, 55,70, 0,55]；B3 [16,887, 0,100, 55,70]（notch 3 个，含 V0 零宽）；T1-1 [16,887, 0,100, 865,880]（notch 2：V1/V2，V0 心 8 越界被滤）；T2-1 [0,887, 154,254, 865,880]（notch 3）；T3-1 [0,887, 239,254, 780,880]（notch 3）；B4-1 [0,887, 239,254, 0,100]（notch 3）。
- door_shelf：bbox [1,444, 0,254, 440,455]，profileXY [[16,0],[436.5,0],[436.5,84.667],[444,84.667],[444,169.333],[436.5,169.333],[436.5,254],[16,254],[16,169.333],[1,169.333],[1,84.667],[16,84.667],[16,0]]；层板前缘让位缺口 x[16,32] y[0,85]。
- drawer_divider：bbox [444,887, 0,150, 572.5,587.5]，profileXY [[451.5,0],[872,0],[872,50],[887,50],[887,150],[444,150],[444,50],[451.5,50],[451.5,0]]。
- 加强条：bbox [16,31, 0,100, 70,865]，轮廓 (y,z) [[0,70],[100,70],[100,439.5],[80,439.5],[80,455.5],[100,455.5],[100,865],[0,865],[0,70]]。
- 门板：左门 x[18.5,442.75] z[55,877.5] w424.25 h822.5；铰链 ⌀35×12.5 心X 41，心Z [777.5, 155]（sd=100）；锁 55×15.5 心(362.75, 834.5)。抽屉面板 x[445.25,884.5] z[581.25,877.5] w439.25 h296.25；无铰链；锁心(664.875, 834.5)。右门 x[445.25,884.5] z[55,578.75] w439.25 h523.75；铰链心X 862，心Z [485.104, 148.646]（sd=93.6458）；锁心(525.25, 542)。
- 槽：shelf–V0 through 舌 15（=CPT，非侧板厚 16）x[0,16] y[78.667,175.333] z[439.5,455.5]；shelf–V1 half 舌 7.5；drawer–V1 half 舌 7.5；drawer–V2 through 舌 15 x[872,887] y[45,155] z[572,588]。

推导链示例（0.01 mm 对拍口径）：
- 门层板 z ← zone.z0(55) + shelfHeight(400) − CPT/2 = 447.5，板 z ∈ [440, 455]；舌区 y = [cd/3, 2cd/3] = [84.667, 169.333] ← cd(254) ← depth(270) − FPT(16)。
- 左门 x0 = innerX(16) + fc(2.5) = 18.5 ← 左板 door 料厚 16（frontVisible）；x1 = logicalX1(444) − fc/2(1.25) = 442.75 ← 右邻列含门板区。
- 锁心 Z = H(880) − CPT/2 − CPT/2 − 30.5 = 834.5（顶区）；右门锁心 Z = zone.z1(580) − 7.5 − 30.5 = 542。
- 铰链 sd：左门高 822.5 → 75+(822.5−300)·25/300 = 118.5 → 夹取 100；右门高 523.75 → 93.6458（不夹取）。
- V1 冲突来源：层板右端（对侧 right_door 可见 → half）+ 抽屉板左端（对侧 left_door 可见 → half），V1 双侧 half 且无偏好 → error。
- 桥接门禁断言（test_generator_declared_relationships / run_declared_generators_offline）：声明数 ≥2 且含 kt_b1_b3_bottom_rail_to_deck；reconcile ok、geometryOkCount ≥2；B1↔B3 关系 validate 通过且 safeForCut（可出螺丝孔预览/切割计划）。

## 9. 验收流程（与代码来源无关）

1. 按本规格在 Cab Lab 架构下独立实现（`generators/kitchen/` + rules.json + dim() 溯源 + boardFrame final、前脸 −Y）。
2. 以 §8 参数建黄金 preset；`node --experimental-strip-types scripts/pin-presets.ts kitchen --write` 生成钉值，测试用 checkPins 逐点对比（0.01 mm）。
3. audit：无未声明重叠；两条 B1/B2↔B3 接缝 touching；§8 的 V1 双侧半槽 error 须按预期复现（或重实现补偏好后显式记录行为差异）。
4. bench 爆炸视图：B 系统 → V 板 → 功能板 → T 系统 → 门板的装配次序与互锁方向合理。
5. 补齐 §4 已知坑④：V 板互锁、功能板舌槽等接缝声明补全后入库；坑② 的 stove 半成品形态按需求补全（灶台开孔/台面）。
