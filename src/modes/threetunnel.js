import * as THREE from 'three';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Three Tunnel — infinite neon tunnel flythrough rendered to ASCII
// Speed increases over time, pulsing neon colors
var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var tunnelRings = [];
var debris = [];
var speed = 0;
var distance = 0;

function disposeAll() {
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
  tunnelRings = [];
  debris = [];
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
  scene.background = new THREE.Color(0x050510);

  camera = new THREE.PerspectiveCamera(75, rW / rH, 0.1, 300);
  camera.position.set(0, 0, 0);
  camera.lookAt(0, 0, 10);

  // Create tunnel rings
  tunnelRings = [];
  for (var i = 0; i < 60; i++) {
    var ring = createRing(i * 5);
    tunnelRings.push(ring);
    scene.add(ring);
  }

  // Create floating debris
  debris = [];
  for (var d = 0; d < 30; d++) {
    var geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    var mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color().setHSL(Math.random(), 1, 0.5),
      wireframe: true
    });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (Math.random() - 0.5) * 6,
      (Math.random() - 0.5) * 6,
      Math.random() * 300
    );
    mesh.userData.rotSpeed = (Math.random() - 0.5) * 0.1;
    debris.push(mesh);
    scene.add(mesh);
  }

  speed = 0.3;
  distance = 0;
}

function createRing(z) {
  var ringGeo = new THREE.TorusGeometry(5, 0.15, 6, 24);
  var hue = (z * 0.05) % 1;
  var ringMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHSL(hue, 1, 0.4),
    wireframe: true
  });
  var ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(0, 0, z);
  ring.userData.baseZ = z;
  return ring;
}

function initThreetunnel() {
  speed = 0.3;
  distance = 0;
  setupScene();
}

function renderThreetunnel() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (!renderer) {
    return;
  }

  // Increase speed gradually
  speed = 0.3 + t * 0.02;
  if (speed > 3) speed = 3;
  distance += speed * 0.16;

  // Camera wobble
  var wobbleX = Math.sin(t * 0.7) * 0.5;
  var wobbleY = Math.cos(t * 0.5) * 0.3;

  if (pointer.down && state.currentMode === 'threetunnel') {
    wobbleX += (pointer.gx / W - 0.5) * 3;
    wobbleY += (pointer.gy / H - 0.5) * 2;
  }

  camera.position.set(wobbleX, wobbleY, distance);
  camera.lookAt(wobbleX * 0.5, wobbleY * 0.5, distance + 20);

  // Update rings — recycle ones behind camera
  var totalLen = 60 * 5;
  for (var i = 0; i < tunnelRings.length; i++) {
    var ring = tunnelRings[i];
    var relZ = ring.position.z - distance;

    if (relZ < -10) {
      ring.position.z += totalLen;
    }

    // Pulse ring color
    var hue = ((ring.position.z * 0.02 + t * 0.3) % 1 + 1) % 1;
    var pulse = 0.3 + Math.sin(t * 3 + ring.position.z * 0.1) * 0.2;
    ring.material.color.setHSL(hue, 1, pulse);

    // Slight ring rotation
    ring.rotation.z = t * 0.3 + ring.position.z * 0.02;

    // Warp — vary ring scale for trippy effect
    var warpScale = 1 + Math.sin(t * 2 + ring.position.z * 0.05) * 0.3;
    ring.scale.set(warpScale, warpScale, 1);
  }

  // Update debris
  for (var d = 0; d < debris.length; d++) {
    var obj = debris[d];
    var relZ = obj.position.z - distance;
    if (relZ < -5) {
      obj.position.z += 300;
      obj.position.x = (Math.random() - 0.5) * 6;
      obj.position.y = (Math.random() - 0.5) * 6;
    }
    obj.rotation.x += obj.userData.rotSpeed;
    obj.rotation.y += obj.userData.rotSpeed * 0.7;
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
      var alpha = Math.max(0.2, Math.min(1, lum * 1.5));
      drawChar(ch, x, y, r, g, b, alpha);
    }
  }

  var label = '[threetunnel]';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 30);
  }
}

registerMode('threetunnel', { init: initThreetunnel, render: renderThreetunnel, cleanup: disposeAll });
