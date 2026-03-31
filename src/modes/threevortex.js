import * as THREE from 'three';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Three Vortex — Spiraling double helix vortex with glowing core
var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var particles = null;
var particleCount = 4000;
var particleData = null;
var coreMesh = null;
var vortexDirection = 1;
var camTheta = 0;
var camPhi = 0.6;
var camDist = 28;
var baseCamTheta = 0;
var baseCamPhi = 0.6;

function disposeAll() {
  if (particles) { particles.geometry.dispose(); particles.material.dispose(); particles = null; }
  if (coreMesh) { coreMesh.geometry.dispose(); coreMesh.material.dispose(); coreMesh = null; }
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
  particleData = null;
  camera = null;
  if (renderer) { renderer.dispose(); renderer = null; }
  readCanvas = null; readCtx = null;
}

function setupScene() {
  var W = state.COLS, H = state.ROWS;
  var rW = W * 2, rH = H * 2;
  disposeAll();

  renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(rW, rH);
  renderer.domElement.style.display = 'none';

  readCanvas = document.createElement('canvas');
  readCanvas.width = rW; readCanvas.height = rH;
  readCtx = readCanvas.getContext('2d', { willReadFrequently: true });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060612);

  camera = new THREE.PerspectiveCamera(60, rW / rH, 0.1, 200);

  // Glowing core
  var coreGeo = new THREE.SphereGeometry(1.2, 16, 16);
  var coreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  coreMesh = new THREE.Mesh(coreGeo, coreMat);
  scene.add(coreMesh);

  var coreLight = new THREE.PointLight(0xaaddff, 2, 30);
  coreLight.position.set(0, 0, 0);
  scene.add(coreLight);

  var ambient = new THREE.AmbientLight(0x111133, 0.2);
  scene.add(ambient);

  // Create particles in vortex arrangement
  var geo = new THREE.BufferGeometry();
  var positions = new Float32Array(particleCount * 3);
  var colors = new Float32Array(particleCount * 3);
  particleData = new Float32Array(particleCount * 4); // angle, radius, height, speed

  for (var i = 0; i < particleCount; i++) {
    var i3 = i * 3;
    var i4 = i * 4;
    var angle = Math.random() * Math.PI * 8;
    var radius = 2 + Math.random() * 12;
    var height = (Math.random() - 0.5) * 20;
    var speed = 0.3 + Math.random() * 0.7;

    particleData[i4] = angle;
    particleData[i4 + 1] = radius;
    particleData[i4 + 2] = height;
    particleData[i4 + 3] = speed;

    positions[i3] = Math.cos(angle) * radius;
    positions[i3 + 1] = height;
    positions[i3 + 2] = Math.sin(angle) * radius;

    colors[i3] = 0.5; colors[i3 + 1] = 0.7; colors[i3 + 2] = 1.0;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  var mat = new THREE.PointsMaterial({ size: 2, vertexColors: true, sizeAttenuation: true });
  particles = new THREE.Points(geo, mat);
  scene.add(particles);

  camTheta = 0; camPhi = 0.6;
  vortexDirection = 1;
}

function initThreevortex() {
  camTheta = 0; camPhi = 0.6;
  baseCamTheta = 0; baseCamPhi = 0.6;
  setupScene();
}

function renderThreevortex() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer) return;

  // Click to reverse vortex direction
  if (pointer.clicked && state.currentMode === 'threevortex') {
    pointer.clicked = false;
    vortexDirection *= -1;
  }

  // Drag to change viewing angle
  if (pointer.down && state.currentMode === 'threevortex') {
    camTheta = baseCamTheta + (pointer.gx / W - 0.5) * Math.PI * 2;
    camPhi = baseCamPhi + (pointer.gy / H - 0.5) * Math.PI * 0.8;
  } else {
    baseCamTheta = camTheta;
    baseCamPhi = camPhi;
    camTheta += 0.004;
  }
  camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, camPhi));

  camera.position.set(
    camDist * Math.sin(camPhi) * Math.cos(camTheta),
    camDist * Math.cos(camPhi),
    camDist * Math.sin(camPhi) * Math.sin(camTheta)
  );
  camera.lookAt(0, 0, 0);

  // Pulse the vortex radius
  var breathe = 1 + 0.15 * Math.sin(t * 0.4);

  // Update core glow
  if (coreMesh) {
    var coreScale = 1 + 0.3 * Math.sin(t * 0.8);
    coreMesh.scale.set(coreScale, coreScale, coreScale);
    var coreHue = (t * 0.05) % 1;
    coreMesh.material.color.setHSL(coreHue, 0.5, 0.8);
  }

  // Update particles
  var positions = particles.geometry.attributes.position.array;
  var colors = particles.geometry.attributes.color.array;

  for (var i = 0; i < particleCount; i++) {
    var i3 = i * 3;
    var i4 = i * 4;

    // Update angle (spiral)
    particleData[i4] += particleData[i4 + 3] * 0.02;

    // Move radius inward or outward
    particleData[i4 + 1] += vortexDirection * -0.02 * particleData[i4 + 3];

    // When particles reach center, shoot them up/down axis
    if (particleData[i4 + 1] < 0.5) {
      particleData[i4 + 2] += (particleData[i4 + 2] > 0 ? 1 : -1) * 0.15;
      particleData[i4 + 1] = 0.5;
      if (Math.abs(particleData[i4 + 2]) > 15) {
        particleData[i4 + 1] = 3 + Math.random() * 10;
        particleData[i4 + 2] = (Math.random() - 0.5) * 10;
      }
    }
    if (particleData[i4 + 1] > 15) {
      particleData[i4 + 1] = 1 + Math.random() * 3;
      particleData[i4 + 2] = (Math.random() - 0.5) * 6;
    }

    var angle = particleData[i4];
    var radius = particleData[i4 + 1] * breathe;
    var height = particleData[i4 + 2];

    positions[i3] = Math.cos(angle) * radius;
    positions[i3 + 1] = height;
    positions[i3 + 2] = Math.sin(angle) * radius;

    // Color by revolution
    var revolutions = angle / (Math.PI * 2);
    var hue = (revolutions * 0.15 + t * 0.05) % 1;
    var lightness = Math.min(0.7, 0.4 + (1 - radius / 15) * 0.3);
    var col = new THREE.Color().setHSL(hue, 1.0, lightness);
    colors[i3] = col.r; colors[i3 + 1] = col.g; colors[i3 + 2] = col.b;
  }

  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;

  var rW = renderer.domElement.width, rH = renderer.domElement.height;
  renderer.render(scene, camera);
  readCtx.drawImage(renderer.domElement, 0, 0, rW, rH);
  var imgData = readCtx.getImageData(0, 0, rW, rH).data;
  var scaleX = rW / W, scaleY = rH / H;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var sx = Math.floor(x * scaleX), sy = Math.floor(y * scaleY);
      var pi = (sy * rW + sx) * 4;
      var r = imgData[pi], g = imgData[pi + 1], b = imgData[pi + 2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      if (lum < 0.02) continue;
      var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
      drawChar(RAMP_DENSE[ci], x, y, r, g, b, Math.max(0.2, Math.min(1, lum * 1.5)));
    }
  }

  var label = '[threevortex] click:reverse drag:rotate';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 25);
  }
}

registerMode('threevortex', { init: initThreevortex, render: renderThreevortex, cleanup: disposeAll });
