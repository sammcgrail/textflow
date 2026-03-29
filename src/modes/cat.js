import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Cat mode — draggable cat with text reflow + fading "MOVE THE CAT" hint
var catImg = null;
var catLoaded = false;
var catNatW = 1, catNatH = 1;

var catGX = 0, catGY = 0;
var catGridW = 0, catGridH = 0;
var dragging = false;
var dragOffX = 0, dragOffY = 0;
var hasDragged = false; // stop showing hint after first drag

var loremText = 'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump. ' +
  'The five boxing wizards jump quickly. ' +
  'Sphinx of black quartz, judge my vow. ' +
  'Two driven jocks help fax my big quiz. ' +
  'Crazy Frederick bought many very exquisite opal jewels. ' +
  'We promptly judged antique ivory buckles for the next prize. ' +
  'A mad boxer shot a quick, gloved jab to the jaw of his dizzy opponent. ' +
  'Jived fox nymph grabs quick waltz. ' +
  'Glib jocks quiz nymph to vex dwarf. ' +
  'Jackdaws love my big sphinx of quartz. ' +
  'The jay, pig, fox, zebra, and my wolves quack. ';

var hintText = 'MOVE THE CAT';
var hintInterval = 6; // seconds between hints
var hintDuration = 3; // seconds hint is visible

function ensureCatImg() {
  if (catImg) return;
  catImg = document.createElement('img');
  catImg.src = '/textflow/static/cat.png';
  catImg.style.position = 'fixed';
  catImg.style.zIndex = '10';
  catImg.style.pointerEvents = 'none';
  catImg.style.display = 'none';
  catImg.style.borderRadius = '6px';
  catImg.style.border = '3px solid #0a0a0f';
  catImg.style.boxSizing = 'border-box';
  catImg.style.objectFit = 'cover';
  catImg.draggable = false;
  document.body.appendChild(catImg);
  catImg.onload = function() {
    catLoaded = true;
    catNatW = catImg.naturalWidth || 1;
    catNatH = catImg.naturalHeight || 1;
  };
}

function computeCatSize() {
  catGridW = state.isMobile ? 12 : 20;
  var pixW = catGridW * state.CHAR_W;
  var pixH = pixW * (catNatH / catNatW);
  catGridH = Math.round(pixH / state.CHAR_H);
  if (catGridH < 4) catGridH = 4;
}

function initCat() {
  ensureCatImg();
  computeCatSize();
  catGX = Math.floor(state.COLS / 2 - catGridW / 2);
  catGY = Math.floor(state.ROWS / 2 - catGridH / 2);
  hasDragged = false;
}

function positionCatImg() {
  if (!catImg) return;
  var px = catGX * state.CHAR_W;
  var py = state.NAV_H + catGY * state.CHAR_H;
  var pw = catGridW * state.CHAR_W;
  var ph = catGridH * state.CHAR_H;
  catImg.style.left = Math.round(px) + 'px';
  catImg.style.top = Math.round(py) + 'px';
  catImg.style.width = Math.round(pw) + 'px';
  catImg.style.height = Math.round(ph) + 'px';
}

// Compute hint fade alpha for current time
function getHintAlpha(t) {
  if (hasDragged) return 0;
  var cycle = t % (hintInterval + hintDuration);
  if (cycle < hintDuration) {
    // Fade in for 0.5s, hold, fade out for 0.5s
    if (cycle < 0.5) return cycle / 0.5;
    if (cycle > hintDuration - 0.5) return (hintDuration - cycle) / 0.5;
    return 1;
  }
  return 0;
}

// Check if a position in the text stream should show hint text
function getHintChar(streamPos, W, t) {
  // Place hint text roughly in the middle of the visible text
  // Find a position that's roughly center-ish
  var hintStartPos = Math.floor(W * Math.floor(state.ROWS * 0.3)) + Math.floor(W / 2 - hintText.length / 2);
  var offset = streamPos - hintStartPos;
  if (offset >= 0 && offset < hintText.length) {
    return hintText[offset];
  }
  return null;
}

function renderCat() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  computeCatSize();

  if (catImg) {
    catImg.style.display = (state.currentMode === 'cat' && catLoaded) ? 'block' : 'none';
  }
  positionCatImg();

  var cLeft = catGX;
  var cRight = catGX + catGridW;
  var cTop = catGY;
  var cBottom = catGY + catGridH;

  var ci = Math.floor(t * 2) % loremText.length;
  var hintAlpha = getHintAlpha(t);

  // Track stream position for hint placement
  var streamPos = 0;
  // Pre-compute hint row/col in non-cat area
  var hintRow = -1, hintColStart = -1;
  if (hintAlpha > 0) {
    // Find a good row for the hint — above or below the cat
    var candidateRow = catGY - 3;
    if (candidateRow < 2) candidateRow = catGY + catGridH + 2;
    if (candidateRow >= 0 && candidateRow < H) {
      hintRow = candidateRow;
      hintColStart = Math.floor(W / 2 - hintText.length / 2);
    }
  }

  for (var y = 0; y < H; y++) {
    var rowInCat = (y >= cTop && y < cBottom);

    for (var x = 0; x < W; x++) {
      if (rowInCat && x >= cLeft && x < cRight) {
        continue;
      }

      var ch = loremText[ci % loremText.length];
      ci++;

      // Check if this cell should show hint text instead
      var isHint = false;
      if (hintAlpha > 0 && y === hintRow && x >= hintColStart && x < hintColStart + hintText.length) {
        var hi = x - hintColStart;
        ch = hintText[hi];
        isHint = true;
      }

      if (ch === ' ') continue;

      var cdx = x - (catGX + catGridW / 2);
      var cdy = y - (catGY + catGridH / 2);
      var cdist = Math.sqrt(cdx * cdx + cdy * cdy);
      var maxD = Math.sqrt(W * W + H * H) * 0.5;
      var nd = cdist / maxD;

      var hue, bright, sat;

      if (isHint) {
        // Hint: bright white/gold, fading
        hue = 45;
        sat = 30;
        bright = 20 + hintAlpha * 50;
      } else {
        hue = (y * 3 + x * 0.5 + t * 15) % 360;
        bright = 20 + nd * 50;
        sat = 35 + nd * 45;

        if (rowInCat) {
          var el = Math.abs(x - cLeft);
          var er = Math.abs(x - (cRight - 1));
          var ed = Math.min(el, er);
          if (ed < 4) { bright += (4 - ed) * 5; hue = (hue + 25) % 360; }
        }
      }

      drawCharHSL(ch, x, y, hue, Math.min(90, sat), Math.min(70, bright));
    }
  }
}

function attachCat() {
  ensureCatImg();

  // Hide cat when switching to another mode
  function watchMode() {
    if (catImg) catImg.style.display = (state.currentMode === 'cat' && catLoaded) ? 'block' : 'none';
    requestAnimationFrame(watchMode);
  }
  requestAnimationFrame(watchMode);

  state.canvas.addEventListener('pointerdown', function(e) {
    if (state.currentMode !== 'cat') return;
    var mx = e.clientX / state.CHAR_W;
    var my = (e.clientY - state.NAV_H) / state.CHAR_H;

    if (mx >= catGX && mx < catGX + catGridW && my >= catGY && my < catGY + catGridH) {
      dragging = true;
      hasDragged = true;
      dragOffX = mx - catGX;
      dragOffY = my - catGY;
      e.preventDefault();
      if (state.canvas.setPointerCapture) state.canvas.setPointerCapture(e.pointerId);
    }
  });

  state.canvas.addEventListener('pointermove', function(e) {
    if (!dragging || state.currentMode !== 'cat') return;
    e.preventDefault();
    var mx = e.clientX / state.CHAR_W;
    var my = (e.clientY - state.NAV_H) / state.CHAR_H;
    catGX = Math.max(0, Math.min(state.COLS - catGridW, Math.round(mx - dragOffX)));
    catGY = Math.max(0, Math.min(state.ROWS - catGridH, Math.round(my - dragOffY)));
  });

  state.canvas.addEventListener('pointerup', function(e) {
    dragging = false;
    try { state.canvas.releasePointerCapture(e.pointerId); } catch(ex) {}
  });

  state.canvas.addEventListener('pointercancel', function() { dragging = false; });
}

registerMode('cat', { init: initCat, render: renderCat, attach: attachCat });
