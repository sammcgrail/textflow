import * as THREE from 'three';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Three Particles — 3D particle storm with attractors, rendered to ASCII
// Click to create explosion, drag to rotate camera
var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var particles = null;
var particleCount = 3000;
var velocities = null;
var attractors = [];
var camTheta = 0;
var camPhi = 0.5;
var camDist = 25;
var dragStartX = 0;
var dragStartY = 0;
var baseCamTheta = 0;
var baseCamPhi = 0.5;

function disposeAll() {
  if (particles) {
    particles.geometry.dispose();
    particles.material.dispose();
    particles = null;
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
  velocities = null;
  attractors = [];
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
  scene.background = new THREE.Color(0x0a0a12);

  camera = new THREE.PerspectiveCamera(60, rW / rH, 0.1, 200);

  // Attractors
  attractors = [
    { x: 5, y: 0, z: 0, strength: 0.02 },
    { x: -5, y: 3, z: -3, strength: 0.015 },
    { x: 0, y: -4, z: 5, strength: 0.018 },
    { x: -3, y: 2, z: -5, strength: 0.012 }
  ];

  // Create particles
  var geo = new THREE.BufferGeometry();
  var positions = new Float32Array(particleCount * 3);
  var colors = new Float32Array(particleCount * 3);
  velocities = new Float32Array(particleCount * 3);

  for (var i = 0; i < particleCount; i++) {
    var i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 20;
    positions[i3 + 1] = (Math.random() - 0.5) * 20;
    positions[i3 + 2] = (Math.random() - 0.5) * 20;
    velocities[i3] = (Math.random() - 0.5) * 0.1;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;
    colors[i3] = 0.5;
    colors[i3 + 1] = 0.8;
    colors[i3 + 2] = 1.0;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  var mat = new THREE.PointsMaterial({
    size: 2,
    vertexColors: true,
    sizeAttenuation: true
  });

  particles = new THREE.Points(geo, mat);
  scene.add(particles);

  camTheta = 0;
  camPhi = 0.5;
}

function initThreeparticles() {
  camTheta = 0;
  camPhi = 0.5;
  baseCamTheta = 0;
  baseCamPhi = 0.5;
  setupScene();
}

function renderThreeparticles() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (!renderer) {
    return;
  }

  // Click to explode particles
  if (pointer.clicked && state.currentMode === 'threeparticles') {
    pointer.clicked = false;
    var positions = particles.geometry.attributes.position.array;
    for (var i = 0; i < particleCount; i++) {
      var i3 = i * 3;
      var dx = positions[i3];
      var dy = positions[i3 + 1];
      var dz = positions[i3 + 2];
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
      velocities[i3] += (dx / dist) * 0.8;
      velocities[i3 + 1] += (dy / dist) * 0.8;
      velocities[i3 + 2] += (dz / dist) * 0.8;
    }
  }

  // Drag to rotate camera
  if (pointer.down && state.currentMode === 'threeparticles') {
    camTheta = baseCamTheta + (pointer.gx / W - 0.5) * Math.PI * 2;
    camPhi = baseCamPhi + (pointer.gy / H - 0.5) * Math.PI * 0.8;
  } else {
    baseCamTheta = camTheta;
    baseCamPhi = camPhi;
    // Slow auto-rotate
    camTheta += 0.003;
  }

  camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, camPhi));

  // Update camera
  camera.position.set(
    camDist * Math.sin(camPhi) * Math.cos(camTheta),
    camDist * Math.cos(camPhi),
    camDist * Math.sin(camPhi) * Math.sin(camTheta)
  );
  camera.lookAt(0, 0, 0);

  // Update attractor positions (orbit slowly)
  for (var a = 0; a < attractors.length; a++) {
    var att = attractors[a];
    var angle = t * 0.3 + a * Math.PI * 0.5;
    att.x = Math.sin(angle) * (5 + a * 2);
    att.y = Math.cos(angle * 0.7) * 3;
    att.z = Math.cos(angle) * (5 + a * 2);
  }

  // Update particles
  var positions = particles.geometry.attributes.position.array;
  var colors = particles.geometry.attributes.color.array;

  for (var i = 0; i < particleCount; i++) {
    var i3 = i * 3;
    var px = positions[i3];
    var py = positions[i3 + 1];
    var pz = positions[i3 + 2];

    // Attraction forces
    for (var a = 0; a < attractors.length; a++) {
      var att = attractors[a];
      var dx = att.x - px;
      var dy = att.y - py;
      var dz = att.z - pz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.5;
      var force = att.strength / dist;
      velocities[i3] += dx * force;
      velocities[i3 + 1] += dy * force;
      velocities[i3 + 2] += dz * force;
    }

    // Damping
    velocities[i3] *= 0.98;
    velocities[i3 + 1] *= 0.98;
    velocities[i3 + 2] *= 0.98;

    // Update position
    positions[i3] += velocities[i3];
    positions[i3 + 1] += velocities[i3 + 1];
    positions[i3 + 2] += velocities[i3 + 2];

    // Bound check
    if (Math.abs(positions[i3]) > 30 || Math.abs(positions[i3 + 1]) > 30 || Math.abs(positions[i3 + 2]) > 30) {
      positions[i3] = (Math.random() - 0.5) * 10;
      positions[i3 + 1] = (Math.random() - 0.5) * 10;
      positions[i3 + 2] = (Math.random() - 0.5) * 10;
      velocities[i3] = 0;
      velocities[i3 + 1] = 0;
      velocities[i3 + 2] = 0;
    }

    // Color by velocity
    var vel = Math.sqrt(velocities[i3] * velocities[i3] + velocities[i3 + 1] * velocities[i3 + 1] + velocities[i3 + 2] * velocities[i3 + 2]);
    var hue = (vel * 5 + t * 0.2) % 1;
    var col = new THREE.Color().setHSL(hue, 0.9, 0.3 + vel * 2);
    colors[i3] = col.r;
    colors[i3 + 1] = col.g;
    colors[i3 + 2] = col.b;
  }

  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;

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

  var label = '[threeparticles] click:explode drag:rotate';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 25);
  }
}

registerMode('threeparticles', { init: initThreeparticles, render: renderThreeparticles, cleanup: disposeAll });
