// r3fgem — Crystalline gem with flowing ASCII background
// In the Vite/React build, the gem is rendered by R3FGem.jsx.
// In the legacy esbuild build, we render it with raw three.js here.

import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import * as THREE from 'three';

// Text to flow around the gem
var gemText = 'CRYSTAL LATTICE REFRACTION PRISM FACET BRILLIANCE CLARITY CUT CARAT ' +
  'DIAMOND SAPPHIRE EMERALD RUBY TOPAZ AMETHYST OPAL QUARTZ OBSIDIAN JADE ' +
  'LUMINESCENCE IRIDESCENT CHROMATIC SPECTRAL DIFFRACTION WAVELENGTH PHOTON ' +
  'SYMMETRY HEXAGONAL TETRAGONAL ORTHORHOMBIC MONOCLINIC TRIGONAL CUBIC ';

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

function createGemScene() {
  // Create overlay container
  overlayEl = document.createElement('div');
  overlayEl.setAttribute('data-mode-overlay', 'r3fgem');
  overlayEl.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;z-index:5;pointer-events:none;';
  document.body.appendChild(overlayEl);

  // Three.js renderer
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, premultipliedAlpha: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);
  overlayEl.appendChild(renderer.domElement);

  // Scene + camera
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 5);

  // Lighting
  var ambient = new THREE.AmbientLight(0x667799, 0.8);
  scene.add(ambient);
  var dir1 = new THREE.DirectionalLight(0xffffff, 2);
  dir1.position.set(3, 4, 5);
  scene.add(dir1);
  var dir2 = new THREE.DirectionalLight(0x8888ff, 1);
  dir2.position.set(-3, -2, 3);
  scene.add(dir2);
  var point = new THREE.PointLight(0x4488ff, 1.5);
  point.position.set(0, 0, 3);
  scene.add(point);

  // Gem group
  group = new THREE.Group();
  scene.add(group);

  var mainGeo = new THREE.IcosahedronGeometry(1.2, 1);
  var innerGeo = new THREE.IcosahedronGeometry(0.6, 0);

  // Main crystal body
  var mainMat = new THREE.MeshPhysicalMaterial({
    color: 0x4488ff, metalness: 0.1, roughness: 0.05,
    transparent: true, opacity: 0.7, side: THREE.DoubleSide, envMapIntensity: 2,
  });
  group.add(new THREE.Mesh(mainGeo, mainMat));

  // Wireframe overlay
  var wireMat = new THREE.MeshBasicMaterial({ color: 0x88ccff, wireframe: true, transparent: true, opacity: 0.4 });
  group.add(new THREE.Mesh(mainGeo, wireMat));

  // Inner rotating core
  var innerMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, emissive: 0x2266cc, emissiveIntensity: 1.5, metalness: 0.8, roughness: 0,
  });
  innerMesh = new THREE.Mesh(innerGeo, innerMat);
  group.add(innerMesh);

  // Instanced particles
  var count = 60;
  var sphereGeo = new THREE.SphereGeometry(1, 6, 6);
  var particleMat = new THREE.MeshBasicMaterial({ color: 0x88ccff, transparent: true, opacity: 0.8 });
  particles = new THREE.InstancedMesh(sphereGeo, particleMat, count);
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

function animateGem(delta) {
  if (!group) return;
  group.rotation.x += delta * 0.3;
  group.rotation.y += delta * 0.5;
  group.rotation.z += delta * 0.1;

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

function initR3fgem() {
  // Check if R3F overlay already exists (Vite/React build)
  var existing = document.querySelector('[data-mode-overlay="r3fgem"]');
  if (existing && !renderer) {
    // React build — R3FGem.jsx handles rendering
    overlayEl = existing;
    return;
  }

  // Legacy build — create three.js gem
  if (!renderer) {
    createGemScene();
  }
  overlayEl.style.display = 'block';

  // Handle resize
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

  // Animate and render the three.js gem (legacy build only)
  if (renderer) {
    var delta = clock.getDelta();
    animateGem(delta);
    renderer.render(scene, camera);
  }

  // Read overlay canvas for masking
  var r3fCanvas = null;
  if (overlayEl) {
    r3fCanvas = overlayEl.querySelector('canvas');
  }

  // Build mask from overlay canvas
  var mask = null;
  if (r3fCanvas && r3fCanvas.width > 0) {
    var mCtx;
    try {
      mCtx = r3fCanvas.getContext('webgl2') || r3fCanvas.getContext('webgl');
    } catch(e) {}

    if (mCtx) {
      var rW = r3fCanvas.width;
      var rH = r3fCanvas.height;
      // Use 4x supersampled grid for better silhouette detection
      var sampleScale = 4;
      var sW = W * sampleScale;
      var sH = H * sampleScale;
      var pixels = new Uint8Array(rW * rH * 4);
      mCtx.readPixels(0, 0, rW, rH, mCtx.RGBA, mCtx.UNSIGNED_BYTE, pixels);

      // Build high-res mask
      var hiMask = new Uint8Array(sW * sH);
      var cellW = rW / sW;
      var cellH = rH / sH;
      for (var sy = 0; sy < sH; sy++) {
        for (var sx = 0; sx < sW; sx++) {
          var px = Math.floor((sx + 0.5) * cellW);
          var py = Math.floor((sH - 1 - sy + 0.5) * cellH);
          if (px >= rW) px = rW - 1;
          if (py >= rH) py = rH - 1;
          var pi = (py * rW + px) * 4;
          if (pixels[pi + 3] > 10) hiMask[sy * sW + sx] = 1;
        }
      }

      // Downsample to char grid
      mask = new Uint8Array(W * H);
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var count = 0;
          for (var dy = 0; dy < sampleScale; dy++) {
            for (var dx = 0; dx < sampleScale; dx++) {
              if (hiMask[(y * sampleScale + dy) * sW + x * sampleScale + dx]) count++;
            }
          }
          if (count > 2) mask[y * W + x] = 1;
        }
      }

      // Dilate mask by 1 cell
      var raw = new Uint8Array(mask);
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          if (raw[y * W + x]) continue;
          if ((x > 0 && raw[y * W + x - 1]) ||
              (x < W - 1 && raw[y * W + x + 1]) ||
              (y > 0 && raw[(y - 1) * W + x]) ||
              (y < H - 1 && raw[(y + 1) * W + x])) {
            mask[y * W + x] = 1;
          }
        }
      }
    }
  }

  // Render flowing text
  var textIdx = 0;
  var textOffset = Math.floor(t * 2.5);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      if (mask && mask[y * W + x]) continue;

      var nearGem = 0;
      if (mask) {
        var bd = 2;
        for (var dy = -bd; dy <= bd; dy++) {
          for (var dx = -bd; dx <= bd; dx++) {
            if (dx === 0 && dy === 0) continue;
            var nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < W && ny >= 0 && ny < H && mask[ny * W + nx]) {
              var dist = Math.sqrt(dx * dx + dy * dy);
              nearGem = Math.max(nearGem, 1 - dist / (bd + 1));
            }
          }
        }
      }

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
}

function cleanupR3fgem() {
  if (overlayEl) overlayEl.style.display = 'none';
  // Don't dispose the three.js objects — just hide, so we can re-show quickly
}

function disposeR3fgem() {
  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }
  if (scene) {
    scene.traverse(function(obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (obj.material.map) obj.material.map.dispose();
        obj.material.dispose();
      }
    });
    scene = null;
  }
  if (overlayEl && overlayEl.parentNode) {
    overlayEl.parentNode.removeChild(overlayEl);
    overlayEl = null;
  }
  group = null;
  innerMesh = null;
  particles = null;
  particleData = [];
}

registerMode('r3fgem', {
  init: initR3fgem,
  render: renderR3fgem,
  cleanup: cleanupR3fgem,
});
