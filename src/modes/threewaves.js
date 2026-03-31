import * as THREE from 'three';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Three Waves — 3D wave mesh with interference patterns and dynamic lighting
var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var waveMesh = null;
var waveSources = [];
var wavePointLights = [];
var maxSources = 8;
var camTheta = 0.3;
var camPhi = 0.6;
var camDist = 30;
var baseCamTheta = 0.3;
var baseCamPhi = 0.6;
var gridSegments = 80;

function disposeAll() {
  if (waveMesh) { waveMesh.geometry.dispose(); waveMesh.material.dispose(); waveMesh = null; }
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
  waveSources = [];
  wavePointLights = [];
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
  scene.background = new THREE.Color(0x040410);

  camera = new THREE.PerspectiveCamera(60, rW / rH, 0.1, 200);

  var ambient = new THREE.AmbientLight(0x223344, 0.3);
  scene.add(ambient);
  var dirLight = new THREE.DirectionalLight(0x6688cc, 0.5);
  dirLight.position.set(0, 20, 10);
  scene.add(dirLight);

  // Dynamic point lights
  wavePointLights = [];
  for (var l = 0; l < 3; l++) {
    var hue = l / 3;
    var col = new THREE.Color().setHSL(hue * 0.3 + 0.5, 0.8, 0.6);
    var pl = new THREE.PointLight(col, 0.8, 25);
    pl.position.set(0, 3, 0);
    scene.add(pl);
    wavePointLights.push(pl);
  }

  // Wave mesh
  var planeGeo = new THREE.PlaneGeometry(40, 40, gridSegments, gridSegments);
  planeGeo.rotateX(-Math.PI / 2);

  var planeMat = new THREE.MeshPhongMaterial({
    color: 0x4488cc,
    shininess: 60,
    side: THREE.DoubleSide,
    flatShading: false,
    vertexColors: true
  });

  var vertCount = planeGeo.attributes.position.count;
  var colArray = new Float32Array(vertCount * 3);
  for (var i = 0; i < vertCount; i++) {
    colArray[i * 3] = 0.2; colArray[i * 3 + 1] = 0.5; colArray[i * 3 + 2] = 0.9;
  }
  planeGeo.setAttribute('color', new THREE.BufferAttribute(colArray, 3));

  waveMesh = new THREE.Mesh(planeGeo, planeMat);
  scene.add(waveMesh);

  // Initial wave sources
  waveSources = [
    { x: 0, z: 0, freq: 2.0, amp: 2.0, phase: 0 },
    { x: -10, z: -10, freq: 3.0, amp: 1.5, phase: 1.5 },
    { x: 10, z: 5, freq: 2.5, amp: 1.8, phase: 3.0 }
  ];

  camTheta = 0.3; camPhi = 0.6;
}

function initThreewaves() {
  camTheta = 0.3; camPhi = 0.6;
  baseCamTheta = 0.3; baseCamPhi = 0.6;
  setupScene();
}

function renderThreewaves() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer || !waveMesh) return;

  // Click to add a wave source
  if (pointer.clicked && state.currentMode === 'threewaves') {
    pointer.clicked = false;
    var nx = (pointer.gx / W - 0.5) * 40;
    var nz = (pointer.gy / H - 0.5) * 40;
    if (waveSources.length >= maxSources) {
      waveSources.shift();
    }
    waveSources.push({
      x: nx,
      z: nz,
      freq: 1.5 + Math.random() * 3,
      amp: 1.0 + Math.random() * 2,
      phase: t * 2
    });
  }

  // Drag to rotate camera
  if (pointer.down && state.currentMode === 'threewaves') {
    camTheta = baseCamTheta + (pointer.gx / W - 0.5) * Math.PI * 2;
    camPhi = baseCamPhi + (pointer.gy / H - 0.5) * Math.PI * 0.8;
  } else {
    baseCamTheta = camTheta;
    baseCamPhi = camPhi;
    camTheta += 0.002;
  }
  camPhi = Math.max(0.15, Math.min(Math.PI * 0.45, camPhi));

  camera.position.set(
    camDist * Math.sin(camPhi) * Math.cos(camTheta),
    camDist * Math.cos(camPhi),
    camDist * Math.sin(camPhi) * Math.sin(camTheta)
  );
  camera.lookAt(0, 0, 0);

  // Update wave mesh vertices
  var positions = waveMesh.geometry.attributes.position.array;
  var colors = waveMesh.geometry.attributes.color.array;
  var vertCount = waveMesh.geometry.attributes.position.count;

  for (var i = 0; i < vertCount; i++) {
    var i3 = i * 3;
    var vx = positions[i3];
    var vz = positions[i3 + 2];

    var height = 0;
    for (var s = 0; s < waveSources.length; s++) {
      var src = waveSources[s];
      var dx = vx - src.x;
      var dz = vz - src.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      height += src.amp * Math.sin(dist * src.freq * 0.3 - t * 2 + src.phase) / (1 + dist * 0.1);
    }

    positions[i3 + 1] = height;

    var normalizedH = (height + 4) / 8;
    normalizedH = Math.max(0, Math.min(1, normalizedH));
    var hue = 0.55 + (1 - normalizedH) * 0.1;
    var lightness = 0.2 + normalizedH * 0.55;
    var saturation = 0.7 + normalizedH * 0.3;
    var col = new THREE.Color().setHSL(hue, saturation, lightness);
    colors[i3] = col.r; colors[i3 + 1] = col.g; colors[i3 + 2] = col.b;
  }

  waveMesh.geometry.attributes.position.needsUpdate = true;
  waveMesh.geometry.attributes.color.needsUpdate = true;
  waveMesh.geometry.computeVertexNormals();

  // Move point lights with wave peaks
  for (var l = 0; l < wavePointLights.length; l++) {
    var angle = t * 0.5 + l * Math.PI * 2 / 3;
    var lx = Math.cos(angle) * 12;
    var lz = Math.sin(angle) * 12;
    var lh = 0;
    for (var s = 0; s < waveSources.length; s++) {
      var src = waveSources[s];
      var dx = lx - src.x, dz = lz - src.z;
      var dist = Math.sqrt(dx * dx + dz * dz);
      lh += src.amp * Math.sin(dist * src.freq * 0.3 - t * 2 + src.phase) / (1 + dist * 0.1);
    }
    wavePointLights[l].position.set(lx, lh + 3, lz);
  }

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

  var label = '[threewaves] click:add-wave drag:rotate';
  var lx2 = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx2 + li, H - 1, 0, 0, 25);
  }
}

registerMode('threewaves', { init: initThreewaves, render: renderThreewaves, cleanup: disposeAll });
