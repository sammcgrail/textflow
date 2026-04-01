import * as THREE from 'three/webgpu';
import { Fn, uniform, vec2, vec3, vec4, float, int, floor, fract, clamp, smoothstep, sin, cos, abs, max, mix, pow, select, texture, uv } from 'three/tsl';
import { clearCanvas } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// TSL ASCII — GPU-based ASCII renderer using TSL post-processing
// Renders a procedural scene then converts to ASCII glyphs entirely on GPU
// Inspired by codetaur's asciiMaterial.ts
var renderer = null;
var scene = null;        // Procedural source scene
var postScene = null;    // Fullscreen quad for ASCII post-process
var camera = null;
var postCamera = null;
var renderTarget = null;
var glyphAtlas = null;
var timeUniform = null;
var mouseUniform = null;
var gridSizeUniform = null;
var viewportUniform = null;
var rendererReady = false;
var initGeneration = 0;
var visibleCanvas = null;

var GLYPH_CHARS = ' .:-=+*#%@$';
var GLYPH_COLS = 11; // number of glyphs
var GLYPH_TILE = 16; // pixels per glyph tile

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
  gridSizeUniform = null; viewportUniform = null;
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
  // Generate a glyph atlas texture from canvas
  var atlasW = GLYPH_COLS * GLYPH_TILE;
  var atlasH = GLYPH_TILE;
  var c = document.createElement('canvas');
  c.width = atlasW; c.height = atlasH;
  var ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, atlasW, atlasH);
  ctx.fillStyle = '#fff';
  ctx.font = (GLYPH_TILE - 2) + 'px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (var i = 0; i < GLYPH_CHARS.length; i++) {
    ctx.fillText(GLYPH_CHARS[i], i * GLYPH_TILE + GLYPH_TILE / 2, GLYPH_TILE / 2 + 1);
  }
  var tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.flipY = false;
  tex.needsUpdate = true;
  return tex;
}

function setupScene() {
  var W = state.COLS, H = state.ROWS;
  // Calculate visible canvas size to fill the main canvas area
  var canvasW = state.canvas.width;
  var canvasH = state.canvas.height;
  disposeAll();

  renderer = new THREE.WebGPURenderer({ antialias: false, alpha: false, preserveDrawingBuffer: true });
  renderer.setSize(canvasW, canvasH);
  renderer.domElement.style.display = 'none';
  document.body.appendChild(renderer.domElement);

  // Create visible canvas overlaying the main one
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

  // Render target for the procedural source scene
  var rtW = W * 2, rtH = H * 2;
  renderTarget = new THREE.RenderTarget(rtW, rtH, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat
  });

  // Generate glyph atlas
  glyphAtlas = createGlyphAtlas();

  // Uniforms
  timeUniform = uniform(0.0);
  mouseUniform = uniform(new THREE.Vector2(0.5, 0.5));
  gridSizeUniform = uniform(new THREE.Vector2(W, H));
  viewportUniform = uniform(new THREE.Vector2(canvasW, canvasH));

  // === Source scene: procedural flowing fire/plasma ===
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  var sourceColorNode = Fn(function() {
    var fragUV = uv().toVar();
    var t = timeUniform;
    var mouse = mouseUniform;
    var px = fragUV.x.mul(6.0);
    var py = fragUV.y.mul(4.0).sub(t.mul(0.7));

    // Multi-octave noise for fire
    var n1 = sin(px.mul(1.2).add(t.mul(0.5))).mul(cos(py.mul(1.5).add(t.mul(0.3))))
      .add(sin(px.mul(0.8).sub(py.mul(1.1)).add(t.mul(0.4))));
    var n2 = sin(px.mul(2.8).add(t.mul(1.2))).mul(cos(py.mul(3.0).sub(t.mul(0.8))))
      .add(sin(px.mul(3.5).add(py.mul(2.0)).add(t.mul(1.0))));
    var n3 = sin(px.mul(5.5).sub(t.mul(1.6))).mul(cos(py.mul(7.0).add(t.mul(1.3))));
    var n4 = sin(px.mul(11.0).add(t.mul(2.8))).mul(cos(py.mul(13.0).sub(t.mul(2.2))));

    var noise = n1.mul(0.45).add(n2.mul(0.25)).add(n3.mul(0.15)).add(n4.mul(0.08));

    // Vertical heat fade
    var vFade = float(1.0).sub(fragUV.y).mul(1.6);
    vFade = clamp(vFade, float(0.0), float(1.8));

    // Swirling distortion
    var swirl = sin(fragUV.x.mul(9.0).add(t.mul(0.7)).add(noise.mul(2.5)))
      .mul(cos(fragUV.y.mul(7.0).sub(t.mul(0.5)))).mul(0.35);

    var fire = noise.add(swirl).mul(vFade).add(0.15);

    // Mouse heat
    var dx = fragUV.x.sub(mouse.x);
    var dy = fragUV.y.sub(float(1.0).sub(mouse.y));
    var mDist = dx.mul(dx).add(dy.mul(dy));
    var mHeat = pow(clamp(float(1.0).sub(mDist.mul(6.0)), float(0.0), float(1.0)), float(2.0));
    fire = fire.add(mHeat.mul(0.6));

    fire = clamp(fire, float(0.0), float(2.5));

    // Fire color ramp
    var r = clamp(fire.mul(2.5), float(0.0), float(1.0));
    var g = clamp(fire.mul(2.5).sub(0.8), float(0.0), float(1.0));
    var b = clamp(fire.mul(2.5).sub(1.8), float(0.0), float(1.0));
    // Cool undertone
    var cool = clamp(float(0.25).sub(fire), float(0.0), float(0.25));
    b = b.add(cool.mul(1.0));
    r = r.add(cool.mul(0.4));
    // Hotspot boost
    var hot = clamp(fire.sub(1.2), float(0.0), float(1.0));
    r = r.add(hot.mul(0.4));
    g = g.add(hot.mul(0.35));
    b = b.add(hot.mul(0.15));

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

    // Grid cell coordinates
    var cellCoord = screenUV.mul(gridSizeUniform);
    var cell = floor(cellCoord);
    var localUV = fract(cellCoord);

    // Sample source scene at cell center
    var cellCenterUV = cell.add(vec2(0.5, 0.5)).div(gridSizeUniform);
    var sampleUV = vec2(cellCenterUV.x, float(1.0).sub(cellCenterUV.y));
    var sourceColor = texture(renderTarget.texture, sampleUV);

    // Compute luminance
    var lum = sourceColor.r.mul(0.299).add(sourceColor.g.mul(0.587)).add(sourceColor.b.mul(0.114));
    var boosted = clamp(lum.mul(1.3), float(0.0), float(1.0));

    // Map luminance to glyph index (0-10)
    var glyphIndex = floor(boosted.mul(float(GLYPH_COLS - 1)).add(0.5));
    glyphIndex = clamp(glyphIndex, float(0.0), float(GLYPH_COLS - 1));

    // Sample glyph from atlas
    var glyphU = glyphIndex.mul(float(1.0 / GLYPH_COLS)).add(localUV.x.mul(float(1.0 / GLYPH_COLS)));
    var glyphV = localUV.y;
    var glyphSample = texture(glyphAtlas, vec2(glyphU, glyphV));
    var glyphMask = glyphSample.r;

    // Presence fade — don't show glyphs for very dark areas
    var presence = smoothstep(float(0.03), float(0.12), boosted);

    // Final color: source color * glyph mask * presence
    var finalColor = sourceColor.rgb.mul(glyphMask).mul(presence).mul(1.4);

    // Add subtle glow around bright characters
    var glow = clamp(boosted.sub(0.5), float(0.0), float(0.5)).mul(0.15);
    finalColor = finalColor.add(sourceColor.rgb.mul(glow));

    return vec4(finalColor, float(1.0));
  })();

  var postMat = new THREE.MeshBasicNodeMaterial();
  postMat.colorNode = asciiColorNode;
  var postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  postScene.add(postQuad);
}

function initTslascii() {
  setupScene();
  rendererReady = false;
  initGeneration++;
  var gen = initGeneration;
  if (renderer && renderer.init) {
    renderer.init().then(function() {
      if (gen === initGeneration) rendererReady = true;
    }).catch(function(err) {
      console.warn('WebGPU/WebGL init failed, tslascii unavailable:', err);
    });
  } else {
    rendererReady = true;
  }
}

function renderTslascii() {
  // Clear the textflow canvas (we're overlaying our own)
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  if (!renderer || !rendererReady || !renderTarget) return;

  // Update mouse
  if (pointer.down && state.currentMode === 'tslascii') {
    mouseUniform.value.set(pointer.gx / W, pointer.gy / H);
  }
  timeUniform.value = t;

  // 1. Render source scene to render target
  try {
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    // 2. Render ASCII post-process to screen
    renderer.render(postScene, postCamera);
  } catch (e) {
    if (!renderTslascii._errCount) renderTslascii._errCount = 0;
    if (renderTslascii._errCount++ < 5) console.warn('tslascii render error:', e.message);
    return;
  }

  // Copy renderer output to our visible overlay canvas
  if (visibleCanvas) {
    var ctx = visibleCanvas.getContext('2d');
    ctx.drawImage(renderer.domElement, 0, 0, visibleCanvas.width, visibleCanvas.height);

    // Draw mode label on overlay canvas
    var fontSize = Math.max(10, Math.floor(visibleCanvas.height / H * 0.8));
    ctx.font = fontSize + 'px monospace';
    ctx.textBaseline = 'bottom';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('[tslascii] drag:heat', visibleCanvas.width - 4, visibleCanvas.height - 4);
  }
}

registerMode('tslascii', { init: initTslascii, render: renderTslascii, cleanup: disposeAll });
