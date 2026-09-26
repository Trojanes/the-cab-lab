// Door colours in 3D: a board with a colour face is painted all over from the
// swatch table (doorSwatches.js) — flat colour, metallic flakes or an HPL wood
// image laid out in millimetres. Display only; the geometry is untouched.
import * as THREE from "three";
import { doorSwatch, UNKNOWN_SWATCH, METALLIC_FLAKES as F } from "./doorSwatches.js";
import { STIPPLE_WHITE } from "./carcassFinish.js";
import { log } from "./log.js";

const AXES_OF = { YZ: ["y", "z"], XZ: ["x", "z"], XY: ["x", "y"] };
const THICK_OF = { YZ: "x", XZ: "y", XY: "z" };
const DIM_OPACITY = 0.22;

const isCarcassColour = (name) => /stipple/i.test(String(name || ""));

/**
 * The faces of a board that carry a door colour: A / B with `finish.colour`,
 * not hidden, and either a catalogue name or on door stock. Carcass colour
 * names (White Stipple — carcass boards, the back of single-sided door stock)
 * are not colour faces.
 */
export function colourFaces(board) {
  const doorStock = board.stock && board.stock.kind === "door";
  return (board.faces || []).filter((f) =>
    (f.id === "A" || f.id === "B")
    && f.visible !== false
    && f.finish && f.finish.colour
    && (doorSwatch(f.finish.colour) || (doorStock && !isCarcassColour(f.finish.colour))));
}

/**
 * The back of a single-sided board as a cabinet-frame direction ("+y", "-x"…),
 * or null: double-sided (the back carries a door colour too) or no back record.
 */
function singleSidedBack(board, front) {
  const back = (board.faces || []).find((f) => (f.id === "A" || f.id === "B") && f.id !== front.id);
  const colour = back && back.finish && back.finish.colour;
  if (!colour || !isCarcassColour(colour)) return null;
  return `${back.id === "A" ? "+" : "-"}${THICK_OF[board.profilePlane] || "z"}`;
}

/** A door colour without a board (edge bands): no single-sided back. */
export function doorBodyMaterial(name, opts) {
  return doorFinishMaterial(name, opts);
}

/** The material for a board with a colour face (door colour, grain, single-sided back), or null. */
export function doorMaterialFor(board, { dim = false } = {}) {
  const faces = colourFaces(board);
  if (!faces.length) return null;
  const front = faces[0];
  return doorFinishMaterial(front.finish.colour, { dim, grainAxis: grainAxisOf(board, front), back: singleSidedBack(board, front) });
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

// --- millimetre projection -----------------------------------------------------------------

/**
 * Samples `tex` from the board's own position in millimetres (one tile =
 * `tileMm`), projected on the face each pixel belongs to. `grainAxis` (x|y|z,
 * cabinet frame) is where the image's width goes: on the faces that contain
 * that axis the grain runs along it — front, back and the long edges alike.
 * The board's geometry and UVs are not touched.
 */
/**
 * `back` ("+y", "-x", …: the board's back face in the cabinet frame) = a
 * single-sided board: that face is drawn in the carcass colour; the colour
 * face and the edges keep the door colour.
 */
function doorHook(mat, { tex = null, tileMm = 1000, grainAxis = "x", roughTex = null, back = null } = {}) {
  if (!tex && !back) return;
  const g = { x: 0, y: 1, z: 2 }[grainAxis] ?? 0;
  const backTest = back ? `${back[0] === "-" ? "-" : ""}normalize(vPlanarNormal).${back[1]} > 0.5` : "false";
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.planarMap = { value: tex };
    shader.uniforms.planarRough = { value: roughTex };
    shader.uniforms.planarTile = { value: tileMm };
    shader.uniforms.doorBackColour = { value: new THREE.Color(STIPPLE_WHITE) };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPlanarPos;\nvarying vec3 vPlanarNormal;")
      .replace("#include <beginnormal_vertex>", "#include <beginnormal_vertex>\nvPlanarNormal = objectNormal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvPlanarPos = transformed;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
varying vec3 vPlanarPos;
varying vec3 vPlanarNormal;
uniform sampler2D planarMap;
uniform sampler2D planarRough;
uniform float planarTile;
uniform vec3 doorBackColour;
vec2 planarUv() {
  vec3 n = abs(vPlanarNormal);
  vec3 p = vPlanarPos / planarTile;
  if (n.x >= n.y && n.x >= n.z) return ${g === 2 ? "p.zy" : "p.yz"};
  if (n.y >= n.z) return ${g === 2 ? "p.zx" : "p.xz"};
  return ${g === 1 ? "p.yx" : "p.xy"};
}
bool onDoorBack() { return ${backTest}; }`)
      .replace("#include <map_fragment>", `${tex ? "diffuseColor *= texture2D(planarMap, planarUv());" : "#include <map_fragment>"}
if (onDoorBack()) diffuseColor.rgb = doorBackColour;`)
      .replace("#include <roughnessmap_fragment>", `${roughTex
        ? "float roughnessFactor = roughness * texture2D(planarRough, planarUv()).g;"
        : "float roughnessFactor = roughness;"}
if (onDoorBack()) roughnessFactor = 0.9;`);
  };
  mat.customProgramCacheKey = () => `door-${tex ? 1 : 0}-${g}-${roughTex ? 1 : 0}-${back || "none"}`;
}

const textures = new Map();
function hplTexture(url) {
  if (textures.has(url)) return textures.get(url);
  const tex = new THREE.TextureLoader().load(url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  textures.set(url, tex);
  return tex;
}

/** Cabinet axis the grain of `face` runs along: its `finish.grain` (u | v) in the board's plane. */
export function grainAxisOf(board, face) {
  const [U, V] = AXES_OF[board.profilePlane] || AXES_OF.XY;
  return face && face.finish && face.finish.grain === "v" ? V : U;
}

// --- materials ----------------------------------------------------------------------------

const materials = new Map();
const unknownLogged = new Set();

/**
 * One material for a door colour, used on the whole board so the face and the
 * edge are the same colour. No environment map and no clearcoat: those belong
 * to a later render mode, and here they pulled light colours toward blue.
 * `grainAxis` only matters for wood (HPL).
 */
export function doorFinishMaterial(name, { dim = false, grainAxis = "x", back = null } = {}) {
  let sw = doorSwatch(name);
  if (!sw) {
    sw = UNKNOWN_SWATCH;
    if (!unknownLogged.has(name)) {
      unknownLogged.add(name);
      log("colour.unknown", { name });
    }
  }
  const axis = sw.finish === "wood" && sw.grained ? grainAxis : "x";
  const key = `${name}|${dim ? 1 : 0}|${axis}|${back || ""}`;
  if (materials.has(key)) return materials.get(key);
  let mat;
  if (sw.finish === "wood") {
    mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0 });
    doorHook(mat, { tex: hplTexture(sw.texture), tileMm: sw.textureMm, grainAxis: axis, back });
  } else if (sw.finish === "metallic") {
    mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
    doorHook(mat, { tex: flakeColourMap(sw.hex, null), tileMm: F.tileMm, roughTex: flakeRoughnessMap(), back });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color: sw.hex,
      roughness: sw.finish === "gloss" ? 0.4 : 0.9,
      metalness: 0,
    });
    doorHook(mat, { back });
  }
  if (dim) {
    mat.transparent = true;
    mat.opacity = DIM_OPACITY;
    mat.depthWrite = false;
  }
  materials.set(key, mat);
  return mat;
}

