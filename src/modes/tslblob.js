import * as THREE from 'three/webgpu';
import { Fn, uniform, vec3, vec4, float, sin, cos, abs, dot, normalize, mix, pow, positionLocal, normalLocal, cameraPosition, positionWorld } from 'three/tsl';
import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { RAMP_DENSE } from '../core/ramps.js';

// TSL Blob — Morphing organic shape using Three.js Shading Language + WebGPU/WebGL
var renderer = null;
var scene = null;
var camera = null;
var readCanvas = null;
var readCtx = null;
var blobMesh = null;
var timeUniform = null;
var morphUniform = null;
var hueShiftUniform = null;
var camTheta = 0.5;
var camPhi = 0.7;
var camDist = 5;
var baseCamTheta = 0.5;
var baseCamPhi = 0.7;
var morphTarget = 1.0;
var currentMorph = 1.0;
var rendererReady = false;

function disposeAll() {
  if (blobMesh) {
    blobMesh.geometry.dispose();
    blobMesh.material.dispose();
    blobMesh = null;
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
  morphUniform = null;
  hueShiftUniform = null;
  rendererReady = false;
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

  // Use WebGPURenderer — auto-falls back to WebGL if WebGPU unavailable
  renderer = new THREE.WebGPURenderer({ antialias: false, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(rW, rH);
  renderer.domElement.style.display = 'none';
  document.body.appendChild(renderer.domElement);

  readCanvas = document.createElement('canvas');
  readCanvas.width = rW; readCanvas.height = rH;
  readCtx = readCanvas.getContext('2d', { willReadFrequently: true });

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030308);

  camera = new THREE.PerspectiveCamera(50, rW / rH, 0.1, 100);

  // TSL Uniforms
  timeUniform = uniform(0.0);
  morphUniform = uniform(1.0);
  hueShiftUniform = uniform(0.0);

  // High-detail icosahedron for smooth organic deformation
  var geo = new THREE.IcosahedronGeometry(1.5, 64);

  // TSL position node — vertex displacement with layered noise
  var positionNode = Fn(function() {
    var pos = positionLocal.toVar();
    var n = normalize(pos).toVar();
    var t = timeUniform;

    // Layer 1: Large slow undulation
    var wave1 = sin(n.x.mul(3.0).add(t.mul(0.8)))
      .mul(cos(n.y.mul(2.5).add(t.mul(0.6))))
      .mul(sin(n.z.mul(2.0).add(t.mul(0.7))));

    // Layer 2: Medium frequency ripples
    var wave2 = sin(n.x.mul(6.0).add(n.y.mul(5.0)).add(t.mul(1.5)))
      .mul(cos(n.z.mul(7.0).sub(t.mul(1.2))));

    // Layer 3: Fine detail noise
    var wave3 = sin(n.x.mul(12.0).sub(n.z.mul(10.0)).add(t.mul(2.5)))
      .mul(sin(n.y.mul(11.0).add(t.mul(1.8))));

    // Morph intensity controls displacement amount
    var displacement = wave1.mul(0.35)
      .add(wave2.mul(0.15))
      .add(wave3.mul(0.08));
    displacement = displacement.mul(morphUniform);

    // Displace along normal direction
    var displaced = pos.add(n.mul(displacement));
    return displaced;
  })();

  // TSL color node — procedural coloring based on position and normal
  var colorNode = Fn(function() {
    var wPos = positionWorld.toVar();
    var n = normalize(normalLocal).toVar();
    var t = timeUniform;

    // Height-based hue cycling
    var hue = wPos.y.mul(0.15).add(t.mul(0.1)).add(hueShiftUniform);

    // Fresnel-like edge glow
    var viewDir = normalize(cameraPosition.sub(wPos));
    var fresnel = pow(float(1.0).sub(abs(dot(viewDir, n))), float(2.5));

    // Base color from hue cycling — vivid rainbow
    var r = sin(hue.mul(6.283)).mul(0.5).add(0.5);
    var g = sin(hue.mul(6.283).add(2.094)).mul(0.5).add(0.5);
    var b = sin(hue.mul(6.283).add(4.189)).mul(0.5).add(0.5);

    // Mix toward bright cyan/white at edges (fresnel)
    var baseColor = vec3(r, g, b);
    var edgeColor = vec3(0.6, 0.9, 1.0);
    var finalColor = mix(baseColor, edgeColor, fresnel.mul(0.7));

    // Boost brightness
    finalColor = finalColor.mul(1.3);

    return vec4(finalColor, float(1.0));
  })();

  // Create node material
  var mat = new THREE.MeshStandardNodeMaterial({
    roughness: 0.3,
    metalness: 0.6
  });
  mat.positionNode = positionNode;
  mat.colorNode = colorNode;

  blobMesh = new THREE.Mesh(geo, mat);
  scene.add(blobMesh);

  // Bright lights
  var ambient = new THREE.AmbientLight(0x667788, 1.2);
  scene.add(ambient);
  var dirLight1 = new THREE.DirectionalLight(0xffffff, 1.5);
  dirLight1.position.set(5, 8, 5);
  scene.add(dirLight1);
  var dirLight2 = new THREE.DirectionalLight(0x4488ff, 1.0);
  dirLight2.position.set(-5, -3, -5);
  scene.add(dirLight2);
  var pointLight = new THREE.PointLight(0xff4488, 1.5, 20);
  pointLight.position.set(3, 0, -3);
  scene.add(pointLight);

  camTheta = 0.5; camPhi = 0.7;
  morphTarget = 1.0; currentMorph = 1.0;
}

function initTslblob() {
  camTheta = 0.5; camPhi = 0.7;
  baseCamTheta = 0.5; baseCamPhi = 0.7;
  setupScene();
  rendererReady = false;
  // WebGPURenderer requires async init
  if (renderer && renderer.init) {
    renderer.init().then(function() {
      rendererReady = true;
    }).catch(function(err) {
      console.warn('WebGPU/WebGL init failed, tslblob unavailable:', err);
      // Don't set rendererReady — mode will show blank rather than throw every frame
    });
  } else {
    rendererReady = true;
  }
}

function renderTslblob() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer || !blobMesh || !rendererReady) return;

  // Click to toggle morph intensity
  if (pointer.clicked && state.currentMode === 'tslblob') {
    pointer.clicked = false;
    morphTarget = morphTarget > 0.5 ? 0.2 : 1.0;
  }

  // Smooth morph transition
  currentMorph += (morphTarget - currentMorph) * 0.05;

  // Drag to rotate camera
  if (pointer.down && state.currentMode === 'tslblob') {
    camTheta = baseCamTheta + (pointer.gx / W - 0.5) * Math.PI * 2;
    camPhi = baseCamPhi + (pointer.gy / H - 0.5) * Math.PI * 0.8;
  } else {
    baseCamTheta = camTheta;
    baseCamPhi = camPhi;
    camTheta += 0.004;
  }
  camPhi = Math.max(0.15, Math.min(Math.PI - 0.15, camPhi));

  camera.position.set(
    camDist * Math.sin(camPhi) * Math.cos(camTheta),
    camDist * Math.cos(camPhi),
    camDist * Math.sin(camPhi) * Math.sin(camTheta)
  );
  camera.lookAt(0, 0, 0);

  // Update TSL uniforms
  timeUniform.value = t;
  morphUniform.value = currentMorph;
  hueShiftUniform.value = Math.sin(t * 0.15) * 0.5;

  // Slow rotation of the blob itself
  blobMesh.rotation.y = t * 0.1;
  blobMesh.rotation.x = Math.sin(t * 0.07) * 0.2;

  // Render 3D scene
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
      if (lum < 0.01) continue;
      var ci = Math.min(RAMP_DENSE.length - 1, (lum * RAMP_DENSE.length) | 0);
      var peak = Math.max(r, g, b2, 1);
      var boost = Math.min(1.6, 255 / peak);
      drawChar(RAMP_DENSE[ci], x, y,
        (r * boost) | 0,
        (g * boost) | 0,
        (b2 * boost) | 0,
        Math.max(0.3, Math.min(1, lum * 2.0)));
    }
  }

  var label = '[tslblob] click:morph drag:rotate';
  var lx = W - label.length - 1;
  for (var li = 0; li < label.length; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 25);
  }
}

registerMode('tslblob', { init: initTslblob, render: renderTslblob, cleanup: disposeAll });
