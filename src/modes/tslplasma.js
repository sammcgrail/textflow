import * as THREE from 'three/webgpu';
import { Fn, uniform, vec2, vec3, vec4, float, floor, fract, clamp, smoothstep, sin, cos, abs, max, mix, pow, texture, uv } from 'three/tsl';
import { clearCanvas } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// TSL Plasma — GPU-based psychedelic plasma with ASCII glyph rendering
var renderer = null;
var scene = null;
var postScene = null;
var camera = null;
var postCamera = null;
var renderTarget = null;
var glyphAtlas = null;
var timeUniform = null;
var mouseUniform = null;
var gridSizeUniform = null;
var rendererReady = false;
var initGeneration = 0;
var visibleCanvas = null;

var GLYPH_CHARS = ' .:-=+*#%@$';
var GLYPH_COLS = 11;
var GLYPH_TILE_W = 10;
var GLYPH_TILE_H = 20;

function disposeAll() {
  if (renderTarget) { renderTarget.dispose(); renderTarget = null; }
  if (glyphAtlas) { glyphAtlas.dispose(); glyphAtlas = null; }
  if (scene) {
    scene.traverse(function(obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) { obj.material.dispose(); }
    });
    scene = null;
  }
  if (postScene) {
    postScene.traverse(function(obj) {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) { obj.material.dispose(); }
    });
    postScene = null;
  }
  camera = null; postCamera = null;
  timeUniform = null; mouseUniform = null;
  gridSizeUniform = null;
  rendererReady = false;
  if (visibleCanvas) {
    if (visibleCanvas.parentNode) visibleCanvas.parentNode.removeChild(visibleCanvas);
    visibleCanvas = null;
  }
  if (renderer) {
    if (renderer.domElement && renderer.domElement.parentNode) {
      renderer.domElement.parentNode.removeChild(renderer.domElement);
    }
    renderer.dispose();
    renderer = null;
  }
}

function createGlyphAtlas() {
  var atlasW = GLYPH_COLS * GLYPH_TILE_W;
  var atlasH = GLYPH_TILE_H;
  var c = document.createElement('canvas');
  c.width = atlasW; c.height = atlasH;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, atlasW, atlasH);
  ctx.fillStyle = '#fff';
  ctx.font = (GLYPH_TILE_H - 4) + 'px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (var i = 0; i < GLYPH_CHARS.length; i++) {
    ctx.fillText(GLYPH_CHARS[i], i * GLYPH_TILE_W + GLYPH_TILE_W / 2, GLYPH_TILE_H / 2 + 1);
  }
  var flipCanvas = document.createElement('canvas');
  flipCanvas.width = atlasW; flipCanvas.height = atlasH;
  var flipCtx = flipCanvas.getContext('2d');
  flipCtx.translate(atlasW, 0);
  flipCtx.scale(-1, 1);
  flipCtx.drawImage(c, 0, 0);
  var tex = new THREE.CanvasTexture(flipCanvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function setupScene() {
  var W = state.COLS, H = state.ROWS;
  var canvasW = state.canvas.width;
  var canvasH = state.canvas.height;
  disposeAll();

  renderer = new THREE.WebGPURenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(canvasW, canvasH);
  renderer.domElement.style.display = 'none';
  document.body.appendChild(renderer.domElement);

  visibleCanvas = document.createElement('canvas');
  visibleCanvas.width = canvasW;
  visibleCanvas.height = canvasH;
  visibleCanvas.style.position = 'fixed';
  visibleCanvas.style.left = '0';
  visibleCanvas.style.top = state.NAV_H + 'px';
  visibleCanvas.style.width = '100%';
  visibleCanvas.style.height = 'calc(100% - ' + (state.NAV_H + 14) + 'px)';
  visibleCanvas.style.zIndex = '5';
  visibleCanvas.style.pointerEvents = 'none';
  visibleCanvas.style.imageRendering = 'pixelated';
  document.body.appendChild(visibleCanvas);

  var rtW = W * 2, rtH = H * 2;
  renderTarget = new THREE.RenderTarget(rtW, rtH, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
  });

  glyphAtlas = createGlyphAtlas();

  timeUniform = uniform(0.0);
  mouseUniform = uniform(new THREE.Vector2(0.5, 0.5));
  gridSizeUniform = uniform(new THREE.Vector2(W, H));

  // === Source scene: psychedelic plasma ===
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  var sourceColorNode = Fn(function() {
    var fragUV = uv().toVar();
    var t = timeUniform;
    var mouse = mouseUniform;

    var px = fragUV.x.mul(8.0);
    var py = fragUV.y.mul(6.0);

    // Classic plasma — sum of sines at different frequencies and phases
    var p1 = sin(px.mul(1.0).add(t.mul(0.7)));
    var p2 = sin(py.mul(1.2).sub(t.mul(0.5)));
    var p3 = sin(px.add(py).mul(0.7).add(t.mul(0.9)));
    var p4 = sin(pow(px.mul(px).add(py.mul(py)), float(0.5)).mul(1.5).sub(t.mul(1.2)));

    // Second layer — higher frequency
    var p5 = sin(px.mul(2.5).sub(py.mul(1.8)).add(t.mul(1.5))).mul(0.5);
    var p6 = cos(px.mul(1.8).add(py.mul(2.2)).sub(t.mul(1.1))).mul(0.5);

    // Combine
    var plasma = p1.add(p2).add(p3).add(p4).add(p5).add(p6);
    plasma = plasma.mul(0.15).add(0.5);

    // Mouse distortion — warp the plasma near cursor
    var mx = fragUV.x.sub(mouse.x);
    var my = fragUV.y.sub(float(1.0).sub(mouse.y));
    var mDist = pow(mx.mul(mx).add(my.mul(my)), float(0.5));
    var warp = sin(mDist.mul(20.0).sub(t.mul(4.0))).mul(0.3);
    var warpFade = pow(clamp(float(1.0).sub(mDist.mul(3.0)), float(0.0), float(1.0)), float(2.0));
    plasma = plasma.add(warp.mul(warpFade));

    plasma = clamp(plasma, float(0.0), float(1.0));

    // Rainbow color mapping — 3 phase-shifted sines
    var r = sin(plasma.mul(6.283).add(0.0)).mul(0.5).add(0.5);
    var g = sin(plasma.mul(6.283).add(2.094)).mul(0.5).add(0.5);
    var b = sin(plasma.mul(6.283).add(4.189)).mul(0.5).add(0.5);

    // Boost saturation and brightness
    r = pow(r, float(0.8)).mul(1.2);
    g = pow(g, float(0.8)).mul(1.2);
    b = pow(b, float(0.8)).mul(1.2);

    r = clamp(r, float(0.0), float(1.0));
    g = clamp(g, float(0.0), float(1.0));
    b = clamp(b, float(0.0), float(1.0));

    return vec4(r, g, b, float(1.0));
  })();

  var sourceMat = new THREE.MeshBasicNodeMaterial();
  sourceMat.colorNode = sourceColorNode;
  var sourceQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), sourceMat);
  scene.add(sourceQuad);

  // === Post-processing scene: ASCII conversion ===
  postScene = new THREE.Scene();
  postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  var asciiColorNode = Fn(function() {
    var fragUV = uv().toVar();
    var screenUV = vec2(fragUV.x, float(1.0).sub(fragUV.y));
    var cellCoord = screenUV.mul(gridSizeUniform);
    var cell = floor(cellCoord);
    var localUV = fract(cellCoord);
    var cellCenterUV = cell.add(vec2(0.5, 0.5)).div(gridSizeUniform);
    var sampleUV = vec2(cellCenterUV.x, float(1.0).sub(cellCenterUV.y));
    var sourceColor = texture(renderTarget.texture, sampleUV);

    var lum = sourceColor.r.mul(0.299).add(sourceColor.g.mul(0.587)).add(sourceColor.b.mul(0.114));
    var boosted = clamp(lum.mul(1.4), float(0.0), float(1.0));

    var glyphIndex = floor(boosted.mul(float(GLYPH_COLS - 1)).add(0.5));
    glyphIndex = clamp(glyphIndex, float(0.0), float(GLYPH_COLS - 1));

    var glyphU = glyphIndex.mul(float(1.0 / GLYPH_COLS)).add(localUV.x.mul(float(1.0 / GLYPH_COLS)));
    var glyphV = localUV.y;
    var glyphSample = texture(glyphAtlas, vec2(glyphU, glyphV));
    var glyphMask = glyphSample.r;

    var presence = smoothstep(float(0.02), float(0.1), boosted);
    var finalColor = sourceColor.rgb.mul(glyphMask).mul(presence).mul(1.4);
    var glow = clamp(boosted.sub(0.3), float(0.0), float(0.7)).mul(0.2);
    finalColor = finalColor.add(sourceColor.rgb.mul(glow));

    return vec4(finalColor, float(1.0));
  })();

  var postMat = new THREE.MeshBasicNodeMaterial();
  postMat.colorNode = asciiColorNode;
  var postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  postScene.add(postQuad);
}

function initTslplasma() {
  setupScene();
  rendererReady = false;
  initGeneration++;
  var gen = initGeneration;
  if (renderer && renderer.init) {
    renderer.init().then(function() {
      if (gen === initGeneration) rendererReady = true;
    }).catch(function(err) {
      console.warn('WebGPU/WebGL init failed, tslplasma unavailable:', err);
    });
  } else {
    rendererReady = true;
  }
}

function renderTslplasma() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer || !rendererReady || !renderTarget) return;

  if (pointer.down && state.currentMode === 'tslplasma') {
    mouseUniform.value.set(pointer.gx / W, pointer.gy / H);
  }
  timeUniform.value = t;

  try {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  } catch (e) {
    if (!renderTslplasma._errCount) renderTslplasma._errCount = 0;
    if (renderTslplasma._errCount++ < 5) console.warn('tslplasma render error:', e.message);
    return;
  }

  if (visibleCanvas) {
    var ctx = visibleCanvas.getContext('2d');
    ctx.save();
    ctx.translate(0, visibleCanvas.height);
    ctx.scale(1, -1);
    ctx.drawImage(renderer.domElement, 0, 0, visibleCanvas.width, visibleCanvas.height);
    ctx.restore();
    var fontSize = Math.max(10, Math.floor(visibleCanvas.height / H * 0.8));
    ctx.font = fontSize + 'px monospace';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('[tslplasma] drag:warp', visibleCanvas.width - 4, visibleCanvas.height - 4);
  }
}

registerMode('tslplasma', { init: initTslplasma, render: renderTslplasma, cleanup: disposeAll });
