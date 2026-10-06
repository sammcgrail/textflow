import * as THREE from 'three';
import { drawChar } from './draw.js';
import { state } from './state.js';

// gpufield — run a fragment shader at exactly one pixel per character cell,
// read it back, and turn each pixel into a glyph.
//
// The heavy maths (escape-time fractals, raymarched distance fields) lives on
// the GPU, so the JS side of a frame is one tiny readPixels (COLS x ROWS RGBA,
// ~17k pixels at 1440p, ~3k on a phone) plus the per-cell drawChar loop that
// every mode pays anyway. No 2D canvas round-trip, no getImageData, and the
// readback is asynchronous so the page never blocks waiting on the GPU.
//
// Shader contract: write the cell colour to rgb and the glyph density to a.
// a picks the character from the ramp; a below ~3% leaves the cell empty.
// Uniforms uRes (grid size in cells) and uAspect (screen width / height in
// real pixels, so cells that are taller than wide do not stretch the picture)
// are provided; everything else is the mode's own.

var VERT = [
  'varying vec2 vUv;',
  'void main() {',
  '  vUv = position.xy * 0.5 + 0.5;',
  '  gl_Position = vec4(position.xy, 0.0, 1.0);',
  '}'
].join('\n');

export var FIELD_RAMP = ' .:-=+*#%@';

export function createGpuField(fragmentShader, uniforms) {
  var renderer = new THREE.WebGLRenderer({
    antialias: false, alpha: false, depth: false, stencil: false,
    powerPreference: 'high-performance'
  });
  renderer.setSize(1, 1, false);
  renderer.domElement.style.display = 'none';

  uniforms.uRes = { value: new THREE.Vector2(1, 1) };
  uniforms.uAspect = { value: 1 };

  var material = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: fragmentShader,
    uniforms: uniforms,
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending
  });
  // one oversized triangle covers clip space with no diagonal seam
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(
    new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  var mesh = new THREE.Mesh(geo, material);
  mesh.frustumCulled = false;
  var scene = new THREE.Scene();
  scene.add(mesh);
  var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  var target = null;
  var tW = 0, tH = 0;
  // Double-buffered async readback. The GPU fills `back` through a pixel pack
  // buffer + fence while the page keeps drawing the last finished frame from
  // `front`, so a slow GPU lowers the fractal's own frame rate instead of
  // stalling the whole page inside a synchronous readPixels.
  var front = null, back = null;
  var fW = 0, fH = 0;
  var pending = false;
  var alive = true;

  function ensureSize(W, H) {
    if (target && tW === W && tH === H) return;
    tW = W; tH = H;
    if (target) target.dispose();
    target = new THREE.WebGLRenderTarget(W, H, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: false,
      stencilBuffer: false
    });
  }

  function kick(W, H) {
    ensureSize(W, H);
    uniforms.uRes.value.set(W, H);
    uniforms.uAspect.value = (W * state.CHAR_W) / Math.max(1, H * state.CHAR_H);
    if (!back || back.length !== W * H * 4) back = new Uint8Array(W * H * 4);

    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);

    if (!renderer.readRenderTargetPixelsAsync) {
      renderer.readRenderTargetPixels(target, 0, 0, W, H, back);
      var tmp = front; front = back; back = tmp; fW = W; fH = H;
      return;
    }
    pending = true;
    renderer.readRenderTargetPixelsAsync(target, 0, 0, W, H, back).then(function () {
      if (!alive) return;
      var tmp = front; front = back; back = tmp; fW = W; fH = H;
      pending = false;
    }, function () {
      pending = false;
    });
  }

  return {
    uniforms: uniforms,

    // Render the shader into the grid and draw it. ramp is optional.
    draw: function (ramp) {
      var W = state.COLS, H = state.ROWS;
      if (W < 1 || H < 1) return;
      if (!pending) kick(W, H);
      // a frame read at another grid size would land on the wrong cells
      if (!front || fW !== W || fH !== H) return;

      var buf = front;
      var R = ramp || FIELD_RAMP;
      var RL = R.length;
      for (var y = 0; y < H; y++) {
        // GL rows run bottom-up
        var row = (H - 1 - y) * W * 4;
        for (var x = 0; x < W; x++) {
          var i = row + x * 4;
          var a = buf[i + 3];
          if (a < 8) continue;
          var ci = ((a * RL) >> 8);
          if (ci < 1) ci = 1;
          drawChar(R[ci], x, y, buf[i], buf[i + 1], buf[i + 2], 1);
        }
      }
    },

    dispose: function () {
      alive = false;
      if (target) { target.dispose(); target = null; }
      geo.dispose();
      material.dispose();
      renderer.dispose();
      // free the context now rather than waiting for GC — browsers cap live
      // WebGL contexts and the main renderer holds one already
      renderer.forceContextLoss();
      front = back = null;
    }
  };
}
