/**
 * Record an outline the bench can open point by point (`${id}.pv[i].x`).
 * The stored value matches the coordinate on the board; `formula` stays the
 * design expression (rounding is not part of the formula text).
 */
import { dim, val, type Expr } from "./dim.ts";

export function evalExpr(e: Expr): number {
  const values: Record<string, number> = {};
  for (const [name, term] of Object.entries(e.terms)) values[name] = val(term);
  return e.fn(values);
}

export function recordLoop(
  id: string,
  axes: [string, string],
  pairs: [Expr, Expr][],
  round = false,
): [number, number][] {
  const q = (n: number) => (round ? Math.round(n * 1000) / 1000 : n);
  return pairs.map(([a, b], i) => {
    const x = q(evalExpr(a));
    const y = q(evalExpr(b));
    dim(`${id}.pv[${i}].${axes[0]}`, a.terms, round ? (t) => q(a.fn(t)) : a.fn, { formula: a.formula });
    dim(`${id}.pv[${i}].${axes[1]}`, b.terms, round ? (t) => q(b.fn(t)) : b.fn, { formula: b.formula });
    return [x, y];
  });
}
