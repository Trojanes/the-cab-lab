// Formulas stay in their stored symbols (`Cd - CPT - clearance`, `T1.y1`).
// The editor only swaps the operator glyphs (− × ÷). Chinese names still parse
// if someone types them (`柜身板厚` → CPT, `T1.后表面` → T1.y1).
// Pure functions: no DOM, tested in node (rules.test.js).

/** Face of a board → its name. Box faces in the cabinet frame. */
export const FACE_NAMES = { x0: "左边", x1: "右边", y0: "前表面", y1: "后表面", z0: "下边", z1: "上边" };
export const SIZE_NAMES = { xSize: "长", ySize: "深", zSize: "高" };
export const AXIS_NAMES = { x: "左右", y: "前后", z: "上下" };
export const CORNER_NAMES = { FL: "左前角", FR: "右前角", RR: "右后角", RL: "左后角" };

/**
 * Symbol → name for one generator: its inputs (from the module's bench input
 * schema) and its rule constants (`label` in rules.json, else the constant name).
 */
export function nameTable(inputs = [], rules = {}) {
  const names = {};
  for (const group of inputs) for (const f of group.fields || []) if (f.sym) names[f.sym] = f.label.replace(/（.*）/, "");
  for (const [k, r] of Object.entries(rules)) if (r && r.label) names[k] = r.label;
  return names;
}

/** Stored expression → display text. Identifiers stay as written (CPT, Cw, T1.y1). */
export function toDisplay(expr) {
  return String(expr)
    .replace(/\s*-\s*/g, " − ")
    .replace(/\s*\*\s*/g, " × ")
    .replace(/\s*\/\s*/g, " ÷ ")
    .replace(/\s*\+\s*/g, " + ")
    .replace(/^ − /, "−")
    .replace(/\( − /g, "(−")
    .trim();
}

/** Display text (or a plain expression) → stored expression. */
export function fromDisplay(text, names = {}) {
  let s = String(text).replace(/−/g, "-").replace(/×/g, "*").replace(/÷/g, "/").replace(/（/g, "(").replace(/）/g, ")");
  const faceBack = Object.fromEntries([...Object.entries(FACE_NAMES), ...Object.entries(SIZE_NAMES)].map(([k, v]) => [v, k]));
  s = s.replace(/([A-Za-z][\w-]*)\.(左边|右边|前表面|后表面|下边|上边|长|深|高)/g, (_, id, n) => `${id}.${faceBack[n]}`);
  const pairs = Object.entries(names).filter(([, label]) => label).sort((a, b) => b[1].length - a[1].length);
  for (const [sym, label] of pairs) s = s.split(label).join(sym);
  return s.replace(/\s+/g, " ").trim();
}

const ATOM = /[A-Za-z_][\w]*|\d+(?:\.\d+)?|[+\-*/(),]|\S/g;

function lexFormula(expr) {
  return [...String(expr).matchAll(ATOM)].map((m) => {
    const v = m[0];
    if (/^[A-Za-z_]/.test(v)) return { t: "id", v };
    if (/^\d/.test(v)) return { t: "num", v };
    if ("+-*/".includes(v)) return { t: "op", v };
    return { t: "mark", v };
  });
}

function joinFormula(tokens) {
  let s = "";
  for (const tok of tokens) {
    const tight = !s || tok.t === "mark" || s.endsWith("(") || tok.v === ")" || tok.v === ",";
    s += tight ? tok.v : ` ${tok.v}`;
  }
  return s.replace(/\s+/g, " ").trim();
}

/** Drop a dangling operator left by taking a name out: `max(0, 12 - )` → `max(0, 12)`. */
function tidyFormula(tokens) {
  const out = tokens.slice();
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < out.length; i += 1) {
      const prev = out[i - 1];
      const next = out[i + 1];
      const opBeforeClose = out[i].t === "op" && next?.v === ")";
      const opAfterOpen = out[i].t === "op" && prev?.v === "(";
      const doubleOp = out[i].t === "op" && prev?.t === "op";
      if (opBeforeClose || opAfterOpen || doubleOp) { out.splice(i, 1); changed = true; break; }
    }
  }
  return out;
}

/** Append one primary parameter. An empty or zero formula becomes just that name. */
export function addParam(expr, sym) {
  const base = String(expr ?? "").trim();
  if (!base || base === "0") return sym;
  return `${base} + ${sym}`;
}

/**
 * Take one occurrence of `sym` out of a formula. A factor (`2 * CPT`, `CPT / 2`)
 * goes with it. What remains is `0` when the name was the whole formula.
 */
export function removeParam(expr, sym) {
  const tokens = lexFormula(expr);
  const idx = tokens.findIndex((tok) => tok.t === "id" && tok.v === sym);
  if (idx < 0) return String(expr).trim();
  const prev = tokens[idx - 1];
  const next = tokens[idx + 1];
  const before = tokens[idx - 2];
  const after = tokens[idx + 2];
  if ((prev?.v === "*" || prev?.v === "/") && before?.t === "num") tokens.splice(idx - 2, 3);
  else if ((next?.v === "*" || next?.v === "/") && after?.t === "num") tokens.splice(idx, 3);
  else if (prev?.t === "op" && prev.v !== "*" && prev.v !== "/") tokens.splice(idx - 1, 2);
  else if (next?.t === "op" && next.v !== "*" && next.v !== "/") tokens.splice(idx, 2);
  else tokens.splice(idx, 1);
  const text = joinFormula(tidyFormula(tokens));
  return text || "0";
}

/** Split a display formula so each primary parameter is its own chip. */
export function formulaPieces(expr, primary = []) {
  const set = new Set(primary);
  const src = String(expr);
  const re = /[A-Za-z_][\w]*/g;
  const out = [];
  let last = 0;
  let m = re.exec(src);
  while (m) {
    if (m.index > last) out.push({ kind: "text", text: src.slice(last, m.index) });
    out.push(set.has(m[0]) ? { kind: "param", sym: m[0] } : { kind: "text", text: m[0] });
    last = m.index + m[0].length;
    m = re.exec(src);
  }
  if (last < src.length) out.push({ kind: "text", text: src.slice(last) });
  return out;
}

/** Extent along an axis: the high face minus the low face, as an expression. */
export function sizeFormula(lo, hi) {
  const a = String(lo ?? "0").trim() || "0";
  const b = String(hi ?? "0").trim() || "0";
  if (a === "0") return b;
  const bare = (s) => /^[A-Za-z_][\w]*$/.test(s) || /^-?\d+(?:\.\d+)?$/.test(s);
  const wrap = (s) => (bare(s) ? s : `(${s})`);
  return `${wrap(b)} - ${wrap(a)}`;
}

/** Round a dragged offset and append it to an expression: `T3.xSize` + 12.4 → `T3.xSize + 12.5`. */
export function withOffset(expr, delta, step = 0.5) {
  const d = Math.round(delta / step) * step;
  if (!d) return expr;
  const base = String(expr).trim();
  // Fold into a trailing literal offset instead of stacking `+ 5 + 5`.
  const m = /^(.*?)\s*([+-])\s*(\d+(?:\.\d+)?)$/.exec(base);
  if (m && m[1]) {
    const v = (m[2] === "-" ? -1 : 1) * Number(m[3]) + d;
    if (!v) return m[1];
    return `${m[1]} ${v < 0 ? "-" : "+"} ${Math.abs(v)}`;
  }
  if (base === "0") return String(d);
  if (/^-?\d+(\.\d+)?$/.test(base)) return String(Number(base) + d);
  return `${base} ${d < 0 ? "-" : "+"} ${Math.abs(d)}`;
}
