// clawsfry — cycle 3 of the seb<->ulant deep-fry recursion.
//
// Input: ulant's cycle2_big.gif (her pixelification of the original
// clawsparty textflow, 96x96 16fr). We extracted the frames at 80x40, and
// this mode replays the RGB grid as colored text chars. Result: her pixel
// art rendered through the char-grid abstraction, ready to be re-pixelified
// for a final cycle.
//
// Char is randomized per frame from a small glyph bank so the rendering
// looks "fried" — varied stroke density adds JPEG-style chroma noise when
// ulant re-pixelifies it.
import { clearCanvas, drawChar } from '../core/draw.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';
import { CLAWSFRY_FRAMES, CLAWSFRY_COLS, CLAWSFRY_ROWS } from './clawsfry-frames.js';

// Decode once at first render — convert each frame's base64 to a Uint8Array.
var decodedFrames = null;
function decodeFrames() {
  decodedFrames = CLAWSFRY_FRAMES.map(function(b64) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  });
}

// Glyph bank for the fry look — mix of dense + sparse so the quantize-back
// step has stroke texture to work with.
var GLYPHS = '#%@&*oxO.+';
var FRAME_MS = 130; // match ulant's 130ms cadence

function renderClawsfry() {
  clearCanvas();
  if (decodedFrames === null) decodeFrames();
  var W = state.COLS, H = state.ROWS;
  var t = state.time;
  // frame index cycles through 16 frames at 130ms each
  var fIdx = ((t * 1000) / FRAME_MS | 0) % decodedFrames.length;
  var frame = decodedFrames[fIdx];

  // Map the fried grid onto the current canvas. If canvas is larger than
  // 80x40, we center and leave background. If smaller, we downsample.
  var fryW = CLAWSFRY_COLS, fryH = CLAWSFRY_ROWS;
  var scaleX = fryW / W, scaleY = fryH / H;

  for (var y = 0; y < H; y++) {
    for (var x = 0; x < W; x++) {
      var fx = (x * scaleX) | 0;
      var fy = (y * scaleY) | 0;
      if (fx < 0 || fx >= fryW || fy < 0 || fy >= fryH) continue;
      var i = (fy * fryW + fx) * 3;
      var r = frame[i], g = frame[i+1], b = frame[i+2];
      // skip near-black cells (background) to keep canvas dark + let starfield show
      var lum = (r * 299 + g * 587 + b * 114) / 1000;
      if (lum < 28) continue;
      // pick glyph by luminance so darker cells use lighter strokes (fry stippling)
      var gi = lum > 180 ? 0 : lum > 140 ? 1 : lum > 100 ? 2 : lum > 65 ? 3 : 5;
      // jitter glyph slightly per-frame so re-pixelification sees motion noise
      gi = (gi + ((fIdx + x * 7 + y * 13) % 3)) % GLYPHS.length;
      var ch = GLYPHS[gi];
      // slight per-frame chroma shake — red+1 shift on odd frames
      var dr = (fIdx & 1) ? Math.min(255, r + 12) : r;
      drawChar(ch, x, y, dr, g, b, 1);
    }
  }
}

function initClawsfry() {
  // ensure decode happens before first render
  if (decodedFrames === null) decodeFrames();
}

registerMode('clawsfry', {
  init: initClawsfry,
  render: renderClawsfry,
});
