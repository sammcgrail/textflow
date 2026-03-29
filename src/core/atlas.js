// Font Texture Atlas — pre-renders ASCII + extra Unicode glyphs to a WebGL texture
import { state } from './state.js';

var FIRST_CHAR = 32;   // space
var LAST_CHAR = 126;   // tilde
var ASCII_COUNT = LAST_CHAR - FIRST_CHAR + 1; // 95 glyphs

// Extra Unicode glyphs used by modes (dial, typewriter, vhs, rain3d, oscilloscope, hexlife)
var EXTRA_GLYPHS = [
  0x2588, // █ (typewriter cursor, dial bars)
  0x2591, // ░ (dial empty bars)
  0x2593, // ▓ (block shade)
  0x25CF, // ● (vhs record dot)
  0x00B7, // · (rain3d, oscilloscope grid)
  0x25B2, // ▲ (dial needle up)
  0x25BC, // ▼ (dial needle down)
  0x2B21, // ⬡ (hexlife white hexagon)
  0x2B22, // ⬢ (hexlife black hexagon)
];
var EXTRA_SLOT_START = 127;

// Map Unicode code → internal slot index for UV lookup
var _extraMap = {};
for (var ei = 0; ei < EXTRA_GLYPHS.length; ei++) {
  _extraMap[EXTRA_GLYPHS[ei]] = EXTRA_SLOT_START + ei;
}

var TOTAL_GLYPHS = ASCII_COUNT + EXTRA_GLYPHS.length;
var ATLAS_COLS = 16;
var ATLAS_ROWS = Math.ceil(TOTAL_GLYPHS / ATLAS_COLS);
var UV_SLOTS = EXTRA_SLOT_START + EXTRA_GLYPHS.length;

// UV lookup: uvs[slot * 4] = u0, u1, v0, v1
export var uvs = new Float32Array(UV_SLOTS * 4);
export var atlasTexture = null;
// Glyph cell size in pixels (set on build)
export var glyphW = 0;
export var glyphH = 0;

// Remap char code to atlas slot. Returns 0 for unsupported glyphs.
export function charSlot(code) {
  if (code >= FIRST_CHAR && code <= LAST_CHAR) return code;
  var slot = _extraMap[code];
  return slot !== undefined ? slot : 0;
}

export function buildAtlas(gl) {
  var fontSize = state.FONT_SIZE;
  var dpr = state.dpr || 1;
  // Render atlas at device pixel resolution for crisp text
  var renderSize = fontSize * dpr;
  var fontStr = renderSize + 'px "JetBrains Mono", monospace';

  // Measure glyph dimensions using a temp 2D canvas
  var measure = document.createElement('canvas').getContext('2d');
  measure.font = fontStr;
  measure.textBaseline = 'top';
  // Use 'M' width as cell width (monospace)
  var cw = Math.ceil(measure.measureText('M').width);
  var ch = Math.ceil(renderSize * 1.25);
  // Pad 4px to avoid UV bleeding (underline artifacts)
  var pw = cw + 8;
  var ph = ch + 8;
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
  // Opaque black background — avoids premultiplied alpha issues and
  // enables better anti-aliasing from the browser's font rasterizer.
  // max(r,g,b) naturally returns 0 for black pixels.
  actx.fillStyle = '#000';
  actx.fillRect(0, 0, tw, th);
  actx.font = fontStr;
  actx.textBaseline = 'top';
  actx.fillStyle = '#fff';

  // Build list of all glyphs: ASCII then extras
  var allGlyphs = [];
  for (var c = FIRST_CHAR; c <= LAST_CHAR; c++) allGlyphs.push({ code: c, slot: c });
  for (var xi = 0; xi < EXTRA_GLYPHS.length; xi++) {
    allGlyphs.push({ code: EXTRA_GLYPHS[xi], slot: EXTRA_SLOT_START + xi });
  }

  // Render each glyph and compute UVs
  for (var i = 0; i < allGlyphs.length; i++) {
    var g = allGlyphs[i];
    var col = i % ATLAS_COLS;
    var row = (i / ATLAS_COLS) | 0;
    var px = col * pw + 4; // +4 for padding
    var py = row * ph + 4;

    if (g.code > 32) { // don't render space
      actx.fillText(String.fromCharCode(g.code), px, py);
    }

    // UV coordinates (normalized 0-1) with half-texel inset to prevent boundary sampling
    var idx = g.slot * 4;
    var htU = 0.5 / tw;
    var htV = 0.5 / th;
    uvs[idx]     = px / tw + htU;           // u0
    uvs[idx + 1] = (px + cw) / tw - htU;    // u1
    uvs[idx + 2] = py / th + htV;           // v0
    uvs[idx + 3] = (py + ch) / th - htV;    // v1
  }

  // Upload to WebGL texture
  if (atlasTexture) gl.deleteTexture(atlasTexture);
  atlasTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, ac);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function nextPow2(v) {
  v--;
  v |= v >> 1; v |= v >> 2; v |= v >> 4; v |= v >> 8; v |= v >> 16;
  return v + 1;
}
