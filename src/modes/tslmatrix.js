import * as THREE from 'three/webgpu';
import { Fn, uniform, vec2, vec3, vec4, float, floor, fract, clamp, smoothstep, sin, cos, abs, max, mix, pow, texture, uv } from 'three/tsl';
import { clearCanvas } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// TSL Matrix — GPU-based digital rain with ASCII glyph rendering
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

  // === Source scene: matrix digital rain ===
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  var sourceColorNode = Fn(function() {
    var fragUV = uv().toVar();
    var t = timeUniform;
    var mouse = mouseUniform;

    // Create column-based rain streams
    var col = floor(fragUV.x.mul(40.0));
    var colPhase = sin(col.mul(7.13)).mul(0.5).add(0.5);
    var colSpeed = float(0.5).add(colPhase.mul(1.5));
    var colOffset = sin(col.mul(13.37)).mul(100.0);

    // Rain drop position — scrolling downward
    var rainY = fract(fragUV.y.add(t.mul(colSpeed)).add(colOffset));

    // Head brightness — bright at the leading edge, fading trail
    var headDist = rainY;
    var brightness = pow(clamp(float(1.0).sub(headDist.mul(2.5)), float(0.0), float(1.0)), float(1.5));

    // Secondary rain layer for depth
    var col2Phase = sin(col.mul(11.7).add(3.0)).mul(0.5).add(0.5);
    var col2Speed = float(0.3).add(col2Phase.mul(1.0));
    var col2Offset = sin(col.mul(17.3)).mul(100.0);
    var rain2Y = fract(fragUV.y.add(t.mul(col2Speed)).add(col2Offset));
    var brightness2 = pow(clamp(float(1.0).sub(rain2Y.mul(3.0)), float(0.0), float(1.0)), float(2.0)).mul(0.5);

    // Combine layers
    var total = max(brightness, brightness2);

    // Random flicker per column
    var flicker = sin(t.mul(8.0).add(col.mul(3.7))).mul(0.1).add(0.9);
    total = total.mul(flicker);

    // Mouse glow — nearby columns get brighter
    var mx = fragUV.x.sub(mouse.x);
    var my = fragUV.y.sub(float(1.0).sub(mouse.y));
    var mDist = pow(mx.mul(mx).add(my.mul(my)), float(0.5));
    var mouseGlow = pow(clamp(float(1.0).sub(mDist.mul(3.0)), float(0.0), float(1.0)), float(2.0));
    total = total.add(mouseGlow.mul(0.4));

    total = clamp(total, float(0.0), float(1.0));

    // Matrix green color palette
    var r = total.mul(0.1);
    var g = total.mul(0.9);
    var b = total.mul(0.2);

    // Head of rain is white/bright green
    var headGlow = pow(clamp(float(1.0).sub(rainY.mul(5.0)), float(0.0), float(1.0)), float(3.0));
    r = r.add(headGlow.mul(0.6));
    g = g.add(headGlow.mul(0.3));
    b = b.add(headGlow.mul(0.5));

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
    var boosted = clamp(lum.mul(1.5), float(0.0), float(1.0));

    var glyphIndex = floor(boosted.mul(float(GLYPH_COLS - 1)).add(0.5));
    glyphIndex = clamp(glyphIndex, float(0.0), float(GLYPH_COLS - 1));

    var glyphU = glyphIndex.mul(float(1.0 / GLYPH_COLS)).add(localUV.x.mul(float(1.0 / GLYPH_COLS)));
    var glyphV = localUV.y;
    var glyphSample = texture(glyphAtlas, vec2(glyphU, glyphV));
    var glyphMask = glyphSample.r;

    var presence = smoothstep(float(0.02), float(0.1), boosted);
    var finalColor = sourceColor.rgb.mul(glyphMask).mul(presence).mul(1.5);
    var glow = clamp(boosted.sub(0.4), float(0.0), float(0.6)).mul(0.2);
    finalColor = finalColor.add(sourceColor.rgb.mul(glow));

    return vec4(finalColor, float(1.0));
  })();

  var postMat = new THREE.MeshBasicNodeMaterial();
  postMat.colorNode = asciiColorNode;
  var postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  postScene.add(postQuad);
}

function initTslmatrix() {
  setupScene();
  rendererReady = false;
  initGeneration++;
  var gen = initGeneration;
  if (renderer && renderer.init) {
    renderer.init().then(function() {
      if (gen === initGeneration) rendererReady = true;
    }).catch(function(err) {
      console.warn('WebGPU/WebGL init failed, tslmatrix unavailable:', err);
    });
  } else {
    rendererReady = true;
  }
}

function renderTslmatrix() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer || !rendererReady || !renderTarget) return;

  if (pointer.down && state.currentMode === 'tslmatrix') {
    mouseUniform.value.set(pointer.gx / W, pointer.gy / H);
  }
  timeUniform.value = t;

  try {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  } catch (e) {
    if (!renderTslmatrix._errCount) renderTslmatrix._errCount = 0;
    if (renderTslmatrix._errCount++ < 5) console.warn('tslmatrix render error:', e.message);
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
    ctx.fillText('[tslmatrix] drag:glow', visibleCanvas.width - 4, visibleCanvas.height - 4);
  }
}

registerMode('tslmatrix', { init: initTslmatrix, render: renderTslmatrix, cleanup: disposeAll });
