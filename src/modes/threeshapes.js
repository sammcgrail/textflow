import * as THREE from 'three';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Three Shapes — morphing wireframe geometries rendered to ASCII
// Click to trigger instant morph to next shape
var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var currentMesh = null;
var shapeIdx = 0;
var morphProgress = 1;
var morphSpeed = 0.02;
var autoMorphTimer = 0;
var AUTO_MORPH_INTERVAL = 8;

var SHAPE_NAMES = ['torus', 'icosahedron', 'octahedron', 'torusknot', 'dodecahedron'];
var SHAPE_HUES = [300, 180, 60, 120, 30];

function disposeAll() {
  if (currentMesh) {
    currentMesh.geometry.dispose();
    currentMesh.material.dispose();
    currentMesh = null;
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
  camera = null;
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  readCanvas = null;
  readCtx = null;
}

function createGeometry(idx) {
  switch (idx % SHAPE_NAMES.length) {
    case 0: return new THREE.TorusGeometry(3, 1.2, 16, 32);
    case 1: return new THREE.IcosahedronGeometry(3.5, 1);
    case 2: return new THREE.OctahedronGeometry(3.5, 1);
    case 3: return new THREE.TorusKnotGeometry(2.5, 0.8, 64, 12);
    case 4: return new THREE.DodecahedronGeometry(3.5, 1);
    default: return new THREE.TorusGeometry(3, 1.2, 16, 32);
  }
}

function setupScene() {
  var W = state.COLS;
  var H = state.ROWS;
  var rW = W * 2;
  var rH = H * 2;

  disposeAll();

  renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: true,
    preserveDrawingBuffer: true
  });
  renderer.setSize(rW, rH);
  renderer.domElement.style.display = 'none';

  readCanvas = document.createElement('canvas');
  readCanvas.width = rW;
  readCanvas.height = rH;
  readCtx = readCanvas.getContext('2d', { willReadFrequently: true });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x08080f);

  camera = new THREE.PerspectiveCamera(50, rW / rH, 0.1, 100);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);

  // Create initial shape
  var geo = createGeometry(shapeIdx);
  var hue = SHAPE_HUES[shapeIdx % SHAPE_HUES.length];
  var col = new THREE.Color().setHSL(hue / 360, 0.8, 0.5);
  var mat = new THREE.MeshBasicMaterial({
    color: col,
    wireframe: true
  });
  currentMesh = new THREE.Mesh(geo, mat);
  scene.add(currentMesh);

  morphProgress = 1;
  autoMorphTimer = 0;
}

function morphToNext() {
  if (!THREE || !scene) return;
  shapeIdx = (shapeIdx + 1) % SHAPE_NAMES.length;
  morphProgress = 0;

  // Replace geometry
  var newGeo = createGeometry(shapeIdx);
  if (currentMesh) {
    currentMesh.geometry.dispose();
    currentMesh.geometry = newGeo;
  }
  autoMorphTimer = 0;
}

function initThreeshapes() {
  shapeIdx = 0;
  morphProgress = 1;
  autoMorphTimer = 0;
  setupScene();
}

function renderThreeshapes() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (!renderer) {
    return;
  }

  // Click to morph
  if (pointer.clicked && state.currentMode === 'threeshapes') {
    pointer.clicked = false;
    morphToNext();
  }

  // Auto morph timer
  autoMorphTimer += 0.016;
  if (autoMorphTimer > AUTO_MORPH_INTERVAL) {
    morphToNext();
  }

  // Morph scale animation
  if (morphProgress < 1) {
    morphProgress += morphSpeed;
    if (morphProgress > 1) morphProgress = 1;
  }

  // Pulse scale
  var pulseScale = 1 + Math.sin(t * 2) * 0.1;
  var morphScale = morphProgress < 1 ? 0.3 + morphProgress * 0.7 : 1;
  var totalScale = pulseScale * morphScale;

  // Rotate shape
  if (currentMesh) {
    currentMesh.rotation.x = t * 0.3;
    currentMesh.rotation.y = t * 0.5;
    currentMesh.rotation.z = t * 0.15;
    currentMesh.scale.set(totalScale, totalScale, totalScale);

    // Update color with cycling hue
    var baseHue = SHAPE_HUES[shapeIdx % SHAPE_HUES.length];
    var hue = (baseHue + t * 10) % 360;
    currentMesh.material.color.setHSL(hue / 360, 0.8, 0.45 + Math.sin(t * 3) * 0.15);
  }

  // Render
  var rW = renderer.domElement.width;
  var rH = renderer.domElement.height;
  renderer.render(scene, camera);
  readCtx.drawImage(renderer.domElement, 0, 0, rW, rH);
  var imgData = readCtx.getImageData(0, 0, rW, rH).data;

  var scaleX = rW / W;
  var scaleY = rH / H;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var sx = Math.floor(x * scaleX);
      var sy = Math.floor(y * scaleY);
      var pi = (sy * rW + sx) * 4;
      var r = imgData[pi];
      var g = imgData[pi + 1];
      var b = imgData[pi + 2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.02) continue;
      var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ci];
      var alpha = Math.max(0.25, Math.min(1, lum * 1.5));
      drawChar(ch, x, y, r, g, b, alpha);
    }
  }

  // Shape name label
  var shapeName = SHAPE_NAMES[shapeIdx % SHAPE_NAMES.length];
  var label = '[' + shapeName + '] click:morph';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 30);
  }
}

registerMode('threeshapes', { init: initThreeshapes, render: renderThreeshapes, cleanup: disposeAll });
