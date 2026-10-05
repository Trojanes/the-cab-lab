# Bunk bed across the rear — spec

Module `bunkBed` (`generators/bunkBed`), rail Bunk bed → Across. Reference job: 21 Bunk
(`Rouge/21 Bunk/21 Bunk Bed and Bathroom.step`, assembly "TunnelBoot and Bunk Bed").

## Status

- Placement (four clicks) is done. The tool ends after the fourth click.
- Every board of the 21 Bunk assembly is generated, plus the strips under the upper base
  (14 boards for 21 Bunk): the front partition (`FP`, or `FP_1` / `FP_2`), `BOOT_BACK`,
  `BOOT_SIDE_L` / `_R`, `DECK`, `UPPER_BASE`, `LEDGER_FRONT_L` / `_R`, `LEDGER_BACK`,
  `END_LOWER` / `END_UPPER`, `BOOT_DOOR`, `SILL`.
- The layout regions stay for selection and the front view; `boot`, `deck` and `upperBase`
  list their boards, so 3D draws the boards instead of blocks. `lower` / `upper` are voids.
- The boot door stands 16 proud of the partition: `footprintBoxes` gives the box plus the
  door, so overlap checks see it.
- The boot door is a down flap: hinged at the bottom (plates on the sill), a catch at the top.

## Frame

Local X left → right seen from the room (0..length, wall to wall), Y from the room face of
the front partition (0) to the rear wall (depth, partition included), Z up.
`endSide` RIGHT | LEFT = ladder + end cubby, seen from the room facing the bunk.

## Boards

### Front partition (前板) — done, with top / bottom clearance

Built by `generator.ts` + `partition.ts`. Partition stock: thickness, floor gap and ceiling gap
are copied from the job setup (`partitionThickness`, `floorClearance`, `ceilingClearance`).
Every x comes from a wall (`opening.upper.far` / `.ladder`, `ladder.near` / `.far`,
`opening.lower.far` / `.ladder`, `access.near` / `.far`), so `endSide` only mirrors them.
Openings are through: the lower opening and the ladder holes are holes, the boot access and
the upper opening are notches in the outline. When the board is past one 1200 × 2400 sheet
(either way round) it is cut once at `round(W / 2 / 10) × 10`; an opening the cut crosses
becomes a notch in each piece. Joint `FP_1_FP_2_cut` (butt). 21 Bunk output matches the STEP:
cut 1140, ladder holes u 265 → 515 on the right piece.

- The front partition board does **not** run floor to ceiling: it stops a clearance above the
  floor and a clearance under the roof, the same way partition walls do
  (`walls.js`: bottom = floor + `floorClearance`, top = roof − `ceilingClearance`).
- Decided (2026-09-29): the values are the job's partition setup, `stock.partition`
  `floorClearance` / `ceilingClearance` — the same numbers the partition walls use. They are
  copied into the cabinet params (`floorClearance`, `ceilingClearance`) when the bunk is drawn,
  like the other stock numbers; a later setup change does not move an existing bunk.
- The ceiling gap is already in the envelope: placement sets `height` = roof − `ceilingClearance`,
  so the partition top is the bunk top. The floor gap is inside the envelope (the boot stands
  on the floor).
- Already in the generator, through `dim()`: `layout.partition` `{ z0, z1 }` —
  `partition.z0 = floorClearance`, `partition.z1 = H`. The board uses these.
- 21 Bunk: its job setup was floor 2 / ceiling 4 (ceiling 1965 → top 1961). The STEP partition
  starts at z 0; the new rule puts it at 2.

Openings in the partition (heights from the two decks; 21 Bunk values):

| Line | Formula | 21 Bunk |
|---|---|---|
| lower opening bottom | deck top + 130 | 548 |
| lower opening top | upper base underside − 30 | 1147.5 |
| upper opening bottom | upper base top + 125 | 1326.5 |
| ladder holes | 3 holes, 50 apart, sharing the lower opening's height | 548 / 764.5 / 981, 166.5 high |

Along X (rules): both openings 600 from the far wall, the upper one also 600 from the ladder
wall; ladder holes 250 wide, 20 inside the upper opening's ladder edge; 80 between the lower
opening and the holes; boot access 435.5 wide, 914.5 from the ladder wall, floor → deck underside.
R100 opening corners (the STEP's one R120 corner is not kept), R30 ladder holes.
The STEP ladder holes are 166 / 167 high (rounding); the rule gives 166.5 each.

### Behind the partition, the boot door and the sill

Stocks: carcass (`carcassThickness`), partition (`partitionThickness`) and door
(`doorThickness`, door colour and sides) are copied from the job setup. Deck 18 and upper base
24 are rules (`DECK_THICKNESS_MM`, `UPPER_BASE_THICKNESS_MM`; 24 confirmed 2026-09-29).

| Board | Stock | Where (21 Bunk) |
|---|---|---|
| `BOOT_BACK` | carcass 15 | against the rear wall, y D − 15 → D, floor → deck underside |
| `BOOT_SIDE_L` / `_R` | carcass 15 | behind the partition (y T → T + 15), floor → deck underside, either side of the access (0 → 925, 1360.5 → 2275) |
| `DECK` | partition 18 | y T → D, wall to wall, deck underside → deck top |
| `UPPER_BASE` | partition 24 | y T → D, wall to wall, upper base underside → top |
| `END_LOWER` / `END_UPPER` | door 16 | across each bunk at the cubby (`CUBBY_WIDTH_MM` 284 from the ladder wall: 1975 → 1991), deck → upper base / upper base → top; colour toward the bunk; hand hole 80 in from partition and wall, 80 under the top, 250 high, R30 |
| `LEDGER_BACK` | partition 18, on edge | against the rear wall, wall to wall, 100 high, top = upper base underside (2275 × 100) |
| `LEDGER_FRONT_L` / `_R` | partition 18, on edge | against the partition's back face, 100 high, top = upper base underside; from each side wall to the first opening: the lower opening on the far side (0 → 600), the ladder holes on the ladder side (1655 → 2275) |
| `BOOT_DOOR` | door 16 | down flap on the room face (y −16 → 0), over the access by 10 each side, 3.5 off the floor, 8.5 over the deck underside; colour to the room. Catch (门扣): lock slot 55 × 16 round-ended (the STEP's straight 39 + ends), centred, centre 30.75 under the deck underside. Hinges: two Ø35 × 12 cups on the inside face, 22.5 up from the bottom edge, 100 from each side; the plates fix to the sill |
| `SILL` | partition 18 | on the floor, the flap hinges' fixed side; tongue (access − 0.5, flush on the side away from the ladder) through partition + inner side (y 0 → 33); body 45 deep behind the inner sides, 55 past the tongue each side; Ø11 half-circle reliefs cut into the body beside the tongue corners |

The end panels (and the boot flap) are door panels: always the job's door stock — same thickness
and sides as the doors (`doorThickness`, 16 on 21 Bunk). `END_UPPER` takes colour A
(`doorColorName`); `END_LOWER` and `BOOT_DOOR` take colour B (`doorColorNameB`, or A when the
job has one colour). Never give them a thickness of their own.

`END_LOWER` stands up to the upper base, so every strip that passes it goes through a notch
in its top corner (strip thickness × 100): for 21 Bunk the rear strip and the ladder-side front strip.

Joints recorded: deck on the boot back and inner sides, end panels between the decks, the
upper base on the three strips, the strips through the end panel's notches, the flap hinged to
the sill, the partition's sheet cut. Box overlaps only where an outline keeps the boards apart:
the sill's tongue (partition notch, between the inner sides) and the strips in the end panel's
notches (tested).

## Open

- Ladder-side front strip: it stops at the ladder holes (1655). Running it to the lower opening
  (1325) would cover the top 70 of the highest hand hole from behind.
- Flap hinge model and catch hardware: cup positions follow the workshop flap rule; the hinge
  plate screws on the sill are not drilled (as on the other modules).
