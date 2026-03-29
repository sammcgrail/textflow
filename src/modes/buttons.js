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

function createDOMElement(elem) {
  var el = document.createElement('div');
  el.style.position = 'fixed';
  el.style.zIndex = '10';
  el.style.pointerEvents = 'auto';
  el.style.background = '#0a0a0f';
  el.style.borderRadius = '6px';
  el.style.border = '7px solid #0a0a0f';
  el.style.boxSizing = 'border-box';
  el.style.fontFamily = '"JetBrains Mono", monospace';
  el.style.fontSize = '13px';
  el.style.color = '#ccc';
  el.style.display = 'none';
  el.style.overflow = 'hidden';
  el.style.userSelect = 'none';
  el.style.cursor = 'grab';
  el.style.padding = '0';
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
  el.style.border = '7px solid #0a0a0f';
  el.style.boxShadow = '0 0 8px #f06, inset 0 0 4px #f06';
  el.style.transition = 'box-shadow 0.15s';
  var btn = document.createElement('button');
  btn.textContent = 'LAUNCH';
  btn.style.background = 'transparent';
  btn.style.border = 'none';
  btn.style.color = '#f06';
  btn.style.fontFamily = '"JetBrains Mono", monospace';
  btn.style.fontSize = '11px';
  btn.style.fontWeight = 'bold';
  btn.style.cursor = 'pointer';
  btn.style.padding = '2px 4px';
  btn.style.letterSpacing = '1px';
  btn.style.width = '100%';
  btn.style.height = '100%';
  btn.addEventListener('click', function(e) {
    e.stopPropagation();
    el.style.boxShadow = '0 0 20px #f06, inset 0 0 10px #f06';
    setTimeout(function() { el.style.boxShadow = '0 0 8px #f06, inset 0 0 4px #f06'; }, 300);
    addRipple(elem.gx + elem.gw / 2, elem.gy + elem.gh / 2, 30);
  });
  el.appendChild(btn);
}

function buildTextInput(elem) {
  var el = createDOMElement(elem);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.border = '7px solid #0a0a0f';
  el.style.boxShadow = '0 0 4px #0af33';
  var inp = document.createElement('input');
  inp.type = 'text';
  inp.placeholder = 'type here...';
  inp.style.background = 'transparent';
  inp.style.border = 'none';
  inp.style.color = '#0af';
  inp.style.fontFamily = '"JetBrains Mono", monospace';
  inp.style.fontSize = '12px';
  inp.style.outline = 'none';
  inp.style.width = '90%';
  inp.style.padding = '2px 4px';
  inp.addEventListener('focus', function() {
    el.style.boxShadow = '0 0 12px #0af, inset 0 0 6px #0af';
    addRipple(elem.gx + elem.gw / 2, elem.gy + elem.gh / 2, 20);
  });
  inp.addEventListener('blur', function() {
    el.style.boxShadow = '0 0 4px #0af33';
  });
  inp.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
  el.appendChild(inp);
}

function buildToggle(elem) {
  var el = createDOMElement(elem);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.gap = '6px';
  el.style.border = '7px solid #0a0a0f';

  var label = document.createElement('span');
  label.textContent = toggleOn ? 'ON' : 'OFF';
  label.style.color = toggleOn ? '#0f6' : '#f60';
  label.style.fontWeight = 'bold';
  label.style.fontSize = '13px';
  label.style.letterSpacing = '1px';

  var track = document.createElement('div');
  track.style.width = '28px';
  track.style.height = '14px';
  track.style.borderRadius = '7px';
  track.style.background = toggleOn ? '#0f6' : '#333';
  track.style.position = 'relative';
  track.style.transition = 'background 0.2s';
  track.style.flexShrink = '0';

  var knob = document.createElement('div');
  knob.style.width = '10px';
  knob.style.height = '10px';
  knob.style.borderRadius = '50%';
  knob.style.background = '#fff';
  knob.style.position = 'absolute';
  knob.style.top = '2px';
  knob.style.left = toggleOn ? '16px' : '2px';
  knob.style.transition = 'left 0.2s';
  track.appendChild(knob);

  el.appendChild(label);
  el.appendChild(track);

  el.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleOn = !toggleOn;
    label.textContent = toggleOn ? 'ON' : 'OFF';
    label.style.color = toggleOn ? '#0f6' : '#f60';
    track.style.background = toggleOn ? '#0f6' : '#333';
    knob.style.left = toggleOn ? '16px' : '2px';
    el.style.border = '7px solid #0a0a0f';
    addRipple(elem.gx + elem.gw / 2, elem.gy + elem.gh / 2, 15);
  });
}

function buildSlider(elem) {
  var el = createDOMElement(elem);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.gap = '6px';
  el.style.border = '7px solid #0a0a0f';
  el.style.padding = '0 8px';

  var lbl = document.createElement('span');
  lbl.textContent = 'SPD';
  lbl.style.color = '#a0f';
  lbl.style.fontSize = '11px';
  lbl.style.flexShrink = '0';

  var range = document.createElement('input');
  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.value = '50';
  range.style.width = '70%';
  range.style.accentColor = '#a0f';
  range.style.cursor = 'pointer';
  range.addEventListener('input', function() {
    sliderVal = range.value / 100;
  });
  range.addEventListener('pointerdown', function(e) { e.stopPropagation(); });

  el.appendChild(lbl);
  el.appendChild(range);
}

function buildBadge(elem) {
  var el = createDOMElement(elem);
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.justifyContent = 'center';
  el.style.borderRadius = '6px';
  el.style.border = '7px solid #0a0a0f';
  el.style.boxShadow = '0 0 4px #ff033';
  el.style.cursor = 'pointer';

  var span = document.createElement('span');
  span.textContent = '0';
  span.style.color = '#ff0';
  span.style.fontWeight = 'bold';
  span.style.fontSize = '14px';

  el.appendChild(span);

  el.addEventListener('click', function(e) {
    e.stopPropagation();
    badgeCount++;
    span.textContent = String(badgeCount);
    el.style.boxShadow = '0 0 16px #ff0, inset 0 0 8px #ff0';
    setTimeout(function() { el.style.boxShadow = '0 0 4px #ff033'; }, 250);
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

// --- Border flicker ---
function flickerBorders(t) {
  for (var i = 0; i < elements.length; i++) {
    var el = elements[i].el;
    if (!el) continue;
    var flicker = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.7);
    el.style.opacity = String(flicker * 0.3 + 0.7);
  }
}

// --- Init ---
function initButtons() {
  var W = state.COLS, H = state.ROWS;
  var mobile = state.isMobile;

  // Define element sizes
  var bw = mobile ? 14 : 20;
  var bh = mobile ? 4 : 4;

  // Spread elements across the grid
  var cx = Math.floor(W / 2);
  var cy = Math.floor(H / 2);
  var spacingX = mobile ? 16 : 24;
  var spacingY = mobile ? 6 : 7;

  // Remove old DOM elements
  for (var i = 0; i < elements.length; i++) {
    if (elements[i].el && elements[i].el.parentNode) {
      elements[i].el.parentNode.removeChild(elements[i].el);
    }
  }

  elements = [
    makeElement('launch',  cx - spacingX,     cy - spacingY,     bw, bh, 'LAUNCH'),
    makeElement('input',   cx + 2,            cy - spacingY,     bw + 2, bh, 'INPUT'),
    makeElement('toggle',  cx - spacingX - 2, cy,                bw - 2, bh, 'TOGGLE'),
    makeElement('slider',  cx + 3,            cy,                bw + 4, bh, 'SLIDER'),
    makeElement('badge',   cx - 3,            cy + spacingY,     bw - 4, bh, 'BADGE'),
  ];

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

  // Half-cell snap
  for (var i = 0; i < elements.length; i++) {
    var e = elements[i];
    e.gx = Math.round(e.targetGX * 2) / 2;
    e.gy = Math.round(e.targetGY * 2) / 2;
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
      left: Math.ceil(ez.gx),
      right: Math.floor(ez.gx + ez.gw),
      top: Math.ceil(ez.gy),
      bottom: Math.floor(ez.gy + ez.gh),
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
