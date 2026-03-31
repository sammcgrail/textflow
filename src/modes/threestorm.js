import * as THREE from 'three';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Three Storm — Epic 6000-particle storm with 6 attractors, trails, and shockwave
var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var particles = null;
var trails = null;
var particleCount = 6000;
var velocities = null;
var prevPositions = null;
var attractors = [];
var camTheta = 0;
var camPhi = 0.5;
var camDist = 30;
var baseCamTheta = 0;
var baseCamPhi = 0.5;
var pointLights = [];

function disposeAll() {
  if (particles) {
    particles.geometry.dispose();
    particles.material.dispose();
    particles = null;
  }
  if (trails) {
    trails.geometry.dispose();
    trails.material.dispose();
    trails = null;
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
  prevPositions = null;
  attractors = [];
  pointLights = [];
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
  scene.background = new THREE.Color(0x050510);

  camera = new THREE.PerspectiveCamera(60, rW / rH, 0.1, 200);

  // Ambient light
  var ambient = new THREE.AmbientLight(0x222244, 0.3);
  scene.add(ambient);

  // 6 attractors with varying strengths
  attractors = [
    { x: 6, y: 0, z: 0, strength: 0.025 },
    { x: -6, y: 3, z: -3, strength: 0.018 },
    { x: 0, y: -5, z: 6, strength: 0.022 },
    { x: -4, y: 2, z: -6, strength: 0.015 },
    { x: 3, y: -3, z: 4, strength: 0.020 },
    { x: -2, y: 5, z: -2, strength: 0.017 }
  ];

  // Point lights at attractor positions
  pointLights = [];
  for (var a = 0; a < attractors.length; a++) {
    var hue = a / attractors.length;
    var col = new THREE.Color().setHSL(hue, 1.0, 0.6);
    var pl = new THREE.PointLight(col, 0.8, 20);
    pl.position.set(attractors[a].x, attractors[a].y, attractors[a].z);
    scene.add(pl);
    pointLights.push(pl);
  }

  // Create particles
  var geo = new THREE.BufferGeometry();
  var positions = new Float32Array(particleCount * 3);
  var colors = new Float32Array(particleCount * 3);
  velocities = new Float32Array(particleCount * 3);
  prevPositions = new Float32Array(particleCount * 3);

  for (var i = 0; i < particleCount; i++) {
    var i3 = i * 3;
    positions[i3] = (Math.random() - 0.5) * 24;
    positions[i3 + 1] = (Math.random() - 0.5) * 24;
    positions[i3 + 2] = (Math.random() - 0.5) * 24;
    prevPositions[i3] = positions[i3];
    prevPositions[i3 + 1] = positions[i3 + 1];
    prevPositions[i3 + 2] = positions[i3 + 2];
    velocities[i3] = (Math.random() - 0.5) * 0.1;
    velocities[i3 + 1] = (Math.random() - 0.5) * 0.1;
    velocities[i3 + 2] = (Math.random() - 0.5) * 0.1;
    colors[i3] = 0.6; colors[i3 + 1] = 0.8; colors[i3 + 2] = 1.0;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  var mat = new THREE.PointsMaterial({ size: 2.5, vertexColors: true, sizeAttenuation: true });
  particles = new THREE.Points(geo, mat);
  scene.add(particles);

  // Trail line segments
  var trailGeo = new THREE.BufferGeometry();
  var trailPos = new Float32Array(particleCount * 2 * 3);
  var trailCol = new Float32Array(particleCount * 2 * 3);
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailCol, 3));
  var trailMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.5 });
  trails = new THREE.LineSegments(trailGeo, trailMat);
  scene.add(trails);

  camTheta = 0; camPhi = 0.5;
}

function initThreestorm() {
  camTheta = 0; camPhi = 0.5;
  baseCamTheta = 0; baseCamPhi = 0.5;
  setupScene();
}

function renderThreestorm() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer) return;

  // Click to create shockwave
  if (pointer.clicked && state.currentMode === 'threestorm') {
    pointer.clicked = false;
    var positions = particles.geometry.attributes.position.array;
    for (var i = 0; i < particleCount; i++) {
      var i3 = i * 3;
      var dx = positions[i3], dy = positions[i3 + 1], dz = positions[i3 + 2];
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
      velocities[i3] += (dx / dist) * 1.2;
      velocities[i3 + 1] += (dy / dist) * 1.2;
      velocities[i3 + 2] += (dz / dist) * 1.2;
    }
  }

  // Drag to rotate camera
  if (pointer.down && state.currentMode === 'threestorm') {
    camTheta = baseCamTheta + (pointer.gx / W - 0.5) * Math.PI * 2;
    camPhi = baseCamPhi + (pointer.gy / H - 0.5) * Math.PI * 0.8;
  } else {
    baseCamTheta = camTheta;
    baseCamPhi = camPhi;
    camTheta += 0.003;
  }
  camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, camPhi));

  camera.position.set(
    camDist * Math.sin(camPhi) * Math.cos(camTheta),
    camDist * Math.cos(camPhi),
    camDist * Math.sin(camPhi) * Math.sin(camTheta)
  );
  camera.lookAt(0, 0, 0);

  // Update attractor positions
  for (var a = 0; a < attractors.length; a++) {
    var att = attractors[a];
    var angle = t * 0.25 + a * Math.PI / 3;
    att.x = Math.sin(angle) * (5 + a * 1.5);
    att.y = Math.cos(angle * 0.6 + a) * 4;
    att.z = Math.cos(angle) * (5 + a * 1.5);
    if (pointLights[a]) {
      pointLights[a].position.set(att.x, att.y, att.z);
    }
  }

  // Update particles
  var positions = particles.geometry.attributes.position.array;
  var colors = particles.geometry.attributes.color.array;
  var trailPos = trails.geometry.attributes.position.array;
  var trailCol = trails.geometry.attributes.color.array;

  for (var i = 0; i < particleCount; i++) {
    var i3 = i * 3;
    var px = positions[i3], py = positions[i3 + 1], pz = positions[i3 + 2];

    // Save previous position for trail
    prevPositions[i3] = px;
    prevPositions[i3 + 1] = py;
    prevPositions[i3 + 2] = pz;

    // Attraction forces
    for (var a = 0; a < attractors.length; a++) {
      var att = attractors[a];
      var dx = att.x - px, dy = att.y - py, dz = att.z - pz;
      var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.5;
      var force = att.strength / dist;
      velocities[i3] += dx * force;
      velocities[i3 + 1] += dy * force;
      velocities[i3 + 2] += dz * force;
    }

    velocities[i3] *= 0.97;
    velocities[i3 + 1] *= 0.97;
    velocities[i3 + 2] *= 0.97;

    positions[i3] += velocities[i3];
    positions[i3 + 1] += velocities[i3 + 1];
    positions[i3 + 2] += velocities[i3 + 2];

    if (Math.abs(positions[i3]) > 35 || Math.abs(positions[i3 + 1]) > 35 || Math.abs(positions[i3 + 2]) > 35) {
      positions[i3] = (Math.random() - 0.5) * 12;
      positions[i3 + 1] = (Math.random() - 0.5) * 12;
      positions[i3 + 2] = (Math.random() - 0.5) * 12;
      velocities[i3] = 0; velocities[i3 + 1] = 0; velocities[i3 + 2] = 0;
    }

    // Color by velocity AND distance from center
    var vel = Math.sqrt(velocities[i3] * velocities[i3] + velocities[i3 + 1] * velocities[i3 + 1] + velocities[i3 + 2] * velocities[i3 + 2]);
    var distFromCenter = Math.sqrt(positions[i3] * positions[i3] + positions[i3 + 1] * positions[i3 + 1] + positions[i3 + 2] * positions[i3 + 2]);
    var hue = (vel * 3 + distFromCenter * 0.05 + t * 0.15) % 1;
    var lightness = Math.min(0.7, 0.4 + vel * 1.5);
    var col = new THREE.Color().setHSL(hue, 1.0, lightness);
    colors[i3] = col.r; colors[i3 + 1] = col.g; colors[i3 + 2] = col.b;

    // Trail segments
    var ti = i * 6;
    trailPos[ti] = prevPositions[i3]; trailPos[ti + 1] = prevPositions[i3 + 1]; trailPos[ti + 2] = prevPositions[i3 + 2];
    trailPos[ti + 3] = positions[i3]; trailPos[ti + 4] = positions[i3 + 1]; trailPos[ti + 5] = positions[i3 + 2];
    trailCol[ti] = col.r * 0.3; trailCol[ti + 1] = col.g * 0.3; trailCol[ti + 2] = col.b * 0.3;
    trailCol[ti + 3] = col.r; trailCol[ti + 4] = col.g; trailCol[ti + 5] = col.b;
  }

  particles.geometry.attributes.position.needsUpdate = true;
  particles.geometry.attributes.color.needsUpdate = true;
  trails.geometry.attributes.position.needsUpdate = true;
  trails.geometry.attributes.color.needsUpdate = true;

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

  var label = '[threestorm] click:shockwave drag:rotate';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 25);
  }
}

registerMode('threestorm', { init: initThreestorm, render: renderThreestorm, cleanup: disposeAll });
