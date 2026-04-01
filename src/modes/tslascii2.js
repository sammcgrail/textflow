import * as THREE from 'three/webgpu';
import { Fn, uniform, vec2, vec3, vec4, float, floor, fract, clamp, smoothstep, sin, cos, abs, max, min, mix, pow, length, select, texture, uv } from 'three/tsl';
import { clearCanvas } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// TSL ASCII 2 — GPU-based ASCII ocean with interference patterns
// Renders a procedural ocean scene then converts to ASCII glyphs entirely on GPU
var renderer = null;
var scene = null;
var postScene = null;
var camera = null;
var postCamera = null;
var renderTarget = null;
var glyphAtlas = null;
var timeUniform = null;
var mouseUniform = null;
var pulseUniform = null;
var gridSizeUniform = null;
var rendererReady = false;
var initGeneration = 0;
var visibleCanvas = null;
var pulseTarget = 0.0;
var currentPulse = 0.0;

var GLYPH_CHARS = ' .,:;~=+*#@';
var GLYPH_COLS = 11;
var GLYPH_TILE_W = 10; // glyph tile width (approx terminal char width)
var GLYPH_TILE_H = 20; // glyph tile height (approx terminal char height)

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
  timeUniform = null; mouseUniform = null; pulseUniform = null;
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
  // Flip atlas horizontally to compensate for GPU texture sampling direction
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
  pulseUniform = uniform(0.0);
  gridSizeUniform = uniform(new THREE.Vector2(W, H));

  // === Source scene: procedural ocean with interference ===
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  var sourceColorNode = Fn(function() {
    var fragUV = uv().toVar();
    var t = timeUniform;
    var mouse = mouseUniform;
    var pulse = pulseUniform;

    // Multiple wave sources creating interference
    var px = fragUV.x.mul(8.0);
    var py = fragUV.y.mul(6.0);

    // Wave source 1: center-left, slow
    var d1x = px.sub(2.0);
    var d1y = py.sub(3.0);
    var dist1 = length(vec2(d1x, d1y));
    var wave1 = sin(dist1.mul(3.0).sub(t.mul(1.5))).mul(float(0.4));

    // Wave source 2: top-right, medium
    var d2x = px.sub(6.0);
    var d2y = py.sub(1.0);
    var dist2 = length(vec2(d2x, d2y));
    var wave2 = sin(dist2.mul(4.0).sub(t.mul(2.0)).add(1.5)).mul(float(0.35));

    // Wave source 3: bottom, fast
    var d3x = px.sub(4.0);
    var d3y = py.sub(5.5);
    var dist3 = length(vec2(d3x, d3y));
    var wave3 = sin(dist3.mul(2.5).sub(t.mul(1.2)).add(3.0)).mul(float(0.3));

    // Wave source 4: mouse-driven ripple
    var mx = fragUV.x.sub(mouse.x);
    var my = fragUV.y.sub(float(1.0).sub(mouse.y));
    var mDist = length(vec2(mx, my)).mul(12.0);
    var mouseWave = sin(mDist.mul(5.0).sub(t.mul(3.0))).mul(float(0.5));
    var mouseFade = clamp(float(1.0).sub(mDist.mul(0.15)), float(0.0), float(1.0));
    mouseWave = mouseWave.mul(mouseFade);

    // Pulse wave from click — expanding ring
    var pulseDist = length(vec2(mx, my)).mul(8.0);
    var pulseWave = sin(pulseDist.mul(8.0).sub(pulse.mul(15.0))).mul(float(0.6));
    var pulseFade = clamp(pulse.mul(2.0).sub(pulseDist.mul(0.3)), float(0.0), float(1.0));
    pulseFade = pulseFade.mul(clamp(float(1.0).sub(pulse.mul(0.5)), float(0.0), float(1.0)));
    pulseWave = pulseWave.mul(pulseFade);

    // Combine waves — interference!
    var combined = wave1.add(wave2).add(wave3).add(mouseWave).add(pulseWave);

    // Horizontal flow ripples
    var flow = sin(px.mul(1.5).add(py.mul(0.5)).sub(t.mul(0.8)))
      .mul(cos(px.mul(0.7).sub(py.mul(1.2)).add(t.mul(0.5)))).mul(0.2);
    combined = combined.add(flow);

    // Normalize to 0-1 range
    var h = combined.mul(0.5).add(0.5);
    h = clamp(h, float(0.0), float(1.0));

    // Ocean color palette
    // Deep: dark blue, Mid: teal/cyan, Peaks: bright aqua/white
    var deepColor = vec3(0.02, 0.05, 0.15);
    var midColor = vec3(0.05, 0.25, 0.45);
    var shallowColor = vec3(0.1, 0.5, 0.7);
    var peakColor = vec3(0.4, 0.85, 0.95);
    var foamColor = vec3(0.7, 0.9, 1.0);

    // Multi-stop gradient
    var col = mix(deepColor, midColor, smoothstep(float(0.15), float(0.35), h));
    col = mix(col, shallowColor, smoothstep(float(0.35), float(0.55), h));
    col = mix(col, peakColor, smoothstep(float(0.55), float(0.75), h));
    col = mix(col, foamColor, smoothstep(float(0.75), float(0.9), h));

    // Caustic shimmer overlay
    var caustic = sin(px.mul(7.0).add(t.mul(1.3)))
      .mul(sin(py.mul(9.0).sub(t.mul(0.9))))
      .mul(sin(px.mul(5.0).sub(py.mul(3.0)).add(t.mul(1.7))));
    caustic = clamp(caustic.mul(0.3).add(0.5), float(0.0), float(1.0));
    var causticBoost = smoothstep(float(0.4), float(0.8), h).mul(caustic).mul(0.25);
    col = col.add(vec3(causticBoost, causticBoost.mul(0.8), causticBoost.mul(0.5)));

    // Moonlight streak
    var moonX = abs(fragUV.x.sub(0.5));
    var moonStreak = pow(clamp(float(1.0).sub(moonX.mul(4.0)), float(0.0), float(1.0)), float(3.0));
    moonStreak = moonStreak.mul(clamp(float(1.0).sub(fragUV.y), float(0.0), float(1.0)));
    moonStreak = moonStreak.mul(smoothstep(float(0.5), float(0.8), h)).mul(0.3);
    col = col.add(vec3(moonStreak.mul(0.5), moonStreak.mul(0.7), moonStreak));

    return vec4(col, float(1.0));
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
    var boosted = clamp(lum.mul(1.6), float(0.0), float(1.0));

    var glyphIndex = floor(boosted.mul(float(GLYPH_COLS - 1)).add(0.5));
    glyphIndex = clamp(glyphIndex, float(0.0), float(GLYPH_COLS - 1));

    var glyphU = glyphIndex.mul(float(1.0 / GLYPH_COLS)).add(localUV.x.mul(float(1.0 / GLYPH_COLS)));
    var glyphV = localUV.y;
    var glyphSample = texture(glyphAtlas, vec2(glyphU, glyphV));
    var glyphMask = glyphSample.r;

    var presence = smoothstep(float(0.02), float(0.08), boosted);

    // Color the characters with boosted source color
    var finalColor = sourceColor.rgb.mul(glyphMask).mul(presence).mul(1.6);

    // Add subtle glow for bright areas
    var glow = clamp(boosted.sub(0.4), float(0.0), float(0.6)).mul(0.2);
    finalColor = finalColor.add(sourceColor.rgb.mul(glow));

    return vec4(finalColor, float(1.0));
  })();

  var postMat = new THREE.MeshBasicNodeMaterial();
  postMat.colorNode = asciiColorNode;
  var postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  postScene.add(postQuad);

  pulseTarget = 0.0;
  currentPulse = 0.0;
}

function initTslascii2() {
  setupScene();
  rendererReady = false;
  initGeneration++;
  var gen = initGeneration;
  if (renderer && renderer.init) {
    renderer.init().then(function() {
      if (gen === initGeneration) rendererReady = true;
    }).catch(function(err) {
      console.warn('WebGPU/WebGL init failed, tslascii2 unavailable:', err);
    });
  } else {
    rendererReady = true;
  }
}

function renderTslascii2() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer || !rendererReady || !renderTarget) return;

  // Click for pulse wave
  if (pointer.clicked && state.currentMode === 'tslascii2') {
    pointer.clicked = false;
    pulseTarget = 0.01;
    mouseUniform.value.set(pointer.gx / W, pointer.gy / H);
  }

  // Drag to move mouse influence
  if (pointer.down && state.currentMode === 'tslascii2') {
    mouseUniform.value.set(pointer.gx / W, pointer.gy / H);
  }

  // Pulse animation
  if (pulseTarget > 0) {
    currentPulse += 0.016;
    if (currentPulse > 2.0) {
      pulseTarget = 0.0;
      currentPulse = 0.0;
    }
  }
  pulseUniform.value = currentPulse;
  timeUniform.value = t;

  try {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
  } catch (e) {
    if (!renderTslascii2._errCount) renderTslascii2._errCount = 0;
    if (renderTslascii2._errCount++ < 5) console.warn('tslascii2 render error:', e.message);
    return;
  }

  if (visibleCanvas) {
    var ctx = visibleCanvas.getContext('2d');
    // Flip vertically to correct WebGPU Y-axis orientation
    ctx.save();
    ctx.translate(0, visibleCanvas.height);
    ctx.scale(1, -1);
    ctx.drawImage(renderer.domElement, 0, 0, visibleCanvas.width, visibleCanvas.height);
    ctx.restore();

    // Draw mode label (after restore so it's not flipped)
    var fontSize = Math.max(10, Math.floor(visibleCanvas.height / H * 0.8));
    ctx.font = fontSize + 'px monospace';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('[tslascii2] click:pulse drag:ripple', visibleCanvas.width - 4, visibleCanvas.height - 4);
  }
}

registerMode('tslascii2', { init: initTslascii2, render: renderTslascii2, cleanup: disposeAll });
