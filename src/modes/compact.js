import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// compact — a log-compaction visualizer. Verbose streams of random
// chars flow leftward across the upper half of the canvas. Periodically
// a "compactor bar" sweeps downward: everything above the bar gets
// folded into small dense tokens that land on the lower half as
// compact checkpoints. Over time the bottom fills with checkpoints
// which themselves slowly drift & fade. Click to trigger an immediate
// compaction pass at the pointer column.

var cpStreams = null;    // one per row in upper half: { chars: [], hue }
var cpTokens = null;     // checkpoints on lower half: { x, y, ch, hue, life, sat }
var cpSweeps = null;     // { x, width, vx, life }
var cpW = 0, cpH = 0;
var cpMid = 0;
var cpCompactTimer = 0;
var cpCharPool = 'abcdefghijklmnopqrstuvwxyz0123456789{}[]().,:;<>/\\|=+*-&%#$@';
var cpTokenChars = ['▓', '▒', '░', '■', '□', '◆', '◇', '●', '○', '◈', '§'];

function pickChar() {
  return cpCharPool[(Math.random() * cpCharPool.length) | 0];
}

function initCompact() {
  cpW = state.COLS;
  cpH = state.ROWS;
  cpMid = (cpH * 0.55) | 0;
  cpStreams = [];
  cpTokens = [];
  cpSweeps = [];
  cpCompactTimer = 2.5;
  // build streams for each row in the upper area
  for (var y = 0; y < cpMid; y++) {
    cpStreams.push({
      y: y,
      hue: 180 + Math.random() * 60,   // cyan-blue
      density: 0.3 + Math.random() * 0.4,
      speed: 0.3 + Math.random() * 0.4,
      phase: Math.random() * 100,
      // character buffer: each entry is { ch, x, life, hue }
      chars: [],
    });
  }
  // pre-seed streams — partial density so we don't start empty
  for (var si = 0; si < cpStreams.length; si++) {
    var s = cpStreams[si];
    for (var x = 0; x < cpW; x++) {
      if (Math.random() < s.density) {
        s.chars.push({
          ch: pickChar(),
          x: x,
          hue: s.hue + (Math.random() - 0.5) * 20,
          life: 0.8 + Math.random() * 0.2,
        });
      }
    }
  }
  // pre-seed some checkpoints so initial frame isn't blank below
  var nTok = Math.max(15, (cpW / 6) | 0);
  for (var ti = 0; ti < nTok; ti++) {
    cpTokens.push({
      x: Math.random() * cpW,
      y: cpMid + 2 + Math.random() * (cpH - cpMid - 3),
      ch: cpTokenChars[(Math.random() * cpTokenChars.length) | 0],
      hue: [30, 300, 200, 140, 45][(Math.random() * 5) | 0],
      sat: 70 + Math.random() * 25,
      life: 0.4 + Math.random() * 0.5,
      vx: -0.05 - Math.random() * 0.1,
    });
  }
  // seed one sweep in progress
  cpSweeps.push({
    x: cpW * 0.7,
    vx: -0.8,
    life: 1.6,
  });
}

function triggerCompact(x) {
  cpSweeps.push({
    x: x,
    vx: -0.7 - Math.random() * 0.4,
    life: 1.8 + Math.random() * 0.4,
  });
}

function renderCompact() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!cpStreams || cpW !== W || cpH !== H) initCompact();

  var t = state.time;
  var dt = 1 / 60;

  // Click — trigger compact wave at pointer
  if (pointer.clicked && state.currentMode === 'compact') {
    pointer.clicked = false;
    triggerCompact(pointer.gx);
  }
  // Drag spawns extra chars
  if (pointer.down && state.currentMode === 'compact') {
    if (Math.random() < 0.5) {
      var py = pointer.gy | 0;
      if (py >= 0 && py < cpMid) {
        cpStreams[py].chars.push({
          ch: pickChar(),
          x: pointer.gx + (Math.random() - 0.5) * 2,
          hue: cpStreams[py].hue,
          life: 1,
        });
      }
    }
  }

  // Periodic compactor
  cpCompactTimer -= dt;
  if (cpCompactTimer <= 0) {
    cpCompactTimer = 3.5 + Math.random() * 2.5;
    triggerCompact(W + 2);
  }

  // Update streams — drift chars leftward, spawn new on right
  for (var si2 = 0; si2 < cpStreams.length; si2++) {
    var s2 = cpStreams[si2];
    for (var ci = s2.chars.length - 1; ci >= 0; ci--) {
      var c = s2.chars[ci];
      c.x -= s2.speed;
      if (c.x < -1) { s2.chars.splice(ci, 1); continue; }
    }
    // spawn new char on right edge
    if (Math.random() < s2.density * 0.12) {
      s2.chars.push({
        ch: pickChar(),
        x: W + 0.5,
        hue: s2.hue + (Math.random() - 0.5) * 20,
        life: 1,
      });
    }
  }

  // Update sweeps — eat chars as they pass
  for (var swi = cpSweeps.length - 1; swi >= 0; swi--) {
    var sw = cpSweeps[swi];
    var prevX = sw.x;
    sw.x += sw.vx;
    sw.life -= dt;
    // eat chars in swept column range
    var xLo = Math.min(sw.x, prevX) - 0.5;
    var xHi = Math.max(sw.x, prevX) + 0.5;
    for (var si3 = 0; si3 < cpStreams.length; si3++) {
      var s3 = cpStreams[si3];
      for (var ci2 = s3.chars.length - 1; ci2 >= 0; ci2--) {
        var c2 = s3.chars[ci2];
        if (c2.x >= xLo && c2.x <= xHi) {
          // compact it: add a token at the bottom
          if (Math.random() < 0.4) {
            cpTokens.push({
              x: c2.x,
              y: cpMid + 1 + Math.random() * (H - cpMid - 3),
              ch: cpTokenChars[(Math.random() * cpTokenChars.length) | 0],
              hue: (c2.hue + 120) % 360,  // shift hue to warmer palette
              sat: 80 + Math.random() * 20,
              life: 1,
              vx: -0.04 - Math.random() * 0.1,
            });
          }
          s3.chars.splice(ci2, 1);
        }
      }
    }
    if (sw.life <= 0 || sw.x < -5) cpSweeps.splice(swi, 1);
  }

  // Update tokens — slow drift left, slowly fade
  for (var tki = cpTokens.length - 1; tki >= 0; tki--) {
    var tok = cpTokens[tki];
    tok.x += tok.vx;
    tok.life -= dt * 0.05;
    if (tok.life <= 0 || tok.x < -2) cpTokens.splice(tki, 1);
  }

  // cap tokens so it doesn't accumulate forever
  if (cpTokens.length > 300) cpTokens.splice(0, cpTokens.length - 300);

  // ---- RENDER ----

  // divider — faint dashed line between upper/lower halves
  for (var x = 0; x < W; x++) {
    var divCh = (x + (t | 0)) % 3 === 0 ? '.' : ' ';
    if (divCh === ' ') continue;
    drawCharHSL(divCh, x, cpMid, 220, 15, 20);
  }

  // streams
  for (var si4 = 0; si4 < cpStreams.length; si4++) {
    var s4 = cpStreams[si4];
    for (var ci3 = 0; ci3 < s4.chars.length; ci3++) {
      var cc = s4.chars[ci3];
      var xi = cc.x | 0;
      if (xi < 0 || xi >= W) continue;
      drawCharHSL(cc.ch, xi, s4.y, cc.hue | 0, 55, 45);
    }
  }

  // sweeps — bright vertical column with glow
  for (var swj = 0; swj < cpSweeps.length; swj++) {
    var sw2 = cpSweeps[swj];
    var xi2 = sw2.x | 0;
    var alpha = Math.min(1, sw2.life / 1.8);
    for (var y2 = 0; y2 < cpMid; y2++) {
      if (xi2 >= 0 && xi2 < W && y2 < H) {
        drawCharHSL('│', xi2, y2, 25, 95, 55 + alpha * 15);
        // glow adjacent cols
        if (xi2 + 1 < W) drawCharHSL('╎', xi2 + 1, y2, 30, 70, 35);
        if (xi2 - 1 >= 0) drawCharHSL('╎', xi2 - 1, y2, 30, 70, 35);
      }
    }
    // sparkle below the bar as chars fall into tokens
    if (xi2 >= 0 && xi2 < W && cpMid < H) {
      for (var ss = 0; ss < 2; ss++) {
        var px = xi2 + ((Math.random() - 0.5) * 4) | 0;
        var py2 = cpMid + ((Math.random() * 3) | 0);
        if (px >= 0 && px < W && py2 >= 0 && py2 < H) {
          drawCharHSL('*', px, py2, 40, 100, 70);
        }
      }
    }
  }

  // tokens
  for (var tkj = 0; tkj < cpTokens.length; tkj++) {
    var tok2 = cpTokens[tkj];
    var txi = tok2.x | 0;
    var tyi = tok2.y | 0;
    if (txi < 0 || txi >= W || tyi < 0 || tyi >= H) continue;
    var fade = Math.min(1, tok2.life * 1.5);
    drawCharHSL(tok2.ch, txi, tyi, tok2.hue | 0, tok2.sat | 0, 35 + fade * 30);
  }

  // label — bottom-right
  var label = 'compact';
  for (var i4 = 0; i4 < label.length; i4++) {
    drawCharHSL(label[i4], W - label.length - 1 + i4, H - 2, 30, 85, 60);
  }
}

registerMode('compact', { init: initCompact, render: renderCompact });
