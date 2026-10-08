// Generated from generators/_lib/step.ts - do not edit.

// generators/_lib/model.ts
function planeAxes(plane) {
  if (plane === "YZ") return ["y", "z", "x"];
  if (plane === "XZ") return ["x", "z", "y"];
  return ["x", "y", "z"];
}
var ARC_CHORD_MM = 0.05;
var ARC_STEP_MAX = 5 * Math.PI / 180;
function expandBulgeRing(pts) {
  if (!pts.some((p2) => p2.b && Math.abs(p2.b) > 1e-9)) return pts.map((p2) => ({ u: p2.u, v: p2.v }));
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a2 = pts[i];
    const c2 = pts[(i + 1) % n];
    out.push({ u: a2.u, v: a2.v });
    const bulge = a2.b ?? 0;
    const chord = Math.hypot(c2.u - a2.u, c2.v - a2.v);
    if (!bulge || chord < 1e-9) continue;
    const sweep = 4 * Math.atan(bulge);
    const du = (c2.u - a2.u) / chord;
    const dv = (c2.v - a2.v) / chord;
    const h = chord / 2 / Math.tan(sweep / 2);
    const cu = (a2.u + c2.u) / 2 - dv * h;
    const cv = (a2.v + c2.v) / 2 + du * h;
    const r = Math.hypot(a2.u - cu, a2.v - cv);
    if (!(r > 1e-6)) continue;
    const a0 = Math.atan2(a2.v - cv, a2.u - cu);
    const step = Math.min(ARC_STEP_MAX, 2 * Math.acos(Math.max(-1, 1 - ARC_CHORD_MM / r)));
    const k2 = Math.max(2, Math.ceil(Math.abs(sweep) / step));
    for (let j = 1; j < k2; j += 1) {
      const t = a0 + sweep * j / k2;
      out.push({ u: cu + r * Math.cos(t), v: cv + r * Math.sin(t) });
    }
  }
  return out;
}

// node_modules/splaytree/dist/splaytree.js
var f = class {
  constructor(t, e) {
    this.next = null, this.key = t, this.data = e, this.left = null, this.right = null;
  }
};
function d(n, t) {
  return n > t ? 1 : n < t ? -1 : 0;
}
function u(n, t, e) {
  const r = new f(null, null);
  let l = r, i = r;
  for (; ; ) {
    const o = e(n, t.key);
    if (o < 0) {
      if (t.left === null) break;
      if (e(n, t.left.key) < 0) {
        const s = t.left;
        if (t.left = s.right, s.right = t, t = s, t.left === null) break;
      }
      i.left = t, i = t, t = t.left;
    } else if (o > 0) {
      if (t.right === null) break;
      if (e(n, t.right.key) > 0) {
        const s = t.right;
        if (t.right = s.left, s.left = t, t = s, t.right === null) break;
      }
      l.right = t, l = t, t = t.right;
    } else break;
  }
  return l.right = t.left, i.left = t.right, t.left = r.right, t.right = r.left, t;
}
function c(n, t, e, r) {
  const l = new f(n, t);
  if (e === null)
    return l.left = l.right = null, l;
  e = u(n, e, r);
  const i = r(n, e.key);
  return i < 0 ? (l.left = e.left, l.right = e, e.left = null) : i >= 0 && (l.right = e.right, l.left = e, e.right = null), l;
}
function m(n, t, e) {
  let r = null, l = null;
  if (t) {
    t = u(n, t, e);
    const i = e(t.key, n);
    i === 0 ? (r = t.left, l = t.right) : i < 0 ? (l = t.right, t.right = null, r = t) : (r = t.left, t.left = null, l = t);
  }
  return { left: r, right: l };
}
function w(n, t, e) {
  return t === null ? n : (n === null || (t = u(n.key, t, e), t.left = n), t);
}
function _(n, t, e, r, l) {
  if (n) {
    r(`${t}${e ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 "}${l(n)}
`);
    const i = t + (e ? "    " : "\u2502   ");
    n.left && _(n.left, i, false, r, l), n.right && _(n.right, i, true, r, l);
  }
}
var z = class {
  constructor(t = d) {
    this._root = null, this._size = 0, this._comparator = t;
  }
  /**
   * Inserts a key, allows duplicates
   */
  insert(t, e) {
    return this._size++, this._root = c(t, e, this._root, this._comparator);
  }
  /**
   * Adds a key, if it is not present in the tree
   */
  add(t, e) {
    const r = new f(t, e);
    this._root === null && (r.left = r.right = null, this._size++, this._root = r);
    const l = this._comparator, i = u(t, this._root, l), o = l(t, i.key);
    return o === 0 ? this._root = i : (o < 0 ? (r.left = i.left, r.right = i, i.left = null) : o > 0 && (r.right = i.right, r.left = i, i.right = null), this._size++, this._root = r), this._root;
  }
  /**
   * @param  {Key} key
   * @return {Node|null}
   */
  remove(t) {
    this._root = this._remove(t, this._root, this._comparator);
  }
  /**
   * Deletes i from the tree if it's there
   */
  _remove(t, e, r) {
    let l;
    return e === null ? null : (e = u(t, e, r), r(t, e.key) === 0 ? (e.left === null ? l = e.right : (l = u(t, e.left, r), l.right = e.right), this._size--, l) : e);
  }
  /**
   * Removes and returns the node with smallest key
   */
  pop() {
    let t = this._root;
    if (t) {
      for (; t.left; ) t = t.left;
      return this._root = u(t.key, this._root, this._comparator), this._root = this._remove(t.key, this._root, this._comparator), { key: t.key, data: t.data };
    }
    return null;
  }
  /**
   * Find without splaying
   */
  findStatic(t) {
    let e = this._root;
    const r = this._comparator;
    for (; e; ) {
      const l = r(t, e.key);
      if (l === 0) return e;
      l < 0 ? e = e.left : e = e.right;
    }
    return null;
  }
  find(t) {
    return this._root && (this._root = u(t, this._root, this._comparator), this._comparator(t, this._root.key) !== 0) ? null : this._root;
  }
  contains(t) {
    let e = this._root;
    const r = this._comparator;
    for (; e; ) {
      const l = r(t, e.key);
      if (l === 0) return true;
      l < 0 ? e = e.left : e = e.right;
    }
    return false;
  }
  forEach(t, e) {
    let r = this._root;
    const l = [];
    let i = false;
    for (; !i; )
      r !== null ? (l.push(r), r = r.left) : l.length !== 0 ? (r = l.pop(), t.call(e, r), r = r.right) : i = true;
    return this;
  }
  /**
   * Walk key range from `low` to `high`. Stops if `fn` returns a value.
   */
  range(t, e, r, l) {
    const i = [], o = this._comparator;
    let s = this._root, h;
    for (; i.length !== 0 || s; )
      if (s)
        i.push(s), s = s.left;
      else {
        if (s = i.pop(), h = o(s.key, e), h > 0)
          break;
        if (o(s.key, t) >= 0 && r.call(l, s))
          return this;
        s = s.right;
      }
    return this;
  }
  /**
   * Returns array of keys
   */
  keys() {
    const t = [];
    return this.forEach(({ key: e }) => {
      t.push(e);
    }), t;
  }
  /**
   * Returns array of all the data in the nodes
   */
  values() {
    const t = [];
    return this.forEach(({ data: e }) => {
      t.push(e);
    }), t;
  }
  min() {
    return this._root ? this.minNode(this._root).key : null;
  }
  max() {
    return this._root ? this.maxNode(this._root).key : null;
  }
  minNode(t = this._root) {
    if (t) for (; t.left; ) t = t.left;
    return t;
  }
  maxNode(t = this._root) {
    if (t) for (; t.right; ) t = t.right;
    return t;
  }
  /**
   * Returns node at given index
   */
  at(t) {
    let e = this._root, r = false, l = 0;
    const i = [];
    for (; !r; )
      if (e)
        i.push(e), e = e.left;
      else if (i.length > 0) {
        if (e = i.pop(), l === t) return e;
        l++, e = e.right;
      } else r = true;
    return null;
  }
  next(t) {
    let e = this._root, r = null;
    if (t.right) {
      for (r = t.right; r.left; ) r = r.left;
      return r;
    }
    const l = this._comparator;
    for (; e; ) {
      const i = l(t.key, e.key);
      if (i === 0) break;
      i < 0 ? (r = e, e = e.left) : e = e.right;
    }
    return r;
  }
  prev(t) {
    let e = this._root, r = null;
    if (t.left !== null) {
      for (r = t.left; r.right; ) r = r.right;
      return r;
    }
    const l = this._comparator;
    for (; e; ) {
      const i = l(t.key, e.key);
      if (i === 0) break;
      i < 0 ? e = e.left : (r = e, e = e.right);
    }
    return r;
  }
  clear() {
    return this._root = null, this._size = 0, this;
  }
  toList() {
    return k(this._root);
  }
  /**
   * Bulk-load items. Both array have to be same size
   */
  load(t, e = [], r = false) {
    let l = t.length;
    const i = this._comparator;
    if (r && g(t, e, 0, l - 1, i), this._root === null)
      this._root = a(t, e, 0, l), this._size = l;
    else {
      const o = y(
        this.toList(),
        x(t, e),
        i
      );
      l = this._size + l, this._root = p({ head: o }, 0, l);
    }
    return this;
  }
  isEmpty() {
    return this._root === null;
  }
  get size() {
    return this._size;
  }
  get root() {
    return this._root;
  }
  toString(t = (e) => String(e.key)) {
    const e = [];
    return _(this._root, "", true, (r) => e.push(r), t), e.join("");
  }
  update(t, e, r) {
    const l = this._comparator;
    let { left: i, right: o } = m(t, this._root, l);
    l(t, e) < 0 ? o = c(e, r, o, l) : i = c(e, r, i, l), this._root = w(i, o, l);
  }
  split(t) {
    return m(t, this._root, this._comparator);
  }
  *[Symbol.iterator]() {
    let t = this._root;
    const e = [];
    let r = false;
    for (; !r; )
      t !== null ? (e.push(t), t = t.left) : e.length !== 0 ? (t = e.pop(), yield t, t = t.right) : r = true;
  }
};
function a(n, t, e, r) {
  const l = r - e;
  if (l > 0) {
    const i = e + Math.floor(l / 2), o = n[i], s = t[i], h = new f(o, s);
    return h.left = a(n, t, e, i), h.right = a(n, t, i + 1, r), h;
  }
  return null;
}
function x(n, t) {
  const e = new f(null, null);
  let r = e;
  for (let l = 0; l < n.length; l++)
    r = r.next = new f(n[l], t[l]);
  return r.next = null, e.next;
}
function k(n) {
  let t = n;
  const e = [];
  let r = false;
  const l = new f(null, null);
  let i = l;
  for (; !r; )
    t ? (e.push(t), t = t.left) : e.length > 0 ? (t = i = i.next = e.pop(), t = t.right) : r = true;
  return i.next = null, l.next;
}
function p(n, t, e) {
  const r = e - t;
  if (r > 0) {
    const l = t + Math.floor(r / 2), i = p(n, t, l), o = n.head;
    return o.left = i, n.head = n.head.next, o.right = p(n, l + 1, e), o;
  }
  return null;
}
function y(n, t, e) {
  const r = new f(null, null);
  let l = r, i = n, o = t;
  for (; i !== null && o !== null; )
    e(i.key, o.key) < 0 ? (l.next = i, i = i.next) : (l.next = o, o = o.next), l = l.next;
  return i !== null ? l.next = i : o !== null && (l.next = o), r.next;
}
function g(n, t, e, r, l) {
  if (e >= r) return;
  const i = n[e + r >> 1];
  let o = e - 1, s = r + 1;
  for (; ; ) {
    do
      o++;
    while (l(n[o], i) < 0);
    do
      s--;
    while (l(n[s], i) > 0);
    if (o >= s) break;
    let h = n[o];
    n[o] = n[s], n[s] = h, h = t[o], t[o] = t[s], t[s] = h;
  }
  g(n, t, e, s, l), g(n, t, s + 1, r, l);
}

// node_modules/robust-predicates/esm/util.js
var epsilon = 11102230246251565e-32;
var splitter = 134217729;
var resulterrbound = (3 + 8 * epsilon) * epsilon;
function sum(elen, e, flen, f2, h) {
  let Q2, Qnew, hh, bvirt;
  let enow = e[0];
  let fnow = f2[0];
  let eindex = 0;
  let findex = 0;
  if (fnow > enow === fnow > -enow) {
    Q2 = enow;
    enow = e[++eindex];
  } else {
    Q2 = fnow;
    fnow = f2[++findex];
  }
  let hindex = 0;
  if (eindex < elen && findex < flen) {
    if (fnow > enow === fnow > -enow) {
      Qnew = enow + Q2;
      hh = Q2 - (Qnew - enow);
      enow = e[++eindex];
    } else {
      Qnew = fnow + Q2;
      hh = Q2 - (Qnew - fnow);
      fnow = f2[++findex];
    }
    Q2 = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
    while (eindex < elen && findex < flen) {
      if (fnow > enow === fnow > -enow) {
        Qnew = Q2 + enow;
        bvirt = Qnew - Q2;
        hh = Q2 - (Qnew - bvirt) + (enow - bvirt);
        enow = e[++eindex];
      } else {
        Qnew = Q2 + fnow;
        bvirt = Qnew - Q2;
        hh = Q2 - (Qnew - bvirt) + (fnow - bvirt);
        fnow = f2[++findex];
      }
      Q2 = Qnew;
      if (hh !== 0) {
        h[hindex++] = hh;
      }
    }
  }
  while (eindex < elen) {
    Qnew = Q2 + enow;
    bvirt = Qnew - Q2;
    hh = Q2 - (Qnew - bvirt) + (enow - bvirt);
    enow = e[++eindex];
    Q2 = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  while (findex < flen) {
    Qnew = Q2 + fnow;
    bvirt = Qnew - Q2;
    hh = Q2 - (Qnew - bvirt) + (fnow - bvirt);
    fnow = f2[++findex];
    Q2 = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  if (Q2 !== 0 || hindex === 0) {
    h[hindex++] = Q2;
  }
  return hindex;
}
function estimate(elen, e) {
  let Q2 = e[0];
  for (let i = 1; i < elen; i++) Q2 += e[i];
  return Q2;
}
function vec(n) {
  return new Float64Array(n);
}

// node_modules/robust-predicates/esm/orient2d.js
var ccwerrboundA = (3 + 16 * epsilon) * epsilon;
var ccwerrboundB = (2 + 12 * epsilon) * epsilon;
var ccwerrboundC = (9 + 64 * epsilon) * epsilon * epsilon;
var B = vec(4);
var C1 = vec(8);
var C2 = vec(12);
var D = vec(16);
var u2 = vec(4);
function orient2dadapt(ax, ay, bx, by, cx, cy, detsum) {
  let acxtail, acytail, bcxtail, bcytail;
  let bvirt, c2, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u32;
  const acx = ax - cx;
  const bcx = bx - cx;
  const acy = ay - cy;
  const bcy = by - cy;
  s1 = acx * bcy;
  c2 = splitter * acx;
  ahi = c2 - (c2 - acx);
  alo = acx - ahi;
  c2 = splitter * bcy;
  bhi = c2 - (c2 - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcx;
  c2 = splitter * acy;
  ahi = c2 - (c2 - acy);
  alo = acy - ahi;
  c2 = splitter * bcx;
  bhi = c2 - (c2 - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  B[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  B[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  B[2] = _j - (u32 - bvirt) + (_i - bvirt);
  B[3] = u32;
  let det = estimate(4, B);
  let errbound = ccwerrboundB * detsum;
  if (det >= errbound || -det >= errbound) {
    return det;
  }
  bvirt = ax - acx;
  acxtail = ax - (acx + bvirt) + (bvirt - cx);
  bvirt = bx - bcx;
  bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
  bvirt = ay - acy;
  acytail = ay - (acy + bvirt) + (bvirt - cy);
  bvirt = by - bcy;
  bcytail = by - (bcy + bvirt) + (bvirt - cy);
  if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) {
    return det;
  }
  errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
  det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
  if (det >= errbound || -det >= errbound) return det;
  s1 = acxtail * bcy;
  c2 = splitter * acxtail;
  ahi = c2 - (c2 - acxtail);
  alo = acxtail - ahi;
  c2 = splitter * bcy;
  bhi = c2 - (c2 - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcx;
  c2 = splitter * acytail;
  ahi = c2 - (c2 - acytail);
  alo = acytail - ahi;
  c2 = splitter * bcx;
  bhi = c2 - (c2 - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u2[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u2[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u2[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u2[3] = u32;
  const C1len = sum(4, B, 4, u2, C1);
  s1 = acx * bcytail;
  c2 = splitter * acx;
  ahi = c2 - (c2 - acx);
  alo = acx - ahi;
  c2 = splitter * bcytail;
  bhi = c2 - (c2 - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcxtail;
  c2 = splitter * acy;
  ahi = c2 - (c2 - acy);
  alo = acy - ahi;
  c2 = splitter * bcxtail;
  bhi = c2 - (c2 - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u2[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u2[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u2[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u2[3] = u32;
  const C2len = sum(C1len, C1, 4, u2, C2);
  s1 = acxtail * bcytail;
  c2 = splitter * acxtail;
  ahi = c2 - (c2 - acxtail);
  alo = acxtail - ahi;
  c2 = splitter * bcytail;
  bhi = c2 - (c2 - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcxtail;
  c2 = splitter * acytail;
  ahi = c2 - (c2 - acytail);
  alo = acytail - ahi;
  c2 = splitter * bcxtail;
  bhi = c2 - (c2 - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u2[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u2[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u2[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u2[3] = u32;
  const Dlen = sum(C2len, C2, 4, u2, D);
  return D[Dlen - 1];
}
function orient2d(ax, ay, bx, by, cx, cy) {
  const detleft = (ay - cy) * (bx - cx);
  const detright = (ax - cx) * (by - cy);
  const det = detleft - detright;
  const detsum = Math.abs(detleft + detright);
  if (Math.abs(det) >= ccwerrboundA * detsum) return det;
  return -orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
}

// node_modules/robust-predicates/esm/orient3d.js
var o3derrboundA = (7 + 56 * epsilon) * epsilon;
var o3derrboundB = (3 + 28 * epsilon) * epsilon;
var o3derrboundC = (26 + 288 * epsilon) * epsilon * epsilon;
var bc = vec(4);
var ca = vec(4);
var ab = vec(4);
var at_b = vec(4);
var at_c = vec(4);
var bt_c = vec(4);
var bt_a = vec(4);
var ct_a = vec(4);
var ct_b = vec(4);
var bct = vec(8);
var cat = vec(8);
var abt = vec(8);
var u3 = vec(4);
var _8 = vec(8);
var _8b = vec(8);
var _16 = vec(16);
var _12 = vec(12);
var fin = vec(192);
var fin2 = vec(192);

// node_modules/robust-predicates/esm/incircle.js
var iccerrboundA = (10 + 96 * epsilon) * epsilon;
var iccerrboundB = (4 + 48 * epsilon) * epsilon;
var iccerrboundC = (44 + 576 * epsilon) * epsilon * epsilon;
var bc2 = vec(4);
var ca2 = vec(4);
var ab2 = vec(4);
var aa = vec(4);
var bb = vec(4);
var cc = vec(4);
var u4 = vec(4);
var v = vec(4);
var axtbc = vec(8);
var aytbc = vec(8);
var bxtca = vec(8);
var bytca = vec(8);
var cxtab = vec(8);
var cytab = vec(8);
var abt2 = vec(8);
var bct2 = vec(8);
var cat2 = vec(8);
var abtt = vec(4);
var bctt = vec(4);
var catt = vec(4);
var _82 = vec(8);
var _162 = vec(16);
var _16b = vec(16);
var _16c = vec(16);
var _32 = vec(32);
var _32b = vec(32);
var _48 = vec(48);
var _64 = vec(64);
var fin3 = vec(1152);
var fin22 = vec(1152);

// node_modules/robust-predicates/esm/insphere.js
var isperrboundA = (16 + 224 * epsilon) * epsilon;
var isperrboundB = (5 + 72 * epsilon) * epsilon;
var isperrboundC = (71 + 1408 * epsilon) * epsilon * epsilon;
var ab3 = vec(4);
var bc3 = vec(4);
var cd = vec(4);
var de = vec(4);
var ea = vec(4);
var ac = vec(4);
var bd = vec(4);
var ce = vec(4);
var da = vec(4);
var eb = vec(4);
var abc = vec(24);
var bcd = vec(24);
var cde = vec(24);
var dea = vec(24);
var eab = vec(24);
var abd = vec(24);
var bce = vec(24);
var cda = vec(24);
var deb = vec(24);
var eac = vec(24);
var adet = vec(1152);
var bdet = vec(1152);
var cdet = vec(1152);
var ddet = vec(1152);
var edet = vec(1152);
var abdet = vec(2304);
var cddet = vec(2304);
var cdedet = vec(3456);
var deter = vec(5760);
var _83 = vec(8);
var _8b2 = vec(8);
var _8c = vec(8);
var _163 = vec(16);
var _24 = vec(24);
var _482 = vec(48);
var _48b = vec(48);
var _96 = vec(96);
var _192 = vec(192);
var _384x = vec(384);
var _384y = vec(384);
var _384z = vec(384);
var _768 = vec(768);
var xdet = vec(96);
var ydet = vec(96);
var zdet = vec(96);
var fin4 = vec(1152);

// node_modules/polygon-clipping/dist/polygon-clipping.esm.js
var isInBbox = (bbox, point) => {
  return bbox.ll.x <= point.x && point.x <= bbox.ur.x && bbox.ll.y <= point.y && point.y <= bbox.ur.y;
};
var getBboxOverlap = (b1, b2) => {
  if (b2.ur.x < b1.ll.x || b1.ur.x < b2.ll.x || b2.ur.y < b1.ll.y || b1.ur.y < b2.ll.y) return null;
  const lowerX = b1.ll.x < b2.ll.x ? b2.ll.x : b1.ll.x;
  const upperX = b1.ur.x < b2.ur.x ? b1.ur.x : b2.ur.x;
  const lowerY = b1.ll.y < b2.ll.y ? b2.ll.y : b1.ll.y;
  const upperY = b1.ur.y < b2.ur.y ? b1.ur.y : b2.ur.y;
  return {
    ll: {
      x: lowerX,
      y: lowerY
    },
    ur: {
      x: upperX,
      y: upperY
    }
  };
};
var epsilon2 = Number.EPSILON;
if (epsilon2 === void 0) epsilon2 = Math.pow(2, -52);
var EPSILON_SQ = epsilon2 * epsilon2;
var cmp = (a2, b) => {
  if (-epsilon2 < a2 && a2 < epsilon2) {
    if (-epsilon2 < b && b < epsilon2) {
      return 0;
    }
  }
  const ab4 = a2 - b;
  if (ab4 * ab4 < EPSILON_SQ * a2 * b) {
    return 0;
  }
  return a2 < b ? -1 : 1;
};
var PtRounder = class {
  constructor() {
    this.reset();
  }
  reset() {
    this.xRounder = new CoordRounder();
    this.yRounder = new CoordRounder();
  }
  round(x2, y2) {
    return {
      x: this.xRounder.round(x2),
      y: this.yRounder.round(y2)
    };
  }
};
var CoordRounder = class {
  constructor() {
    this.tree = new z();
    this.round(0);
  }
  // Note: this can rounds input values backwards or forwards.
  //       You might ask, why not restrict this to just rounding
  //       forwards? Wouldn't that allow left endpoints to always
  //       remain left endpoints during splitting (never change to
  //       right). No - it wouldn't, because we snap intersections
  //       to endpoints (to establish independence from the segment
  //       angle for t-intersections).
  round(coord) {
    const node = this.tree.add(coord);
    const prevNode = this.tree.prev(node);
    if (prevNode !== null && cmp(node.key, prevNode.key) === 0) {
      this.tree.remove(coord);
      return prevNode.key;
    }
    const nextNode = this.tree.next(node);
    if (nextNode !== null && cmp(node.key, nextNode.key) === 0) {
      this.tree.remove(coord);
      return nextNode.key;
    }
    return coord;
  }
};
var rounder = new PtRounder();
var crossProduct = (a2, b) => a2.x * b.y - a2.y * b.x;
var dotProduct = (a2, b) => a2.x * b.x + a2.y * b.y;
var compareVectorAngles = (basePt, endPt1, endPt2) => {
  const res = orient2d(basePt.x, basePt.y, endPt1.x, endPt1.y, endPt2.x, endPt2.y);
  if (res > 0) return -1;
  if (res < 0) return 1;
  return 0;
};
var length = (v2) => Math.sqrt(dotProduct(v2, v2));
var sineOfAngle = (pShared, pBase, pAngle) => {
  const vBase = {
    x: pBase.x - pShared.x,
    y: pBase.y - pShared.y
  };
  const vAngle = {
    x: pAngle.x - pShared.x,
    y: pAngle.y - pShared.y
  };
  return crossProduct(vAngle, vBase) / length(vAngle) / length(vBase);
};
var cosineOfAngle = (pShared, pBase, pAngle) => {
  const vBase = {
    x: pBase.x - pShared.x,
    y: pBase.y - pShared.y
  };
  const vAngle = {
    x: pAngle.x - pShared.x,
    y: pAngle.y - pShared.y
  };
  return dotProduct(vAngle, vBase) / length(vAngle) / length(vBase);
};
var horizontalIntersection = (pt, v2, y2) => {
  if (v2.y === 0) return null;
  return {
    x: pt.x + v2.x / v2.y * (y2 - pt.y),
    y: y2
  };
};
var verticalIntersection = (pt, v2, x2) => {
  if (v2.x === 0) return null;
  return {
    x: x2,
    y: pt.y + v2.y / v2.x * (x2 - pt.x)
  };
};
var intersection$1 = (pt1, v1, pt2, v2) => {
  if (v1.x === 0) return verticalIntersection(pt2, v2, pt1.x);
  if (v2.x === 0) return verticalIntersection(pt1, v1, pt2.x);
  if (v1.y === 0) return horizontalIntersection(pt2, v2, pt1.y);
  if (v2.y === 0) return horizontalIntersection(pt1, v1, pt2.y);
  const kross = crossProduct(v1, v2);
  if (kross == 0) return null;
  const ve = {
    x: pt2.x - pt1.x,
    y: pt2.y - pt1.y
  };
  const d1 = crossProduct(ve, v1) / kross;
  const d2 = crossProduct(ve, v2) / kross;
  const x1 = pt1.x + d2 * v1.x, x2 = pt2.x + d1 * v2.x;
  const y1 = pt1.y + d2 * v1.y, y2 = pt2.y + d1 * v2.y;
  const x3 = (x1 + x2) / 2;
  const y3 = (y1 + y2) / 2;
  return {
    x: x3,
    y: y3
  };
};
var SweepEvent = class _SweepEvent {
  // for ordering sweep events in the sweep event queue
  static compare(a2, b) {
    const ptCmp = _SweepEvent.comparePoints(a2.point, b.point);
    if (ptCmp !== 0) return ptCmp;
    if (a2.point !== b.point) a2.link(b);
    if (a2.isLeft !== b.isLeft) return a2.isLeft ? 1 : -1;
    return Segment.compare(a2.segment, b.segment);
  }
  // for ordering points in sweep line order
  static comparePoints(aPt, bPt) {
    if (aPt.x < bPt.x) return -1;
    if (aPt.x > bPt.x) return 1;
    if (aPt.y < bPt.y) return -1;
    if (aPt.y > bPt.y) return 1;
    return 0;
  }
  // Warning: 'point' input will be modified and re-used (for performance)
  constructor(point, isLeft) {
    if (point.events === void 0) point.events = [this];
    else point.events.push(this);
    this.point = point;
    this.isLeft = isLeft;
  }
  link(other) {
    if (other.point === this.point) {
      throw new Error("Tried to link already linked events");
    }
    const otherEvents = other.point.events;
    for (let i = 0, iMax = otherEvents.length; i < iMax; i++) {
      const evt = otherEvents[i];
      this.point.events.push(evt);
      evt.point = this.point;
    }
    this.checkForConsuming();
  }
  /* Do a pass over our linked events and check to see if any pair
   * of segments match, and should be consumed. */
  checkForConsuming() {
    const numEvents = this.point.events.length;
    for (let i = 0; i < numEvents; i++) {
      const evt1 = this.point.events[i];
      if (evt1.segment.consumedBy !== void 0) continue;
      for (let j = i + 1; j < numEvents; j++) {
        const evt2 = this.point.events[j];
        if (evt2.consumedBy !== void 0) continue;
        if (evt1.otherSE.point.events !== evt2.otherSE.point.events) continue;
        evt1.segment.consume(evt2.segment);
      }
    }
  }
  getAvailableLinkedEvents() {
    const events = [];
    for (let i = 0, iMax = this.point.events.length; i < iMax; i++) {
      const evt = this.point.events[i];
      if (evt !== this && !evt.segment.ringOut && evt.segment.isInResult()) {
        events.push(evt);
      }
    }
    return events;
  }
  /**
   * Returns a comparator function for sorting linked events that will
   * favor the event that will give us the smallest left-side angle.
   * All ring construction starts as low as possible heading to the right,
   * so by always turning left as sharp as possible we'll get polygons
   * without uncessary loops & holes.
   *
   * The comparator function has a compute cache such that it avoids
   * re-computing already-computed values.
   */
  getLeftmostComparator(baseEvent) {
    const cache = /* @__PURE__ */ new Map();
    const fillCache = (linkedEvent) => {
      const nextEvent = linkedEvent.otherSE;
      cache.set(linkedEvent, {
        sine: sineOfAngle(this.point, baseEvent.point, nextEvent.point),
        cosine: cosineOfAngle(this.point, baseEvent.point, nextEvent.point)
      });
    };
    return (a2, b) => {
      if (!cache.has(a2)) fillCache(a2);
      if (!cache.has(b)) fillCache(b);
      const {
        sine: asine,
        cosine: acosine
      } = cache.get(a2);
      const {
        sine: bsine,
        cosine: bcosine
      } = cache.get(b);
      if (asine >= 0 && bsine >= 0) {
        if (acosine < bcosine) return 1;
        if (acosine > bcosine) return -1;
        return 0;
      }
      if (asine < 0 && bsine < 0) {
        if (acosine < bcosine) return -1;
        if (acosine > bcosine) return 1;
        return 0;
      }
      if (bsine < asine) return -1;
      if (bsine > asine) return 1;
      return 0;
    };
  }
};
var segmentId = 0;
var Segment = class _Segment {
  /* This compare() function is for ordering segments in the sweep
   * line tree, and does so according to the following criteria:
   *
   * Consider the vertical line that lies an infinestimal step to the
   * right of the right-more of the two left endpoints of the input
   * segments. Imagine slowly moving a point up from negative infinity
   * in the increasing y direction. Which of the two segments will that
   * point intersect first? That segment comes 'before' the other one.
   *
   * If neither segment would be intersected by such a line, (if one
   * or more of the segments are vertical) then the line to be considered
   * is directly on the right-more of the two left inputs.
   */
  static compare(a2, b) {
    const alx = a2.leftSE.point.x;
    const blx = b.leftSE.point.x;
    const arx = a2.rightSE.point.x;
    const brx = b.rightSE.point.x;
    if (brx < alx) return 1;
    if (arx < blx) return -1;
    const aly = a2.leftSE.point.y;
    const bly = b.leftSE.point.y;
    const ary = a2.rightSE.point.y;
    const bry = b.rightSE.point.y;
    if (alx < blx) {
      if (bly < aly && bly < ary) return 1;
      if (bly > aly && bly > ary) return -1;
      const aCmpBLeft = a2.comparePoint(b.leftSE.point);
      if (aCmpBLeft < 0) return 1;
      if (aCmpBLeft > 0) return -1;
      const bCmpARight = b.comparePoint(a2.rightSE.point);
      if (bCmpARight !== 0) return bCmpARight;
      return -1;
    }
    if (alx > blx) {
      if (aly < bly && aly < bry) return -1;
      if (aly > bly && aly > bry) return 1;
      const bCmpALeft = b.comparePoint(a2.leftSE.point);
      if (bCmpALeft !== 0) return bCmpALeft;
      const aCmpBRight = a2.comparePoint(b.rightSE.point);
      if (aCmpBRight < 0) return 1;
      if (aCmpBRight > 0) return -1;
      return 1;
    }
    if (aly < bly) return -1;
    if (aly > bly) return 1;
    if (arx < brx) {
      const bCmpARight = b.comparePoint(a2.rightSE.point);
      if (bCmpARight !== 0) return bCmpARight;
    }
    if (arx > brx) {
      const aCmpBRight = a2.comparePoint(b.rightSE.point);
      if (aCmpBRight < 0) return 1;
      if (aCmpBRight > 0) return -1;
    }
    if (arx !== brx) {
      const ay = ary - aly;
      const ax = arx - alx;
      const by = bry - bly;
      const bx = brx - blx;
      if (ay > ax && by < bx) return 1;
      if (ay < ax && by > bx) return -1;
    }
    if (arx > brx) return 1;
    if (arx < brx) return -1;
    if (ary < bry) return -1;
    if (ary > bry) return 1;
    if (a2.id < b.id) return -1;
    if (a2.id > b.id) return 1;
    return 0;
  }
  /* Warning: a reference to ringWindings input will be stored,
   *  and possibly will be later modified */
  constructor(leftSE, rightSE, rings, windings) {
    this.id = ++segmentId;
    this.leftSE = leftSE;
    leftSE.segment = this;
    leftSE.otherSE = rightSE;
    this.rightSE = rightSE;
    rightSE.segment = this;
    rightSE.otherSE = leftSE;
    this.rings = rings;
    this.windings = windings;
  }
  static fromRing(pt1, pt2, ring) {
    let leftPt, rightPt, winding;
    const cmpPts = SweepEvent.comparePoints(pt1, pt2);
    if (cmpPts < 0) {
      leftPt = pt1;
      rightPt = pt2;
      winding = 1;
    } else if (cmpPts > 0) {
      leftPt = pt2;
      rightPt = pt1;
      winding = -1;
    } else throw new Error(`Tried to create degenerate segment at [${pt1.x}, ${pt1.y}]`);
    const leftSE = new SweepEvent(leftPt, true);
    const rightSE = new SweepEvent(rightPt, false);
    return new _Segment(leftSE, rightSE, [ring], [winding]);
  }
  /* When a segment is split, the rightSE is replaced with a new sweep event */
  replaceRightSE(newRightSE) {
    this.rightSE = newRightSE;
    this.rightSE.segment = this;
    this.rightSE.otherSE = this.leftSE;
    this.leftSE.otherSE = this.rightSE;
  }
  bbox() {
    const y1 = this.leftSE.point.y;
    const y2 = this.rightSE.point.y;
    return {
      ll: {
        x: this.leftSE.point.x,
        y: y1 < y2 ? y1 : y2
      },
      ur: {
        x: this.rightSE.point.x,
        y: y1 > y2 ? y1 : y2
      }
    };
  }
  /* A vector from the left point to the right */
  vector() {
    return {
      x: this.rightSE.point.x - this.leftSE.point.x,
      y: this.rightSE.point.y - this.leftSE.point.y
    };
  }
  isAnEndpoint(pt) {
    return pt.x === this.leftSE.point.x && pt.y === this.leftSE.point.y || pt.x === this.rightSE.point.x && pt.y === this.rightSE.point.y;
  }
  /* Compare this segment with a point.
   *
   * A point P is considered to be colinear to a segment if there
   * exists a distance D such that if we travel along the segment
   * from one * endpoint towards the other a distance D, we find
   * ourselves at point P.
   *
   * Return value indicates:
   *
   *   1: point lies above the segment (to the left of vertical)
   *   0: point is colinear to segment
   *  -1: point lies below the segment (to the right of vertical)
   */
  comparePoint(point) {
    if (this.isAnEndpoint(point)) return 0;
    const lPt = this.leftSE.point;
    const rPt = this.rightSE.point;
    const v2 = this.vector();
    if (lPt.x === rPt.x) {
      if (point.x === lPt.x) return 0;
      return point.x < lPt.x ? 1 : -1;
    }
    const yDist = (point.y - lPt.y) / v2.y;
    const xFromYDist = lPt.x + yDist * v2.x;
    if (point.x === xFromYDist) return 0;
    const xDist = (point.x - lPt.x) / v2.x;
    const yFromXDist = lPt.y + xDist * v2.y;
    if (point.y === yFromXDist) return 0;
    return point.y < yFromXDist ? -1 : 1;
  }
  /**
   * Given another segment, returns the first non-trivial intersection
   * between the two segments (in terms of sweep line ordering), if it exists.
   *
   * A 'non-trivial' intersection is one that will cause one or both of the
   * segments to be split(). As such, 'trivial' vs. 'non-trivial' intersection:
   *
   *   * endpoint of segA with endpoint of segB --> trivial
   *   * endpoint of segA with point along segB --> non-trivial
   *   * endpoint of segB with point along segA --> non-trivial
   *   * point along segA with point along segB --> non-trivial
   *
   * If no non-trivial intersection exists, return null
   * Else, return null.
   */
  getIntersection(other) {
    const tBbox = this.bbox();
    const oBbox = other.bbox();
    const bboxOverlap = getBboxOverlap(tBbox, oBbox);
    if (bboxOverlap === null) return null;
    const tlp = this.leftSE.point;
    const trp = this.rightSE.point;
    const olp = other.leftSE.point;
    const orp = other.rightSE.point;
    const touchesOtherLSE = isInBbox(tBbox, olp) && this.comparePoint(olp) === 0;
    const touchesThisLSE = isInBbox(oBbox, tlp) && other.comparePoint(tlp) === 0;
    const touchesOtherRSE = isInBbox(tBbox, orp) && this.comparePoint(orp) === 0;
    const touchesThisRSE = isInBbox(oBbox, trp) && other.comparePoint(trp) === 0;
    if (touchesThisLSE && touchesOtherLSE) {
      if (touchesThisRSE && !touchesOtherRSE) return trp;
      if (!touchesThisRSE && touchesOtherRSE) return orp;
      return null;
    }
    if (touchesThisLSE) {
      if (touchesOtherRSE) {
        if (tlp.x === orp.x && tlp.y === orp.y) return null;
      }
      return tlp;
    }
    if (touchesOtherLSE) {
      if (touchesThisRSE) {
        if (trp.x === olp.x && trp.y === olp.y) return null;
      }
      return olp;
    }
    if (touchesThisRSE && touchesOtherRSE) return null;
    if (touchesThisRSE) return trp;
    if (touchesOtherRSE) return orp;
    const pt = intersection$1(tlp, this.vector(), olp, other.vector());
    if (pt === null) return null;
    if (!isInBbox(bboxOverlap, pt)) return null;
    return rounder.round(pt.x, pt.y);
  }
  /**
   * Split the given segment into multiple segments on the given points.
   *  * Each existing segment will retain its leftSE and a new rightSE will be
   *    generated for it.
   *  * A new segment will be generated which will adopt the original segment's
   *    rightSE, and a new leftSE will be generated for it.
   *  * If there are more than two points given to split on, new segments
   *    in the middle will be generated with new leftSE and rightSE's.
   *  * An array of the newly generated SweepEvents will be returned.
   *
   * Warning: input array of points is modified
   */
  split(point) {
    const newEvents = [];
    const alreadyLinked = point.events !== void 0;
    const newLeftSE = new SweepEvent(point, true);
    const newRightSE = new SweepEvent(point, false);
    const oldRightSE = this.rightSE;
    this.replaceRightSE(newRightSE);
    newEvents.push(newRightSE);
    newEvents.push(newLeftSE);
    const newSeg = new _Segment(newLeftSE, oldRightSE, this.rings.slice(), this.windings.slice());
    if (SweepEvent.comparePoints(newSeg.leftSE.point, newSeg.rightSE.point) > 0) {
      newSeg.swapEvents();
    }
    if (SweepEvent.comparePoints(this.leftSE.point, this.rightSE.point) > 0) {
      this.swapEvents();
    }
    if (alreadyLinked) {
      newLeftSE.checkForConsuming();
      newRightSE.checkForConsuming();
    }
    return newEvents;
  }
  /* Swap which event is left and right */
  swapEvents() {
    const tmpEvt = this.rightSE;
    this.rightSE = this.leftSE;
    this.leftSE = tmpEvt;
    this.leftSE.isLeft = true;
    this.rightSE.isLeft = false;
    for (let i = 0, iMax = this.windings.length; i < iMax; i++) {
      this.windings[i] *= -1;
    }
  }
  /* Consume another segment. We take their rings under our wing
   * and mark them as consumed. Use for perfectly overlapping segments */
  consume(other) {
    let consumer = this;
    let consumee = other;
    while (consumer.consumedBy) consumer = consumer.consumedBy;
    while (consumee.consumedBy) consumee = consumee.consumedBy;
    const cmp2 = _Segment.compare(consumer, consumee);
    if (cmp2 === 0) return;
    if (cmp2 > 0) {
      const tmp = consumer;
      consumer = consumee;
      consumee = tmp;
    }
    if (consumer.prev === consumee) {
      const tmp = consumer;
      consumer = consumee;
      consumee = tmp;
    }
    for (let i = 0, iMax = consumee.rings.length; i < iMax; i++) {
      const ring = consumee.rings[i];
      const winding = consumee.windings[i];
      const index2 = consumer.rings.indexOf(ring);
      if (index2 === -1) {
        consumer.rings.push(ring);
        consumer.windings.push(winding);
      } else consumer.windings[index2] += winding;
    }
    consumee.rings = null;
    consumee.windings = null;
    consumee.consumedBy = consumer;
    consumee.leftSE.consumedBy = consumer.leftSE;
    consumee.rightSE.consumedBy = consumer.rightSE;
  }
  /* The first segment previous segment chain that is in the result */
  prevInResult() {
    if (this._prevInResult !== void 0) return this._prevInResult;
    if (!this.prev) this._prevInResult = null;
    else if (this.prev.isInResult()) this._prevInResult = this.prev;
    else this._prevInResult = this.prev.prevInResult();
    return this._prevInResult;
  }
  beforeState() {
    if (this._beforeState !== void 0) return this._beforeState;
    if (!this.prev) this._beforeState = {
      rings: [],
      windings: [],
      multiPolys: []
    };
    else {
      const seg = this.prev.consumedBy || this.prev;
      this._beforeState = seg.afterState();
    }
    return this._beforeState;
  }
  afterState() {
    if (this._afterState !== void 0) return this._afterState;
    const beforeState = this.beforeState();
    this._afterState = {
      rings: beforeState.rings.slice(0),
      windings: beforeState.windings.slice(0),
      multiPolys: []
    };
    const ringsAfter = this._afterState.rings;
    const windingsAfter = this._afterState.windings;
    const mpsAfter = this._afterState.multiPolys;
    for (let i = 0, iMax = this.rings.length; i < iMax; i++) {
      const ring = this.rings[i];
      const winding = this.windings[i];
      const index2 = ringsAfter.indexOf(ring);
      if (index2 === -1) {
        ringsAfter.push(ring);
        windingsAfter.push(winding);
      } else windingsAfter[index2] += winding;
    }
    const polysAfter = [];
    const polysExclude = [];
    for (let i = 0, iMax = ringsAfter.length; i < iMax; i++) {
      if (windingsAfter[i] === 0) continue;
      const ring = ringsAfter[i];
      const poly = ring.poly;
      if (polysExclude.indexOf(poly) !== -1) continue;
      if (ring.isExterior) polysAfter.push(poly);
      else {
        if (polysExclude.indexOf(poly) === -1) polysExclude.push(poly);
        const index2 = polysAfter.indexOf(ring.poly);
        if (index2 !== -1) polysAfter.splice(index2, 1);
      }
    }
    for (let i = 0, iMax = polysAfter.length; i < iMax; i++) {
      const mp = polysAfter[i].multiPoly;
      if (mpsAfter.indexOf(mp) === -1) mpsAfter.push(mp);
    }
    return this._afterState;
  }
  /* Is this segment part of the final result? */
  isInResult() {
    if (this.consumedBy) return false;
    if (this._isInResult !== void 0) return this._isInResult;
    const mpsBefore = this.beforeState().multiPolys;
    const mpsAfter = this.afterState().multiPolys;
    switch (operation.type) {
      case "union": {
        const noBefores = mpsBefore.length === 0;
        const noAfters = mpsAfter.length === 0;
        this._isInResult = noBefores !== noAfters;
        break;
      }
      case "intersection": {
        let least;
        let most;
        if (mpsBefore.length < mpsAfter.length) {
          least = mpsBefore.length;
          most = mpsAfter.length;
        } else {
          least = mpsAfter.length;
          most = mpsBefore.length;
        }
        this._isInResult = most === operation.numMultiPolys && least < most;
        break;
      }
      case "xor": {
        const diff = Math.abs(mpsBefore.length - mpsAfter.length);
        this._isInResult = diff % 2 === 1;
        break;
      }
      case "difference": {
        const isJustSubject = (mps) => mps.length === 1 && mps[0].isSubject;
        this._isInResult = isJustSubject(mpsBefore) !== isJustSubject(mpsAfter);
        break;
      }
      default:
        throw new Error(`Unrecognized operation type found ${operation.type}`);
    }
    return this._isInResult;
  }
};
var RingIn = class {
  constructor(geomRing, poly, isExterior) {
    if (!Array.isArray(geomRing) || geomRing.length === 0) {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    this.poly = poly;
    this.isExterior = isExterior;
    this.segments = [];
    if (typeof geomRing[0][0] !== "number" || typeof geomRing[0][1] !== "number") {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    const firstPoint = rounder.round(geomRing[0][0], geomRing[0][1]);
    this.bbox = {
      ll: {
        x: firstPoint.x,
        y: firstPoint.y
      },
      ur: {
        x: firstPoint.x,
        y: firstPoint.y
      }
    };
    let prevPoint = firstPoint;
    for (let i = 1, iMax = geomRing.length; i < iMax; i++) {
      if (typeof geomRing[i][0] !== "number" || typeof geomRing[i][1] !== "number") {
        throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
      }
      let point = rounder.round(geomRing[i][0], geomRing[i][1]);
      if (point.x === prevPoint.x && point.y === prevPoint.y) continue;
      this.segments.push(Segment.fromRing(prevPoint, point, this));
      if (point.x < this.bbox.ll.x) this.bbox.ll.x = point.x;
      if (point.y < this.bbox.ll.y) this.bbox.ll.y = point.y;
      if (point.x > this.bbox.ur.x) this.bbox.ur.x = point.x;
      if (point.y > this.bbox.ur.y) this.bbox.ur.y = point.y;
      prevPoint = point;
    }
    if (firstPoint.x !== prevPoint.x || firstPoint.y !== prevPoint.y) {
      this.segments.push(Segment.fromRing(prevPoint, firstPoint, this));
    }
  }
  getSweepEvents() {
    const sweepEvents = [];
    for (let i = 0, iMax = this.segments.length; i < iMax; i++) {
      const segment = this.segments[i];
      sweepEvents.push(segment.leftSE);
      sweepEvents.push(segment.rightSE);
    }
    return sweepEvents;
  }
};
var PolyIn = class {
  constructor(geomPoly, multiPoly) {
    if (!Array.isArray(geomPoly)) {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    this.exteriorRing = new RingIn(geomPoly[0], this, true);
    this.bbox = {
      ll: {
        x: this.exteriorRing.bbox.ll.x,
        y: this.exteriorRing.bbox.ll.y
      },
      ur: {
        x: this.exteriorRing.bbox.ur.x,
        y: this.exteriorRing.bbox.ur.y
      }
    };
    this.interiorRings = [];
    for (let i = 1, iMax = geomPoly.length; i < iMax; i++) {
      const ring = new RingIn(geomPoly[i], this, false);
      if (ring.bbox.ll.x < this.bbox.ll.x) this.bbox.ll.x = ring.bbox.ll.x;
      if (ring.bbox.ll.y < this.bbox.ll.y) this.bbox.ll.y = ring.bbox.ll.y;
      if (ring.bbox.ur.x > this.bbox.ur.x) this.bbox.ur.x = ring.bbox.ur.x;
      if (ring.bbox.ur.y > this.bbox.ur.y) this.bbox.ur.y = ring.bbox.ur.y;
      this.interiorRings.push(ring);
    }
    this.multiPoly = multiPoly;
  }
  getSweepEvents() {
    const sweepEvents = this.exteriorRing.getSweepEvents();
    for (let i = 0, iMax = this.interiorRings.length; i < iMax; i++) {
      const ringSweepEvents = this.interiorRings[i].getSweepEvents();
      for (let j = 0, jMax = ringSweepEvents.length; j < jMax; j++) {
        sweepEvents.push(ringSweepEvents[j]);
      }
    }
    return sweepEvents;
  }
};
var MultiPolyIn = class {
  constructor(geom, isSubject) {
    if (!Array.isArray(geom)) {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    try {
      if (typeof geom[0][0][0] === "number") geom = [geom];
    } catch (ex) {
    }
    this.polys = [];
    this.bbox = {
      ll: {
        x: Number.POSITIVE_INFINITY,
        y: Number.POSITIVE_INFINITY
      },
      ur: {
        x: Number.NEGATIVE_INFINITY,
        y: Number.NEGATIVE_INFINITY
      }
    };
    for (let i = 0, iMax = geom.length; i < iMax; i++) {
      const poly = new PolyIn(geom[i], this);
      if (poly.bbox.ll.x < this.bbox.ll.x) this.bbox.ll.x = poly.bbox.ll.x;
      if (poly.bbox.ll.y < this.bbox.ll.y) this.bbox.ll.y = poly.bbox.ll.y;
      if (poly.bbox.ur.x > this.bbox.ur.x) this.bbox.ur.x = poly.bbox.ur.x;
      if (poly.bbox.ur.y > this.bbox.ur.y) this.bbox.ur.y = poly.bbox.ur.y;
      this.polys.push(poly);
    }
    this.isSubject = isSubject;
  }
  getSweepEvents() {
    const sweepEvents = [];
    for (let i = 0, iMax = this.polys.length; i < iMax; i++) {
      const polySweepEvents = this.polys[i].getSweepEvents();
      for (let j = 0, jMax = polySweepEvents.length; j < jMax; j++) {
        sweepEvents.push(polySweepEvents[j]);
      }
    }
    return sweepEvents;
  }
};
var RingOut = class _RingOut {
  /* Given the segments from the sweep line pass, compute & return a series
   * of closed rings from all the segments marked to be part of the result */
  static factory(allSegments) {
    const ringsOut = [];
    for (let i = 0, iMax = allSegments.length; i < iMax; i++) {
      const segment = allSegments[i];
      if (!segment.isInResult() || segment.ringOut) continue;
      let prevEvent = null;
      let event = segment.leftSE;
      let nextEvent = segment.rightSE;
      const events = [event];
      const startingPoint = event.point;
      const intersectionLEs = [];
      while (true) {
        prevEvent = event;
        event = nextEvent;
        events.push(event);
        if (event.point === startingPoint) break;
        while (true) {
          const availableLEs = event.getAvailableLinkedEvents();
          if (availableLEs.length === 0) {
            const firstPt = events[0].point;
            const lastPt = events[events.length - 1].point;
            throw new Error(`Unable to complete output ring starting at [${firstPt.x}, ${firstPt.y}]. Last matching segment found ends at [${lastPt.x}, ${lastPt.y}].`);
          }
          if (availableLEs.length === 1) {
            nextEvent = availableLEs[0].otherSE;
            break;
          }
          let indexLE = null;
          for (let j = 0, jMax = intersectionLEs.length; j < jMax; j++) {
            if (intersectionLEs[j].point === event.point) {
              indexLE = j;
              break;
            }
          }
          if (indexLE !== null) {
            const intersectionLE = intersectionLEs.splice(indexLE)[0];
            const ringEvents = events.splice(intersectionLE.index);
            ringEvents.unshift(ringEvents[0].otherSE);
            ringsOut.push(new _RingOut(ringEvents.reverse()));
            continue;
          }
          intersectionLEs.push({
            index: events.length,
            point: event.point
          });
          const comparator = event.getLeftmostComparator(prevEvent);
          nextEvent = availableLEs.sort(comparator)[0].otherSE;
          break;
        }
      }
      ringsOut.push(new _RingOut(events));
    }
    return ringsOut;
  }
  constructor(events) {
    this.events = events;
    for (let i = 0, iMax = events.length; i < iMax; i++) {
      events[i].segment.ringOut = this;
    }
    this.poly = null;
  }
  getGeom() {
    let prevPt = this.events[0].point;
    const points = [prevPt];
    for (let i = 1, iMax = this.events.length - 1; i < iMax; i++) {
      const pt2 = this.events[i].point;
      const nextPt2 = this.events[i + 1].point;
      if (compareVectorAngles(pt2, prevPt, nextPt2) === 0) continue;
      points.push(pt2);
      prevPt = pt2;
    }
    if (points.length === 1) return null;
    const pt = points[0];
    const nextPt = points[1];
    if (compareVectorAngles(pt, prevPt, nextPt) === 0) points.shift();
    points.push(points[0]);
    const step = this.isExteriorRing() ? 1 : -1;
    const iStart = this.isExteriorRing() ? 0 : points.length - 1;
    const iEnd = this.isExteriorRing() ? points.length : -1;
    const orderedPoints = [];
    for (let i = iStart; i != iEnd; i += step) orderedPoints.push([points[i].x, points[i].y]);
    return orderedPoints;
  }
  isExteriorRing() {
    if (this._isExteriorRing === void 0) {
      const enclosing = this.enclosingRing();
      this._isExteriorRing = enclosing ? !enclosing.isExteriorRing() : true;
    }
    return this._isExteriorRing;
  }
  enclosingRing() {
    if (this._enclosingRing === void 0) {
      this._enclosingRing = this._calcEnclosingRing();
    }
    return this._enclosingRing;
  }
  /* Returns the ring that encloses this one, if any */
  _calcEnclosingRing() {
    let leftMostEvt = this.events[0];
    for (let i = 1, iMax = this.events.length; i < iMax; i++) {
      const evt = this.events[i];
      if (SweepEvent.compare(leftMostEvt, evt) > 0) leftMostEvt = evt;
    }
    let prevSeg = leftMostEvt.segment.prevInResult();
    let prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
    while (true) {
      if (!prevSeg) return null;
      if (!prevPrevSeg) return prevSeg.ringOut;
      if (prevPrevSeg.ringOut !== prevSeg.ringOut) {
        if (prevPrevSeg.ringOut.enclosingRing() !== prevSeg.ringOut) {
          return prevSeg.ringOut;
        } else return prevSeg.ringOut.enclosingRing();
      }
      prevSeg = prevPrevSeg.prevInResult();
      prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
    }
  }
};
var PolyOut = class {
  constructor(exteriorRing) {
    this.exteriorRing = exteriorRing;
    exteriorRing.poly = this;
    this.interiorRings = [];
  }
  addInterior(ring) {
    this.interiorRings.push(ring);
    ring.poly = this;
  }
  getGeom() {
    const geom = [this.exteriorRing.getGeom()];
    if (geom[0] === null) return null;
    for (let i = 0, iMax = this.interiorRings.length; i < iMax; i++) {
      const ringGeom = this.interiorRings[i].getGeom();
      if (ringGeom === null) continue;
      geom.push(ringGeom);
    }
    return geom;
  }
};
var MultiPolyOut = class {
  constructor(rings) {
    this.rings = rings;
    this.polys = this._composePolys(rings);
  }
  getGeom() {
    const geom = [];
    for (let i = 0, iMax = this.polys.length; i < iMax; i++) {
      const polyGeom = this.polys[i].getGeom();
      if (polyGeom === null) continue;
      geom.push(polyGeom);
    }
    return geom;
  }
  _composePolys(rings) {
    const polys = [];
    for (let i = 0, iMax = rings.length; i < iMax; i++) {
      const ring = rings[i];
      if (ring.poly) continue;
      if (ring.isExteriorRing()) polys.push(new PolyOut(ring));
      else {
        const enclosingRing = ring.enclosingRing();
        if (!enclosingRing.poly) polys.push(new PolyOut(enclosingRing));
        enclosingRing.poly.addInterior(ring);
      }
    }
    return polys;
  }
};
var SweepLine = class {
  constructor(queue) {
    let comparator = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : Segment.compare;
    this.queue = queue;
    this.tree = new z(comparator);
    this.segments = [];
  }
  process(event) {
    const segment = event.segment;
    const newEvents = [];
    if (event.consumedBy) {
      if (event.isLeft) this.queue.remove(event.otherSE);
      else this.tree.remove(segment);
      return newEvents;
    }
    const node = event.isLeft ? this.tree.add(segment) : this.tree.find(segment);
    if (!node) throw new Error(`Unable to find segment #${segment.id} [${segment.leftSE.point.x}, ${segment.leftSE.point.y}] -> [${segment.rightSE.point.x}, ${segment.rightSE.point.y}] in SweepLine tree.`);
    let prevNode = node;
    let nextNode = node;
    let prevSeg = void 0;
    let nextSeg = void 0;
    while (prevSeg === void 0) {
      prevNode = this.tree.prev(prevNode);
      if (prevNode === null) prevSeg = null;
      else if (prevNode.key.consumedBy === void 0) prevSeg = prevNode.key;
    }
    while (nextSeg === void 0) {
      nextNode = this.tree.next(nextNode);
      if (nextNode === null) nextSeg = null;
      else if (nextNode.key.consumedBy === void 0) nextSeg = nextNode.key;
    }
    if (event.isLeft) {
      let prevMySplitter = null;
      if (prevSeg) {
        const prevInter = prevSeg.getIntersection(segment);
        if (prevInter !== null) {
          if (!segment.isAnEndpoint(prevInter)) prevMySplitter = prevInter;
          if (!prevSeg.isAnEndpoint(prevInter)) {
            const newEventsFromSplit = this._splitSafely(prevSeg, prevInter);
            for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
        }
      }
      let nextMySplitter = null;
      if (nextSeg) {
        const nextInter = nextSeg.getIntersection(segment);
        if (nextInter !== null) {
          if (!segment.isAnEndpoint(nextInter)) nextMySplitter = nextInter;
          if (!nextSeg.isAnEndpoint(nextInter)) {
            const newEventsFromSplit = this._splitSafely(nextSeg, nextInter);
            for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
        }
      }
      if (prevMySplitter !== null || nextMySplitter !== null) {
        let mySplitter = null;
        if (prevMySplitter === null) mySplitter = nextMySplitter;
        else if (nextMySplitter === null) mySplitter = prevMySplitter;
        else {
          const cmpSplitters = SweepEvent.comparePoints(prevMySplitter, nextMySplitter);
          mySplitter = cmpSplitters <= 0 ? prevMySplitter : nextMySplitter;
        }
        this.queue.remove(segment.rightSE);
        newEvents.push(segment.rightSE);
        const newEventsFromSplit = segment.split(mySplitter);
        for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
          newEvents.push(newEventsFromSplit[i]);
        }
      }
      if (newEvents.length > 0) {
        this.tree.remove(segment);
        newEvents.push(event);
      } else {
        this.segments.push(segment);
        segment.prev = prevSeg;
      }
    } else {
      if (prevSeg && nextSeg) {
        const inter = prevSeg.getIntersection(nextSeg);
        if (inter !== null) {
          if (!prevSeg.isAnEndpoint(inter)) {
            const newEventsFromSplit = this._splitSafely(prevSeg, inter);
            for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
          if (!nextSeg.isAnEndpoint(inter)) {
            const newEventsFromSplit = this._splitSafely(nextSeg, inter);
            for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
        }
      }
      this.tree.remove(segment);
    }
    return newEvents;
  }
  /* Safely split a segment that is currently in the datastructures
   * IE - a segment other than the one that is currently being processed. */
  _splitSafely(seg, pt) {
    this.tree.remove(seg);
    const rightSE = seg.rightSE;
    this.queue.remove(rightSE);
    const newEvents = seg.split(pt);
    newEvents.push(rightSE);
    if (seg.consumedBy === void 0) this.tree.add(seg);
    return newEvents;
  }
};
var POLYGON_CLIPPING_MAX_QUEUE_SIZE = typeof process !== "undefined" && process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE || 1e6;
var POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS = typeof process !== "undefined" && process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS || 1e6;
var Operation = class {
  run(type, geom, moreGeoms) {
    operation.type = type;
    rounder.reset();
    const multipolys = [new MultiPolyIn(geom, true)];
    for (let i = 0, iMax = moreGeoms.length; i < iMax; i++) {
      multipolys.push(new MultiPolyIn(moreGeoms[i], false));
    }
    operation.numMultiPolys = multipolys.length;
    if (operation.type === "difference") {
      const subject = multipolys[0];
      let i = 1;
      while (i < multipolys.length) {
        if (getBboxOverlap(multipolys[i].bbox, subject.bbox) !== null) i++;
        else multipolys.splice(i, 1);
      }
    }
    if (operation.type === "intersection") {
      for (let i = 0, iMax = multipolys.length; i < iMax; i++) {
        const mpA = multipolys[i];
        for (let j = i + 1, jMax = multipolys.length; j < jMax; j++) {
          if (getBboxOverlap(mpA.bbox, multipolys[j].bbox) === null) return [];
        }
      }
    }
    const queue = new z(SweepEvent.compare);
    for (let i = 0, iMax = multipolys.length; i < iMax; i++) {
      const sweepEvents = multipolys[i].getSweepEvents();
      for (let j = 0, jMax = sweepEvents.length; j < jMax; j++) {
        queue.insert(sweepEvents[j]);
        if (queue.size > POLYGON_CLIPPING_MAX_QUEUE_SIZE) {
          throw new Error("Infinite loop when putting segment endpoints in a priority queue (queue size too big).");
        }
      }
    }
    const sweepLine = new SweepLine(queue);
    let prevQueueSize = queue.size;
    let node = queue.pop();
    while (node) {
      const evt = node.key;
      if (queue.size === prevQueueSize) {
        const seg = evt.segment;
        throw new Error(`Unable to pop() ${evt.isLeft ? "left" : "right"} SweepEvent [${evt.point.x}, ${evt.point.y}] from segment #${seg.id} [${seg.leftSE.point.x}, ${seg.leftSE.point.y}] -> [${seg.rightSE.point.x}, ${seg.rightSE.point.y}] from queue.`);
      }
      if (queue.size > POLYGON_CLIPPING_MAX_QUEUE_SIZE) {
        throw new Error("Infinite loop when passing sweep line over endpoints (queue size too big).");
      }
      if (sweepLine.segments.length > POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS) {
        throw new Error("Infinite loop when passing sweep line over endpoints (too many sweep line segments).");
      }
      const newEvents = sweepLine.process(evt);
      for (let i = 0, iMax = newEvents.length; i < iMax; i++) {
        const evt2 = newEvents[i];
        if (evt2.consumedBy === void 0) queue.insert(evt2);
      }
      prevQueueSize = queue.size;
      node = queue.pop();
    }
    rounder.reset();
    const ringsOut = RingOut.factory(sweepLine.segments);
    const result = new MultiPolyOut(ringsOut);
    return result.getGeom();
  }
};
var operation = new Operation();
var union = function(geom) {
  for (var _len = arguments.length, moreGeoms = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    moreGeoms[_key - 1] = arguments[_key];
  }
  return operation.run("union", geom, moreGeoms);
};
var intersection = function(geom) {
  for (var _len2 = arguments.length, moreGeoms = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
    moreGeoms[_key2 - 1] = arguments[_key2];
  }
  return operation.run("intersection", geom, moreGeoms);
};
var xor = function(geom) {
  for (var _len3 = arguments.length, moreGeoms = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
    moreGeoms[_key3 - 1] = arguments[_key3];
  }
  return operation.run("xor", geom, moreGeoms);
};
var difference = function(subjectGeom) {
  for (var _len4 = arguments.length, clippingGeoms = new Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) {
    clippingGeoms[_key4 - 1] = arguments[_key4];
  }
  return operation.run("difference", subjectGeom, clippingGeoms);
};
var index = {
  union,
  intersection,
  xor,
  difference
};

// generators/_lib/step.ts
var { difference: difference2, union: union2 } = index;
var Q = 1e3;
var q = (n) => Math.round(n * Q) / Q;
var q2 = (p2) => [q(p2[0]), q(p2[1])];
var q3 = (p2) => [q(p2[0]), q(p2[1]), q(p2[2])];
function area(loop) {
  let s = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const a2 = loop[i];
    const b = loop[(i + 1) % loop.length];
    s += a2[0] * b[1] - b[0] * a2[1];
  }
  return s / 2;
}
function dedupe2(loop) {
  const out = [];
  for (const p2 of loop) {
    const v2 = q2(p2);
    const prev = out[out.length - 1];
    if (prev && prev[0] === v2[0] && prev[1] === v2[1]) continue;
    out.push(v2);
  }
  if (out.length > 1) {
    const a2 = out[0];
    const b = out[out.length - 1];
    if (a2[0] === b[0] && a2[1] === b[1]) out.pop();
  }
  return out;
}
function ccw(loop) {
  const d2 = dedupe2(loop);
  return area(d2) < 0 ? d2.slice().reverse() : d2;
}
function cw(loop) {
  const d2 = dedupe2(loop);
  return area(d2) > 0 ? d2.slice().reverse() : d2;
}
function close(loop) {
  const d2 = dedupe2(loop);
  if (!d2.length) return [];
  const a2 = d2[0];
  const b = d2[d2.length - 1];
  if (a2[0] !== b[0] || a2[1] !== b[1]) d2.push([a2[0], a2[1]]);
  return d2;
}
function openRing(ring) {
  const d2 = dedupe2(ring.map((p2) => [p2[0], p2[1]]));
  return d2;
}
function pointIn(loop, u5, v2) {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const ui = loop[i][0];
    const vi = loop[i][1];
    const uj = loop[j][0];
    const vj = loop[j][1];
    if (vi > v2 !== vj > v2 && u5 < (uj - ui) * (v2 - vi) / (vj - vi || 1e-12) + ui) inside = !inside;
  }
  return inside;
}
function asMulti(regions) {
  const mp = [];
  for (const r of regions) {
    const outer = close(ccw(r.outer));
    if (outer.length < 4) continue;
    const holes = r.holes.map((h) => close(cw(h))).filter((h) => h.length >= 4);
    mp.push([outer, ...holes]);
  }
  return mp;
}
function fromMulti(mp) {
  const out = [];
  for (const poly of mp) {
    if (!poly.length) continue;
    const outer = openRing(poly[0]);
    if (Math.abs(area(outer)) < 0.5) continue;
    const holes = poly.slice(1).map(openRing).filter((h) => Math.abs(area(h)) >= 0.5);
    out.push({ outer: ccw(outer), holes: holes.map(cw) });
  }
  return out;
}
function diffRegions(a2, b) {
  const A = asMulti(a2);
  const B2 = asMulti(b);
  if (!A.length) return [];
  if (!B2.length) return fromMulti(A);
  return fromMulti(difference2(A, B2));
}
function unionDisks(loops) {
  const geoms = [];
  for (const loop of loops) {
    const ring = close(ccw(loop));
    if (ring.length >= 4) geoms.push([ring]);
  }
  if (!geoms.length) return [];
  const merged = geoms.length === 1 ? [geoms[0]] : union2(geoms[0], ...geoms.slice(1));
  return fromMulti(merged).map((r) => ccw(r.outer));
}
function numOf(p2, key) {
  const v2 = p2[key];
  return typeof v2 === "number" ? v2 : 0;
}
function profileRing(pv, u5, v2) {
  if (!pv.some((p2) => Math.abs(Number(p2.bulge) || 0) > 1e-9)) return pv.map((p2) => [numOf(p2, u5), numOf(p2, v2)]);
  const raw = pv.map((p2) => ({ u: numOf(p2, u5), v: numOf(p2, v2), b: Number(p2.bulge) || 0 }));
  if (raw.length > 2) {
    const a2 = raw[0];
    const c2 = raw[raw.length - 1];
    if (Math.abs(a2.u - c2.u) < 1e-9 && Math.abs(a2.v - c2.v) < 1e-9) raw.pop();
  }
  return expandBulgeRing(raw).map((p2) => [p2.u, p2.v]);
}
function boardOutline(b) {
  const pv = b.profileVector && b.profileVector.length >= 4 ? b.profileVector : null;
  if (b.profilePlane === "YZ" && b.thicknessAxis === "X") {
    if (pv) return ccw(profileRing(pv, "y", "z"));
    if (b.cutProfileVector && b.cutProfileVector.length >= 4) {
      return ccw(b.cutProfileVector.map((p2) => [b.y0 + p2.y, b.z0 + p2.z]));
    }
    return null;
  }
  if (b.profilePlane === "XY" && b.thicknessAxis === "Z" && pv) {
    const ring = profileRing(pv, "x", "y");
    const dx = b.x0 - Math.min(...ring.map((p2) => p2[0]));
    const dy = b.y0 - Math.min(...ring.map((p2) => p2[1]));
    return ccw(ring.map((p2) => [p2[0] + dx, p2[1] + dy]));
  }
  if (b.profilePlane === "XZ" && b.thicknessAxis === "Y" && pv) {
    const ring = profileRing(pv, "x", "z");
    const dx = b.x0 - Math.min(...ring.map((p2) => p2[0]));
    const dz = b.z0 - Math.min(...ring.map((p2) => p2[1]));
    return ccw(ring.map((p2) => [p2[0] + dx, p2[1] + dz]));
  }
  return null;
}
function profileHoles(b) {
  if (!b.profileHoles || b.profilePlane !== "XY" || b.thicknessAxis !== "Z" || !b.profileVector) return [];
  const pv = b.profileVector;
  const dx = b.x0 - Math.min(...pv.map((p2) => numOf(p2, "x")));
  const dy = b.y0 - Math.min(...pv.map((p2) => numOf(p2, "y")));
  return b.profileHoles.map((hole) => ccw(hole.map((p2) => [numOf(p2, "x") + dx, numOf(p2, "y") + dy])));
}
function rectOutline(b) {
  const [U, V] = planeAxes(b.profilePlane);
  const u0 = b[`${U}0`];
  const u1 = b[`${U}1`];
  const v0 = b[`${V}0`];
  const v1 = b[`${V}1`];
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}
function circle(cu, cv, r, n) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const a2 = 2 * Math.PI * i / n;
    pts.push([cu + r * Math.cos(a2), cv + r * Math.sin(a2)]);
  }
  return pts;
}
function roundedRect(u0, v0, u1, v1, radius) {
  const r = Math.max(0, Math.min(radius, (u1 - u0) / 2, (v1 - v0) / 2));
  if (r < 0.05) return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const pts = [];
  const corner = (cu, cv, a0) => {
    for (let i = 0; i <= 8; i += 1) {
      const a2 = a0 + Math.PI / 2 * (i / 8);
      pts.push([cu + r * Math.cos(a2), cv + r * Math.sin(a2)]);
    }
  };
  corner(u1 - r, v0 + r, -Math.PI / 2);
  corner(u1 - r, v1 - r, 0);
  corner(u0 + r, v1 - r, Math.PI / 2);
  corner(u0 + r, v0 + r, Math.PI);
  return pts;
}
function collectCuts(b) {
  const [U, V, T] = planeAxes(b.profilePlane);
  const U0 = b[`${U}0`];
  const U1 = b[`${U}1`];
  const V0 = b[`${V}0`];
  const V1 = b[`${V}1`];
  const thick = b[`${T}1`] - b[`${T}0`];
  const cuts = [];
  for (const loop of profileHoles(b)) cuts.push({ kind: "through", loop, depth: thick, side: "A" });
  for (const face of b.faces || []) {
    if (face.id !== "A" && face.id !== "B") continue;
    const side = face.id;
    for (const ft of face.features || []) {
      if (ft.kind === "hole" && Array.isArray(ft.center) && (ft.diameter ?? 0) > 0.8) {
        const r = ft.diameter / 2;
        const cu = U0 + ft.center[0];
        const cv = V0 + ft.center[1];
        if (cu - r < U0 + 0.4 || cu + r > U1 - 0.4 || cv - r < V0 + 0.4 || cv + r > V1 - 0.4) continue;
        const loop = circle(cu, cv, r, (ft.diameter ?? 0) < 10 ? 16 : 48);
        const through = !!ft.through || (ft.depth ?? 0) >= thick - 0.2;
        cuts.push({ kind: through ? "through" : "hole", loop, depth: Math.min(ft.depth ?? thick, thick - 0.6), side });
        continue;
      }
      if ((ft.kind === "groove" || ft.kind === "tgroove" || ft.kind === "cutout") && Number.isFinite(ft.u0) && Number.isFinite(ft.v0)) {
        if (ft.kind === "cutout" && Array.isArray(ft.loop) && ft.loop.length >= 3) {
          cuts.push({
            kind: "through",
            loop: ft.loop.map(([u5, v2]) => [U0 + u5, V0 + v2]),
            depth: thick,
            side
          });
          continue;
        }
        let u0 = U0 + Math.min(ft.u0, ft.u1);
        let u1 = U0 + Math.max(ft.u0, ft.u1);
        let v0 = V0 + Math.min(ft.v0, ft.v1);
        let v1 = V0 + Math.max(ft.v0, ft.v1);
        if (u1 - u0 < 0.5 || v1 - v0 < 0.5) continue;
        const through = !!ft.through || ft.kind === "cutout" || (ft.depth ?? 0) >= thick - 0.2;
        const touches = u0 <= U0 + 0.3 || u1 >= U1 - 0.3 || v0 <= V0 + 0.3 || v1 >= V1 - 0.3;
        const breakPast = !through && touches ? ft.for === "led" ? 2 : ft.for === "control_panel" ? 0.5 : 0 : 0;
        if (breakPast) {
          const past = breakPast;
          const rect = {
            u0: u0 <= U0 + 0.3 ? U0 - past : u0,
            u1: u1 >= U1 - 0.3 ? U1 + past : u1,
            v0: v0 <= V0 + 0.3 ? V0 - past : v0,
            v1: v1 >= V1 - 0.3 ? V1 + past : v1
          };
          cuts.push({
            kind: "notch",
            loop: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]],
            depth: Math.min(ft.depth ?? 0, thick - 0.6),
            side,
            rect
          });
          continue;
        }
        if (!through && touches) {
          const land = 0.4;
          if (u0 <= U0 + 0.3) u0 = U0 + land;
          if (u1 >= U1 - 0.3) u1 = U1 - land;
          if (v0 <= V0 + 0.3) v0 = V0 + land;
          if (v1 >= V1 - 0.3) v1 = V1 - land;
          if (u1 - u0 < 0.8 || v1 - v0 < 0.8) continue;
        }
        const radius = Math.max(0, Number(ft.radius) || 0);
        const loop = radius > 0.05 ? roundedRect(u0, v0, u1, v1, radius) : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
        cuts.push({
          kind: through ? "through" : "hole",
          loop,
          depth: Math.min(ft.depth ?? thick, thick - 0.6),
          side
        });
      }
    }
  }
  return cuts.filter((c2) => c2.kind === "through" || c2.depth > 0.2);
}
function clipPoly(poly, inside, cross) {
  if (poly.length < 3) return [];
  const out = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a2 = poly[i];
    const c2 = poly[(i + 1) % poly.length];
    const ain = inside(a2);
    const cin = inside(c2);
    if (ain && cin) out.push(c2);
    else if (ain && !cin) out.push(cross(a2, c2));
    else if (!ain && cin) {
      out.push(cross(a2, c2));
      out.push(c2);
    }
  }
  return dedupe2(out);
}
function clipVertical(poly, x2, keepLeft) {
  return clipPoly(
    poly,
    (p2) => keepLeft ? p2[0] <= x2 + 1e-6 : p2[0] >= x2 - 1e-6,
    (a2, c2) => {
      const dx = c2[0] - a2[0];
      const t = Math.abs(dx) < 1e-9 ? 0 : (x2 - a2[0]) / dx;
      const u5 = Math.min(1, Math.max(0, t));
      return [a2[0] + (c2[0] - a2[0]) * u5, a2[1] + (c2[1] - a2[1]) * u5];
    }
  );
}
function clipHorizontal(poly, y2, keepBelow) {
  return clipPoly(
    poly,
    (p2) => keepBelow ? p2[1] <= y2 + 1e-6 : p2[1] >= y2 - 1e-6,
    (a2, c2) => {
      const dy = c2[1] - a2[1];
      const t = Math.abs(dy) < 1e-9 ? 0 : (y2 - a2[1]) / dy;
      const u5 = Math.min(1, Math.max(0, t));
      return [a2[0] + (c2[0] - a2[0]) * u5, a2[1] + (c2[1] - a2[1]) * u5];
    }
  );
}
function subtractRect(poly, r) {
  const left = clipVertical(poly, r.u0, true);
  const right = clipVertical(poly, r.u1, false);
  const mid = clipVertical(clipVertical(poly, r.u0, false), r.u1, true);
  const below = clipHorizontal(mid, r.v0, true);
  const above = clipHorizontal(mid, r.v1, false);
  const parts = [left, right, below, above].filter((p2) => p2.length >= 3 && Math.abs(area(p2)) > 0.5);
  const kept = parts.reduce((s, p2) => s + Math.abs(area(p2)), 0);
  if (Math.abs(Math.abs(area(poly)) - kept) < 0.5) return [ccw(poly)];
  return parts.map(ccw);
}
function active(cut, t0, t1, mid) {
  if (cut.kind === "through") return true;
  if (cut.side === "B") return mid < t0 + cut.depth - 1e-4;
  return mid > t1 - cut.depth + 1e-4;
}
function regionsAt(outer, cuts, t0, t1, mid) {
  let pieces = [ccw(outer)];
  for (const cut of cuts) {
    if (cut.kind !== "notch" || !cut.rect || !active(cut, t0, t1, mid)) continue;
    pieces = pieces.flatMap((p2) => subtractRect(p2, cut.rect));
  }
  pieces = pieces.map(ccw).filter((p2) => p2.length >= 3 && Math.abs(area(p2)) > 0.5);
  const disks = cuts.filter((c2) => c2.kind !== "notch" && active(c2, t0, t1, mid)).map((c2) => c2.loop);
  const holes = unionDisks(disks);
  const regions = pieces.map((p2) => ({ outer: p2, holes: [] }));
  for (const hole of holes) {
    let sx = 0;
    let sy = 0;
    for (const p2 of hole) {
      sx += p2[0];
      sy += p2[1];
    }
    const cu = sx / hole.length;
    const cv = sy / hole.length;
    const home = regions.find((r) => pointIn(r.outer, cu, cv));
    if (home) home.holes.push(cw(hole));
  }
  return regions;
}
function featureSlices(b) {
  const [, , T] = planeAxes(b.profilePlane);
  const t0 = q(b[`${T}0`]);
  const t1 = q(b[`${T}1`]);
  if (!(t1 - t0 > 0.2)) return [];
  const outer = boardOutline(b) ?? rectOutline(b);
  const cuts = collectCuts(b);
  const zs = /* @__PURE__ */ new Set([t0, t1]);
  for (const cut of cuts) {
    if (cut.kind === "through") continue;
    const z2 = q(cut.side === "B" ? t0 + cut.depth : t1 - cut.depth);
    if (z2 > t0 + 0.05 && z2 < t1 - 0.05) zs.add(z2);
  }
  const stations = [...zs].sort((a2, c2) => a2 - c2);
  const slices = [];
  for (let i = 0; i < stations.length - 1; i += 1) {
    const za = stations[i];
    const zb = stations[i + 1];
    if (zb - za < 0.05) continue;
    const regions = regionsAt(outer, cuts, t0, t1, (za + zb) / 2);
    if (regions.length) slices.push({ t0: za, t1: zb, regions });
  }
  return slices;
}
function slabSlices(b) {
  if (!b.slabs || !b.slabs.length || b.profilePlane !== "XY" || b.thicknessAxis !== "Z") return null;
  const pv = b.profileVector;
  const dx = pv && pv.length ? b.x0 - Math.min(...pv.map((p2) => numOf(p2, "x"))) : 0;
  const dy = pv && pv.length ? b.y0 - Math.min(...pv.map((p2) => numOf(p2, "y"))) : 0;
  const slices = [];
  for (const slab of b.slabs) {
    const outer = ccw(slab.outline.map((p2) => [numOf(p2, "x") + dx, numOf(p2, "y") + dy]));
    const holes = (slab.holes || []).map((h) => cw(h.map((p2) => [numOf(p2, "x") + dx, numOf(p2, "y") + dy])));
    if (outer.length >= 3 && slab.z1 - slab.z0 > 0.05) {
      slices.push({ t0: q(slab.z0), t1: q(slab.z1), regions: [{ outer, holes }] });
    }
  }
  slices.sort((a2, c2) => a2.t0 - c2.t0);
  return slices.length ? slices : null;
}
function uvz(b, u5, v2, t) {
  const [U, V, T] = planeAxes(b.profilePlane);
  const p2 = { x: 0, y: 0, z: 0 };
  p2[U] = u5;
  p2[V] = v2;
  p2[T] = t;
  return [p2.x, p2.y, p2.z];
}
function horiz(b, regions, z2, up) {
  const faces = [];
  for (const r of regions) {
    if (r.outer.length < 3 || Math.abs(area(r.outer)) < 0.5) continue;
    const outer = up ? r.outer : r.outer.slice().reverse();
    const holes = r.holes.map((h) => up ? h : h.slice().reverse());
    faces.push({ loops: [outer, ...holes].map((loop) => loop.map(([u5, v2]) => uvz(b, u5, v2, z2))) });
  }
  return faces;
}
function key2(a2, b) {
  return `${a2[0]},${a2[1]}>${b[0]},${b[1]}`;
}
function walls(b, slice) {
  const bag = /* @__PURE__ */ new Map();
  const push = (a2, c2) => {
    if (a2[0] === c2[0] && a2[1] === c2[1]) return;
    const rev = bag.get(key2(c2, a2));
    if (rev) {
      rev.n -= 1;
      if (rev.n <= 0) bag.delete(key2(c2, a2));
      return;
    }
    const hit = bag.get(key2(a2, c2));
    if (hit) hit.n += 1;
    else bag.set(key2(a2, c2), { a: a2, b: c2, n: 1 });
  };
  const walk = (loop) => {
    for (let i = 0; i < loop.length; i += 1) push(loop[i], loop[(i + 1) % loop.length]);
  };
  for (const r of slice.regions) {
    walk(ccw(r.outer));
    for (const h of r.holes) walk(cw(h));
  }
  const faces = [];
  for (const e of bag.values()) {
    faces.push({
      loops: [[
        uvz(b, e.a[0], e.a[1], slice.t0),
        uvz(b, e.b[0], e.b[1], slice.t0),
        uvz(b, e.b[0], e.b[1], slice.t1),
        uvz(b, e.a[0], e.a[1], slice.t1)
      ]]
    });
  }
  return faces;
}
function facesFromSlices(b, slices) {
  if (!slices.length) return [];
  const faces = [];
  for (const s of slices) faces.push(...walls(b, s));
  faces.push(...horiz(b, slices[0].regions, slices[0].t0, false));
  const last = slices[slices.length - 1];
  faces.push(...horiz(b, last.regions, last.t1, true));
  for (let i = 0; i < slices.length - 1; i += 1) {
    const below = slices[i];
    const above = slices[i + 1];
    if (Math.abs(above.t0 - below.t1) > 0.05) continue;
    const z2 = below.t1;
    faces.push(...horiz(b, diffRegions(below.regions, above.regions), z2, true));
    faces.push(...horiz(b, diffRegions(above.regions, below.regions), z2, false));
  }
  return faces;
}
function dedupe3(loop) {
  const out = [];
  for (const p2 of loop) {
    const v2 = q3(p2);
    const prev = out[out.length - 1];
    if (prev && prev[0] === v2[0] && prev[1] === v2[1] && prev[2] === v2[2]) continue;
    out.push(v2);
  }
  if (out.length > 1) {
    const a2 = out[0];
    const c2 = out[out.length - 1];
    if (a2[0] === c2[0] && a2[1] === c2[1] && a2[2] === c2[2]) out.pop();
  }
  return out;
}
function newell(loop) {
  const n = [0, 0, 0];
  for (let i = 0; i < loop.length; i += 1) {
    const a2 = loop[i];
    const b = loop[(i + 1) % loop.length];
    n[0] += (a2[1] - b[1]) * (a2[2] + b[2]);
    n[1] += (a2[2] - b[2]) * (a2[0] + b[0]);
    n[2] += (a2[0] - b[0]) * (a2[1] + b[1]);
  }
  return n;
}
function splitEdges(faces) {
  const pts = [];
  for (const f2 of faces) for (const loop of f2.loops) for (const p2 of loop) pts.push(p2);
  const uniq = [];
  const seen = /* @__PURE__ */ new Set();
  for (const p2 of pts) {
    const k2 = `${p2[0]},${p2[1]},${p2[2]}`;
    if (seen.has(k2)) continue;
    seen.add(k2);
    uniq.push(p2);
  }
  const insert = (loop) => {
    const out = [];
    for (let i = 0; i < loop.length; i += 1) {
      const a2 = loop[i];
      const b = loop[(i + 1) % loop.length];
      out.push(a2);
      const ab4 = [b[0] - a2[0], b[1] - a2[1], b[2] - a2[2]];
      const len2 = ab4[0] * ab4[0] + ab4[1] * ab4[1] + ab4[2] * ab4[2];
      if (len2 < 1e-8) continue;
      const on = [];
      for (const p2 of uniq) {
        const ap = [p2[0] - a2[0], p2[1] - a2[1], p2[2] - a2[2]];
        const t = (ap[0] * ab4[0] + ap[1] * ab4[1] + ap[2] * ab4[2]) / len2;
        if (t <= 2e-3 || t >= 0.998) continue;
        const d2 = (ap[0] - ab4[0] * t) ** 2 + (ap[1] - ab4[1] * t) ** 2 + (ap[2] - ab4[2] * t) ** 2;
        if (d2 <= 0.02 * 0.02) on.push({ t, p: p2 });
      }
      on.sort((x2, y2) => x2.t - y2.t);
      for (const hit of on) out.push(hit.p);
    }
    return dedupe3(out);
  };
  return faces.map((f2) => ({ loops: f2.loops.map(insert).filter((loop) => loop.length >= 3) })).filter((f2) => f2.loops.length && f2.loops[0].length >= 3 && Math.hypot(...newell(f2.loops[0])) > 1e-4);
}
function unitNormal(loop) {
  const n = newell(loop);
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-8) return null;
  return [n[0] / len, n[1] / len, n[2] / len];
}
function mergeCoplanar(faces) {
  const pts = /* @__PURE__ */ new Map();
  const remember = (loop) => {
    for (const p2 of loop) pts.set(vid(p2), p2);
  };
  for (const f2 of faces) for (const loop of f2.loops) remember(loop);
  const edgesOf = (face) => {
    const out = [];
    for (const loop of face.loops) {
      for (let i = 0; i < loop.length; i += 1) out.push([vid(loop[i]), vid(loop[(i + 1) % loop.length])]);
    }
    return out;
  };
  const tryMerge = (a2, b) => {
    const na = unitNormal(a2.loops[0]);
    const nb = unitNormal(b.loops[0]);
    if (!na || !nb || dot(na, nb) < 0.999) return null;
    const gap = Math.abs(dot(na, sub(b.loops[0][0], a2.loops[0][0])));
    if (gap > 0.05) return null;
    const eb2 = /* @__PURE__ */ new Map();
    for (const [s, t] of edgesOf(b)) {
      const k2 = `${s}>${t}`;
      eb2.set(k2, (eb2.get(k2) ?? 0) + 1);
    }
    let shared = 0;
    const remain = [];
    for (const [s, t] of edgesOf(a2)) {
      const rev = `${t}>${s}`;
      const n = eb2.get(rev) ?? 0;
      if (n > 0) {
        shared += 1;
        if (n === 1) eb2.delete(rev);
        else eb2.set(rev, n - 1);
      } else remain.push([s, t]);
    }
    if (!shared) return null;
    for (const [k2, n] of eb2) {
      const [s, t] = k2.split(">");
      for (let i = 0; i < n; i += 1) remain.push([s, t]);
    }
    const outCount = /* @__PURE__ */ new Map();
    const inCount = /* @__PURE__ */ new Map();
    for (const [s, t] of remain) {
      outCount.set(s, (outCount.get(s) ?? 0) + 1);
      inCount.set(t, (inCount.get(t) ?? 0) + 1);
    }
    if ([...outCount.values()].some((n) => n !== 1) || [...inCount.values()].some((n) => n !== 1)) return null;
    const used = /* @__PURE__ */ new Set();
    const loops = [];
    for (const [s0] of remain) {
      if ([...used].some((k2) => k2.startsWith(`${s0}>`))) continue;
      const loop = [];
      let cur = s0;
      let closed = false;
      for (let guard = 0; guard <= remain.length; guard += 1) {
        const nxt = remain.find(([s, t]) => s === cur && !used.has(`${s}>${t}`));
        if (!nxt) break;
        used.add(`${nxt[0]}>${nxt[1]}`);
        const p2 = pts.get(cur);
        if (!p2) return null;
        loop.push(p2);
        cur = nxt[1];
        if (cur === s0) {
          closed = true;
          break;
        }
      }
      if (!closed || loop.length < 3) return null;
      loops.push(loop);
    }
    if (used.size !== remain.length || loops.reduce((n, loop) => n + loop.length, 0) !== remain.length) return null;
    loops.sort((p2, q4) => Math.hypot(...newell(q4)) - Math.hypot(...newell(p2)));
    const outward = unitNormal(loops[0]);
    if (outward && dot(outward, na) < 0) {
      for (const loop of loops) loop.reverse();
    }
    return { loops };
  };
  let list = faces.slice();
  for (let step = 0; step < faces.length; step += 1) {
    let merged = false;
    for (let i = 0; i < list.length && !merged; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const next = tryMerge(list[i], list[j]);
        if (!next) continue;
        const kept = list.filter((_2, k2) => k2 !== i && k2 !== j);
        kept.push(next);
        list = kept;
        merged = true;
        break;
      }
    }
    if (!merged) break;
  }
  return list;
}
function dissolveCollinear(faces) {
  const pts = /* @__PURE__ */ new Map();
  const neighbors = /* @__PURE__ */ new Map();
  const link = (a2, b) => {
    const ia = vid(a2);
    const ib = vid(b);
    pts.set(ia, a2);
    pts.set(ib, b);
    if (!neighbors.has(ia)) neighbors.set(ia, /* @__PURE__ */ new Set());
    if (!neighbors.has(ib)) neighbors.set(ib, /* @__PURE__ */ new Set());
    neighbors.get(ia).add(ib);
    neighbors.get(ib).add(ia);
  };
  for (const face of faces) {
    for (const loop of face.loops) {
      for (let i = 0; i < loop.length; i += 1) link(loop[i], loop[(i + 1) % loop.length]);
    }
  }
  const drop = /* @__PURE__ */ new Set();
  for (const [id, ns] of neighbors) {
    if (ns.size !== 2) continue;
    const [i, j] = [...ns];
    const p2 = pts.get(id);
    const a2 = pts.get(i);
    const b = pts.get(j);
    const ab4 = sub(b, a2);
    const ap = sub(p2, a2);
    const cross = [
      ab4[1] * ap[2] - ab4[2] * ap[1],
      ab4[2] * ap[0] - ab4[0] * ap[2],
      ab4[0] * ap[1] - ab4[1] * ap[0]
    ];
    const span = Math.hypot(ab4[0], ab4[1], ab4[2]) || 1;
    if (Math.hypot(cross[0], cross[1], cross[2]) / span > 0.02) continue;
    const t = dot(ap, ab4) / (span * span);
    if (t <= 2e-3 || t >= 0.998) continue;
    drop.add(id);
  }
  if (!drop.size) return faces;
  return faces.map((face) => ({
    loops: face.loops.map((loop) => loop.filter((p2) => !drop.has(vid(p2)))).filter((loop) => loop.length >= 3)
  })).filter((face) => face.loops.length > 0 && face.loops[0].length >= 3);
}
function boardFaces(board) {
  const slices = slabSlices(board) ?? featureSlices(board);
  const faces = splitEdges(facesFromSlices(board, slices).map((f2) => ({ loops: f2.loops.map(dedupe3) })));
  return dissolveCollinear(mergeCoplanar(faces));
}
function vid(p2) {
  return `${p2[0]},${p2[1]},${p2[2]}`;
}
function solidError(faces) {
  if (faces.length < 4) return "no solid";
  const count = /* @__PURE__ */ new Map();
  for (const f2 of faces) {
    for (const loop of f2.loops) {
      if (loop.length < 3) return "broken face";
      for (let i = 0; i < loop.length; i += 1) {
        const k2 = `${vid(loop[i])}>${vid(loop[(i + 1) % loop.length])}`;
        count.set(k2, (count.get(k2) ?? 0) + 1);
      }
    }
  }
  for (const [k2, n] of count) {
    const [a2, b] = k2.split(">");
    const m2 = count.get(`${b}>${a2}`) ?? 0;
    if (n !== 1 || m2 !== 1) return `open edge ${k2} (${n} / ${m2})`;
  }
  return null;
}
function dot(a2, b) {
  return a2[0] * b[0] + a2[1] * b[1] + a2[2] * b[2];
}
function sub(a2, b) {
  return [a2[0] - b[0], a2[1] - b[1], a2[2] - b[2]];
}
function solidContains(faces, origin) {
  const dir = [0.41, 0.17, 0.89];
  let hits = 0;
  for (const face of faces) {
    const outer = face.loops[0];
    if (!outer || outer.length < 3) continue;
    const n = newell(outer);
    const denom = dot(n, dir);
    if (Math.abs(denom) < 1e-9) continue;
    const t = dot(n, sub(outer[0], origin)) / denom;
    if (t < 1e-6) continue;
    const p2 = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
    const ax = Math.abs(n[0]) > Math.abs(n[1]) && Math.abs(n[0]) > Math.abs(n[2]) ? 0 : Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2;
    const u5 = (ax + 1) % 3;
    const v2 = (ax + 2) % 3;
    const inside = (loop) => {
      let inn = false;
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
        const ui = loop[i][u5];
        const vi = loop[i][v2];
        const uj = loop[j][u5];
        const vj = loop[j][v2];
        if (vi > p2[v2] !== vj > p2[v2] && p2[u5] < (uj - ui) * (p2[v2] - vi) / (vj - vi || 1e-12) + ui) inn = !inn;
      }
      return inn;
    };
    if (!inside(outer)) continue;
    if (face.loops.slice(1).some(inside)) continue;
    hits += 1;
  }
  return hits % 2 === 1;
}
function rotationMatrix(rotX = 0, rotY = 0, rotZ = 0) {
  const x2 = rotX * Math.PI / 180;
  const y2 = rotY * Math.PI / 180;
  const z2 = rotZ * Math.PI / 180;
  const a2 = Math.cos(x2);
  const b = Math.sin(x2);
  const c2 = Math.cos(y2);
  const d2 = Math.sin(y2);
  const e = Math.cos(z2);
  const f2 = Math.sin(z2);
  const ae = a2 * e;
  const af = a2 * f2;
  const be = b * e;
  const bf = b * f2;
  return [
    [c2 * e, -c2 * f2, d2],
    [af + be * d2, ae - bf * d2, -b * c2],
    [bf - ae * d2, be + af * d2, a2 * c2]
  ];
}
function mulVec(m2, v2) {
  return [
    m2[0][0] * v2[0] + m2[0][1] * v2[1] + m2[0][2] * v2[2],
    m2[1][0] * v2[0] + m2[1][1] * v2[1] + m2[1][2] * v2[2],
    m2[2][0] * v2[0] + m2[2][1] * v2[1] + m2[2][2] * v2[2]
  ];
}
function worldOf(pose, override, board, p2) {
  let v2 = p2;
  const ov = override || {};
  if (ov.x || ov.y || ov.z || ov.rotX || ov.rotY || ov.rotZ) {
    const c2 = [(board.x0 + board.x1) / 2, (board.y0 + board.y1) / 2, (board.z0 + board.z1) / 2];
    const r = mulVec(rotationMatrix(ov.rotX, ov.rotY, ov.rotZ), sub(v2, c2));
    v2 = [c2[0] + r[0] + (ov.x || 0), c2[1] + r[1] + (ov.y || 0), c2[2] + r[2] + (ov.z || 0)];
  }
  const w2 = mulVec(rotationMatrix(pose.rotX, pose.rotY, pose.rotZ), v2);
  return q3([w2[0] + (pose.x || 0), w2[1] + (pose.y || 0), w2[2] + (pose.z || 0)]);
}
function stepStr(s) {
  return `'${s.replace(/'/g, "''").replace(/[^\x20-\x7E]/g, " ")}'`;
}
function num(n) {
  const v2 = q(n);
  return Object.is(v2, -0) ? "0." : String(v2).includes(".") ? String(v2) : `${v2}.`;
}
function vecText(p2) {
  return `(${num(p2[0])},${num(p2[1])},${num(p2[2])})`;
}
var StepWriter = class {
  ents = [];
  ctx = 0;
  add(body) {
    this.ents.push(body);
    return this.ents.length;
  }
  ref(n) {
    return `#${n}`;
  }
  constructor() {
    const app = this.add("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
    this.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${this.ref(app)})`);
    const len = this.add("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))");
    const rad = this.add("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))");
    const sr = this.add("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())");
    const unc = this.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.001),${this.ref(len)},'distance_accuracy_value','confusion accuracy')`);
    this.ctx = this.add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${this.ref(unc)}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${this.ref(len)},${this.ref(rad)},${this.ref(sr)}))REPRESENTATION_CONTEXT('Context','3D'))`);
    this.productContext = this.add(`PRODUCT_CONTEXT('',${this.ref(app)},'mechanical')`);
    this.defContext = this.add(`PRODUCT_DEFINITION_CONTEXT('part definition',${this.ref(app)},'design')`);
  }
  productContext;
  defContext;
  point(p2) {
    return this.add(`CARTESIAN_POINT('',${vecText(p2)})`);
  }
  direction(p2) {
    const len = Math.hypot(p2[0], p2[1], p2[2]) || 1;
    return this.add(`DIRECTION('',${vecText([p2[0] / len, p2[1] / len, p2[2] / len])})`);
  }
  placement(origin, axis, refDir) {
    return this.add(`AXIS2_PLACEMENT_3D('',${this.ref(this.point(origin))},${this.ref(this.direction(axis))},${this.ref(this.direction(refDir))})`);
  }
  solid(name, faces) {
    const vId = /* @__PURE__ */ new Map();
    const vertex = (p2) => {
      const k2 = vid(p2);
      const hit = vId.get(k2);
      if (hit) return hit;
      const id = this.add(`VERTEX_POINT('',${this.ref(this.point(p2))})`);
      vId.set(k2, id);
      return id;
    };
    const eId = /* @__PURE__ */ new Map();
    const edge = (a2, b) => {
      const ka = vid(a2);
      const kb = vid(b);
      const forward = ka < kb;
      const key = forward ? `${ka}|${kb}` : `${kb}|${ka}`;
      let rec = eId.get(key);
      if (!rec) {
        const s = forward ? a2 : b;
        const t = forward ? b : a2;
        const dir = sub(t, s);
        const line = this.add(`LINE('',${this.ref(this.point(s))},${this.ref(this.add(`VECTOR('',${this.ref(this.direction(dir))},${num(Math.hypot(dir[0], dir[1], dir[2]))})`))})`);
        const id = this.add(`EDGE_CURVE('',${this.ref(vertex(s))},${this.ref(vertex(t))},${this.ref(line)},.T.)`);
        rec = { id, flipFrom: vid(s) };
        eId.set(key, rec);
      }
      const same = vid(a2) === rec.flipFrom;
      return this.add(`ORIENTED_EDGE('',*,*,${this.ref(rec.id)},${same ? ".T." : ".F."})`);
    };
    const faceIds = [];
    for (const face of faces) {
      const bounds = [];
      face.loops.forEach((loop, li) => {
        const edges = [];
        for (let i = 0; i < loop.length; i += 1) edges.push(this.ref(edge(loop[i], loop[(i + 1) % loop.length])));
        const loopId = this.add(`EDGE_LOOP('',(${edges.join(",")}))`);
        const bound = li === 0 ? "FACE_OUTER_BOUND" : "FACE_BOUND";
        bounds.push(this.add(`${bound}('',${this.ref(loopId)},.T.)`));
      });
      const outer = face.loops[0];
      const n = newell(outer);
      const edge0 = sub(outer[1], outer[0]);
      const along = dot(edge0, n);
      const nn = Math.hypot(n[0], n[1], n[2]) || 1;
      let ref = sub(edge0, [n[0] * along / (nn * nn), n[1] * along / (nn * nn), n[2] * along / (nn * nn)]);
      if (Math.hypot(ref[0], ref[1], ref[2]) < 1e-8) {
        const ax = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        ref = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
      }
      const plane = this.add(`PLANE('',${this.ref(this.placement(outer[0], n, ref))})`);
      faceIds.push(this.add(`ADVANCED_FACE('',(${bounds.map((id) => this.ref(id)).join(",")}),${this.ref(plane)},.T.)`));
    }
    const shell = this.add(`CLOSED_SHELL('',(${faceIds.map((id) => this.ref(id)).join(",")}))`);
    return this.add(`MANIFOLD_SOLID_BREP(${stepStr(name)},${this.ref(shell)})`);
  }
  product(name, items, brep = false) {
    const prod = this.add(`PRODUCT(${stepStr(name)},${stepStr(name)},'',(${this.ref(this.productContext)}))`);
    const form = this.add(`PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',${this.ref(prod)},.NOT_KNOWN.)`);
    const pd = this.add(`PRODUCT_DEFINITION('design','',${this.ref(form)},${this.ref(this.defContext)})`);
    const pds = this.add(`PRODUCT_DEFINITION_SHAPE('','',${this.ref(pd)})`);
    const kind = brep ? "ADVANCED_BREP_SHAPE_REPRESENTATION" : "SHAPE_REPRESENTATION";
    const rep = this.add(`${kind}('',(${items.map((id) => this.ref(id)).join(",")}),${this.ref(this.ctx)})`);
    this.add(`SHAPE_DEFINITION_REPRESENTATION(${this.ref(pds)},${this.ref(rep)})`);
    return { pd, rep };
  }
  /**
   * Geometry is already in world space, so every placement is the identity.
   * The assembly still groups boards under their cabinet. transform_item_1 is
   * the component origin and transform_item_2 is where it sits in the parent
   * (ISO 10303-1345). Both are the origin, so the world coordinates stay put.
   */
  file(cabinets) {
    const ident = () => this.placement([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const rootOrigin = ident();
    const cabNodes = [];
    for (const cab of cabinets) {
      const origin = ident();
      const boards = cab.boards.map((board) => {
        const originB = ident();
        const solid = this.solid(board.name, board.faces);
        const node2 = this.product(board.name, [originB, solid], true);
        return { ...node2, origin: originB };
      });
      const node = this.product(cab.id, [origin]);
      for (const board of boards) this.occur(node, board, board.origin, origin);
      cabNodes.push({ id: cab.id, ...node, origin });
    }
    const root = this.product("export", [rootOrigin]);
    for (const cab of cabNodes) this.occur(root, cab, cab.origin, rootOrigin);
    const body = this.ents.map((ent, i) => `#${i + 1}=${ent};`).join("\n");
    const now = (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "");
    return `ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('The Cab Lab'),'2;1');
FILE_NAME('export.stp','${now}',('The Cab Lab'),('The Cab Lab'),'The Cab Lab','The Cab Lab','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));
ENDSEC;
DATA;
${body}
ENDSEC;
END-ISO-10303-21;
`;
  }
  occur(parent, child, childOrigin, parentPlace) {
    const nauo = this.add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE(${stepStr(String(child.pd))},'','',${this.ref(parent.pd)},${this.ref(child.pd)},'')`);
    const pds = this.add(`PRODUCT_DEFINITION_SHAPE('','',${this.ref(nauo)})`);
    const idt = this.add(`ITEM_DEFINED_TRANSFORMATION('','',${this.ref(childOrigin)},${this.ref(parentPlace)})`);
    const rel = this.add(`(REPRESENTATION_RELATIONSHIP('','',${this.ref(child.rep)},${this.ref(parent.rep)})REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(${this.ref(idt)})SHAPE_REPRESENTATION_RELATIONSHIP())`);
    this.add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(${this.ref(rel)},${this.ref(pds)})`);
  }
};
function buildStep(input) {
  const skipped = [];
  const cabinets = [];
  for (const cab of input.cabinets) {
    const boards = [];
    const pose = cab.pose || {};
    for (const board of cab.boards) {
      const name = `${cab.id}/${board.id}`;
      let faces;
      try {
        faces = boardFaces(board);
      } catch (err) {
        skipped.push({ cabinetId: cab.id, boardId: board.id, reason: err instanceof Error ? err.message : String(err) });
        continue;
      }
      const error = solidError(faces);
      if (error) {
        skipped.push({ cabinetId: cab.id, boardId: board.id, reason: error });
        continue;
      }
      const ov = cab.overrides?.[board.id];
      boards.push({
        name,
        faces: faces.map((f2) => ({ loops: f2.loops.map((loop) => loop.map((p2) => worldOf(pose, ov, board, p2))) }))
      });
    }
    if (boards.length) cabinets.push({ id: cab.id, boards });
  }
  const boardCount = cabinets.reduce((n, c2) => n + c2.boards.length, 0);
  if (!boardCount) return { ok: false, text: "", boardCount: 0, skipped };
  return { ok: true, text: new StepWriter().file(cabinets), boardCount, skipped };
}
export {
  boardFaces,
  buildStep,
  solidContains,
  solidError
};
