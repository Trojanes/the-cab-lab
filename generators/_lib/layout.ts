/**
 * Board placement as data (generators/<module>/layout.json).
 *
 * One rule per axis of a board: which face drives it (`from` lo = x0 / y0 / z0,
 * hi = x1 / y1 / z1), where that face sits (`at`) and the board's extent along
 * the axis (`size`). The other face is always the driving face ± size, so an
 * edit that moves the driving face moves the whole board and keeps its size,
 * and a face-to-face relation (`at: "T1.y1"`) is the same record as a formula.
 *
 * Names inside `at` / `size`: the generator's inputs and rule constants
 * (`scope`), a face of another placed board (`T1.y1`, resolved on demand, so
 * the order of the boards in the file does not matter), or any value the
 * generator recorded before placement (`BP.z1`). A chain that comes back to
 * the axis it started from is refused.
 *
 * Every face goes through dim(): the formula the bench shows is the rule that
 * placed the board, not a description written next to it.
 */
import { dim, ref, valueOf, type Term } from "./dim.ts";
import { compile, type Compiled } from "./expr.ts";
import type { Board } from "./model.ts";

export type Axis = "x" | "y" | "z";
export const AXES: Axis[] = ["x", "y", "z"];

export interface AxisRule {
  from: "lo" | "hi";
  at: string;
  size: string;
  /**
   * Set by face mode: the driving face sits on another board's face (`at` is that face).
   * contact = the two faces touch (checked); flush = their planes coincide, nothing else is implied.
   */
  relation?: { kind: "contact" | "flush"; ref: string; offset?: number; delta?: number };
  /**
   * This case applies only when every switch equals this value
   * (`bottomClearanceStyle: "style_1"`). Absent = every situation.
   */
  when?: Record<string, string>;
  /** Other situations of the same axis. The object around `cases` is not itself a rule. */
  cases?: AxisRule[];
}

/** The case that applies to this cabinet. None means the generator's own formula stays. */
export function selectAxisRule(rule: AxisRule, situation: Record<string, string> = {}): AxisRule | null {
  const list = rule.cases?.length ? rule.cases : [rule];
  const hit = list.filter((c) => !c.when || Object.entries(c.when).every(([k, v]) => situation[k] === v));
  hit.sort((a, b) => Object.keys(b.when || {}).length - Object.keys(a.when || {}).length);
  return hit[0] || null;
}

export interface BoardRule {
  /** Name shown to people (the bench), e.g. "顶部竖板 T4". */
  label?: string;
  axes: Partial<Record<Axis, AxisRule>>;
  /**
   * Board edit: the outline's corner points in the board's placement frame (u, v from the
   * frame's low corner, on the profile plane). Points may leave the frame; the board's box
   * becomes the outline's extent and the frame does not move.
   */
  outline?: { corners: Record<string, { u: string; v: string }> };
  /** Board edit: one depth per logical machining feature (every groove segment of it shares it). */
  features?: Record<string, { label?: string; depth: string }>;
}

export const CORNERS = ["FL", "FR", "RR", "RL"] as const;

export interface LayoutFile {
  module: string;
  version: number;
  boards: Record<string, BoardRule>;
}

export interface Box { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }

export class LayoutError extends Error {}

const FACE_REF = /^([A-Za-z][\w-]*)\.([xyz])([01])$/;

/** A box face (`T3.y0`) or a notch plane recorded on that board (`D3.cut.rearY0`). */
function planeOf(ref: string): { board: string; axis: Axis } | null {
  const face = FACE_REF.exec(ref);
  if (face) return { board: face[1]!, axis: face[2] as Axis };
  const m = /^([A-Za-z][\w-]*)\.(.+)$/.exec(ref);
  if (!m) return null;
  const ax = /([xyz])\d*$/i.exec(m[2]!);
  if (!ax) return null;
  return { board: m[1]!, axis: ax[1]!.toLowerCase() as Axis };
}

/** `at` is the reference plane, plus the declared gap and a notch-to-box shift. */
function atHonours(at: string, ref: string, from: "lo" | "hi", offset = 0, extra = 0): boolean {
  const shift = (from === "lo" ? 1 : -1) * (Number(offset) || 0) + (Number(extra) || 0);
  let expected = ref;
  if (shift) {
    const mag = Math.round(Math.abs(shift) * 1000) / 1000;
    expected = `${ref} ${shift > 0 ? "+" : "-"} ${mag}`;
  }
  return at.trim() === expected;
}

function validateAxisRule(id: string, axis: string, r: AxisRule): void {
  if (!r || (r.from !== "lo" && r.from !== "hi")) throw new LayoutError(`layout: ${id}.${axis} from must be lo or hi`);
  for (const k of ["at", "size"] as const) {
    if (typeof r[k] !== "string" || !r[k].trim()) throw new LayoutError(`layout: ${id}.${axis} ${k} missing`);
    try { compile(r[k]); } catch (err) { throw new LayoutError(`layout: ${id}.${axis} ${k}: ${(err as Error).message}`); }
  }
  if (r.when != null) {
    if (typeof r.when !== "object" || Array.isArray(r.when)) throw new LayoutError(`layout: ${id}.${axis} when must be a map of switches`);
    for (const [key, value] of Object.entries(r.when)) {
      if (typeof value !== "string" || !value) throw new LayoutError(`layout: ${id}.${axis} when.${key} must be a value`);
    }
  }
  if (r.relation != null) {
    const rel = r.relation;
    if (rel.kind !== "contact" && rel.kind !== "flush") throw new LayoutError(`layout: ${id}.${axis} relation must be contact or flush`);
    const plane = planeOf(String(rel.ref));
    if (!plane) throw new LayoutError(`layout: ${id}.${axis} relation ref ${rel.ref} is not a board face`);
    if (plane.axis !== axis) throw new LayoutError(`layout: ${id}.${axis} relation ref ${rel.ref} is on another axis`);
    if (plane.board === id) throw new LayoutError(`layout: ${id}.${axis} relation refers to its own face`);
    if (!atHonours(r.at, String(rel.ref), r.from, rel.offset || 0, rel.delta || 0)) throw new LayoutError(`layout: ${id}.${axis} relation ref ${rel.ref} differs from at (${r.at})`);
  }
}

/** Throws a LayoutError naming the first thing wrong with a layout file. */
export function validateLayout(raw: unknown): LayoutFile {
  const f = raw as LayoutFile;
  if (!f || typeof f !== "object") throw new LayoutError("layout: not an object");
  if (typeof f.module !== "string") throw new LayoutError("layout: module missing");
  if (!Number.isFinite(f.version)) throw new LayoutError("layout: version missing");
  if (!f.boards || typeof f.boards !== "object") throw new LayoutError("layout: boards missing");
  for (const [id, b] of Object.entries(f.boards)) {
    if (!b || typeof b.axes !== "object") throw new LayoutError(`layout: ${id} has no axes`);
    for (const [axis, r] of Object.entries(b.axes)) {
      if (!AXES.includes(axis as Axis)) throw new LayoutError(`layout: ${id} has an unknown axis ${axis}`);
      const list = r?.cases?.length ? r.cases : [r];
      for (const one of list) validateAxisRule(id, axis, one);
    }
    const check = (what: string, src: unknown) => {
      if (typeof src !== "string" || !src.trim()) throw new LayoutError(`layout: ${id} ${what} missing`);
      try { compile(src); } catch (err) { throw new LayoutError(`layout: ${id} ${what}: ${(err as Error).message}`); }
    };
    if (b.outline != null) {
      for (const c of CORNERS) {
        const p = b.outline.corners?.[c];
        if (!p) throw new LayoutError(`layout: ${id} outline has no corner ${c}`);
        check(`corner ${c} u`, p.u);
        check(`corner ${c} v`, p.v);
      }
    }
    for (const [fid, feat] of Object.entries(b.features ?? {})) check(`feature ${fid} depth`, feat?.depth);
  }
  return f;
}

/** Record one rule expression under `key`: names are inputs / rules (`scope`) or values recorded before. */
export function recordExpr(key: string, src: string, scope: Record<string, Term>, from: string): number {
  const c = compile(src);
  const terms: Record<string, Term> = {};
  for (const n of c.names) {
    if (n in scope) terms[n] = scope[n]!;
    else if (Number.isFinite(valueOf(n))) terms[n] = ref(n);
    else throw new LayoutError(`layout: ${from} uses ${n}, which is not an input, a rule or a value recorded before it`);
  }
  return dim(key, terms, (t) => c.run((n) => t[n]!), { formula: c.src });
}

/**
 * Place `ids` by their rules. Returns one box per board; every face, and the
 * size along each axis (`${id}.${axis}Size`), is recorded with its formula.
 */
export function placeBoards(file: LayoutFile, ids: string[], scope: Record<string, Term>, warnings: string[] = [], situation: Record<string, string> = {}): Record<string, Partial<Box>> {
  const placing = new Set(ids);
  for (const id of ids) {
    const rule = file.boards[id];
    if (!rule?.axes || !AXES.some((axis) => rule.axes[axis])) throw new LayoutError(`layout: ${id} has no axes`);
  }
  const done = new Map<string, [number, number]>();
  const visiting: string[] = [];

  const termOf = (name: string, from: string): Term => {
    if (name in scope) return scope[name]!;
    const m = FACE_REF.exec(name);
    if (m && placing.has(m[1]!)) {
      placeAxis(m[1]!, m[2] as Axis);
      return ref(name);
    }
    if (Number.isFinite(valueOf(name))) return ref(name);
    if (m) throw new LayoutError(`layout: ${from} uses ${name}: ${m[1]} is placed in code after these boards, so its faces cannot be referenced yet`);
    throw new LayoutError(`layout: ${from} uses ${name}, which is not an input, a rule or a placed face`);
  };

  const record = (key: string, c: Compiled, from: string): number => {
    const terms: Record<string, Term> = {};
    for (const n of c.names) terms[n] = termOf(n, from);
    return dim(key, terms, (t) => c.run((n) => t[n]!), { formula: c.src });
  };

  function placeAxis(id: string, axis: Axis): [number, number] | null {
    const key = `${id}.${axis}`;
    const hit = done.get(key);
    if (hit) return hit;
    const raw = file.boards[id]!.axes[axis];
    const r = raw ? selectAxisRule(raw, situation) : null;
    if (!r) return null;
    if (visiting.includes(key)) {
      throw new LayoutError(`layout: ${[...visiting.slice(visiting.indexOf(key)), key].join(" → ")} goes round in a circle`);
    }
    visiting.push(key);
    const lo = `${id}.${axis}0`;
    const hi = `${id}.${axis}1`;
    const sizeKey = `${id}.${axis}Size`;
    const drive = r.from === "lo" ? lo : hi;
    const other = r.from === "lo" ? hi : lo;
    record(drive, compile(r.at), `${id} ${axis} position`);
    const size = record(sizeKey, compile(r.size), `${id} ${axis} size`);
    if (!(size > 0)) throw new LayoutError(`layout: ${id} ${axis} size is ${size}, it must be above 0`);
    if (r.from === "lo") dim(other, { [drive]: ref(drive), [sizeKey]: ref(sizeKey) }, (t) => t[drive]! + t[sizeKey]!, { formula: `${drive} + ${sizeKey}` });
    else dim(other, { [drive]: ref(drive), [sizeKey]: ref(sizeKey) }, (t) => t[drive]! - t[sizeKey]!, { formula: `${drive} - ${sizeKey}` });
    visiting.pop();
    const pair: [number, number] = [valueOf(lo), valueOf(hi)];
    done.set(key, pair);
    return pair;
  }

  const out: Record<string, Partial<Box>> = {};
  for (const id of ids) {
    const box: Partial<Box> = {};
    for (const axis of AXES) {
      if (!file.boards[id]!.axes[axis]) continue;
      const pair = placeAxis(id, axis);
      if (!pair) continue;
      const [a0, a1] = pair;
      box[`${axis}0`] = a0;
      box[`${axis}1`] = a1;
    }
    out[id] = box;
  }
  // A contact made in face mode must still touch after an input change: the two faces share a plane
  // by construction, so check that their boxes still overlap within it (the bench checks the outlines).
  for (const id of ids) {
    for (const axis of AXES) {
      const raw = file.boards[id]!.axes[axis];
      if (!raw) continue;
      const rel = selectAxisRule(raw, situation)?.relation;
      if (rel?.kind !== "contact" || rel.offset) continue;
      const otherId = planeOf(rel.ref)?.board;
      if (!otherId || !out[otherId]) continue;
      const other = otherId;
      const ok = AXES.filter((k) => k !== axis).every((k) => {
        const a0 = out[id]![`${k}0`] ?? valueOf(`${id}.${k}0`);
        const a1 = out[id]![`${k}1`] ?? valueOf(`${id}.${k}1`);
        const b0 = valueOf(`${other}.${k}0`);
        const b1 = valueOf(`${other}.${k}1`);
        return Number.isFinite(b0) && Number.isFinite(b1) && Math.min(a1, b1) - Math.max(a0, b0) > 0.01;
      });
      if (!ok) warnings.push(`${id}: its ${axis} contact with ${rel.ref} no longer touches (the two faces do not overlap).`);
    }
  }
  return out;
}

const round2 = (n: number) => Math.round(n * 1000) / 1000;

/** YZ outlines are cabinet coordinates, so they move with the box. XY / XZ outlines are aligned to the box when drawn. */
function followOutline(board: Board, before: { y0: number; z0: number }): void {
  if (board.profilePlane !== "YZ" || !board.profileVector) return;
  const dy = board.y0 - before.y0;
  const dz = board.z0 - before.z0;
  if (Math.abs(dy) < 1e-9 && Math.abs(dz) < 1e-9) return;
  board.profileVector = board.profileVector.map((p) => {
    const q = { ...(p as object) } as { y?: number; z?: number };
    if (typeof q.y === "number") q.y = round2(q.y + dy);
    if (typeof q.z === "number") q.z = round2(q.z + dz);
    return q;
  }) as Board["profileVector"];
}

/**
 * Move boards named in a placement draft. The generator has already built every
 * board. A rule overrides only the axes it names; the outline follows the box.
 * A board this situation does not build is left unused — the other rules still apply.
 */
export function applyLayoutDraft(
  boards: Board[],
  layout: unknown,
  scope: Record<string, Term>,
  errors: string[],
  warnings: string[],
  situation: Record<string, string> = {},
  skip: (id: string) => boolean = () => false,
): void {
  if (layout == null) return;
  try {
    const file = validateLayout(layout);
    const known = new Set(boards.map((b) => b.id));
    const ids = Object.keys(file.boards).filter((id) => known.has(id) && !skip(id));
    for (const id of Object.keys(file.boards)) {
      if (skip(id)) continue;
      if (!known.has(id)) warnings.push(`layout: ${id} is not a board of this cabinet, so that rule was left unused`);
    }
    if (!ids.length) return;
    const placed = placeBoards(file, ids, scope, warnings, situation);
    for (const b of boards) {
      const box = placed[b.id];
      if (!box) continue;
      const before = { y0: b.y0, z0: b.z0 };
      for (const face of ["x0", "x1", "y0", "y1", "z0", "z1"] as const) {
        const v = box[face];
        if (typeof v === "number") b[face] = v;
      }
      followOutline(b, before);
    }
  } catch (err) {
    if (err instanceof LayoutError) errors.push(err.message);
    else throw err;
  }
}
