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
  autoRotate = true;
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

  // Cube — solid with visible edges
  var geo = new THREE.BoxGeometry(1.8, 1.8, 1.8);

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

  // Bright edge lines
  var edgeGeo = new THREE.EdgesGeometry(geo);
  var edgeMat = new THREE.LineBasicMaterial({ color: 0xaaccff, linewidth: 2 });
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
  c.addEventListener('mousedown', onPointerDown);
  window.addEventListener('mousemove', onPointerMove);
  window.addEventListener('mouseup', onPointerUp);
  c.addEventListener('touchstart', onPointerDown, { passive: false });
  window.addEventListener('touchmove', onPointerMove, { passive: false });
  window.addEventListener('touchend', onPointerUp);
}

function onPointerDown(e) {
  dragging = true;
  autoRotate = false;
  var coords = getPointerCoords(e);
  lastDragX = coords.x;
  lastDragY = coords.y;
  e.preventDefault();
}

function onPointerMove(e) {
  if (!dragging) return;
  var coords = getPointerCoords(e);
  var dx = coords.x - lastDragX;
  var dy = coords.y - lastDragY;
  rotY += dx * 0.008;
  rotX += dy * 0.008;
  rotVY = dx * 0.003;
  rotVX = dy * 0.003;
  lastDragX = coords.x;
  lastDragY = coords.y;
  e.preventDefault();
}

function onPointerUp() {
  dragging = false;
}

function getPointerCoords(e) {
  if (e.touches && e.touches.length > 0) {
    return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  return { x: e.clientX, y: e.clientY };
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

  // Apply rotation to cube
  cube.rotation.x = rotX;
  cube.rotation.y = rotY;

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

  // Read the rendered frame to build a mask at character grid resolution
  // Use a small mask canvas to sample at grid resolution
  maskCanvas.width = W;
  maskCanvas.height = H;
  maskCtx.clearRect(0, 0, W, H);
  maskCtx.drawImage(overlayCanvas, 0, 0, W, H);
  var imgData = maskCtx.getImageData(0, 0, W, H);
  var pixels = imgData.data;

  if (!cubeMask || cubeMask.length !== W * H) {
    cubeMask = new Uint8Array(W * H);
  }

  // Build mask — cell is "cube" if alpha > 20
  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var pi = (y * W + x) * 4;
      cubeMask[y * W + x] = pixels[pi + 3] > 20 ? 1 : 0;
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

      // Check proximity to cube for edge-hugging glow
      var nearCube = 0;
      for (var dy = -2; dy <= 2; dy++) {
        for (var dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          var nx = x + dx, ny = y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && cubeMask[ny * W + nx]) {
            var dist = Math.sqrt(dx * dx + dy * dy);
            nearCube = Math.max(nearCube, 1 - dist / 3);
          }
        }
      }

      // Text character from flowing stream
      var ci = (textOffset + textIdx) % loremText.length;
      textIdx++;
      var ch = loremText[ci];
      if (ch === ' ') {
        // Still draw space near cube as glow
        if (nearCube > 0.3) {
          var glowHue = (t * 30 + x * 2 + y) % 360;
          drawCharHSL('.', x, y, glowHue, 60, 10 + nearCube * 35);
        }
        continue;
      }

      // Base text color — dim flowing rainbow
      var hue = (t * 15 + y * 2 + x * 0.5) % 360;
      var sat = 35 + Math.sin(t * 0.5 + y * 0.1) * 15;
      var lum = 10 + Math.sin(t * 0.8 + x * 0.15 + y * 0.1) * 4;

      // Near cube — text gets brighter and more saturated (glow effect)
      if (nearCube > 0) {
        lum += nearCube * 30;
        sat += nearCube * 25;
        hue = (hue + nearCube * 60) % 360; // shift hue toward blue near cube
      }

      drawCharHSL(ch, x, y, hue, Math.min(80, sat), Math.min(50, lum));
    }
  }

  // Label
  var label = '[textcube] drag to rotate';
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
