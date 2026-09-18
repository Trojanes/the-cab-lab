/**
 * Provenance for generator dimensions.
 *
 * `dim(key, terms, fn)` computes a number exactly like writing the expression
 * inline, and records how it was made: the formula text (the arrow body of
 * `fn`, `t.` stripped) and each named term with its kind — a user param, a
 * rule constant from rules.json, a reference to another recorded dim, or a
 * plain local value. The bench reads `debug.provenance` to show, for any
 * board face or outline point, "359 = H - TCH - 1 (H 400 param, TCH 40 param)".
 *
 * Bare literals in the formula stay literals: `frontStepY1 - (T3_DEPTH_MM - 10)`
 * keeps its `10`. Only named quantities are terms.
 *
 * Generators call beginProvenance() / endProvenance() around one run. Outside
 * a run dim() still returns the number and keeps nothing, so helpers can be
 * called from tests without setup.
 */

export type TermKind = "param" | "rule" | "ref" | "value";

export interface Rule {
  readonly __rule: true;
  readonly module: string;
  readonly name: string;
  readonly value: number;
  readonly doc: string;
}

export interface ParamTerm {
  readonly __param: true;
  readonly name: string;
  readonly value: number;
}

export interface RefTerm {
  readonly __ref: true;
  readonly key: string;
  readonly value: number;
}

export type Term = number | Rule | ParamTerm | RefTerm;

export interface TermRecord {
  kind: TermKind;
  value: number;
  /** For `param`: the input name. For `rule`: the constant name. For `ref`: the dim key. */
  name?: string;
  ref?: string;
  doc?: string;
}

export interface DimEntry {
  key: string;
  value: number;
  formula: string;
  terms: Record<string, TermRecord>;
}

export interface Provenance {
  entries: Record<string, DimEntry>;
  rules: Record<string, { value: number; doc: string; module: string }>;
}

// There is always a collector so `ref()` can resolve values even when nobody
// asked for provenance (helpers called from tests). beginProvenance() starts a
// fresh one; endProvenance() hands it over and starts another scratch one.
const fresh = (): Provenance => ({ entries: {}, rules: {} });
let active: Provenance = fresh();
let collecting = false;

export function beginProvenance(): void {
  active = fresh();
  collecting = true;
}

export function endProvenance(): Provenance {
  const out = active;
  active = fresh();
  collecting = false;
  return out;
}

export function provenanceActive(): boolean {
  return collecting;
}

// --- terms ---------------------------------------------------------------------

export function isRule(v: unknown): v is Rule {
  return !!v && typeof v === "object" && (v as Rule).__rule === true;
}
function isParam(v: unknown): v is ParamTerm {
  return !!v && typeof v === "object" && (v as ParamTerm).__param === true;
}
function isRef(v: unknown): v is RefTerm {
  return !!v && typeof v === "object" && (v as RefTerm).__ref === true;
}

/** Numeric value of any term. */
export function val(t: Term): number {
  if (typeof t === "number") return t;
  return t.value;
}

/** Mark user inputs so they show as "param" in the bench: `const P = param({ H: 400, TCH: 40 })`. */
export function param<T extends Record<string, number | null | undefined>>(inputs: T): { [K in keyof T]: ParamTerm } {
  const out: Record<string, ParamTerm> = {};
  for (const [name, v] of Object.entries(inputs)) {
    out[name] = { __param: true, name, value: Number(v ?? 0) };
  }
  return out as { [K in keyof T]: ParamTerm };
}

/** Reference an already recorded dim by key. Throws if unknown while a run is active. */
export function ref(key: string): RefTerm {
  const entry = active.entries[key];
  if (!entry) throw new Error(`dim ref: unknown key "${key}" (record it before referencing it)`);
  return { __ref: true, key, value: entry.value };
}

/** Value of a recorded dim (NaN when not recorded). */
export function valueOf(key: string): number {
  return active.entries[key]?.value ?? NaN;
}

// --- dim -----------------------------------------------------------------------

export interface DimOptions {
  /** Override the formula text derived from `fn`. */
  formula?: string;
}

function formulaOf(fn: (t: Record<string, number>) => number, override?: string): string {
  if (override) return override;
  const src = fn.toString();
  // "(t) => t.H - t.TCH - 1"  |  "t => ..."  |  "function (t) { return ...; }"
  let body = src;
  const arrow = src.indexOf("=>");
  if (arrow >= 0) {
    body = src.slice(arrow + 2).trim();
    if (body.startsWith("{")) {
      const m = body.match(/return\s+([\s\S]*?);?\s*}$/);
      body = m ? m[1]! : body;
    }
  } else {
    const m = src.match(/return\s+([\s\S]*?);?\s*}$/);
    body = m ? m[1]! : src;
  }
  // Identify the parameter name so we only strip that prefix.
  const pm = src.match(/^\s*(?:function\s*)?\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>|^\s*function\s*\(\s*([A-Za-z_$][\w$]*)/);
  const pname = (pm && (pm[1] || pm[2])) || "t";
  const re = new RegExp(`\\b${pname.replace(/\$/g, "\\$")}\\.`, "g");
  return body.replace(re, "").replace(/\s+/g, " ").trim();
}

/**
 * Compute and record one dimension. Returns the number.
 *
 *   const t3Top = dim("T3.z1", { H: P.H, TCH: P.TCH }, (t) => t.H - t.TCH - 1);
 */
export function dim(
  key: string,
  terms: Record<string, Term>,
  fn: (t: Record<string, number>) => number,
  options: DimOptions = {},
): number {
  const values: Record<string, number> = {};
  for (const [name, t] of Object.entries(terms)) values[name] = val(t);
  const value = fn(values);

  const recorded: Record<string, TermRecord> = {};
  for (const [name, t] of Object.entries(terms)) {
    if (isRule(t)) {
      recorded[name] = { kind: "rule", value: t.value, name: t.name, doc: t.doc };
      active.rules[t.name] = { value: t.value, doc: t.doc, module: t.module };
    } else if (isParam(t)) {
      recorded[name] = { kind: "param", value: t.value, name: t.name };
    } else if (isRef(t)) {
      recorded[name] = { kind: "ref", value: t.value, ref: t.key };
    } else {
      recorded[name] = { kind: "value", value: t };
    }
  }
  active.entries[key] = { key, value, formula: formulaOf(fn, options.formula), terms: recorded };
  return value;
}

/** Record a value that is simply another dim (an equality), e.g. a face that sits on another board's face. */
export function same(key: string, of: string): number {
  return dim(key, { v: ref(of) }, (t) => t.v, { formula: `= ${of}` });
}

/**
 * Copy every record under `fromPrefix.` to `toPrefix.`, rewriting internal
 * refs that point inside the copied range. Used to expose a shared outline
 * template (`DividerSide.pt[i]`) on each divider board (`D1.cut[i]`).
 */
export function alias(fromPrefix: string, toPrefix: string): void {
  // Matches "<prefix>.name" and "<prefix>[i].axis".
  const under = (key: string) => key.startsWith(`${fromPrefix}.`) || key.startsWith(`${fromPrefix}[`);
  const rename = (key: string) => toPrefix + key.slice(fromPrefix.length);
  const copies: DimEntry[] = [];
  for (const [key, entry] of Object.entries(active.entries)) {
    if (!under(key)) continue;
    const terms: Record<string, TermRecord> = {};
    for (const [name, t] of Object.entries(entry.terms)) {
      terms[name] = t.kind === "ref" && t.ref && under(t.ref) ? { ...t, ref: rename(t.ref) } : { ...t };
    }
    copies.push({ key: rename(key), value: entry.value, formula: entry.formula, terms });
  }
  for (const c of copies) active.entries[c.key] = c;
}

/** Record a 2D outline point as two dims: `${key}.${a}` and `${key}.${b}`. Returns [a, b]. */
export function pt2(
  key: string,
  axes: [string, string],
  a: { terms: Record<string, Term>; fn: (t: Record<string, number>) => number; formula?: string },
  b: { terms: Record<string, Term>; fn: (t: Record<string, number>) => number; formula?: string },
): [number, number] {
  return [
    dim(`${key}.${axes[0]}`, a.terms, a.fn, { formula: a.formula }),
    dim(`${key}.${axes[1]}`, b.terms, b.fn, { formula: b.formula }),
  ];
}

// --- expressions & outlines ------------------------------------------------------

export interface Expr {
  terms: Record<string, Term>;
  fn: (t: Record<string, number>) => number;
  formula?: string;
}

/** Shorthand for an expression: `ex({ H: P.H, TCH: P.TCH }, (t) => t.H - t.TCH)`. */
export function ex(terms: Record<string, Term>, fn: (t: Record<string, number>) => number, formula?: string): Expr {
  return { terms, fn, formula };
}

/** A literal: `lit(0)` → formula "0". */
export function lit(v: number): Expr {
  return { terms: {}, fn: () => v, formula: String(v) };
}

/** Terms that reference recorded dims by short name: `use(K, "a", "b")` → `{ a: ref(K("a")), b: ref(K("b")) }`. */
export function use(K: (name: string) => string, ...names: string[]): Record<string, Term> {
  const out: Record<string, Term> = {};
  for (const n of names) out[n] = ref(K(n));
  return out;
}

/**
 * Builds a closed 2D outline while recording every kept vertex as two dims
 * `${prefix}[i].${axes[0]}` / `${prefix}[i].${axes[1]}`. Consecutive duplicate
 * points are dropped, exactly like the old dedupePoints() did, so indices in
 * the recorded keys match the returned array.
 */
export class Outline {
  readonly points: [number, number][] = [];
  private readonly prefix: string;
  private readonly axes: [string, string];
  constructor(prefix: string, axes: [string, string]) {
    this.prefix = prefix;
    this.axes = axes;
  }

  add(a: Expr, b: Expr): this {
    const av: Record<string, number> = {};
    for (const [n, t] of Object.entries(a.terms)) av[n] = val(t);
    const bv: Record<string, number> = {};
    for (const [n, t] of Object.entries(b.terms)) bv[n] = val(t);
    const x = a.fn(av);
    const y = b.fn(bv);
    const last = this.points[this.points.length - 1];
    if (last && last[0] === x && last[1] === y) return this;
    const i = this.points.length;
    dim(`${this.prefix}[${i}].${this.axes[0]}`, a.terms, a.fn, { formula: a.formula });
    dim(`${this.prefix}[${i}].${this.axes[1]}`, b.terms, b.fn, { formula: b.formula });
    this.points.push([x, y]);
    return this;
  }
}

// --- rules ---------------------------------------------------------------------

export interface RawRules {
  [name: string]: { value: number; doc?: string };
}

/** Wrap rules.json into typed Rule terms. */
export function defineRules<T extends RawRules>(module: string, raw: T): { [K in keyof T]: Rule } {
  const out: Record<string, Rule> = {};
  for (const [name, r] of Object.entries(raw)) {
    out[name] = { __rule: true, module, name, value: Number(r.value), doc: String(r.doc ?? "") };
  }
  return out as { [K in keyof T]: Rule };
}
