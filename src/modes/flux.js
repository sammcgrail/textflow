import { RAMP_DENSE, RAMP_SOFT } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { simplex2 } from '../core/noise.js';

// flux — bioluminescent ferrofluid.
// Luminous tendrils swim through a dark medium, sensing and chasing each
// other's glow (physarum-style), braiding into rivers and pooling where they
// meet. The glow itself is a fluid: it advects through a stirred velocity
// field and the medium flashes cyan wherever it is sheared — so dragging
// literally stirs the pools around, lights up the wake, and the tendrils get
// agitated (brighter, faster) before everything settles back. Tap detonates
// a luminous burst that shoves the fluid outward and draws the tendrils in.

var fxW = 0, fxH = 0;
var velX, velY, velX2, velY2;   // stirred velocity (pointer + bursts), decays
var dye, dye2;                   // luminous plasma density
var hueF, hueF2;                 // per-cell hue, carried along with the dye
var tendrils = [];
var bursts = [];
var lastPX = -1, lastPY = -1;    // pointer tracking for stir delta
var lastInput = -1e9;
var fxFrame = 0;

// Coarse ambient-current lattice (curl noise) — fixed node count, any grid size
var CN = 10, CM = 8;
var curlN = new Float32Array(CN * CM);
var curlVX = new Float32Array(CN * CM);
var curlVY = new Float32Array(CN * CM);
var _cvx = 0, _cvy = 0;

var FLUX_PALETTE = [165, 178, 190, 205, 262, 288, 316];
var FLUX_BODY = '.~:=*%';

function fluxPickHue() {
  return FLUX_PALETTE[(Math.random() * FLUX_PALETTE.length) | 0] + Math.random() * 18 - 9;
}

function makeTendril(W, H, segs) {
  var hx = new Float32Array(segs), hy = new Float32Array(segs);
  var x = 1 + Math.random() * Math.max(1, W - 2);
  var y = 1 + Math.random() * Math.max(1, H - 2);
  for (var i = 0; i < segs; i++) { hx[i] = x; hy[i] = y; }
  return {
    x: x, y: y,
    ang: Math.random() * Math.PI * 2,
    hue: fluxPickHue(),
    ex: 0.4 + Math.random() * 0.6,   // excitement: agitation glow (opening flourish)
    seed: Math.random() * 100,
    hx: hx, hy: hy, hi: 0, segs: segs
  };
}

function initFlux() {
  fxW = state.COLS; fxH = state.ROWS;
  var sz = fxW * fxH;
  velX = new Float32Array(sz); velY = new Float32Array(sz);
  velX2 = new Float32Array(sz); velY2 = new Float32Array(sz);
  dye = new Float32Array(sz); dye2 = new Float32Array(sz);
  hueF = new Float32Array(sz); hueF2 = new Float32Array(sz);
  var cap = state.isMobile ? 13 : 26;
  var count = Math.max(5, Math.min(cap, Math.round(sz / 140)));
  var segs = state.isMobile ? 10 : 16;
  tendrils = [];
  for (var i = 0; i < count; i++) tendrils.push(makeTendril(fxW, fxH, segs));
  bursts = [];
  lastPX = -1; lastPY = -1;
  // Seed faint plankton motes so the first frame already breathes
  var seeds = Math.max(8, (sz / 60) | 0);
  for (var s = 0; s < seeds; s++) {
    var mi = (Math.random() * sz) | 0;
    dye[mi] = 0.08 + Math.random() * 0.12;
    hueF[mi] = fluxPickHue();
  }
}

// Bilinear sample of the coarse curl lattice at grid coords → _cvx/_cvy
function sampleCurl(x, y, W, H) {
  var u = W > 1 ? (x / (W - 1)) * (CN - 1) : 0;
  var v = H > 1 ? (y / (H - 1)) * (CM - 1) : 0;
  if (u < 0) u = 0; else if (u > CN - 1.001) u = CN - 1.001;
  if (v < 0) v = 0; else if (v > CM - 1.001) v = CM - 1.001;
  var u0 = u | 0, v0 = v | 0;
  var fu = u - u0, fv = v - v0;
  var iA = v0 * CN + u0, iB = iA + 1, iC = iA + CN, iD = iC + 1;
  var wA = (1 - fu) * (1 - fv), wB = fu * (1 - fv), wC = (1 - fu) * fv, wD = fu * fv;
  _cvx = curlVX[iA] * wA + curlVX[iB] * wB + curlVX[iC] * wC + curlVX[iD] * wD;
  _cvy = curlVY[iA] * wA + curlVY[iB] * wB + curlVY[iC] * wC + curlVY[iD] * wD;
}

function spawnBurst(bx, by, W, H, t) {
  var hue = Math.random() < 0.12 ? 45 : fluxPickHue(); // rare gold flash
  bursts.push({ x: bx, y: by, born: t, hue: hue });
  if (bursts.length > 6) bursts.shift();
  // Radial shove into the velocity field
  var R = Math.max(3, Math.min(7, Math.min(W, H) * 0.3));
  var x0 = Math.max(0, (bx - R) | 0), x1 = Math.min(W - 1, (bx + R) | 0);
  var y0 = Math.max(0, (by - R) | 0), y1 = Math.min(H - 1, (by + R) | 0);
  for (var y = y0; y <= y1; y++) {
    for (var x = x0; x <= x1; x++) {
      var dx = x - bx, dy = y - by;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d > R || d < 0.5) continue;
      var f = 1.9 * (1 - d / R) / d;
      var i = y * W + x;
      velX[i] += dx * f;
      velY[i] += dy * f;
    }
  }
  // Luminous splash
  var SR = 2.5;
  x0 = Math.max(0, (bx - SR) | 0); x1 = Math.min(W - 1, (bx + SR) | 0);
  y0 = Math.max(0, (by - SR) | 0); y1 = Math.min(H - 1, (by + SR) | 0);
  for (y = y0; y <= y1; y++) {
    for (x = x0; x <= x1; x++) {
      dx = x - bx; dy = y - by;
      d = Math.sqrt(dx * dx + dy * dy);
      if (d > SR) continue;
      i = y * W + x;
      dye[i] = Math.min(1.5, dye[i] + 0.95 * (1 - d / SR));
      hueF[i] = hue;
    }
  }
  // The flash draws the swimmers in, agitated
  for (var n = 0; n < tendrils.length; n++) {
    var T = tendrils[n];
    var tdx = bx - T.x, tdy = by - T.y;
    var td = Math.sqrt(tdx * tdx + tdy * tdy);
    if (td < 16 && td > 0.001) {
      T.ex = Math.min(1.6, T.ex + (1 - td / 16) * 1.1);
      var want = Math.atan2(tdy, tdx);
      var dw = Math.atan2(Math.sin(want - T.ang), Math.cos(want - T.ang));
      T.ang += dw * 0.5;
    }
  }
}

function renderFlux() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, sz = W * H;
  if (!dye || fxW !== W || fxH !== H) initFlux();
  var t = state.time;
  var mine = state.currentMode === 'flux';
  fxFrame++;
  var i, x, y, cx, cy, dx, dy, d;

  // ---- ambient current: coarse curl-noise lattice, evolving over time ----
  for (cy = 0; cy < CM; cy++) {
    for (cx = 0; cx < CN; cx++) {
      curlN[cy * CN + cx] = simplex2(cx * 0.9 + t * 0.11, cy * 0.9 - t * 0.07);
    }
  }
  var curlAmp = 0.5;
  for (cy = 0; cy < CM; cy++) {
    for (cx = 0; cx < CN; cx++) {
      var xm = cx > 0 ? cx - 1 : cx, xp = cx < CN - 1 ? cx + 1 : cx;
      var ym = cy > 0 ? cy - 1 : cy, yp = cy < CM - 1 ? cy + 1 : cy;
      curlVX[cy * CN + cx] = (curlN[yp * CN + cx] - curlN[ym * CN + cx]) * curlAmp;
      curlVY[cy * CN + cx] = -(curlN[cy * CN + xp] - curlN[cy * CN + xm]) * curlAmp;
    }
  }

  // ---- input: stirring (drag injects momentum along the stroke) ----
  if (pointer.down && mine) {
    lastInput = t;
    var px = pointer.gx, py = pointer.gy;
    var dxp = 0, dyp = 0;
    if (lastPX > -1) { dxp = px - lastPX; dyp = py - lastPY; }
    var mag = Math.sqrt(dxp * dxp + dyp * dyp);
    if (mag > 6) { dxp *= 6 / mag; dyp *= 6 / mag; }
    var R = 3.5;
    var x0 = Math.max(0, (px - R) | 0), x1 = Math.min(W - 1, (px + R) | 0);
    var y0 = Math.max(0, (py - R) | 0), y1 = Math.min(H - 1, (py + R) | 0);
    for (y = y0; y <= y1; y++) {
      for (x = x0; x <= x1; x++) {
        dx = x - px; dy = y - py;
        var d2 = dx * dx + dy * dy;
        if (d2 > R * R) continue;
        var w = Math.exp(-d2 / (R * 1.6));
        i = y * W + x;
        velX[i] += dxp * 0.55 * w;
        velY[i] += dyp * 0.55 * w;
        // touch faintly luminesces even before you move
        if (dye[i] < 0.35) { dye[i] = Math.min(0.35, dye[i] + 0.03 * w); hueF[i] = 185; }
      }
    }
    lastPX = px; lastPY = py;
  } else {
    lastPX = -1; lastPY = -1;
  }

  // ---- input: tap detonates a luminous burst ----
  if (pointer.clicked && mine) {
    pointer.clicked = false;
    lastInput = t;
    spawnBurst(pointer.gx, pointer.gy, W, H, t);
  }

  // ---- velocity: decay + gentle spread (stirring visibly settles) ----
  var vdecay = 0.955;
  if ((fxFrame & 1) === 0) {
    for (y = 0; y < H; y++) {
      for (x = 0; x < W; x++) {
        i = y * W + x;
        var xl = x > 0 ? i - 1 : i, xr = x < W - 1 ? i + 1 : i;
        var yu = y > 0 ? i - W : i, yd = y < H - 1 ? i + W : i;
        velX2[i] = (velX[i] * 0.72 + (velX[xl] + velX[xr] + velX[yu] + velX[yd]) * 0.07) * vdecay;
        velY2[i] = (velY[i] * 0.72 + (velY[xl] + velY[xr] + velY[yu] + velY[yd]) * 0.07) * vdecay;
      }
    }
    var tv = velX; velX = velX2; velX2 = tv;
    tv = velY; velY = velY2; velY2 = tv;
  } else {
    for (i = 0; i < sz; i++) { velX[i] *= vdecay; velY[i] *= vdecay; }
  }

  // ---- glow advection: semi-Lagrangian backtrace through stir + current ----
  var decay = 0.935;
  for (y = 0; y < H; y++) {
    for (x = 0; x < W; x++) {
      i = y * W + x;
      sampleCurl(x, y, W, H);
      var sxf = x - (velX[i] + _cvx);
      var syf = y - (velY[i] + _cvy);
      if (sxf < 0) sxf = 0; else if (sxf > W - 1.001) sxf = W - 1.001;
      if (syf < 0) syf = 0; else if (syf > H - 1.001) syf = H - 1.001;
      var sx0 = sxf | 0, sy0 = syf | 0;
      var fx = sxf - sx0, fy = syf - sy0;
      var iA = sy0 * W + sx0;
      var iB = iA + (sx0 < W - 1 ? 1 : 0);
      var iC = iA + (sy0 < H - 1 ? W : 0);
      var iD = iC + (sx0 < W - 1 ? 1 : 0);
      dye2[i] = ((1 - fx) * (1 - fy) * dye[iA] + fx * (1 - fy) * dye[iB] +
                 (1 - fx) * fy * dye[iC] + fx * fy * dye[iD]) * decay;
      // hue rides along nearest-neighbor: never averaged, never muddy
      hueF2[i] = hueF[fy > 0.5 ? (fx > 0.5 ? iD : iC) : (fx > 0.5 ? iB : iA)];
    }
  }
  var tb = dye; dye = dye2; dye2 = tb;
  tb = hueF; hueF = hueF2; hueF2 = tb;

  // ---- ambient plankton motes reveal the currents ----
  var motes = 1 + ((sz * 0.0006) | 0);
  for (var m = 0; m < motes; m++) {
    var mi = (Math.random() * sz) | 0;
    if (dye[mi] < 0.22) { dye[mi] += 0.1; hueF[mi] = fluxPickHue(); }
  }

  // ---- idle life: occasional spontaneous flare when left alone ----
  if (t - lastInput > 7 && Math.random() < 0.004 && tendrils.length > 0) {
    tendrils[(Math.random() * tendrils.length) | 0].ex = 1.2;
  }

  // ---- tendrils: sense glow, ride the flow, chase the finger ----
  var chase = pointer.down && mine;
  var xMax = Math.max(1, W - 2), yMax = Math.max(1, H - 2);
  for (var n = 0; n < tendrils.length; n++) {
    var T = tendrils[n];

    // physarum sensing: steer toward the brightest glow ahead
    var sd = 3 + T.ex * 2;
    var best = -1, bestA = T.ang;
    for (var s = -1; s <= 1; s++) {
      var a = T.ang + s * 0.55;
      var spx = (T.x + Math.cos(a) * sd) | 0;
      var spy = (T.y + Math.sin(a) * sd) | 0;
      var v = Math.random() * 0.08; // exploration jitter
      if (spx >= 0 && spx < W && spy >= 0 && spy < H) v += dye[spy * W + spx];
      if (v > best) { best = v; bestA = a; }
    }
    var da = Math.atan2(Math.sin(bestA - T.ang), Math.cos(bestA - T.ang));
    T.ang += da * 0.25;
    // organic wander on personal noise
    T.ang += simplex2(T.seed + t * 0.35, T.seed * 1.7) * 0.2;

    // chase the finger: rush from afar, orbit up close
    if (chase) {
      var pdx = pointer.gx - T.x, pdy = pointer.gy - T.y;
      var pd = Math.sqrt(pdx * pdx + pdy * pdy) + 0.001;
      var want = Math.atan2(pdy, pdx);
      var dw = Math.atan2(Math.sin(want - T.ang), Math.cos(want - T.ang));
      T.ang += dw * (pd < 4 ? 0.12 : 0.45) * Math.min(1, 8 / pd + 0.4);
      if (pd < 6) T.ex = Math.min(1.6, T.ex + 0.05);
    }

    // dragged by the stirred fluid; agitation makes it glow
    var hxI = T.x | 0, hyI = T.y | 0;
    var vx0 = 0, vy0 = 0;
    if (hxI >= 0 && hxI < W && hyI >= 0 && hyI < H) {
      i = hyI * W + hxI;
      vx0 = velX[i]; vy0 = velY[i];
      T.ex = Math.min(1.6, T.ex + Math.sqrt(vx0 * vx0 + vy0 * vy0) * 0.1);
    }
    sampleCurl(T.x, T.y, W, H);
    var mv = 0.42 + T.ex * 0.45;
    var nvx = Math.cos(T.ang) * mv + (vx0 + _cvx) * 0.55;
    var nvy = Math.sin(T.ang) * mv + (vy0 + _cvy) * 0.55;
    var nsp = Math.sqrt(nvx * nvx + nvy * nvy);
    if (nsp > 1.15) { nvx *= 1.15 / nsp; nvy *= 1.15 / nsp; }
    T.x += nvx; T.y += nvy;

    // soft walls: reflect
    if (T.x < 1) { T.x = 1; T.ang = Math.PI - T.ang; }
    else if (T.x > xMax) { T.x = xMax; T.ang = Math.PI - T.ang; }
    if (T.y < 1) { T.y = 1; T.ang = -T.ang; }
    else if (T.y > yMax) { T.y = yMax; T.ang = -T.ang; }

    // deposit glow at the head — this is the trail others chase
    hxI = T.x | 0; hyI = T.y | 0;
    if (hxI >= 0 && hxI < W && hyI >= 0 && hyI < H) {
      i = hyI * W + hxI;
      var dep = 0.3 + T.ex * 0.55;
      dye[i] = Math.min(1.5, dye[i] + dep);
      if (dep > dye[i] * 0.45 || dye[i] < 0.6) hueF[i] = T.hue;
    }

    // record body history (ring buffer)
    T.hi = (T.hi + 1) % T.segs;
    T.hx[T.hi] = T.x; T.hy[T.hi] = T.y;

    T.hue += Math.sin(t * 0.13 + T.seed) * 0.15;
    T.ex *= 0.945;
  }

  // ---- bursts: expanding rings excite what they pass ----
  var aspect = state.CHAR_H > 0 ? state.CHAR_W / state.CHAR_H : 0.5;
  for (var b = bursts.length - 1; b >= 0; b--) {
    var B = bursts[b];
    var age = t - B.born;
    if (age > 1.5) { bursts.splice(b, 1); continue; }
    var rad = 2 + age * Math.min(W, H) * 0.3;
    if (age < 0.9) {
      for (n = 0; n < tendrils.length; n++) {
        var T2 = tendrils[n];
        dx = T2.x - B.x; dy = T2.y - B.y;
        d = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(d - rad) < 2.5) T2.ex = Math.min(1.6, T2.ex + 0.25 * (1 - age / 0.9));
      }
    }
  }

  // ---- render: the luminous medium (pools + shear glow) ----
  var soft = RAMP_SOFT, softN = soft.length;
  var dense = RAMP_DENSE, denseN = dense.length;
  for (y = 0; y < H; y++) {
    var row = y * W;
    for (x = 0; x < W; x++) {
      i = row + x;
      var dv = dye[i];
      var vxs = velX[i], vys = velY[i];
      var shear = Math.sqrt(vxs * vxs + vys * vys);
      var vtot = dv + shear * 0.9;
      if (vtot < 0.045) continue;
      var hue, sat, lit, ch;
      if (dv < 0.06) {
        // pure shear: the stirred medium itself flashes cyan
        hue = 185; sat = 95;
        lit = Math.min(62, 16 + shear * 90);
        ch = soft[Math.min(softN - 1, ((1 + shear * 5) | 0))];
      } else {
        hue = hueF[i];
        var vv = Math.min(1.35, vtot);
        sat = 100 - Math.max(0, vv - 1) * 55;      // overdriven cores whiten
        lit = Math.min(88, 13 + vv * 46 + shear * 18);
        if (vv > 0.95) ch = dense[Math.min(denseN - 1, Math.max(1, ((vv - 0.55) * denseN * 0.8) | 0))];
        else ch = soft[Math.min(softN - 1, Math.max(1, ((vv * (softN - 1)) | 0)))];
      }
      drawCharHSL(ch, x, y, hue, sat, lit);
    }
  }

  // ---- render: tendril bodies over the glow ----
  var bodyN = FLUX_BODY.length;
  for (n = 0; n < tendrils.length; n++) {
    var T3 = tendrils[n];
    for (var s2 = T3.segs - 1; s2 >= 1; s2--) {
      var idx = (T3.hi - s2 + T3.segs) % T3.segs;
      var bx = T3.hx[idx] | 0, by = T3.hy[idx] | 0;
      if (bx < 0 || bx >= W || by < 0 || by >= H) continue;
      var f = 1 - s2 / T3.segs; // 0 tail → 1 head
      drawCharHSL(FLUX_BODY[(f * (bodyN - 1)) | 0], bx, by,
        T3.hue + (1 - f) * 14, 96, Math.min(84, 20 + f * 38 + T3.ex * 22));
    }
    var hx2 = T3.x | 0, hy2 = T3.y | 0;
    if (hx2 >= 0 && hx2 < W && hy2 >= 0 && hy2 < H) {
      drawCharHSL('@', hx2, hy2, T3.hue, T3.ex > 0.9 ? 55 : 90, Math.min(92, 62 + T3.ex * 22));
    }
  }

  // ---- render: burst rings ----
  for (b = 0; b < bursts.length; b++) {
    var B2 = bursts[b];
    var age2 = t - B2.born;
    var life = 1 - age2 / 1.5;
    if (life <= 0) continue;
    var rad2 = 2 + age2 * Math.min(W, H) * 0.3;
    var steps = Math.min(64, Math.max(14, (rad2 * 5) | 0));
    var rch = life > 0.6 ? 'O' : life > 0.3 ? 'o' : '.';
    for (var k = 0; k < steps; k++) {
      var a2 = (k / steps) * Math.PI * 2;
      var rx = (B2.x + Math.cos(a2) * rad2) | 0;
      var ry = (B2.y + Math.sin(a2) * rad2 * aspect) | 0;
      if (rx < 0 || rx >= W || ry < 0 || ry >= H) continue;
      drawCharHSL(rch, rx, ry, B2.hue, 90, 30 + life * 55);
    }
  }
}

registerMode('flux', {
  init: initFlux,
  render: renderFlux,
});
