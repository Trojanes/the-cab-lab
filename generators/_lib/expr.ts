/**
 * Arithmetic expressions for rule data (layout.json): numbers, names,
 * + - * / % ^, parentheses, unary minus and min max abs floor ceil round sqrt.
 * A name is a param / rule (`Cw`, `T4_HEIGHT_MM`), another board's face
 * (`T1.y1`), or an outline point (`V2.pv[0].y`). No eval: the renderer CSP has no 'unsafe-eval'.
 *
 * `compile()` parses once; the result is cached by source text, so a run that
 * evaluates the same rule for many cabinets parses it a single time.
 */

type Node =
  | { k: "num"; v: number }
  | { k: "id"; v: string }
  | { k: "neg"; a: Node }
  | { k: "bin"; op: "+" | "-" | "*" | "/" | "%" | "^"; a: Node; b: Node }
  | { k: "call"; f: keyof typeof FUNCS; args: Node[] };

const FUNCS = {
  min: Math.min, max: Math.max, abs: Math.abs, floor: Math.floor, ceil: Math.ceil, round: Math.round, sqrt: Math.sqrt,
};

export interface Compiled {
  src: string;
  names: string[];
  run(lookup: (name: string) => number): number;
}

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: string };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i += 1; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?/i.exec(src.slice(i));
      if (!m) throw new Error(`bad number at ${i} in "${src}"`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][\w-]*(?:\[\d+\])?(?:\.[A-Za-z_][\w-]*(?:\[\d+\])?)*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/%^(),".includes(c)) { out.push({ t: c }); i += 1; continue; }
    throw new Error(`unexpected "${c}" in "${src}"`);
  }
  return out;
}

function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const take = (t?: string) => {
    const k = toks[p];
    if (!k || (t && k.t !== t)) throw new Error(`expected ${t || "a value"} in "${src}"`);
    p += 1;
    return k;
  };
  const primary = (): Node => {
    const k = peek();
    if (!k) throw new Error(`unexpected end of "${src}"`);
    if (k.t === "num") { p += 1; return { k: "num", v: (k as { v: number }).v }; }
    if (k.t === "(") { p += 1; const v = sum(); take(")"); return v; }
    if (k.t === "-") { p += 1; return { k: "neg", a: primary() }; }
    if (k.t === "+") { p += 1; return primary(); }
    if (k.t === "id") {
      p += 1;
      const name = (k as { v: string }).v;
      if (peek()?.t === "(") {
        p += 1;
        if (!(name in FUNCS)) throw new Error(`unknown function ${name} in "${src}"`);
        const args: Node[] = [];
        if (peek()?.t !== ")") {
          args.push(sum());
          while (peek()?.t === ",") { p += 1; args.push(sum()); }
        }
        take(")");
        return { k: "call", f: name as keyof typeof FUNCS, args };
      }
      return { k: "id", v: name };
    }
    throw new Error(`unexpected ${k.t} in "${src}"`);
  };
  const power = (): Node => {
    let a = primary();
    while (peek()?.t === "^") { p += 1; a = { k: "bin", op: "^", a, b: primary() }; }
    return a;
  };
  const product = (): Node => {
    let a = power();
    while (peek() && ["*", "/", "%"].includes(peek()!.t)) {
      const op = take().t as "*" | "/" | "%";
      a = { k: "bin", op, a, b: power() };
    }
    return a;
  };
  const sum = (): Node => {
    let a = product();
    while (peek() && ["+", "-"].includes(peek()!.t)) {
      const op = take().t as "+" | "-";
      a = { k: "bin", op, a, b: product() };
    }
    return a;
  };
  if (!toks.length) throw new Error("empty expression");
  const node = sum();
  if (p !== toks.length) throw new Error(`trailing input in "${src}"`);
  return node;
}

function namesOf(n: Node, out: Set<string>): void {
  if (n.k === "id") out.add(n.v);
  else if (n.k === "neg") namesOf(n.a, out);
  else if (n.k === "bin") { namesOf(n.a, out); namesOf(n.b, out); }
  else if (n.k === "call") for (const a of n.args) namesOf(a, out);
}

function run(n: Node, lookup: (name: string) => number): number {
  switch (n.k) {
    case "num": return n.v;
    case "id": return lookup(n.v);
    case "neg": return -run(n.a, lookup);
    case "call": return FUNCS[n.f](...n.args.map((a) => run(a, lookup)));
    case "bin": {
      const a = run(n.a, lookup);
      const b = run(n.b, lookup);
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        default: return a ** b;
      }
    }
  }
}

const cache = new Map<string, Compiled>();

export function compile(src: string): Compiled {
  const key = String(src).trim();
  const hit = cache.get(key);
  if (hit) return hit;
  const node = parse(key);
  const names = new Set<string>();
  namesOf(node, names);
  const compiled: Compiled = { src: key, names: [...names], run: (lookup) => run(node, lookup) };
  cache.set(key, compiled);
  return compiled;
}
