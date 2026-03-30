import * as THREE from 'three';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// Three Face Cube — face-tracked 3D cube with orbiting cubes, rendered to ASCII
// Head movement controls camera position for pronounced parallax

var CDN_URL = 'https://cdn.jsdelivr.net/npm/@svenflow/micro-facemesh@0.1.2/dist/index.js';
var facemeshLib = null;
var detector = null;
var webcamEl = null;
var webcamReady = false;
var webcamDenied = false;
var loadError = null;
var loadingThree = true;
var loadingFace = true;

var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var mainCube = null;
var orbitCubes = [];
var detectInterval = 3;
var frameCount = 0;
var detecting = false;

// Face position (smoothed)
var faceX = 0.5;
var faceY = 0.5;
var faceZ = 0.5;
var targetFaceX = 0.5;
var targetFaceY = 0.5;
var targetFaceZ = 0.5;
var faceDetected = false;

var FACE_COLORS = [0xff3366, 0x33ff66, 0x3366ff, 0xffff33, 0xff6633, 0x33ffff];

function disposeRenderer() {
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
}

function setupScene() {
  var W = state.COLS;
  var H = state.ROWS;
  var rW = W * 2;
  var rH = H * 2;

  disposeRenderer();

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
  camera.position.set(0, 0, 15);
  camera.lookAt(0, 0, 0);

  // Main cube — each face a different colored wireframe via edges
  var mainGeo = new THREE.BoxGeometry(4, 4, 4);
  var mainMat = new THREE.MeshBasicMaterial({
    color: 0x4488ff,
    wireframe: true
  });
  mainCube = new THREE.Mesh(mainGeo, mainMat);
  scene.add(mainCube);

  // Colored face planes (semi-transparent fill on each face)
  var faceGeos = [
    { pos: [0, 0, 2.01], rot: [0, 0, 0] },           // front
    { pos: [0, 0, -2.01], rot: [0, Math.PI, 0] },     // back
    { pos: [2.01, 0, 0], rot: [0, Math.PI / 2, 0] },  // right
    { pos: [-2.01, 0, 0], rot: [0, -Math.PI / 2, 0] },// left
    { pos: [0, 2.01, 0], rot: [-Math.PI / 2, 0, 0] }, // top
    { pos: [0, -2.01, 0], rot: [Math.PI / 2, 0, 0] }  // bottom
  ];

  for (var fi = 0; fi < 6; fi++) {
    var fGeo = new THREE.PlaneGeometry(3.8, 3.8);
    var fMat = new THREE.MeshBasicMaterial({
      color: FACE_COLORS[fi],
      wireframe: true,
      transparent: true,
      opacity: 0.3
    });
    var fMesh = new THREE.Mesh(fGeo, fMat);
    fMesh.position.set(faceGeos[fi].pos[0], faceGeos[fi].pos[1], faceGeos[fi].pos[2]);
    fMesh.rotation.set(faceGeos[fi].rot[0], faceGeos[fi].rot[1], faceGeos[fi].rot[2]);
    mainCube.add(fMesh);
  }

  // Orbiting cubes
  orbitCubes = [];
  for (var oi = 0; oi < 6; oi++) {
    var oGeo = new THREE.BoxGeometry(1, 1, 1);
    var oMat = new THREE.MeshBasicMaterial({
      color: FACE_COLORS[oi],
      wireframe: true
    });
    var oCube = new THREE.Mesh(oGeo, oMat);
    oCube.userData.orbitRadius = 5 + oi * 0.5;
    oCube.userData.orbitSpeed = 0.5 + oi * 0.15;
    oCube.userData.orbitPhase = oi * Math.PI * 2 / 6;
    oCube.userData.orbitTilt = (oi - 3) * 0.3;
    orbitCubes.push(oCube);
    scene.add(oCube);
  }
}

function startWebcam() {
  if (webcamReady) return;
  if (!webcamEl) {
    webcamEl = document.createElement('video');
    webcamEl.muted = true;
    webcamEl.playsInline = true;
    webcamEl.setAttribute('autoplay', '');
    webcamEl.style.display = 'none';
    document.body.appendChild(webcamEl);
  }
  navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
  }).then(function(stream) {
    webcamEl.srcObject = stream;
    webcamEl.play().catch(function(){});
    webcamEl.onloadeddata = function() { webcamReady = true; };
  }).catch(function(err) {
    webcamDenied = true;
    loadError = 'Camera denied';
    loadingFace = false;
  });
}

function loadFacemesh() {
  if (facemeshLib) { initDetector(); return; }
  if (!navigator.gpu) {
    loadError = 'no WebGPU — face tracking disabled';
    loadingFace = false;
    return;
  }
  import(/* webpackIgnore: true */ CDN_URL).then(function(mod) {
    facemeshLib = mod.createFacemesh || (mod.default && mod.default.createFacemesh) || mod;
    if (typeof facemeshLib === 'object' && facemeshLib.createFacemesh) {
      facemeshLib = facemeshLib.createFacemesh;
    }
    initDetector();
  }).catch(function(err) {
    loadError = 'Facemesh load failed';
    loadingFace = false;
  });
}

function initDetector() {
  if (!facemeshLib || detector) { loadingFace = false; return; }
  facemeshLib({ maxFaces: 1 }).then(function(fm) {
    detector = fm;
    loadingFace = false;
  }).catch(function(err) {
    loadError = 'Detector init failed';
    loadingFace = false;
  });
}

function detectFace() {
  if (!detector || !webcamReady || detecting || webcamEl.readyState < 2) return;
  detecting = true;
  detector.detect(webcamEl).then(function(result) {
    if (result && result.length > 0) {
      var face = result[0];
      var lm = face.landmarks;
      if (lm && lm.length > 6) {
        faceDetected = true;
        var leftEye = lm[33];
        var rightEye = lm[263];
        var eyeCenterX = (leftEye.x + rightEye.x) / 2;
        var eyeCenterY = (leftEye.y + rightEye.y) / 2;
        // Mirror face X
        targetFaceX = 1 - eyeCenterX;
        targetFaceY = eyeCenterY;
        var eyeDist = Math.sqrt(
          Math.pow(rightEye.x - leftEye.x, 2) +
          Math.pow(rightEye.y - leftEye.y, 2)
        );
        targetFaceZ = Math.max(0, Math.min(1, (eyeDist - 0.05) / 0.15));
      }
    } else {
      faceDetected = false;
    }
    detecting = false;
  }).catch(function() { detecting = false; });
}

function initThreefacecube() {
  loadingThree = true;
  loadingFace = true;
  loadError = null;
  webcamDenied = false;
  faceDetected = false;
  faceX = 0.5; faceY = 0.5; faceZ = 0.5;
  targetFaceX = 0.5; targetFaceY = 0.5; targetFaceZ = 0.5;

  startWebcam();
  loadFacemesh();

  loadingThree = false;
  setupScene();
}

function renderThreefacecube() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  // Loading state
  if (!renderer) {
    return;
  }

  if (loadError && !faceDetected) {
    var errMsg = loadError;
    var emx = Math.floor((W - errMsg.length) / 2);
    for (var ei = 0; ei < errMsg.length; ei++) {
      drawCharHSL(errMsg[ei], emx + ei, 1, 0, 60, 35);
    }
  }

  // Detect face
  frameCount++;
  if (frameCount % detectInterval === 0 && detector) detectFace();

  // Smooth face position
  var smooth = 0.08;
  faceX += (targetFaceX - faceX) * smooth;
  faceY += (targetFaceY - faceY) * smooth;
  faceZ += (targetFaceZ - faceZ) * smooth;

  if (!faceDetected) {
    // Gentle auto-orbit when no face detected
    targetFaceX = 0.5 + Math.sin(t * 0.3) * 0.15;
    targetFaceY = 0.5 + Math.cos(t * 0.2) * 0.1;
    targetFaceZ = 0.5;
  }

  // Camera controlled by face — very pronounced parallax
  var camX = (faceX - 0.5) * 20;
  var camY = -(faceY - 0.5) * 15;
  var camZ = 12 + (faceZ - 0.5) * 8;

  camera.position.set(camX, camY, camZ);
  camera.lookAt(0, 0, 0);

  // Slow rotation on main cube
  mainCube.rotation.y = t * 0.15;
  mainCube.rotation.x = t * 0.1;

  // Update orbiting cubes
  for (var oi = 0; oi < orbitCubes.length; oi++) {
    var oc = orbitCubes[oi];
    var angle = t * oc.userData.orbitSpeed + oc.userData.orbitPhase;
    var r = oc.userData.orbitRadius;
    oc.position.set(
      Math.cos(angle) * r,
      Math.sin(angle * 0.7) * r * 0.3 + oc.userData.orbitTilt * 2,
      Math.sin(angle) * r
    );
    oc.rotation.x = t * 1.5 + oi;
    oc.rotation.y = t * 2 + oi * 0.5;

    // Pulse scale
    var pulse = 0.8 + Math.sin(t * 3 + oi) * 0.3;
    oc.scale.set(pulse, pulse, pulse);
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

  // Status
  var status = faceDetected ? '[tracking]' : '[no face]';
  var stx = W - status.length - 1;
  for (var si = 0; si < status.length; si++) {
    drawCharHSL(status[si], stx + si, H - 1, faceDetected ? 120 : 0, 50, 20);
  }
}

registerMode('threefacecube', { init: initThreefacecube, render: renderThreefacecube });
