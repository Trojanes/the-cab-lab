// White Stipple: the carcass melamine. Australian trade name for a white board
// faced both sides with an even, medium stipple (Polytec "Carcass Texture":
// "a traditional medium textured surface with an even all over stipple").
// Not a print and not a colour shift — a warm white with a pebbled skin.
// The grain is in millimetres, sampled from the board's world position, so a
// shelf and a side panel carry the same texture.
import * as THREE from "three";

export const STIPPLE_WHITE = 0xf3f3f0;

const STIPPLE = {
  tileMm: 24,
  diameterMm: 0.5,
  perCm2: 180,
  texturePx: 512,
  seed: 11,
};

let map = null;
function stippleMap() {
  if (map) return map;
  let seed = STIPPLE.seed >>> 0;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const size = STIPPLE.texturePx;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgb(128,128,128)";
  ctx.fillRect(0, 0, size, size);
  const pxPerMm = size / STIPPLE.tileMm;
  const count = Math.round(STIPPLE.perCm2 * (STIPPLE.tileMm / 10) ** 2);
  for (let i = 0; i < count; i += 1) {
    const r = (STIPPLE.diameterMm / 2) * (0.65 + 0.7 * rnd()) * pxPerMm;
    const x = rnd() * size;
    const y = rnd() * size;
    const tone = 150 + Math.floor(rnd() * 70);
    ctx.fillStyle = `rgb(${tone},${tone},${tone})`;
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        const cx = x + dx, cy = y + dy;
        if (cx + r < 0 || cy + r < 0 || cx - r > size || cy - r > size) continue;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.NoColorSpace;
  return map;
}

function stipple(dim) {
  const mat = new THREE.MeshStandardMaterial({
    color: STIPPLE_WHITE,
    roughness: 0.9,
    metalness: 0,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.stippleMap = { value: stippleMap() };
    shader.uniforms.stippleTile = { value: STIPPLE.tileMm };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vStippleWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvStippleWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vStippleWorld;\nuniform sampler2D stippleMap;\nuniform float stippleTile;")
      .replace("#include <normal_fragment_maps>", `#include <normal_fragment_maps>
{
  vec3 blend = abs(normalize(vNormal));
  blend /= blend.x + blend.y + blend.z;
  float texel = 1.0 / ${STIPPLE.texturePx}.0;
  vec2 uvX = vStippleWorld.zy / stippleTile;
  vec2 uvY = vStippleWorld.xz / stippleTile;
  vec2 uvZ = vStippleWorld.xy / stippleTile;
  vec2 dh = blend.x * vec2(texture2D(stippleMap, uvX).r - texture2D(stippleMap, uvX + vec2(texel, 0.0)).r, texture2D(stippleMap, uvX).r - texture2D(stippleMap, uvX + vec2(0.0, texel)).r)
           + blend.y * vec2(texture2D(stippleMap, uvY).r - texture2D(stippleMap, uvY + vec2(texel, 0.0)).r, texture2D(stippleMap, uvY).r - texture2D(stippleMap, uvY + vec2(0.0, texel)).r)
           + blend.z * vec2(texture2D(stippleMap, uvZ).r - texture2D(stippleMap, uvZ + vec2(texel, 0.0)).r, texture2D(stippleMap, uvZ).r - texture2D(stippleMap, uvZ + vec2(0.0, texel)).r);
  normal = normalize(normal + vec3(dh * 3.5, 0.0));
}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>
{
  vec3 blend = abs(normalize(vNormal));
  blend /= blend.x + blend.y + blend.z;
  float s = texture2D(stippleMap, vStippleWorld.zy / stippleTile).r * blend.x
          + texture2D(stippleMap, vStippleWorld.xz / stippleTile).r * blend.y
          + texture2D(stippleMap, vStippleWorld.xy / stippleTile).r * blend.z;
  roughnessFactor = clamp(roughnessFactor + (s - 0.5) * 0.4, 0.0, 1.0);
}`);
  };
  if (dim) {
    mat.transparent = true;
    mat.opacity = 0.22;
    mat.depthWrite = false;
  }
  return mat;
}

export const carcassMat = stipple(false);
export const carcassDimMat = stipple(true);
