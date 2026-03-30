// MSDF Font Atlas — loads pre-generated Multi-channel Signed Distance Field atlas
// and uploads directly to WebGL (avoiding canvas 2D premultiply corruption).
// Generated with: msdf-bmfont -f json -t msdf -s 48 -r 4 -p 4 JetBrainsMono-Regular.ttf
import { state } from './state.js';

var FIRST_CHAR = 32;   // space
var LAST_CHAR = 126;   // tilde

// Extra Unicode glyphs used by modes
var EXTRA_GLYPHS = [
  0x2588, // █
  0x2591, // ░
  0x2593, // ▓
  0x25CF, // ●
  0x00B7, // ·
  0x25B2, // ▲
  0x25BC, // ▼
  0x2B21, // ⬡
  0x2B22, // ⬢
];
var EXTRA_SLOT_START = 127;

// Map Unicode code → internal slot index
var _extraMap = {};
for (var ei = 0; ei < EXTRA_GLYPHS.length; ei++) {
  _extraMap[EXTRA_GLYPHS[ei]] = EXTRA_SLOT_START + ei;
}

var UV_SLOTS = EXTRA_SLOT_START + EXTRA_GLYPHS.length;

// UV lookup: uvs[slot * 4] = u0, u1, v0, v1
export var uvs = new Float32Array(UV_SLOTS * 4);
export var atlasTexture = null;

// Glyph cell size in device pixels (set on build/resize)
export var glyphW = 0;
export var glyphH = 0;

// MSDF metadata
export var msdfPxRange = 4;
var glyphData = {};   // unicode → BMFont char data
var msdfLoaded = false;
var msdfImage = null;
var msdfJson = null;
var atlasW = 0;
var atlasH = 0;

// Per-glyph offset within the character cell (normalized 0-1)
// Used by the vertex shader to position each glyph correctly
export var glyphOffsets = new Float32Array(UV_SLOTS * 4); // offsetX, offsetY, scaleX, scaleY per slot

// Remap char code to atlas slot. Returns 0 for unsupported glyphs.
export function charSlot(code) {
  if (code >= FIRST_CHAR && code <= LAST_CHAR) return code;
  var slot = _extraMap[code];
  return slot !== undefined ? slot : 0;
}

// Load MSDF atlas assets (PNG + JSON). Call once at startup.
export function loadMsdfAtlas() {
  return Promise.all([
    fetch('/textflow/static/jetbrains-msdf.json').then(function(r) { return r.json(); }),
    new Promise(function(resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = function() { resolve(img); };
      img.src = '/textflow/static/jetbrains-msdf.png';
    })
  ]).then(function(results) {
    msdfJson = results[0];
    msdfImage = results[1];

    var common = msdfJson.common;
    atlasW = common.scaleW;
    atlasH = common.scaleH;

    var df = msdfJson.distanceField;
    if (df) msdfPxRange = df.distanceRange || 4;

    // Build glyph lookup by unicode code point
    var chars = msdfJson.chars;
    for (var i = 0; i < chars.length; i++) {
      glyphData[chars[i].id] = chars[i];
    }

    msdfLoaded = true;
  });
}

// Build/rebuild atlas texture and UV table. Called on init and resize.
export function buildAtlas(gl) {
  if (!msdfLoaded || !msdfImage) return;

  var dpr = state.dpr || 1;

  // Glyph cell size on screen (in device pixels)
  var fontSize = state.FONT_SIZE;
  var renderSize = fontSize * dpr;
  var measure = document.createElement('canvas').getContext('2d');
  measure.font = renderSize + 'px "JetBrains Mono", monospace';
  measure.textBaseline = 'top';
  glyphW = Math.ceil(measure.measureText('M').width);
  glyphH = Math.ceil(renderSize * 1.25);

  // Atlas font metrics (from generation at size 48)
  var xadvance = 29; // monospace advance (same for all glyphs)
  var lineHeight = msdfJson.common.lineHeight; // 63

  // Compute UVs and per-glyph offsets
  for (var code = FIRST_CHAR; code <= LAST_CHAR; code++) {
    _setGlyphUVs(code, code, xadvance, lineHeight);
  }
  for (var xi = 0; xi < EXTRA_GLYPHS.length; xi++) {
    _setGlyphUVs(EXTRA_GLYPHS[xi], EXTRA_SLOT_START + xi, xadvance, lineHeight);
  }

  // Upload MSDF image directly to WebGL texture — bypasses canvas 2D premultiply
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  if (atlasTexture) gl.deleteTexture(atlasTexture);
  atlasTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, msdfImage);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_2D, null);
}

function _setGlyphUVs(unicode, slot, xadvance, lineHeight) {
  var g = glyphData[unicode];
  var idx = slot * 4;

  if (!g || g.width === 0) {
    uvs[idx] = 0; uvs[idx + 1] = 0; uvs[idx + 2] = 0; uvs[idx + 3] = 0;
    glyphOffsets[idx] = 0; glyphOffsets[idx + 1] = 0;
    glyphOffsets[idx + 2] = 1; glyphOffsets[idx + 3] = 1;
    return;
  }

  // UV coordinates map directly to the glyph bitmap in the MSDF atlas
  uvs[idx]     = g.x / atlasW;                    // u0
  uvs[idx + 1] = (g.x + g.width) / atlasW;        // u1
  uvs[idx + 2] = g.y / atlasH;                    // v0
  uvs[idx + 3] = (g.y + g.height) / atlasH;       // v1

  // Glyph offset/scale within the character cell (normalized 0-1)
  // xoffset, yoffset = position of glyph bitmap within the advance cell
  // These let the vertex shader position the glyph correctly
  glyphOffsets[idx]     = g.xoffset / xadvance;       // offsetX (0-1)
  glyphOffsets[idx + 1] = g.yoffset / lineHeight;     // offsetY (0-1)
  glyphOffsets[idx + 2] = g.width / xadvance;         // scaleX (fraction of cell)
  glyphOffsets[idx + 3] = g.height / lineHeight;      // scaleY (fraction of cell)
}
