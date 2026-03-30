// r3fgem — Crystalline gem with flowing ASCII background
// In the Vite/React build, the gem is rendered by R3FGem.jsx.
// In the legacy esbuild build, we render it with raw three.js here.
// Interaction state is exported for R3FGem.jsx to read.
//
// Mask is built analytically by projecting 3D geometry to screen coords
// and rasterizing in pure JS — no GPU readPixels sync needed.

import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import * as THREE from 'three';

// Text to flow around the gem
var gemText = 'CRYSTAL LATTICE REFRACTION PRISM FACET BRILLIANCE CLARITY CUT CARAT ' +
  'DIAMOND SAPPHIRE EMERALD RUBY TOPAZ AMETHYST OPAL QUARTZ OBSIDIAN JADE ' +
  'LUMINESCENCE IRIDESCENT CHROMATIC SPECTRAL DIFFRACTION WAVELENGTH PHOTON ' +
  'SYMMETRY HEXAGONAL TETRAGONAL ORTHORHOMBIC MONOCLINIC TRIGONAL CUBIC ';

// === Exported interaction state (shared with R3FGem.jsx) ===
export var gemState = {
  rotX: 0.4,
  rotY: 0.6,
  rotZ: 0,
  rotVX: 0,
  rotVY: 0,
  offX: 0,
  offY: 0,
  scale: 1.0,
  dragging: false,
  moving: false,
  autoRotate: true,
};

// === Private state ===
var overlayEl = null;
var renderer = null;
var scene = null;
var camera = null;
var group = null;
var innerMesh = null;
var particles = null;
var particleData = [];
var dummy = new THREE.Object3D();
var clock = new THREE.Clock();

var lastDragX = 0, lastDragY = 0;
var lastMoveX = 0, lastMoveY = 0;
var touchCount = 0;
var pinchDist = 0;

// === Cached buffers ===
var cachedMask = null;
var cachedMaskSize = 0;
var cachedDistField = null;

var SQRT2 = Math.SQRT2;
var PARTICLE_COUNT = 60;

// === Pre-extracted icosahedron geometry for analytical projection ===
var icoVerts = null; // Float32Array of [x,y,z, x,y,z, ...]
var icoFaces = null; // Uint16Array of triangle indices
var icoVertCount = 0;

(function extractIcoGeometry() {
  var geo = new THREE.IcosahedronGeometry(1.2, 1);
  var pos = geo.getAttribute('position');
  icoVerts = new Float32Array(pos.array);
  icoVertCount = pos.count;
  var idx = geo.getIndex();
  if (idx) {
    icoFaces = new Uint16Array(idx.array);
  } else {
    icoFaces = new Uint16Array(pos.count);
    for (var i = 0; i < pos.count; i++) icoFaces[i] = i;
  }
  geo.dispose();
})();

// === Reusable THREE objects for projection (zero allocation per frame) ===
// NOTE: Camera params (fov=45, near=0.1, far=100, position=[0,0,5]) must match
// the <Canvas camera={...}> props in R3FGem.jsx. If those ever change, update here too.
var _projCam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
_projCam.position.set(0, 0, 5);
_projCam.updateMatrixWorld();

var _euler = new THREE.Euler();
var _quat = new THREE.Quaternion();
var _pos3 = new THREE.Vector3();
var _scl3 = new THREE.Vector3();
var _modelMat = new THREE.Matrix4();
var _v3 = new THREE.Vector3();

// Projected vertices buffer (reused across frames)
var projBuf = null;
var projBufSize = 0;

// Seeded PRNG for deterministic particle positions
// Must produce identical sequence as R3FGem.jsx to ensure mask alignment
function seededRandom(seed) {
  var s = seed;
  return function() {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

var PARTICLE_SEED = 42;

function generateParticleData(rng) {
  var data = [];
  for (var i = 0; i < PARTICLE_COUNT; i++) {
    var theta = rng() * Math.PI * 2;
    var phi = Math.acos(2 * rng() - 1);
    var r = 1.8 + rng() * 1.2;
    data.push({
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
      speed: 0.3 + rng() * 0.7,
      offset: rng() * Math.PI * 2,
    });
  }
  return data;
}

// Export for R3FGem.jsx to use the same particle positions
export { seededRandom, generateParticleData, PARTICLE_SEED, PARTICLE_COUNT };

function initParticleData() {
  if (particleData.length === PARTICLE_COUNT) return;
  var rng = seededRandom(PARTICLE_SEED);
  particleData = generateParticleData(rng);
}

// === Interaction handlers ===
function onMouseDown(e) {
  if (state.currentMode !== 'r3fgem') return;
  e.preventDefault();
  if (e.button === 2) {
    gemState.moving = true;
    lastMoveX = e.clientX;
    lastMoveY = e.clientY;
  } else {
    gemState.dragging = true;
    gemState.autoRotate = false;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
  }
}

function onMouseMove(e) {
  if (state.currentMode !== 'r3fgem') return;
  if (gemState.dragging) {
    var dx = e.clientX - lastDragX;
    var dy = e.clientY - lastDragY;
    gemState.rotY += dx * 0.008;
    gemState.rotX += dy * 0.008;
    gemState.rotVY = dx * 0.003;
    gemState.rotVX = dy * 0.003;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    e.preventDefault();
  }
  if (gemState.moving) {
    var dx = e.clientX - lastMoveX;
    var dy = e.clientY - lastMoveY;
    var vh = window.innerHeight || 800;
    var vw = window.innerWidth || 1200;
    var worldH = 2 * 5 * Math.tan(22.5 * Math.PI / 180);
    var worldW = worldH * (vw / vh);
    gemState.offX += dx * (worldW / vw);
    gemState.offY -= dy * (worldH / vh);
    lastMoveX = e.clientX;
    lastMoveY = e.clientY;
    e.preventDefault();
  }
}

function onMouseUp(e) {
  if (e.button === 2) {
    gemState.moving = false;
  } else {
    gemState.dragging = false;
  }
}

function onWheel(e) {
  if (state.currentMode !== 'r3fgem') return;
  e.preventDefault();
  var delta = e.deltaY > 0 ? -0.05 : 0.05;
  gemState.scale = Math.max(0.3, Math.min(3.0, gemState.scale + delta));
}

function onTouchStart(e) {
  if (state.currentMode !== 'r3fgem') return;
  if (e.target && e.target.closest && e.target.closest('nav')) return;
  e.preventDefault();
  touchCount = e.touches.length;
  if (touchCount >= 2) {
    gemState.moving = true;
    gemState.dragging = false;
    var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    var my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    lastMoveX = mx;
    lastMoveY = my;
    pinchDist = Math.sqrt(
      Math.pow(e.touches[1].clientX - e.touches[0].clientX, 2) +
      Math.pow(e.touches[1].clientY - e.touches[0].clientY, 2)
    );
  } else {
    gemState.dragging = true;
    gemState.autoRotate = false;
    lastDragX = e.touches[0].clientX;
    lastDragY = e.touches[0].clientY;
  }
}

function onTouchMove(e) {
  if (state.currentMode !== 'r3fgem') return;
  if (!gemState.dragging && !gemState.moving) return;
  e.preventDefault();
  if (e.touches.length >= 2 && gemState.moving) {
    var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    var my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    var vh = window.innerHeight || 800;
    var vw = window.innerWidth || 1200;
    var worldH = 2 * 5 * Math.tan(22.5 * Math.PI / 180);
    var worldW = worldH * (vw / vh);
    gemState.offX += (mx - lastMoveX) * (worldW / vw);
    gemState.offY -= (my - lastMoveY) * (worldH / vh);
    lastMoveX = mx;
    lastMoveY = my;
    var newDist = Math.sqrt(
      Math.pow(e.touches[1].clientX - e.touches[0].clientX, 2) +
      Math.pow(e.touches[1].clientY - e.touches[0].clientY, 2)
    );
    if (pinchDist > 0) {
      var scaleFactor = newDist / pinchDist;
      gemState.scale = Math.max(0.3, Math.min(3.0, gemState.scale * scaleFactor));
    }
    pinchDist = newDist;
  } else if (gemState.dragging && e.touches.length === 1) {
    var dx = e.touches[0].clientX - lastDragX;
    var dy = e.touches[0].clientY - lastDragY;
    gemState.rotY += dx * 0.008;
    gemState.rotX += dy * 0.008;
    gemState.rotVY = dx * 0.003;
    gemState.rotVX = dy * 0.003;
    lastDragX = e.touches[0].clientX;
    lastDragY = e.touches[0].clientY;
  }
}

function onTouchEnd(e) {
  if (state.currentMode !== 'r3fgem') return;
  if (e.touches.length === 0) {
    gemState.dragging = false;
    gemState.moving = false;
    touchCount = 0;
  } else if (e.touches.length === 1) {
    gemState.moving = false;
    gemState.dragging = true;
    lastDragX = e.touches[0].clientX;
    lastDragY = e.touches[0].clientY;
  }
}

function attachR3fgem() {
  var c = state.canvas;
  c.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  c.addEventListener('wheel', onWheel, { passive: false });
  c.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
}

// === Scene creation (legacy build only) ===
function createGemScene() {
  overlayEl = document.createElement('div');
  overlayEl.setAttribute('data-mode-overlay', 'r3fgem');
  overlayEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;pointer-events:none;';
  document.body.appendChild(overlayEl);

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  overlayEl.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 5);

  scene.add(new THREE.AmbientLight(0x667799, 0.8));
  var dir1 = new THREE.DirectionalLight(0xffffff, 2);
  dir1.position.set(3, 4, 5);
  scene.add(dir1);
  var dir2 = new THREE.DirectionalLight(0x8888ff, 1);
  dir2.position.set(-3, -2, 3);
  scene.add(dir2);
  var point = new THREE.PointLight(0x4488ff, 1.5);
  point.position.set(0, 0, 3);
  scene.add(point);

  group = new THREE.Group();
  scene.add(group);

  var mainGeo = new THREE.IcosahedronGeometry(1.2, 1);
  var innerGeo = new THREE.IcosahedronGeometry(0.6, 0);

  group.add(new THREE.Mesh(mainGeo, new THREE.MeshPhysicalMaterial({
    color: 0x4488ff, metalness: 0.1, roughness: 0.05,
    transparent: true, opacity: 0.7, side: THREE.DoubleSide, envMapIntensity: 2,
  })));

  group.add(new THREE.Mesh(mainGeo, new THREE.MeshBasicMaterial({
    color: 0x88ccff, wireframe: true, transparent: true, opacity: 0.4,
  })));

  innerMesh = new THREE.Mesh(innerGeo, new THREE.MeshPhysicalMaterial({
    color: 0xffffff, emissive: 0x2266cc, emissiveIntensity: 1.5, metalness: 0.8, roughness: 0,
  }));
  group.add(innerMesh);

  var sphereGeo = new THREE.SphereGeometry(1, 6, 6);
  particles = new THREE.InstancedMesh(sphereGeo, new THREE.MeshBasicMaterial({
    color: 0x88ccff, transparent: true, opacity: 0.8,
  }), PARTICLE_COUNT);
  group.add(particles);
}

function updateGemTransform() {
  if (!gemState.dragging) {
    if (gemState.autoRotate) {
      gemState.rotY += 0.008;
      gemState.rotX += 0.003;
    } else {
      gemState.rotY += gemState.rotVY;
      gemState.rotX += gemState.rotVX;
      gemState.rotVY *= 0.97;
      gemState.rotVX *= 0.97;
      if (Math.abs(gemState.rotVY) < 0.0001 && Math.abs(gemState.rotVX) < 0.0001) {
        gemState.autoRotate = true;
      }
    }
  }
}

function animateGem(delta) {
  if (!group) return;

  updateGemTransform();

  group.rotation.x = gemState.rotX;
  group.rotation.y = gemState.rotY;
  group.position.x = gemState.offX;
  group.position.y = gemState.offY;
  group.scale.setScalar(gemState.scale);

  if (innerMesh) {
    innerMesh.rotation.x -= delta * 0.8;
    innerMesh.rotation.y -= delta * 0.4;
  }

  if (particles && particleData.length) {
    var t = clock.getElapsedTime();
    for (var i = 0; i < particleData.length; i++) {
      var p = particleData[i];
      var s = Math.sin(t * p.speed + p.offset);
      dummy.position.set(
        p.x + s * 0.3,
        p.y + Math.cos(t * p.speed * 0.7 + p.offset) * 0.3,
        p.z + s * 0.2
      );
      dummy.scale.setScalar(0.02 + Math.abs(s) * 0.03);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    }
    particles.instanceMatrix.needsUpdate = true;
  }
}

// === Analytical mask building (pure JS, no GPU sync) ===

// Barycentric sign for point-in-triangle test
function triSign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

// Rasterize a projected triangle into the mask grid
function rasterTriangle(mask, W, H, ax, ay, bx, by, cx, cy) {
  var minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  var maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  var minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  var maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));

  for (var y = minY; y <= maxY; y++) {
    for (var x = minX; x <= maxX; x++) {
      // Test cell center (x+0.5, y+0.5) against triangle
      var px = x + 0.5;
      var py = y + 0.5;
      var d1 = triSign(px, py, ax, ay, bx, by);
      var d2 = triSign(px, py, bx, by, cx, cy);
      var d3 = triSign(px, py, cx, cy, ax, ay);
      var hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      var hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      if (!(hasNeg && hasPos)) {
        mask[y * W + x] = 1;
      }
    }
  }
}

// Rasterize a projected circle (particle) into the mask grid
function rasterCircle(mask, W, H, cx, cy, r) {
  var minX = Math.max(0, Math.floor(cx - r));
  var maxX = Math.min(W - 1, Math.ceil(cx + r));
  var minY = Math.max(0, Math.floor(cy - r));
  var maxY = Math.min(H - 1, Math.ceil(cy + r));
  var r2 = r * r;
  for (var y = minY; y <= maxY; y++) {
    for (var x = minX; x <= maxX; x++) {
      var dx = x + 0.5 - cx;
      var dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) {
        mask[y * W + x] = 1;
      }
    }
  }
}

function buildMask(W, H) {
  var cellCount = W * H;
  if (!cachedMask || cachedMaskSize !== cellCount) {
    cachedMask = new Uint8Array(cellCount);
    cachedDistField = new Float32Array(cellCount);
    cachedMaskSize = cellCount;
  }
  cachedMask.fill(0);

  // Screen dimensions for projection mapping
  var vw = window.innerWidth || 1200;
  var vh = window.innerHeight || 800;
  var charW = state.CHAR_W || (vw / W);
  var charH = state.CHAR_H || (vh / H);
  var navH = state.NAV_H || 32;

  // Update projection camera aspect to match screen
  _projCam.aspect = vw / vh;
  _projCam.updateProjectionMatrix();
  _projCam.updateMatrixWorld();

  // Build model matrix from gemState
  _euler.set(gemState.rotX, gemState.rotY, gemState.rotZ, 'XYZ');
  _quat.setFromEuler(_euler);
  _pos3.set(gemState.offX, gemState.offY, 0);
  _scl3.setScalar(gemState.scale);
  _modelMat.compose(_pos3, _quat, _scl3);

  // Ensure projection buffer is large enough
  var needed = icoVertCount * 2;
  if (!projBuf || projBufSize < needed) {
    projBuf = new Float32Array(needed);
    projBufSize = needed;
  }

  // Project all icosahedron vertices to grid coords
  for (var i = 0; i < icoVertCount; i++) {
    _v3.set(icoVerts[i * 3], icoVerts[i * 3 + 1], icoVerts[i * 3 + 2]);
    _v3.applyMatrix4(_modelMat);
    _v3.project(_projCam);
    var sx = (_v3.x * 0.5 + 0.5) * vw;
    var sy = (1 - (_v3.y * 0.5 + 0.5)) * vh;
    projBuf[i * 2] = sx / charW;
    projBuf[i * 2 + 1] = (sy - navH) / charH;
  }

  // Rasterize icosahedron triangles
  for (var t = 0; t < icoFaces.length; t += 3) {
    var i0 = icoFaces[t], i1 = icoFaces[t + 1], i2 = icoFaces[t + 2];
    rasterTriangle(cachedMask, W, H,
      projBuf[i0 * 2], projBuf[i0 * 2 + 1],
      projBuf[i1 * 2], projBuf[i1 * 2 + 1],
      projBuf[i2 * 2], projBuf[i2 * 2 + 1]);
  }

  // Project and rasterize particles
  var tanHalf = Math.tan(22.5 * Math.PI / 180); // tan(FOV/2)
  var time = state.time;
  for (var i = 0; i < particleData.length; i++) {
    var p = particleData[i];
    var s = Math.sin(time * p.speed + p.offset);
    // Animated position in gem-local space (same formula as R3FGem.jsx)
    var px = p.x + s * 0.3;
    var py = p.y + Math.cos(time * p.speed * 0.7 + p.offset) * 0.3;
    var pz = p.z + s * 0.2;
    // 2x safety margin accounts for low-poly sphere facets, AA, and material glow
    var worldRadius = (0.02 + Math.abs(s) * 0.03) * gemState.scale * 2.0;

    // Transform to world space
    _v3.set(px, py, pz);
    _v3.applyMatrix4(_modelMat);
    var worldZ = _v3.z;

    // Distance from camera (camera at z=5)
    var dist = 5 - worldZ;
    if (dist < 0.1) continue; // behind camera

    // Project center to grid
    _v3.project(_projCam);
    var sx = (_v3.x * 0.5 + 0.5) * vw;
    var sy = (1 - (_v3.y * 0.5 + 0.5)) * vh;
    var gcx = sx / charW;
    var gcy = (sy - navH) / charH;

    // Compute projected radius in grid cells
    // projectedScreenHeight = worldRadius / (dist * tan(fov/2)) * viewportHeight/2
    var projPixelR = (worldRadius / (dist * tanHalf)) * vh * 0.5;
    var projCellR = projPixelR / charH;
    projCellR = Math.max(projCellR, 1.0); // minimum 1 cell radius for coverage

    rasterCircle(cachedMask, W, H, gcx, gcy, projCellR + 0.5);
  }

  // Dilate mask by 1 cell for padding
  cachedDistField.fill(0);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var i = y * W + x;
      if (cachedMask[i]) { cachedDistField[i] = 1; continue; }
      if ((x > 0 && cachedMask[i - 1]) ||
          (x < W - 1 && cachedMask[i + 1]) ||
          (y > 0 && cachedMask[i - W]) ||
          (y < H - 1 && cachedMask[i + W])) {
        cachedDistField[i] = 1;
      }
    }
  }
  for (var i = 0; i < cellCount; i++) {
    cachedMask[i] = cachedDistField[i] ? 1 : 0;
  }

  // Chamfer distance transform for proximity field
  var INF = 999;
  var maxDist = 3;
  for (var i = 0; i < cellCount; i++) {
    cachedDistField[i] = cachedMask[i] ? 0 : INF;
  }
  // Forward pass
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var i = y * W + x;
      if (x > 0 && cachedDistField[i - 1] + 1 < cachedDistField[i]) cachedDistField[i] = cachedDistField[i - 1] + 1;
      if (y > 0 && cachedDistField[i - W] + 1 < cachedDistField[i]) cachedDistField[i] = cachedDistField[i - W] + 1;
      if (x > 0 && y > 0 && cachedDistField[i - W - 1] + SQRT2 < cachedDistField[i]) cachedDistField[i] = cachedDistField[i - W - 1] + SQRT2;
      if (x < W - 1 && y > 0 && cachedDistField[i - W + 1] + SQRT2 < cachedDistField[i]) cachedDistField[i] = cachedDistField[i - W + 1] + SQRT2;
    }
  }
  // Backward pass
  for (var y = H - 1; y >= 0; y--) {
    for (var x = W - 1; x >= 0; x--) {
      var i = y * W + x;
      if (x < W - 1 && cachedDistField[i + 1] + 1 < cachedDistField[i]) cachedDistField[i] = cachedDistField[i + 1] + 1;
      if (y < H - 1 && cachedDistField[i + W] + 1 < cachedDistField[i]) cachedDistField[i] = cachedDistField[i + W] + 1;
      if (x < W - 1 && y < H - 1 && cachedDistField[i + W + 1] + SQRT2 < cachedDistField[i]) cachedDistField[i] = cachedDistField[i + W + 1] + SQRT2;
      if (x > 0 && y < H - 1 && cachedDistField[i + W - 1] + SQRT2 < cachedDistField[i]) cachedDistField[i] = cachedDistField[i + W - 1] + SQRT2;
    }
  }
  // Convert to proximity (0..1 range)
  for (var i = 0; i < cellCount; i++) {
    if (cachedDistField[i] === 0) {
      cachedDistField[i] = -1; // masked cell sentinel
    } else if (cachedDistField[i] <= maxDist) {
      cachedDistField[i] = 1 - cachedDistField[i] / maxDist;
    } else {
      cachedDistField[i] = 0;
    }
  }

  return cachedMask;
}

function initR3fgem() {
  gemState.rotX = 0.4;
  gemState.rotY = 0.6;
  gemState.rotZ = 0;
  gemState.rotVX = 0;
  gemState.rotVY = 0;
  gemState.offX = 0;
  gemState.offY = 0;
  gemState.scale = 1.0;
  gemState.dragging = false;
  gemState.moving = false;
  gemState.autoRotate = true;
  cachedMask = null;
  cachedDistField = null;

  // Initialize particle data for analytical mask (needed in both build paths)
  initParticleData();

  var existing = document.querySelector('[data-mode-overlay="r3fgem"]');
  if (existing) {
    overlayEl = existing;
    if (!renderer) {
      // Vite/React build — R3FGem.jsx handles 3D rendering.
      // Re-show overlay in case doSwitch hid it (e.g. re-switching to same mode).
      existing.style.display = 'block';
      return;
    }
  }

  // In Vite/React build, R3FGem.jsx handles 3D rendering via React Three Fiber.
  // Don't create a standalone three.js scene — it causes duplicate overlays and
  // race conditions with the lazy-loaded R3FGem component.
  var isReactBuild = !!document.getElementById('root');
  if (!renderer && isReactBuild) {
    return;
  }

  // Legacy esbuild build — create standalone three.js scene
  if (!renderer) {
    createGemScene();
  }
  if (overlayEl) overlayEl.style.display = 'block';

  if (renderer) {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
}

function renderR3fgem() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;

  if (renderer) {
    var delta = clock.getDelta();
    animateGem(delta);
    renderer.render(scene, camera);
  } else {
    updateGemTransform();
  }

  // Build mask analytically (no GPU sync needed)
  var mask = buildMask(W, H);

  // Render flowing text using pre-computed distance field
  var textIdx = 0;
  var textOffset = Math.floor(t * 2.5);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;

      // Skip masked cells
      if (mask && mask[idx]) continue;

      // Read proximity from pre-computed distance field
      var nearGem = cachedDistField ? cachedDistField[idx] : 0;

      // Skip cells too close to gem (tight buffer)
      if (nearGem > 0.6) continue;

      var ci = (textOffset + textIdx) % gemText.length;
      textIdx++;
      var ch = gemText[ci];

      if (ch === ' ') {
        if (nearGem > 0.2) {
          var gh = (t * 50 + x * 4 + y * 3) % 360;
          drawCharHSL('.', x, y, gh, 60, 12 + nearGem * 25);
        }
        continue;
      }

      var hue = (200 + Math.sin(x * 0.15 + y * 0.1 + t * 0.8) * 40 + t * 15) % 360;
      var sat = 65 + Math.sin(x * 0.3 - t) * 20;
      var light = 25 + Math.sin(x * 0.2 + y * 0.15 + t * 1.2) * 15;

      if (nearGem > 0) {
        light += nearGem * 30;
        sat += nearGem * 15;
      }

      drawCharHSL(ch, x, y, hue | 0, sat | 0, light | 0);
    }
  }

  // Label
  var label = '[r3fgem] drag:rotate  right-click:move  scroll:scale';
  var lx = Math.floor((W - label.length) / 2);
  for (var li = 0; li < label.length; li++) {
    if (!mask || !mask[(H - 1) * W + lx + li]) {
      drawCharHSL(label[li], lx + li, H - 1, 220, 40, 22);
    }
  }
}

function cleanupR3fgem() {
  if (overlayEl) overlayEl.style.display = 'none';
}

registerMode('r3fgem', {
  init: initR3fgem,
  render: renderR3fgem,
  attach: attachR3fgem,
  cleanup: cleanupR3fgem,
});
