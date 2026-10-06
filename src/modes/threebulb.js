import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { resize } from '../core/canvas.js';
import { createGpuField } from '../core/gpufield.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// threebulb — a Mandelbulb whose power breathes.
//
// The bulb is raymarched in a fragment shader at one pixel per character cell.
// Its exponent swings between 2 and 8, so the solid melts from a smooth
// lumpy apple into the familiar many-lobed cauliflower and back. Colour comes
// from an orbit trap, so the iridescence is glued to the surface and flows
// across it as the power changes, with a complementary fresnel rim and a
// halo of near misses around the silhouette.
//
// Drag: orbit the camera. Tap: next palette. Release and it keeps spinning.

var FRAG = [
  'precision highp float;',
  'varying vec2 vUv;',
  'uniform vec2 uRes;',
  'uniform float uAspect;',
  'uniform float uTime;',
  'uniform float uPow;',
  'uniform float uYaw;',
  'uniform float uPitch;',
  'uniform float uPal;',
  '',
  'vec3 pal(float t) {',
  '  vec3 c = vec3(1.0), d;',
  '  if (uPal < 0.5)      { d = vec3(0.00, 0.33, 0.67); }',
  '  else if (uPal < 1.5) { c = vec3(1.0, 1.0, 0.5); d = vec3(0.80, 0.90, 0.30); }',
  '  else if (uPal < 2.5) { c = vec3(2.0, 1.0, 0.0); d = vec3(0.50, 0.20, 0.25); }',
  '  else                 { c = vec3(1.0, 0.7, 0.4); d = vec3(0.00, 0.15, 0.20); }',
  '  return 0.5 + 0.5 * cos(6.28318 * (c * t + d));',
  '}',
  '',
  'float de(vec3 p, out float trap) {',
  '  vec3 z = p;',
  '  float dr = 1.0, r = 0.0;',
  '  trap = 1e9;',
  '  for (int i = 0; i < 5; i++) {',
  '    r = length(z);',
  '    if (r > 2.0) break;',
  '    float th = acos(clamp(z.z / r, -1.0, 1.0)) * uPow;',
  '    float ph = atan(z.y, z.x) * uPow;',
  '    dr = pow(r, uPow - 1.0) * uPow * dr + 1.0;',
  '    float zr = pow(r, uPow);',
  '    z = zr * vec3(sin(th) * cos(ph), sin(th) * sin(ph), cos(th)) + p;',
  '    trap = min(trap, length(z.xz) + 0.4 * abs(z.y));',
  '  }',
  '  return 0.5 * log(r) * r / dr;',
  '}',
  '',
  'float deOnly(vec3 p) { float t; return de(p, t); }',
  '',
  'void main() {',
  '  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);',
  '  float cy = cos(uYaw), sy = sin(uYaw), cp = cos(uPitch), sp = sin(uPitch);',
  '  vec3 ro = 3.6 * vec3(sy * cp, sp, cy * cp);',
  '  vec3 fw = normalize(-ro);',
  '  vec3 rt = normalize(cross(vec3(0.0, 1.0, 0.0), fw));',
  '  vec3 up = cross(fw, rt);',
  '  vec3 rd = normalize(fw * 1.25 + q.x * rt + q.y * up);',
  // hit and normal tolerance at the size of one character: a power-8 bulb has
  // detail far below a cell, and resolving it only turns the shading to noise
  '  float pix = 1.0 / (uRes.y * 1.25);',
  '',
  // skip straight to the bounding sphere; most rays never touch it
  '  float b = dot(ro, rd), c = dot(ro, ro) - 1.6 * 1.6;',
  '  float disc = b * b - c;',
  '  vec3 col = vec3(0.0);',
  '  float dens = 0.0;',
  '  float glow = 0.0;',
  '  if (disc > 0.0) {',
  '    float t = max(0.0, -b - sqrt(disc));',
  '    float tEnd = -b + sqrt(disc);',
  '    float trap = 0.0;',
  '    float minD = 1e9;',
  '    bool hit = false;',
  '    float steps = 0.0;',
  '    for (int i = 0; i < 90; i++) {',
  '      vec3 p = ro + rd * t;',
  '      float d = de(p, trap);',
  '      minD = min(minD, d);',
  '      if (d < pix * 0.5 * t) { hit = true; break; }',
  '      t += d * 0.9;',
  '      steps += 1.0;',
  '      if (t > tEnd) break;',
  '    }',
  '    if (hit) {',
  '      vec3 p = ro + rd * t;',
  '      vec2 e = vec2(1.0, -1.0) * pix * t;',
  '      vec3 n = normalize(e.xyy * deOnly(p + e.xyy) + e.yyx * deOnly(p + e.yyx)',
  '                       + e.yxy * deOnly(p + e.yxy) + e.xxx * deOnly(p + e.xxx));',
  '      vec3 L = normalize(vec3(0.6, 0.8, 0.4));',
  '      float dif = clamp(dot(n, L), 0.0, 1.0);',
  '      float ao = clamp(1.0 - steps / 70.0, 0.0, 1.0);',
  '      float fres = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);',
  '      float hue = p.y * 0.55 + length(p.xz) * 0.35 + uTime * 0.06;',
  '      vec3 base = pal(hue);',
  '      vec3 rim = pal(hue + 0.5);',
  '      col = base * (0.30 + 0.85 * dif) * (0.45 + 0.55 * ao) + rim * fres * 1.4;',
  '      dens = clamp(0.28 + 0.6 * dif * ao + 0.5 * fres, 0.0, 1.0);',
  '    } else {',
  '      glow = exp(-minD * 22.0);',
  '    }',
  '  }',
  '  if (dens == 0.0 && glow > 0.08) {',
  '    col = pal(uTime * 0.06 + 0.25 + q.y * 0.4);',
  '    dens = glow * 0.32;',
  '  }',
  '  float mx = max(col.r, max(col.g, col.b));',
  '  col = col / max(mx, 1e-3) * mix(0.35, 1.0, clamp(mx, 0.0, 1.0));',
  '  gl_FragColor = vec4(col, dens);',
  '}'
].join('\n');

var PALETTES = ['rainbow', 'acid', 'candy', 'sunset'];

var field = null;
var bPal = 0;
var bYaw = 0, bPitch = 0.35;
var bVy = 0.004, bVp = 0;
var bLastGx = 0, bLastGy = 0, bWasDown = false;
var bPowPhase = 0;

function initThreebulb() {
  if (field) { field.dispose(); field = null; }
  // denser grid: the fractal is the subject and the shader does the work, so
  // the extra cells cost the GPU almost nothing. Restored in cleanup.
  state.FONT_SCALE = 0.8;
  resize();
  field = createGpuField(FRAG, {
    uTime: { value: 0 },
    uPow: { value: 8 },
    uYaw: { value: 0 },
    uPitch: { value: 0.35 },
    uPal: { value: 0 }
  });
  bPal = 0;
  bYaw = 0; bPitch = 0.35;
  bVy = 0.004; bVp = 0;
  bWasDown = false;
  bPowPhase = 1.6;  // open mid-morph, already lobed and heading for the cauliflower
}

function cleanupThreebulb() {
  if (field) { field.dispose(); field = null; }
  if (state.FONT_SCALE !== 1) {
    state.FONT_SCALE = 1;
    resize();
  }
}

function renderThreebulb() {
  clearCanvas();
  if (!field) return;
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var mine = state.currentMode === 'threebulb';

  if (pointer.clicked && mine) {
    pointer.clicked = false;
    bPal = (bPal + 1) % PALETTES.length;
  }

  if (pointer.down && mine) {
    if (bWasDown) {
      var dx = (pointer.gx - bLastGx) / Math.max(1, W);
      var dy = (pointer.gy - bLastGy) / Math.max(1, H);
      bVy = dx * 4.5;
      bVp = dy * 2.5;
    }
    bLastGx = pointer.gx; bLastGy = pointer.gy;
    bWasDown = true;
  } else {
    bWasDown = false;
    // fling momentum decays back to a slow idle spin
    bVy += (0.004 - bVy) * 0.03;
    bVp *= 0.93;
  }
  bYaw += bVy;
  bPitch = Math.max(-1.3, Math.min(1.3, bPitch + bVp));

  bPowPhase += 0.0045;
  var u = field.uniforms;
  u.uTime.value = t;
  u.uPow.value = 5.0 - 3.0 * Math.cos(bPowPhase);
  u.uYaw.value = bYaw;
  u.uPitch.value = bPitch;
  u.uPal.value = bPal;
  field.draw();

  var label = '[threebulb] power ' + u.uPow.value.toFixed(1) + '  ' + PALETTES[bPal] +
    '  drag:orbit  tap:palette';
  var lx = Math.max(0, W - label.length - 1);
  for (var c = Math.max(0, lx - 1); c < W; c++) drawCharHSL('#', c, H - 1, 0, 0, 3);
  for (var li = 0; li < label.length && lx + li < W; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 55);
  }
}

registerMode('threebulb', {
  init: initThreebulb, render: renderThreebulb, cleanup: cleanupThreebulb
});
