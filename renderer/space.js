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

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.body.appendChild(renderer.domElement);

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
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener("resize", resize);
resize();

function tick() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

tick();
