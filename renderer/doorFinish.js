// Door colour faces in 3D: a thin sheet on each colour face, painted from the
// swatch table (doorSwatches.js). Display only — the board itself keeps its
// body material and its geometry is untouched.
import * as THREE from "three";
import { faceSheetGeometry } from "./boardGeom.js";
import { doorSwatch, UNKNOWN_SWATCH, METALLIC_FLAKES as F } from "./doorSwatches.js";
import { log } from "./log.js";

const AXES_OF = { YZ: ["y", "z"], XZ: ["x", "z"], XY: ["x", "y"] };
const AXIS_INDEX = { x: 0, y: 1, z: 2 };
const SHEET_MM = 0.8;
const DIM_OPACITY = 0.22;

/**
 * The faces of a board that carry a door colour: A / B with `finish.colour`,
 * not hidden, and either a catalogue name or on door stock. Carcass colour
 * names on carcass boards (White Stipple) are not colour faces.
 */
export function colourFaces(board) {
  const doorStock = board.stock && board.stock.kind === "door";
  return (board.faces || []).filter((f) =>
    (f.id === "A" || f.id === "B")
    && f.visible !== false
    && f.finish && f.finish.colour
    && (doorSwatch(f.finish.colour) || doorStock));
}

// --- Silver TG flakes (painted into the colour, no environment reflection) ---------------

let flakeSpots = null;
/** Flake centres and radii in texture pixels, the same for every metallic colour. */
function spots() {
  if (flakeSpots) return flakeSpots;
  let seed = F.seed >>> 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pxPerMm = F.texturePx / F.tileMm;
  const count = Math.round(F.perCm2 * (F.tileMm / 10) ** 2);
  const list = [];
  let area = 0;
  for (let i = 0; i < count; i += 1) {
    const r = (F.diameterMm / 2) * (0.6 + 0.8 * rnd()) * pxPerMm;
    list.push({ x: rnd() * F.texturePx, y: rnd() * F.texturePx, r });
    area += Math.PI * r * r;
  }
  flakeSpots = { list, coverage: Math.min(0.5, area / (F.texturePx * F.texturePx)) };
  return flakeSpots;
}

function paint(fill, flake) {
  const size = F.texturePx;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = flake;
  for (const s of spots().list) {
    // Wrapped copies so the tile repeats without a seam.
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const x = s.x + dx, y = s.y + dy;
        if (x + s.r < 0 || y + s.r < 0 || x - s.r > size || y - s.r > size) continue;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

const colourMaps = new Map();
/** Base colour with lighter flakes; the base is lifted back so the face averages to the swatch far away. */
function flakeColourMap(hex, renderer) {
  if (colourMaps.has(hex)) return colourMaps.get(hex);
  const target = new THREE.Color(hex);
  const flake = target.clone().lerp(new THREE.Color(1, 1, 1), F.lift);
  const c = spots().coverage;
  const base = new THREE.Color(
    THREE.MathUtils.clamp((target.r - c * flake.r) / (1 - c), 0, 1),
    THREE.MathUtils.clamp((target.g - c * flake.g) / (1 - c), 0, 1),
    THREE.MathUtils.clamp((target.b - c * flake.b) / (1 - c), 0, 1),
  );
  const tex = paint(`#${base.getHexString()}`, `#${flake.getHexString()}`);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (renderer) tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  colourMaps.set(hex, tex);
  return tex;
}

let surfaceMap = null;
/** Roughness only. Metalness stays 0: a metal map would need an environment to reflect. */
function flakeRoughnessMap() {
  if (surfaceMap) return surfaceMap;
  const g = (v) => Math.round(v * 255);
  surfaceMap = paint(`rgb(${g(F.baseRoughness)},${g(F.baseRoughness)},${g(F.baseRoughness)})`, `rgb(${g(F.flakeRoughness)},${g(F.flakeRoughness)},${g(F.flakeRoughness)})`);
  surfaceMap.colorSpace = THREE.NoColorSpace;
  return surfaceMap;
}

// --- materials ----------------------------------------------------------------------------

const materials = new Map();
const unknownLogged = new Set();

/**
 * One material for a door colour, used on the whole board so the face and the
 * edge are the same colour. No environment map and no clearcoat: those belong
 * to a later render mode, and here they pulled light colours toward blue.
 */
export function doorFinishMaterial(name, { dim = false } = {}) {
  const key = `${name}|${dim ? 1 : 0}`;
  if (materials.has(key)) return materials.get(key);
  let sw = doorSwatch(name);
  if (!sw) {
    sw = UNKNOWN_SWATCH;
    if (!unknownLogged.has(name)) {
      unknownLogged.add(name);
      log("colour.unknown", { name });
    }
  }
  const mat = sw.finish === "metallic"
    ? new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: flakeColourMap(sw.hex, null),
      roughness: 1,
      roughnessMap: flakeRoughnessMap(),
      metalness: 0,
    })
    : new THREE.MeshStandardMaterial({
      color: sw.hex,
      roughness: sw.finish === "gloss" ? 0.4 : 0.9,
      metalness: 0,
    });
  if (dim) {
    mat.transparent = true;
    mat.opacity = DIM_OPACITY;
    mat.depthWrite = false;
  }
  materials.set(key, mat);
  return mat;
}

/** Same material as the colour face. A second material on the edge was reading as a different colour. */
export function doorBodyMaterial(name, opts) {
  return doorFinishMaterial(name, opts);
}

/**
 * Sheet geometry just proud of one colour face, with UVs in millimetres on the
 * face (one unit = one flake tile), so flakes keep their size on any board.
 */
export function colourSheetGeometry(board, face) {
  const geo = faceSheetGeometry(board, face, SHEET_MM);
  if (!geo) return null;
  const [U, V] = AXES_OF[board.profilePlane] || AXES_OF.XY;
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i += 1) {
    uv[2 * i] = pos.getComponent(i, AXIS_INDEX[U]) / F.tileMm;
    uv[2 * i + 1] = pos.getComponent(i, AXIS_INDEX[V]) / F.tileMm;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}
