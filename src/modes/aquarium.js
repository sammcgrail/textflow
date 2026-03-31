import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// ============================================================
// Aquarium — ASCII fish tank simulation
// ============================================================

var fish = [];
var schoolFish = [];
var seaweed = [];
var bubbles = [];
var foodParticles = [];
var corals = [];
var pebbles = [];
var treasureChest = null;
var initialized = false;

// Event handler refs for cleanup
var _clickHandler = null;
var _touchHandler = null;

// Fish templates — [body, width]
var fishTemplatesRight = [
  { body: '><>', w: 3, size: 'small' },
  { body: '><))*>', w: 6, size: 'medium' },
  { body: '><(((*>', w: 7, size: 'large' },
  { body: '}><{{{*>', w: 8, size: 'tropical' }
];

var fishTemplatesLeft = [
  { body: '<><', w: 3, size: 'small' },
  { body: '<*((<>', w: 6, size: 'medium' },
  { body: '<*)))><', w: 7, size: 'large' },
  { body: '<*}}}><<', w: 8, size: 'tropical' }
];

// Tropical color palettes [hue, saturation]
var fishColors = [
  [20, 90],    // orange
  [50, 85],    // gold/yellow
  [0, 85],     // red
  [180, 80],   // cyan
  [280, 75],   // purple
  [320, 80],   // pink
  [140, 70],   // green
  [35, 95],    // clownfish orange
  [60, 90],    // yellow
  [200, 85]    // blue
];

function createFish(W, H) {
  var templateIdx = Math.floor(Math.random() * fishTemplatesRight.length);
  var colorIdx = Math.floor(Math.random() * fishColors.length);
  var goingRight = Math.random() > 0.5;
  var template = goingRight ? fishTemplatesRight[templateIdx] : fishTemplatesLeft[templateIdx];
  var sandLine = H - 4;

  return {
    x: goingRight ? -template.w : W + template.w,
    y: 2 + Math.floor(Math.random() * (sandLine - 4)),
    vx: (0.3 + Math.random() * 0.8) * (goingRight ? 1 : -1),
    vy: (Math.random() - 0.5) * 0.15,
    templateIdx: templateIdx,
    colorIdx: colorIdx,
    goingRight: goingRight,
    wobbleOffset: Math.random() * Math.PI * 2,
    wobbleAmp: 0.3 + Math.random() * 0.5,
    wobbleFreq: 1.5 + Math.random() * 1.5,
    targetFood: null,
    baseSpeed: 0.3 + Math.random() * 0.8,
    brightOffset: Math.random() * 20 - 10
  };
}

function createSchoolFish(W, H) {
  var sandLine = H - 4;
  var centerX = 5 + Math.random() * (W - 10);
  var centerY = 3 + Math.random() * (sandLine - 6);
  var group = [];
  var count = 8 + Math.floor(Math.random() * 8);
  var goingRight = Math.random() > 0.5;
  var colorIdx = Math.floor(Math.random() * fishColors.length);
  var groupVx = (0.4 + Math.random() * 0.6) * (goingRight ? 1 : -1);

  for (var i = 0; i < count; i++) {
    group.push({
      x: centerX + (Math.random() - 0.5) * 8,
      y: centerY + (Math.random() - 0.5) * 4,
      vx: groupVx + (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.1,
      colorIdx: colorIdx,
      wobbleOffset: Math.random() * Math.PI * 2
    });
  }
  return group;
}

function createSeaweed(x, H) {
  var sandLine = H - 4;
  var height = 3 + Math.floor(Math.random() * 6);
  return {
    x: x,
    baseY: sandLine,
    height: height,
    phaseOffset: Math.random() * Math.PI * 2,
    swaySpeed: 0.8 + Math.random() * 0.6,
    swayAmp: 0.6 + Math.random() * 0.4,
    hue: 100 + Math.floor(Math.random() * 40)
  };
}

function createBubble(x, H) {
  var sandLine = H - 4;
  return {
    x: x + (Math.random() - 0.5) * 2,
    y: sandLine - 1,
    vy: -0.3 - Math.random() * 0.5,
    wobbleOffset: Math.random() * Math.PI * 2,
    wobbleFreq: 2 + Math.random() * 2,
    wobbleAmp: 0.3 + Math.random() * 0.4,
    size: Math.random(),
    startX: x
  };
}

function createCoral(x, H) {
  var sandLine = H - 4;
  var chars = ['*', '#', '@', '%', '&'];
  var hue = Math.random() > 0.5 ? (350 + Math.random() * 30) % 360 : 20 + Math.random() * 40;
  var height = 2 + Math.floor(Math.random() * 3);
  var width = 2 + Math.floor(Math.random() * 3);
  var cells = [];

  for (var dy = 0; dy < height; dy++) {
    for (var dx = 0; dx < width; dx++) {
      if (Math.random() > 0.3) {
        cells.push({
          dx: dx,
          dy: dy,
          ch: chars[Math.floor(Math.random() * chars.length)]
        });
      }
    }
  }

  return {
    x: x,
    y: sandLine - height,
    hue: hue,
    sat: 60 + Math.random() * 30,
    cells: cells
  };
}

function createTreasureChest(x, H) {
  var sandLine = H - 4;
  return {
    x: x,
    y: sandLine - 3,
    lines: [
      '._____.',
      '|     |',
      '|_$_$_|',
      '|_____|'
    ],
    hue: 40,
    sat: 80
  };
}

function initAquarium() {
  var W = state.COLS;
  var H = state.ROWS;

  fish = [];
  schoolFish = [];
  seaweed = [];
  bubbles = [];
  foodParticles = [];
  corals = [];
  pebbles = [];

  // Create 15-20 fish
  var fishCount = 15 + Math.floor(Math.random() * 6);
  for (var i = 0; i < fishCount; i++) {
    var f = createFish(W, H);
    // Spread them across the tank initially
    f.x = 2 + Math.random() * (W - 4);
    fish.push(f);
  }

  // Create 2-3 schools of tiny fish
  var schoolCount = 2 + Math.floor(Math.random() * 2);
  for (var i = 0; i < schoolCount; i++) {
    var school = createSchoolFish(W, H);
    for (var j = 0; j < school.length; j++) {
      schoolFish.push(school[j]);
    }
  }

  // Seaweed along the bottom
  var seaweedCount = 5 + Math.floor(Math.random() * 5);
  for (var i = 0; i < seaweedCount; i++) {
    var sx = 2 + Math.floor(Math.random() * (W - 4));
    seaweed.push(createSeaweed(sx, H));
  }

  // Corals
  var coralCount = 3 + Math.floor(Math.random() * 3);
  for (var i = 0; i < coralCount; i++) {
    var cx = 3 + Math.floor(Math.random() * (W - 8));
    corals.push(createCoral(cx, H));
  }

  // Pebbles on the sandy bottom
  var sandLine = H - 4;
  var pebbleChars = ['.', ',', ':', ';', '`', "'"];
  for (var x = 0; x < W; x++) {
    for (var row = 0; row < 3; row++) {
      if (Math.random() > 0.4) {
        pebbles.push({
          x: x,
          y: sandLine + row,
          ch: pebbleChars[Math.floor(Math.random() * pebbleChars.length)],
          hue: 30 + Math.random() * 20,
          sat: 40 + Math.random() * 20,
          bright: 25 + Math.random() * 15
        });
      }
    }
  }

  // Treasure chest in bottom-right corner
  treasureChest = createTreasureChest(W - 10, H);

  initialized = true;
}

function updateFish(dt, W, H) {
  var sandLine = H - 4;
  var t = state.time;

  for (var i = 0; i < fish.length; i++) {
    var f = fish[i];

    // Check if chasing food
    var chasing = false;
    if (foodParticles.length > 0 && f.targetFood === null) {
      // Find nearest food
      var nearestDist = 999;
      var nearestIdx = -1;
      for (var j = 0; j < foodParticles.length; j++) {
        var fp = foodParticles[j];
        var fdx = fp.x - f.x;
        var fdy = fp.y - f.y;
        var dist = Math.sqrt(fdx * fdx + fdy * fdy);
        if (dist < nearestDist && dist < 25) {
          nearestDist = dist;
          nearestIdx = j;
        }
      }
      if (nearestIdx >= 0) {
        f.targetFood = nearestIdx;
      }
    }

    if (f.targetFood !== null && f.targetFood < foodParticles.length) {
      var fp = foodParticles[f.targetFood];
      if (fp) {
        var fdx = fp.x - f.x;
        var fdy = fp.y - f.y;
        var dist = Math.sqrt(fdx * fdx + fdy * fdy);
        if (dist < 1.5) {
          // Eat the food
          var eatenIdx = f.targetFood;
          foodParticles.splice(eatenIdx, 1);
          f.targetFood = null;
          // Fix indices for other fish
          for (var k = 0; k < fish.length; k++) {
            if (fish[k].targetFood !== null) {
              if (fish[k].targetFood === eatenIdx) {
                fish[k].targetFood = null;
              } else if (fish[k].targetFood > eatenIdx) {
                fish[k].targetFood--;
              }
            }
          }
        } else {
          // Swim toward food
          var speed = f.baseSpeed * 2.5;
          f.vx = (fdx / dist) * speed;
          f.vy = (fdy / dist) * speed;
          f.goingRight = f.vx > 0;
          chasing = true;
        }
      } else {
        f.targetFood = null;
      }
    }

    if (!chasing) {
      f.targetFood = null;
      // Normal swimming with wobble
      f.vy = Math.sin(t * f.wobbleFreq + f.wobbleOffset) * f.wobbleAmp * 0.1;
      f.vx = f.baseSpeed * (f.goingRight ? 1 : -1);
    }

    f.x += f.vx * dt * 60;
    f.y += f.vy * dt * 60;

    // Vertical bounds
    if (f.y < 2) { f.y = 2; f.vy = Math.abs(f.vy); }
    if (f.y > sandLine - 2) { f.y = sandLine - 2; f.vy = -Math.abs(f.vy); }

    // Turn around at edges
    var template = f.goingRight ? fishTemplatesRight[f.templateIdx] : fishTemplatesLeft[f.templateIdx];
    if (f.goingRight && f.x > W + template.w) {
      f.goingRight = false;
      f.vx = -Math.abs(f.vx);
    } else if (!f.goingRight && f.x < -template.w) {
      f.goingRight = true;
      f.vx = Math.abs(f.vx);
    }
  }
}

function updateSchoolFish(dt, W, H) {
  var sandLine = H - 4;
  var t = state.time;

  // Simple boids for school fish
  for (var i = 0; i < schoolFish.length; i++) {
    var s = schoolFish[i];

    // Cohesion, separation, alignment
    var cohX = 0, cohY = 0, sepX = 0, sepY = 0, aliVx = 0, aliVy = 0;
    var neighbors = 0;

    for (var j = 0; j < schoolFish.length; j++) {
      if (i === j) continue;
      var sdx = schoolFish[j].x - s.x;
      var sdy = schoolFish[j].y - s.y;
      var dist = Math.sqrt(sdx * sdx + sdy * sdy);

      if (dist < 10) {
        cohX += schoolFish[j].x;
        cohY += schoolFish[j].y;
        aliVx += schoolFish[j].vx;
        aliVy += schoolFish[j].vy;
        neighbors++;

        if (dist < 2) {
          sepX -= sdx;
          sepY -= sdy;
        }
      }
    }

    if (neighbors > 0) {
      cohX = cohX / neighbors;
      cohY = cohY / neighbors;
      aliVx = aliVx / neighbors;
      aliVy = aliVy / neighbors;

      s.vx += (cohX - s.x) * 0.002;
      s.vy += (cohY - s.y) * 0.002;
      s.vx += sepX * 0.05;
      s.vy += sepY * 0.05;
      s.vx += (aliVx - s.vx) * 0.05;
      s.vy += (aliVy - s.vy) * 0.05;
    }

    // Add gentle wobble
    s.vy += Math.sin(t * 2 + s.wobbleOffset) * 0.005;

    // Clamp speed
    var speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (speed > 1.2) {
      s.vx = (s.vx / speed) * 1.2;
      s.vy = (s.vy / speed) * 1.2;
    }
    if (speed < 0.2) {
      s.vx = (s.vx / Math.max(speed, 0.01)) * 0.2;
    }

    s.x += s.vx * dt * 60;
    s.y += s.vy * dt * 60;

    // Bounds with wrapping
    if (s.x < -2) { s.x = W + 1; }
    if (s.x > W + 2) { s.x = -1; }
    if (s.y < 2) { s.y = 2; s.vy = Math.abs(s.vy) * 0.5; }
    if (s.y > sandLine - 2) { s.y = sandLine - 2; s.vy = -Math.abs(s.vy) * 0.5; }
  }
}

function updateBubbles(dt, W, H) {
  var t = state.time;

  // Spawn new bubbles occasionally
  if (Math.random() < 0.02) {
    var bx = 2 + Math.random() * (W - 4);
    bubbles.push(createBubble(bx, H));
  }

  // Spawn bubbles from seaweed
  for (var i = 0; i < seaweed.length; i++) {
    if (Math.random() < 0.005) {
      bubbles.push(createBubble(seaweed[i].x, H));
    }
  }

  for (var i = bubbles.length - 1; i >= 0; i--) {
    var b = bubbles[i];
    b.y += b.vy * dt * 60;
    b.x = b.startX + Math.sin(t * b.wobbleFreq + b.wobbleOffset) * b.wobbleAmp;

    if (b.y < 0) {
      bubbles.splice(i, 1);
    }
  }

  // Keep bubble count reasonable
  if (bubbles.length > 40) {
    bubbles.splice(0, bubbles.length - 40);
  }
}

function updateFood(dt, H) {
  var sandLine = H - 4;

  for (var i = foodParticles.length - 1; i >= 0; i--) {
    var fp = foodParticles[i];
    fp.y += fp.vy * dt * 60;
    fp.x += Math.sin(state.time * 3 + fp.wobbleOffset) * 0.02;

    if (fp.y > sandLine) {
      foodParticles.splice(i, 1);
      // Fix fish target indices
      for (var k = 0; k < fish.length; k++) {
        if (fish[k].targetFood !== null) {
          if (fish[k].targetFood === i) {
            fish[k].targetFood = null;
          } else if (fish[k].targetFood > i) {
            fish[k].targetFood--;
          }
        }
      }
    }
  }
}

function dropFood(clickX, clickY) {
  var rect = state.canvas.getBoundingClientRect();
  var cellW = rect.width / state.COLS;
  var cellH = rect.height / state.ROWS;
  var col = Math.floor((clickX - rect.left) / cellW);
  var row = Math.floor((clickY - rect.top) / cellH);

  // Drop 3-5 food particles
  var count = 3 + Math.floor(Math.random() * 3);
  for (var i = 0; i < count; i++) {
    foodParticles.push({
      x: col + (Math.random() - 0.5) * 3,
      y: row,
      vy: 0.05 + Math.random() * 0.08,
      wobbleOffset: Math.random() * Math.PI * 2,
      hue: 30 + Math.random() * 30
    });
  }
}

function renderAquarium() {
  clearCanvas();
  var W = state.COLS;
  var H = state.ROWS;
  var t = state.time;
  var dt = 1 / 60;
  var sandLine = H - 4;

  if (!initialized) initAquarium();

  // Update all entities
  updateFish(dt, W, H);
  updateSchoolFish(dt, W, H);
  updateBubbles(dt, W, H);
  updateFood(dt, H);

  // === RENDER ===

  // 1. Water background with depth gradient and caustic effect
  for (var y = 0; y < sandLine; y++) {
    var depthRatio = y / sandLine;
    var baseBright = 12 - depthRatio * 7;
    var baseHue = 210 - depthRatio * 15;

    for (var x = 0; x < W; x++) {
      // Caustic ripple effect
      var caustic = Math.sin(x * 0.3 + t * 0.7) * Math.sin(y * 0.4 + t * 0.5);
      caustic += Math.sin(x * 0.5 - t * 0.3 + y * 0.2) * 0.5;
      var causticBright = baseBright + caustic * 3 * (1 - depthRatio * 0.7);

      if (causticBright > baseBright + 0.5) {
        drawCharHSL('~', x, y, baseHue, 50, Math.max(2, causticBright * 1.4));
      }
    }
  }

  // 2. Light rays from the top
  for (var ray = 0; ray < 4; ray++) {
    var rayX = W * 0.15 + ray * (W * 0.22);
    var rayAngle = 0.15 + Math.sin(t * 0.3 + ray) * 0.08;
    var rayBright = 18 + Math.sin(t * 0.5 + ray * 1.5) * 6;

    for (var depth = 0; depth < sandLine * 0.7; depth++) {
      var rx = Math.floor(rayX + depth * rayAngle);
      var ry = depth;
      if (rx >= 0 && rx < W && ry >= 0 && ry < sandLine) {
        var fadeT = depth / (sandLine * 0.7);
        var fade = 1 - fadeT * fadeT;
        var rb = rayBright * fade;
        if (rb > 2) {
          var rayChar = (depth % 3 === 0) ? '|' : (depth % 3 === 1) ? '\\' : '/';
          drawCharHSL(rayChar, rx, ry, 195, 20, rb);
        }
      }
    }
  }

  // 3. Sandy bottom
  for (var i = 0; i < pebbles.length; i++) {
    var p = pebbles[i];
    drawCharHSL(p.ch, p.x, p.y, p.hue, p.sat, p.bright);
  }

  // Fill sand base
  for (var y = sandLine; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var existing = false;
      for (var i = 0; i < pebbles.length; i++) {
        if (pebbles[i].x === x && pebbles[i].y === y) { existing = true; break; }
      }
      if (!existing) {
        var sandBright = 20 + Math.sin(x * 0.5 + y) * 3;
        drawCharHSL('.', x, y, 40, 35, sandBright);
      }
    }
  }

  // 4. Coral formations
  for (var i = 0; i < corals.length; i++) {
    var c = corals[i];
    var pulse = Math.sin(t * 0.5 + i) * 5;
    for (var j = 0; j < c.cells.length; j++) {
      var cell = c.cells[j];
      var cx = c.x + cell.dx;
      var cy = c.y + cell.dy;
      if (cx >= 0 && cx < W && cy >= 0 && cy < H) {
        drawCharHSL(cell.ch, cx, cy, c.hue, c.sat, 45 + pulse);
      }
    }
  }

  // 5. Treasure chest
  if (treasureChest) {
    var tc = treasureChest;
    var sparkle = Math.sin(t * 2) * 10;
    for (var row = 0; row < tc.lines.length; row++) {
      var line = tc.lines[row];
      for (var col = 0; col < line.length; col++) {
        var ch = line[col];
        if (ch !== ' ') {
          var px = tc.x + col;
          var py = tc.y + row;
          if (px >= 0 && px < W && py >= 0 && py < H) {
            var chHue = (ch === '$') ? 50 : tc.hue;
            var chBright = (ch === '$') ? 55 + sparkle : 30 + sparkle * 0.3;
            var chSat = (ch === '$') ? 90 : tc.sat;
            drawCharHSL(ch, px, py, chHue, chSat, chBright);
          }
        }
      }
    }
  }

  // 6. Seaweed
  for (var i = 0; i < seaweed.length; i++) {
    var sw = seaweed[i];
    for (var seg = 0; seg < sw.height; seg++) {
      var segRatio = seg / sw.height;
      var sway = Math.sin(t * sw.swaySpeed + sw.phaseOffset + seg * 0.5) * sw.swayAmp * segRatio;
      var sx = Math.round(sw.x + sway);
      var sy = sw.baseY - seg - 1;
      if (sx >= 0 && sx < W && sy >= 0 && sy < H) {
        var swChar;
        if (sway > 0.6) swChar = '/';
        else if (sway > 0.2) swChar = ')';
        else if (sway < -0.6) swChar = '\\';
        else if (sway < -0.2) swChar = '(';
        else swChar = '|';
        var swBright = 30 + segRatio * 25 + Math.sin(t + seg) * 8;
        drawCharHSL(swChar, sx, sy, sw.hue, 60, swBright);
      }
    }
    // Tip of seaweed
    var tipSway = Math.sin(t * sw.swaySpeed + sw.phaseOffset + sw.height * 0.5) * sw.swayAmp;
    var tipX = Math.round(sw.x + tipSway);
    var tipY = sw.baseY - sw.height - 1;
    if (tipX >= 0 && tipX < W && tipY >= 0 && tipY < H) {
      drawCharHSL('~', tipX, tipY, sw.hue + 20, 50, 40);
    }
  }

  // 7. Bubbles
  for (var i = 0; i < bubbles.length; i++) {
    var b = bubbles[i];
    var bx = Math.round(b.x);
    var by = Math.round(b.y);
    if (bx >= 0 && bx < W && by >= 0 && by < H) {
      var bch;
      if (b.size < 0.33) bch = '.';
      else if (b.size < 0.66) bch = 'o';
      else bch = 'O';
      var bBright = 45 + Math.sin(t * 3 + b.wobbleOffset) * 12;
      drawCharHSL(bch, bx, by, 200, 30, bBright);
    }
  }

  // 8. Food particles
  for (var i = 0; i < foodParticles.length; i++) {
    var fp = foodParticles[i];
    var fpx = Math.round(fp.x);
    var fpy = Math.round(fp.y);
    if (fpx >= 0 && fpx < W && fpy >= 0 && fpy < H) {
      drawCharHSL('.', fpx, fpy, fp.hue, 70, 55 + Math.sin(t * 4 + i) * 10);
    }
  }

  // 9. School fish (tiny boids)
  for (var i = 0; i < schoolFish.length; i++) {
    var s = schoolFish[i];
    var sx = Math.round(s.x);
    var sy = Math.round(s.y);
    if (sx >= 0 && sx < W && sy >= 0 && sy < sandLine) {
      var sChar = s.vx >= 0 ? '>' : '<';
      var sColor = fishColors[s.colorIdx];
      var sBright = 50 + Math.sin(t * 2 + s.wobbleOffset) * 12;
      drawCharHSL(sChar, sx, sy, sColor[0], sColor[1] - 20, sBright);
    }
  }

  // 10. Fish
  for (var i = 0; i < fish.length; i++) {
    var f = fish[i];
    var template = f.goingRight ? fishTemplatesRight[f.templateIdx] : fishTemplatesLeft[f.templateIdx];
    var color = fishColors[f.colorIdx];
    var wobbleY = Math.sin(t * f.wobbleFreq + f.wobbleOffset) * f.wobbleAmp;
    var fy = Math.round(f.y + wobbleY);
    var fx = Math.round(f.x);

    for (var c = 0; c < template.body.length; c++) {
      var ch = template.body[c];
      var drawX = fx + c;
      if (drawX >= 0 && drawX < W && fy >= 0 && fy < sandLine) {
        var charHue = color[0];
        var charSat = color[1];
        var charBright = 55 + f.brightOffset;

        // Eye and fin highlights
        if (ch === '*') {
          ch = '\u00B0'; // degree sign for eye
          charHue = 0;
          charSat = 0;
          charBright = 80;
        } else if (ch === '{' || ch === '}') {
          charBright += 10;
          charSat -= 10;
        } else if (ch === '(' || ch === ')') {
          charBright -= 5;
        }

        // Shimmer effect — stronger
        var shimmer = Math.sin(t * 3 + f.wobbleOffset + c * 0.5) * 10 + Math.sin(t * 5 + c) * 3;
        charBright += shimmer;

        drawCharHSL(ch, drawX, fy, charHue, charSat, Math.max(15, Math.min(90, charBright)));
      }
    }
  }

  // 11. Glass edges — subtle frame
  for (var x = 0; x < W; x++) {
    drawCharHSL('-', x, 0, 200, 15, 18);
    drawCharHSL('-', x, H - 1, 200, 15, 12);
  }
  for (var y = 0; y < H; y++) {
    drawCharHSL('|', 0, y, 200, 15, 16);
    drawCharHSL('|', W - 1, y, 200, 15, 16);
  }
  drawCharHSL('+', 0, 0, 200, 15, 20);
  drawCharHSL('+', W - 1, 0, 200, 15, 20);
  drawCharHSL('+', 0, H - 1, 200, 15, 20);
  drawCharHSL('+', W - 1, H - 1, 200, 15, 20);

  // 12. Title
  var title = ' AQUARIUM ';
  var titleX = Math.floor(W / 2 - title.length / 2);
  for (var i = 0; i < title.length; i++) {
    var tBright = 40 + Math.sin(t * 0.8 + i * 0.3) * 12;
    drawCharHSL(title[i], titleX + i, 0, 195, 40, tBright);
  }
}

function cleanupAquarium() {
  if (_clickHandler && state.canvas) {
    state.canvas.removeEventListener('click', _clickHandler);
    _clickHandler = null;
  }
  if (_touchHandler && state.canvas) {
    state.canvas.removeEventListener('touchstart', _touchHandler);
    _touchHandler = null;
  }
  initialized = false;
}

function attachAquarium() {
  cleanupAquarium();

  _clickHandler = function(e) {
    if (state.currentMode !== 'aquarium') return;
    e.preventDefault();
    dropFood(e.clientX, e.clientY);
  };
  state.canvas.addEventListener('click', _clickHandler);

  _touchHandler = function(e) {
    if (state.currentMode !== 'aquarium') return;
    if (e.touches.length > 0) {
      dropFood(e.touches[0].clientX, e.touches[0].clientY);
    }
  };
  state.canvas.addEventListener('touchstart', _touchHandler, { passive: true });
}

registerMode('aquarium', { init: initAquarium, render: renderAquarium, attach: attachAquarium, cleanup: cleanupAquarium });
