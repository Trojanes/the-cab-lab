/**
 * Control panel (a wall-mounted screen) recessed through a stack of boards.
 *
 * The opening goes in from the room face. Each board in turn:
 *   - the depth already reached covers the panel → this board is left whole;
 *   - what is still needed is at most `groove` (10 mm) → a `groove`-deep half
 *     slot on this board, which also carries the wiring channel to the wall,
 *     0.5 mm past that edge so the cut breaks through;
 *   - otherwise → cut through, and go on to the next board.
 * Boards past the existing stack are added (`backing` thick) until one of the
 * first two cases ends it, so a through cut never opens into nothing.
 */

export const CONTROL_PANEL_DEFAULTS = { width: 175, height: 105, depth: 35 } as const;
/** Depth of the half slot on the last board; it runs on to the wall for the wiring. */
export const CONTROL_PANEL_GROOVE_MM = 10;
/** The wiring channel continues this far past the board's wall edge so the cut opens through. */
export const CONTROL_PANEL_EDGE_PAST_MM = 0.5;

export interface ControlPanelRecord {
  id: string;
  /** Opening centre, down from the ceiling (on an overhead end panel: from the overhead's top). */
  fromCeiling: number;
  /** Opening centre, from the back wall (on an overhead: from the carcass back). */
  fromBack: number;
  /** Along the wall, horizontal. */
  width: number;
  height: number;
  depth: number;
}

export type LayerCut = "through" | "groove" | "none";

export interface LayerPlan {
  /** One per board, room face first: the given stack, then any backing boards added. */
  cuts: LayerCut[];
  /** Backing boards added after the given stack. */
  added: number;
  /** Depth reached: through cuts plus the half slot. */
  reached: number;
}

export function controlPanelLayers(depth: number, stack: number[], backing: number, groove = CONTROL_PANEL_GROOVE_MM): LayerPlan {
  const cuts: LayerCut[] = [];
  let reached = 0;
  for (let i = 0; i < 64; i += 1) {
    const t = i < stack.length ? stack[i]! : backing;
    if (reached >= depth - 1e-6) { cuts.push("none"); break; }
    if (depth - reached <= groove + 1e-6 && groove < t) { cuts.push("groove"); reached += groove; break; }
    cuts.push("through");
    reached += t;
  }
  return { cuts, added: Math.max(0, cuts.length - stack.length), reached };
}

export function normalizeControlPanel(raw: unknown): ControlPanelRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : d);
  const rec: ControlPanelRecord = {
    id: String(r.id || ""),
    fromCeiling: num(r.fromCeiling, 200),
    fromBack: num(r.fromBack, 200),
    width: num(r.width, CONTROL_PANEL_DEFAULTS.width),
    height: num(r.height, CONTROL_PANEL_DEFAULTS.height),
    depth: num(r.depth, CONTROL_PANEL_DEFAULTS.depth),
  };
  if (!(rec.width >= 1 && rec.height >= 1 && rec.depth >= 1)) return null;
  return rec;
}
