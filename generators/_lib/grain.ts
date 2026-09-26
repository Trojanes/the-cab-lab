/**
 * Wood grain direction on colour faces.
 *
 * The module stores one choice per group (`params.grain.front` / `.side`:
 * "horizontal" | "vertical"); missing groups take the module default. Every
 * colour face (A / B carrying `finish.colour`) of a board in a group gets
 * `finish.grain`: "u" or "v", the board-local axis the grain runs along
 * (docs/model-spec.md: XZ → u = x, v = z; YZ → u = y, v = z; XY → u = x, v = y).
 * Horizontal = u for every plane; vertical = v (z on upright boards, y — the
 * depth — on flat ones).
 *
 * Textured HPL comes on 1200 × 2400 sheets and cannot be turned: across the
 * grain a board may be at most SHEET_CROSS_MAX_MM, along it SHEET_ALONG_MAX_MM
 * (20 mm trim on each). Acrylic has no direction and is not checked. A board
 * past a limit is a grain issue, reported on `result.grain.issues` — not a
 * validation error, so front views and the rest of the cabinet still build.
 */
import type { Board, Face } from "./model.ts";

export type GrainDir = "horizontal" | "vertical";
export type GrainGroup = "front" | "side";
export type GrainParams = Partial<Record<GrainGroup, GrainDir>>;

/** Sheet 1200 wide less 20 trim: the most a board may measure across the grain. */
export const SHEET_CROSS_MAX_MM = 1180;
/** Sheet 2400 long less 20 trim: the most a board may measure along the grain. */
export const SHEET_ALONG_MAX_MM = 2380;

export interface GrainIssue {
  board: string;
  group: GrainGroup;
  dir: GrainDir;
  /** "across" = the side perpendicular to the grain is too long; "along" = the grain side. */
  side: "across" | "along";
  /** The measured side, mm, and which board direction it is ("high", "wide", "deep"). */
  length: number;
  word: string;
  limit: number;
  message: string;
}

export interface GrainResult {
  /** The resolved direction of each group this module has. */
  groups: Partial<Record<GrainGroup, GrainDir>>;
  /** Groups with at least one colour board right now (a tall cabinet without colour sides has no "side"). */
  present: GrainGroup[];
  /** True when the door series is textured HPL and the sheet limits apply. */
  checked: boolean;
  issues: GrainIssue[];
}

const PLANE_AXES: Record<string, ["x" | "y" | "z", "x" | "y" | "z"]> = { XZ: ["x", "z"], YZ: ["y", "z"], XY: ["x", "y"] };
const WORD: Record<"x" | "y" | "z", string> = { x: "wide", y: "deep", z: "high" };

function isDir(v: unknown): v is GrainDir {
  return v === "horizontal" || v === "vertical";
}

/** The group's direction: the stored choice, else the module default. */
export function grainOf(params: { grain?: unknown } | null | undefined, group: GrainGroup, defaults: GrainParams): GrainDir {
  const stored = params && params.grain && typeof params.grain === "object" ? (params.grain as Record<string, unknown>)[group] : undefined;
  return isDir(stored) ? stored : (defaults[group] ?? "horizontal");
}

/** Only textured HPL has a direction and a fixed sheet. */
export function grainChecked(params: { doorSeries?: unknown } | null | undefined): boolean {
  return !!params && params.doorSeries === "hpl";
}

function colourFacesOf(b: Board): Face[] {
  return (b.faces ?? []).filter((f) => (f.id === "A" || f.id === "B") && f.finish?.colour);
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Tags every colour face with its grain and checks the sheet limits.
 * `groupOf` names the group of a board (null = not a grained colour board).
 */
export function applyGrain(
  boards: Board[],
  groupOf: (b: Board) => GrainGroup | null,
  params: { grain?: unknown; doorSeries?: unknown },
  defaults: GrainParams,
): GrainResult {
  const checked = grainChecked(params);
  const groups: GrainResult["groups"] = {};
  for (const g of Object.keys(defaults) as GrainGroup[]) groups[g] = grainOf(params, g, defaults);
  const issues: GrainIssue[] = [];
  const present = new Set<GrainGroup>();
  for (const b of boards) {
    const group = groupOf(b);
    if (!group) continue;
    const faces = colourFacesOf(b);
    if (!faces.length) continue;
    const dir = grainOf(params, group, defaults);
    groups[group] = dir;
    present.add(group);
    const key = dir === "horizontal" ? "u" : "v";
    for (const f of faces) f.finish = { ...f.finish, grain: key };
    if (!checked) continue;
    const [U, V] = PLANE_AXES[b.profilePlane] ?? PLANE_AXES.XY;
    const alongAxis = key === "u" ? U : V;
    const acrossAxis = key === "u" ? V : U;
    const len = (a: "x" | "y" | "z") => round1((b as unknown as Record<string, number>)[`${a}1`] - (b as unknown as Record<string, number>)[`${a}0`]);
    const across = len(acrossAxis);
    const along = len(alongAxis);
    if (across > SHEET_CROSS_MAX_MM) {
      issues.push({
        board: b.id, group, dir, side: "across", length: across, word: WORD[acrossAxis], limit: SHEET_CROSS_MAX_MM,
        message: `${b.id} is ${across} ${WORD[acrossAxis]}: ${dir} grain allows ${SHEET_CROSS_MAX_MM} across the grain (sheet 1200 × 2400)`,
      });
    }
    if (along > SHEET_ALONG_MAX_MM) {
      issues.push({
        board: b.id, group, dir, side: "along", length: along, word: WORD[alongAxis], limit: SHEET_ALONG_MAX_MM,
        message: `${b.id} is ${along} ${WORD[alongAxis]}: ${dir} grain allows ${SHEET_ALONG_MAX_MM} along the grain (sheet 1200 × 2400)`,
      });
    }
  }
  return { groups, present: [...present], checked, issues };
}
