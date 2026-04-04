import { RAMP_DENSE } from '../core/ramps.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var rfDrops, rfSplashes, rfPuddles, rfWind, rfUmbrella, rfBolts, rfW, rfH;
function initRainfall() {
  rfW = state.COLS; rfH = state.ROWS;
  rfDrops = []; rfSplashes = []; rfPuddles = new Float32Array(rfW);
  rfBolts = []; rfUmbrella = null; rfWind = 0;
  for (var i = 0; i < 120; i++) {
    rfDrops.push({x: Math.random() * rfW, y: Math.random() * rfH, speed: 0.5 + Math.random() * 0.5, len: 1 + (Math.random() * 3) | 0});
  }
  // Init puddles at bottom
  for (var x = 0; x < rfW; x++) rfPuddles[x] = 0.2 + Math.random() * 0.3;
}
function renderRainfall() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (!rfDrops || rfW !== W || rfH !== H) initRainfall();
  var t = state.time;
  rfWind = Math.sin(t * 0.3) * 0.3;
  if (pointer.clicked && state.currentMode === 'rainfall') {
    pointer.clicked = false;
    // Lightning bolt
    var bx = (pointer.gx) | 0, by = 0;
    var segs = [];
    var cx = bx;
    for (var y = 0; y < H; y++) {
      cx += ((Math.random() - 0.5) * 3) | 0;
      if (cx < 0) cx = 0; if (cx >= W) cx = W - 1;
      segs.push({x: cx, y: y});
      if (Math.random() < 0.15) {
        var bx2 = cx;
        for (var by2 = y; by2 < Math.min(H, y + 5); by2++) {
          bx2 += ((Math.random() - 0.5) * 2) | 0;
          if (bx2 >= 0 && bx2 < W) segs.push({x: bx2, y: by2});
        }
      }
    }
    rfBolts.push({segs: segs, life: 8});
  } else if (pointer.down && state.currentMode === 'rainfall') {
    rfUmbrella = {x: pointer.gx, y: pointer.gy, life: 30};
  }
  // Update drops
  for (var i = 0; i < rfDrops.length; i++) {
    var d = rfDrops[i];
    d.y += d.speed;
    d.x += rfWind;
    // Check umbrella
    if (rfUmbrella && rfUmbrella.life > 0) {
      var dx = d.x - rfUmbrella.x;
      var dy = d.y - rfUmbrella.y;
      if (Math.abs(dx) < 5 && dy >= 0 && dy < 2) {
        d.x += dx > 0 ? 2 : -2;
        d.y = rfUmbrella.y - 1;
      }
    }
    if (d.y >= H - 1) {
      // Splash
      var sx = (d.x) | 0;
      if (sx >= 0 && sx < W) {
        rfSplashes.push({x: sx, y: H - 1, life: 4});
        rfPuddles[sx] = Math.min(1, rfPuddles[sx] + 0.05);
      }
      d.y = -d.len;
      d.x = Math.random() * W;
    }
    if (d.x < 0) d.x += W;
    if (d.x >= W) d.x -= W;
  }
  // Update umbrella
  if (rfUmbrella) { rfUmbrella.life--; if (rfUmbrella.life <= 0) rfUmbrella = null; }
  // Decay bolts
  for (var i = rfBolts.length - 1; i >= 0; i--) {
    rfBolts[i].life--;
    if (rfBolts[i].life <= 0) rfBolts.splice(i, 1);
  }
  // Decay splashes
  for (var i = rfSplashes.length - 1; i >= 0; i--) {
    rfSplashes[i].life--;
    if (rfSplashes[i].life <= 0) rfSplashes.splice(i, 1);
  }
  // Decay puddles
  for (var x = 0; x < W; x++) rfPuddles[x] *= 0.998;
  // Draw puddles at bottom
  for (var x = 0; x < W; x++) {
    var v = rfPuddles[x];
    if (v > 0.05) {
      var ripple = Math.sin(x * 0.5 + t * 3) * 0.5 + 0.5;
      var ch = ripple > 0.5 ? '~' : '-';
      drawCharHSL(ch, x, H - 1, 210, 60, (12 + v * 30) | 0);
    }
  }
  // Draw rain
  for (var i = 0; i < rfDrops.length; i++) {
    var d = rfDrops[i];
    for (var j = 0; j < d.len; j++) {
      var py = (d.y - j) | 0;
      var px = (d.x) | 0;
      if (px >= 0 && px < W && py >= 0 && py < H) {
        var ch = j === 0 ? '|' : ':';
        drawCharHSL(ch, px, py, 210, 50, (25 + (d.len - j) * 8) | 0);
      }
    }
  }
  // Draw splashes
  for (var i = 0; i < rfSplashes.length; i++) {
    var s = rfSplashes[i];
    var spread = 4 - s.life;
    for (var dx = -spread; dx <= spread; dx++) {
      var px = s.x + dx;
      if (px >= 0 && px < W) {
        drawCharHSL('*', px, s.y, 200, 60, (20 + s.life * 8) | 0);
      }
    }
  }
  // Draw lightning
  for (var i = 0; i < rfBolts.length; i++) {
    var b = rfBolts[i];
    for (var j = 0; j < b.segs.length; j++) {
      var s = b.segs[j];
      drawCharHSL('#', s.x, s.y, 50, 30, (30 + b.life * 3) | 0);
    }
  }
  // Draw umbrella
  if (rfUmbrella) {
    var ux = (rfUmbrella.x) | 0, uy = (rfUmbrella.y) | 0;
    for (var dx = -4; dx <= 4; dx++) {
      var px = ux + dx;
      if (px >= 0 && px < W && uy >= 0 && uy < H) {
        drawCharHSL('_', px, uy, 0, 0, 40);
      }
    }
  }
}
registerMode('rainfall', { init: initRainfall, render: renderRainfall });
