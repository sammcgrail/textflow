import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { VA_RAMP } from '../core/ramps.js';

// marble — suminagashi paper-marbling, done with real marbling math.
// Every ink drop pushes the older ink outward (exact circle-preserving
// displacement); dragging pulls a marbling comb through the bath, feathering
// the rings into the classic combed patterns. Rendered by BACKWARD MAPPING:
// each cell inverts every operation newest→oldest until it lands inside the
// drop that owns it — so edges stay razor crisp no matter how combed.
// Tap = drop ink (contrasting palette cycles). Drag = comb. Left alone it
// keeps dropping and combing itself.

var mbOps = null;          // [{t:'d',x,y,r,pi} | {t:'l',ax,ay,dx,dy,nx,ny,z,u}]
var mbNext = 0;            // palette cursor
var mbDropTimer = 0;
var mbTineTimer = 0;
var mbLastTx = 0, mbLastTy = 0, mbWasDown = false;
var MB_MAX_OPS = 36;

// contrasting neighbours on purpose: porcelain / vermilion / indigo / gold / teal
var MB_PAL = [
  { h: 45,  s: 8,  l: 92 },
  { h: 16,  s: 88, l: 58 },
  { h: 228, s: 70, l: 64 },
  { h: 44,  s: 90, l: 62 },
  { h: 172, s: 62, l: 56 },
];

function mbAddDrop(x, y, r) {
  mbOps.push({ t: 'd', x: x * 0.55, y: y, r: r, pi: mbNext % MB_PAL.length });
  mbNext++;
  if (mbOps.length > MB_MAX_OPS) mbOps.shift();
}

function mbAddTine(ax, ay, dx, dy, z, u) {
  var len = Math.sqrt(dx * dx + dy * dy) || 1;
  dx /= len; dy /= len;
  mbOps.push({ t: 'l', ax: ax * 0.55, ay: ay, dx: dx * 0.55, dy: dy,
               nx: -dy, ny: dx * 0.55, z: z, u: u });
  if (mbOps.length > MB_MAX_OPS) mbOps.shift();
}

function initMarble() {
  mbOps = [];
  mbNext = 0;
  mbDropTimer = 1.4;
  mbTineTimer = 4.5;
  mbWasDown = false;
  // opening arrangement: a poured bath, already combed once
  var W = state.COLS, H = state.ROWS;
  mbAddDrop(W * 0.5,  H * 0.46, 7);
  mbAddDrop(W * 0.34, H * 0.58, 5);
  mbAddDrop(W * 0.64, H * 0.38, 5.5);
  mbAddDrop(W * 0.44, H * 0.3,  4);
  mbAddDrop(W * 0.58, H * 0.66, 4.5);
  mbAddDrop(W * 0.26, H * 0.36, 3.5);
  mbAddTine(W * 0.15, H * 0.72, 1, -0.3, 2.6, 0.85);
  mbAddTine(W * 0.7,  H * 0.2, -0.4, 1, 2.0, 0.83);
}

function renderMarble() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS, t = state.time;
  var i, o;

  // ── interactions ──
  if (pointer.clicked && state.currentMode === 'marble') {
    pointer.clicked = false;
    mbAddDrop(pointer.gx, pointer.gy, 3.4 + Math.random() * 2.8);
  }
  if (pointer.down && state.currentMode === 'marble') {
    if (!mbWasDown) { mbLastTx = pointer.gx; mbLastTy = pointer.gy; }
    var mdx = pointer.gx - mbLastTx, mdy = pointer.gy - mbLastTy;
    var moved = Math.sqrt(mdx * mdx * 0.3 + mdy * mdy);
    if (moved > 2.4) {                       // comb stroke along the drag
      mbAddTine(mbLastTx, mbLastTy, mdx, mdy,
                Math.min(3.4, 0.9 + moved * 0.35), 0.8);
      mbLastTx = pointer.gx; mbLastTy = pointer.gy;
    }
    mbWasDown = true;
  } else {
    mbWasDown = false;
  }

  // ── ambient life: the bath drips and combs itself ──
  mbDropTimer -= 0.016;
  if (mbDropTimer <= 0) {
    mbDropTimer = 2.1 + Math.random() * 1.6;
    var gx = W * (0.18 + 0.64 * ((mbNext * 0.61803) % 1));
    var gy = H * (0.2 + 0.55 * ((mbNext * 0.38197) % 1));
    mbAddDrop(gx, gy, 2.6 + Math.random() * 3.4);
  }
  mbTineTimer -= 0.016;
  if (mbTineTimer <= 0) {
    mbTineTimer = 6 + Math.random() * 4;
    var horiz = Math.random() < 0.6;
    mbAddTine(horiz ? 2 : W * Math.random(), horiz ? H * Math.random() : 2,
              horiz ? 1 : (Math.random() - 0.5) * 0.5,
              horiz ? (Math.random() - 0.5) * 0.5 : 1,
              1.4 + Math.random() * 1.4, 0.86);
  }

  // ── backward-mapped render ──
  var n = mbOps.length;
  for (var y = 0; y < H; y++) {
    // slow breathing so the whole sheet stays alive between ops
    var wob = Math.sin(y * 0.22 + t * 0.55) * 0.22;
    for (var x = 0; x < W; x++) {
      var px = x * 0.55 + wob;
      var py = y + Math.cos(x * 0.11 + t * 0.4) * 0.16;
      var hit = -1, tIn = 0;
      for (i = n - 1; i >= 0; i--) {
        o = mbOps[i];
        if (o.t === 'd') {
          var vx = px - o.x, vy = py - o.y;
          var L2 = vx * vx + vy * vy, r2 = o.r * o.r;
          if (L2 < r2) { hit = i; tIn = Math.sqrt(L2) / o.r; break; }
          var sc = Math.sqrt((L2 - r2) / L2);   // exact inverse of the drop push
          px = o.x + vx * sc; py = o.y + vy * sc;
        } else {
          var dn = Math.abs((px - o.ax) * o.nx + (py - o.ay) * o.ny);
          var mag = o.z * Math.pow(o.u, dn);    // exact inverse (n ⟂ d)
          px -= o.dx * mag; py -= o.dy * mag;
        }
      }
      if (hit < 0) {
        // bare bath: sparse drifting motes for texture
        if (((x * 7 + y * 13 + ((t * 2) | 0)) % 97) === 0) drawCharHSL('·', x, y, 220, 12, 26);
        continue;
      }
      o = mbOps[hit];
      var pal = MB_PAL[o.pi];
      // concentric bands inside each drop — the negative space is the pattern
      var band = (tIn * 5.2 + t * 0.12) % 1;
      if (band > 0.55) continue;               // ink ring gap → canvas shows through
      var edge = band / 0.55;                  // 0 centre-of-ring .. 1 edge
      var ri = Math.min(VA_RAMP.length - 1, 12 + ((1 - edge) * 60) | 0);
      drawCharHSL(VA_RAMP[ri], x, y, pal.h, pal.s, pal.l - edge * 22);
    }
  }
}

registerMode('marble', {
  init: initMarble,
  render: renderMarble,
});
