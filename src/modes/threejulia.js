import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { resize } from '../core/canvas.js';
import { createGpuField } from '../core/gpufield.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// threejulia — a Julia set that never holds still.
//
// The constant c walks the boundary of the Mandelbrot main cardioid,
// c = e^(i*th)/2 - e^(2i*th)/4, breathing slightly in and out of it. That
// boundary is exactly where Julia sets change character, so the picture keeps
// morphing between fat connected blobs, spiralling dendrites and Fatou dust
// instead of drifting through one shape.
//
// All 4x supersampled escape-time iteration happens in a fragment shader at one
// pixel per character, so it costs the CPU nothing beyond the glyph loop.
// Outside: smooth iteration count through a neon cosine palette. Inside: an
// orbit trap, so the filled set has its own shimmering structure instead of
// being a flat hole.
//
// Drag: steer c yourself (the set follows your finger). Tap: next palette.

var FRAG = [
  'precision highp float;',
  'varying vec2 vUv;',
  'uniform vec2 uRes;',
  'uniform float uAspect;',
  'uniform float uTime;',
  'uniform vec2 uC;',
  'uniform float uZoom;',
  'uniform float uRot;',
  'uniform float uPal;',
  '',
  'vec3 pal(float t) {',
  '  vec3 c = vec3(1.0), d;',
  '  if (uPal < 0.5)      { d = vec3(0.00, 0.33, 0.67); }',               // full rainbow
  '  else if (uPal < 1.5) { c = vec3(1.0, 1.0, 0.5); d = vec3(0.80, 0.90, 0.30); }',  // acid
  '  else if (uPal < 2.5) { c = vec3(1.0, 0.7, 0.4); d = vec3(0.00, 0.15, 0.20); }',  // sunset
  '  else                 { c = vec3(2.0, 1.0, 0.0); d = vec3(0.50, 0.20, 0.25); }',  // candy
  '  return 0.5 + 0.5 * cos(6.28318 * (c * t + d));',
  '}',
  '',
  'void main() {',
  '  vec3 col = vec3(0.0);',
  '  float dens = 0.0;',
  '  float cs = cos(uRot), sn = sin(uRot);',
  '  for (int s = 0; s < 4; s++) {',
  '    vec2 o = vec2(s == 1 || s == 3 ? 0.25 : -0.25, s >= 2 ? 0.25 : -0.25) / uRes;',
  '    vec2 q = (vUv + o - 0.5) * vec2(uAspect, 1.0) * uZoom;',
  '    vec2 z = vec2(q.x * cs - q.y * sn, q.x * sn + q.y * cs);',
  '    float trap = 1e9;',
  '    float n = 0.0;',
  '    bool esc = false;',
  '    for (int i = 0; i < 180; i++) {',
  '      z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + uC;',
  '      float m = dot(z, z);',
  '      trap = min(trap, abs(m - 0.35));',
  '      if (m > 256.0) { esc = true; break; }',
  '      n += 1.0;',
  '    }',
  '    if (esc) {',
  '      float sn2 = n - log2(log2(dot(z, z))) + 4.0;',
  '      float k = clamp(sn2 / 45.0, 0.0, 1.0);',
  '      col += pal(sn2 * 0.035 + uTime * 0.08) * (0.25 + 0.9 * sqrt(k));',
  // steep curve: far field stays black, filaments near the set light up
  '      dens += pow(k, 1.7) * 1.4;',
  '    } else {',
  '      float tt = sqrt(trap);',
  // inside: contour lines of the orbit trap rippling outward, so the filled
  // set is alive instead of a solid block competing with the boundary
  '      float rip = sin(tt * 14.0 - uTime * 2.2);',
  '      col += pal(tt * 0.45 - uTime * 0.07 + 0.5) * (0.6 + 0.4 * rip);',
  '      dens += 0.3 + 0.4 * rip * rip;',
  '    }',
  '  }',
  '  col *= 0.25; dens *= 0.25;',
  // push towards full saturation and keep it bright: glyphs are thin, so a
  // muted colour reads as grey once it is only a few pixels wide
  '  float mx = max(col.r, max(col.g, col.b));',
  '  col = col / max(mx, 1e-3) * mix(0.55, 1.0, clamp(mx * 1.3, 0.0, 1.0));',
  '  gl_FragColor = vec4(col, clamp(dens, 0.0, 1.0));',
  '}'
].join('\n');

var PALETTES = ['rainbow', 'acid', 'sunset', 'candy'];

var field = null;
var jPal = 0;
var jCx = -0.4, jCy = 0.6;
var jHold = 0;
var jTh = 0;

function initThreejulia() {
  if (field) { field.dispose(); field = null; }
  // denser grid: the fractal is the subject and the shader does the work, so
  // the extra cells cost the GPU almost nothing. Restored in cleanup.
  state.FONT_SCALE = 0.85;
  resize();
  field = createGpuField(FRAG, {
    uTime: { value: 0 },
    uC: { value: { x: jCx, y: jCy } },
    uZoom: { value: 3.0 },
    uRot: { value: 0 },
    uPal: { value: 0 }
  });
  jPal = 0;
  jHold = 0;
  jTh = 2.1;
}

function cleanupThreejulia() {
  if (field) { field.dispose(); field = null; }
  if (state.FONT_SCALE !== 1) {
    state.FONT_SCALE = 1;
    resize();
  }
}

function renderThreejulia() {
  clearCanvas();
  if (!field) return;
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var mine = state.currentMode === 'threejulia';

  if (pointer.clicked && mine) {
    pointer.clicked = false;
    jPal = (jPal + 1) % PALETTES.length;
  }

  var tx, ty;
  if (pointer.down && mine) {
    // finger maps onto the interesting window of c-space
    tx = -1.6 + (pointer.gx / Math.max(1, W - 1)) * 2.1;
    ty = -1.05 + (pointer.gy / Math.max(1, H - 1)) * 2.1;
    jHold = 2.5;
  } else {
    // resume the cardioid walk from wherever it is, after a short hold so
    // a shape the user found does not get snatched away the moment they let go
    if (jHold > 0) jHold -= 1 / 60;
    else jTh += 0.0035;
    var br = 1.0 + 0.035 * Math.sin(t * 0.37);
    tx = (0.5 * Math.cos(jTh) - 0.25 * Math.cos(2 * jTh)) * br;
    ty = (0.5 * Math.sin(jTh) - 0.25 * Math.sin(2 * jTh)) * br;
  }
  var k = pointer.down && mine ? 0.25 : (jHold > 0 ? 0 : 0.05);
  jCx += (tx - jCx) * k;
  jCy += (ty - jCy) * k;

  var u = field.uniforms;
  u.uTime.value = t;
  u.uC.value = { x: jCx, y: jCy };
  u.uZoom.value = 2.4 + 0.3 * Math.sin(t * 0.21);
  u.uRot.value = t * 0.06;
  u.uPal.value = jPal;
  field.draw();

  var label = '[threejulia] ' + PALETTES[jPal] + '  drag:steer c  tap:palette';
  var lx = Math.max(0, W - label.length - 1);
  for (var c = Math.max(0, lx - 1); c < W; c++) drawCharHSL('#', c, H - 1, 0, 0, 3);
  for (var li = 0; li < label.length && lx + li < W; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 55);
  }
}

registerMode('threejulia', {
  init: initThreejulia, render: renderThreejulia, cleanup: cleanupThreejulia
});
