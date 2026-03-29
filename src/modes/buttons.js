import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// Buttons mode — multiple draggable UI components with text reflow

var loremText = 'The quick brown fox jumps over the lazy dog. ' +
  'Pack my box with five dozen liquor jugs. ' +
  'How vexingly quick daft zebras jump. ' +
  'Sphinx of black quartz, judge my vow. ' +
  'Two driven jocks help fax my big quiz. ' +
  'Crazy Frederick bought many very exquisite opal jewels. ' +
  'We promptly judged antique ivory buckles for the next prize. ';

var brandWords = ['TEXTFLOW', 'BUTTONS', 'CLICK ME', 'DRAG', 'INTERACT'];
var brandInterval = 80; // chars between brand insertions

// --- UI Elements ---
var elements = [];
var dragTarget = null;
var dragOffX = 0, dragOffY = 0;

// --- Ripple events ---
var ripples = []; // { time, gx, gy, hueShift }

// --- Toggle state ---
var toggleOn = false;

// --- Badge counter ---
var badgeCount = 0;

// --- Slider value (0-1) ---
var sliderVal = 0.5;

// --- Element definitions ---
function makeElement(id, gx, gy, gw, gh, label) {
  return { id: id, gx: gx, gy: gy, targetGX: gx, targetGY: gy, gw: gw, gh: gh, label: label, el: null };
}

// Win95 3D border helpers
var WIN95_BG = '#c0c0c0';
var WIN95_LIGHT = '#ffffff';
var WIN95_MID = '#808080';
var WIN95_DARK = '#404040';
var WIN95_TEXT = '#000000';

function win95Raised(el) {
  el.style.borderTop = '2px solid ' + WIN95_LIGHT;
  el.style.borderLeft = '2px solid ' + WIN95_LIGHT;
  el.style.borderBottom = '2px solid ' + WIN95_DARK;
  el.style.borderRight = '2px solid ' + WIN95_DARK;
}

function win95Sunken(el) {
  el.style.borderTop = '2px solid ' + WIN95_DARK;
  el.style.borderLeft = '2px solid ' + WIN95_DARK;
  el.style.borderBottom = '2px solid ' + WIN95_LIGHT;
  el.style.borderRight = '2px solid ' + WIN95_LIGHT;
}

function createDOMElement(elem) {
  var el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.zIndex = '10';
  el.style.pointerEvents = 'auto';
  el.style.background = WIN95_BG;
  el.style.borderRadius = '0';
  el.style.boxSizing = 'border-box';
  el.style.fontFamily = '"MS Sans Serif", "Segoe UI", "JetBrains Mono", sans-serif';
  el.style.fontSize = '12px';
  el.style.color = WIN95_TEXT;
  el.style.display = 'none';
  el.style.overflow = 'hidden';
  el.style.userSelect = 'none';
  el.style.cursor = 'grab';
  el.style.padding = '0';
  win95Raised(el);
  el.dataset.btnId = elem.id;
  document.body.appendChild(el);
  elem.el = el;
  return el;
}

function buildLaunchButton(elem) {
  var el = createDOMElement(elem);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.padding = '6px';
  win95Raised(el);
  var btn = document.createElement('button');
  btn.textContent = 'Launch';
  btn.style.background = WIN95_BG;
  btn.style.color = WIN95_TEXT;
  btn.style.fontFamily = '"MS Sans Serif", "Segoe UI", sans-serif';
  btn.style.fontSize = '12px';
  btn.style.fontWeight = 'bold';
  btn.style.cursor = 'pointer';
  btn.style.padding = '2px 12px';
  btn.style.boxSizing = 'border-box';
  win95Raised(btn);
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    win95Sunken(btn);
    setTimeout(function() { win95Raised(btn); }, 200);
    addRipple(elem.gx + elem.gw / 2, elem.gy + elem.gh / 2, 30);
  });
  btn.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
  el.appendChild(btn);
}

function buildTextInput(elem) {
  var el = createDOMElement(elem);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.padding = '3px';
  win95Raised(el);
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'Type here...';
  inp.style.background = '#fff';
  inp.style.color = WIN95_TEXT;
  inp.style.fontFamily = '"MS Sans Serif", "Segoe UI", sans-serif';
  inp.style.fontSize = '12px';
  inp.style.outline = 'none';
  inp.style.width = '90%';
  inp.style.padding = '2px 4px';
  inp.style.borderTop = '2px solid ' + WIN95_DARK;
  inp.style.borderLeft = '2px solid ' + WIN95_DARK;
  inp.style.borderBottom = '2px solid ' + WIN95_LIGHT;
  inp.style.borderRight = '2px solid ' + WIN95_LIGHT;
  inp.style.boxSizing = 'border-box';
  inp.addEventListener('focus', function() {
    addRipple(elem.gx + elem.gw / 2, elem.gy + elem.gh / 2, 20);
  });
  inp.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
  el.appendChild(inp);
}

function buildToggle(elem) {
  var el = createDOMElement(elem);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.padding = '6px';
  win95Raised(el);

  var inner = document.createElement('div');
  inner.style.display = 'flex';
  inner.style.alignItems = 'center';
  inner.style.justifyContent = 'center';
  inner.style.gap = '8px';
  inner.style.background = WIN95_BG;
  inner.style.cursor = 'pointer';
  inner.style.padding = '2px 10px';
  inner.style.boxSizing = 'border-box';
  win95Raised(inner);

  var checkbox = document.createElement('div');
  checkbox.style.width = '13px';
  checkbox.style.height = '13px';
  checkbox.style.background = '#fff';
  checkbox.style.flexShrink = '0';
  checkbox.style.display = 'flex';
  checkbox.style.alignItems = 'center';
  checkbox.style.justifyContent = 'center';
  checkbox.style.fontSize = '11px';
  checkbox.style.fontWeight = 'bold';
  checkbox.style.color = WIN95_TEXT;
  win95Sunken(checkbox);
  checkbox.textContent = toggleOn ? '\u2713' : '';

  var label = document.createElement('span');
  label.textContent = toggleOn ? 'Enabled' : 'Disabled';
  label.style.color = WIN95_TEXT;
  label.style.fontSize = '12px';

  inner.appendChild(checkbox);
  inner.appendChild(label);
  el.appendChild(inner);

  inner.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
  inner.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleOn = !toggleOn;
    checkbox.textContent = toggleOn ? '\u2713' : '';
    label.textContent = toggleOn ? 'Enabled' : 'Disabled';
    win95Sunken(inner);
    setTimeout(function() { win95Raised(inner); }, 150);
    addRipple(elem.gx + elem.gw / 2, elem.gy + elem.gh / 2, 15);
  });
}

function buildSlider(elem) {
  var el = createDOMElement(elem);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.gap = '6px';
  el.style.padding = '0 8px';
  win95Raised(el);

  var lbl = document.createElement('span');
  lbl.textContent = 'Speed:';
  lbl.style.color = WIN95_TEXT;
  lbl.style.fontSize = '11px';
  lbl.style.flexShrink = '0';

  var trackOuter = document.createElement('div');
  trackOuter.style.flex = '1';
  trackOuter.style.height = '20px';
  trackOuter.style.display = 'flex';
  trackOuter.style.alignItems = 'center';

  var range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = '50';
  range.style.width = '100%';
  range.style.accentColor = WIN95_MID;
  range.style.cursor = 'pointer';
  range.addEventListener('input', function() {
    sliderVal = range.value / 100;
  });
  range.addEventListener('pointerdown', function(e) { e.stopPropagation(); });

  trackOuter.appendChild(range);
  el.appendChild(lbl);
  el.appendChild(trackOuter);
}

function buildBadge(elem) {
  var el = createDOMElement(elem);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.gap = '6px';
  el.style.cursor = 'pointer';
  win95Raised(el);

  var label = document.createElement('span');
  label.textContent = 'Count:';
  label.style.color = WIN95_TEXT;
  label.style.fontSize = '12px';

  var counter = document.createElement('div');
  counter.style.background = '#fff';
  counter.style.padding = '1px 8px';
  counter.style.borderTop = '2px solid ' + WIN95_DARK;
  counter.style.borderLeft = '2px solid ' + WIN95_DARK;
  counter.style.borderBottom = '2px solid ' + WIN95_LIGHT;
  counter.style.borderRight = '2px solid ' + WIN95_LIGHT;
  counter.style.fontSize = '12px';
  counter.style.fontWeight = 'bold';
  counter.style.color = WIN95_TEXT;
  counter.style.minWidth = '24px';
  counter.style.textAlign = 'center';
  counter.textContent = '0';

  el.appendChild(label);
  el.appendChild(counter);

  el.addEventListener('click', function(e) {
    e.stopPropagation();
    badgeCount++;
    counter.textContent = String(badgeCount);
    win95Sunken(el);
    setTimeout(function() { win95Raised(el); }, 150);
    addRipple(elem.gx + elem.gw / 2, elem.gy + elem.gh / 2, 12);
  });
}

function addRipple(gx, gy, hueShift) {
  ripples.push({ time: state.time, gx: gx, gy: gy, hueShift: hueShift });
  if (ripples.length > 10) ripples.shift();
}

function setupDrag(elem) {
  if (!elem.el) return;
  elem.el.addEventListener('pointerdown', function(e) {
    if (state.currentMode !== 'buttons') return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    dragTarget = elem;
    var mx = e.clientX / state.CHAR_W;
    var my = (e.clientY - state.NAV_H) / state.CHAR_H;
    dragOffX = mx - elem.gx;
    dragOffY = my - elem.gy;
    elem.el.style.cursor = 'grabbing';
    e.preventDefault();
    if (elem.el.setPointerCapture) elem.el.setPointerCapture(e.pointerId);
  });

  elem.el.addEventListener('pointermove', function(e) {
    if (dragTarget !== elem || state.currentMode !== 'buttons') return;
    e.preventDefault();
    var mx = e.clientX / state.CHAR_W;
    var my = (e.clientY - state.NAV_H) / state.CHAR_H;
    elem.targetGX = Math.max(0, Math.min(state.COLS - elem.gw, mx - dragOffX));
    elem.targetGY = Math.max(0, Math.min(state.ROWS - elem.gh, my - dragOffY));
  });

  elem.el.addEventListener('pointerup', function(e) {
    if (dragTarget === elem) {
      dragTarget = null;
      elem.el.style.cursor = 'grab';
      try { elem.el.releasePointerCapture(e.pointerId); } catch(ex) {}
    }
  });

  elem.el.addEventListener('pointercancel', function() {
    if (dragTarget === elem) {
      dragTarget = null;
      elem.el.style.cursor = 'grab';
    }
  });
}

// --- Position DOM elements ---
function positionElement(elem) {
  if (!elem.el) return;
  var px = elem.gx * state.CHAR_W;
  var py = state.NAV_H + elem.gy * state.CHAR_H;
  var pw = elem.gw * state.CHAR_W;
  var ph = elem.gh * state.CHAR_H;
  elem.el.style.left = Math.round(px) + 'px';
  elem.el.style.top = Math.round(py) + 'px';
  elem.el.style.width = Math.round(pw) + 'px';
  elem.el.style.height = Math.round(ph) + 'px';
}

// --- Subtle Win95 flicker ---
function flickerBorders(t) {
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i].el;
    if (!el) continue;
    var flicker = 0.85 + 0.15 * Math.sin(t * 2 + i * 1.7);
    el.style.opacity = String(flicker);
  }
}

// --- Init ---
function initButtons() {
  var W = state.COLS, H = state.ROWS;
  var mobile = W < 50;

  // Remove old DOM elements
  for (var i = 0; i < elements.length; i++) {
    if (elements[i].el && elements[i].el.parentNode) {
      elements[i].el.parentNode.removeChild(elements[i].el);
    }
  }

  if (mobile) {
    // Mobile: stack vertically, centered, narrower elements
    var bw = Math.min(W - 4, 18);
    var bh = 3;
    var startX = Math.floor((W - bw) / 2);
    var gap = 1; // 1 row gap between elements
    var totalH = 5 * bh + 4 * gap;
    var startY = Math.max(1, Math.floor((H - totalH) / 2));

    elements = [
      makeElement('launch',  startX, startY,                        bw, bh, 'LAUNCH'),
      makeElement('input',   startX, startY + (bh + gap),           bw, bh, 'INPUT'),
      makeElement('toggle',  startX, startY + 2 * (bh + gap),      bw, bh, 'TOGGLE'),
      makeElement('slider',  startX, startY + 3 * (bh + gap),      bw, bh, 'SLIDER'),
      makeElement('badge',   startX, startY + 4 * (bh + gap),      bw, bh, 'BADGE'),
    ];
  } else {
    // Desktop: 2-column layout
    var bw = 20;
    var bh = 4;
    var cx = Math.floor(W / 2);
    var cy = Math.floor(H / 2);
    var spacingX = 24;
    var spacingY = 7;

    elements = [
      makeElement('launch',  cx - spacingX,     cy - spacingY,     bw, bh, 'LAUNCH'),
      makeElement('input',   cx + 2,            cy - spacingY,     bw + 2, bh, 'INPUT'),
      makeElement('toggle',  cx - spacingX - 2, cy,                bw - 2, bh, 'TOGGLE'),
      makeElement('slider',  cx + 3,            cy,                bw + 4, bh, 'SLIDER'),
      makeElement('badge',   cx - 3,            cy + spacingY,     bw - 4, bh, 'BADGE'),
    ];
  }

  // Clamp positions
  for (var j = 0; j < elements.length; j++) {
    var e = elements[j];
    e.gx = Math.max(0, Math.min(W - e.gw, e.gx));
    e.gy = Math.max(0, Math.min(H - e.gh, e.gy));
    e.targetGX = e.gx;
    e.targetGY = e.gy;
  }

  // Build DOM and attach drag
  buildLaunchButton(elements[0]);
  buildTextInput(elements[1]);
  buildToggle(elements[2]);
  buildSlider(elements[3]);
  buildBadge(elements[4]);

  for (var d = 0; d < elements.length; d++) {
    setupDrag(elements[d]);
  }

  toggleOn = false;
  badgeCount = 0;
  sliderVal = 0.5;
  ripples = [];
}

// --- Render ---
function renderButtons() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  var speed = 0.3 + sliderVal * 3.0; // slider controls text scroll speed

  // Snap to integer grid — keeps DOM overlay and exclusion zone perfectly aligned
  for (var i = 0; i < elements.length; i++) {
    var e = elements[i];
    e.gx = Math.round(e.targetGX);
    e.gy = Math.round(e.targetGY);
  }

  // Show/hide elements
  var active = state.currentMode === 'buttons';
  for (var k = 0; k < elements.length; k++) {
    if (elements[k].el) {
      elements[k].el.style.display = active ? 'flex' : 'none';
    }
    positionElement(elements[k]);
  }

  if (!active) return;

  flickerBorders(t);

  // Pre-compute exclusion zones — tight fit under DOM overlays
  var zones = [];
  for (var z = 0; z < elements.length; z++) {
    var ez = elements[z];
    zones.push({
      left: ez.gx,
      right: ez.gx + ez.gw,
      top: ez.gy,
      bottom: ez.gy + ez.gh,
      cx: ez.gx + ez.gw / 2,
      cy: ez.gy + ez.gh / 2
    });
  }

  // Compute active ripples
  var activeRipples = [];
  for (var r = 0; r < ripples.length; r++) {
    var age = t - ripples[r].time;
    if (age < 1.5) activeRipples.push(ripples[r]);
  }

  // Brand text injection
  var ci = Math.floor(t * speed * 2) % loremText.length;
  var charCount = 0;
  var brandIdx = 0;
  var brandCharPos = 0;
  var inBrand = false;
  var currentBrand = '';

  // Color mode from toggle
  var warmMode = !toggleOn; // default warm, toggle flips to cool

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      // Check exclusion zones
      var excluded = false;
      for (var ez2 = 0; ez2 < zones.length; ez2++) {
        if (y >= zones[ez2].top && y < zones[ez2].bottom &&
            x >= zones[ez2].left && x < zones[ez2].right) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;

      // Get character — occasionally inject brand words
      var ch;
      if (inBrand && brandCharPos < currentBrand.length) {
        ch = currentBrand[brandCharPos];
        brandCharPos++;
        if (brandCharPos >= currentBrand.length) inBrand = false;
      } else {
        charCount++;
        if (charCount % brandInterval === 0 && !inBrand) {
          inBrand = true;
          currentBrand = ' ' + brandWords[brandIdx % brandWords.length] + ' ';
          brandIdx++;
          brandCharPos = 0;
          ch = currentBrand[brandCharPos];
          brandCharPos++;
        } else {
          ch = loremText[ci % loremText.length];
          ci++;
        }
      }

      if (ch === ' ') continue;

      // Distance to nearest element center
      var minDist = 9999;
      for (var d = 0; d < zones.length; d++) {
        var ddx = x - zones[d].cx;
        var ddy = y - zones[d].cy;
        var dist = Math.sqrt(ddx * ddx + ddy * ddy);
        if (dist < minDist) minDist = dist;
      }

      var maxD = Math.sqrt(W * W + H * H) * 0.4;
      var nd = Math.min(1, minDist / maxD);

      // Base HSL
      var hue, sat, bright;
      if (warmMode) {
        hue = (y * 2.5 + x * 0.8 + t * speed * 12) % 360;
      } else {
        hue = (180 + y * 2.5 + x * 0.8 + t * speed * 12) % 360;
      }
      sat = 40 + nd * 50;
      bright = 25 + nd * 45;

      // Brand word highlighting
      if (inBrand || (charCount > 0 && charCount % brandInterval < (currentBrand ? currentBrand.length : 0))) {
        bright = Math.min(80, bright + 20);
        sat = Math.min(95, sat + 15);
      }

      // Edge glow near elements
      for (var eg = 0; eg < zones.length; eg++) {
        var zn = zones[eg];
        if (y >= zn.top - 2 && y < zn.bottom + 2 && x >= zn.left - 3 && x < zn.right + 3) {
          var edx = 0, edy = 0;
          if (x < zn.left) edx = zn.left - x;
          else if (x >= zn.right) edx = x - zn.right + 1;
          if (y < zn.top) edy = zn.top - y;
          else if (y >= zn.bottom) edy = y - zn.bottom + 1;
          var edist = Math.max(edx, edy);
          if (edist > 0 && edist <= 3) {
            bright += (4 - edist) * 8;
            hue = (hue + 20) % 360;
          }
        }
      }

      // Ripple effects
      for (var rp = 0; rp < activeRipples.length; rp++) {
        var rip = activeRipples[rp];
        var rage = t - rip.time;
        var rdx = x - rip.gx;
        var rdy = y - rip.gy;
        var rdist = Math.sqrt(rdx * rdx + rdy * rdy);
        var rippleRadius = rage * 25;
        var rippleWidth = 4;
        var ringDist = Math.abs(rdist - rippleRadius);
        if (ringDist < rippleWidth) {
          var rippleStrength = (1 - rage / 1.5) * (1 - ringDist / rippleWidth);
          bright += rippleStrength * 40;
          hue = (hue + rip.hueShift * rippleStrength) % 360;
        }
      }

      drawCharHSL(ch, x, y, hue, Math.min(95, sat), Math.min(85, bright));
    }
  }
}

// --- Attach ---
function attachButtons() {
  // Watch mode for visibility
  function watchMode() {
    var active = state.currentMode === 'buttons';
    for (var i = 0; i < elements.length; i++) {
      if (elements[i].el) elements[i].el.style.display = active ? 'flex' : 'none';
    }
    requestAnimationFrame(watchMode);
  }
  requestAnimationFrame(watchMode);
}

registerMode('buttons', { init: initButtons, render: renderButtons, attach: attachButtons });
