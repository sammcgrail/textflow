// r3fgem — Crystalline gem with flowing ASCII background
// In the Vite/React build, the gem is rendered by R3FGem.jsx.
// In the legacy esbuild build, we render it with raw three.js here.
// Interaction state is exported for R3FGem.jsx to read.

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

// === Cached buffers (avoid per-frame allocation) ===
var cachedPixels = null;
var cachedPixelsSize = 0;
var cachedMask = null;
var cachedMaskSize = 0;
var cachedDistField = null; // pre-computed distance field (Float32Array)
var cachedDistSize = 0;
var maskFrameCounter = 0;
var MASK_SKIP_FRAMES = 2; // only rebuild mask every N frames

// === Pre-computed distance lookup for 5x5 kernel ===
var distLUT = new Float32Array(25);
(function() {
  for (var dy = -2; dy <= 2; dy++) {
    for (var dx = -2; dx <= 2; dx++) {
      distLUT[(dy + 2) * 5 + (dx + 2)] = Math.sqrt(dx * dx + dy * dy);
    }
  }
})();

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

  var count = 60;
  var sphereGeo = new THREE.SphereGeometry(1, 6, 6);
  particles = new THREE.InstancedMesh(sphereGeo, new THREE.MeshBasicMaterial({
    color: 0x88ccff, transparent: true, opacity: 0.8,
  }), count);
  group.add(particles);

  particleData = [];
  for (var i = 0; i < count; i++) {
    var theta = Math.random() * Math.PI * 2;
    var phi = Math.acos(2 * Math.random() - 1);
    var r = 1.8 + Math.random() * 1.2;
    particleData.push({
      x: r * Math.sin(phi) * Math.cos(theta),
      y: r * Math.sin(phi) * Math.sin(theta),
      z: r * Math.cos(phi),
      speed: 0.3 + Math.random() * 0.7,
      offset: Math.random() * Math.PI * 2,
    });
  }
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

// === Optimized mask building ===
// Build mask + distance field from overlay canvas pixels
// Only rebuilds every MASK_SKIP_FRAMES frames to amortize readPixels cost
function buildMask(W, H) {
  maskFrameCounter++;
  var needsRebuild = (maskFrameCounter % MASK_SKIP_FRAMES === 0);

  // Return cached if we have one and it's the right size
  if (!needsRebuild && cachedMask && cachedMaskSize === W * H) {
    return cachedMask;
  }

  var r3fCanvas = null;
  if (overlayEl) {
    r3fCanvas = overlayEl.querySelector('canvas');
  }
  if (!r3fCanvas || r3fCanvas.width === 0) return null;

  var mCtx;
  try {
    mCtx = r3fCanvas.getContext('webgl2') || r3fCanvas.getContext('webgl');
  } catch(e) { return null; }
  if (!mCtx) return null;

  var rW = r3fCanvas.width;
  var rH = r3fCanvas.height;

  // Reuse pixel buffer
  var pixelCount = rW * rH * 4;
  if (!cachedPixels || cachedPixelsSize !== pixelCount) {
    cachedPixels = new Uint8Array(pixelCount);
    cachedPixelsSize = pixelCount;
  }
  mCtx.readPixels(0, 0, rW, rH, mCtx.RGBA, mCtx.UNSIGNED_BYTE, cachedPixels);

  // Reuse mask buffer
  var cellCount = W * H;
  if (!cachedMask || cachedMaskSize !== cellCount) {
    cachedMask = new Uint8Array(cellCount);
    cachedDistField = new Float32Array(cellCount);
    cachedMaskSize = cellCount;
  }
  cachedMask.fill(0);

  // Sample directly at cell grid resolution (skip expensive 4x supersampling)
  // Sample 2x2 within each cell for adequate coverage of small particles
  var cellW = rW / W;
  var cellH = rH / H;
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Check 4 sample points within the cell
      var hit = 0;
      for (var sy = 0; sy < 2 && !hit; sy++) {
        for (var sx = 0; sx < 2 && !hit; sx++) {
          var px = Math.floor((x + 0.25 + sx * 0.5) * cellW);
          var py = Math.floor((H - 1 - y + 0.25 + sy * 0.5) * cellH);
          if (px >= rW) px = rW - 1;
          if (py >= rH) py = rH - 1;
          var pi = (py * rW + px) * 4;
          if (cachedPixels[pi + 3] > 10) hit = 1;
        }
      }
      if (hit) cachedMask[y * W + x] = 1;
    }
  }

  // Dilate mask by 1 cell (use separate pass to avoid read-write conflict)
  // Write dilated result into distField temporarily as staging
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
  // Copy back to mask
  for (var i = 0; i < cellCount; i++) {
    cachedMask[i] = cachedDistField[i] ? 1 : 0;
  }

  // Build distance field: for each non-masked cell, compute proximity to nearest masked cell
  // Use the pre-computed distLUT for the 5x5 kernel
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var idx = y * W + x;
      if (cachedMask[idx]) {
        cachedDistField[idx] = -1; // sentinel: is masked
        continue;
      }
      var nearGem = 0;
      for (var dy = -2; dy <= 2; dy++) {
        var ny = y + dy;
        if (ny < 0 || ny >= H) continue;
        for (var dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = x + dx;
          if (nx < 0 || nx >= W) continue;
          if (cachedMask[ny * W + nx]) {
            var dist = distLUT[(dy + 2) * 5 + (dx + 2)];
            var v = 1 - dist / 3; // bd+1 = 3
            if (v > nearGem) nearGem = v;
          }
        }
      }
      cachedDistField[idx] = nearGem;
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
  maskFrameCounter = 0;
  cachedMask = null;
  cachedDistField = null;

  var existing = document.querySelector('[data-mode-overlay="r3fgem"]');
  if (existing && !renderer) {
    overlayEl = existing;
    return;
  }

  if (!renderer) {
    createGemScene();
  }
  overlayEl.style.display = 'block';

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

  // Build/update mask (skips readPixels on most frames)
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
