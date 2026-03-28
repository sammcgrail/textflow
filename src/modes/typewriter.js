import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var twIdx, twCharIdx, twW, twH, twChars, twAccum;
var TW_QUOTES = [
  "The only way to do great work is to love what you do. - Steve Jobs",
  "In the middle of difficulty lies opportunity. - Albert Einstein",
  "To be or not to be, that is the question. - Shakespeare",
  "I think, therefore I am. - Descartes",
  "The unexamined life is not worth living. - Socrates",
  "Not all those who wander are lost. - J.R.R. Tolkien",
  "That which does not kill us makes us stronger. - Nietzsche",
  "The only thing we have to fear is fear itself. - FDR",
  "Stay hungry, stay foolish. - Steve Jobs",
  "Hello World. Every great program starts here.",
  "Any sufficiently advanced technology is indistinguishable from magic. - Arthur C. Clarke",
  "The medium is the message. - Marshall McLuhan",
  "We are what we repeatedly do. Excellence is not an act but a habit. - Aristotle",
  "Imagination is more important than knowledge. - Einstein"
];
var twHistory, twLineH, twDoneTimer;
function initTypewriter() {
  twW = state.COLS; twH = state.ROWS;
  twIdx = 0; twCharIdx = 0; twAccum = 0;
  twChars = [];
  twHistory = [];
  twLineH = 2;
  twDoneTimer = 0;
}
// initTypewriter(); — called via registerMode
function renderTypewriter() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  if (twW !== W || twH !== H) { twW = W; twH = H; }
  var maxPerLine = W - 6;
  if (maxPerLine < 10) maxPerLine = 10;
  var text = TW_QUOTES[twIdx];
  // Click = skip to next quote
  if (pointer.clicked && state.currentMode === 'typewriter') {
    pointer.clicked = false;
    // If still typing, complete it instantly
    if (twCharIdx < text.length) {
      twCharIdx = text.length;
      twChars = [];
      var col = 0, line = 0;
      for (var c = 0; c < text.length; c++) {
        if (col >= maxPerLine) { col = 0; line++; }
        twChars.push({ ch: text[c], x: 3 + col, line: line, t: state.time });
        col++;
      }
    }
    // Push to history and advance
    twHistory.push({ chars: twChars.slice(), lines: ((text.length / maxPerLine) | 0) + 1 });
    if (twHistory.length > 6) twHistory.shift();
    twIdx = (twIdx + 1) % TW_QUOTES.length;
    twCharIdx = 0; twChars = []; twAccum = 0; twDoneTimer = 0;
    text = TW_QUOTES[twIdx];
  }
  // Type 4 chars per frame — no timer gating, just accumulate
  var charsThisFrame = 4;
  for (var cp = 0; cp < charsThisFrame; cp++) {
    if (twCharIdx < text.length) {
      var col = 0, line = 0;
      for (var c = 0; c < twCharIdx; c++) {
        col++;
        if (col >= maxPerLine) { col = 0; line++; }
      }
      twChars.push({ ch: text[twCharIdx], x: 3 + col, line: line, t: state.time - cp * 0.005 });
      twCharIdx++;
    }
  }
  // Auto advance after done typing
  if (twCharIdx >= text.length) {
    twDoneTimer += 0.016;
    if (twDoneTimer > 2) {
      twHistory.push({ chars: twChars.slice(), lines: ((text.length / maxPerLine) | 0) + 1 });
      if (twHistory.length > 6) twHistory.shift();
      twIdx = (twIdx + 1) % TW_QUOTES.length;
      twCharIdx = 0; twChars = []; twAccum = 0; twDoneTimer = 0;
    }
  }
  // Calculate vertical layout
  var yOff = 2;
  var totalHistH = 0;
  for (var h = 0; h < twHistory.length; h++) totalHistH += twHistory[h].lines + twLineH;
  var curLines = ((twCharIdx / maxPerLine) | 0) + 2;
  if (totalHistH + curLines > H - 4) {
    // Scroll: remove oldest history
    while (twHistory.length > 0 && totalHistH + curLines > H - 4) {
      totalHistH -= twHistory[0].lines + twLineH;
      twHistory.shift();
    }
  }
  // Draw history (completed quotes, faded)
  var drawY = yOff;
  for (var h = 0; h < twHistory.length; h++) {
    var hChars = twHistory[h].chars;
    var fade = 0.2 + (h / Math.max(1, twHistory.length)) * 0.3;
    for (var i = 0; i < hChars.length; i++) {
      var c = hChars[i];
      var cy = drawY + c.line;
      if (cy >= 0 && cy < H) drawChar(c.ch, c.x, cy, 100, 90, 70, fade);
    }
    drawY += twHistory[h].lines + twLineH;
  }
  // Draw current typing chars
  for (var i = 0; i < twChars.length; i++) {
    var c = twChars[i];
    var cy = drawY + c.line;
    if (cy < 0 || cy >= H) continue;
    var age = state.time - c.t;
    var flash = age < 0.1 ? 1 : 0;
    var bright = flash ? 255 : (200 + Math.sin(age * 3) * 25) | 0;
    var gb = flash ? 255 : (160 + Math.sin(age * 2) * 20) | 0;
    drawChar(c.ch, c.x, cy, bright, gb, flash ? 255 : 100, 0.85 + flash * 0.15);
  }
  // Draw blinking cursor
  if (twCharIdx < text.length) {
    var curCol = 0, curLine = 0;
    for (var c = 0; c < twCharIdx; c++) { curCol++; if (curCol >= maxPerLine) { curCol = 0; curLine++; } }
    var curY = drawY + curLine;
    var blink = Math.sin(state.time * 8) > 0 ? 1 : 0;
    if (blink && curY >= 0 && curY < H) drawChar('█', 3 + curCol, curY, 255, 220, 100, 1);
  } else {
    // Done typing — show pulsing cursor at end
    var endCol = 0, endLine = 0;
    for (var c = 0; c < text.length; c++) { endCol++; if (endCol >= maxPerLine) { endCol = 0; endLine++; } }
    var endY = drawY + endLine;
    var pulse = (Math.sin(state.time * 4) * 0.3 + 0.7);
    if (endY >= 0 && endY < H) drawChar('█', 3 + endCol, endY, 255, 180, 50, pulse);
  }
}

registerMode('typewriter', {
  init: initTypewriter,
  render: renderTypewriter,
});
