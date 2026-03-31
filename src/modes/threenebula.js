import * as THREE from 'three';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Three Nebula — Cosmic gas cloud with additive blending and star particles
var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var gasParticles = null;
var starParticles = null;
var gasCount = 5000;
var starCount = 200;
var clusters = [];
var maxClusters = 6;
var camTheta = 0;
var camPhi = 0.7;
var camDist = 35;
var baseCamTheta = 0;
var baseCamPhi = 0.7;

function disposeAll() {
  if (gasParticles) { gasParticles.geometry.dispose(); gasParticles.material.dispose(); gasParticles = null; }
  if (starParticles) { starParticles.geometry.dispose(); starParticles.material.dispose(); starParticles = null; }
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
  clusters = [];
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
  scene.background = new THREE.Color(0x020208);

  camera = new THREE.PerspectiveCamera(60, rW / rH, 0.1, 300);

  // Initial clusters
  clusters = [];
  for (var c = 0; c < 4; c++) {
    clusters.push({
      x: (Math.random() - 0.5) * 20,
      y: (Math.random() - 0.5) * 15,
      z: (Math.random() - 0.5) * 20,
      radius: 4 + Math.random() * 6,
      hue: Math.random(),
      orbitAngle: Math.random() * Math.PI * 2,
      orbitSpeed: 0.1 + Math.random() * 0.2,
      orbitRadius: 3 + Math.random() * 8
    });
  }

  // Gas particles
  var gasGeo = new THREE.BufferGeometry();
  var gasPos = new Float32Array(gasCount * 3);
  var gasCol = new Float32Array(gasCount * 3);

  for (var i = 0; i < gasCount; i++) {
    var ci = i % clusters.length;
    var cl = clusters[ci];
    var i3 = i * 3;
    gasPos[i3] = cl.x + (Math.random() - 0.5) * cl.radius * 2;
    gasPos[i3 + 1] = cl.y + (Math.random() - 0.5) * cl.radius * 2;
    gasPos[i3 + 2] = cl.z + (Math.random() - 0.5) * cl.radius * 2;
    gasCol[i3] = 0.5; gasCol[i3 + 1] = 0.3; gasCol[i3 + 2] = 0.8;
  }

  gasGeo.setAttribute('position', new THREE.BufferAttribute(gasPos, 3));
  gasGeo.setAttribute('color', new THREE.BufferAttribute(gasCol, 3));

  var gasMat = new THREE.PointsMaterial({
    size: 3,
    vertexColors: true,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.6,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  gasParticles = new THREE.Points(gasGeo, gasMat);
  scene.add(gasParticles);

  // Star particles
  var starGeo = new THREE.BufferGeometry();
  var starPos = new Float32Array(starCount * 3);
  var starCol = new Float32Array(starCount * 3);

  for (var i = 0; i < starCount; i++) {
    var i3 = i * 3;
    starPos[i3] = (Math.random() - 0.5) * 60;
    starPos[i3 + 1] = (Math.random() - 0.5) * 60;
    starPos[i3 + 2] = (Math.random() - 0.5) * 60;
    starCol[i3] = 1.0; starCol[i3 + 1] = 1.0; starCol[i3 + 2] = 1.0;
  }

  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(starCol, 3));

  var starMat = new THREE.PointsMaterial({
    size: 1.5,
    vertexColors: true,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  starParticles = new THREE.Points(starGeo, starMat);
  scene.add(starParticles);

  camTheta = 0; camPhi = 0.7;
}

function initThreenebula() {
  camTheta = 0; camPhi = 0.7;
  baseCamTheta = 0; baseCamPhi = 0.7;
  setupScene();
}

function renderThreenebula() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer) return;

  // Click to spawn new cluster
  if (pointer.clicked && state.currentMode === 'threenebula') {
    pointer.clicked = false;
    if (clusters.length < maxClusters) {
      clusters.push({
        x: (Math.random() - 0.5) * 25,
        y: (Math.random() - 0.5) * 20,
        z: (Math.random() - 0.5) * 25,
        radius: 3 + Math.random() * 5,
        hue: Math.random(),
        orbitAngle: Math.random() * Math.PI * 2,
        orbitSpeed: 0.1 + Math.random() * 0.3,
        orbitRadius: 2 + Math.random() * 6
      });
    } else {
      var replaceIdx = Math.floor(Math.random() * clusters.length);
      clusters[replaceIdx] = {
        x: (Math.random() - 0.5) * 25,
        y: (Math.random() - 0.5) * 20,
        z: (Math.random() - 0.5) * 25,
        radius: 3 + Math.random() * 5,
        hue: Math.random(),
        orbitAngle: Math.random() * Math.PI * 2,
        orbitSpeed: 0.1 + Math.random() * 0.3,
        orbitRadius: 2 + Math.random() * 6
      };
    }
  }

  // Drag to orbit camera
  if (pointer.down && state.currentMode === 'threenebula') {
    camTheta = baseCamTheta + (pointer.gx / W - 0.5) * Math.PI * 2;
    camPhi = baseCamPhi + (pointer.gy / H - 0.5) * Math.PI * 0.8;
  } else {
    baseCamTheta = camTheta;
    baseCamPhi = camPhi;
    camTheta += 0.002;
  }
  camPhi = Math.max(0.1, Math.min(Math.PI - 0.1, camPhi));

  camera.position.set(
    camDist * Math.sin(camPhi) * Math.cos(camTheta),
    camDist * Math.cos(camPhi),
    camDist * Math.sin(camPhi) * Math.sin(camTheta)
  );
  camera.lookAt(0, 0, 0);

  // Update cluster orbits
  for (var c = 0; c < clusters.length; c++) {
    clusters[c].orbitAngle += clusters[c].orbitSpeed * 0.01;
  }

  // Update gas particles with turbulence
  var gasPos = gasParticles.geometry.attributes.position.array;
  var gasCol = gasParticles.geometry.attributes.color.array;

  for (var i = 0; i < gasCount; i++) {
    var i3 = i * 3;
    var ci = i % clusters.length;
    var cl = clusters[ci];

    var cx = cl.x + Math.cos(cl.orbitAngle) * cl.orbitRadius;
    var cy = cl.y + Math.sin(cl.orbitAngle * 0.7) * cl.orbitRadius * 0.5;
    var cz = cl.z + Math.sin(cl.orbitAngle) * cl.orbitRadius;

    var px = gasPos[i3], py = gasPos[i3 + 1], pz = gasPos[i3 + 2];
    var turbX = Math.sin(py * 0.3 + t * 0.2) * 0.05 + Math.cos(pz * 0.2 + t * 0.15) * 0.03;
    var turbY = Math.sin(pz * 0.3 + t * 0.18) * 0.05 + Math.cos(px * 0.25 + t * 0.12) * 0.03;
    var turbZ = Math.sin(px * 0.3 + t * 0.22) * 0.05 + Math.cos(py * 0.2 + t * 0.17) * 0.03;

    var dx = cx - px, dy = cy - py, dz = cz - pz;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
    var attract = 0.005;

    gasPos[i3] += dx * attract + turbX;
    gasPos[i3 + 1] += dy * attract + turbY;
    gasPos[i3 + 2] += dz * attract + turbZ;

    var distFromCenter = dist;
    var hue = (cl.hue + distFromCenter * 0.02 + t * 0.02) % 1;
    hue = 0.6 + hue * 0.35;
    if (hue > 1) hue -= 1;
    var lightness = Math.min(0.7, 0.3 + (1 - Math.min(1, distFromCenter / cl.radius)) * 0.4);
    if (distFromCenter < cl.radius * 0.3) lightness = Math.min(0.85, lightness + 0.3);
    var col = new THREE.Color().setHSL(hue, 0.8, lightness);
    gasCol[i3] = col.r; gasCol[i3 + 1] = col.g; gasCol[i3 + 2] = col.b;
  }

  gasParticles.geometry.attributes.position.needsUpdate = true;
  gasParticles.geometry.attributes.color.needsUpdate = true;

  // Twinkle stars
  var starCol = starParticles.geometry.attributes.color.array;
  for (var i = 0; i < starCount; i++) {
    var i3 = i * 3;
    var twinkle = 0.5 + 0.5 * Math.sin(t * 3 + i * 7.3);
    starCol[i3] = twinkle; starCol[i3 + 1] = twinkle; starCol[i3 + 2] = twinkle;
  }
  starParticles.geometry.attributes.color.needsUpdate = true;

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

  var label = '[threenebula] click:spawn drag:orbit';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 25);
  }
}

registerMode('threenebula', { init: initThreenebula, render: renderThreenebula, cleanup: disposeAll });
