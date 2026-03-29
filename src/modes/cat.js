import { clearCanvas, drawChar, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Cat mode — draggable + resizable cat with text reflow
var catImg = null;
var catLoaded = false;
var catNatW = 1, catNatH = 1;
var catAspect = 1; // natH / natW

var catGX = 0, catGY = 0;
var catTargetGX = 0, catTargetGY = 0;
var catGridW = 0, catGridH = 0;
var catBaseW = 0; // user-controlled width (resizable)
var dragging = false;
var resizing = false;
var dragOffX = 0, dragOffY = 0;
var resizeStartDist = 0, resizeStartW = 0;
var hasDragged = false;

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
var hintInterval = 6;
var hintDuration = 3;

function ensureCatImg() {
  if (catImg) return;
  catImg = document.createElement('img');
  catImg.src = '/textflow/static/cat.png';
  catImg.style.position = 'fixed';
  catImg.style.zIndex = '10';
  catImg.style.pointerEvents = 'none';
  catImg.style.display = 'none';
  catImg.style.borderRadius = '6px';
  catImg.style.border = '8px solid #0a0a0f';
  catImg.style.boxSizing = 'border-box';
  catImg.style.objectFit = 'cover';
  catImg.draggable = false;
  document.body.appendChild(catImg);
  catImg.onload = function() {
    catLoaded = true;
    catNatW = catImg.naturalWidth || 1;
    catNatH = catImg.naturalHeight || 1;
    catAspect = catNatH / catNatW;
  };
}

function computeCatSize() {
  catGridW = catBaseW;
  // Pixel-based aspect ratio calculation
  var pixW = catGridW * state.CHAR_W;
  var pixH = pixW * catAspect;
  catGridH = Math.floor(pixH / state.CHAR_H);
  if (catGridH < 3) catGridH = 3;
}

function initCat() {
  ensureCatImg();
  catBaseW = state.isMobile ? 12 : 20;
  computeCatSize();
  catGX = Math.floor(state.COLS / 2 - catGridW / 2);
  catGY = Math.floor(state.ROWS / 2 - catGridH / 2);
  catTargetGX = catGX;
  catTargetGY = catGY;
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

function getHintAlpha(t) {
  if (hasDragged) return 0;
  var cycle = t % (hintInterval + hintDuration);
  if (cycle < hintDuration) {
    if (cycle < 0.5) return cycle / 0.5;
    if (cycle > hintDuration - 0.5) return (hintDuration - cycle) / 0.5;
    return 1;
  }
  return 0;
}

function renderCat() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  computeCatSize();

  // Snap to integer grid — keeps DOM overlay and exclusion zone perfectly aligned
  catGX = Math.round(catTargetGX);
  catGY = Math.round(catTargetGY);

  if (catImg) {
    catImg.style.display = (state.currentMode === 'cat' && catLoaded) ? 'block' : 'none';
  }
  positionCatImg();

  // Exclusion zone — integer-aligned, matches DOM overlay exactly
  var cLeft = catGX;
  var cRight = catGX + catGridW;
  var cTop = catGY;
  var cBottom = catGY + catGridH;

  var ci = Math.floor(t * 2) % loremText.length;
  var hintAlpha = getHintAlpha(t);

  var hintRow = -1, hintColStart = -1;
  if (hintAlpha > 0) {
    var candidateRow = catGY - 3;
    if (candidateRow < 2) candidateRow = catGY + catGridH + 2;
    if (candidateRow >= 0 && candidateRow < H) {
      hintRow = Math.round(candidateRow);
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

      var isHint = false;
      if (hintAlpha > 0 && y === hintRow && x >= hintColStart && x < hintColStart + hintText.length) {
        ch = hintText[x - hintColStart];
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
        hue = 45;
        sat = 30;
        bright = 20 + hintAlpha * 50;
      } else {
        hue = (y * 3 + x * 0.5 + t * 15) % 360;
        bright = 30 + nd * 55;
        sat = 45 + nd * 45;

        if (rowInCat) {
          var el = Math.abs(x - cLeft);
          var er = Math.abs(x - (cRight - 1));
          var ed = Math.min(el, er);
          if (ed < 4) { bright += (4 - ed) * 6; hue = (hue + 25) % 360; }
        }
      }

      drawCharHSL(ch, x, y, hue, Math.min(95, sat), Math.min(80, bright));
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

  // --- DRAG (single pointer) ---
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
    catTargetGX = Math.max(0, Math.min(state.COLS - catGridW, mx - dragOffX));
    catTargetGY = Math.max(0, Math.min(state.ROWS - catGridH, my - dragOffY));
  });

  state.canvas.addEventListener('pointerup', function(e) {
    dragging = false;
    try { state.canvas.releasePointerCapture(e.pointerId); } catch(ex) {}
  });

  state.canvas.addEventListener('pointercancel', function() { dragging = false; });

  // --- RESIZE: two-finger pinch (mobile) ---
  var lastPinchDist = 0;
  var pinchActive = false;

  state.canvas.addEventListener('touchstart', function(e) {
    if (state.currentMode !== 'cat') return;
    if (e.touches.length === 2) {
      e.preventDefault();
      dragging = false; // cancel drag when pinching
      pinchActive = true;
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.sqrt(dx * dx + dy * dy);
      resizeStartW = catBaseW;
    }
  }, { passive: false });

  state.canvas.addEventListener('touchmove', function(e) {
    if (state.currentMode !== 'cat' || !pinchActive || e.touches.length < 2) return;
    e.preventDefault();
    var dx = e.touches[0].clientX - e.touches[1].clientX;
    var dy = e.touches[0].clientY - e.touches[1].clientY;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var scale = dist / lastPinchDist;
    var newW = Math.round(resizeStartW * scale);
    newW = Math.max(4, Math.min(state.COLS - 2, newW));
    catBaseW = newW;
    hasDragged = true;
  }, { passive: false });

  state.canvas.addEventListener('touchend', function(e) {
    if (e.touches.length < 2) {
      pinchActive = false;
    }
  });

  // --- RESIZE: scroll wheel (desktop) ---
  state.canvas.addEventListener('wheel', function(e) {
    if (state.currentMode !== 'cat') return;
    // Only resize when pointer is over the cat
    var mx = e.clientX / state.CHAR_W;
    var my = (e.clientY - state.NAV_H) / state.CHAR_H;
    if (mx >= catGX && mx < catGX + catGridW && my >= catGY && my < catGY + catGridH) {
      e.preventDefault();
      e.stopPropagation();
      var delta = e.deltaY > 0 ? -1 : 1;
      var newW = catBaseW + delta;
      newW = Math.max(4, Math.min(state.COLS - 2, newW));
      // Re-center: keep cat center stable
      var oldCenterX = catTargetGX + catGridW / 2;
      var oldCenterY = catTargetGY + catGridH / 2;
      catBaseW = newW;
      computeCatSize();
      catTargetGX = Math.max(0, Math.min(state.COLS - catGridW, oldCenterX - catGridW / 2));
      catTargetGY = Math.max(0, Math.min(state.ROWS - catGridH, oldCenterY - catGridH / 2));
      hasDragged = true;
    }
  }, { passive: false });
}

registerMode('cat', { init: initCat, render: renderCat, attach: attachCat });
