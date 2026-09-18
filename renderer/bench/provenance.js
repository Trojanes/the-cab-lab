// Read-side helpers for `debug.provenance` (see docs/bench-spec.md): look up
// the formula behind a key, walk the dependency graph, find what a rule or
// param touches, and evaluate a "what if" expression without eval().

/** Entry for `key`, or null. */
export function entryOf(prov, key) {
  return (prov && prov.entries && prov.entries[key]) || null;
}

/** Face keys of a board: `${id}.x0` … */
export const FACES = ["x0", "x1", "y0", "y1", "z0", "z1"];

/**
 * Dependency tree of one key: { key, value, formula, terms: [{name, kind, value, name?, doc?, child?}] }.
 * `depth` guards cycles / very deep chains.
 */
export function tree(prov, key, depth = 8, seen = new Set()) {
  const e = entryOf(prov, key);
  if (!e) return null;
  const node = { key, value: e.value, formula: e.formula, terms: [] };
  if (depth <= 0 || seen.has(key)) return node;
  seen.add(key);
  for (const [name, t] of Object.entries(e.terms || {})) {
    const term = { name, kind: t.kind, value: t.value, ref: t.ref, rule: t.name, doc: t.doc };
    if (t.kind === "ref" && t.ref) term.child = tree(prov, t.ref, depth - 1, new Set(seen));
    node.terms.push(term);
  }
  return node;
}

/** Keys whose formula uses rule `name` (directly). */
export function usesRule(prov, name) {
  const out = [];
  for (const [key, e] of Object.entries(prov?.entries || {})) {
    if (Object.values(e.terms || {}).some((t) => t.kind === "rule" && t.name === name)) out.push(key);
  }
  return out;
}

/** Keys whose formula uses param `name` (directly). */
export function usesParam(prov, name) {
  const out = [];
  for (const [key, e] of Object.entries(prov?.entries || {})) {
    if (Object.values(e.terms || {}).some((t) => t.kind === "param" && t.name === name)) out.push(key);
  }
  return out;
}

/** Keys that reference `key` (directly). */
export function dependents(prov, key) {
  const out = [];
  for (const [k, e] of Object.entries(prov?.entries || {})) {
    if (Object.values(e.terms || {}).some((t) => t.kind === "ref" && t.ref === key)) out.push(k);
  }
  return out;
}

/** Transitive closure of `dependents`, plus the starting keys. */
export function affectedBy(prov, keys) {
  const out = new Set();
  const queue = [...keys];
  while (queue.length) {
    const k = queue.shift();
    if (out.has(k)) continue;
    out.add(k);
    for (const d of dependents(prov, k)) queue.push(d);
  }
  return Array.from(out);
}

/** Everything a rule change would move: direct users and their dependents. */
export function affectedByRule(prov, name) {
  return affectedBy(prov, usesRule(prov, name));
}

/** Board ids that appear in a list of keys (`T3.z1` → T3, `D1.cut[3].y` → D1). */
export function boardsOfKeys(keys) {
  const ids = new Set();
  for (const k of keys) {
    const m = /^([A-Za-z][\w-]*?)(?:\.|\[)/.exec(k);
    if (m) ids.add(m[1]);
  }
  return Array.from(ids);
}

/** "359 = H - TCH - 1  (H 400 · TCH 40)" */
export function describe(prov, key) {
  const e = entryOf(prov, key);
  if (!e) return null;
  const terms = Object.entries(e.terms || {}).map(([n, t]) => `${n} ${fmt(t.value)}`).join(" · ");
  return `${fmt(e.value)} = ${e.formula}${terms ? `  (${terms})` : ""}`;
}

export function fmt(v) {
  if (v == null || !Number.isFinite(v)) return "—";
  const r = Math.round(v * 100) / 100;
  return Number.isInteger(r) ? String(r) : String(r);
}

// --- safe expression evaluator -------------------------------------------------------
// Numbers, identifiers (term names), + - * / % ^, parentheses, unary minus and
// the functions min max abs floor ceil round sqrt. No eval: the bench CSP has
// no 'unsafe-eval', and this is all a "what if" needs.

const FUNCS = {
  min: Math.min, max: Math.max, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sqrt: Math.sqrt,
};

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i += 1; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?|^[0-9]+\./i.exec(src.slice(i));
      if (!m) throw new Error(`bad number at ${i}`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      const m = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*/.exec(src.slice(i));
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/%^(),".includes(c)) { out.push({ t: c }); i += 1; continue; }
    throw new Error(`unexpected "${c}"`);
  }
  return out;
}

/** Evaluate `src` with `vars` (name → number). Throws on unknown names or syntax. */
export function evaluate(src, vars) {
  const toks = tokenize(String(src));
  let p = 0;
  const peek = () => toks[p];
  const take = (t) => {
    const k = toks[p];
    if (!k || (t && k.t !== t)) throw new Error(`expected ${t || "value"}`);
    p += 1;
    return k;
  };
  const primary = () => {
    const k = peek();
    if (!k) throw new Error("unexpected end");
    if (k.t === "num") { p += 1; return k.v; }
    if (k.t === "(") { p += 1; const v = expr(); take(")"); return v; }
    if (k.t === "-") { p += 1; return -unary(); }
    if (k.t === "+") { p += 1; return unary(); }
    if (k.t === "id") {
      p += 1;
      const name = k.v.replace(/^Math\./, "");
      if (peek() && peek().t === "(") {
        p += 1;
        const args = [];
        if (peek() && peek().t !== ")") {
          args.push(expr());
          while (peek() && peek().t === ",") { p += 1; args.push(expr()); }
        }
        take(")");
        const f = FUNCS[name];
        if (!f) throw new Error(`unknown function ${name}`);
        return f(...args);
      }
      if (!(k.v in vars)) throw new Error(`unknown name ${k.v}`);
      return Number(vars[k.v]);
    }
    throw new Error(`unexpected ${k.t}`);
  };
  const unary = () => primary();
  const power = () => {
    let a = unary();
    while (peek() && peek().t === "^") { p += 1; a = a ** unary(); }
    return a;
  };
  const term = () => {
    let a = power();
    while (peek() && (peek().t === "*" || peek().t === "/" || peek().t === "%")) {
      const op = take().t;
      const b = power();
      a = op === "*" ? a * b : op === "/" ? a / b : a % b;
    }
    return a;
  };
  const expr = () => {
    let a = term();
    while (peek() && (peek().t === "+" || peek().t === "-")) {
      const op = take().t;
      const b = term();
      a = op === "+" ? a + b : a - b;
    }
    return a;
  };
  const v = expr();
  if (p !== toks.length) throw new Error("trailing input");
  return v;
}

/** Variables for a tryout on `key`: its term names → values. */
export function varsFor(prov, key) {
  const e = entryOf(prov, key);
  const vars = {};
  for (const [n, t] of Object.entries(e?.terms || {})) vars[n] = t.value;
  return vars;
}
