import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// loom — a real 8-shaft weaving draft, live.
//
// This is not a texture that looks like cloth; it is the actual notation a
// weaver uses, computed the way a loom computes it. Four regions, laid out
// exactly as they are on paper:
//
//   threading (top left)   which shaft each warp thread is heddled on
//   tie-up    (top right)  which shafts each treadle lifts
//   treadling (right)      the order the treadles are pressed, one row per pick
//   drawdown  (main)       the cloth: warp is UP at (x,y) iff
//                          tieup[ treadling[y] ][ threading[x] ]
//
// Change any one of the three and the cloth re-weaves — that dependency IS
// weaving, and it is why the same threading gives twill, satin or herringbone
// depending only on the pegs in an 8x8 box.
//
// Tap threading to move a thread to another shaft. Tap the tie-up to peg or
// unpeg. Tap the cloth to advance to the next draft. Drag the cloth to beat
// it faster. Left alone it weaves through the classic drafts on its own.

var NH = 8;                 // shafts
var NT = 8;                 // treadles

var lmThreading = null;     // per warp end -> shaft
var lmTreadling = null;     // per pick (row) -> treadle   [0] = fell of cloth
var lmTieup = null;         // [treadle][shaft] -> 0/1
var lmSeq = null;           // treadling generator sequence
var lmSeqAt = 0;
var lmW = 0, lmH = 0;
var lmBeat = 0;             // seconds until next pick
var lmRate = 0.22;
var lmDraftAt = 0;
var lmHold = 0;             // seconds left on current draft
var lmFlash = 0;            // highlight the newest pick
var lmName = '';

// ---- classic drafts -------------------------------------------------------
// threading/treadling are repeats; tieup is 8 rows of 8 chars, row = treadle.
var LM_DRAFTS = [
  {
    name: '2/2 twill',
    thread: [0, 1, 2, 3],
    tread: [0, 1, 2, 3],
    tie: ['11000000', '01100000', '00110000', '00011000',
          '00001100', '00000110', '00000011', '10000001'],
  },
  {
    name: 'herringbone',
    thread: [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1],
    tread: [0, 1, 2, 3],
    tie: ['11000000', '01100000', '00110000', '00011000',
          '00001100', '00000110', '00000011', '10000001'],
  },
  {
    name: 'rosepath',
    thread: [0, 1, 2, 3, 2, 1, 0, 3],
    tread: [0, 1, 2, 3, 2, 1],
    tie: ['10010000', '11000000', '01100000', '00110000',
          '10010000', '11000000', '01100000', '00110000'],
  },
  {
    name: '5-end satin',
    thread: [0, 1, 2, 3, 4],
    tread: [0, 2, 4, 1, 3],
    tie: ['10000000', '01000000', '00100000', '00010000',
          '00001000', '10000000', '01000000', '00100000'],
  },
  {
    name: 'basket',
    thread: [0, 0, 1, 1],
    tread: [0, 0, 1, 1],
    tie: ['10100000', '01010000', '10100000', '01010000',
          '10100000', '01010000', '10100000', '01010000'],
  },
  {
    name: 'overshot',
    thread: [0, 1, 0, 1, 2, 3, 2, 3, 4, 5, 4, 5, 6, 7, 6, 7],
    tread: [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1],
    tie: ['11000000', '01100000', '00110000', '00011000',
          '00001100', '00000110', '00000011', '10000001'],
  },
  {
    name: 'waffle',
    thread: [0, 1, 2, 3, 4, 3, 2, 1],
    tread: [0, 1, 2, 3, 4, 3, 2, 1],
    tie: ['11110000', '11100000', '11000000', '10000000',
          '00000000', '10000000', '11000000', '11100000'],
  },
  {
    name: 'huck lace',
    thread: [0, 2, 0, 2, 1, 1, 3, 1, 3, 1],
    tread: [0, 1, 0, 1, 2, 3, 2, 3],
    tie: ['10100000', '01010000', '11000000', '00110000',
          '10100000', '01010000', '11000000', '00110000'],
  },
];

function lmLoadDraft(i) {
  var d = LM_DRAFTS[i % LM_DRAFTS.length];
  lmName = d.name;
  for (var x = 0; x < lmThreading.length; x++) {
    lmThreading[x] = d.thread[x % d.thread.length] % NH;
  }
  lmTieup = [];
  for (var t = 0; t < NT; t++) {
    var row = d.tie[t % d.tie.length];
    var r = [];
    for (var h = 0; h < NH; h++) r.push(row.charCodeAt(h) === 49 ? 1 : 0);
    lmTieup.push(r);
  }
  lmSeq = d.tread.slice();
  lmSeqAt = 0;
}

function lmNextPick() {
  var t = lmSeq[lmSeqAt % lmSeq.length] % NT;
  lmSeqAt++;
  // shift cloth up one row, new pick lands at the fell (bottom)
  for (var y = 0; y < lmTreadling.length - 1; y++) lmTreadling[y] = lmTreadling[y + 1];
  lmTreadling[lmTreadling.length - 1] = t;
  lmFlash = 1;
}

function lmLayout() {
  // drawdown occupies everything left of / below the notation strips
  var dw = state.COLS - NT - 1;
  var dh = state.ROWS - NH - 1;
  return { dw: dw, dh: dh, tx: state.COLS - NT, ty: NH + 1 };
}

function initLoom() {
  lmW = state.COLS;
  lmH = state.ROWS;
  var L = lmLayout();
  var dw = Math.max(4, L.dw), dh = Math.max(4, L.dh);
  lmThreading = new Uint8Array(dw);
  lmTreadling = new Uint8Array(dh);
  lmTieup = null;
  lmDraftAt = 0;
  lmLoadDraft(0);
  lmBeat = 0;
  lmRate = 0.22;
  lmHold = 9;
  lmFlash = 0;
  // pre-weave a full cloth so it opens woven, not empty
  for (var i = 0; i < dh; i++) lmNextPick();
  lmFlash = 0;
}

function renderLoom() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!lmThreading || lmW !== W || lmH !== H) initLoom();

  var L = lmLayout();
  var dw = L.dw, dh = L.dh, tx = L.tx, ty = L.ty;
  if (dw < 4 || dh < 4) return;

  var dt = 1 / 60;

  // ---- input ----
  if (pointer.clicked && state.currentMode === 'loom') {
    pointer.clicked = false;
    var gx = Math.floor(pointer.gx), gy = Math.floor(pointer.gy);
    if (gy < NH && gx < dw) {
      // threading strip: move this end to the tapped shaft
      lmThreading[gx] = gy;
      lmHold = 14;
    } else if (gy < NH && gx >= tx) {
      // tie-up: toggle a peg
      var t = gx - tx;
      if (t >= 0 && t < NT) { lmTieup[t][gy] = lmTieup[t][gy] ? 0 : 1; lmHold = 14; }
    } else if (gy >= ty && gx < dw) {
      // cloth: next draft
      lmDraftAt++;
      lmLoadDraft(lmDraftAt);
      lmHold = 9;
    }
  } else if (pointer.down && state.currentMode === 'loom' &&
             pointer.gy >= ty && pointer.gx < dw) {
    lmRate = 0.06;              // beat harder while held
  } else {
    lmRate += (0.22 - lmRate) * 0.05;
  }

  // ---- advance the weaving ----
  lmBeat -= dt;
  if (lmBeat <= 0) { lmNextPick(); lmBeat = lmRate; }
  lmFlash *= 0.88;

  lmHold -= dt;
  if (lmHold <= 0) { lmDraftAt++; lmLoadDraft(lmDraftAt); lmHold = 9; }

  // ---- threading strip ----
  for (var x = 0; x < dw; x++) {
    var sh = lmThreading[x];
    for (var y = 0; y < NH; y++) {
      if (y === sh) drawCharHSL('#', x, y, 225, 60, 62);
      else if ((x & 3) === 0) drawCharHSL('.', x, y, 225, 20, 14);
    }
  }

  // ---- tie-up ----
  for (var t2 = 0; t2 < NT; t2++) {
    for (var h2 = 0; h2 < NH; h2++) {
      var px = tx + t2;
      if (px >= W) continue;
      if (lmTieup[t2][h2]) drawCharHSL('#', px, h2, 42, 78, 58);
      else drawCharHSL('.', px, h2, 42, 20, 13);
    }
  }

  // separator between notation and cloth
  for (var sx = 0; sx < W; sx++) drawCharHSL('-', sx, NH, 210, 12, 16);
  for (var sy = ty; sy < H; sy++) if (tx - 1 < W) drawCharHSL('|', tx - 1, sy, 210, 12, 16);

  // ---- treadling column ----
  for (var y2 = 0; y2 < dh; y2++) {
    var sy2 = ty + y2;
    if (sy2 >= H) break;
    var tr = lmTreadling[y2];
    for (var t3 = 0; t3 < NT; t3++) {
      var px2 = tx + t3;
      if (px2 >= W) continue;
      if (t3 === tr) drawCharHSL('#', px2, sy2, 42, 78, 56);
      else if ((y2 & 3) === 0) drawCharHSL('.', px2, sy2, 42, 18, 12);
    }
  }

  // ---- drawdown: the cloth ----
  // warp up  -> vertical stroke in indigo, lit from the fell
  // warp down-> weft crosses, warm ecru
  for (var cy = 0; cy < dh; cy++) {
    var syy = ty + cy;
    if (syy >= H) break;
    var trd = lmTreadling[cy];
    var tie = lmTieup[trd];
    // cloth nearest the fell (bottom) is brightest — it just caught the light
    var depth = cy / Math.max(1, dh - 1);
    var lift = 4 * depth;
    for (var cx = 0; cx < dw; cx++) {
      var up = tie[lmThreading[cx]];
      if (up) {
        drawCharHSL('|', cx, syy, 228, 52, 40 + lift + (cx & 1) * 2);
      } else {
        drawCharHSL('-', cx, syy, 40, 46, 34 + lift + (cy & 1) * 2);
      }
    }
  }

  // newest pick flashes as the beater strikes
  if (lmFlash > 0.02) {
    var fy = ty + dh - 1;
    if (fy < H) {
      var trdF = lmTreadling[dh - 1], tieF = lmTieup[trdF];
      for (var fx = 0; fx < dw; fx++) {
        var upF = tieF[lmThreading[fx]];
        drawCharHSL(upF ? '|' : '=', fx, fy, upF ? 228 : 44,
                    70, 48 + 34 * lmFlash);
      }
    }
  }

  // draft name, bottom left over the cloth
  var label = lmName;
  var ly = H - 1;
  for (var i2 = 0; i2 < label.length && i2 + 1 < dw; i2++) {
    drawCharHSL(label[i2], 1 + i2, ly, 42, 10, 90);
  }
}

registerMode('loom', { init: initLoom, render: renderLoom });
