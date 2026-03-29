// WebGL 2 Renderer — instanced quad rendering + Kawase bloom
import { state } from './state.js';
import { atlasTexture, uvs, buildAtlas, charSlot, glyphW, glyphH } from './atlas.js';
import { glows } from './glow.js';

// ============================================================
// CONSTANTS
// ============================================================
var MAX_INSTANCES = 32768;
// Per instance: x, y, u0, u1, v0, v1, r, g, b, a = 10 floats
var FLOATS_PER_INSTANCE = 10;
var BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4; // 40 bytes
var BLOOM_PASSES = 4;
var BLOOM_SCALE = 0.15;

// ============================================================
// MODULE STATE
// ============================================================
var gl = null;

// Programs
var charProg = null;
var kawaseProg = null;
var blendProg = null;

// Char program uniforms
var cu_atlas, cu_screenSize, cu_charSize, cu_navH, cu_gamma;

// Kawase program uniforms
var ku_src, ku_texelSize, ku_iteration;

// Blend program uniforms
var bu_scene, bu_bloom, bu_tint, bu_intensity;

// VAOs / Buffers
var charVAO = null;
var instanceVBO = null;
var bloomVAO = null;

// Instance data
var instanceData = new Float32Array(MAX_INSTANCES * FLOATS_PER_INSTANCE);
var instanceCount = 0;

// FBOs
var sceneFBO = null;
var bloomFBOs = []; // 2 for ping-pong
var lastW = 0, lastH = 0;

// ============================================================
// SHADERS
// ============================================================

var CHAR_VS = '#version 300 es\n\
precision highp float;\n\
layout(location=0) in vec2 a_quad;\n\
layout(location=1) in vec2 a_pos;\n\
layout(location=2) in vec4 a_uv;\n\
layout(location=3) in vec4 a_color;\n\
uniform vec2 u_screenSize;\n\
uniform vec2 u_charSize;\n\
uniform float u_navH;\n\
out vec2 v_uv;\n\
out vec4 v_color;\n\
void main(){\n\
  float px = a_pos.x * u_charSize.x + a_quad.x * u_charSize.x;\n\
  float py = u_navH + a_pos.y * u_charSize.y + a_quad.y * u_charSize.y;\n\
  px = floor(px + 0.5);\n\
  py = floor(py + 0.5);\n\
  float cx = (px / u_screenSize.x) * 2.0 - 1.0;\n\
  float cy = 1.0 - (py / u_screenSize.y) * 2.0;\n\
  gl_Position = vec4(cx, cy, 0.0, 1.0);\n\
  v_uv = vec2(mix(a_uv.x, a_uv.y, a_quad.x), mix(a_uv.z, a_uv.w, a_quad.y));\n\
  v_color = a_color;\n\
}';

var CHAR_FS = '#version 300 es\n\
precision highp float;\n\
uniform sampler2D u_atlas;\n\
uniform float u_gamma;\n\
in vec2 v_uv;\n\
in vec4 v_color;\n\
out vec4 fragColor;\n\
void main(){\n\
  vec4 t = texture(u_atlas, v_uv);\n\
  float raw = max(t.r, max(t.g, t.b));\n\
  if(raw < 0.05) discard;\n\
  float mask = pow(raw, u_gamma);\n\
  fragColor = vec4(v_color.rgb, v_color.a * mask);\n\
}';

var FULLSCREEN_VS = '#version 300 es\n\
precision highp float;\n\
layout(location=0) in vec2 a_pos;\n\
out vec2 v_uv;\n\
void main(){\n\
  v_uv = a_pos * 0.5 + 0.5;\n\
  gl_Position = vec4(a_pos, 0.0, 1.0);\n\
}';

var KAWASE_FS = '#version 300 es\n\
precision highp float;\n\
uniform sampler2D u_src;\n\
uniform vec2 u_texelSize;\n\
uniform float u_iteration;\n\
in vec2 v_uv;\n\
out vec4 fragColor;\n\
void main(){\n\
  float off = u_iteration + 0.5;\n\
  vec4 s = vec4(0.0);\n\
  s += texture(u_src, v_uv + vec2(-off, -off) * u_texelSize);\n\
  s += texture(u_src, v_uv + vec2( off, -off) * u_texelSize);\n\
  s += texture(u_src, v_uv + vec2(-off,  off) * u_texelSize);\n\
  s += texture(u_src, v_uv + vec2( off,  off) * u_texelSize);\n\
  fragColor = s * 0.25;\n\
}';

var BLEND_FS = '#version 300 es\n\
precision highp float;\n\
uniform sampler2D u_scene;\n\
uniform sampler2D u_bloom;\n\
uniform vec3 u_tint;\n\
uniform float u_intensity;\n\
in vec2 v_uv;\n\
out vec4 fragColor;\n\
void main(){\n\
  vec4 sc = texture(u_scene, v_uv);\n\
  vec4 bl = texture(u_bloom, v_uv);\n\
  fragColor = vec4(sc.rgb + bl.rgb * u_tint * u_intensity, 1.0);\n\
}';

// ============================================================
// INITIALIZATION
// ============================================================

export function initWebGL() {
  gl = state.canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    desynchronized: true
  });
  if (!gl) return false;

  state.gl = gl;
  state.useWebGL = true;

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Compile programs
  charProg = compile(CHAR_VS, CHAR_FS);
  kawaseProg = compile(FULLSCREEN_VS, KAWASE_FS);
  blendProg = compile(FULLSCREEN_VS, BLEND_FS);
  if (!charProg || !kawaseProg || !blendProg) return false;

  // Char uniforms
  cu_atlas = gl.getUniformLocation(charProg, 'u_atlas');
  cu_screenSize = gl.getUniformLocation(charProg, 'u_screenSize');
  cu_charSize = gl.getUniformLocation(charProg, 'u_charSize');
  cu_navH = gl.getUniformLocation(charProg, 'u_navH');
  cu_gamma = gl.getUniformLocation(charProg, 'u_gamma');

  // Kawase uniforms
  ku_src = gl.getUniformLocation(kawaseProg, 'u_src');
  ku_texelSize = gl.getUniformLocation(kawaseProg, 'u_texelSize');
  ku_iteration = gl.getUniformLocation(kawaseProg, 'u_iteration');

  // Blend uniforms
  bu_scene = gl.getUniformLocation(blendProg, 'u_scene');
  bu_bloom = gl.getUniformLocation(blendProg, 'u_bloom');
  bu_tint = gl.getUniformLocation(blendProg, 'u_tint');
  bu_intensity = gl.getUniformLocation(blendProg, 'u_intensity');

  // Setup VAOs
  createCharVAO();
  createBloomVAO();

  // Atlas and FBOs are created in resizeWebGL(), called after resize()
  // sets FONT_SIZE, CHAR_W, CHAR_H, and canvas dimensions.

  return true;
}

// ============================================================
// VAO SETUP
// ============================================================

function createCharVAO() {
  charVAO = gl.createVertexArray();
  gl.bindVertexArray(charVAO);

  // Unit quad (triangle strip): BL, BR, TL, TR → 0,0  1,0  0,1  1,1
  var qb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0,0, 1,0, 0,1, 1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  // Instance buffer
  instanceVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
  gl.bufferData(gl.ARRAY_BUFFER, instanceData.byteLength, gl.DYNAMIC_DRAW);

  // a_pos: x, y — offset 0
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, BYTES_PER_INSTANCE, 0);
  gl.vertexAttribDivisor(1, 1);

  // a_uv: u0, u1, v0, v1 — offset 8
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, BYTES_PER_INSTANCE, 8);
  gl.vertexAttribDivisor(2, 1);

  // a_color: r, g, b, a — offset 24
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, BYTES_PER_INSTANCE, 24);
  gl.vertexAttribDivisor(3, 1);

  gl.bindVertexArray(null);
}

function createBloomVAO() {
  bloomVAO = gl.createVertexArray();
  gl.bindVertexArray(bloomVAO);

  var fb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, fb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
}

// ============================================================
// FBO MANAGEMENT
// ============================================================

function makeFBO(w, h, linear) {
  var tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  var filt = linear ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  var fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return { fbo: fbo, tex: tex, w: w, h: h };
}

function destroyFBO(f) {
  if (!f) return;
  gl.deleteFramebuffer(f.fbo);
  gl.deleteTexture(f.tex);
}

function rebuildFBOs() {
  var cw = state.canvas.width;
  var ch = state.canvas.height;
  if (cw === lastW && ch === lastH) return;
  lastW = cw; lastH = ch;

  // Destroy old
  destroyFBO(sceneFBO);
  for (var i = 0; i < bloomFBOs.length; i++) destroyFBO(bloomFBOs[i]);

  // Scene FBO (full res, NEAREST — pixel-perfect sampling)
  sceneFBO = makeFBO(cw, ch, false);

  // Bloom ping-pong (quarter res, LINEAR — intentionally blurred)
  var bw = Math.max(1, (cw * BLOOM_SCALE) | 0);
  var bh = Math.max(1, (ch * BLOOM_SCALE) | 0);
  bloomFBOs = [makeFBO(bw, bh, true), makeFBO(bw, bh, true)];
}

// ============================================================
// RESIZE
// ============================================================

export function resizeWebGL() {
  if (!gl) return;
  buildAtlas(gl);
  rebuildFBOs();
}

// ============================================================
// PER-FRAME API
// ============================================================

export function beginFrame() {
  instanceCount = 0;
  if (!sceneFBO) return; // not yet initialized (before first resize)
  // Render to scene FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fbo);
  gl.viewport(0, 0, sceneFBO.w, sceneFBO.h);
  gl.clearColor(0.039, 0.039, 0.059, 1.0); // #0a0a0f
  gl.clear(gl.COLOR_BUFFER_BIT);
}

export function addChar(code, x, y, r, g, b, a) {
  // Remap char code to atlas slot (handles ASCII + extended Unicode)
  var slot = charSlot(code);
  if (slot <= 32) return;
  if (instanceCount >= MAX_INSTANCES) {
    // Auto-flush: submit current batch and start a new one
    midFrameFlush();
  }
  var i = instanceCount * FLOATS_PER_INSTANCE;
  var c4 = slot * 4;
  instanceData[i]     = x;
  instanceData[i + 1] = y;
  instanceData[i + 2] = uvs[c4];
  instanceData[i + 3] = uvs[c4 + 1];
  instanceData[i + 4] = uvs[c4 + 2];
  instanceData[i + 5] = uvs[c4 + 3];
  instanceData[i + 6] = r;
  instanceData[i + 7] = g;
  instanceData[i + 8] = b;
  instanceData[i + 9] = a;
  instanceCount++;
}

function midFrameFlush() {
  if (!instanceCount || !sceneFBO) return;
  // Draw current batch without finishing bloom — stay on scene FBO
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData, 0, instanceCount * FLOATS_PER_INSTANCE);

  gl.useProgram(charProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.uniform1i(cu_atlas, 0);

  var cw = state.canvas.width;
  var ch = state.canvas.height;
  gl.uniform2f(cu_screenSize, cw, ch);
  gl.uniform2f(cu_charSize, glyphW, glyphH);
  gl.uniform1f(cu_navH, state.NAV_H * state.dpr);
  // Gamma correction: higher gamma = thinner text. DPR 1 needs more thinning.
  var gamma = state.dpr <= 1 ? 1.6 : (state.dpr < 2 ? 1.4 : 1.2);
  gl.uniform1f(cu_gamma, gamma);

  gl.bindVertexArray(charVAO);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);
  instanceCount = 0;
}

export function flushFrame() {
  if (!sceneFBO) return; // not yet initialized
  if (!instanceCount) {
    finishBloom();
    return;
  }

  // Upload instance data
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceVBO);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData, 0, instanceCount * FLOATS_PER_INSTANCE);

  // Draw characters to scene FBO
  gl.useProgram(charProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, atlasTexture);
  gl.uniform1i(cu_atlas, 0);

  var cw = state.canvas.width;
  var ch = state.canvas.height;
  gl.uniform2f(cu_screenSize, cw, ch);
  gl.uniform2f(cu_charSize, glyphW, glyphH);
  gl.uniform1f(cu_navH, state.NAV_H * state.dpr);
  var gamma = state.dpr <= 1 ? 1.6 : (state.dpr < 2 ? 1.4 : 1.2);
  gl.uniform1f(cu_gamma, gamma);

  gl.bindVertexArray(charVAO);
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, instanceCount);

  finishBloom();
}

// ============================================================
// BLOOM POST-PROCESS
// ============================================================

function finishBloom() {
  var g = glows[state.currentMode];
  if (!g) {
    // No glow config — just blit scene to screen
    blitToScreen();
    return;
  }

  var bw = bloomFBOs[0].w;
  var bh = bloomFBOs[0].h;

  // Downsample scene into first bloom FBO
  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBOs[0].fbo);
  gl.viewport(0, 0, bw, bh);
  gl.useProgram(kawaseProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
  gl.uniform1i(ku_src, 0);
  gl.uniform2f(ku_texelSize, 1.0 / bw, 1.0 / bh);
  gl.uniform1f(ku_iteration, 0.0);
  gl.bindVertexArray(bloomVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

  // Kawase blur passes (ping-pong)
  var blurAmount = Math.min(BLOOM_PASSES, Math.max(2, (g.blur / 4) | 0));
  for (var p = 1; p < blurAmount; p++) {
    var src = bloomFBOs[(p - 1) & 1];
    var dst = bloomFBOs[p & 1];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, bw, bh);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1f(ku_iteration, p * 1.0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // Final blend: scene + bloom → screen
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, state.canvas.width, state.canvas.height);
  gl.useProgram(blendProg);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
  gl.uniform1i(bu_scene, 0);

  gl.activeTexture(gl.TEXTURE1);
  var lastBloom = bloomFBOs[(blurAmount - 1) & 1];
  gl.bindTexture(gl.TEXTURE_2D, lastBloom.tex);
  gl.uniform1i(bu_bloom, 1);

  // Parse tint from glow config color string
  var tint = parseGlowColor(g.color);
  gl.uniform3f(bu_tint, tint[0], tint[1], tint[2]);
  gl.uniform1f(bu_intensity, tint[3] * 0.6); // heavily reduced for crisp text

  gl.bindVertexArray(bloomVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

function blitToScreen() {
  // Simple blit — no bloom
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, state.canvas.width, state.canvas.height);
  gl.useProgram(blendProg);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
  gl.uniform1i(bu_scene, 0);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex); // bloom = scene (no bloom effect)
  gl.uniform1i(bu_bloom, 1);
  gl.uniform3f(bu_tint, 0, 0, 0);
  gl.uniform1f(bu_intensity, 0);
  gl.bindVertexArray(bloomVAO);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ============================================================
// GLOW COLOR PARSER
// ============================================================
// Parses 'rgba(r,g,b,a)' → [r/255, g/255, b/255, a]
var _glowCache = {};

function parseGlowColor(str) {
  if (_glowCache[str]) return _glowCache[str];
  var m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+),?\s*([\d.]+)?\)/);
  if (!m) return [1, 1, 1, 0.3];
  var result = [parseInt(m[1]) / 255, parseInt(m[2]) / 255, parseInt(m[3]) / 255, parseFloat(m[4] || '1')];
  _glowCache[str] = result;
  return result;
}

// ============================================================
// SHADER COMPILATION
// ============================================================

function compile(vs, fs) {
  var v = gl.createShader(gl.VERTEX_SHADER);
  gl.shaderSource(v, vs);
  gl.compileShader(v);
  if (!gl.getShaderParameter(v, gl.COMPILE_STATUS)) {
    console.error('Vertex shader:', gl.getShaderInfoLog(v));
    return null;
  }

  var f = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(f, fs);
  gl.compileShader(f);
  if (!gl.getShaderParameter(f, gl.COMPILE_STATUS)) {
    console.error('Fragment shader:', gl.getShaderInfoLog(f));
    return null;
  }

  var p = gl.createProgram();
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.error('Link:', gl.getProgramInfoLog(p));
    return null;
  }

  gl.deleteShader(v);
  gl.deleteShader(f);
  return p;
}
