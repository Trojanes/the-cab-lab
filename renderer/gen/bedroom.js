// Generated from generators/bedroom/generator.ts - do not edit.

// generators/bedroom/rules.json
var rules_default = {
  BOOT_HEIGHT_DEFAULT_MM: { value: 398, doc: "Tunnel boot height (top of the boot deck above the floor) when the params give none. Bedroom Style 3 measures 398; the east-west bedroom 418." },
  WARDROBE_WIDTH_DEFAULT_MM: { value: 330, doc: "Wardrobe width from the van's side wall to its inner face (the opening edge) when the params give none. Same on both sides: the north-south bedroom is symmetric by rule." },
  OHC_BOTTOM_DEFAULT_MM: { value: 1418, doc: "Underside of the overhead block above the floor when the params give none." },
  BOOT_DECK_THICKNESS_MM: { value: 18, doc: "Tunnel boot deck (the board the wardrobes and the mattress sit on): 18 mm structural stock, wall to wall and the full depth of the body. Style 3 measures 18." },
  BOOT_HEIGHT_MIN_MM: { value: 200, doc: "Lowest tunnel boot deck allowed." },
  WARDROBE_WIDTH_MIN_MM: { value: 150, doc: "Narrowest wardrobe allowed (from the side wall)." },
  OPENING_HEIGHT_MIN_MM: { value: 500, doc: "Least clear height between the boot deck and the overhead underside \u2014 room for the mattress and to sit up." },
  OHC_HEIGHT_MIN_MM: { value: 150, doc: "Least overhead block height under the lowest roof over the body." },
  BED_FRAME_QUEEN_WIDTH_MM: { value: 1508, doc: "Outer width of the queen bed frame / bed box. A product size, not a design number: the opening between the wardrobes must be at least this wide and the bed box is exactly this wide. Style 3 measures 1508 (side panel outer faces)." },
  DOOR_PANEL_THICKNESS_DEFAULT_MM: { value: 16, doc: "Wardrobe colour panel (door stock) thickness when the params give none." },
  WARDROBE_T2_BACK_MM: { value: 66, doc: "Y from the room face to the back of T2 \u2014 the one fixed distance of the wardrobe top. The colour panel runs full height (to the roof) from here toward the nose; in front of it the panel is cut down to the T3 seat. Style 3: 66." },
  WARDROBE_T2_THICKNESS_MM: { value: 15, doc: "T2 (rear top rail) thickness; it stands on T3 with its back at WARDROBE_T2_BACK." },
  WARDROBE_T2_HEIGHT_MM: { value: 35, doc: "T2 height at its back, measured to the roof there. Sets the T3 seat: T3 top = roof(T2 back) \u2212 this \u2212 T3 clearance. The roof slopes, so T2 is taller at its front (Style 3: 35 back, 38 front)." },
  WARDROBE_T1_THICKNESS_MM: { value: 16, doc: "T1 (front top rail) thickness; it stands on T3 directly in front of T2." },
  WARDROBE_T1_OVERSIZE_MM: { value: 20, doc: "T1 is cut this much taller than the roof at its back (a flat top: the three-axis router cannot cut the slope) \u2014 trimmed to the roof on site." },
  WARDROBE_T3_THICKNESS_MM: { value: 15, doc: "T3 (top panel over the wardrobe) thickness." },
  WARDROBE_T3_CLEARANCE_MM: { value: 1, doc: "Clearance between T3 top and the T1 / T2 undersides, and above T3 in the colour panel's pocket." },
  WARDROBE_T3_DEPTH_MM: { value: 188, doc: "T3 depth from the room face toward the nose." },
  WARDROBE_T3_LIP_DEPTH_MM: { value: 16, doc: "Pocket in the colour panel behind the T2 back (Y from WARDROBE_T2_BACK) that T3's tail slides into; its height is T3 + clearance." },
  WARDROBE_T3_TAIL_CLEARANCE_MM: { value: 5, doc: "T3's tail stops this short of the pocket end. Beyond the tail T3 is notched back to the colour panel's wall-side face." },
  WARDROBE_PANEL_MIN_HEIGHT_MM: { value: 300, doc: "Least colour-panel height between the boot deck and the T3 seat." }
};

// generators/_lib/dim.ts
var fresh = () => ({ entries: {}, rules: {} });
var active = fresh();
var collecting = false;
function beginProvenance() {
  active = fresh();
  collecting = true;
}
function endProvenance() {
  const out = active;
  active = fresh();
  collecting = false;
  return out;
}
function isRule(v) {
  return !!v && typeof v === "object" && v.__rule === true;
}
function isParam(v) {
  return !!v && typeof v === "object" && v.__param === true;
}
function isRef(v) {
  return !!v && typeof v === "object" && v.__ref === true;
}
function val(t) {
  if (typeof t === "number") return t;
  return t.value;
}
function param(inputs) {
  const out = {};
  for (const [name, v] of Object.entries(inputs)) {
    out[name] = { __param: true, name, value: Number(v ?? 0) };
  }
  return out;
}
function ref(key) {
  const entry = active.entries[key];
  if (!entry) throw new Error(`dim ref: unknown key "${key}" (record it before referencing it)`);
  return { __ref: true, key, value: entry.value };
}
function formulaOf(fn, override) {
  if (override) return override;
  const src = fn.toString();
  let body = src;
  const arrow = src.indexOf("=>");
  if (arrow >= 0) {
    body = src.slice(arrow + 2).trim();
    if (body.startsWith("{")) {
      const m = body.match(/return\s+([\s\S]*?);?\s*}$/);
      body = m ? m[1] : body;
    }
  } else {
    const m = src.match(/return\s+([\s\S]*?);?\s*}$/);
    body = m ? m[1] : src;
  }
  const pm = src.match(/^\s*(?:function\s*)?\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>|^\s*function\s*\(\s*([A-Za-z_$][\w$]*)/);
  const pname = pm && (pm[1] || pm[2]) || "t";
  const re = new RegExp(`\\b${pname.replace(/\$/g, "\\$")}\\.`, "g");
  return body.replace(re, "").replace(/\s+/g, " ").trim();
}
function dim(key, terms, fn, options = {}) {
  const values = {};
  for (const [name, t] of Object.entries(terms)) values[name] = val(t);
  const value = fn(values);
  const recorded = {};
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
function same(key, of) {
  return dim(key, { v: ref(of) }, (t) => t.v, { formula: `= ${of}` });
}
function ex(terms, fn, formula) {
  return { terms, fn, formula };
}
function lit(v) {
  return { terms: {}, fn: () => v, formula: String(v) };
}
var Outline = class {
  points = [];
  prefix;
  axes;
  constructor(prefix, axes) {
    this.prefix = prefix;
    this.axes = axes;
  }
  add(a, b) {
    const av = {};
    for (const [n, t] of Object.entries(a.terms)) av[n] = val(t);
    const bv = {};
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
};
function defineRules(module, raw) {
  const out = {};
  for (const [name, r] of Object.entries(raw)) {
    out[name] = { __rule: true, module, name, value: Number(r.value), doc: String(r.doc ?? "") };
  }
  return out;
}

// generators/bedroom/rules.ts
var RULES = defineRules("bedroom", rules_default);

// generators/_lib/model.ts
function planeAxes(plane) {
  if (plane === "YZ") return ["y", "z", "x"];
  if (plane === "XZ") return ["x", "z", "y"];
  return ["x", "y", "z"];
}
function localOutline(b) {
  const [U, V] = planeAxes(b.profilePlane);
  let pts = null;
  const pv = b.profileVector && b.profileVector.length >= 4 ? b.profileVector : null;
  if (b.profilePlane === "YZ") {
    if (pv) pts = pv.map((p) => [Number(p.y) - b.y0, Number(p.z) - b.z0]);
    else if (b.cutProfileVector && b.cutProfileVector.length >= 4) pts = b.cutProfileVector.map((p) => [p.y, p.z]);
  } else if (pv) {
    const mu = Math.min(...pv.map((p) => Number(p[U])));
    const mv = Math.min(...pv.map((p) => Number(p[V])));
    pts = pv.map((p) => [Number(p[U]) - mu, Number(p[V]) - mv]);
  }
  if (!pts) return null;
  const out = pts.slice();
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 2 && Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) out.pop();
  return out.length >= 3 ? out : null;
}
function rectOutline(b) {
  const [U, V] = planeAxes(b.profilePlane);
  const w = b[`${U}1`] - b[`${U}0`];
  const h = b[`${V}1`] - b[`${V}0`];
  return [[0, 0], [w, 0], [w, h], [0, h]];
}
function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}
var AXIS_UPPER = { x: "X", y: "Y", z: "Z" };
function edgeNormal(plane, from, to, ccw) {
  const [U, V] = planeAxes(plane);
  const du = to[0] - from[0];
  const dv = to[1] - from[1];
  let nu = ccw ? dv : -dv;
  let nv = ccw ? -du : du;
  const len = Math.hypot(nu, nv) || 1;
  nu /= len;
  nv /= len;
  const eps = 1e-9;
  if (Math.abs(nv) < eps) return `${nu > 0 ? "+" : "-"}${AXIS_UPPER[U]}`;
  if (Math.abs(nu) < eps) return `${nv > 0 ? "+" : "-"}${AXIS_UPPER[V]}`;
  const vec = [0, 0, 0];
  const idx = { x: 0, y: 1, z: 2 };
  vec[idx[U]] = nu;
  vec[idx[V]] = nv;
  return vec;
}
function facesOf(b) {
  const [, , T] = planeAxes(b.profilePlane);
  const t = AXIS_UPPER[T];
  const faces = [
    { id: "A", key: `${b.id}.A`, normal: `+${t}`, planeKey: `${b.id}.${T}1`, features: [] },
    { id: "B", key: `${b.id}.B`, normal: `-${t}`, planeKey: `${b.id}.${T}0`, features: [] }
  ];
  const outline = localOutline(b) ?? rectOutline(b);
  const ccw = signedArea(outline) > 0;
  for (let i = 0; i < outline.length; i += 1) {
    const from = outline[i];
    const to = outline[(i + 1) % outline.length];
    faces.push({
      id: `E${i}`,
      key: `${b.id}.E${i}`,
      normal: edgeNormal(b.profilePlane, from, to, ccw),
      segments: [i],
      edge: { from: [from[0], from[1]], to: [to[0], to[1]] },
      features: []
    });
  }
  return faces;
}
function attachFaces(boards) {
  for (const b of boards) b.faces = facesOf(b);
  return boards;
}
function faceOf(b, id) {
  const f = (b.faces ?? (b.faces = facesOf(b))).find((x) => x.id === id);
  if (!f) throw new Error(`${b.id}: no face ${id}`);
  return f;
}
function edgeFaces(b) {
  return (b.faces ?? (b.faces = facesOf(b))).filter((f) => f.id.startsWith("E"));
}
function edgeFacesIn(b, box) {
  return edgeFaces(b).filter((f) => {
    const mu = (f.edge.from[0] + f.edge.to[0]) / 2;
    const mv = (f.edge.from[1] + f.edge.to[1]) / 2;
    return mu >= box.u0 && mu <= box.u1 && mv >= box.v0 && mv <= box.v1;
  });
}
function boundaryEdgeFaces(b, normal, tol = 0.01) {
  const [U, V] = planeAxes(b.profilePlane);
  const axis = normal[1].toLowerCase();
  const c = axis === U ? 0 : axis === V ? 1 : -1;
  if (c < 0) return [];
  const all = edgeFaces(b);
  const coords = all.flatMap((f) => [f.edge.from[c], f.edge.to[c]]);
  const extreme = normal[0] === "+" ? Math.max(...coords) : Math.min(...coords);
  return all.filter((f) => f.normal === normal && Math.abs(f.edge.from[c] - extreme) <= tol && Math.abs(f.edge.to[c] - extreme) <= tol);
}
function annotate(b, faceId, a) {
  Object.assign(faceOf(b, faceId), a);
}
function joint(id, kind, a, b, extra = {}) {
  return { id, kind, a, b, ...extra };
}
function faceRef(board, faces) {
  return { board, faces: faces.map((f) => typeof f === "string" ? f : f.id) };
}

// generators/bedroom/svgPreview.ts
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}
var FILL = {
  boot: "#e8dcc6",
  wardrobeL: "#dbe9f4",
  wardrobeR: "#dbe9f4",
  opening: "#ffffff",
  ohc: "#e5f2ff"
};
function generateBedroomSvgPreview(result, options = {}) {
  if (!result || result.validation.errors.length || !result.zones.length) return null;
  const width = options.width ?? 760;
  const p = result.params;
  const W = p.width;
  const H = p.height;
  const showDimensions = options.showDimensions ?? true;
  const selected = options.selectedRegion ?? null;
  const padLeft = 54;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 30;
  const scale = (width - padLeft - padRight) / Math.max(W, 1);
  const height = options.height ?? Math.round(H * scale + padTop + padBottom);
  const ox = padLeft;
  const oy = padTop;
  const toX = (x) => ox + x * scale;
  const toY = (z) => oy + (H - z) * scale;
  const parts = [];
  for (const z of result.zones) {
    const x = toX(z.x0);
    const y = toY(z.z1);
    const w = Math.max((z.x1 - z.x0) * scale, 1);
    const h = Math.max((z.z1 - z.z0) * scale, 1);
    const sel = z.id === selected;
    const isVoid = z.kind === "void";
    parts.push(
      `<rect class="region${sel ? " sel" : ""}${isVoid ? " void" : ""}" data-region="${z.id}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${FILL[z.id]}" stroke="${sel ? "#4f86e0" : "#8a8378"}" stroke-width="${sel ? 2.5 : 1}"${isVoid ? ' stroke-dasharray="6 4"' : ""} />`
    );
    const cx = x + w / 2;
    const cy = y + h / 2;
    const name = z.label;
    const size = `${fmt(z.x1 - z.x0)} \xD7 ${fmt(z.z1 - z.z0)}${z.boards && z.boards.length ? ` \xB7 ${z.boards.length} boards` : ""}`;
    const small = w < 70 * 1 || h < 30;
    parts.push(
      `<text class="label" x="${cx.toFixed(2)}" y="${(cy - (small ? 0 : 5)).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="${small ? 9 : 11}" fill="#3b352d" pointer-events="none">${esc(name)}</text>`
    );
    if (!small) {
      parts.push(
        `<text class="label size" x="${cx.toFixed(2)}" y="${(cy + 9).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#6b6357" pointer-events="none">${esc(size)}</text>`
      );
    }
  }
  const bedW = result.layout.bedFrameWidth;
  const bx0 = (W - bedW) / 2;
  const bx1 = bx0 + bedW;
  const by = toY(p.bootHeight) - 14;
  parts.push(
    `<g class="bed" pointer-events="none"><line x1="${toX(bx0).toFixed(2)}" y1="${by.toFixed(2)}" x2="${toX(bx1).toFixed(2)}" y2="${by.toFixed(2)}" stroke="#6b6357" stroke-width="1" /><line x1="${toX(bx0).toFixed(2)}" y1="${(by - 5).toFixed(2)}" x2="${toX(bx0).toFixed(2)}" y2="${(by + 5).toFixed(2)}" stroke="#6b6357" stroke-width="1" /><line x1="${toX(bx1).toFixed(2)}" y1="${(by - 5).toFixed(2)}" x2="${toX(bx1).toFixed(2)}" y2="${(by + 5).toFixed(2)}" stroke="#6b6357" stroke-width="1" /><text x="${toX(W / 2).toFixed(2)}" y="${(by - 7).toFixed(2)}" text-anchor="middle" dominant-baseline="auto" font-size="10" fill="#6b6357">bed ${fmt(bedW)} \xB7 ${fmt(result.layout.bedMargin)} each side</text></g>`
  );
  const boundary = (key, axis, side, x1, y1, x2, y2) => {
    parts.push(
      `<g class="boundary" data-boundary="${key}" data-axis="${axis}" data-side="${side}"><line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#e0a34f" stroke-width="2" /><line class="hit" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="transparent" stroke-width="12" /></g>`
    );
  };
  boundary("bootHeight", "z", 0, toX(0), toY(p.bootHeight), toX(W), toY(p.bootHeight));
  boundary("wardrobeWidth", "x", -1, toX(p.wardrobeWidth), toY(p.bootHeight), toX(p.wardrobeWidth), toY(H));
  boundary("wardrobeWidth", "x", 1, toX(W - p.wardrobeWidth), toY(p.bootHeight), toX(W - p.wardrobeWidth), toY(H));
  boundary("ohcBottom", "z", 0, toX(p.wardrobeWidth), toY(p.ohcBottom), toX(W - p.wardrobeWidth), toY(p.ohcBottom));
  parts.push(`<rect x="${toX(0).toFixed(2)}" y="${toY(H).toFixed(2)}" width="${(W * scale).toFixed(2)}" height="${(H * scale).toFixed(2)}" fill="none" stroke="#3b352d" stroke-width="1.5" pointer-events="none" />`);
  if (showDimensions) {
    const dimText = (x, y, text, anchor = "middle", fill = "#6b6357") => parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" fill="${fill}" pointer-events="none">${esc(text)}</text>`);
    for (const [z, warm] of [[0, false], [p.bootHeight, true], [p.ohcBottom, true], [H, false]]) {
      dimText(ox - 6, toY(z), fmt(z), "end", warm ? "#b5762a" : "#6b6357");
    }
    const yb = toY(0) + 14;
    dimText(toX(p.wardrobeWidth / 2), yb, fmt(p.wardrobeWidth));
    dimText(toX(W / 2), yb, `${fmt(result.layout.openingWidth)} opening`);
    dimText(toX(W - p.wardrobeWidth / 2), yb, fmt(p.wardrobeWidth));
    dimText(toX(W), toY(H) - 9, `W ${fmt(W)} \xB7 roof ${fmt(H)} at the room face`, "end");
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bedroom body front elevation" data-scale="${scale}" data-ox="${ox}" data-oy="${oy}" data-w="${W}" data-h="${H}"><rect x="0" y="0" width="${width}" height="${height}" fill="#f8fbff" />` + parts.join("") + `</svg>`;
}

// generators/bedroom/generator.ts
var DEFAULT_CPT = 16;
var DEFAULT_COLOR = "White Stipple";
var EPS = 1e-6;
var LAYOUT_KEYS = ["bootHeight", "wardrobeWidth", "ohcBottom"];
function round1(v) {
  return Math.round(v * 10) / 10;
}
function asNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function roofAt(profile, height, y) {
  if (!profile || profile.length < 2) return height;
  if (y <= profile[0][0]) return profile[0][1];
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [y0, z0] = profile[i];
    const [y1, z1] = profile[i + 1];
    if (y <= y1 + 1e-9) return y1 - y0 < 1e-9 ? Math.min(z0, z1) : z0 + (z1 - z0) * (y - y0) / (y1 - y0);
  }
  return profile[profile.length - 1][1];
}
function normalizeProfile(raw, depth, height) {
  if (!Array.isArray(raw) || raw.length < 2) return [[0, height], [depth, height]];
  const pts = [];
  for (const p of raw) {
    const y = Number(Array.isArray(p) ? p[0] : NaN);
    const z = Number(Array.isArray(p) ? p[1] : NaN);
    if (Number.isFinite(y) && Number.isFinite(z)) pts.push([round1(Math.max(0, Math.min(depth, y))), round1(Math.max(0, z))]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  if (!pts.length || pts[0][0] > 0) pts.unshift([0, pts.length ? pts[0][1] : height]);
  if (pts[pts.length - 1][0] < depth) pts.push([depth, pts[pts.length - 1][1]]);
  return pts;
}
function topLine(profile, depth, height, zTop) {
  const ys = /* @__PURE__ */ new Set([0, depth]);
  for (const [y] of profile) if (y > 0 && y < depth) ys.add(y);
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [y0, z0] = profile[i];
    const [y1, z1] = profile[i + 1];
    if ((z0 - zTop) * (z1 - zTop) < 0) {
      const y = y0 + (zTop - z0) * (y1 - y0) / (z1 - z0);
      if (y > 0 && y < depth) ys.add(round1(y));
    }
  }
  return [...ys].sort((a, b) => a - b).map((y) => ({ y, z: round1(Math.min(zTop, roofAt(profile, height, y))) }));
}
function sectionYZ(profile, depth, height, z0, zTop) {
  const top = topLine(profile, depth, height, zTop);
  const kept = [];
  for (let i = 0; i < top.length; i += 1) {
    const p = top[i];
    if (p.z > z0 + EPS) {
      kept.push(p);
      continue;
    }
    if (kept.length) {
      const a = top[i - 1];
      const y = a.z - p.z < EPS ? p.y : a.y + (a.z - z0) * (p.y - a.y) / (a.z - p.z);
      kept.push({ y: round1(y), z: round1(z0) });
    }
    break;
  }
  if (!kept.length) return null;
  const yEnd = kept[kept.length - 1].y;
  const out = [{ y: 0, z: round1(z0) }, { y: yEnd, z: round1(z0) }];
  for (let i = kept.length - 1; i >= 0; i -= 1) {
    const p = kept[i];
    const last = out[out.length - 1];
    if (Math.abs(last.y - p.y) > EPS || Math.abs(last.z - p.z) > EPS) out.push(p);
  }
  out.push({ y: 0, z: round1(z0) });
  return out;
}
function sectionDepth(outline) {
  return outline ? Math.max(...outline.map((p) => p.y)) : 0;
}
function resolve(raw) {
  const W = round1(asNum(raw.width, 0));
  const D = round1(asNum(raw.depth, 0));
  const H = round1(asNum(raw.height, 0));
  return {
    width: W,
    depth: D,
    height: H,
    roofProfile: normalizeProfile(raw.roofProfile, D, H),
    bootHeight: round1(asNum(raw.bootHeight, RULES.BOOT_HEIGHT_DEFAULT_MM.value)),
    wardrobeWidth: round1(asNum(raw.wardrobeWidth, RULES.WARDROBE_WIDTH_DEFAULT_MM.value)),
    ohcBottom: round1(asNum(raw.ohcBottom, RULES.OHC_BOTTOM_DEFAULT_MM.value)),
    bedFrame: normalizeBedFrame(raw.bedFrame),
    panelThickness: round1(asNum(raw.panelThickness, DEFAULT_CPT)),
    doorPanelThickness: round1(asNum(raw.doorPanelThickness, RULES.DOOR_PANEL_THICKNESS_DEFAULT_MM.value)),
    frontPanelThickness: round1(asNum(raw.frontPanelThickness, 0)),
    carcassColor: String(raw.carcassColor || DEFAULT_COLOR),
    doorColor: String(raw.doorColorName || raw.doorColor || DEFAULT_COLOR)
  };
}
function layoutLimits(raw, key) {
  const p = resolve(raw);
  switch (key) {
    case "bootHeight":
      return { min: RULES.BOOT_HEIGHT_MIN_MM.value, max: round1(p.ohcBottom - RULES.OPENING_HEIGHT_MIN_MM.value) };
    case "ohcBottom":
      return { min: round1(p.bootHeight + RULES.OPENING_HEIGHT_MIN_MM.value), max: round1(p.height - RULES.OHC_HEIGHT_MIN_MM.value) };
    case "wardrobeWidth":
      return { min: RULES.WARDROBE_WIDTH_MIN_MM.value, max: round1((p.width - bedFrameWidth(p.bedFrame)) / 2) };
  }
}
function setLayout(raw, key, value) {
  const { min, max } = layoutLimits(raw, key);
  const v = round1(Math.max(min, Math.min(max, Number(value))));
  if (raw[key] === v) return raw;
  return { ...raw, [key]: v };
}
var BED_FRAMES = {
  queen: { label: "Queen", rule: "BED_FRAME_QUEEN_WIDTH_MM" }
};
function normalizeBedFrame(raw) {
  return raw != null && Object.prototype.hasOwnProperty.call(BED_FRAMES, String(raw)) ? String(raw) : "queen";
}
function bedFrameWidth(frame) {
  return RULES[BED_FRAMES[normalizeBedFrame(frame)].rule].value;
}
function bedBoxSizeFor(raw) {
  const p = resolve(raw);
  return { W: bedFrameWidth(p.bedFrame), H: p.bootHeight };
}
var ZONE_LABEL = {
  boot: "Tunnel boot",
  wardrobeL: "Wardrobe left",
  wardrobeR: "Wardrobe right",
  opening: "Mattress opening",
  ohc: "Overhead"
};
function generateBedroom(raw) {
  const errors = [];
  const warnings = [];
  const p = resolve(raw);
  const { width: W, depth: D, height: H, roofProfile: profile } = p;
  beginProvenance();
  const P = param({ W, D, H, bootHeight: p.bootHeight, wardrobeWidth: p.wardrobeWidth, ohcBottom: p.ohcBottom });
  const BED = RULES[BED_FRAMES[p.bedFrame].rule];
  const bootTop = dim("boot.z1", { bootHeight: P.bootHeight }, (t) => t.bootHeight);
  const wardLx1 = dim("wardrobeL.x1", { wardrobeWidth: P.wardrobeWidth }, (t) => t.wardrobeWidth);
  const wardRx0 = dim("wardrobeR.x0", { W: P.W, wardrobeWidth: P.wardrobeWidth }, (t) => t.W - t.wardrobeWidth);
  const ohcBot = dim("ohc.z0", { ohcBottom: P.ohcBottom }, (t) => t.ohcBottom);
  const openingW = dim("layout.openingWidth", { x1: ref("wardrobeR.x0"), x0: ref("wardrobeL.x1") }, (t) => t.x1 - t.x0);
  const openingH = dim("layout.openingHeight", { top: ref("ohc.z0"), bottom: ref("boot.z1") }, (t) => t.top - t.bottom);
  const ohcH = dim("layout.ohcHeight", { H: P.H, bottom: ref("ohc.z0") }, (t) => t.H - t.bottom);
  const bedW = dim("bedBox.W", { BED }, (t) => t.BED);
  dim("bedBox.H", { bootHeight: ref("boot.z1") }, (t) => t.bootHeight);
  dim("bedBox.x0", { W: P.W, bed: ref("bedBox.W") }, (t) => (t.W - t.bed) / 2);
  dim("bedBox.x1", { x0: ref("bedBox.x0"), bed: ref("bedBox.W") }, (t) => t.x0 + t.bed);
  const bedMargin = dim("layout.bedMargin", { opening: ref("layout.openingWidth"), bed: ref("bedBox.W") }, (t) => (t.opening - t.bed) / 2);
  const roofMin = round1(Math.min(...profile.map((q) => q[1])));
  if (W < 600) errors.push("width must be at least 600 mm");
  if (D < 300) errors.push("depth must be at least 300 mm");
  if (H < 600) errors.push("height must be at least 600 mm");
  if (p.panelThickness <= 0) errors.push("panelThickness must be positive");
  if (roofMin < 300) warnings.push(`roof drops to ${roofMin} mm at the nose`);
  const lim = (key) => layoutLimits(p, key);
  if (p.bootHeight < lim("bootHeight").min) errors.push(`tunnel boot ${p.bootHeight} is lower than ${RULES.BOOT_HEIGHT_MIN_MM.value} mm`);
  if (p.wardrobeWidth < lim("wardrobeWidth").min) errors.push(`wardrobe ${p.wardrobeWidth} is narrower than ${RULES.WARDROBE_WIDTH_MIN_MM.value} mm`);
  if (openingW < bedW - EPS) errors.push(`the wardrobes leave only ${round1(openingW)} mm between them \u2014 the ${BED_FRAMES[p.bedFrame].label.toLowerCase()} bed frame needs ${bedW}`);
  if (openingH < RULES.OPENING_HEIGHT_MIN_MM.value) errors.push(`only ${round1(openingH)} mm between the boot deck and the overhead (min ${RULES.OPENING_HEIGHT_MIN_MM.value})`);
  if (ohcH < RULES.OHC_HEIGHT_MIN_MM.value) errors.push(`overhead is only ${round1(ohcH)} mm high at the room face (min ${RULES.OHC_HEIGHT_MIN_MM.value})`);
  const zones = [];
  if (!errors.length) {
    const region = (id, kind, x0, x1, z0, zTop, roofTop) => {
      const outline = sectionYZ(profile, D, H, z0, zTop);
      if (!outline) {
        errors.push(`${ZONE_LABEL[id]} has no room under the roof`);
        return;
      }
      zones.push({ id, label: ZONE_LABEL[id], kind, x0: round1(x0), x1: round1(x1), y0: 0, y1: sectionDepth(outline), z0: round1(z0), z1: round1(roofTop ? H : zTop), roofTop, outlineYZ: outline });
    };
    region("boot", "solid", 0, W, 0, bootTop, false);
    region("wardrobeL", "solid", 0, wardLx1, bootTop, H, true);
    region("wardrobeR", "solid", wardRx0, W, bootTop, H, true);
    region("opening", "void", wardLx1, wardRx0, bootTop, ohcBot, false);
    region("ohc", "solid", wardLx1, wardRx0, ohcBot, H, true);
    const ohcZone = zones.find((z) => z.id === "ohc");
    if (ohcZone && ohcZone.y1 < 100) warnings.push(`overhead is only ${round1(ohcZone.y1)} mm deep before the roof cuts it off`);
  }
  const boards = [];
  const joints = [];
  const bootZone = zones.find((z) => z.id === "boot");
  if (!errors.length && bootZone && roofMin < p.bootHeight - EPS) errors.push(`the roof comes down to ${roofMin} mm at the nose, below the boot deck (${p.bootHeight}) \u2014 the deck cannot run to the nose`);
  if (!errors.length && bootZone) {
    const CPT = P_cpt(p.panelThickness);
    const deckT = RULES.BOOT_DECK_THICKNESS_MM;
    const deck = boardRect("BOOT_DECK", "Boot deck", "boot_deck", "XY", "Z", deckT.value, {
      x0: dim("BOOT_DECK.x0", {}, () => 0, { formula: "0" }),
      x1: dim("BOOT_DECK.x1", { W: P.W }, (t) => t.W),
      y0: dim("BOOT_DECK.y0", {}, () => 0, { formula: "0" }),
      y1: dim("BOOT_DECK.y1", { D: P.D }, (t) => t.D),
      z1: same("BOOT_DECK.z1", "boot.z1"),
      z0: dim("BOOT_DECK.z0", { top: ref("BOOT_DECK.z1"), DECK: deckT }, (t) => t.top - t.DECK)
    });
    const back = boardRect("BOOT_BACK", "Boot upright \xB7 room face", "boot_upright", "XZ", "Y", CPT.value, {
      x0: dim("BOOT_BACK.x0", {}, () => 0, { formula: "0" }),
      x1: dim("BOOT_BACK.x1", { W: P.W }, (t) => t.W),
      y0: dim("BOOT_BACK.y0", {}, () => 0, { formula: "0" }),
      y1: dim("BOOT_BACK.y1", { CPT }, (t) => t.CPT),
      z0: dim("BOOT_BACK.z0", {}, () => 0, { formula: "0" }),
      z1: same("BOOT_BACK.z1", "BOOT_DECK.z0")
    });
    const front = boardRect("BOOT_FRONT", "Boot upright \xB7 nose", "boot_upright", "XZ", "Y", CPT.value, {
      x0: dim("BOOT_FRONT.x0", {}, () => 0, { formula: "0" }),
      x1: dim("BOOT_FRONT.x1", { W: P.W }, (t) => t.W),
      y1: dim("BOOT_FRONT.y1", { D: P.D }, (t) => t.D),
      y0: dim("BOOT_FRONT.y0", { D: ref("BOOT_FRONT.y1"), CPT }, (t) => t.D - t.CPT),
      z0: dim("BOOT_FRONT.z0", {}, () => 0, { formula: "0" }),
      z1: same("BOOT_FRONT.z1", "BOOT_DECK.z0")
    });
    for (const b of [deck, back, front]) {
      b.zoneId = "boot";
      b.role = b.category;
      boards.push(b);
    }
    bootZone.boards = boards.map((b) => b.id);
    attachFaces(boards);
    for (const b of boards) b.stock = { kind: "carcass", thickness: b.materialThickness, colour: p.carcassColor };
    annotate(deck, "A", { semantic: "top", visible: true, finish: { colour: p.carcassColor } });
    annotate(deck, "B", { semantic: "inside", visible: false });
    annotate(back, "B", { semantic: "front", visible: true, finish: { colour: p.carcassColor } });
    annotate(back, "A", { semantic: "inside", visible: false });
    annotate(front, "A", { semantic: "outside", visible: false });
    annotate(front, "B", { semantic: "inside", visible: false });
    for (const up of [back, front]) {
      joints.push(joint(`${up.id}_deck`, "butt", faceRef(deck.id, ["B"]), faceRef(up.id, boundaryEdgeFaces(up, "+Z")), { hardware: [], rule: "boot_deck_on_uprights_v1" }));
    }
  }
  let top = null;
  const wardL = zones.find((z) => z.id === "wardrobeL");
  const wardR = zones.find((z) => z.id === "wardrobeR");
  if (!errors.length && wardL && wardR) {
    const DPT = param({ DPT: p.doorPanelThickness }).DPT;
    const roofFn = (y) => roofAt(profile, H, y);
    const t2Back = dim("top.T2.y1", { T2_BACK: RULES.WARDROBE_T2_BACK_MM }, (t) => t.T2_BACK);
    const roofAtT2 = dim("top.roofAtT2", { y: ref("top.T2.y1") }, (t) => round1(roofFn(t.y)), { formula: "roof(T2.y1)" });
    const t3Top = dim("top.T3.z1", { roof: ref("top.roofAtT2"), T2H: RULES.WARDROBE_T2_HEIGHT_MM, CL: RULES.WARDROBE_T3_CLEARANCE_MM }, (t) => t.roof - t.T2H - t.CL);
    const seat = dim("top.seat", { t3Top: ref("top.T3.z1"), T3: RULES.WARDROBE_T3_THICKNESS_MM }, (t) => t.t3Top - t.T3);
    const railZ0 = dim("top.rail.z0", { t3Top: ref("top.T3.z1"), CL: RULES.WARDROBE_T3_CLEARANCE_MM }, (t) => t.t3Top + t.CL);
    const lipY1 = dim("top.lip.y1", { T2_BACK: ref("top.T2.y1"), LIP: RULES.WARDROBE_T3_LIP_DEPTH_MM }, (t) => t.T2_BACK + t.LIP);
    dim("top.T3.tail.y1", { lip: ref("top.lip.y1"), CL: RULES.WARDROBE_T3_TAIL_CLEARANCE_MM }, (t) => t.lip - t.CL);
    const t3Depth = dim("top.T3.y1", { T3D: RULES.WARDROBE_T3_DEPTH_MM }, (t) => t.T3D);
    dim("top.T2.y0", { y1: ref("top.T2.y1"), T2T: RULES.WARDROBE_T2_THICKNESS_MM }, (t) => t.y1 - t.T2T);
    const t1Y0 = dim("top.T1.y0", { y1: ref("top.T2.y0"), T1T: RULES.WARDROBE_T1_THICKNESS_MM }, (t) => t.y1 - t.T1T);
    dim("top.roofAtT1", { y: ref("top.T2.y0") }, (t) => round1(roofFn(t.y)), { formula: "roof(T1.y1)" });
    dim("top.T1.z1", { roof: ref("top.roofAtT1"), OVER: RULES.WARDROBE_T1_OVERSIZE_MM }, (t) => t.roof + t.OVER);
    const roofAtLip = round1(roofFn(lipY1));
    top = { seat: round1(seat), t3Top: round1(t3Top), roofAtT2: round1(roofAtT2), t2Height: round1(roofAtT2 - railZ0) };
    if (seat - p.bootHeight < RULES.WARDROBE_PANEL_MIN_HEIGHT_MM.value) errors.push(`the roof at the T2 back (${round1(roofAtT2)}) leaves only ${round1(seat - p.bootHeight)} mm of colour panel above the boot deck (min ${RULES.WARDROBE_PANEL_MIN_HEIGHT_MM.value})`);
    if (roofAtLip <= railZ0 + EPS) errors.push(`the roof comes down to ${roofAtLip} mm at the T3 pocket end \u2014 no room for the panel above the pocket`);
    if (t3Depth > D - EPS) errors.push(`T3 depth ${round1(t3Depth)} is more than the body depth ${D}`);
    if (t1Y0 < EPS) errors.push("the top rails do not fit in front of the T2 back");
    if (!errors.length) warnings.push(`T1 is cut ${RULES.WARDROBE_T1_OVERSIZE_MM.value} mm above the roof by design \u2014 trim to the roof on site`);
    if (!errors.length) {
      const panelOutline = (id) => {
        const o = new Outline(`${id}.pv`, ["y", "z"]);
        const bootZ = ref("boot.z1");
        o.add(lit(0), ex({ bootZ }, (t) => t.bootZ));
        o.add(ex({ D: P.D }, (t) => t.D), ex({ bootZ }, (t) => t.bootZ));
        const breaks = profile.map((q) => q[0]).filter((y) => y > t2Back + EPS && y < D - EPS).sort((a, b) => b - a);
        o.add(ex({ D: P.D }, (t) => t.D), ex({ D: P.D }, (t) => round1(roofFn(t.D)), "roof(D)"));
        for (const y of breaks) o.add(lit(round1(y)), ex({ y }, (t) => round1(roofFn(t.y)), `roof(${round1(y)})`));
        o.add(ex({ y: ref("top.T2.y1") }, (t) => t.y), ex({ roof: ref("top.roofAtT2") }, (t) => t.roof));
        o.add(ex({ y: ref("top.T2.y1") }, (t) => t.y), ex({ z: ref("top.rail.z0") }, (t) => t.z));
        o.add(ex({ y: ref("top.lip.y1") }, (t) => t.y), ex({ z: ref("top.rail.z0") }, (t) => t.z));
        o.add(ex({ y: ref("top.lip.y1") }, (t) => t.y), ex({ z: ref("top.seat") }, (t) => t.z));
        o.add(lit(0), ex({ z: ref("top.seat") }, (t) => t.z));
        return o.points.map(([py, pz]) => ({ y: round1(py), z: round1(pz) }));
      };
      const panelBox = (id, side) => {
        const outline = panelOutline(id);
        const zTop = Math.max(...outline.map((q) => q.z));
        const x0 = side === "L" ? dim(`${id}.x0`, { ww: ref("wardrobeL.x1"), DPT }, (t) => t.ww - t.DPT) : same(`${id}.x0`, "wardrobeR.x0");
        const x1 = side === "L" ? same(`${id}.x1`, "wardrobeL.x1") : dim(`${id}.x1`, { x0: ref(`${id}.x0`), DPT }, (t) => t.x0 + t.DPT);
        const b = boardRect(id, `Wardrobe colour panel \xB7 ${side === "L" ? "left" : "right"}`, "colour_panel", "YZ", "X", DPT.value, {
          x0,
          x1,
          y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
          y1: dim(`${id}.y1`, { D: P.D }, (t) => t.D),
          z0: same(`${id}.z0`, "boot.z1"),
          z1: dim(`${id}.z1`, { H: P.H }, () => zTop, { formula: "max(roof over the panel)" })
        });
        b.profileVector = outline;
        return b;
      };
      const panelL = panelBox("WARD_L_PANEL", "L");
      const panelR = panelBox("WARD_R_PANEL", "R");
      const t3Box = (id, side) => {
        const b = boardRect(id, `T3 \xB7 ${side === "L" ? "left" : "right"} wardrobe`, "top_panel", "XY", "Z", RULES.WARDROBE_T3_THICKNESS_MM.value, {
          x0: side === "L" ? dim(`${id}.x0`, {}, () => 0, { formula: "0" }) : same(`${id}.x0`, "wardrobeR.x0"),
          x1: side === "L" ? same(`${id}.x1`, "wardrobeL.x1") : dim(`${id}.x1`, { W: P.W }, (t) => t.W),
          y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
          y1: same(`${id}.y1`, "top.T3.y1"),
          z0: same(`${id}.z0`, "top.seat"),
          z1: same(`${id}.z1`, "top.T3.z1")
        });
        const o = new Outline(`${id}.pv`, ["x", "y"]);
        const X0 = ex({ x: ref(`${id}.x0`) }, (t) => t.x);
        const X1 = ex({ x: ref(`${id}.x1`) }, (t) => t.x);
        const XN = side === "L" ? ex({ x: ref(`WARD_L_PANEL.x0`) }, (t) => t.x) : ex({ x: ref(`WARD_R_PANEL.x1`) }, (t) => t.x);
        const Y0 = lit(0);
        const YT = ex({ y: ref("top.T3.tail.y1") }, (t) => t.y);
        const Y1 = ex({ y: ref("top.T3.y1") }, (t) => t.y);
        if (side === "L") o.add(X0, Y0).add(X1, Y0).add(X1, YT).add(XN, YT).add(XN, Y1).add(X0, Y1);
        else o.add(X0, Y0).add(X1, Y0).add(X1, Y1).add(XN, Y1).add(XN, YT).add(X0, YT);
        b.profileVector = o.points.map(([px, py]) => ({ x: round1(px), y: round1(py) }));
        return b;
      };
      const t3L = t3Box("WARD_L_T3", "L");
      const t3R = t3Box("WARD_R_T3", "R");
      const T2 = boardRect("T2", "Top rail \xB7 rear (T2)", "top_rail", "XZ", "Y", RULES.WARDROBE_T2_THICKNESS_MM.value, {
        x0: dim("T2.x0", {}, () => 0, { formula: "0" }),
        x1: dim("T2.x1", { W: P.W }, (t) => t.W),
        y0: same("T2.y0", "top.T2.y0"),
        y1: same("T2.y1", "top.T2.y1"),
        z0: same("T2.z0", "top.rail.z0"),
        z1: same("T2.z1", "top.roofAtT2")
      });
      T2.notes = ["top follows the roof: bevel from the height at the back to the roof at the front"];
      const T1 = boardRect("T1", "Top rail \xB7 front (T1)", "top_rail", "XZ", "Y", RULES.WARDROBE_T1_THICKNESS_MM.value, {
        x0: dim("T1.x0", {}, () => 0, { formula: "0" }),
        x1: dim("T1.x1", { W: P.W }, (t) => t.W),
        y0: same("T1.y0", "top.T1.y0"),
        y1: same("T1.y1", "top.T2.y0"),
        z0: same("T1.z0", "top.rail.z0"),
        z1: same("T1.z1", "top.T1.z1")
      });
      T1.notes = [`cut ${RULES.WARDROBE_T1_OVERSIZE_MM.value} above the roof \u2014 flat top, trim to the roof slope on site`];
      const wardBoards = [panelL, panelR, t3L, t3R, T2, T1];
      for (const b of wardBoards) b.role = b.category;
      panelL.zoneId = "wardrobeL";
      t3L.zoneId = "wardrobeL";
      panelR.zoneId = "wardrobeR";
      t3R.zoneId = "wardrobeR";
      T2.zoneId = "top";
      T1.zoneId = "top";
      wardL.boards = ["WARD_L_PANEL", "WARD_L_T3"];
      wardR.boards = ["WARD_R_PANEL", "WARD_R_T3"];
      attachFaces(wardBoards);
      for (const b of [panelL, panelR]) b.stock = { kind: "door", thickness: b.materialThickness, colour: p.doorColor };
      for (const b of [t3L, t3R, T2, T1]) b.stock = { kind: "carcass", thickness: b.materialThickness, colour: p.carcassColor };
      annotate(panelL, "A", { semantic: "outside", visible: true, finish: { colour: p.doorColor } });
      annotate(panelL, "B", { semantic: "inside", visible: false });
      annotate(panelR, "B", { semantic: "outside", visible: true, finish: { colour: p.doorColor } });
      annotate(panelR, "A", { semantic: "inside", visible: false });
      for (const b of [t3L, t3R]) {
        annotate(b, "A", { semantic: "top", visible: false });
        annotate(b, "B", { semantic: "inside", visible: false });
      }
      annotate(T1, "B", { semantic: "front", visible: true, finish: { colour: p.carcassColor } });
      annotate(T1, "A", { semantic: "inside", visible: false });
      annotate(T2, "B", { semantic: "front", visible: false });
      annotate(T2, "A", { semantic: "back", visible: false });
      for (const [panel, t3] of [[panelL, t3L], [panelR, t3R]]) {
        const seatFaces = edgeFacesIn(panel, { u0: -EPS, u1: lipY1 + EPS, v0: seat - p.bootHeight - EPS, v1: seat - p.bootHeight + EPS });
        for (const f of seatFaces) f.features.push({ id: `${panel.id}_SEAT`, kind: "notch", for: t3.id, key: `${panel.id}.pv`, source: "bedroom.wardrobeTop" });
        joints.push(joint(`${t3.id}_seat`, "butt", faceRef(t3.id, ["B"]), faceRef(panel.id, seatFaces), { hardware: [], rule: "wardrobe_t3_on_panel_seat_v1" }));
        for (const rail of [T1, T2]) joints.push(joint(`${rail.id}_${t3.id}`, "face_contact", faceRef(t3.id, ["A"]), faceRef(rail.id, boundaryEdgeFaces(rail, "-Z")), { hardware: [], rule: "wardrobe_rail_on_t3_v1" }));
      }
      boards.push(...wardBoards);
    }
  }
  const provenance = endProvenance();
  const layout = {
    openingWidth: round1(openingW),
    openingHeight: round1(openingH),
    roofMin,
    ohcHeight: round1(ohcH),
    bedFrameWidth: round1(bedW),
    bedMargin: round1(bedMargin),
    top
  };
  return {
    params: p,
    layout,
    zones: errors.length ? [] : zones,
    boards: errors.length ? [] : boards,
    joints: errors.length ? [] : joints,
    features: [],
    validation: { errors, warnings },
    debug: { boardFrame: "final", provenance }
  };
}
function P_cpt(cpt) {
  return param({ CPT: cpt }).CPT;
}
function boardRect(id, name, category, profilePlane, thicknessAxis, materialThickness, f) {
  return {
    id,
    name,
    category,
    boardType: "panel",
    materialThickness: round1(materialThickness),
    profilePlane,
    thicknessAxis,
    x0: round1(f.x0),
    x1: round1(f.x1),
    y0: round1(f.y0),
    y1: round1(f.y1),
    z0: round1(f.z0),
    z1: round1(f.z1),
    source: "bedroom.boot"
  };
}
export {
  BED_FRAMES,
  LAYOUT_KEYS,
  RULES,
  bedBoxSizeFor,
  bedFrameWidth,
  generateBedroom,
  generateBedroomSvgPreview,
  layoutLimits,
  roofAt,
  sectionYZ,
  setLayout
};
