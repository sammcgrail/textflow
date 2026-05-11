import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Petals — homage to @soggyburritowu's pollen-allergies hand-pose mini.
// V1: mouse/touch driven (sprinkle on hold, cut on click-tap of a stem).
// MediaPipe Handpose enhancement queued as a follow-up.
//
// Layout:
//   • upper 60% = sky gradient + drifting pollen particles
//   • lower 40% = flower garden (5-7 procedural flowers w/ bloom phases)
//   • bottom row = grass zigzag baseline
// Interactions:
//   • hold mouse = sprinkle pollen at cursor (particles fall under gravity,
//     boost flower bloom on contact)
//   • single click on a flower stem/head = cut (falls, fades, regrows)
//   • passively flowers bloom over time, sneeze every ~12s scatters wind

var FLOWER_GLYPHS = ['*', '✿', '❀', '❁', '✺', '✻', '✼', '❉'];
var STEM_GLYPHS = ['│', '╎', '┃'];
var POLLEN_GLYPHS = ['·', '⋅', '°', '∙'];

var pet = {
  flowers: [],   // {x, baseY, height, bloom, hue, glyph, cut, cutT}
  particles: [], // {x, y, vx, vy, life, hue, glyph}
  sneezeT: 0,
  initialized: false,
};

function spawnFlowers(W, H) {
  pet.flowers = [];
  // Denser garden — every ~9 cols on average. Min 7 so a phone screen
  // still gets a real garden.
  var n = Math.max(7, Math.floor(W / 9));
  var stride = W / (n + 1);
  for (var i = 0; i < n; i++) {
    pet.flowers.push({
      x: Math.floor(stride * (i + 1)) + (Math.random() * 3 - 1 | 0),
      baseY: H - 2,
      height: 5 + Math.floor(Math.random() * 4),  // 5-8 chars tall
      // Start partially bloomed so the garden reads immediately.
      bloom: 0.45 + Math.random() * 0.35,
      hue: [330, 50, 280, 60, 200, 20, 130, 290, 10][i % 9],
      glyph: FLOWER_GLYPHS[Math.floor(Math.random() * FLOWER_GLYPHS.length)],
      cut: false,
      cutT: 0,
    });
  }
}

function initPetals() {
  pet.flowers = [];
  pet.particles = [];
  pet.sneezeT = 0;
  pet.initialized = false;
}

function spawnParticle(x, y, vx, vy, hue) {
  pet.particles.push({
    x: x, y: y, vx: vx, vy: vy,
    life: 1.0,
    hue: hue,
    glyph: POLLEN_GLYPHS[Math.floor(Math.random() * POLLEN_GLYPHS.length)],
  });
}

function tickParticles(dt, W, H) {
  for (var i = pet.particles.length - 1; i >= 0; i--) {
    var p = pet.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 6 * dt; // gravity
    p.vx *= 0.98;
    p.life -= dt * 0.4;

    // Hit a flower head?
    for (var f = 0; f < pet.flowers.length; f++) {
      var fl = pet.flowers[f];
      if (fl.cut) continue;
      var headX = fl.x;
      var headY = fl.baseY - fl.height;
      if (Math.abs(p.x - headX) < 1.5 && Math.abs(p.y - headY) < 2) {
        fl.bloom = Math.min(1.0, fl.bloom + 0.12);
        fl.hue = (fl.hue + 4) % 360;
        p.life = 0;
        break;
      }
    }

    if (p.life <= 0 || p.y > H - 1 || p.x < 0 || p.x > W) {
      pet.particles.splice(i, 1);
    }
  }
}

function findFlowerAt(gx, gy) {
  for (var i = 0; i < pet.flowers.length; i++) {
    var f = pet.flowers[i];
    if (f.cut) continue;
    if (Math.abs(gx - f.x) < 2 && gy >= f.baseY - f.height - 1 && gy <= f.baseY) {
      return f;
    }
  }
  return null;
}

function renderPetals() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var dt = state.dt || 0.016;
  if (dt > 0.05) dt = 0.05;

  if (!pet.initialized || pet.flowers.length === 0) {
    spawnFlowers(W, H);
    pet.initialized = true;
  }

  // Sky drift / sun + occasional cloud chars in upper area
  for (var y = 0; y < H - 8; y += 3) {
    for (var x = (y & 1); x < W; x += 6) {
      var fade = Math.sin(x * 0.13 + y * 0.4 + t * 0.3) * 0.5 + 0.5;
      if (fade < 0.6) continue;
      drawCharHSL('·', x, y, 200, 30, 18 + (fade * 10) | 0);
    }
  }

  // Sun glyph upper-left
  var sunX = 6 + Math.sin(t * 0.2) * 2 | 0;
  var sunY = 3;
  if (sunX >= 0 && sunX < W) drawCharHSL('☀', sunX, sunY, 50, 95, 70);

  // Sprinkle pollen on hold
  if (pointer.down && state.currentMode === 'petals') {
    if (Math.random() < 0.7) {
      var hue = 50 + Math.random() * 30;
      spawnParticle(
        pointer.gx + (Math.random() - 0.5) * 2,
        pointer.gy,
        (Math.random() - 0.5) * 1.5,
        Math.random() * 1.5,
        hue
      );
    }
  }

  // Tap/click → try cut a flower under cursor
  if (pointer.clicked && state.currentMode === 'petals') {
    pointer.clicked = false;
    var hit = findFlowerAt(pointer.gx, pointer.gy);
    if (hit) {
      hit.cut = true;
      hit.cutT = 0;
      // Burst falling petals on cut
      for (var p = 0; p < 8; p++) {
        spawnParticle(
          hit.x,
          hit.baseY - hit.height,
          (Math.random() - 0.5) * 3,
          -1 - Math.random() * 1.5,
          hit.hue
        );
      }
    }
  }

  // Auto-bloom slowly
  for (var f = 0; f < pet.flowers.length; f++) {
    var fl = pet.flowers[f];
    if (fl.cut) {
      fl.cutT += dt;
      // Regrow after 4s
      if (fl.cutT > 4.0) {
        fl.cut = false;
        fl.cutT = 0;
        fl.bloom = 0.1;
        fl.glyph = FLOWER_GLYPHS[Math.floor(Math.random() * FLOWER_GLYPHS.length)];
      }
      continue;
    }
    fl.bloom = Math.min(1.0, fl.bloom + dt * 0.18);
  }

  // Sneeze every ~12s — a wind gust scatters all pollen + scatters petals
  pet.sneezeT += dt;
  if (pet.sneezeT > 12) {
    pet.sneezeT = 0;
    // Nudge all particles + spawn a flurry
    for (var i = 0; i < pet.particles.length; i++) {
      pet.particles[i].vx += (Math.random() - 0.4) * 6;
      pet.particles[i].vy -= Math.random() * 2;
    }
    for (var i = 0; i < 30; i++) {
      spawnParticle(W * 0.2, H * 0.4, 4 + Math.random() * 3, -1 + Math.random() * 2, 50);
    }
  }

  tickParticles(dt, W, H);

  // Render flowers
  for (var f = 0; f < pet.flowers.length; f++) {
    var fl = pet.flowers[f];
    if (fl.cut) {
      // Cut flower visual: stem stub + a "cut" tick mark
      if (fl.x >= 0 && fl.x < W) {
        drawCharHSL('"', fl.x, fl.baseY - 1, 30, 50, 30);
        var fadeT = 1 - Math.min(1, fl.cutT / 4);
        // No flower head (it fell)
      }
      continue;
    }
    // Stem (sways gently) — plain '|' ASCII for guaranteed font glyph,
    // bright green so it's clearly visible.
    var sway = Math.sin(t * 1.2 + fl.x * 0.1) * 0.3;
    for (var s = 1; s <= fl.height; s++) {
      var sy = fl.baseY - s;
      var sx = Math.round(fl.x + sway * (s / fl.height));
      if (sx < 0 || sx >= W || sy < 0 || sy >= H) continue;
      drawCharHSL('|', sx, sy, 130, 80, 55);
    }
    // Two leaves halfway up so the plant reads as a plant, not a stick.
    var leafY = fl.baseY - Math.floor(fl.height / 2);
    if (fl.x - 1 >= 0 && fl.x - 1 < W && leafY >= 0 && leafY < H) {
      drawCharHSL('<', fl.x - 1, leafY, 130, 85, 45);
    }
    if (fl.x + 1 >= 0 && fl.x + 1 < W && leafY >= 0 && leafY < H) {
      drawCharHSL('>', fl.x + 1, leafY, 130, 85, 45);
    }
    // Head — bigger & brighter as bloom increases
    var headX = Math.round(fl.x + sway);
    var headY = fl.baseY - fl.height;
    if (headX >= 0 && headX < W && headY >= 0 && headY < H) {
      var bloomLit = (40 + fl.bloom * 35) | 0;
      drawCharHSL(fl.glyph, headX, headY, fl.hue, 90, bloomLit);
      // Petals around head when fully bloomed
      if (fl.bloom > 0.5) {
        var petalGlyphs = ['·', '°', '*', '·'];
        var pCount = Math.floor(fl.bloom * 6);
        for (var p = 0; p < pCount; p++) {
          var ang = (p / pCount) * Math.PI * 2 + t * 0.3;
          var px = Math.round(headX + Math.cos(ang) * 1.8);
          var py = Math.round(headY + Math.sin(ang) * 0.9);
          if (px < 0 || px >= W || py < 0 || py >= H) continue;
          drawCharHSL(petalGlyphs[p % petalGlyphs.length], px, py, fl.hue, 80, (50 + fl.bloom * 25) | 0);
        }
      }
    }
  }

  // Grass baseline (zigzag)
  var grassY = H - 1;
  for (var x = 0; x < W; x++) {
    var ch = (x & 1) ? 'v' : 'V';
    drawCharHSL(ch, x, grassY, 130, 65, 35);
  }

  // Pollen particles on top
  for (var i = 0; i < pet.particles.length; i++) {
    var p = pet.particles[i];
    var px = Math.round(p.x);
    var py = Math.round(p.y);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;
    var lit = (40 + p.life * 35) | 0;
    drawCharHSL(p.glyph, px, py, p.hue, 90, lit);
  }

  // Cursor indicator (subtle hand glyph)
  if (state.currentMode === 'petals') {
    var cx = Math.round(pointer.gx);
    var cy = Math.round(pointer.gy);
    if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
      var cursorGlyph = pointer.down ? '✋' : '·';
      drawCharHSL(cursorGlyph, cx, cy, 50, 80, 75);
    }
  }

  // HUD instructions
  var msg = 'hold to sprinkle pollen   tap a flower to cut   sneeze every 12s';
  for (var i = 0; i < msg.length && i < W; i++) {
    drawCharHSL(msg[i], 1 + i, 0, 30, 50, 50);
  }
}

registerMode('petals', { init: initPetals, render: renderPetals });
