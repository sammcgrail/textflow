import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { resize } from '../core/canvas.js';
import { createGpuField } from '../core/gpufield.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// threekifs — flying through a kaleidoscopic IFS cathedral.
//
// Space is tiled, and each tile is folded four times: mirror, sort (or don't),
// rotate, scale by 3. With no rotation that is a Menger sponge. A small
// rotation that drifts over time is slipped in between folds, and because it
// compounds through every iteration a few degrees of drift rebuilds the whole
// architecture — arches become lattices become thorn forests while you fly.
//
// The sponges tile edge to edge, so their biggest holes line up into endless
// square corridors; the camera flies down one. The drift is kept out of the
// first fold, which is what cuts that corridor, so the route always stays open
// while everything around it rebuilds. Neon rings race down the walls.
//
// Hold: warp speed, steer with your finger. Tap: next fold set.

var FRAG = [
  'precision highp float;',
  'varying vec2 vUv;',
  'uniform vec2 uRes;',
  'uniform float uAspect;',
  'uniform float uTime;',
  'uniform float uZ;',
  'uniform vec3 uAng;',
  'uniform vec2 uLook;',
  'uniform float uRoll;',
  'uniform float uFold;',
  '',
  'mat3 R;',
  '',
  'vec3 pal(float t) {',
  '  vec3 c = vec3(1.0), d;',
  '  if (uFold < 0.5)      { d = vec3(0.00, 0.33, 0.67); }',
  '  else if (uFold < 1.5) { c = vec3(2.0, 1.0, 0.0); d = vec3(0.50, 0.20, 0.25); }',
  '  else                  { c = vec3(1.0, 1.0, 0.5); d = vec3(0.80, 0.90, 0.30); }',
  '  return 0.5 + 0.5 * cos(6.28318 * (c * t + d));',
  '}',
  '',
  'vec2 path(float z) {',
  '  return vec2(sin(z * 0.43) * 0.09, cos(z * 0.31) * 0.09);',
  '}',
  '',
  // Menger sponge, tiled with period 2 so neighbouring sponges share faces and
  // the level-1 holes line up into endless square corridors. The camera flies
  // down the one at x = y = 0. Only folds after the first are rotated or
  // swapped, so that corridor always survives while everything inside the
  // walls is rebuilt by the drift.
  'float de(vec3 p, out float trap) {',
  '  vec3 q = mod(p + 1.0, 2.0) - 1.0;',
  '  float s = 1.0;',
  '  trap = 1e9;',
  '  for (int i = 0; i < 4; i++) {',
  '    q = abs(q);',
  '    if (i == 0 || uFold < 0.5) {',
  '      if (q.x < q.y) q.xy = q.yx;',
  '      if (q.x < q.z) q.xz = q.zx;',
  '      if (q.y < q.z) q.yz = q.zy;',
  '    } else if (uFold < 1.5) {',
  '      if (q.x < q.y) q.xy = q.yx;',
  '      if (q.x < q.z) q.xz = q.zx;',
  '    }',
  '    if (i > 0) q = R * q;',
  '    q = q * 3.0 - vec3(2.0);',
  '    if (q.z < -1.0) q.z += 2.0;',
  '    s *= 3.0;',
  '    trap = min(trap, length(q) / s);',
  '  }',
  '  return length(max(abs(q) - 1.0, 0.0)) / s;',
  '}',
  '',
  'float deOnly(vec3 p) { float t; return de(p, t); }',
  '',
  'void main() {',
  '  vec3 ca = cos(uAng), sa = sin(uAng);',
  '  R = mat3(1.0, 0.0, 0.0, 0.0, ca.x, sa.x, 0.0, -sa.x, ca.x)',
  '    * mat3(ca.y, 0.0, -sa.y, 0.0, 1.0, 0.0, sa.y, 0.0, ca.y)',
  '    * mat3(ca.z, sa.z, 0.0, -sa.z, ca.z, 0.0, 0.0, 0.0, 1.0);',
  '',
  '  vec2 q = (vUv - 0.5) * vec2(uAspect, 1.0);',
  '  vec3 ro = vec3(path(uZ), uZ);',
  '  vec3 ta = vec3(path(uZ + 1.0) + uLook, uZ + 1.0);',
  '  vec3 fw = normalize(ta - ro);',
  '  vec3 rt = normalize(cross(vec3(sin(uRoll), cos(uRoll), 0.0), fw));',
  '  vec3 up = cross(fw, rt);',
  '  vec3 rd = normalize(fw * 1.1 + q.x * rt + q.y * up);',
  // stop and take normals at the size of one character, not one micron:
  // finer than a cell is invisible anyway and only turns shading into noise
  '  float pix = 1.0 / (uRes.y * 1.1);',
  '',
  '  float t = 0.02, trap = 0.0, minD = 1e9;',
  '  bool hit = false;',
  '  float steps = 0.0;',
  '  for (int i = 0; i < 64; i++) {',
  '    float d = de(ro + rd * t, trap);',
  '    minD = min(minD, d / t);',
  '    if (d < pix * 0.6 * t) { hit = true; break; }',
  '    t += d * 0.9;',
  '    steps += 1.0;',
  '    if (t > 10.0) break;',
  '  }',
  '  vec3 col = vec3(0.0);',
  '  float dens = 0.0;',
  '  if (hit) {',
  '    vec3 p = ro + rd * t;',
  '    vec2 e = vec2(1.0, -1.0) * max(0.0005, pix * t);',
  '    vec3 n = normalize(e.xyy * deOnly(p + e.xyy) + e.yyx * deOnly(p + e.yyx)',
  '                     + e.yxy * deOnly(p + e.yxy) + e.xxx * deOnly(p + e.xxx));',
  '    float dif = clamp(dot(n, -rd), 0.0, 1.0);',
  // a torch on the camera: near walls lit, the distance left to the rings
  '    float att = 1.0 / (1.0 + 1.5 * t * t);',
  '    float ao = clamp(1.0 - steps / 64.0, 0.0, 1.0);',
  '    float fog = exp(-t * 0.2);',
  '    vec3 base = pal(p.z * 0.05 + trap * 2.0 + uTime * 0.05);',
  // rings of light running along the tunnel, slightly faster than the camera
  '    float ring = pow(0.5 + 0.5 * sin(p.z * 3.14159 - uTime * 3.0), 10.0);',
  '    vec3 neon = pal(p.z * 0.11 + 0.5);',
  '    col = base * (0.2 + 0.8 * dif) * (0.3 + 0.7 * ao) * (0.3 + 0.7 * att) + neon * ring * fog * 1.6;',
  '    dens = clamp((0.12 + 0.88 * dif * ao) * (0.3 + 0.55 * att) * fog * 1.4 + ring * fog * 0.9, 0.0, 1.0);',
  '  } else {',
  '    float g = exp(-minD * 40.0);',
  '    col = pal(uTime * 0.05 + 0.3);',
  '    dens = g * 0.3;',
  '  }',
  '  float mx = max(col.r, max(col.g, col.b));',
  '  col = col / max(mx, 1e-3) * mix(0.5, 1.0, clamp(mx * 1.4, 0.0, 1.0));',
  '  gl_FragColor = vec4(col, dens);',
  '}'
].join('\n');

var FOLDS = ['menger', 'octa', 'box'];

var field = null;
var kFold = 0;
var kZ = 0;
var kSpeed = 0.035;
var kLx = 0, kLy = 0;

function initThreekifs() {
  if (field) { field.dispose(); field = null; }
  // denser grid: the fractal is the subject and the shader does the work, so
  // the extra cells cost the GPU almost nothing. Restored in cleanup.
  state.FONT_SCALE = 0.8;
  resize();
  field = createGpuField(FRAG, {
    uTime: { value: 0 },
    uZ: { value: 0 },
    uAng: { value: { x: 0, y: 0, z: 0 } },
    uLook: { value: { x: 0, y: 0 } },
    uRoll: { value: 0 },
    uFold: { value: 0 }
  });
  kFold = 0;
  kZ = 0;
  kSpeed = 0.035;
  kLx = 0; kLy = 0;
}

function cleanupThreekifs() {
  if (field) { field.dispose(); field = null; }
  if (state.FONT_SCALE !== 1) {
    state.FONT_SCALE = 1;
    resize();
  }
}

function renderThreekifs() {
  clearCanvas();
  if (!field) return;
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var mine = state.currentMode === 'threekifs';

  if (pointer.clicked && mine) {
    pointer.clicked = false;
    kFold = (kFold + 1) % FOLDS.length;
  }

  var targetSpeed = 0.035, tlx = 0, tly = 0;
  if (pointer.down && mine) {
    targetSpeed = 0.13;
    tlx = ((pointer.gx / Math.max(1, W - 1)) * 2 - 1) * 0.9;
    tly = -((pointer.gy / Math.max(1, H - 1)) * 2 - 1) * 0.6;
  }
  kSpeed += (targetSpeed - kSpeed) * 0.05;
  kLx += (tlx - kLx) * 0.08;
  kLy += (tly - kLy) * 0.08;
  kZ += kSpeed;

  var u = field.uniforms;
  u.uTime.value = t;
  u.uZ.value = kZ;
  u.uAng.value = {
    x: 0.22 * Math.sin(t * 0.11),
    y: 0.18 * Math.sin(t * 0.083 + 1.7),
    z: 0.26 * Math.sin(t * 0.067 + 0.6)
  };
  u.uLook.value = { x: kLx, y: kLy };
  // slow barrel roll, leaning into the steer
  u.uRoll.value = 0.5 * Math.sin(t * 0.09) - kLx * 0.6;
  u.uFold.value = kFold;
  field.draw();

  var label = '[threekifs] ' + FOLDS[kFold] + '  hold:warp+steer  tap:fold';
  var lx = Math.max(0, W - label.length - 1);
  for (var c = Math.max(0, lx - 1); c < W; c++) drawCharHSL('#', c, H - 1, 0, 0, 3);
  for (var li = 0; li < label.length && lx + li < W; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 55);
  }
}

registerMode('threekifs', {
  init: initThreekifs, render: renderThreekifs, cleanup: cleanupThreekifs
});
