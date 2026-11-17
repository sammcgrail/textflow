import { clearCanvas } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';
import {
  Scene3D, MeshBuilder, meshFromArrays, smoothNormals, b64bytes, sampleSurface, createStages, createParticles, createRipples,
  matYaw, matRotAbout, xformPoint, basisAlong, norm3, hash1, hash2, clamp01, smooth, TAU,
} from '../core/scene3d.js';

// superknight: knight v2. The same wounded knight in the poppy field at night (after the
// gul_sovalye_kod.py reel), but the knight is a real scanned-style mesh instead of
// primitives, so he holds up all the way round a 360 orbit.
//   mesh    : a detailed knight image (GPT-Image) lifted to 3D with Hunyuan3D-2 (shape +
//             texture) on a local RTX 4080, decimated to ~9.6k triangles, baked to a
//             quantised buffer (./superknight-mesh.js, see static/models/superknight.md).
//             Texture luminance modulates per-material palettes (steel, mail, cloak,
//             leather, linen, blade); the cloak sways with the wind.
//   blood   : the arrow in his back is the wound: a pulsing run crawls down his back over
//             the real surface and drips (blood_run / drops / splat / ripple), a pool grows
//   field   : grass glyphs ray-cast onto y = 0, 3D poppy sprites, stars, shooting stars
// Tap: loose another arrow; it sticks where you tapped him (or somewhere on him on a
// miss) and becomes a new wound that runs, drips, splashes and ripples.
// Drag: orbit the camera, a full 360.

var MODE = 'superknight';

var M_STEEL = 1, M_MAIL = 2, M_CLOTH = 3, M_LEATHER = 4, M_GOLD = 5, M_BLADE = 6, M_VISOR = 7, M_DUST = 8, M_WOOD = 9, M_FLETCH = 10, M_LINEN = 11;
var LEATHER = [178, 96, 46];
var BLOOD = [255, 28, 48], BLOOD_DARK = [150, 0, 22], BLOOD_HOT = [255, 190, 170];
// per-material palette; the baked texture's luminance modulates it (folds, rust, rivets)
var PAL = [];
PAL[M_STEEL] = [222, 230, 246]; PAL[M_MAIL] = [150, 160, 190]; PAL[M_CLOTH] = [74, 118, 255];
PAL[M_LEATHER] = [196, 112, 56]; PAL[M_LINEN] = [236, 226, 200]; PAL[M_BLADE] = [236, 244, 255]; PAL[M_WOOD] = [236, 150, 62];

var LOOP = 6.6, DRIP_N = 3, GRAV = 4.2;   // the reel's LOOP / DRIP_N / GRAV, in seconds and metres
var KNIGHT_YAW = 215 * Math.PI / 180, SMOOTH_N = 2;
var ARROW_L = 0.56, ARROW_MAX = 12, FLIGHT_T = 0.34;   // shaft length (m), stuck-arrow cap, flight time (s)

var K_SPLASH = 1, K_SPARK = 2, K_PETAL = 3, K_DROP = 4;
var KINDS = {};
KINDS[K_SPLASH] = { grav: 6, drag: 0.4 };
KINDS[K_SPARK] = { grav: 1.2, drag: 2.5 };
KINDS[K_PETAL] = { grav: 0.35, drag: 1.4, wind: 2.2 };
KINDS[K_DROP] = { grav: GRAV, drag: 0 };
var STYLES = {};
STYLES[K_SPLASH] = { glyphs: "@o*'.", col: BLOOD, hot: [255, 120, 120], glow: 0.6 };
STYLES[K_SPARK] = { glyphs: '*+x+.', col: [255, 80, 40], hot: [255, 240, 200], glow: 1.4 };
STYLES[K_PETAL] = { glyphs: "o,'`.", col: [255, 40, 60], hot: [255, 120, 110], glow: 0.2, alpha: 0.95 };
STYLES[K_DROP] = { glyphs: '@', col: BLOOD, hot: BLOOD_HOT, glow: 0.8 };

var s3 = null;
var K = null;   // geometry (decoded once from the baked asset)
var S = null;   // simulation state
var G = null;   // per-size layout + field tables
var ASSET = 0;  // 0 idle, 1 loading, 2 ready, 3 failed

function add(a, b, k) { k = k === undefined ? 1 : k; return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }

// ---------------------------------------------------------------------------
// knight geometry: decode the baked buffer (local frame: +x forward, +y up, +z his right)
//   layout: pos u16 nv*3 | col u8 nv*3 | mat u8 nv | group u8 nv | idx u16 nt*3
// ---------------------------------------------------------------------------
function loadAsset() {
  if (ASSET) return;
  ASSET = 1;
  var go = function () {
    import('./superknight-mesh.js').then(function (m) {
      try { K = buildKnight(m.DATA, m.META); ASSET = 2; } catch (e) { ASSET = 3; console.warn('superknight: bad mesh', e); }
    }, function (e) { ASSET = 0; console.warn('superknight: mesh load failed', e); });
  };
  // start after window load (a request in flight before load keeps iOS Safari's spinner going)
  if (typeof document === 'undefined' || document.readyState === 'complete' || typeof window === 'undefined' || !window.addEventListener) go();
  else window.addEventListener('load', function () { setTimeout(go, 0); }, { once: true });
}

export function buildKnight(data, meta) {
  var bytes = b64bytes(data), nv = meta.nv, nt = meta.nt, o = 0, i, k;
  var q = new Uint16Array(bytes.slice(o, o + nv * 6).buffer); o += nv * 6;
  var c8 = bytes.subarray(o, o + nv * 3); o += nv * 3;
  var vm = bytes.slice(o, o + nv); o += nv;
  var vg = bytes.slice(o, o + nv); o += nv;
  var idx = new Uint16Array(bytes.slice(o, o + nt * 6).buffer);
  var pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3), pm = meta.pmin, ps = meta.pscale;
  for (i = 0; i < nv; i++) for (k = 0; k < 3; k++) pos[i * 3 + k] = pm[k] + q[i * 3 + k] * ps[k];
  // texture luminance per material -> mean, then palette x (relative luminance)
  var sum = [], cnt = [];
  for (i = 0; i < nv; i++) {
    var lum = (0.3 * c8[i * 3] + 0.59 * c8[i * 3 + 1] + 0.11 * c8[i * 3 + 2]) / 255;
    sum[vm[i]] = (sum[vm[i]] || 0) + lum; cnt[vm[i]] = (cnt[vm[i]] || 0) + 1;
  }
  for (i = 0; i < nv; i++) {
    var m = vm[i], pal = PAL[m] || PAL[M_STEEL];
    var l = (0.3 * c8[i * 3] + 0.59 * c8[i * 3 + 1] + 0.11 * c8[i * 3 + 2]) / 255, mean = sum[m] / cnt[m] || 0.5;
    var rel = Math.max(0.72, Math.min(1.2, 0.6 + 0.4 * l / mean));
    // the tabard's red cross and other saturated texture keep a little of their own hue
    var tr = c8[i * 3] / 255, tg = c8[i * 3 + 1] / 255, tb = c8[i * 3 + 2] / 255, mx = Math.max(tr, tg, tb), mn = Math.min(tr, tg, tb);
    var sat = mx > 0 ? (mx - mn) / mx : 0, keep = m === M_LINEN ? clamp01((sat - 0.25) * 2.5) : 0;
    for (k = 0; k < 3; k++) {
      var pv = pal[k] * rel, tv = (c8[i * 3 + k] / (mx || 1)) * 235;
      col[i * 3 + k] = Math.min(255, pv + (tv - pv) * keep) / 255;
    }
  }
  var mesh = meshFromArrays({ pos: pos, col: col, idx: idx, vmat: vm, vgrp: vg, groupNames: meta.groupNames });
  smoothNormals(mesh, SMOOTH_N);
  mesh.tflag.fill(1);   // no back-face cull: smoothed normals would cut holes in thin parts; the z-buffer sorts it
  // cloak sway: cloth vertices behind his shoulders, weighted by how far they hang
  var gc = mesh.groups.cloak, sway = [], base = new Float32Array(pos);
  for (i = 0; i < nv; i++) {
    if (vg[i] !== gc) continue;
    var x = pos[i * 3], y = pos[i * 3 + 1];
    var w = smooth((y - 0.03) / 0.2) * Math.pow(clamp01((1.02 - y) / 0.95), 1.4) * smooth((-x + 0.02) / 0.18);
    if (w > 0.01) sway.push(i, w);
  }
  var info = { mesh: mesh, meta: meta, base: base, sway: new Float32Array(sway), dust: sampleSurface(mesh, 1600), skin: buildSkin(mesh), arrow: buildArrow() };
  return info;
}

// dense samples of everything but the sword: the surface a blood trail crawls over
function buildSkin(mesh) {
  var all = sampleSurface(mesh, 12000), gs = mesh.groups.sword;
  var pos = [], nrm = [];
  for (var i = 0; i < all.n; i++) {
    if (all.grp[i] === gs) continue;
    var n = norm3([all.nrm[i * 3], all.nrm[i * 3 + 1], all.nrm[i * 3 + 2]]);
    pos.push(all.pos[i * 3], all.pos[i * 3 + 1], all.pos[i * 3 + 2]); nrm.push(n[0], n[1], n[2]);
  }
  return { n: pos.length / 3, pos: new Float32Array(pos), nrm: new Float32Array(nrm) };
}

// one arrow in its own frame: tip at the origin, +y runs back to the nock
export function buildArrow() {
  var mb = new MeshBuilder();
  mb.tube([[0, 0, 0], [0, 0.04, 0], [0, 0.08, 0], [0, 0.09, 0]], [0.002, 0.021, 0.03, 0.008],
    { col: [200, 212, 236], mat: M_STEEL, group: 'head', segs: 8, cap: 0 });
  mb.tube([[0, 0.085, 0], [0, 0.35, 0], [0, ARROW_L, 0]], [0.012, 0.012, 0.011], { col: [236, 150, 62], mat: M_WOOD, group: 'shaft', segs: 6 });
  for (var k = 0; k < 3; k++) {
    var a = k / 3 * TAU + 0.4, ca = Math.cos(a), sa = Math.sin(a);
    mb.grid(function (u, v, out) {
      var y = ARROW_L - 0.17 + 0.15 * u;
      var h = u < 0.3 ? u / 0.3 : 1 - (u - 0.3) * 0.25;
      var r = 0.01 + v * 0.05 * h;
      out[0] = ca * r; out[1] = y + v * 0.025; out[2] = sa * r;
    }, 4, 2, { twoSided: true, col: k === 0 ? [255, 60, 70] : [245, 240, 232], mat: M_FLETCH, group: 'fletch' });
  }
  mb.ellipsoid([0, ARROW_L + 0.006, 0], [0.014, 0.012, 0.014], null, { col: LEATHER, mat: M_LEATHER, group: 'shaft', nu: 8, nv: 6 });
  return mb.build();
}

// wind on the cloak: move the hanging cloth back and let it ripple
var CW = { wind: 0, t: 0 };
function swayCloak() {
  var P = K.mesh.pos, B = K.base, SW = K.sway, w = CW.wind, t = CW.t;
  for (var j = 0; j < SW.length; j += 2) {
    var i = SW[j], k = SW[j + 1], b = i * 3, y = B[b + 1], z = B[b + 2];
    var fl = k * (0.012 * Math.sin(t * 2.1 + z * 9 + y * 4) * (0.5 + w) + 0.05 * w * (0.7 + 0.3 * Math.sin(t * 8 + z * 13 + y * 7)));
    P[b] = B[b] - fl; P[b + 1] = B[b + 1] + fl * 0.3 * k; P[b + 2] = B[b + 2] + 0.012 * w * k * Math.sin(t * 6 + y * 5);
  }
}

// ---------------------------------------------------------------------------
// layout + field
// ---------------------------------------------------------------------------
function buildField() {
  var poppies = [], i;
  var n = state.isMobile ? 420 : 400;
  for (i = 0; i < n; i++) {
    // denser near the knight, scattered across the whole field
    var r = 0.6 + Math.pow(hash1(i * 3.1 + 0.7), 1.3) * 9.5, a = hash1(i * 7.3 + 1.9) * TAU;
    var x = Math.cos(a) * r * 1.2, z = Math.sin(a) * r;   // centred on him: the same field from every side
    if (Math.hypot(x, z) < 0.75) continue;
    poppies.push({ x: x, z: z, h: 0.12 + 0.1 * hash1(i * 2.2), ph: hash1(i * 5.5) * TAU, white: hash1(i * 9.9) < 0.12, s: hash1(i * 4.4) });
  }
  var stars = [];
  // the whole sky, so a full orbit never turns onto an empty half (was a 2.4 rad wedge)
  for (i = 0; i < 840; i++) {
    var az = hash1(i * 1.7) * TAU, el = 0.015 + Math.pow(hash1(i * 2.9 + 3), 1.3) * 0.75;
    stars.push({ d: [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)], b: 0.2 + 0.6 * hash1(i * 4.1),
      p: hash1(i * 6.1) * TAU, c: hash1(i * 8.3) < 0.15 ? 43 : hash1(i * 3.3) < 0.08 ? 42 : 46,
      tint: hash1(i * 7.7) < 0.2 ? [255, 210, 160] : hash1(i * 5.9) < 0.25 ? [170, 200, 255] : [225, 230, 255] });
  }
  return { poppies: poppies, stars: stars };
}

function layout() {
  var W = state.COLS, H = state.ROWS;
  var wpx = W * state.CHAR_W, hpx = H * state.CHAR_H;
  var portrait = hpx > wpx * 1.1;
  var fov = 0.62;
  var fpx = 0.5 * hpx / Math.tan(fov / 2);
  // fit ~1.9 m of width (sword tip to arrow) or ~1.75 m of height
  var scale = Math.min(wpx / 1.05, hpx * (portrait ? 0.6 : 0.72) / 1.3);
  return { w: W, h: H, fov: fov, dist: fpx / scale, shiftY: portrait ? -0.1 : -0.04, portrait: portrait };
}

// ---------------------------------------------------------------------------
// init / cleanup
// ---------------------------------------------------------------------------
function initKnight() {
  var want = state.isMobile ? 0.64 : 0.62;
  if (state.FONT_SCALE !== want) { state.FONT_SCALE = want; resize(); }
  if (!s3) {
    s3 = new Scene3D();
    s3.material(M_STEEL, { kd: 1.2, ks: 0.8, shin: 30, rim: 0.4, dark: [56, 66, 130], glowAt: 0.95, glow: 0.45, expo: 1.3, gamma: 1.5, ramp: ' .:-=+*#%@' });
    s3.material(M_MAIL, { kd: 1.1, ks: 0.45, shin: 12, rim: 0.45, dark: [40, 48, 100], expo: 1.4, gamma: 1.45, ramp: ' .:;=+x%#@' });
    s3.material(M_CLOTH, { kd: 1.1, ks: 0.08, shin: 6, rim: 0.35, dark: [18, 16, 64], ramp: ' .:-=+*%#@', glowAt: 2, expo: 1.4, gamma: 1.45 });
    s3.material(M_LEATHER, { kd: 0.9, ks: 0.2, shin: 10, rim: 0.3, dark: [40, 14, 8] });
    s3.material(M_GOLD, { kd: 1.0, ks: 0.9, shin: 30, rim: 0.4, dark: [90, 40, 6], glowAt: 0.9, glow: 0.8 });
    s3.material(M_BLADE, { kd: 1.1, ks: 1.3, shin: 40, rim: 0.5, dark: [110, 130, 190], emit: 0.25, expo: 2.2, minLum: 0.3, glowAt: 0.9, glow: 0.8 });
    s3.material(M_VISOR, { kd: 0.15, ks: 0.1, rim: 0, dark: [0, 0, 0], minLum: 0.6 });
    s3.material(M_WOOD, { kd: 1.0, ks: 0.3, shin: 14, rim: 0.45, dark: [70, 30, 10], minLum: 0.25, ramp: ' .:-=+*#' });
    s3.material(M_FLETCH, { kd: 0.9, ks: 0.1, shin: 8, rim: 0.5, dark: [90, 80, 100], minLum: 0.3, ramp: ' .:;=+*%' });
    s3.material(M_LINEN, { kd: 1.0, ks: 0.1, shin: 8, rim: 0.4, dark: [60, 50, 90], ramp: ' .:-=+*%#', expo: 1.9 });
    s3.material(M_DUST, { kd: 0.5, ks: 0, rim: 0.5, emit: 0.55, dark: [80, 180, 255], glowAt: 0.6, glow: 0.8, ramp: ' .:*+' });
    s3.light.dir = norm3(LIGHT0);
    s3.light.amb = 0.2;
    s3.light.fill = 0.14; s3.light.fillDir = norm3(FILL0);
    s3.grain = 0.008;
    s3.edge = { dist: 0.05, dark: 0.22, sil: 0.3 };
    s3.light.rimCol = [0.5, 0.66, 1];
    s3.bloom = 0.85;
    s3.glowFill = 0;   // WebGL bloom does the halo; no glyphs in empty background cells
  }
  loadAsset();
  G = layout();
  G.grassK = 0.3 * Math.min(1, Math.sqrt(10000 / (G.w * G.h)), Math.sqrt(2600 / (G.w * G.h)) * 1.4);
  var f = buildField();
  G.poppies = f.poppies; G.stars = f.stars;
  if (!S || state.time < 0.05) {
    S = {
      lastT: state.time, t: 0,
      stages: createStages({ legs: [0.15, 1.5], body: [0.35, 1.5], head: [0.8, 1.3], sword: [0.4, 1.7], cloak: [1.0, 1.5] }),
      k0: -1,
      buildWave: -1, drops: 0, gusts: [], arrows: [], flying: [], stains: [], recoil: null, shots: 0, lastHit: false,
      yawOff: 0, pitchOff: 0, dragging: false, lastPX: 0, lastPY: 0, downX: 0, downY: 0, idle: 99,
      parts: createParticles(600), rip: createRipples(12), landed: [-1, -1, -1],
      shoot: null, nextShoot: 3.5, fps: 0,
    };
    S.stages.restart(0);
  }
}
function cleanupKnight() {
  if (state.FONT_SCALE !== 1) { state.FONT_SCALE = 1; resize(); }
  S = null; G = null;
}

// ---------------------------------------------------------------------------
// wind
// ---------------------------------------------------------------------------
function gustAt(x, t) {
  var s = 0, gs = S.gusts;
  for (var i = 0; i < gs.length; i++) {
    var g = gs[i], age = t - g.t0;
    var xf = g.x0 + g.dir * 2.6 * age, d = (x - xf) / 1.6;
    s += g.dir * Math.exp(-d * d) * Math.exp(-age * 0.35);
  }
  return s;
}

// ---------------------------------------------------------------------------
// render
// ---------------------------------------------------------------------------
var _o = [0, 0, 0, 0], _p = [0, 0, 0], _q = [0, 0, 0], _tmp = [0, 0, 0];
var CAM_YAW0 = -0.15;   // front three-quarter: sword column at his side, bowed helm, cloak + arrow behind (as reel 4)
var MODEL0 = matYaw(new Float32Array(12), KNIGHT_YAW, 0, 0, 0);
var MODEL = new Float32Array(MODEL0);   // MODEL0 x the flinch of the latest hit, rebuilt each frame
var LIGHT0 = [-0.75, 0.55, 0.38], FILL0 = [0.8, 0.2, -0.3];
var GROW = new Float32Array(16);

function renderKnight() {
  clearCanvas();
  if (!S || !G || G.w !== state.COLS || G.h !== state.ROWS) initKnight();
  var now = state.time, dt = now - S.lastT; S.lastT = now;
  if (dt > 0.05) dt = 0.05; if (dt < 0) dt = 0;
  S.t += dt;
  var t = S.t, W = state.COLS, H = state.ROWS;

  // ---- input --------------------------------------------------------------
  var tapped = false;
  if (pointer.clicked && state.currentMode === MODE) {
    pointer.clicked = false;
    tapped = true;
  } else if (pointer.down && state.currentMode === MODE) {
    if (!S.dragging && !S.wasDown) { S.downX = pointer.x; S.downY = pointer.y; S.lastPX = pointer.x; S.lastPY = pointer.y; }
    if (Math.hypot(pointer.x - S.downX, pointer.y - S.downY) > 10) S.dragging = true;
    if (S.dragging) {
      S.yawOff -= (pointer.x - S.lastPX) * 0.006;
      S.pitchOff += (pointer.y - S.lastPY) * 0.003;
      // full 360 orbit (Sam 2026-11-16): wrap instead of clamping
      if (S.yawOff > Math.PI) S.yawOff -= TAU; else if (S.yawOff < -Math.PI) S.yawOff += TAU;
      S.pitchOff = Math.max(-0.1, Math.min(0.55, S.pitchOff));
      S.idle = 0;
    }
    S.lastPX = pointer.x; S.lastPY = pointer.y;
  }
  if (!pointer.down) S.dragging = false;
  S.wasDown = pointer.down;
  S.idle += dt;
  if (S.idle > 4) { var rel = 1 - Math.exp(-dt * 0.35); S.pitchOff -= S.pitchOff * rel; }  // yaw stays where Sam left it

  // ---- camera -------------------------------------------------------------------
  var cam = {
    // side-on he is ~1.2 m deep (sword tip to heel), wider than the front framing on a
    // portrait phone: pull back a little as the orbit swings round to his sides
    target: [0.0, 0.62, 0], dist: G.dist * (1 + (G.portrait ? 0.2 : 0.06) * Math.pow(Math.sin(S.yawOff), 2)), fov: G.fov,
    yaw: CAM_YAW0 + 0.14 * Math.sin(t * 0.16) + S.yawOff, pitch: -0.035 + 0.015 * Math.sin(t * 0.11) + S.pitchOff,
    shiftX: 0, shiftY: G.shiftY,
  };
  s3.begin(cam);

  if (tapped && S.dragging) tapped = false;
  updateModel(t);
  // the key light orbits with the camera, so his far side is lit the way his front was
  rotY(LIGHT0, S.yawOff, s3.light.dir); rotY(FILL0, S.yawOff, s3.light.fillDir);
  S.camYaw = cam.yaw;

  // ---- wind + cloak ------------------------------------------------------------------
  for (var gi = S.gusts.length - 1; gi >= 0; gi--) if (t - S.gusts[gi].t0 > 7) S.gusts.splice(gi, 1);
  var gk = Math.abs(gustAt(0, t));
  CW.wind = 0.18 + 0.12 * Math.sin(t * 0.7) + gk * 1.1; CW.t = t;

  // the knight assembles once the baked mesh has arrived; kt is his own clock
  if (K && S.k0 < 0) { S.k0 = t; S.stages.restart(t); }
  var kt = K ? t - S.k0 : -1, ab = 0, ai, path = null;
  if (K) {
    swayCloak();
    // ---- knight (solid) -------------------------------------------------------------------
    var names = K.mesh.groupNames, building = !S.stages.done(t);
    for (var g = 0; g < names.length; g++) GROW[g] = S.stages.grow(names[g], t);
    if (building) {
      s3.drawMesh(K.mesh, { model: MODEL, grow: GROW, scatter: 1.6 });
      // a point cloud of the same armour runs ahead of the triangles
      var lead = clamp01(S.stages.raw('body', t) + 0.25);
      if (lead < 1.2) s3.drawPoints(K.dust, { model: MODEL, size: 0.012, mat: M_DUST, grow: Math.min(1, lead), scatter: 2.4 });
      if (S.buildWave < 0 && S.stages.raw('cloak', t) > 0.8) S.buildWave = t;
    } else {
      if (S.buildWave < 0) S.buildWave = t;
      s3.drawMesh(K.mesh, { model: MODEL });
    }
    // the tap is resolved against the knight's own depth buffer (arrows not yet drawn)
    if (tapped) fireArrow(t);
    // arrows: 3D meshes, depth-tested with the knight
    ab = S.stages.grow('head', t);
    if (ab > 0.5) drawArrowMesh(ORIG_ARROW_M());
    for (ai = 0; ai < S.arrows.length; ai++) drawArrowMesh(stuckModel(S.arrows[ai]));
    stepFlying(t);
    // white-hot band sweeps head -> ground once he has assembled
    var bwAge = t - S.buildWave;
    if (S.buildWave >= 0 && bwAge < 1.8) {
      s3.wave = { y0: 1.4, y1: -0.05, front: bwAge / 1.4, width: 0.16, from: [1, 1, 1], to: [1, 1, 1], hot: [220, 245, 255] };
    } else s3.wave = null;
  }
  s3.shade();

  // ---- sky -------------------------------------------------------------------
  drawSky(t, dt, W, H);

  if (K) {
    // ---- arrow shafts as strokes (a 2 cm shaft is often thinner than a cell) + flight streaks
    if (ab > 0.5) arrowStrokes(ORIG_ARROW_M(), 1);
    for (ai = 0; ai < S.arrows.length; ai++) arrowStrokes(stuckModel(S.arrows[ai]), 1);
    drawFlying(t);

    // ---- blood ------------------------------------------------------------------------
    var bloodOn = clamp01((kt - 2.6) / 1.2);
    path = bloodPath();
    if (bloodOn > 0) {
      bloodRun(t, path, bloodOn);
      drops(kt, dt, path);
    }
    for (ai = 0; ai < S.arrows.length; ai++) bleed(S.arrows[ai], t);
  }

  // ---- particles ------------------------------------------------------------------------
  var wind2 = [gustAt(0, t) * 1.5 + 0.15, 0.05];
  S.parts.step(dt, KINDS, 0.005, onLand, wind2);
  S.rip.step(dt);
  s3.drawParticles(S.parts, STYLES);
  s3.drawRipples(S.rip, [255, 70, 80], 0.4);

  // ---- field ---------------------------------------------------------------------------
  drawPoppies(t, W, H);
  drawGround(t, W, H, path);

  // ---- hint ----------------------------------------------------------------------------
  if (t < 7) {
    var hint = W < 70 ? 'tap: loose an arrow   drag: orbit' : 'tap: loose another arrow (tap him to aim)   drag: orbit all the way round';
    var ha = Math.min(1, (7 - t) / 1.5) * 0.75;
    if (t > 1) for (var hx = 0; hx < hint.length && hx + 1 < W; hx++) {
      var hc = hint.charCodeAt(hx);
      if (hc !== 32) s3.mark(hx + 1, H - 1, hc, 170, 180, 205, ha, 0, 0);
    }
  }
  s3.present();
  if (typeof window !== 'undefined') window.__superknight = { ready: ASSET,  stuck: S.arrows.length, flying: S.flying.length, shots: S.shots, lastHit: S.lastHit, yawOff: S.yawOff };
}

function onLand(P, i) {
  if (P.kind[i] === K_DROP) { splash(P.x[i], P.z[i], false); return false; }
  if (P.kind[i] === K_PETAL) { P.vy[i] = 0; P.vx[i] *= 0.3; P.vz[i] *= 0.3; return true; }
  return false;
}
function splash(x, z, main) {
  if (main) S.drops++; else addStain(x, z);
  S.rip.add(x, 0.006, z, 1.4, 0.2, 0.02);
  // the reel's splat: 8 droplets thrown out and pulled back down
  for (var j = 0; j < 8; j++) {
    var vx = (Math.random() - 0.5) * 1.1, vz = (Math.random() - 0.5) * 0.8;
    S.parts.emit(K_SPLASH, x, 0.01, z, vx, 0.7 + Math.random() * 0.8, vz, 0.45);
  }
}

// wound + blood path in world space ---------------------------------------------------
function woundLocal() { return K.meta.woundL; }
var PATH = [];
function bloodPath() {
  // the main wound's run: crawled once over the real surface (downhill from the arrow,
  // across the cloak to where it overhangs), then carried by the flinch each frame
  if (!K.mainPath) {
    var ap = armourPath(woundLocal(), 0.3, [-1, 0, 0]);
    K.mainPath = ap.pts; K.mainGround = ap.ground;
  }
  var L = K.mainPath, n = L.length;
  for (var i = 0; i < n; i++) xformPoint(MODEL, L[i], PATH[i] || (PATH[i] = [0, 0, 0]));
  PATH.length = n;
  return PATH;
}
function bloodRun(t, path, on) {
  // blood_run(): the wound blob, then a 3-strand ribbon down the path whose brightness
  // is a travelling cos^3 wave (wave = (0.5 + 0.5 cos(TAU a 4 - per(t, 6)))^3)
  var RAMP = ':=+*%#@';
  var w0 = path[0];
  for (var k = 0; k < 18; k++) {
    var a = k / 18 * TAU, r = 0.015 + 0.03 * hash1(k * 3.1);
    var lum = 0.6 + 0.4 * Math.sin(t * 3 + k);
    s3.markWorld(w0[0] + Math.cos(a) * r, w0[1] + Math.sin(a) * r * 1.2, w0[2] + 0.01, RAMP.charCodeAt(4 + (lum * 2.5 | 0)), BLOOD[0], BLOOD[1], BLOOD[2], on, 0.5);
  }
  var total = 0, segL = [];
  for (var i = 1; i < path.length; i++) { var L = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1], path[i][2] - path[i - 1][2]); segL.push(L); total += L; }
  var step = 0.006, acc = 0, si = 0, sOff = 0;
  var rt = s3.right;
  for (var s = 0; s <= total * on; s += step) {
    while (si < segL.length - 1 && s > acc + segL[si]) { acc += segL[si]; si++; }
    var f = (s - acc) / segL[si], p0 = path[si], p1 = path[si + 1];
    var x = p0[0] + (p1[0] - p0[0]) * f, y = p0[1] + (p1[1] - p0[1]) * f, z = p0[2] + (p1[2] - p0[2]) * f;
    var aa = s / total;
    var wave = Math.pow(0.5 + 0.5 * Math.cos(TAU * aa * 4 - TAU * t / 2.4), 3);
    var lum2 = 0.5 + 0.4 * wave;
    var cr = BLOOD_DARK[0] + (BLOOD[0] - BLOOD_DARK[0]) * (0.4 + 0.6 * wave);
    var cg = BLOOD_DARK[1] + (BLOOD[1] - BLOOD_DARK[1]) * (0.4 + 0.6 * wave);
    var cb = BLOOD_DARK[2] + (BLOOD[2] - BLOOD_DARK[2]) * (0.4 + 0.6 * wave);
    var ci = RAMP.charCodeAt(Math.min(RAMP.length - 1, (lum2 * RAMP.length) | 0));
    var wdt = 0.008 * (1 - aa) + 0.004;
    for (var dxk = -2; dxk <= 2; dxk++) {
      var ox = rt[0] * dxk * wdt, oz = rt[2] * dxk * wdt;
      s3.markWorld(x + ox, y, z + oz, (dxk === 0 || (dxk * dxk === 1 && wave > 0.3)) ? ci : RAMP.charCodeAt(Math.max(0, ((lum2 - 0.25) * RAMP.length) | 0)), cr, cg, cb, 1, wave > 0.6 ? 0.7 * wave : 0);
    }
  }
}
function drops(t, dt, path) {
  // drops(): P = LOOP / DRIP_N; a drop swells for g = 0.62 P, falls for tf, then splashes
  var P = LOOP / DRIP_N, d = path[path.length - 1];
  var tf = Math.sqrt(2 * d[1] / GRAV), g = 0.62 * P;
  for (var k = 0; k < DRIP_N; k++) {
    var raw = t - 3.2 - k * P - 0.3;
    if (raw < 0) continue;
    var a = raw % LOOP, cyc = Math.floor(raw / LOOP);
    if (a >= P + 2.0) continue;
    if (a < g) {
      var u = a / g, r = 0.006 + 0.016 * Math.pow(u, 0.7);
      var code = u < 0.3 ? 46 : u < 0.6 ? 111 : u < 0.85 ? 79 : 64;   // . o O @
      s3.markWorld(d[0], d[1] - r, d[2], code, BLOOD[0], BLOOD[1] + 20 * u, BLOOD[2], 1, 0.6 * u);
    } else if (a < g + tf) {
      var ff = a - g, y = d[1] - 0.5 * GRAV * ff * ff;
      s3.markWorld(d[0], y, d[2], 64, BLOOD[0], BLOOD[1], BLOOD[2], 1, 0.9);
      for (var j = 1; j < 5; j++) s3.markWorld(d[0], y + j * 0.018, d[2], j < 2 ? 124 : 58, BLOOD[0] * (1 - j * 0.15), 20, 40, 1 - j * 0.2, 0);
    } else if (S.landed[k] !== cyc) {
      S.landed[k] = cyc;
      splash(d[0], d[2], true);
    }
  }
}

// arrows ---------------------------------------------------------------------------------
// An arrow is a small 3D mesh (head, shaft, three vanes, nock) drawn with a model matrix
// built from its tip and flight direction, so it turns correctly with the orbiting camera.
// Stuck arrows live in the knight's local frame (they ride his flinch and, on the cloak,
// the cloth); each one is a blood source that beads, runs, drips and slows with age.
var _R = new Float32Array(12), _ax = [0, 0, 0], _a0 = [0, 0, 0], _a1 = [0, 0, 0], _rd = [0, 0, 0];
var ORIG_M = new Float32Array(12);
var ORIG_DIR = null;   // flight direction of the arrow already in his back (nock -> wound)
var STROKE_WOOD = [236, 150, 62], STROKE_HOT = [255, 236, 190];

function rotY(v, a, out) {
  var c = Math.cos(a), s = Math.sin(a);
  var x = c * v[0] + s * v[2], z = -s * v[0] + c * v[2], l = Math.hypot(x, v[1], z) || 1;
  out[0] = x / l; out[1] = v[1] / l; out[2] = z / l;
  return out;
}
function mul34(a, b, o) {
  for (var r = 0; r < 3; r++) {
    var a0 = a[r * 3], a1 = a[r * 3 + 1], a2 = a[r * 3 + 2];
    o[r * 3] = a0 * b[0] + a1 * b[3] + a2 * b[6];
    o[r * 3 + 1] = a0 * b[1] + a1 * b[4] + a2 * b[7];
    o[r * 3 + 2] = a0 * b[2] + a1 * b[5] + a2 * b[8];
    o[9 + r] = a0 * b[9] + a1 * b[10] + a2 * b[11] + a[9 + r];
  }
  return o;
}
function rotDir(m, v, out) {
  var x = v[0], y = v[1], z = v[2];
  out[0] = m[0] * x + m[1] * y + m[2] * z; out[1] = m[3] * x + m[4] * y + m[5] * z; out[2] = m[6] * x + m[7] * y + m[8] * z;
  return out;
}
function toLocal(w, out) {   // inverse of MODEL (rotation + translation)
  var m = MODEL, dx = w[0] - m[9], dy = w[1] - m[10], dz = w[2] - m[11];
  out[0] = m[0] * dx + m[3] * dy + m[6] * dz; out[1] = m[1] * dx + m[4] * dy + m[7] * dz; out[2] = m[2] * dx + m[5] * dy + m[8] * dz;
  return out;
}
function dirToLocal(w, out) {
  var m = MODEL, x = w[0], y = w[1], z = w[2];
  out[0] = m[0] * x + m[3] * y + m[6] * z; out[1] = m[1] * x + m[4] * y + m[7] * z; out[2] = m[2] * x + m[5] * y + m[8] * z;
  return out;
}

// the flinch: a damped rock about his knees, pushed the way the latest arrow was flying
function updateModel(t) {
  var r = S.recoil, age = r ? t - r.t0 : 99;
  if (age > 1.6) { MODEL.set(MODEL0); return; }
  var ang = 0.075 * Math.exp(-age * 4.2) * Math.sin(age * 15);
  matRotAbout(_R, r.axis, ang, [0, 0.12, 0]);
  mul34(MODEL0, _R, MODEL);
}

// model matrix for an arrow whose tip is at tipW, flying along dirW (both world)
function arrowMat(out, tipW, dirW, roll) {
  var B = basisAlong([-dirW[0], -dirW[1], -dirW[2]]), x = B[0], y = B[1], z = B[2];
  var c = Math.cos(roll), s = Math.sin(roll);
  var x0 = x[0] * c + z[0] * s, x1 = x[1] * c + z[1] * s, x2 = x[2] * c + z[2] * s;
  var z0 = z[0] * c - x[0] * s, z1 = z[1] * c - x[1] * s, z2 = z[2] * c - x[2] * s;
  out[0] = x0; out[1] = y[0]; out[2] = z0;
  out[3] = x1; out[4] = y[1]; out[5] = z1;
  out[6] = x2; out[7] = y[2]; out[8] = z2;
  out[9] = tipW[0]; out[10] = tipW[1]; out[11] = tipW[2];
  return out;
}
function ORIG_ARROW_M() {
  var w = woundLocal(), nk = K.meta.nockL;
  if (!ORIG_DIR) ORIG_DIR = norm3([w[0] - nk[0], w[1] - nk[1], w[2] - nk[2]]);
  // the baked shaft runs wound -> nock; put our arrow's nock on it
  var len = Math.hypot(w[0] - nk[0], w[1] - nk[1], w[2] - nk[2]);
  var tipL = add(nk, ORIG_DIR, ARROW_L);
  return arrowMat(ORIG_M, xformPoint(MODEL, tipL, _a0), rotDir(MODEL, ORIG_DIR, _a1), 0.4);
}
function stuckModel(a) {
  return arrowMat(a.m, xformPoint(MODEL, a.tipL, _a0), rotDir(MODEL, a.dirL, _a1), a.roll);
}
function drawArrowMesh(m) { s3.drawMesh(K.arrow, { model: m }); }
// strokes on top of the mesh: the shaft is ~2 cm, often thinner than a cell
function arrowStrokes(m, alpha, flying) {
  xformPoint(m, [0, flying ? 0.0 : 0.09, 0], _a0); xformPoint(m, [0, ARROW_L, 0], _a1);
  s3.lineWorld(_a0[0], _a0[1], _a0[2], _a1[0], _a1[1], _a1[2], STROKE_WOOD[0], STROKE_WOOD[1], STROKE_WOOD[2], alpha, 0.25);
  // a second pass a hair to the side so the shaft reads two cells wide up close
  var ox = (s3.right[0] + s3.up[0]) * 0.007, oy = (s3.right[1] + s3.up[1]) * 0.007, oz = (s3.right[2] + s3.up[2]) * 0.007;
  s3.lineWorld(_a0[0] + ox, _a0[1] + oy, _a0[2] + oz, _a1[0] + ox, _a1[1] + oy, _a1[2] + oz, 255, 186, 92, alpha, 0.25);
  for (var k = 0; k < 3; k++) {
    var an = k / 3 * TAU + 0.4, ca = Math.cos(an), sa = Math.sin(an);
    xformPoint(m, [ca * 0.012, ARROW_L - 0.16, sa * 0.012], _a0);
    xformPoint(m, [ca * 0.06, ARROW_L - 0.03, sa * 0.06], _a1);
    s3.lineWorld(_a0[0], _a0[1], _a0[2], _a1[0], _a1[1], _a1[2], k === 0 ? 255 : 245, k === 0 ? 70 : 240, k === 0 ? 80 : 235, alpha, 0.2);
  }
  if (flying) {
    xformPoint(m, [0, 0, 0], _a0); xformPoint(m, [0, 0.09, 0], _a1);
    s3.lineWorld(_a0[0], _a0[1], _a0[2], _a1[0], _a1[1], _a1[2], 230, 240, 255, 1, 0.9);
  }
}

// ---- firing -----------------------------------------------------------------------------
function fireArrow(t) {
  var W = s3.W, D = s3.depth, gids = K.mesh.groups;
  var ix = Math.floor(pointer.gx), iy = Math.floor(pointer.gy), ci = -1;
  var onHim = s3.hit(ix, iy) >= 0 && s3.gid[iy * W + ix] !== gids.sword;
  if (onHim) ci = iy * W + ix;
  else {
    // a miss: somewhere visible on his torso, back (cloak), shoulders or legs
    var want = [gids.body, gids.legs, gids.cloak, gids.head], cand = [];
    for (var c = 0; c < D.length; c++) if (D[c] > 0 && want.indexOf(s3.gid[c]) >= 0) cand.push(c);
    if (cand.length) ci = cand[(Math.random() * cand.length) | 0];
  }
  S.shots++; S.lastHit = onHim;
  if (ci < 0) return;
  var cx = ci % W, cy = (ci - cx) / W, z = 1 / D[ci], e = s3.eye;
  s3.ray(cx, cy, _rd);
  var pw = [e[0] + _rd[0] * z, e[1] + _rd[1] * z, e[2] + _rd[2] * z];
  var f = { t0: t, tgtL: toLocal(pw, [0, 0, 0]), side: Math.random() < 0.5 ? -1 : 1, roll: Math.random() * TAU };
  // launch from just outside a top corner of the frame, halfway to him, so the whole
  // flight is on screen and the arrow lands at a slant that reads (not end-on)
  var tanV = Math.tan(s3.cam.fov / 2), tanH = tanV * (s3.W * s3.cw) / (s3.H * s3.chh);
  var dist = Math.hypot(pw[0] - e[0], pw[1] - e[1], pw[2] - e[2]), z0 = dist * 0.42;
  var rt = s3.right, fw = s3.fwd, up = s3.up;
  var xo = f.side * (1.12 + 0.1 * Math.random()) * tanH * z0, yo = (1.12 + 0.2 * Math.random()) * tanV * z0;
  f.from = [e[0] + fw[0] * z0 + rt[0] * xo + up[0] * yo, e[1] + fw[1] * z0 + rt[1] * xo + up[1] * yo, e[2] + fw[2] * z0 + rt[2] * xo + up[2] * yo];
  f.arc = 0.1 * Math.hypot(pw[0] - f.from[0], pw[1] - f.from[1], pw[2] - f.from[2]);
  f.m = new Float32Array(12);
  S.flying.push(f);
}
function flyTarget(f, out) {
  return xformPoint(MODEL, f.tgtL, out);
}
var _ft = [0, 0, 0];
function flyPos(f, s, out, dir) {
  var T = flyTarget(f, _ft), a = f.from, h = f.arc;
  out[0] = a[0] + (T[0] - a[0]) * s; out[1] = a[1] + (T[1] - a[1]) * s + h * 4 * s * (1 - s); out[2] = a[2] + (T[2] - a[2]) * s;
  if (dir) {
    var d = norm3([T[0] - a[0], T[1] - a[1] + h * 4 * (1 - 2 * s), T[2] - a[2]]);
    dir[0] = d[0]; dir[1] = d[1]; dir[2] = d[2];
  }
  return out;
}
var _fp = [0, 0, 0], _fd = [0, 0, 0];
function stepFlying(t) {
  for (var i = S.flying.length - 1; i >= 0; i--) {
    var f = S.flying[i], s = (t - f.t0) / FLIGHT_T;
    if (s >= 1) { S.flying.splice(i, 1); stick(f, t); continue; }
    flyPos(f, s, _fp, _fd);
    arrowMat(f.m, _fp, _fd, f.roll + s * 3);
    drawArrowMesh(f.m);
  }
}
function drawFlying(t) {
  for (var i = 0; i < S.flying.length; i++) {
    var f = S.flying[i], s = (t - f.t0) / FLIGHT_T;
    arrowStrokes(f.m, 1, true);
    // a hot streak trailing the nock along the arc
    var prev = null;
    for (var k = 0; k <= 9; k++) {
      var sk = s - k * 0.028;
      if (sk < 0) break;
      flyPos(f, sk, _fp, _fd);
      var p = [_fp[0] - _fd[0] * ARROW_L, _fp[1] - _fd[1] * ARROW_L, _fp[2] - _fd[2] * ARROW_L];
      if (prev) {
        var q = 1 - k / 10;
        s3.lineWorld(prev[0], prev[1], prev[2], p[0], p[1], p[2], 255, 150 + 90 * q, 60 + 140 * q, q, k < 4 ? 0.9 : 0.3, k < 3 ? 0 : 45);
      }
      prev = p;
    }
  }
}
function stick(f, t) {
  var T = flyTarget(f, [0, 0, 0]);
  flyPos(f, 1, _fp, _fd);
  var dirL = norm3(dirToLocal(_fd, [0, 0, 0]));
  var a = { t0: t, dirL: dirL, roll: f.roll + 3, m: new Float32Array(12), seed: Math.random() * TAU, next: t + 0.55 };
  a.tipL = add(f.tgtL, dirL, 0.045);
  var ap = armourPath(f.tgtL);
  a.path = ap.pts; a.ground = ap.ground;
  a.pw = []; for (var j = 0; j < a.path.length; j++) a.pw.push([0, 0, 0]);
  S.arrows.push(a);
  while (S.arrows.length > ARROW_MAX) S.arrows.shift();
  // impact: sparks, a spit of blood, the flinch
  for (var i = 0; i < 16; i++) {
    var an = Math.random() * TAU, sp = 0.3 + Math.random() * 0.8;
    S.parts.emit(K_SPARK, T[0], T[1], T[2], Math.cos(an) * sp - _fd[0] * 0.6, 0.2 + Math.random() * 0.9, Math.sin(an) * sp - _fd[2] * 0.6, 0.35 + Math.random() * 0.35);
  }
  for (i = 0; i < 7; i++) {
    S.parts.emit(K_SPLASH, T[0], T[1], T[2], -_fd[0] * 0.5 + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.6, -_fd[2] * 0.5 + (Math.random() - 0.5) * 0.6, 0.5);
  }
  var ax = [dirL[2], 0, -dirL[0]], al = Math.hypot(ax[0], ax[2]);
  if (al > 0.15) S.recoil = { t0: t, axis: [ax[0] / al, 0, ax[2] / al] };
}

// a trail crawling downhill over the armour samples until it overhangs, leaves the
// surface or reaches the ground; returns local points lifted 1.2 cm off the plate
function nearestSkin(p) {
  var P = K.skin.pos, n = K.skin.n, best = 1e9, bi = -1;
  for (var i = 0; i < n; i++) {
    var dx = P[i * 3] - p[0], dy = P[i * 3 + 1] - p[1], dz = P[i * 3 + 2] - p[2], d = dx * dx + dy * dy + dz * dz;
    if (d < best) { best = d; bi = i; }
  }
  return [bi, Math.sqrt(best)];
}
// the highest outward-facing armour sample within ~4 cm horizontally, up to 25 cm below p
function skinBelow(p) {
  var P = K.skin.pos, N = K.skin.nrm, best = -1, by = -1e9;
  for (var i = 0; i < K.skin.n; i++) {
    var y = P[i * 3 + 1];
    if (y > p[1] - 0.015 || y < p[1] - 0.25 || y <= by) continue;
    var dx = P[i * 3] - p[0], dz = P[i * 3 + 2] - p[2];
    if (dx * dx + dz * dz > 0.045 * 0.045 || N[i * 3 + 1] < -0.3) continue;
    best = i; by = y;
  }
  return best;
}
function armourPath(p0, wobSeed, bias) {
  var P = K.skin.pos, N = K.skin.nrm, LIFT = 0.012, STEP = 0.012;
  var nb = nearestSkin(p0), pts = [];
  if (nb[0] < 0 || nb[1] > 0.06) return { pts: [p0.slice()], ground: p0[1] < 0.06 };
  var n = [N[nb[0] * 3], N[nb[0] * 3 + 1], N[nb[0] * 3 + 2]], p = p0.slice(), ground = false;
  pts.push(add(p, n, LIFT));
  var wob = (wobSeed === undefined ? Math.random() : wobSeed) * TAU, jumps = 0;
  for (var k = 0; k < 90; k++) {
    // gravity projected onto the surface plane, with a little meander
    var tx = n[0] * n[1], ty = -1 + n[1] * n[1], tz = n[2] * n[1];
    var tl = Math.hypot(tx, ty, tz);
    if (tl < 0.25) { tx += Math.cos(wob) * 0.4; tz += Math.sin(wob) * 0.4; }
    if (bias) { var bk = 0.9 * Math.max(0, 1 - k / 30); tx += bias[0] * bk; ty += bias[1] * bk; tz += bias[2] * bk; }
    var m = 0.18 * Math.sin(k * 0.45 + wob);
    tx += m * n[2]; tz -= m * n[0];
    tl = Math.hypot(tx, ty, tz) || 1;
    p[0] += tx / tl * STEP; p[1] += ty / tl * STEP; p[2] += tz / tl * STEP;
    nb = nearestSkin(p);
    if (nb[1] > 0.045 || n[1] < -0.5) {
      // ran off an edge or under a plate: fall onto the plate below if there is one
      // (the run then streams across the gap), else it drips from here
      var bi = jumps < 4 ? skinBelow(p) : -1;
      if (bi < 0) break;
      jumps++;
      p = [P[bi * 3], P[bi * 3 + 1], P[bi * 3 + 2]]; n = [N[bi * 3], N[bi * 3 + 1], N[bi * 3 + 2]];
      pts.push(add(p, n, LIFT));
      continue;
    }
    var qi = nb[0] * 3, nq = [N[qi], N[qi + 1], N[qi + 2]];
    var off = (p[0] - P[qi]) * nq[0] + (p[1] - P[qi + 1]) * nq[1] + (p[2] - P[qi + 2]) * nq[2];
    p[0] -= nq[0] * off; p[1] -= nq[1] * off; p[2] -= nq[2] * off;
    n = norm3([n[0] + nq[0], n[1] + nq[1], n[2] + nq[2]]);
    pts.push(add(p, n, LIFT));
    if (p[1] < 0.04) { ground = true; break; }
  }
  return { pts: pts, ground: ground };
}

// ---- bleeding ----------------------------------------------------------------------------
function bleed(a, t) {
  var age = t - a.t0, rate = Math.max(0.18, 1 / (1 + age / 9));
  var pw, i;
  for (i = 0; i < a.path.length; i++) xformPoint(MODEL, a.path[i], a.pw[i]);
  pw = a.pw;
  var w0 = pw[0], dk = 0.45 + 0.55 * rate;
  // the bead: swells at the wound, then sits there pulsing
  if (age < 0.45) {
    var u = age / 0.45;
    s3.markWorld(w0[0], w0[1], w0[2], u < 0.3 ? 46 : u < 0.6 ? 111 : u < 0.85 ? 79 : 64, BLOOD[0], BLOOD[1] + 40 * (1 - u), BLOOD[2], 1, 0.8);
  } else {
    for (var k = 0; k < 6; k++) {
      var an = k / 6 * TAU + a.seed, r = 0.012 + 0.012 * hash1(k * 3.1 + a.seed);
      var lum = 0.6 + 0.4 * Math.sin(t * 3 * rate + k);
      s3.markWorld(w0[0] + s3.right[0] * Math.cos(an) * r, w0[1] + Math.sin(an) * r, w0[2] + s3.right[2] * Math.cos(an) * r,
        k & 1 ? 37 : 64, BLOOD[0] * dk, BLOOD[1] * dk, BLOOD[2] * dk, 0.9 * lum + 0.1, 0.4 * rate);
    }
  }
  // the run: a front crawls down the path, then a travelling cos^3 pulse rides it
  var total = 0, segL = [];
  for (i = 1; i < pw.length; i++) { var L = Math.hypot(pw[i][0] - pw[i - 1][0], pw[i][1] - pw[i - 1][1], pw[i][2] - pw[i - 1][2]); segL.push(L); total += L; }
  var front = Math.min(total, Math.max(0, (age - 0.3) * 0.5));
  var RAMP = ':=+*%#@', rt = s3.right;
  if (segL.length) {
    var acc = 0, si = 0;
    for (var s = 0; s <= front; s += 0.007) {
      while (si < segL.length - 1 && s > acc + segL[si]) { acc += segL[si]; si++; }
      var f = segL[si] > 0 ? (s - acc) / segL[si] : 0, p0 = pw[si], p1 = pw[si + 1];
      var x = p0[0] + (p1[0] - p0[0]) * f, y = p0[1] + (p1[1] - p0[1]) * f, z = p0[2] + (p1[2] - p0[2]) * f;
      var aa = s / (total || 1);
      var wave = Math.pow(0.5 + 0.5 * Math.cos(TAU * aa * 3 - TAU * t * rate / 1.8 + a.seed), 3);
      var head = front < total && s > front - 0.02 ? 1 : 0;   // the leading bead of a fresh run
      var mix = (0.35 + 0.65 * wave) * dk;
      var cr = BLOOD_DARK[0] + (BLOOD[0] - BLOOD_DARK[0]) * mix, cg = BLOOD_DARK[1] + (BLOOD[1] - BLOOD_DARK[1]) * mix, cb = BLOOD_DARK[2] + (BLOOD[2] - BLOOD_DARK[2]) * mix;
      var l2 = 0.45 + 0.45 * wave * rate;
      var code = head ? 64 : RAMP.charCodeAt(Math.min(RAMP.length - 1, (l2 * RAMP.length) | 0));
      s3.markWorld(x, y, z, code, cr, cg, cb, 1, wave > 0.6 ? 0.6 * wave * rate : head * 0.5);
      if (wave > 0.35) s3.markWorld(x + rt[0] * 0.007, y, z + rt[2] * 0.007, 58, cr * 0.8, cg, cb, 0.85, 0);
    }
  }
  // drops gather at the end and fall; older wounds drip less often
  if (front < total || age < 0.6) return;
  var end = pw[pw.length - 1], I = 0.85 / rate;
  if (a.ground) {
    if (t >= a.next) { a.next = t + I; addStain(end[0], end[2]); if (Math.random() < 0.5) S.rip.add(end[0], 0.006, end[2], 1.0, 0.14, 0.02); }
    return;
  }
  var rem = a.next - t, sw = Math.min(0.55, I * 0.6);
  if (rem < sw) {
    var g = 1 - rem / sw, rr = 0.005 + 0.014 * Math.pow(g, 0.7);
    s3.markWorld(end[0], end[1] - rr, end[2], g < 0.3 ? 46 : g < 0.6 ? 111 : g < 0.85 ? 79 : 64, BLOOD[0], BLOOD[1] + 20 * g, BLOOD[2], 1, 0.6 * g);
  }
  if (t >= a.next) {
    a.next = t + I * (0.85 + 0.3 * Math.random());
    S.parts.emit(K_DROP, end[0], end[1] - 0.02, end[2], 0, -0.1, 0, 4);
  }
}

// ground stains where the new wounds' drops land
function addStain(x, z) {
  var st = S.stains;
  for (var i = 0; i < st.length; i++) {
    var s = st[i];
    if (Math.hypot(x - s.x, z - s.z) < s.r + 0.03) { s.n++; s.r = Math.min(0.17, 0.035 + 0.014 * Math.sqrt(s.n)); return; }
  }
  st.push({ x: x, z: z, r: 0.035, n: 1 });
  if (st.length > 40) st.shift();
}
function stainAt(x, z) {
  var st = S.stains, best = 0;
  for (var i = 0; i < st.length; i++) {
    var s = st[i], dx = (x - s.x) / s.r, dz = (z - s.z) / s.r, d = dx * dx + dz * dz;
    if (d < 1 && 1 - d > best) best = 1 - d;
  }
  return best;
}

// sky: stars on the celestial sphere (they turn with the camera) + shooting stars --------
function drawSky(t, dt, W, H) {
  var st = G.stars;
  for (var i = 0; i < st.length; i++) {
    var s = st[i];
    if (!s3.projectDir(s.d[0], s.d[1], s.d[2], _p)) continue;
    var a = s.b * (0.55 + 0.45 * Math.sin(t * (0.8 + s.b) + s.p));
    s3.bg(_p[0], _p[1], s.c, s.tint[0], s.tint[1], s.tint[2], a);
  }
  S.nextShoot -= dt;
  if (!S.shoot && S.nextShoot <= 0) {
    var az = S.camYaw + Math.PI + (Math.random() - 0.5) * 1.4, el = 0.35 + Math.random() * 0.35;
    S.shoot = { az: az, el: el, daz: (Math.random() < 0.5 ? -1 : 1) * (0.5 + Math.random() * 0.4), del: -0.22 - Math.random() * 0.15, age: 0, life: 1.1 };
    S.nextShoot = 5 + Math.random() * 7;
  }
  if (S.shoot) {
    var sh = S.shoot;
    sh.age += dt;
    if (sh.age > sh.life) { S.shoot = null; return; }
    var f = sh.age / sh.life, fade = Math.sin(Math.PI * Math.min(1, f * 1.2));
    for (var k = 0; k < 14; k++) {
      var tt = Math.max(0, sh.age - k * 0.022);
      var az2 = sh.az + sh.daz * tt, el2 = sh.el + sh.del * tt;
      if (!s3.projectDir(Math.sin(az2) * Math.cos(el2), Math.sin(el2), Math.cos(az2) * Math.cos(el2), _p)) continue;
      var code = k === 0 ? 42 : k < 4 ? 43 : k < 9 ? 45 : 46;
      var br = 1 - k / 14;
      s3.mark(_p[0], _p[1], code, 200 + 55 * br, 220 + 35 * br, 255, fade * (0.35 + 0.65 * br), 0, k < 3 ? 0.9 : 0);
    }
  }
}

// poppies: 3D sprites on the ground, size by projected depth -----------------------------
function drawPoppies(t, W, H) {
  var ps = G.poppies, n = Math.floor(ps.length * (0.55 + 0.45 * s3.quality));
  for (var i = 0; i < n; i++) {
    var p = ps[i];
    var sway = 0.025 * Math.sin(t * 1.5 + p.ph + p.x * 0.6) + 0.12 * gustAt(p.x, t) * (0.7 + 0.3 * Math.sin(t * 6 + p.ph));
    var x = p.x + sway, y = p.h, z = p.z;
    if (!s3.project(x, y, z, _p)) continue;
    var px = _p[0], py = _p[1], iz = _p[2];
    if (px < -4 || px > W + 4 || py < 0 || py > H + 2) continue;
    var cells = 0.08 * s3.fpx * iz / s3.cw;   // flower diameter in columns
    var fog = Math.max(0.35, Math.min(1, 2.6 * iz * G.dist / 5));
    var pr, pg, pb, cr, cg, cb;
    if (p.white) { pr = 245; pg = 242; pb = 232; cr = 255; cg = 200; cb = 50; }
    else { pr = 255; pg = 38 + 30 * p.s; pb = 52; cr = 190; cg = 10; cb = 34; }
    pr *= fog; pg *= fog; pb *= fog;
    var ix = Math.floor(px), iy = Math.floor(py);
    if (cells < 1.3) {
      s3.mark(ix, iy, cells < 0.7 ? 46 : 111, pr, pg, pb, 0.9, iz, 0);
    } else if (cells < 3.6) {
      s3.mark(ix - 1, iy, 40, pr, pg, pb, 1, iz, 0.15); s3.mark(ix, iy, 64, cr, cg, cb, 1, iz, 0.15); s3.mark(ix + 1, iy, 41, pr, pg, pb, 1, iz, 0.15);
      s3.mark(ix, iy + 1, 124, 70 * fog, 150 * fog, 50 * fog, 0.9, iz, 0);
    } else {
      // big near flower: ((@@)) over (\@@/), a stem below
      var r0 = '((@@))', r1 = '(\\@@/)';
      for (var k = 0; k < 6; k++) {
        var c0 = r0.charCodeAt(k), c1 = r1.charCodeAt(k), centre = c0 === 64;
        s3.mark(ix - 3 + k, iy - 1, c0, centre ? cr : pr, centre ? cg : pg, centre ? cb : pb, 1, iz, 0.2);
        s3.mark(ix - 3 + k, iy, c1, c1 === 64 ? cr : pr, c1 === 64 ? cg : pg, c1 === 64 ? cb : pb, 1, iz, 0.2);
      }
      s3.mark(ix, iy + 1, 124, 80, 170, 60, 0.95, iz, 0); s3.mark(ix - 1, iy + 2, 47, 80, 170, 60, 0.9, iz, 0);
    }
  }
}

// ground: ray-cast every cell below the horizon onto y = 0 ------------------------------
var GRASS_COLS = [[160, 180, 50], [96, 160, 58], [200, 178, 70], [128, 196, 80]];
function drawGround(t, W, H, path) {
  var D = s3.depth, d = path ? path[path.length - 1] : null;
  var poolR = d ? 0.16 + Math.min(0.42, S.drops * 0.012) : 0;
  if (!d) d = [99, 0, 99];
  var pcx = d[0] - 0.02, pcz = d[2] + 0.05;
  var hasRip = S.rip.n > 0, hasStain = S.stains.length > 0, sx0 = 1e9, sx1 = -1e9, sz0 = 1e9, sz1 = -1e9;
  for (var si = 0; si < S.stains.length; si++) {
    var sn = S.stains[si];
    sx0 = Math.min(sx0, sn.x - sn.r); sx1 = Math.max(sx1, sn.x + sn.r); sz0 = Math.min(sz0, sn.z - sn.r); sz1 = Math.max(sz1, sn.z + sn.r);
  }
  for (var iy = 0; iy < H; iy++) {
    for (var ix = 0; ix < W; ix++) {
      var ci = iy * W + ix;
      var solid = D[ci] > 0;
      if (solid && s3.wy[ci] > 0.08) continue;
      if (s3.mch[ci]) continue;
      if (!s3.groundHit(ix, iy, 0, _o)) continue;
      var wx = _o[0], wz = _o[1], iz = _o[2], dist = _o[3];
      if (dist > 60) continue;
      var fog = Math.exp(-dist / 11);
      // the pool: horizontal smears of blood under him, brightened by ripples
      var pdx = (wx - pcx) / (poolR * 1.6), pdz = (wz - pcz) / poolR, pd = pdx * pdx + pdz * pdz;
      if (pd < 1 && !solid) {
        var rp = hasRip ? S.rip.at(wx, wz, 0.03) : 0;
        var e = 1 - pd, lum = 0.35 + 0.5 * e + 0.8 * rp;
        var code = rp > 0.3 ? 126 : hash2(ix, iy) < 0.5 ? 61 : 45;   // ~ = -
        s3.mark(ix, iy, code, Math.min(255, 150 + 140 * lum), 10 + 120 * rp, 24 + 60 * rp, Math.min(1, 0.5 + lum * 0.6), iz, rp * 0.5);
        continue;
      }
      // stains where the new wounds' drops landed
      if (hasStain && !solid && wx > sx0 && wx < sx1 && wz > sz0 && wz < sz1) {
        var sk = stainAt(wx, wz);
        if (sk > 0) {
          var rs = hasRip ? S.rip.at(wx, wz, 0.03) : 0, ls = 0.3 + 0.5 * sk + 0.8 * rs;
          s3.mark(ix, iy, rs > 0.3 ? 126 : hash2(ix, iy) < 0.5 ? 61 : 45, Math.min(255, 140 + 140 * ls), 8 + 110 * rs, 22 + 60 * rs, Math.min(1, 0.45 + ls * 0.6), iz, rs * 0.5);
          continue;
        }
      }
      // grass: one blade per ~4 cm cell of the field, leaning with breeze + gusts
      var gxw = Math.floor(wx / 0.045), gzw = Math.floor(wz / 0.045);
      var h = hash2(gxw + ix * 0.37, gzw + iy * 0.61);
      // sparse field: ~1 blade in 3 cells on a phone, fewer on big screens, dark gaps between tufts
      var dens = G.grassK * (0.85 + 0.6 * Math.sin(wx * 1.3 + wz * 0.7) * Math.sin(wz * 1.9 - wx * 0.4));
      if (dist > 14) dens *= 0.45;
      if (solid) {   // blades in front of his knee/boot/cloak hem
        if (h > 0.45) continue;
        dens = 1;
      }
      if (h > dens) {
        if (h > 0.985 && fog > 0.1) s3.mark(ix, iy, 46, 120 * fog, 140 * fog, 70 * fog, 0.7, iz, 0);
        continue;
      }
      var lean = 0.22 * Math.sin(t * 1.3 + wx * 0.9 + wz * 0.5) + (hash2(gzw, gxw + 3) - 0.5) * 0.9 + 1.4 * gustAt(wx, t) * (0.8 + 0.2 * Math.sin(t * 8 + h * 9));
      var codeG;
      if (dist > 14) codeG = h < 0.3 ? 46 : 58;                              // . :
      else if (lean > 0.95) codeG = h < 0.5 ? 47 : 126;                      // / ~
      else if (lean < -0.95) codeG = h < 0.5 ? 92 : 126;                     // \ ~
      else if (lean > 0.36) codeG = 47;
      else if (lean < -0.36) codeG = 92;
      else codeG = h < 0.02 ? 60 : h < 0.04 ? 62 : h < 0.12 ? 39 : h < 0.2 ? 44 : 124;      // < > ' , |
      var gc = GRASS_COLS[(h * 97 | 0) & 3];
      var br = (0.3 + 0.5 * fog) * (0.5 + 0.5 * hash2(gxw + 7, gzw));
      if (iz <= 0) continue;
      s3.mark(ix, iy, codeG, gc[0] * br, gc[1] * br, gc[2] * br, 0.9, solid ? 0 : iz, 0);
    }
  }
}

registerMode(MODE, { init: initKnight, render: renderKnight, cleanup: cleanupKnight });
