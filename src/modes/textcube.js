import * as THREE from 'three';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Textcube — actual three.js rendered 3D cube overlaid on flowing ASCII text
// Text flows around the cube silhouette, hugging the edges
//
// Mask is built analytically by projecting 3D geometry to screen coords
// and rasterizing in pure JS — no GPU readPixels sync needed.

var scene = null;
var camera = null;
var renderer = null;
var cube = null;
var overlayCanvas = null;
var cubeMask = null; // Uint8Array — 1 where cube is
var cubeDistField = null; // Float32Array — pre-computed proximity

// Rotation state
var rotX = 0.4;
var rotY = 0.6;
var rotVX = 0;
var rotVY = 0;
var dragging = false;
var lastDragX = 0;
var lastDragY = 0;
var autoRotate = true;

// Position state (right-click / two-finger drag)
var cubeOffX = 0;
var cubeOffY = 0;
var moving = false;
var lastMoveX = 0;
var lastMoveY = 0;
var touchCount = 0;

// Scale state (scroll / pinch)
var cubeScale = 1.0;
var pinchDist = 0;

// Cached buffers
var cachedMaskSize = 0;

var SQRT2 = Math.SQRT2;

// Flowing text
var loremText = 'The quick brown fox jumps over the lazy dog ' +
  'Pack my box with five dozen liquor jugs ' +
  'How vexingly quick daft zebras jump ' +
  'Sphinx of black quartz judge my vow ' +
  'Two driven jocks help fax my big quiz ' +
  'Crazy Frederick bought many very exquisite opal jewels ' +
  'We promptly judged antique ivory buckles for the next prize ' +
  'The five boxing wizards jump quickly ' +
  'Amazingly few discotheques provide jukeboxes ' +
  'Jackdaws love my big sphinx of quartz ';

// === Pre-extracted rounded box geometry for analytical projection ===
var boxVerts = null; // Float32Array of [x,y,z, x,y,z, ...]
var boxFaces = null; // Uint16Array of triangle indices
var boxVertCount = 0;

(function extractBoxGeometry() {
  var radius = 0.2;
  var size = 1.8;
  var geo = createRoundedBoxGeo(size, size, size, radius, 4);
  var pos = geo.getAttribute('position');
  boxVerts = new Float32Array(pos.array);
  boxVertCount = pos.count;
  var idx = geo.getIndex();
  if (idx) {
    boxFaces = new Uint16Array(idx.array);
  } else {
    // Non-indexed geometry — every 3 vertices form a triangle
    boxFaces = new Uint16Array(pos.count);
    for (var i = 0; i < pos.count; i++) boxFaces[i] = i;
  }
  geo.dispose();
})();

// Standalone geometry creation for the IIFE (runs before setupScene)
function createRoundedBoxGeo(w, h, d, r, segs) {
  var shape = new THREE.Shape();
  var hw = w / 2 - r;
  var hh = h / 2 - r;
  shape.moveTo(-hw, -h / 2);
  shape.lineTo(hw, -h / 2);
  shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
  shape.lineTo(w / 2, hh);
  shape.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
  shape.lineTo(-hw, h / 2);
  shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
  shape.lineTo(-w / 2, -hh);
  shape.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);

  var extrudeSettings = {
    depth: d,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelOffset: -r,
    bevelSegments: segs,
    curveSegments: segs
  };
  var geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geo.translate(0, 0, -d / 2);
  geo.computeVertexNormals();
  return geo;
}

// === Reusable THREE objects for projection (zero allocation per frame) ===
// NOTE: Camera params (fov=45, near=0.1, far=100, position=[0,0,5]) must match
// the camera created in setupScene. If those ever change, update here too.
var _projCam = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
_projCam.position.set(0, 0, 5);
_projCam.updateMatrixWorld();

var _euler = new THREE.Euler();
var _quat = new THREE.Quaternion();
var _pos3 = new THREE.Vector3();
var _scl3 = new THREE.Vector3();
var _modelMat = new THREE.Matrix4();
var _v3 = new THREE.Vector3();

// Projected vertices buffer (reused across frames)
var projBuf = null;
var projBufSize = 0;

function initTextcube() {
  rotX = 0.4;
  rotY = 0.6;
  rotVX = 0;
  rotVY = 0;
  dragging = false;
  moving = false;
  autoRotate = true;
  cubeOffX = 0;
  cubeOffY = 0;
  cubeScale = 1.0;
  pinchDist = 0;
  cubeMask = null;
  cubeDistField = null;

  setupScene();
}

function createRoundedBox(w, h, d, r, segs) {
  return createRoundedBoxGeo(w, h, d, r, segs);
}

function setupScene() {
  if (!THREE) return;

  // Create overlay canvas that sits on top of the ASCII canvas
  if (!overlayCanvas) {
    overlayCanvas = document.createElement('canvas');
    overlayCanvas.style.position = 'absolute';
    overlayCanvas.style.top = '0';
    overlayCanvas.style.left = '0';
    overlayCanvas.style.pointerEvents = 'none';
    overlayCanvas.style.zIndex = '5';
    overlayCanvas.setAttribute('data-mode-overlay', 'textcube');
    var parent = state.canvas.parentElement || document.body;
    parent.appendChild(overlayCanvas);
  }

  // Dispose previous scene resources
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
  cube = null;

  // Three.js renderer (renders to the overlay canvas)
  if (renderer) {
    renderer.dispose();
  }
  renderer = new THREE.WebGLRenderer({
    canvas: overlayCanvas,
    alpha: true,
    antialias: true,
    premultipliedAlpha: false
  });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);

  // Scene
  scene = new THREE.Scene();

  // Camera
  camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.z = 5;

  // Cube with rounded edges using RoundedBoxGeometry approach
  // Use a standard box but with bevel via custom geometry
  var radius = 0.2;
  var size = 1.8;
  var geo = createRoundedBox(size, size, size, radius, 4);

  // Main cube — glossy visible material
  var mat = new THREE.MeshPhongMaterial({
    color: 0x3355aa,
    specular: 0xffffff,
    shininess: 120,
    transparent: false,
    opacity: 1
  });
  cube = new THREE.Mesh(geo, mat);
  scene.add(cube);

  // Bright edge lines on rounded box
  var edgeGeo = new THREE.EdgesGeometry(geo, 40);
  var edgeMat = new THREE.LineBasicMaterial({ color: 0xaaccff });
  var edges = new THREE.LineSegments(edgeGeo, edgeMat);
  cube.add(edges);

  // Strong lighting for visibility
  var ambient = new THREE.AmbientLight(0x667799, 1.5);
  scene.add(ambient);

  var dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
  dirLight.position.set(3, 4, 5);
  scene.add(dirLight);

  var dirLight2 = new THREE.DirectionalLight(0x8888ff, 1.2);
  dirLight2.position.set(-3, -2, 3);
  scene.add(dirLight2);

  var dirLight3 = new THREE.DirectionalLight(0x6666aa, 0.8);
  dirLight3.position.set(0, -3, -2);
  scene.add(dirLight3);
}

function attachTextcube() {
  var c = state.canvas;
  c.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  c.addEventListener('contextmenu', function(e) { e.preventDefault(); });
  c.addEventListener('wheel', onWheel, { passive: false });
  c.addEventListener('touchstart', onTouchStart, { passive: false });
  window.addEventListener('touchmove', onTouchMove, { passive: false });
  window.addEventListener('touchend', onTouchEnd);
}

function onMouseDown(e) {
  if (state.currentMode !== 'textcube') return;
  e.preventDefault();
  if (e.button === 2) {
    // Right-click: move cube
    moving = true;
    lastMoveX = e.clientX;
    lastMoveY = e.clientY;
  } else {
    // Left-click: rotate cube
    dragging = true;
    autoRotate = false;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
  }
}

function onMouseMove(e) {
  if (state.currentMode !== 'textcube') return;
  if (dragging) {
    var dx = e.clientX - lastDragX;
    var dy = e.clientY - lastDragY;
    rotY += dx * 0.008;
    rotX += dy * 0.008;
    rotVY = dx * 0.003;
    rotVX = dy * 0.003;
    lastDragX = e.clientX;
    lastDragY = e.clientY;
    e.preventDefault();
  }
  if (moving) {
    var dx = e.clientX - lastMoveX;
    var dy = e.clientY - lastMoveY;
    // Map pixel movement to world units at z=0
    // Camera at z=5, FOV=45°: visible height = 2*5*tan(22.5°) ≈ 4.14
    var vh = window.innerHeight || 800;
    var vw = window.innerWidth || 1200;
    var worldH = 2 * 5 * Math.tan(22.5 * Math.PI / 180);
    var worldW = worldH * (vw / vh);
    cubeOffX += dx * (worldW / vw);
    cubeOffY -= dy * (worldH / vh);
    lastMoveX = e.clientX;
    lastMoveY = e.clientY;
    e.preventDefault();
  }
}

function onMouseUp(e) {
  if (e.button === 2) {
    moving = false;
  } else {
    dragging = false;
  }
}

function onWheel(e) {
  if (state.currentMode !== 'textcube') return;
  e.preventDefault();
  var delta = e.deltaY > 0 ? -0.05 : 0.05;
  cubeScale = Math.max(0.3, Math.min(3.0, cubeScale + delta));
}

function onTouchStart(e) {
  if (state.currentMode !== 'textcube') return;
  // Don't intercept touches on nav bar
  if (e.target && e.target.closest && e.target.closest('nav')) return;
  e.preventDefault();
  touchCount = e.touches.length;
  if (touchCount >= 2) {
    // Two-finger: move + pinch to scale
    moving = true;
    dragging = false;
    var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    var my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    lastMoveX = mx;
    lastMoveY = my;
    pinchDist = Math.sqrt(
      Math.pow(e.touches[1].clientX - e.touches[0].clientX, 2) +
      Math.pow(e.touches[1].clientY - e.touches[0].clientY, 2)
    );
  } else {
    // One finger: rotate
    dragging = true;
    autoRotate = false;
    lastDragX = e.touches[0].clientX;
    lastDragY = e.touches[0].clientY;
  }
}

function onTouchMove(e) {
  if (state.currentMode !== 'textcube') return;
  if (!dragging && !moving) return;
  e.preventDefault();
  if (e.touches.length >= 2 && moving) {
    var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    var my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    var vh2 = window.innerHeight || 800;
    var vw2 = window.innerWidth || 1200;
    var wH2 = 2 * 5 * Math.tan(22.5 * Math.PI / 180);
    var wW2 = wH2 * (vw2 / vh2);
    cubeOffX += (mx - lastMoveX) * (wW2 / vw2);
    cubeOffY -= (my - lastMoveY) * (wH2 / vh2);
    lastMoveX = mx;
    lastMoveY = my;
    // Pinch to scale
    var newDist = Math.sqrt(
      Math.pow(e.touches[1].clientX - e.touches[0].clientX, 2) +
      Math.pow(e.touches[1].clientY - e.touches[0].clientY, 2)
    );
    if (pinchDist > 0) {
      var scaleFactor = newDist / pinchDist;
      cubeScale = Math.max(0.3, Math.min(3.0, cubeScale * scaleFactor));
    }
    pinchDist = newDist;
  } else if (dragging && e.touches.length === 1) {
    var dx = e.touches[0].clientX - lastDragX;
    var dy = e.touches[0].clientY - lastDragY;
    rotY += dx * 0.008;
    rotX += dy * 0.008;
    rotVY = dx * 0.003;
    rotVX = dy * 0.003;
    lastDragX = e.touches[0].clientX;
    lastDragY = e.touches[0].clientY;
  }
}

function onTouchEnd(e) {
  if (state.currentMode !== 'textcube') return;
  if (e.touches.length === 0) {
    dragging = false;
    moving = false;
    touchCount = 0;
  } else if (e.touches.length === 1) {
    moving = false;
    dragging = true;
    lastDragX = e.touches[0].clientX;
    lastDragY = e.touches[0].clientY;
  }
}

// === Analytical mask building (pure JS, no GPU sync) ===

// Barycentric sign for point-in-triangle test
function triSign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

// Rasterize a projected triangle into the mask grid
function rasterTriangle(mask, W, H, ax, ay, bx, by, cx, cy) {
  var minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  var maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  var minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  var maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));

  for (var y = minY; y <= maxY; y++) {
    for (var x = minX; x <= maxX; x++) {
      // Test cell center (x+0.5, y+0.5) against triangle
      var px = x + 0.5;
      var py = y + 0.5;
      var d1 = triSign(px, py, ax, ay, bx, by);
      var d2 = triSign(px, py, bx, by, cx, cy);
      var d3 = triSign(px, py, cx, cy, ax, ay);
      var hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
      var hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);
      if (!(hasNeg && hasPos)) {
        mask[y * W + x] = 1;
      }
    }
  }
}

function buildMask(W, H) {
  var cellCount = W * H;
  if (!cubeMask || cachedMaskSize !== cellCount) {
    cubeMask = new Uint8Array(cellCount);
    cubeDistField = new Float32Array(cellCount);
    cachedMaskSize = cellCount;
  }
  cubeMask.fill(0);

  // Screen dimensions for projection mapping
  var vw = window.innerWidth || 1200;
  var vh = window.innerHeight || 800;
  var charW = state.CHAR_W || (vw / W);
  var charH = state.CHAR_H || (vh / H);
  var navH = state.NAV_H || 32;

  // Update projection camera aspect to match screen
  _projCam.aspect = vw / vh;
  _projCam.updateProjectionMatrix();
  _projCam.updateMatrixWorld();

  // Build model matrix from cube transform state
  _euler.set(rotX, rotY, 0, 'XYZ');
  _quat.setFromEuler(_euler);
  _pos3.set(cubeOffX, cubeOffY, 0);
  _scl3.setScalar(cubeScale);
  _modelMat.compose(_pos3, _quat, _scl3);

  // Ensure projection buffer is large enough
  var needed = boxVertCount * 2;
  if (!projBuf || projBufSize < needed) {
    projBuf = new Float32Array(needed);
    projBufSize = needed;
  }

  // Project all box vertices to grid coords
  for (var i = 0; i < boxVertCount; i++) {
    _v3.set(boxVerts[i * 3], boxVerts[i * 3 + 1], boxVerts[i * 3 + 2]);
    _v3.applyMatrix4(_modelMat);
    _v3.project(_projCam);
    var sx = (_v3.x * 0.5 + 0.5) * vw;
    var sy = (1 - (_v3.y * 0.5 + 0.5)) * vh;
    projBuf[i * 2] = sx / charW;
    projBuf[i * 2 + 1] = (sy - navH) / charH;
  }

  // Rasterize box triangles
  for (var t = 0; t < boxFaces.length; t += 3) {
    var i0 = boxFaces[t], i1 = boxFaces[t + 1], i2 = boxFaces[t + 2];
    rasterTriangle(cubeMask, W, H,
      projBuf[i0 * 2], projBuf[i0 * 2 + 1],
      projBuf[i1 * 2], projBuf[i1 * 2 + 1],
      projBuf[i2 * 2], projBuf[i2 * 2 + 1]);
  }

  // Dilate mask by 1 cell for padding
  cubeDistField.fill(0);
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var i = y * W + x;
      if (cubeMask[i]) { cubeDistField[i] = 1; continue; }
      if ((x > 0 && cubeMask[i - 1]) ||
          (x < W - 1 && cubeMask[i + 1]) ||
          (y > 0 && cubeMask[i - W]) ||
          (y < H - 1 && cubeMask[i + W])) {
        cubeDistField[i] = 1;
      }
    }
  }
  for (var i = 0; i < cellCount; i++) {
    cubeMask[i] = cubeDistField[i] ? 1 : 0;
  }

  // Chamfer distance transform for proximity field
  var INF = 999;
  var maxDist = 3;
  for (var i = 0; i < cellCount; i++) {
    cubeDistField[i] = cubeMask[i] ? 0 : INF;
  }
  // Forward pass
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var i = y * W + x;
      if (x > 0 && cubeDistField[i - 1] + 1 < cubeDistField[i]) cubeDistField[i] = cubeDistField[i - 1] + 1;
      if (y > 0 && cubeDistField[i - W] + 1 < cubeDistField[i]) cubeDistField[i] = cubeDistField[i - W] + 1;
      if (x > 0 && y > 0 && cubeDistField[i - W - 1] + SQRT2 < cubeDistField[i]) cubeDistField[i] = cubeDistField[i - W - 1] + SQRT2;
      if (x < W - 1 && y > 0 && cubeDistField[i - W + 1] + SQRT2 < cubeDistField[i]) cubeDistField[i] = cubeDistField[i - W + 1] + SQRT2;
    }
  }
  // Backward pass
  for (var y = H - 1; y >= 0; y--) {
    for (var x = W - 1; x >= 0; x--) {
      var i = y * W + x;
      if (x < W - 1 && cubeDistField[i + 1] + 1 < cubeDistField[i]) cubeDistField[i] = cubeDistField[i + 1] + 1;
      if (y < H - 1 && cubeDistField[i + W] + 1 < cubeDistField[i]) cubeDistField[i] = cubeDistField[i + W] + 1;
      if (x < W - 1 && y < H - 1 && cubeDistField[i + W + 1] + SQRT2 < cubeDistField[i]) cubeDistField[i] = cubeDistField[i + W + 1] + SQRT2;
      if (x > 0 && y < H - 1 && cubeDistField[i + W - 1] + SQRT2 < cubeDistField[i]) cubeDistField[i] = cubeDistField[i + W - 1] + SQRT2;
    }
  }
  // Convert to proximity (0..1 range)
  for (var i = 0; i < cellCount; i++) {
    if (cubeDistField[i] === 0) {
      cubeDistField[i] = -1; // masked cell sentinel
    } else if (cubeDistField[i] <= maxDist) {
      cubeDistField[i] = 1 - cubeDistField[i] / maxDist;
    } else {
      cubeDistField[i] = 0;
    }
  }

  return cubeMask;
}

function renderTextcube() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (!renderer || !cube) {
    setupScene();
    if (!renderer || !cube) return;
  }

  // Update rotation
  if (!dragging) {
    if (autoRotate) {
      rotY += 0.008;
      rotX += 0.003;
    } else {
      rotY += rotVY;
      rotX += rotVX;
      rotVY *= 0.97;
      rotVX *= 0.97;
      if (Math.abs(rotVY) < 0.0001 && Math.abs(rotVX) < 0.0001) {
        autoRotate = true;
      }
    }
  }

  // Apply rotation and position to cube
  cube.rotation.x = rotX;
  cube.rotation.y = rotY;
  cube.position.x = cubeOffX;
  cube.position.y = cubeOffY;
  cube.scale.set(cubeScale, cubeScale, cubeScale);

  // Size the overlay to match the main canvas exactly
  var mainCanvas = state.canvas;
  var cw = mainCanvas.width;
  var ch = mainCanvas.height;
  if (overlayCanvas.width !== cw || overlayCanvas.height !== ch) {
    overlayCanvas.width = cw;
    overlayCanvas.height = ch;
    overlayCanvas.style.width = mainCanvas.style.width;
    overlayCanvas.style.height = mainCanvas.style.height;
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
  }

  // Match position of main canvas
  var rect = mainCanvas.getBoundingClientRect();
  overlayCanvas.style.left = rect.left + 'px';
  overlayCanvas.style.top = rect.top + 'px';

  // Render the 3D cube
  renderer.render(scene, camera);

  // Build mask analytically (no GPU sync needed)
  var mask = buildMask(W, H);

  // Render flowing text using pre-computed distance field
  var speed = 1.5;
  var textIdx = 0;
  var textOffset = Math.floor(t * speed * 3);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var mi = y * W + x;

      if (mask[mi]) continue;

      // Read proximity from pre-computed distance field
      var nearCube = cubeDistField ? cubeDistField[mi] : 0;

      if (nearCube > 0.6) continue;

      var ci = (textOffset + textIdx) % loremText.length;
      textIdx++;
      var ch = loremText[ci];
      if (ch === ' ') {
        if (nearCube > 0.3) {
          var glowHue = (t * 40 + x * 3 + y * 2) % 360;
          drawCharHSL('.', x, y, glowHue, 70, 15 + nearCube * 30);
        }
        continue;
      }

      var hue = (t * 25 + y * 3 + x * 1.5 + Math.sin(t * 1.5 + x * 0.08) * 40) % 360;
      var sat = 60 + Math.sin(t * 0.7 + y * 0.15) * 20;
      var lum = 18 + Math.sin(t * 1.2 + x * 0.12 + y * 0.08) * 8;

      if (nearCube > 0) {
        lum += nearCube * 35;
        sat += nearCube * 20;
        hue = (hue + nearCube * 80) % 360;
      }

      drawCharHSL(ch, x, y, hue, Math.min(90, sat), Math.min(55, lum));
    }
  }

  // Label
  var label = '[textcube] drag:rotate  right-click:move';
  var lx = Math.floor((W - label.length) / 2);
  for (var li = 0; li < label.length; li++) {
    if (!mask[(H - 1) * W + lx + li]) {
      drawCharHSL(label[li], lx + li, H - 1, 220, 40, 22);
    }
  }
}

function cleanupTextcube() {
  if (cube) {
    cube = null;
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
  if (overlayCanvas && overlayCanvas.parentElement) {
    overlayCanvas.parentElement.removeChild(overlayCanvas);
    overlayCanvas = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
  cubeMask = null;
  cubeDistField = null;
}

// Cleanup when switching modes
var origInit = initTextcube;
function wrappedInit() {
  // Re-add overlay if it was removed
  if (overlayCanvas && !overlayCanvas.parentElement) {
    var parent = state.canvas.parentElement || document.body;
    parent.appendChild(overlayCanvas);
  }
  // Force show overlay
  if (overlayCanvas) {
    overlayCanvas.style.display = '';
    // Force re-size on next render
    overlayCanvas.width = 0;
    overlayCanvas.height = 0;
  }
  origInit();
}

// Listen for mode changes to hide overlay
var lastMode = null;
function checkModeChange() {
  if (state.currentMode !== 'textcube' && overlayCanvas && overlayCanvas.parentElement) {
    overlayCanvas.style.display = 'none';
  } else if (state.currentMode === 'textcube' && overlayCanvas) {
    overlayCanvas.style.display = '';
  }
}

// Wrap render to check mode
var origRender = renderTextcube;
function wrappedRender() {
  checkModeChange();
  origRender();
}

registerMode('textcube', { init: wrappedInit, render: wrappedRender, attach: attachTextcube, cleanup: cleanupTextcube });
