# 休闲柜组（Lounge，I/L/U/Parallel）逻辑规格 — cleanroom 重实现提取

> 目的：从既有实现提取**行为与逻辑规格**（不含实现代码），供不照搬代码的重新实现使用。
> 验收方式：数值对拍（golden preset + pins，0.01 mm）。
> 事实来源：参数/常量/接缝声明（数据）、测试断言数值（验收基准）。
> 坐标：I/L 的 y=0 为房侧、y=+D 为墙侧；PARALLEL 的 front 在 y∈[0,ppt]。**前脸 −Y**。放置层走折线（I 两点 / L 三点 / U 四点 / Parallel 三点）。

## 1. 模块定位

- 房车休闲区柜组：沿墙的座椅柜（seat/lounge），四种风格共用一套截面逻辑。
- 折线即后缘（每段与前段正交）；截面深度朝房间生长。
- U 形 = 包围盒内三条 I 形段（开口朝局部 Y=0）；Parallel 沿 X 摆放时 rotZ 90°，使朝向轴保持局部 X。

## 2. 输入参数（normalizeSettings 全量默认值）

| 参数 | 默认 | 说明 |
|---|---|---|
| style | L_SHAPE | L_SHAPE / I_SHAPE / PARALLEL / U_SHAPE |
| height | 420 | 总高 |
| partitionPanelThickness (PPT) | 18 | 全部板厚（柜组单一厚度体系） |
| wheelAvoidanceEnabled | false | 轮拱避让开关 |
| mainWidth / mainDepth | 2000 / 600 | 主段（I/L 用） |
| lWidth / lDepth / lPosition | 1600 / 800 / RIGHT | L 段（LEFT/RIGHT） |
| topLidEnabled | true | 顶板带检修口+盖板 |
| lFrontAccess | NONE | DRAWER/FLAP（占位，不改几何） |
| totalWidth / singleLoungeWidth | 4000 / 1500 | PARALLEL 总宽/单段宽 |
| depth | 800 | PARALLEL 段深 |
| avoidanceDepth / avoidanceHeight | 300 / 250 | 轮拱避让深/高 |
| hasMiddleCabinet | false | PARALLEL 中柜开关 |
| middleCabinet.* | 见 §3 中柜常量 | 中柜参数组 |

派生量：`ppt = max(1, PPT)`；`panelHeight = H − ppt`（顶板吃掉 PPT）。

## 3. 规则常量

| 常量 | 值 | 语义 |
|---|---|---|
| DEFAULT_HEIGHT | 420 | 高度缺省 |
| DEFAULT_PPT | 18 | 板厚缺省 |
| OPENING_RADIUS | 50 | 顶板检修口圆角 |
| LID_CLEARANCE_EACH_SIDE | 1.5 | 盖板四周单边缩量 |
| FINGER_HOLE_DIAMETER | 40 | 盖板指孔径（贯通） |
| L_LEG_WIDTH | 100 | 支撑 L 型两腿宽（竖腿/横腿） |
| TOP_SUPPORT_STRIP_HEIGHT | 100 | 顶部支撑条高 |
| 中柜 width/depth/height | 600 / 350 / 500 | 中柜体量 |
| 中柜 startHeight | 300 | 中柜离地板起始高 |
| 中柜 doorPanelThickness / doorClearance | 15 / 2 | 门厚/门缝 |
| 中柜 lockSideDistance | 30 | 锁槽圆角槽心距门侧 |
| 中柜 hingeSideDistance | 80 | 铰链侧距 |
| 中柜 hingeCupCenterFromEdge / ⌀ / 深 | 22.5 / 35 / 12.5 | 铰链杯 |

## 4. 共用构件逻辑（全风格）

**顶板 top_panel**（XY / 厚 ppt）：
- 覆盖所属 bounds；z ∈ [H−ppt, H]。
- 检修口 opening：中心位于面板 ¼..¾（两轴同比例）→ 尺寸 = 面板 W/2 × D/2，圆角 50，台阶宽/高 = ppt/2。
- 盖板 lid（topLidEnabled 时）：opening 每边 −1.5；厚 ppt；z 同顶板段；中心 ⌀40 贯通指孔；圆角 50−1.5。

**支撑 L 型 l_support_profile**（YZ / 厚 ppt，轮廓）：
```
[[0,0], [0,H'], [L,H'], [L,H'−100], [min(100,L), H'−100], [min(100,L), 0], [0,0]]
```
（L = 段深−ppt，H' = panelHeight；上端全高，向下留 100 宽竖腿，尾部 100 回折成横腿。）

**轮拱避让**（wheelAvoidanceEnabled 且 0<AD<D、0<AH<panelHeight）：
- 侧板轮廓切角：墙侧（y=0）下部挖 AD 深 × AH 高的缺口。
- I 形另加两块封板：avoidance_top（XY，W×AD，z∈[AH−ppt, AH]，y∈[0, AD]）、avoidance_front（XZ，W×(AH−ppt)，y∈[AD−ppt, AD]，z∈[0, AH−ppt]）。
- PARALLEL 有对应封板变体；L 形当前仅警告提示（占位）。

## 5. 各风格板件清单

### I_SHAPE（5–7 板）

| id | 平面 | 几何 |
|---|---|---|
| i_front | XZ | 全宽 W；y ∈ [D−ppt, D]（房侧）；z 0..panelHeight |
| i_left_side / i_right_side | YZ | 藏于 front 后：y ∈ [0, D−ppt]；x ∈ [0, ppt] / [W−ppt, W]；含避让切角 |
| i_top | XY | 全幅 W×D + 检修口/盖板 |
| i_avoidance_top / _front | XY/XZ | 仅避让启用且 AH>ppt |

footprint：i = 全幅 [0..W, 0..D]。

### L_SHAPE（默认 8 板）

footprint：main = [0..mainW, 0..mainD]；l = LEFT 时 x∈[0, lW]，RIGHT 时 x∈[mainW−lW, mainW]，均 y∈[0, lDepth]；mainVisible = main 去掉 l 占位。

| id | 平面 | 几何 |
|---|---|---|
| main_front | XZ | 宽 = mainW−lW（可见段）；y ∈ [mainDepth−ppt, mainDepth] |
| main_top | XY | 覆盖 mainVisible + 检修口/盖板 |
| main_left_l_piece / main_right_l_piece | YZ | 可见段两端 L 型支撑；x 贴两端各 ppt；y ∈ [ppt, mainDepth] |
| l_front | XZ | 宽 = lW − ppt（预留抽屉/翻板，当前仅减料）；x 定位偏移 +ppt；y ∈ [lDepth−ppt, lDepth] |
| l_side | YZ | 全深 lDepth；x 在 l 段靠 main 一侧端（LEFT: lX0..lX0+ppt；RIGHT: lX1−ppt..lX1），placement 含 −(lWidth−ppt) 平移（重实现应直接烘焙坐标） |
| l_side_strip | YZ | 顶部 100 高支撑条；y ∈ [0, lDepth−ppt]；x 在 l 外端 |
| l_top | XY | 全 l bounds + 检修口/盖板 |

### PARALLEL（每段 4 板 ×2 + 可选中柜）

gap = totalWidth − 2×singleLoungeWidth。左段 x∈[0, SW]，右段 x∈[totalW−SW, totalW]。每段：

| id | 平面 | 几何 |
|---|---|---|
| {left,right}_front | XZ | 宽 SW−ppt；**y ∈ [0, ppt]**（与 I/L 相反，重实现须统一） |
| {left,right}_side | YZ | 全深 D；x 贴**中缝侧**端（左段 xEnd−ppt..xEnd；右段反之）——侧板面向 gap |
| {left,right}_top | XY | SW×D + 检修口/盖板 |
| {left,right}_support_strip | YZ | 顶部 100 高；y ∈ [ppt, D]；x 贴**外端墙侧** |

中柜（hasMiddleCabinet，置于 gap）：cabinet_top / cabinet_bottom / cabinet_side×2 / cabinet_divider / cabinet_door（含铰链杯孔 + RAZOR_ROUNDED 圆角锁槽，⌀35 杯、22.5 距边、锁槽心距侧 30、铰链侧距 80）；startHeight 起算。

### U_SHAPE — ⚠️ 已知缺口

U 形是包围盒内三条 I 形段，开口朝局部 Y=0。

## 6. 接缝声明（声明式数据，L 形 v1）

| 声明 | 关系 | 几何 | 五金 |
|---|---|---|---|
| lg_main_front_to_top | main_front ↔ main_top | edge_to_surface | screw_hole |
| lg_l_front_to_side | l_front ↔ l_side | edge_to_surface | screw_hole |
| lg_l_front_to_top | l_front ↔ l_top | edge_to_surface | screw_hole |

声明按现存板件过滤。I/PARALLEL/中柜无声明（v1 范围）——重实现建议补全后入库。

## 7. 校验规则（全部为 warning，无 error）

- L：lWidth < mainWidth 才合法。
- I：W > 2·ppt、D > 2·ppt、H > ppt；避让深 < D、避让高 < H−ppt。
- PARALLEL：totalW ≥ 2·SW（否则两段重叠）；避让同上。
- 中柜：startHeight > 避让高；宽 ≤ gap、深 ≤ D；宽 > 3×门缝、高 > 2×门缝；2×铰链侧距 < 门高。
- 占位项告警：lFrontAccess 非 NONE、L 形的轮拱避让。

## 8. 黄金验收数值（L 默认参数：H420/W2000/D600/lW1600/lD800/RIGHT）

- 8 板 / 2 盖 / 2 检修口；errors=0。
- footprint.l = {x0:400, x1:2000, y0:0, y1:800}。
- main_front：宽 400，placement {0, 400, 582, 600, 0, 402}。
- l_front：1585 宽 → 实测 1582（lW−ppt=1582），placement {418, 2000, 782, 800, 0, 402}，高 402。
- L 型支撑：长 582，outer [[0,0],[0,402],[582,402],[582,302],[100,302],[100,0]]。
- l_side：placement {400, 418, 0, 800, 0, 402}。
- l_side_strip：高 100，placement {1982, 2000, 0, 782, 302, 402}。
- 检修口 200×300；盖板 197×297；指孔 ⌀40。

## 9. 验收流程

1. 按本规格在 Cab Lab 架构下独立实现（generators/lounge/ + rules.json + faces.ts + dim()）。
2. 用 §8 数值 + PARALLEL/I 黄金参数生成 presets，`pin-presets.ts --write` 后 checkPins（0.01 mm）。
3. audit 无未声明重叠；三声明接缝 touching。
4. bench 爆炸视图验证装配；floor plan 折线放置（I/L/U/Parallel 四形态）。
5. 补 U_SHAPE 真实现（规格见 §5）。
