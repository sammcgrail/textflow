import * as THREE from 'three/webgpu';
import { Fn, uniform, vec3, vec4, float, int, sin, cos, abs, dot, normalize, mix, pow, fract, floor, clamp, step, smoothstep, positionLocal, normalLocal, cameraPosition, positionWorld, uv } from 'three/tsl';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// TSL Fire — Flowing fire/plasma simulation using TSL procedural shaders
// Inspired by ASCII fluid demos with rich glow and depth
var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var firePlane = null;
var timeUniform = null;
var mouseUniform = null;
var intensityUniform = null;
var pulseCountUniform = null;
var rendererReady = false;
var pulses = [];
var maxPulses = 8;

function disposeAll() {
  if (firePlane) {
    firePlane.geometry.dispose();
    firePlane.material.dispose();
    firePlane = null;
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
  timeUniform = null;
  mouseUniform = null;
  intensityUniform = null;
  pulseCountUniform = null;
  rendererReady = false;
  pulses = [];
  if (renderer) {
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer.dispose();
    renderer = null;
  }
  readCanvas = null; readCtx = null;
}

function setupScene() {
  var W = state.COLS, H = state.ROWS;
  var rW = W * 2, rH = H * 2;
  disposeAll();

  renderer = new THREE.WebGPURenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(rW, rH);
  renderer.domElement.style.display = 'none';
  document.body.appendChild(renderer.domElement);

  readCanvas = document.createElement('canvas');
  readCanvas.width = rW; readCanvas.height = rH;
  readCtx = readCanvas.getContext('2d', { willReadFrequently: true });

  scene = new THREE.Scene();

  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // TSL uniforms
  timeUniform = uniform(0.0);
  mouseUniform = uniform(new THREE.Vector2(0.5, 0.5));
  intensityUniform = uniform(1.0);
  pulseCountUniform = uniform(0);

  // Create a fullscreen quad with TSL shader
  var geo = new THREE.PlaneGeometry(2, 2);

  // TSL procedural fire shader — entirely on GPU via node material
  var colorNode = Fn(function() {
    var fragUV = uv().toVar();
    var t = timeUniform;
    var mouse = mouseUniform;

    // --- Simplex-like hash noise via TSL ---
    // Hash function
    var hx = fract(sin(fragUV.x.mul(127.1).add(fragUV.y.mul(311.7))).mul(43758.5453));
    var hy = fract(sin(fragUV.x.mul(269.5).add(fragUV.y.mul(183.3))).mul(43758.5453));

    // Layered procedural noise using sin combinations (FBM-like)
    var px = fragUV.x.mul(6.0);
    var py = fragUV.y.mul(4.0).sub(t.mul(0.8));

    // Octave 1 — large turbulence
    var n1 = sin(px.mul(1.0).add(t.mul(0.5)))
      .mul(cos(py.mul(1.3).add(t.mul(0.3))))
      .add(sin(px.mul(0.7).sub(py.mul(0.9)).add(t.mul(0.4))));

    // Octave 2 — medium detail
    var n2 = sin(px.mul(2.5).add(t.mul(1.1)))
      .mul(cos(py.mul(2.8).sub(t.mul(0.7))))
      .add(sin(px.mul(3.1).add(py.mul(1.7)).add(t.mul(0.9))));

    // Octave 3 — fine swirling
    var n3 = sin(px.mul(5.0).sub(t.mul(1.5)))
      .mul(cos(py.mul(6.0).add(t.mul(1.2))))
      .add(sin(px.mul(4.5).add(py.mul(5.5)).sub(t.mul(1.8))));

    // Octave 4 — ultra-fine crackling
    var n4 = sin(px.mul(10.0).add(t.mul(2.5)))
      .mul(cos(py.mul(12.0).sub(t.mul(2.0))));

    // Combine octaves with decreasing amplitude (FBM)
    var noise = n1.mul(0.5).add(n2.mul(0.25)).add(n3.mul(0.125)).add(n4.mul(0.0625));

    // Rising heat — stronger at bottom, fading at top
    var verticalFade = float(1.0).sub(fragUV.y).mul(1.5);
    verticalFade = clamp(verticalFade, float(0.0), float(1.5));

    // Swirling distortion
    var swirl = sin(fragUV.x.mul(8.0).add(t.mul(0.6)).add(noise.mul(2.0)))
      .mul(cos(fragUV.y.mul(6.0).sub(t.mul(0.4))))
      .mul(0.3);

    // Fire intensity
    var fire = noise.add(swirl).mul(verticalFade).add(0.2);
    fire = clamp(fire, float(0.0), float(2.0));

    // Mouse interaction — heat source
    var dx = fragUV.x.sub(mouse.x);
    var dy = fragUV.y.sub(float(1.0).sub(mouse.y));
    var mouseDist = dx.mul(dx).add(dy.mul(dy));
    var mouseHeat = pow(clamp(float(1.0).sub(mouseDist.mul(8.0)), float(0.0), float(1.0)), float(2.0));
    mouseHeat = mouseHeat.mul(intensityUniform).mul(0.8);
    fire = fire.add(mouseHeat);

    // Color ramp — black -> deep red -> orange -> yellow -> white
    var r = clamp(fire.mul(3.0), float(0.0), float(1.0));
    var g = clamp(fire.mul(3.0).sub(1.0), float(0.0), float(1.0));
    var b = clamp(fire.mul(3.0).sub(2.2), float(0.0), float(1.0));

    // Add blue/purple undertone to the darkest areas
    var cool = clamp(float(0.3).sub(fire), float(0.0), float(0.3));
    b = b.add(cool.mul(0.8));
    r = r.add(cool.mul(0.3));

    // Emissive boost — hot spots glow extra bright
    var hotspot = clamp(fire.sub(1.0), float(0.0), float(1.0));
    r = r.add(hotspot.mul(0.5));
    g = g.add(hotspot.mul(0.4));
    b = b.add(hotspot.mul(0.2));

    // Secondary swirling plasma layer
    var plasma = sin(fragUV.x.mul(12.0).add(t.mul(1.3)).add(noise))
      .mul(sin(fragUV.y.mul(10.0).sub(t.mul(0.9))))
      .mul(0.15).mul(verticalFade);
    r = r.add(abs(plasma).mul(0.6));
    g = g.add(abs(plasma).mul(0.3));

    // Edge vignette
    var edgeX = smoothstep(float(0.0), float(0.15), fragUV.x)
      .mul(smoothstep(float(1.0), float(0.85), fragUV.x));
    var edgeY = smoothstep(float(0.0), float(0.1), fragUV.y)
      .mul(smoothstep(float(1.0), float(0.8), fragUV.y));
    var vignette = edgeX.mul(edgeY);

    r = r.mul(vignette);
    g = g.mul(vignette);
    b = b.mul(vignette);

    return vec4(r, g, b, float(1.0));
  })();

  var mat = new THREE.MeshBasicNodeMaterial();
  mat.colorNode = colorNode;

  firePlane = new THREE.Mesh(geo, mat);
  scene.add(firePlane);

  pulses = [];
}

function initTslfire() {
  setupScene();
  rendererReady = false;
  if (renderer && renderer.init) {
    renderer.init().then(function() {
      rendererReady = true;
    }).catch(function() {
      rendererReady = true;
    });
  } else {
    rendererReady = true;
  }
}

function renderTslfire() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer || !firePlane || !rendererReady) return;

  // Click to create heat pulse
  if (pointer.clicked && state.currentMode === 'tslfire') {
    pointer.clicked = false;
    intensityUniform.value = 3.0;
  }

  // Smooth intensity decay
  if (intensityUniform) {
    var iv = intensityUniform.value;
    if (iv > 1.0) {
      intensityUniform.value = iv + (1.0 - iv) * 0.03;
    }
  }

  // Update mouse position for heat source
  if (pointer.down && state.currentMode === 'tslfire') {
    mouseUniform.value.set(pointer.gx / W, pointer.gy / H);
    intensityUniform.value = Math.max(intensityUniform.value, 2.0);
  }

  // Update time
  timeUniform.value = t;

  // Render
  var rW = renderer.domElement.width, rH = renderer.domElement.height;
  try {
    renderer.render(scene, camera);
  } catch (e) {
    return;
  }

  // Read pixels to ASCII
  readCtx.drawImage(renderer.domElement, 0, 0, rW, rH);
  var imgData = readCtx.getImageData(0, 0, rW, rH).data;
  var scaleX = rW / W, scaleY = rH / H;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var sx = Math.floor(x * scaleX), sy = Math.floor(y * scaleY);
      var pi = (sy * rW + sx) * 4;
      var r = imgData[pi], g = imgData[pi + 1], b2 = imgData[pi + 2];
      var lum = (0.299 * r + 0.587 * g + 0.114 * b2) / 255;
      if (lum < 0.008) continue;
      var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
      drawChar(RAMP_DENSE[ci], x, y,
        Math.min(255, r * 1.5) | 0,
        Math.min(255, g * 1.5) | 0,
        Math.min(255, b2 * 1.5) | 0,
        Math.max(0.25, Math.min(1, lum * 2.5)));
    }
  }

  var label = '[tslfire] click:pulse drag:heat';
  var lx = Math.max(0, W - label.length - 1);
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 25);
  }
}

registerMode('tslfire', { init: initTslfire, render: renderTslfire, cleanup: disposeAll });
