import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const MM = 1;
const GRID_MINOR_MM = 100;
const GRID_MAJOR_MM = 1000;
const GRID_EXTENT_MM = 10000;
const AXIS_LENGTH_MM = 1000;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1c1f);

const camera = new THREE.PerspectiveCamera(50, 1, 10, 100000);
camera.up.set(0, 0, 1);
camera.position.set(4200, -4800, 2800);

const mount = document.getElementById("viewport") || document.body;
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
mount.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.screenSpacePanning = true;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
};

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 0.75);
key.position.set(4000, -2500, 6000);
scene.add(key);

scene.add(makeGrid());
scene.add(makeAxes());
scene.add(makeOrigin());

function makeGrid() {
  const group = new THREE.Group();
  group.name = "metric-grid";

  const minor = [];
  const major = [];

  for (let i = -GRID_EXTENT_MM; i <= GRID_EXTENT_MM; i += GRID_MINOR_MM) {
    const isMajor = i % GRID_MAJOR_MM === 0;
    const dest = isMajor ? major : minor;
    dest.push(-GRID_EXTENT_MM, i, 0, GRID_EXTENT_MM, i, 0);
    dest.push(i, -GRID_EXTENT_MM, 0, i, GRID_EXTENT_MM, 0);
  }

  group.add(lineSegments(minor, 0x2c3138));
  group.add(lineSegments(major, 0x4a515c));
  return group;
}

function makeAxes() {
  const group = new THREE.Group();
  group.name = "axes";
  group.add(axis(AXIS_LENGTH_MM, 0, 0, 0xd94b4b));
  group.add(axis(0, AXIS_LENGTH_MM, 0, 0x4fc46f));
  group.add(axis(0, 0, AXIS_LENGTH_MM, 0x4f86e0));
  return group;
}

function axis(x, y, z, color) {
  // The X and Y axes lie exactly on the y=0 / x=0 major grid lines. Without
  // depth testing they would z-fight with the grid and vanish, so draw axes
  // after the grid and ignore depth.
  const line = lineSegments([0, 0, 0, x, y, z], color);
  line.material.depthTest = false;
  line.renderOrder = 10;
  return line;
}

function makeOrigin() {
  const geo = new THREE.SphereGeometry(18 * MM, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xd8dde4 });
  const dot = new THREE.Mesh(geo, mat);
  dot.name = "origin";
  dot.renderOrder = 11;
  return dot;
}

function lineSegments(positions, color) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({ color, toneMapped: false });
  return new THREE.LineSegments(geometry, material);
}

function resize() {
  const w = mount.clientWidth || window.innerWidth;
  const h = mount.clientHeight || window.innerHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

if (typeof ResizeObserver === "function") {
  new ResizeObserver(resize).observe(mount);
} else {
  window.addEventListener("resize", resize);
}
resize();

// Named views. Camera stays perspective for now; Top/Front only move it.
const VIEWS = {
  "3d": { pos: [4200, -4800, 2800], up: [0, 0, 1] },
  top: { pos: [0, 0, 8000], up: [0, 1, 0] },
  front: { pos: [0, -8000, 1200], up: [0, 0, 1] },
};

export function setView(name) {
  const v = VIEWS[name] || VIEWS["3d"];
  camera.up.set(v.up[0], v.up[1], v.up[2]);
  camera.position.set(v.pos[0], v.pos[1], v.pos[2]);
  controls.target.set(0, 0, name === "front" ? 1200 : 0);
  controls.update();
}

// Floor-plane cursor readout for the status bar. Returns null when the ray
// misses the XY plane (looking at the horizon).
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();

export function floorPointAt(clientX, clientY) {
  const r = renderer.domElement.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  return raycaster.ray.intersectPlane(floorPlane, hit) ? { x: hit.x, y: hit.y } : null;
}

export const canvas = renderer.domElement;

function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
