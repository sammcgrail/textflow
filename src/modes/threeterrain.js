import * as THREE from 'three';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Three Terrain — 3D terrain flyover with height-based coloring, rendered to ASCII
// Drag to adjust camera angle
var renderer = null;
var scene = null;
var camera = null;
var terrain = null;
var readCanvas = null;
var readCtx = null;
var camOffset = 0;
var dragAngleX = 0;
var dragAngleY = 0;

function disposeAll() {
  if (terrain) {
    terrain.geometry.dispose();
    terrain.material.dispose();
    terrain = null;
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
  scene.background = new THREE.Color(0x0a0a1a);
  scene.fog = new THREE.Fog(0x0a0a1a, 30, 80);

  camera = new THREE.PerspectiveCamera(60, rW / rH, 0.1, 200);
  camera.position.set(0, 8, 0);
  camera.lookAt(0, 3, 20);

  // Terrain plane
  var planeW = 120;
  var planeD = 120;
  var segW = 100;
  var segD = 100;
  var geo = new THREE.PlaneGeometry(planeW, planeD, segW, segD);
  geo.rotateX(-Math.PI / 2);

  // Vertex displacement and coloring
  var positions = geo.attributes.position;
  var colors = new Float32Array(positions.count * 3);

  for (var i = 0; i < positions.count; i++) {
    var x = positions.getX(i);
    var z = positions.getZ(i);
    var h = getHeight(x, z, 0);
    positions.setY(i, h);

    var c = heightColor(h);
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  var mat = new THREE.MeshBasicMaterial({ vertexColors: true });
  terrain = new THREE.Mesh(geo, mat);
  scene.add(terrain);

  // Ambient light
  var light = new THREE.AmbientLight(0xffffff, 1);
  scene.add(light);
}

function getHeight(x, z, offset) {
  var zo = z + offset;
  var h = Math.sin(x * 0.08) * 3 +
          Math.sin(zo * 0.06) * 4 +
          Math.sin(x * 0.15 + zo * 0.1) * 2 +
          Math.cos(x * 0.05 - zo * 0.08) * 2.5 +
          Math.sin(x * 0.2 + zo * 0.25) * 1;
  return h;
}

function heightColor(h) {
  // blue=low/water, green=mid, brown=high, white=peaks
  if (h < -3) return [0.1, 0.2, 0.6]; // deep water
  if (h < -1) return [0.15, 0.35, 0.55]; // shallow water
  if (h < 1) return [0.2, 0.5, 0.15]; // lowland green
  if (h < 3) return [0.3, 0.55, 0.1]; // grass
  if (h < 5) return [0.45, 0.35, 0.15]; // brown hills
  if (h < 7) return [0.55, 0.4, 0.2]; // mountain
  return [0.85, 0.85, 0.9]; // snow peaks
}

function initThreeterrain() {
  camOffset = 0;
  dragAngleX = 0;
  dragAngleY = 0;
  setupScene();
}

function renderThreeterrain() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (!renderer) {
    return;
  }

  // Drag to adjust camera angle
  if (pointer.down && state.currentMode === 'threeterrain') {
    dragAngleX = (pointer.gx / W - 0.5) * 1.5;
    dragAngleY = (pointer.gy / H - 0.5) * 1.0;
  }

  // Move camera forward
  camOffset += 0.08;

  // Update terrain heights with offset for scrolling effect
  var positions = terrain.geometry.attributes.position;
  var colors = terrain.geometry.attributes.color;
  for (var i = 0; i < positions.count; i++) {
    var x = positions.getX(i);
    var z = positions.getZ(i);
    var h = getHeight(x, z, camOffset * 10);
    positions.setY(i, h);
    var c = heightColor(h);
    colors.array[i * 3] = c[0];
    colors.array[i * 3 + 1] = c[1];
    colors.array[i * 3 + 2] = c[2];
  }
  positions.needsUpdate = true;
  colors.needsUpdate = true;
  terrain.geometry.computeVertexNormals();

  // Camera
  camera.position.set(dragAngleX * 10, 8 + dragAngleY * 5, 0);
  camera.lookAt(dragAngleX * 5, 3 + dragAngleY * 3, 20);

  // Render
  var rW = renderer.domElement.width;
  var rH = renderer.domElement.height;
  renderer.render(scene, camera);
  readCtx.drawImage(renderer.domElement, 0, 0, rW, rH);
  var imgData = readCtx.getImageData(0, 0, rW, rH).data;

  // Convert to ASCII
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
      if (lum < 0.03) continue;
      var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
      var ch = RAMP_DENSE[ci];
      var alpha = Math.max(0.25, Math.min(1, lum * 1.4));
      drawChar(ch, x, y, r, g, b, alpha);
    }
  }

  // Label
  var label = '[threeterrain]';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 30);
  }
}

registerMode('threeterrain', { init: initThreeterrain, render: renderThreeterrain, cleanup: disposeAll });
