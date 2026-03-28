import { clearCanvas, drawChar } from '../core/draw.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

var termBuffer = [];
var termCursorX = 0, termCursorY = 0;
var termTyping = '';
var termTypeIdx = 0;
var termTypeTimer = 0;
var termMessages = [
  '> SYSTEM BOOT SEQUENCE INITIATED...',
  '> LOADING KERNEL MODULES........... OK',
  '> MOUNTING FILESYSTEM.............. OK',
  '> INITIALIZING NETWORK............. OK',
  '> TEXTFLOW ENGINE v3.8.0',
  '> 38 MODES LOADED. ALL INTERACTIVE.',
  '> TYPE TO CONTINUE OR CLICK ANYWHERE',
  '> _'
];
var termAutoLine = 0;
var termAutoTimer = 0;

function initTerminal() {
  termBuffer = [];
  termCursorX = 0;
  termCursorY = 0;
  termAutoLine = 0;
  termAutoTimer = 0;
  termTyping = '';
  termTypeIdx = 0;
}
// initTerminal(); — called via registerMode
function termAddChar(ch) {
  if (ch === '\n' || termCursorX >= state.COLS - 1) {
    termCursorX = 0;
    termCursorY++;
    if (termCursorY >= state.ROWS) {
      termBuffer.shift();
      termCursorY = state.ROWS - 1;
    }
    while (termBuffer.length <= termCursorY) termBuffer.push([]);
    if (ch === '\n') return;
  }
  while (termBuffer.length <= termCursorY) termBuffer.push([]);
  termBuffer[termCursorY][termCursorX] = ch;
  termCursorX++;
}

function renderTerminal() {
  clearCanvas();
  var W = state.COLS, H = state.ROWS;

  // Click adds a random system message
  if (pointer.clicked && state.currentMode === 'terminal') {
    pointer.clicked = false;
    var msgs = [
      '> ACCESS GRANTED',
      '> SCANNING PORT ' + ((Math.random() * 65535) | 0) + '...',
      '> DECRYPTING SECTOR ' + ((Math.random() * 999) | 0) + '...',
      '> BUFFER OVERFLOW DETECTED AT 0x' + ((Math.random() * 0xFFFFFF) | 0).toString(16).toUpperCase(),
      '> SIGNAL ACQUIRED: ' + ((Math.random() * 900 + 100) | 0) + ' MHz',
      '> INJECTING PAYLOAD................ OK',
      '> WARNING: UNAUTHORIZED ACCESS ATTEMPT',
      '> TRACE ROUTE: ' + ((Math.random()*255)|0) + '.' + ((Math.random()*255)|0) + '.' + ((Math.random()*255)|0) + '.' + ((Math.random()*255)|0),
    ];
    termTyping = msgs[Math.floor(Math.random() * msgs.length)];
    termTypeIdx = 0;
    termAddChar('\n');
  }

  // Auto-type boot sequence
  termAutoTimer++;
  if (termAutoLine < termMessages.length && termAutoTimer % 2 === 0) {
    if (termTyping === '') {
      termTyping = termMessages[termAutoLine];
      termTypeIdx = 0;
      termAutoLine++;
      termAddChar('\n');
    }
  }

  // Type current message character by character
  if (termTyping !== '' && termTypeIdx < termTyping.length) {
    termTypeTimer++;
    if (termTypeTimer % 2 === 0) {
      termAddChar(termTyping[termTypeIdx]);
      termTypeIdx++;
      if (termTypeIdx >= termTyping.length) termTyping = '';
    }
  }

  // Render buffer
  for (var y = 0; y < termBuffer.length && y < H; y++) {
    var row = termBuffer[y];
    if (!row) continue;
    for (var x = 0; x < row.length && x < W; x++) {
      var ch = row[x];
      if (!ch || ch === ' ') continue;
      // Green phosphor with slight flicker
      var flicker = 0.9 + Math.random() * 0.1;
      var bright = ch === '>' ? 0.5 : 0.85;
      drawChar(ch, x, y, 0, (bright * 255 * flicker) | 0, (bright * 80 * flicker) | 0, bright);
    }
  }

  // Blinking cursor
  if ((state.time * 3 | 0) % 2 === 0) {
    drawChar('_', termCursorX, termCursorY, 0, 255, 80, 0.9);
  }

  // Scanlines
  for (var y = 0; y < H; y += 2) {
    for (var x = 0; x < W; x += 4) {
      drawChar(' ', x, y, 0, 0, 0, 0);
    }
  }
}

registerMode('terminal', {
  init: initTerminal,
  render: renderTerminal,
});
