import * as THREE from 'three';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Three Cubes — Exploding cube array using InstancedMesh
var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var instancedMesh = null;
var cubeCount = 512;
var gridPositions = null;
var currentPositions = null;
var cubeVelocities = null;
var cubeRotations = null;
var exploded = false;
var camTheta = 0.5;
var camPhi = 0.8;
var camDist = 25;
var baseCamTheta = 0.5;
var baseCamPhi = 0.8;
var formationRotY = 0;
var dummy = null;

function disposeAll() {
  if (instancedMesh) {
    instancedMesh.geometry.dispose();
    instancedMesh.material.dispose();
    instancedMesh = null;
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
  gridPositions = null;
  currentPositions = null;
  cubeVelocities = null;
  cubeRotations = null;
  dummy = null;
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
  scene.background = new THREE.Color(0x080810);

  camera = new THREE.PerspectiveCamera(60, rW / rH, 0.1, 200);

  var ambient = new THREE.AmbientLight(0x333355, 0.4);
  scene.add(ambient);
  var dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 15, 10);
  scene.add(dirLight);
  var pointLight = new THREE.PointLight(0xff6644, 1.0, 30);
  pointLight.position.set(-5, 5, -5);
  scene.add(pointLight);

  var cubeGeo = new THREE.BoxGeometry(0.8, 0.8, 0.8);
  var cubeMat = new THREE.MeshPhongMaterial({ vertexColors: false, shininess: 80 });
  instancedMesh = new THREE.InstancedMesh(cubeGeo, cubeMat, cubeCount);
  instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  var colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(cubeCount * 3), 3);
  instancedMesh.instanceColor = colorAttr;

  dummy = new THREE.Object3D();
  gridPositions = new Float32Array(cubeCount * 3);
  currentPositions = new Float32Array(cubeCount * 3);
  cubeVelocities = new Float32Array(cubeCount * 3);
  cubeRotations = new Float32Array(cubeCount * 4);

  var idx = 0;
  var spacing = 1.2;
  var offset = -spacing * 3.5;
  for (var gx = 0; gx < 8; gx++) {
    for (var gy = 0; gy < 8; gy++) {
      for (var gz = 0; gz < 8; gz++) {
        if (idx >= cubeCount) break;
        var i3 = idx * 3;
        gridPositions[i3] = offset + gx * spacing;
        gridPositions[i3 + 1] = offset + gy * spacing;
        gridPositions[i3 + 2] = offset + gz * spacing;
        currentPositions[i3] = gridPositions[i3];
        currentPositions[i3 + 1] = gridPositions[i3 + 1];
        currentPositions[i3 + 2] = gridPositions[i3 + 2];
        cubeVelocities[i3] = 0; cubeVelocities[i3 + 1] = 0; cubeVelocities[i3 + 2] = 0;

        cubeRotations[idx * 4] = Math.random() * Math.PI * 2;
        cubeRotations[idx * 4 + 1] = Math.random() * Math.PI * 2;
        cubeRotations[idx * 4 + 2] = Math.random() * Math.PI * 2;
        cubeRotations[idx * 4 + 3] = 0.5 + Math.random() * 0.5;

        var hue = (gx / 8 * 0.3 + gy / 8 * 0.3 + gz / 8 * 0.3) % 1;
        var isSurface = (gx === 0 || gx === 7 || gy === 0 || gy === 7 || gz === 0 || gz === 7);
        var lightness = isSurface ? 0.65 : 0.35;
        var col = new THREE.Color().setHSL(hue, 0.9, lightness);
        colorAttr.setXYZ(idx, col.r, col.g, col.b);

        idx++;
      }
    }
  }

  scene.add(instancedMesh);
  exploded = false;
  formationRotY = 0;
  camTheta = 0.5; camPhi = 0.8;
}

function initThreecubes() {
  camTheta = 0.5; camPhi = 0.8;
  baseCamTheta = 0.5; baseCamPhi = 0.8;
  setupScene();
}

function renderThreecubes() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer || !instancedMesh) return;

  // Click to explode/reform
  if (pointer.clicked && state.currentMode === 'threecubes') {
    pointer.clicked = false;
    exploded = !exploded;
    if (exploded) {
      for (var i = 0; i < cubeCount; i++) {
        var i3 = i * 3;
        cubeVelocities[i3] = (Math.random() - 0.5) * 1.5;
        cubeVelocities[i3 + 1] = (Math.random() - 0.5) * 1.5;
        cubeVelocities[i3 + 2] = (Math.random() - 0.5) * 1.5;
        var dx = currentPositions[i3], dy = currentPositions[i3 + 1], dz = currentPositions[i3 + 2];
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
        cubeVelocities[i3] += (dx / dist) * 0.8;
        cubeVelocities[i3 + 1] += (dy / dist) * 0.8;
        cubeVelocities[i3 + 2] += (dz / dist) * 0.8;
      }
    }
  }

  // Drag to rotate
  if (pointer.down && state.currentMode === 'threecubes') {
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

  formationRotY += 0.005;

  for (var i = 0; i < cubeCount; i++) {
    var i3 = i * 3;
    var i4 = i * 4;

    if (exploded) {
      currentPositions[i3] += cubeVelocities[i3];
      currentPositions[i3 + 1] += cubeVelocities[i3 + 1];
      currentPositions[i3 + 2] += cubeVelocities[i3 + 2];
      cubeVelocities[i3] *= 0.98;
      cubeVelocities[i3 + 1] *= 0.98;
      cubeVelocities[i3 + 2] *= 0.98;
      cubeRotations[i4] += cubeRotations[i4 + 3] * 0.15;
      cubeRotations[i4 + 1] += cubeRotations[i4 + 3] * 0.12;
    } else {
      currentPositions[i3] += (gridPositions[i3] - currentPositions[i3]) * 0.04;
      currentPositions[i3 + 1] += (gridPositions[i3 + 1] - currentPositions[i3 + 1]) * 0.04;
      currentPositions[i3 + 2] += (gridPositions[i3 + 2] - currentPositions[i3 + 2]) * 0.04;
      cubeVelocities[i3] *= 0.9; cubeVelocities[i3 + 1] *= 0.9; cubeVelocities[i3 + 2] *= 0.9;
      cubeRotations[i4] += cubeRotations[i4 + 3] * 0.01;
      cubeRotations[i4 + 1] += cubeRotations[i4 + 3] * 0.008;
    }

    var cx = currentPositions[i3];
    var cz = currentPositions[i3 + 2];
    var cosR = Math.cos(formationRotY);
    var sinR = Math.sin(formationRotY);
    var rx = cx * cosR - cz * sinR;
    var rz = cx * sinR + cz * cosR;

    dummy.position.set(rx, currentPositions[i3 + 1], rz);
    dummy.rotation.set(cubeRotations[i4], cubeRotations[i4 + 1], cubeRotations[i4 + 2]);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;

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

  var label = '[threecubes] click:explode drag:rotate';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 25);
  }
}

registerMode('threecubes', { init: initThreecubes, render: renderThreecubes, cleanup: disposeAll });
