# 休闲柜组（Lounge，I/L/U/Parallel）逻辑规格 — cleanroom 重实现提取

> 目的：从既有实现提取**行为与逻辑规格**（不含实现代码），供不照搬代码的重新实现使用。
> 验收方式：数值对拍（golden preset + pins，0.01 mm）。
> 事实来源：参数/常量/接缝声明（数据）、测试断言数值（验收基准）。
> 坐标：I/L 的 y=0 为房侧、y=+D 为墙侧；PARALLEL 的 front 在 y∈[0,ppt]。**前脸 −Y**。平面图和三维放置：I 是角点、对角（整面）、高度；L 再加侧柜方向和侧柜宽度。U / Parallel 仍可由折线函数生成，这两个工具不画它们。

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
| lFrontAccess | NONE | DRAWER：框架式 L 的拐角段前板换成抽屉面 + 固定条 + 横条（§10.1）；FLAP / classic 仍是占位 |
| frontPanelThickness | 16 | L 端抽屉面 / 固定条门板料厚（新建时取 job 门板料） |
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

缺省是框架式 I（§10.2）；下表是 construction = "classic"（黄金 `golden-i`）。

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
| {left,right}_support_strip | YZ | 顶部 100 高；开轮拱避让时下到避让顶 AH（19'6 Rear Door）；y ∈ [ppt, D]；x 贴**外端墙侧** |

上表是 construction = "classic"（黄金 `golden-parallel`）；缺省是框架式平行沙发，见 §10.3。

中柜（hasMiddleCabinet，置于 gap 正中，靠墙）：cabinet_top / cabinet_bottom / cabinet_side×2（门板厚 dpt = MIDDLE_CABINET_DOOR_THICKNESS 16）/ cabinet_divider（柜体料 MIDDLE_CABINET_DIVIDER_THICKNESS 15，z = startHeight + (H − 15)/2；侧板槽高 15 + 1、深 7.5，舌头 7，长 = 隔板深 / 2，槽再长 5）/ cabinet_door（⌀35 杯深 12.5、22.5 距外边、铰链距上下 80；RAZOR_ROUNDED 锁槽 55 × 15.5，**中心在隔板底下 LOCK_DROP 30.5**，**离两扇门对缝 lockSideDistance 30 + MIDDLE_CABINET_LOCK_EXTRA 35 = 65**——插件规则；早期移植错放在门顶下、离对缝 30，2026-09-29 改正）。

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
- 占位项告警：lFrontAccess 在 classic / 非 L 上、FLAP，框架式 L 的轮拱避让。

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

## 10. 框架式 L（construction = "frame"，L 形缺省；21 Bunk 新卡座）

旧做法（construction = "classic"，§8 黄金 `golden-l`）是外板高 H−ppt、顶板盖上、顶板正中开口放带台阶的小盖子。框架式把外板做满到 H，整段顶面就是一块盖子，嵌在外板之间、顶面齐平，坐在内部托盖框架上。全部 18 隔断料（数控里旧卡座也是 18 White Stipple 隔断料），没有门板料、没有翻门。

参数：L = mainWidth（沿墙总长），Dm = mainDepth，Dl = lWidth（拐角段往房间深），Wl = lDepth（拐角段沿墙宽，≥ L_MIN_WING_WIDTH 300，否则 error），H，T = ppt。主段长 Lm = L − Wl。d = 离墙深度（y = Dl − d）。先按拐角段在右（RIGHT）排，LEFT 整套沿墙镜像。常数（rules.json）：墙缝 c = FRAME_WALL_GAP 1、缺口余量 s = FRAME_SLOT_CLEARANCE 1、盖缝 g = FRAME_LID_GAP 2、托条高 hr = FRAME_INNER_RAIL_HEIGHT 100、咬合缺口 FRAME_HALVING_NOTCH 20、咬合间隙 FRAME_HALVING_GAP 5、拉手孔 ⌀ FRAME_FINGER_HOLE_DIAMETER 50。横条底 = H − T − hr；竖板缺口底 = 横条底 + 20 − 5；托盖面 = H − T。

| 板 | 平面 | x（沿墙） | d（离墙） | z | 说明 |
|---|---|---|---|---|---|
| main_end | YZ | 0..T | 0..Dm−T | 0..H | 墙角缺口 d 0..c+T、z 缺口底..H |
| main_front | XZ | 0..Lm | Dm−T..Dm | 0..H | |
| l_side（交接共用） | YZ | Lm..Lm+T | 0..Dl | 0..H | 墙角缺口同上 |
| l_outer_side | YZ | L−T..L | 0..Dl | 0..H | 墙角缺口同上 |
| l_front | XZ | Lm+T..L−T | Dl−T..Dl | 0..H | |
| back_rail | XZ | 0..L | c..c+T | 横条底..H | 底边在 main_end（0..T+s）、l_side（Lm−s/2..Lm+T+s/2）、l_outer_side（L−T−s..L）开 20 缺口 |
| main_end_support / main_l_support | YZ | T..2T / Lm−T..Lm | T+c..Dm−T | 0..H−T | 顶部两个缺口 d T+c..2T+2c、Dm−2T−c..Dm−T，z 缺口底..H−T |
| main_rail_back / main_rail_front | XZ | T..Lm | T+2c..2T+2c / Dm−2T−c..Dm−T−c | 横条底..H−T | 两端底边 20 缺口 T..2T+s、Lm−T−s..Lm |
| l_support_inner / l_support_outer | YZ | Lm+T..Lm+2T / L−2T..L−T | T+c..Dl−T | 0..H−T | 拐角段不设托条 |
| main_lid | XY | T+g..Lm−g | T+c+g..Dm−T−g | H−T..H | ⌀50 正中；超过 FRAME_LID_MAX_LENGTH 分块，见 §10.2 |
| l_lid | XY | Lm+T+g..L−T−g | T+c+g..Dl−T−g | H−T..H | ⌀50 正中 |

封边（EDGE_BAND_THICKNESS_MM 1，全部柜体色）：座面一圈的上边（main_front、l_front、main_end、l_side、l_outer_side、back_rail，墙角缺口处不封）；l_side、l_outer_side 朝房间的前边；两块盖子四边；储物格里看得见的边——main_rail_back / main_rail_front 下边、back_rail 缺口之间的下边。端头一律当作顶墙，不封；托板四边都顶着板或压在盖子下，不封。

盖子的拉手孔是贯通圆孔（face A `hole` through），3D 按圆挖穿（renderer/boardGeom.js throughLoops）。

黄金 `rogue-l`（2087 × 960 × 420，Dm 560，Wl 560，RIGHT）：14 块板，主段盖 1505 × 519，拐角段盖 520 × 919。靠墙面只有 back_rail，为以后的轮拱避让留位；框架式 L 暂不做轮拱（wheelAvoidanceEnabled 只给 warning）。

### 10.2 框架式 I（I 形缺省；construction = "classic" 保留旧做法）

就是框架 L 的主段单独成一段：L = mainWidth，D = mainDepth，y = D − d。前板满长盖住两块端板的前边；两头都当作顶墙。

| 板 | x | d | 说明 |
|---|---|---|---|
| i_front | 0..L | D−T..D | 满高 |
| i_left_end / i_right_end | 0..T / L−T..L | 0..D−T | 满高，墙角缺口同 main_end |
| back_rail | 0..L | c..c+T | 两端底边 20 缺口（0..T+s、L−T−s..L） |
| i_left_support / i_right_support | T..2T / L−2T..L−T | T+c..D−T | 同 main_end_support |
| i_rail_back / i_rail_front | T..L−T | 同主段 | 两端 + 每块中间托板处底边 20 缺口 |
| i_lid / i_lid_k | 见下 | T+c+g..D−T−g | ⌀50 正中 |

盖子分块（I 和 L 主段共用 frameRun）：盖区 a = x0 + g 到 b = x1 − g；块数 k = ⌈(b − a) / FRAME_LID_MAX_LENGTH 1600⌉；每块长 (b − a − (k − 1)g) / k，块间 g。每条缝下一块中间托板 `<run>_mid_support_j`（T 厚，截面同端头托板，中心在缝中线，两块盖子各压 T/2 − g/2），和两根内托条十字半搭：托板从顶往下开槽到缺口底，托条在 cx − T/2 − s/2..cx + T/2 + s/2 从底往上开 20。k = 1 时盖子 id 不带序号（i_lid / main_lid）。封边同 §10：前板、两端上边，后横条上 / 下边，托条下边（缺口之间），盖子四边；托板不封。

黄金 `frame-i`（2000 × 600 × 420）：11 块板，两块盖 979 × 559，中间托板 x 991..1009。1400 长一整块 1360 × 559。

### 10.3 框架式平行沙发（PARALLEL 缺省；construction = "classic" 保留旧做法）

19'6 Rear Door 的咖啡厅卡座：两段面对面，沿墙（y = D，车壁 / 外墙）排，每段从外侧端墙（x 0 / totalW）到朝中缝的座面板，从墙伸到过道（y 0）。每一段的做法同框架 L 的拐角段（两块托板托盖子，没有内托条）。**后横条永远贴墙放**；在中缝那一头插进座面板内侧的**半槽**（不打通，从中缝看不到），在外端顶端墙。右段沿中线镜像。d = 离墙深度（y = D − d）。

| 板（左段；右段镜像） | x | d（离墙） | z | 说明 |
|---|---|---|---|---|
| left_side 座面板 | SW−T..SW | 0..D | 0..H | 开轮拱时墙端让出 d 0..AD、z 0..AH；内侧面（左段 B / 右段 A）开后横条半槽 |
| left_front 过道端板 | 0..SW−T | D−T..D | 0..H | 夹在端墙和座面板之间 |
| left_rear_rail 后横条 | 0..SW−T+tg | c..c+T | 横条底..H | 贴墙；开轮拱时横条底 = AH（落在避让盖板上），否则 H − T − FRAME_INNER_RAIL_HEIGHT；tg = T/2 − FRAME_HALF_SLOT_TONGUE_GAP 0.5 = 8.5 |
| 半槽（座面板上） | — | c − s/2..c+T+s/2 | 横条底 − s/2..H（顶部开口） | 深 T/2 = 9，宽 T + FRAME_SLOT_CLEARANCE（19）——同厨房 V 板半槽规则 |
| left_outer_support / left_inner_support | 0..T / SW−2T..SW−T | T+c..D−T | 0..H−T | 贴端墙 / 贴座面板；开轮拱时让出 d ..AD、z ..AH |
| left_lid | g..SW−T−g | T+c+g..D−T−g | H−T..H | 搭在两块托板上，⌀50 拉手孔 |

轮拱盖板 parallel_avoidance_top / _front 照旧横跨总宽。校验：轮拱深 AD 在 2T + c 到 D − 2T 之间，高 AH 在 T 到 H − T − 100 之间（后横条至少 100 + T 高），否则 error。中柜同 §5。封边：座面板、过道端板、后横条上边；座面板朝过道的前边；后横条下边（落在避让盖板上时不封）；盖子四边；避让盖板前边；托板不封；中柜门四边门板色，中柜柜体离墙的每条边（隔板只封前边）。

过道端抽屉（aisleAccess = "DRAWER"，两段一起）：和 §10.1 L 端抽屉同一个 frameDrawer——`<side>_front` 不出，换成 `<side>_drawer_strip`（门板料 frontPanelThickness，x 0..SW−T，从顶往下 100 + T）、`<side>_drawer_front`（四周 2，锁孔上边离面顶 22.75）、`<side>_drawer_rail`（固定条背后 100 深，夹在两块托板之间，后 70 舌头 8.5 进托板朝抽屉那面的槽）；托板伸到固定条背面，盖子前边离固定条 2；座面板朝过道的前边改封门板色。开轮拱时轮拱深不能碰到抽屉横条的槽（error `Parallel drawer: …`）。

中柜（框架平行沙发）：只定宽、深、高——开轮拱时站在避让盖板上表面（z = AH），没开时站在地上（z = 0），middleCabinet.startHeight 不用（上面以后另放 bench top）。hasMiddleCabinet 没设时，两段之间 ≥ MIDDLE_CABINET_MIN_WIDTH 300 就自动放；middleCabinet.width 没设时取 MIDDLE_CABINET_WIDTH 600 和中间空隙里小的那个；比空隙宽是 error（会站进座位里）。实际尺寸在 `result.params.middleCabinet`（null = 没有）。

黄金 `rear-door-parallel`（1880 × 900 × 420，SW 560，AD 380 / AH 270，中柜 502 × 270 × 457 站在避让盖板上 z 270 → 727）：21 块板，盖子 538 × 859。

### 10.1 L 端抽屉（lFrontAccess = "DRAWER"，只在框架式 L）

照 21 Bunk classic 卡座 L 端的抽屉口（Component863 / 864 / l_front），换到框架上。没有抽屉盒。`l_front` 不再出，换成三块板（FT = frontPanelThickness，缺省 FRAME_DRAWER_FRONT_THICKNESS 16，门板料）：

| 板 | 料 | 范围（右侧拐角段，d 从墙量） |
|---|---|---|
| l_drawer_strip 固定条 | 门板 FT | 两侧板板面之间；d Dl − FT → Dl；z H − (FRAME_DRAWER_STRIP_REVEAL 100 + T) → H（T 18 时 118 高：classic 的 100 固定条 + 18 顶板） |
| l_drawer_front 抽屉面 | 门板 FT | 离两侧板板面、离固定条、离地各 FRAME_DRAWER_GAP 2；锁孔 LOCK_WIDTH 55 × LOCK_HEIGHT 15.5，水平居中，中心离面顶 LOCK_DROP 30.5（上边离面顶 22.75） |
| l_drawer_rail 抽屉顶横条 | 柜体 T | 固定条背后，d Dl − FT − FRAME_DRAWER_RAIL_DEPTH 100 → Dl − FT；底边和固定条底边平，z H − 118 → H − 100；夹在两块拐角段托板之间，后 70（RAIL_DEPTH − FRAME_DRAWER_RAIL_PLAIN_FRONT 30）两头各伸 T/2 − FRAME_DRAWER_TONGUE_GAP 0.5 = 8.5 的舌头 |

托板（l_support_inner / outer）伸到固定条背面（Dl − FT），靠抽屉一面开横条槽：深 T/2 = 9，高 T + FRAME_SLOT_CLEARANCE（19，上下各 0.5），长 = 舌头 + 2 × FRAME_DRAWER_POCKET_OVERRUN 5 = 80。托板满高落地，以后当滑轨安装面。拐角段盖子前边离固定条 FRAME_LID_GAP 2（比无抽屉深 2）。

封边：抽屉面、固定条四边门板色；l_side、l_outer_side 朝房间的前边（抽屉那一面两边的条子）改封门板色；横条朝墙的后边、两块托板朝房间的前边柜体色（抽屉拉出来看得见）。横条落不下（抽屉面放不下锁孔）时报 `L drawer: height H leaves only N …`。classic 结构或 FLAP 只给 warning，不改几何。

黄金 `rogue-l-drawer`（rogue-l + DRAWER，FT 16）：16 块板，固定条 524 × 118，抽屉面 520 × 298，横条 505 × 100（舌头含在内），拐角段盖 520 × 921。
