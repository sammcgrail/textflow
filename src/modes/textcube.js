import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Textcube — actual three.js rendered 3D cube overlaid on flowing ASCII text
// Text flows around the cube silhouette, hugging the edges

var THREE = null;
var threeLoaded = false;
var scene = null;
var camera = null;
var renderer = null;
var cube = null;
var overlayCanvas = null;
var maskCanvas = null;
var maskCtx = null;
var cubeMask = null; // Uint8Array — 1 where cube is

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
  cubeMask = null;

  if (!threeLoaded && !THREE) {
    import(/* webpackIgnore: true */ 'https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js').then(function(mod) {
      THREE = mod;
      threeLoaded = true;
      setupScene();
    }).catch(function(err) {
      threeLoaded = false;
    });
  } else if (THREE) {
    setupScene();
  }
}

function createRoundedBox(w, h, d, r, segs) {
  // Create a rounded box by extruding a rounded rect shape and combining faces
  // Simpler approach: use capsule-like SDF or just use a sphere-modified box
  // Easiest: BufferGeometry from a Box with chamfered edges
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
  // Center the geometry (extrude goes from 0 to depth)
  geo.translate(0, 0, -d / 2);
  geo.computeVertexNormals();
  return geo;
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
    var parent = state.canvas.parentElement || document.body;
    parent.appendChild(overlayCanvas);
  }

  // Mask canvas for reading cube silhouette
  if (!maskCanvas) {
    maskCanvas = document.createElement('canvas');
    maskCtx = maskCanvas.getContext('2d');
  }

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
    cubeOffX += dx * 0.01;
    cubeOffY -= dy * 0.01;
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

function onTouchStart(e) {
  if (state.currentMode !== 'textcube') return;
  e.preventDefault();
  touchCount = e.touches.length;
  if (touchCount >= 2) {
    // Two-finger: move cube
    moving = true;
    dragging = false;
    var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    var my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    lastMoveX = mx;
    lastMoveY = my;
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
  e.preventDefault();
  if (e.touches.length >= 2 && moving) {
    var mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    var my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    cubeOffX += (mx - lastMoveX) * 0.01;
    cubeOffY -= (my - lastMoveY) * 0.01;
    lastMoveX = mx;
    lastMoveY = my;
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

function renderTextcube() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  if (!threeLoaded || !THREE) {
    var msg = 'loading three.js...';
    var mx = Math.floor((W - msg.length) / 2);
    for (var i = 0; i < msg.length; i++) {
      drawCharHSL(msg[i], mx + i, Math.floor(H / 2), (t * 60 + i * 15) % 360, 60, 40);
    }
    return;
  }

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

  // Read the rendered frame at higher resolution for accurate masking
  // Sample at 4x grid resolution and check if ANY sub-pixel hits the cube
  var sampleScale = 4;
  var sW = W * sampleScale;
  var sH = H * sampleScale;
  maskCanvas.width = sW;
  maskCanvas.height = sH;
  maskCtx.clearRect(0, 0, sW, sH);
  maskCtx.drawImage(overlayCanvas, 0, 0, sW, sH);
  var imgData = maskCtx.getImageData(0, 0, sW, sH);
  var pixels = imgData.data;

  if (!cubeMask || cubeMask.length !== W * H) {
    cubeMask = new Uint8Array(W * H);
  }

  // Build mask — cell is "cube" if ANY sub-pixel has alpha > 10
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var hit = 0;
      for (var sy = 0; sy < sampleScale; sy++) {
        for (var sx = 0; sx < sampleScale; sx++) {
          var pi = ((y * sampleScale + sy) * sW + (x * sampleScale + sx)) * 4;
          if (pixels[pi + 3] > 10) { hit = 1; break; }
        }
        if (hit) break;
      }
      cubeMask[y * W + x] = hit;
    }
  }

  // Render flowing text — flow AROUND the cube silhouette
  var speed = 1.5;
  var textIdx = 0;
  var textOffset = Math.floor(t * speed * 3);

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var mi = y * W + x;

      if (cubeMask[mi]) {
        // Cube cell — skip (three.js renders here)
        // But draw glow chars adjacent to cube edges
        continue;
      }

      // Check proximity to cube for buffer zone and glow
      var nearCube = 0;
      var bufferDist = 4;
      for (var dy = -bufferDist; dy <= bufferDist; dy++) {
        for (var dx = -bufferDist; dx <= bufferDist; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && cubeMask[ny * W + nx]) {
            var dist = Math.sqrt(dx * dx + dy * dy);
            nearCube = Math.max(nearCube, 1 - dist / (bufferDist + 1));
          }
        }
      }

      // Skip cells too close to cube (buffer zone)
      if (nearCube > 0.7) continue;

      // Text character from flowing stream
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

      // Bright colorful flowing text
      var hue = (t * 25 + y * 3 + x * 1.5 + Math.sin(t * 1.5 + x * 0.08) * 40) % 360;
      var sat = 60 + Math.sin(t * 0.7 + y * 0.15) * 20;
      var lum = 18 + Math.sin(t * 1.2 + x * 0.12 + y * 0.08) * 8;

      // Near cube — text gets much brighter with intense glow
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
    if (!cubeMask[(H - 1) * W + lx + li]) {
      drawCharHSL(label[li], lx + li, H - 1, 220, 40, 22);
    }
  }
}

function cleanupTextcube() {
  if (overlayCanvas && overlayCanvas.parentElement) {
    overlayCanvas.parentElement.removeChild(overlayCanvas);
    overlayCanvas = null;
  }
  if (renderer) {
    renderer.dispose();
    renderer = null;
  }
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

registerMode('textcube', { init: wrappedInit, render: wrappedRender, attach: attachTextcube });
