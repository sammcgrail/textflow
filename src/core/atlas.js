// Font Texture Atlas — pre-renders all ASCII glyphs to a WebGL texture
import { state } from './state.js';

var FIRST_CHAR = 32;   // space
var LAST_CHAR = 126;   // tilde
var GLYPH_COUNT = LAST_CHAR - FIRST_CHAR + 1; // 95 glyphs
var ATLAS_COLS = 16;   // glyphs per row in atlas
var ATLAS_ROWS = Math.ceil(GLYPH_COUNT / ATLAS_COLS);

// UV lookup: uvs[charCode * 4] = u0, u1, v0, v1
export var uvs = new Float32Array(128 * 4);
export var atlasTexture = null;
// Glyph cell size in pixels (set on build)
export var glyphW = 0;
export var glyphH = 0;

export function buildAtlas(gl) {
  var fontSize = state.FONT_SIZE;
  var fontStr = fontSize + 'px "JetBrains Mono", monospace';

  // Measure glyph dimensions using a temp 2D canvas
  var measure = document.createElement('canvas').getContext('2d');
  measure.font = fontStr;
  measure.textBaseline = 'top';
  // Use 'M' width as cell width (monospace)
  var cw = Math.ceil(measure.measureText('M').width);
  var ch = Math.ceil(fontSize * 1.25);
  // Pad 1px to avoid bleeding
  var pw = cw + 2;
  var ph = ch + 2;
  glyphW = cw;
  glyphH = ch;

  // Create atlas canvas
  var aw = ATLAS_COLS * pw;
  var ah = ATLAS_ROWS * ph;
  // Round up to power of 2 for GPU friendliness
  var tw = nextPow2(aw);
  var th = nextPow2(ah);

  var ac = document.createElement('canvas');
  ac.width = tw;
  ac.height = th;
  var actx = ac.getContext('2d', { willReadFrequently: true });
  actx.clearRect(0, 0, tw, th);
  actx.font = fontStr;
  actx.textBaseline = 'top';
  actx.fillStyle = '#fff';

  // Render each glyph and compute UVs
  for (var i = 0; i < GLYPH_COUNT; i++) {
    var code = FIRST_CHAR + i;
    var col = i % ATLAS_COLS;
    var row = (i / ATLAS_COLS) | 0;
    var px = col * pw + 1; // +1 for padding
    var py = row * ph + 1;

    if (code > 32) { // don't render space
      actx.fillText(String.fromCharCode(code), px, py);
    }

    // UV coordinates (normalized 0-1)
    var idx = code * 4;
    uvs[idx]     = px / tw;           // u0
    uvs[idx + 1] = (px + cw) / tw;    // u1
    uvs[idx + 2] = py / th;           // v0
    uvs[idx + 3] = (py + ch) / th;    // v1
  }

  // Upload to WebGL texture
  if (atlasTexture) gl.deleteTexture(atlasTexture);
  atlasTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, ac);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function nextPow2(v) {
  v--;
  v |= v >> 1; v |= v >> 2; v |= v >> 4; v |= v >> 8; v |= v >> 16;
  return v + 1;
}
