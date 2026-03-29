import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Cat mode — draggable cat image with DOM-reflow-style text wrapping
var catImg = null; // DOM img element, positioned absolutely
var catLoaded = false;
var catNatW = 1, catNatH = 1;

// Cat position in grid coords (top-left corner)
var catGX = 0, catGY = 0;
var catGridW = 0, catGridH = 0;
var dragging = false;
var dragOffX = 0, dragOffY = 0;

// The flowing text
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

function ensureCatImg() {
  if (catImg) return;
  catImg = document.createElement('img');
  catImg.src = '/textflow/static/cat.png';
  catImg.style.position = 'fixed';
  catImg.style.zIndex = '10';
  catImg.style.pointerEvents = 'none';
  catImg.style.display = 'none';
  catImg.style.imageRendering = 'auto';
  catImg.style.borderRadius = '8px';
  catImg.draggable = false;
  document.body.appendChild(catImg);
  catImg.onload = function() {
    catLoaded = true;
    catNatW = catImg.naturalWidth || 1;
    catNatH = catImg.naturalHeight || 1;
  };
}

function computeCatSize() {
  // Target width in grid cells — bigger on desktop
  catGridW = state.isMobile ? 12 : 20;
  // Compute height preserving image aspect, accounting for cell aspect
  var cellAspect = state.CHAR_W / state.CHAR_H;
  catGridH = Math.round(catGridW * cellAspect * (catNatH / catNatW));
  if (catGridH < 4) catGridH = 4;
}

function initCat() {
  ensureCatImg();
  computeCatSize();
  catGX = Math.floor(state.COLS / 2 - catGridW / 2);
  catGY = Math.floor(state.ROWS / 2 - catGridH / 2);
}

function positionCatImg() {
  if (!catImg) return;
  // Convert grid position to pixel position matching the canvas
  var px = catGX * state.CHAR_W;
  var py = state.NAV_H + catGY * state.CHAR_H;
  var pw = catGridW * state.CHAR_W;
  var ph = catGridH * state.CHAR_H;
  catImg.style.left = px + 'px';
  catImg.style.top = py + 'px';
  catImg.style.width = pw + 'px';
  catImg.style.height = ph + 'px';
}

function renderCat() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;

  computeCatSize();

  // Show/hide cat image
  if (catImg) {
    catImg.style.display = (state.currentMode === 'cat' && catLoaded) ? 'block' : 'none';
  }
  positionCatImg();

  // Cat bounding box with padding for text exclusion
  var pad = 1;
  var cLeft = catGX - pad;
  var cRight = catGX + catGridW + pad;
  var cTop = catGY - pad;
  var cBottom = catGY + catGridH + pad;

  // DOM-style reflow: text stream skips cat cells without advancing index
  var ci = Math.floor(t * 2) % loremText.length;

  for (var y = 0; y < H; y++) {
    var rowInCat = (y >= cTop && y < cBottom);

    for (var x = 0; x < W; x++) {
      if (rowInCat && x >= cLeft && x < cRight) {
        continue; // skip without advancing text
      }

      var ch = loremText[ci % loremText.length];
      ci++;

      if (ch === ' ') continue;

      var cdx = x - (catGX + catGridW / 2);
      var cdy = y - (catGY + catGridH / 2);
      var cdist = Math.sqrt(cdx * cdx + cdy * cdy);
      var maxDist = Math.sqrt(W * W + H * H) * 0.5;
      var normDist = cdist / maxDist;

      var hue = (y * 3 + x * 0.5 + t * 15) % 360;
      var bright = 20 + normDist * 50;
      var sat = 35 + normDist * 45;

      // Edge glow near cat boundary
      if (rowInCat) {
        var edgeL = Math.abs(x - cLeft);
        var edgeR = Math.abs(x - (cRight - 1));
        var edgeDist = Math.min(edgeL, edgeR);
        if (edgeDist < 4) {
          bright += (4 - edgeDist) * 6;
          hue = (hue + 30) % 360;
        }
      }

      drawCharHSL(ch, x, y, hue, Math.min(90, sat), Math.min(65, bright));
    }
  }
}

function attachCat() {
  ensureCatImg();

  state.canvas.addEventListener('pointerdown', function(e) {
    if (state.currentMode !== 'cat') return;
    var mx = e.clientX / state.CHAR_W;
    var my = (e.clientY - state.NAV_H) / state.CHAR_H;

    if (mx >= catGX && mx < catGX + catGridW && my >= catGY && my < catGY + catGridH) {
      dragging = true;
      dragOffX = mx - catGX;
      dragOffY = my - catGY;
      e.preventDefault();
      if (state.canvas.setPointerCapture) {
        state.canvas.setPointerCapture(e.pointerId);
      }
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

  state.canvas.addEventListener('pointercancel', function() {
    dragging = false;
  });
}

registerMode('cat', { init: initCat, render: renderCat, attach: attachCat });
