import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { resize } from '../core/canvas.js';
import { pointer } from '../core/pointer.js';
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';

// glyphworld — an "ASCII MMORPG". A real three.js scene (a hooded wanderer
// with a lantern walking a loop through tall grass around a pond, pines,
// rocks, a castle wall, fireflies under a dusk moon) is rendered offscreen at
// a few sub-pixels per character cell, twice: once lit and coloured, once as
// world normals + a material id, with the depth buffer kept from the first.
//
// A post pass then runs at exactly one pixel per CELL. It walks the cell's
// sub-pixels, builds a structure tensor from the Sobel-style gradients of
// luminance and log-depth, and picks the glyph by edge ORIENTATION, not just
// brightness: grass blades come out as | / \, brick courses and roof lines as
// - and /, flat regions fall back to a density ramp. Water cells read the
// ripple normals instead and turn the rings into ( ) / \ - around each drop.
// The chosen glyph index goes in the alpha byte and the cell's colour
// (saturation-boosted) in rgb. A last full-screen pass draws the glyphs
// from a font atlas straight onto the renderer's own canvas, which sits over
// the grid, so there is no readback and no per-cell 2D drawing per frame.
//
// Drag: orbit. Tap the pond: ripple. Tap the grass: a gust rolls out from it.

var MODE = 'glyphworld';
// index = value the cell shader writes into alpha
var GLYPHS = " .:-=+*#%@|/\\()~'oO";

var gw = null;

function mulberry(seed) {
  return function () {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

var POND_RX = 5.0, POND_RZ = 3.6;

function inPond(x, z, k) {
  var a = x / (POND_RX * k), b = z / (POND_RZ * k);
  return a * a + b * b < 1;
}

function groundH(x, z) {
  var a = x / (POND_RX * 1.12), b = z / (POND_RZ * 1.12);
  var r = Math.sqrt(a * a + b * b);
  var bowl = r < 1 ? -0.45 * (1 - r * r) : 0;
  var roll = 0.18 * Math.sin(x * 0.31 + 1.3) * Math.cos(z * 0.27) +
             0.1 * Math.sin(x * 0.7 - z * 0.5);
  roll *= Math.min(1, Math.max(0, (r - 1) * 1.5));
  var d = Math.sqrt(x * x + z * z);
  var far = d > 26 ? (d - 26) * 0.12 : 0;
  return bowl + roll + far;
}

// ---------------------------------------------------------------- shaders

var COMMON = [
  'uniform float uPass;',
  'uniform float uTime;',
  'uniform vec3 uMoonDir;',
  'uniform vec3 uKeyDir;',
  'uniform vec3 uLantern;',
  'uniform float uLanternI;',
  'uniform vec3 uFog;',
  'float hash21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float vnoise(vec2 p) {',
  '  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), f.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), f.x), f.y);',
  '}',
  'vec3 shade(vec3 alb, vec3 n, vec3 wp) {',
  '  float dif = max(dot(n, uKeyDir), 0.0);',
  '  float hemi = 0.5 + 0.5 * n.y;',
  '  vec3 c = alb * (mix(vec3(0.16, 0.10, 0.16), vec3(0.22, 0.26, 0.46), hemi) + vec3(0.55, 0.62, 0.95) * dif);',
  '  vec3 L = uLantern - wp; float d2 = dot(L, L);',
  '  float lam = 0.35 + 0.65 * max(dot(n, L * inversesqrt(d2 + 1e-4)), 0.0);',
  '  c += alb * vec3(1.0, 0.55, 0.2) * uLanternI * lam / (1.0 + d2 * 0.55);',
  '  return c;',
  '}',
  // pass 1 writes world normal + material id; pass 0 writes tone-mapped colour
  'vec4 finish(vec3 c, vec3 wp, vec3 n, float id) {',
  '  if (uPass > 0.5) return vec4(normalize(n) * 0.5 + 0.5, id);',
  '  float dist = length(wp - cameraPosition);',
  '  c = mix(c, uFog, 1.0 - exp(-dist * 0.028));',
  '  c = 1.0 - exp(-c * 1.9);',
  '  return vec4(c, 1.0);',
  '}'
].join('\n');

var MESH_VERT = [
  'varying vec3 vWP;',
  'varying vec3 vN;',
  'uniform float uSway;',
  'uniform float uTime;',
  'void main() {',
  '  vec4 wp = modelMatrix * vec4(position, 1.0);',
  '  float h = max(wp.y - 1.2, 0.0);',
  '  wp.x += uSway * h * h * 0.03 * sin(uTime * 1.1 + wp.z * 0.3);',
  '  vWP = wp.xyz;',
  '  vN = normalize(mat3(modelMatrix) * normal);',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '}'
].join('\n');

// uKind: 0 plain, 1 brick, 2 emissive, 3 ground
var MESH_FRAG = [
  COMMON,
  'uniform vec3 uCol;',
  'uniform float uKind;',
  'uniform float uId;',
  'varying vec3 vWP;',
  'varying vec3 vN;',
  'void main() {',
  '  vec3 n = normalize(vN);',
  '  vec3 alb = uCol;',
  '  if (uKind > 2.5) {',
  '    float g = vnoise(vWP.xz * 0.35) * 0.6 + vnoise(vWP.xz * 1.7) * 0.4;',
  '    float pr = length(vWP.xz / vec2(5.6, 4.0));',
  '    alb = mix(vec3(0.07, 0.055, 0.035), vec3(0.08, 0.2, 0.05), smoothstep(0.3, 0.75, g));',
  '    alb = mix(vec3(0.06, 0.05, 0.04), alb, smoothstep(0.95, 1.15, pr));',
  '  } else if (uKind > 1.5) {',
  '    gl_FragColor = finish(uCol, vWP, n, 1.0);',
  '    if (uPass < 0.5) gl_FragColor = vec4(uCol, 1.0);',
  '    return;',
  '  } else if (uKind > 0.5) {',
  '    float hc = vWP.x + vWP.z;',
  '    float row = floor(vWP.y / 0.55);',
  '    float hx = hc / 1.1 + 0.5 * mod(row, 2.0);',
  '    float my = fract(vWP.y / 0.55), mx = fract(hx);',
  '    float mort = smoothstep(0.0, 0.1, my) * smoothstep(1.0, 0.92, my) * smoothstep(0.0, 0.06, mx) * smoothstep(1.0, 0.95, mx);',
  '    if (abs(n.y) > 0.7) mort = 1.0;',
  '    alb *= mix(0.25, 1.0, mort) * (0.8 + 0.4 * hash21(vec2(floor(hx), row)));',
  '    alb *= 0.85 + 0.3 * vnoise(vWP.xy * 0.6);',
  '  }',
  '  gl_FragColor = finish(shade(alb, n, vWP), vWP, n, uId);',
  '}'
].join('\n');

var GRASS_VERT = [
  'attribute vec3 aOff;',
  'attribute vec4 aPar;',
  'attribute float aTint;',
  'uniform float uTime;',
  'uniform vec3 uWalker;',
  'uniform vec4 uGust[4];',
  'varying vec3 vWP;',
  'varying vec3 vN;',
  'varying float vH;',
  'varying float vTint;',
  'void main() {',
  '  float t = position.y;',
  '  float hgt = aPar.x, wid = aPar.y, yaw = aPar.z, ph = aPar.w;',
  '  float cy = cos(yaw), sy = sin(yaw);',
  '  vec3 side = vec3(cy, 0.0, -sy);',
  '  vec2 lean0 = vec2(sy, cy);',
  '  vec2 wdir = normalize(vec2(1.0, 0.35));',
  '  float w = sin(uTime * 1.25 + dot(aOff.xz, wdir) * 0.42 + ph) * 0.5',
  '          + sin(uTime * 2.6 + aOff.x * 1.1 + ph * 2.0) * 0.14 + 0.22;',
  '  vec2 bend = wdir * w * 0.55 + lean0 * 0.22;',
  '  for (int i = 0; i < 4; i++) {',
  '    vec4 g = uGust[i];',
  '    float age = uTime - g.z;',
  '    if (age > 0.0 && age < 6.0) {',
  '      vec2 dv = aOff.xz - g.xy; float d = length(dv) + 0.001;',
  '      float fr = age * 7.0;',
  '      float k = exp(-(d - fr) * (d - fr) * 0.12) * exp(-age * 0.45) * g.w;',
  '      bend += dv / d * k * 1.6;',
  '    }',
  '  }',
  '  vec2 dw = aOff.xz - uWalker.xz; float dd = length(dw);',
  '  bend += dw / max(dd, 0.01) * smoothstep(1.3, 0.25, dd) * 1.3;',
  '  float bl = length(bend); if (bl > 1.4) bend *= 1.4 / bl;',
  '  vec3 p = side * position.x * wid * (1.0 - t * 0.85);',
  '  p.y = t * hgt * (1.0 - 0.28 * min(dot(bend, bend), 1.0) * t);',
  '  p.xz += bend * t * t * hgt;',
  '  vec3 wp = aOff + p;',
  '  vH = t; vTint = aTint;',
  '  vN = normalize(cross(side, vec3(bend.x * 2.0 * t * hgt, hgt, bend.y * 2.0 * t * hgt)));',
  '  vWP = wp;',
  '  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);',
  '}'
].join('\n');

var GRASS_FRAG = [
  COMMON,
  'varying vec3 vWP;',
  'varying vec3 vN;',
  'varying float vH;',
  'varying float vTint;',
  'void main() {',
  '  vec3 n = normalize(vN);',
  '  if (dot(n, cameraPosition - vWP) < 0.0) n = -n;',
  '  vec3 tip = mix(vec3(0.2, 0.6, 0.1), vec3(0.5, 0.62, 0.14), vTint);',
  '  vec3 alb = mix(vec3(0.025, 0.07, 0.02), tip, vH);',
  '  vec3 c = shade(alb, normalize(n + vec3(0.0, 0.7, 0.0)), vWP);',
  '  gl_FragColor = finish(c, vWP, vec3(0.0, 1.0, 0.0), 0.2);',
  '}'
].join('\n');

var WATER_VERT = [
  'uniform mat4 textureMatrix;',
  'varying vec4 vUvR;',
  'varying vec3 vWP;',
  'void main() {',
  '  vUvR = textureMatrix * vec4(position, 1.0);',
  '  vec4 wp = modelMatrix * vec4(position, 1.0);',
  '  vWP = wp.xyz;',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '}'
].join('\n');

var WATER_FRAG = [
  COMMON,
  'uniform sampler2D tDiffuse;',
  'uniform vec3 color;',
  'uniform vec4 uRip[8];',
  'uniform float uReflect;',
  'varying vec4 vUvR;',
  'varying vec3 vWP;',
  'void main() {',
  '  vec2 p = vWP.xz;',
  '  vec2 g = 0.035 * vec2(cos(p.x * 1.3 + uTime * 0.9), cos(p.y * 1.7 - uTime * 0.7));',
  '  float crest = 0.0;',
  '  for (int i = 0; i < 8; i++) {',
  '    vec4 r = uRip[i];',
  '    float age = uTime - r.z;',
  '    if (age < 0.0 || age > 8.0) continue;',
  '    vec2 dv = p - r.xy; float d = length(dv) + 1e-4;',
  '    float x = d - age * 1.3;',
  // a short train of rings trailing the front, fading with age and spread
  '    float env = smoothstep(0.4, -0.2, x) * exp(x * 0.45) * exp(-age * 0.3) * r.w / (1.0 + d * 0.2);',
  '    float c = cos(x * 3.6);',
  '    g += dv / d * env * c * 0.8;',
  '    crest += env * max(sin(x * 3.6), 0.0);',
  '  }',
  '  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));',
  '  if (uPass > 0.5) { gl_FragColor = vec4(n * 0.5 + 0.5, 0.4); return; }',
  '  vec3 V = normalize(cameraPosition - vWP);',
  '  vec3 sky = mix(vec3(0.28, 0.16, 0.24), vec3(0.05, 0.07, 0.18), clamp(reflect(-V, n).y * 2.0, 0.0, 1.0));',
  '  vec3 refl = sky;',
  '  if (uReflect > 0.5) {',
  '    vec4 uv = vUvR; uv.xy += n.xz * 0.35 * uv.w;',
  '    refl = textureProj(tDiffuse, uv).rgb;',
  '  }',
  '  float fres = 0.35 + 0.65 * pow(1.0 - max(dot(n, V), 0.0), 3.0);',
  '  vec3 c = mix(vec3(0.03, 0.08, 0.12), refl, fres);',
  '  vec3 H = normalize(uMoonDir + V);',
  '  c += vec3(0.6, 0.7, 1.0) * pow(max(dot(n, H), 0.0), 90.0) * 0.9;',
  '  vec3 Ld = uLantern - vWP; float ld2 = dot(Ld, Ld);',
  '  vec3 H2 = normalize(normalize(Ld) + V);',
  '  c += vec3(1.0, 0.6, 0.25) * pow(max(dot(n, H2), 0.0), 40.0) * uLanternI * 0.6 / (1.0 + ld2 * 0.08);',
  '  c += vec3(0.1, 0.2, 0.26) * crest;',
  '  float dist = length(vWP - cameraPosition);',
  '  c = mix(c, 1.0 - exp(-uFog * 1.9), 1.0 - exp(-dist * 0.028));',
  '  gl_FragColor = vec4(c, 1.0);',
  '}'
].join('\n');

var SKY_VERT = [
  'varying vec3 vDir;',
  'void main() {',
  '  vDir = position;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n');

var SKY_FRAG = [
  'uniform float uPass;',
  'uniform vec3 uMoonDir;',
  'varying vec3 vDir;',
  'void main() {',
  '  vec3 d = normalize(vDir);',
  '  float h = d.y;',
  '  vec3 col = mix(vec3(0.34, 0.14, 0.2), vec3(0.045, 0.045, 0.13), smoothstep(-0.02, 0.16, h));',
  '  col = mix(col, vec3(0.012, 0.016, 0.05), smoothstep(0.16, 0.6, h));',
  '  col = mix(col, vec3(0.05, 0.05, 0.08), smoothstep(0.0, -0.2, h));',
  '  float m = dot(d, uMoonDir);',
  '  col += vec3(0.5, 0.55, 0.85) * pow(max(m, 0.0), 60.0) * 0.35;',
  '  float id = 0.0;',
  '  if (m > 0.9991) {',
  '    float crater = 0.85 + 0.15 * sin(d.x * 300.0) * sin(d.y * 260.0);',
  '    col = vec3(1.0, 0.94, 0.78) * 1.6 * crater; id = 1.0;',
  '  }',
  '  if (uPass > 0.5) gl_FragColor = vec4(0.5, 1.0, 0.5, id);',
  '  else gl_FragColor = vec4(1.0 - exp(-col * 1.9), 1.0);',
  '}'
].join('\n');

var POINT_VERT = [
  'attribute vec3 aSeed;',
  'uniform float uTime;',
  'uniform float uPx;',
  'uniform float uFly;',
  'varying float vB;',
  'void main() {',
  '  vec3 p = position;',
  '  float b = 1.0;',
  '  if (uFly > 0.5) {',
  '    p += vec3(sin(uTime * 0.35 * (0.6 + aSeed.x) + aSeed.y * 6.3) * 1.4,',
  '              sin(uTime * 0.6 * (0.6 + aSeed.z) + aSeed.x * 4.0) * 0.45,',
  '              cos(uTime * 0.3 * (0.6 + aSeed.y) + aSeed.z * 5.0) * 1.4);',
  '    b = pow(0.5 + 0.5 * sin(uTime * (0.7 + aSeed.x * 1.3) + aSeed.y * 20.0), 2.0);',
  '  } else {',
  '    b = 0.55 + 0.45 * sin(uTime * (0.5 + aSeed.x * 2.0) + aSeed.y * 30.0);',
  '  }',
  '  vB = b;',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
  '  float sz = uFly > 0.5 ? clamp(uPx * 9.0 / -mv.z, 1.5, 6.0) : uPx * (0.6 + aSeed.z * 0.8) * 0.12;',
  '  gl_PointSize = b > 0.18 ? sz : 0.0;',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');

var POINT_FRAG = [
  'uniform float uPass;',
  'uniform vec3 uCol;',
  'varying float vB;',
  'void main() {',
  '  vec2 q = gl_PointCoord - 0.5;',
  '  if (dot(q, q) > 0.25) discard;',
  '  if (uPass > 0.5) gl_FragColor = vec4(0.5, 1.0, 0.5, 1.0);',
  '  else gl_FragColor = vec4(uCol * (0.5 + 0.7 * vB), 1.0);',
  '}'
].join('\n');

var CELL_VERT = [
  'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }'
].join('\n');

var CELL_FRAG = [
  'precision highp float;',
  'uniform sampler2D tCol;',
  'uniform sampler2D tNrm;',
  'uniform sampler2D tDep;',
  'uniform vec2 uSub;',
  'uniform float uNear;',
  'uniform float uFar;',
  'uniform mat3 uView;',
  'uniform float uEdge;',
  'float LUM(vec3 c) { return dot(c, vec3(0.3, 0.59, 0.11)); }',
  'float Lat(ivec2 p) { return LUM(texelFetch(tCol, p, 0).rgb); }',
  'float Dat(ivec2 p) {',
  '  float z = texelFetch(tDep, p, 0).r * 2.0 - 1.0;',
  '  return log(2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)));',
  '}',
  'float G(float i) { return i / 255.0; }',
  'void main() {',
  '  ivec2 cell = ivec2(gl_FragCoord.xy);',
  '  ivec2 sub = ivec2(uSub);',
  '  ivec2 sz = textureSize(tCol, 0);',
  '  ivec2 base = cell * sub;',
  '  vec3 cW = vec3(0.0); float wSum = 0.0, lSum = 0.0, lMax = 0.0, N = 0.0;',
  '  float jxx = 0.0, jyy = 0.0, jxy = 0.0;',
  '  float nWater = 0.0, nEmit = 0.0, nFig = 0.0;',
  '  vec3 wN = vec3(0.0), eCol = vec3(0.0);',
  '  for (int j = 0; j < 8; j++) {',
  '    if (j >= sub.y) break;',
  '    for (int i = 0; i < 4; i++) {',
  '      if (i >= sub.x) break;',
  '      ivec2 p = min(base + ivec2(i, j), sz - 1);',
  '      vec3 c = texelFetch(tCol, p, 0).rgb;',
  '      vec4 nm = texelFetch(tNrm, p, 0);',
  '      float id = floor(nm.a * 5.0 + 0.5);',
  '      float l = LUM(c);',
  '      N += 1.0; lSum += l; lMax = max(lMax, l);',
  '      cW += c * (l + 0.02); wSum += l + 0.02;',
  '      if (id > 4.5) { nEmit += 1.0; eCol += c; }',
  '      if (id > 3.5 && id < 4.5) nFig += 1.0;',
  '      if (id > 1.5 && id < 2.5) { nWater += 1.0; wN += nm.xyz * 2.0 - 1.0; }',
  '      ivec2 x1 = min(p + ivec2(1, 0), sz - 1), x0 = max(p - ivec2(1, 0), ivec2(0));',
  '      ivec2 y1 = min(p + ivec2(0, 1), sz - 1), y0 = max(p - ivec2(0, 1), ivec2(0));',
  '      float gx = Lat(x1) - Lat(x0), gy = Lat(y1) - Lat(y0);',
  '      float dx = clamp(Dat(x1) - Dat(x0), -0.35, 0.35) * 0.6;',
  '      float dy = clamp(Dat(y1) - Dat(y0), -0.35, 0.35) * 0.6;',
  '      jxx += gx * gx + dx * dx; jyy += gy * gy + dy * dy; jxy += gx * gy + dx * dy;',
  '    }',
  '  }',
  '  float mean = lSum / N;',
  '  float lev = mix(mean, lMax, 0.45);',
  '  vec3 hue = cW / wSum;',
  '  float glyph = 0.0;',
  '  float bright = clamp(0.22 + 1.25 * lev, 0.0, 1.0);',
  '  float sat = 1.6;',
  '  if (nEmit > 0.0 && nEmit / N > 0.06) {',
  '    float f = nEmit / N;',
  '    hue = eCol / nEmit;',
  '    glyph = f < 0.14 ? 1.0 : (f < 0.3 ? 5.0 : (f < 0.6 ? 6.0 : (f < 0.9 ? 18.0 : 9.0)));',
  '    bright = 1.0; sat = 1.3;',
  '  } else if (nWater / N > 0.5) {',
  '    vec3 n = wN / nWater;',
  '    vec2 T = n.xz;',
  '    float m = length(T);',
  '    if (m > 0.055) {',
  // ring tangent in the world, projected to the screen
  '      vec2 ts = (uView * vec3(-T.y, 0.0, T.x)).xy;',
  '      vec2 os = (uView * vec3(T.x, 0.0, T.y)).xy;',
  '      float a = atan(ts.y, ts.x);',
  '      if (a < 0.0) a += 3.14159265;',
  '      float deg = a * 57.2958;',
  '      if (deg < 18.0 || deg > 162.0) glyph = 3.0;',
  '      else if (deg < 50.0) glyph = 11.0;',
  '      else if (deg < 130.0) glyph = os.x > 0.0 ? 13.0 : 14.0;',
  '      else glyph = 12.0;',
  '      bright = clamp(0.35 + 1.4 * lev + m * 1.2, 0.0, 1.0);',
  '    } else {',
  '      glyph = lev < 0.05 ? 0.0 : (lev < 0.12 ? 1.0 : (lev < 0.45 ? 15.0 : 4.0));',
  '    }',
  '  } else {',
  '    float e = (jxx + jyy) / N;',
  '    float coh = sqrt((jxx - jyy) * (jxx - jyy) + 4.0 * jxy * jxy) / (jxx + jyy + 1e-6);',
  '    if (e > uEdge && coh > 0.38) {',
  '      float a = 0.5 * atan(2.0 * jxy, jxx - jyy) + 1.5707963;',
  '      if (a < 0.0) a += 3.14159265;',
  '      if (a >= 3.14159265) a -= 3.14159265;',
  '      float deg = a * 57.2958;',
  '      if (deg < 28.0 || deg > 152.0) glyph = 3.0;',
  '      else if (deg < 76.0) glyph = 11.0;',
  '      else if (deg < 104.0) glyph = 10.0;',
  '      else glyph = 12.0;',
  '      bright = clamp(0.3 + 1.3 * lev + sqrt(e) * 1.5, 0.0, 1.0);',
  '    } else if (nFig / N > 0.45) {',
  '      glyph = lev < 0.12 ? 7.0 : (lev < 0.3 ? 8.0 : 9.0);',
  '      bright = clamp(0.4 + 1.3 * lev, 0.0, 1.0);',
  '    } else if (lev > 0.06) {',
  '      glyph = 1.0 + floor(clamp((lev - 0.06) / 0.62, 0.0, 1.0) * 8.99);',
  '    }',
  '  }',
  '  float hl = LUM(hue);',
  '  vec3 c = max(vec3(0.0), mix(vec3(hl), hue, sat));',
  '  float mx = max(c.r, max(c.g, c.b));',
  '  c = c / max(mx, 1e-3) * bright;',
  '  gl_FragColor = vec4(c, G(glyph));',
  '}'
].join('\n');

// Final pass, straight to the visible canvas: every screen pixel finds its
// cell, reads that cell's glyph index (alpha) and colour (rgb) from the cell
// target, and samples the glyph out of an atlas rendered in textflow's font.
var GLYPH_FRAG = [
  'precision highp float;',
  'uniform sampler2D tCell;',
  'uniform sampler2D tAtlas;',
  'uniform vec2 uCellPx;',
  'uniform vec2 uGrid;',
  'uniform float uN;',
  'uniform vec3 uBg;',
  'void main() {',
  '  vec2 cf = gl_FragCoord.xy / uCellPx;',
  // the canvas stops one row short of the bottom: that row is the footer
  '  ivec2 cell = ivec2(floor(cf)) + ivec2(0, 1);',
  '  if (cell.x >= int(uGrid.x) || cell.y >= int(uGrid.y)) { gl_FragColor = vec4(uBg, 1.0); return; }',
  '  vec4 c = texelFetch(tCell, cell, 0);',
  '  float gi = floor(c.a * 255.0 + 0.5);',
  '  if (gi < 0.5 || gi >= uN) { gl_FragColor = vec4(uBg, 1.0); return; }',
  '  vec2 f = fract(cf);',
  '  float a = texture(tAtlas, vec2((gi + f.x) / uN, f.y)).a;',
  '  gl_FragColor = vec4(mix(uBg, c.rgb, a), 1.0);',
  '}'
].join('\n');

function buildAtlas(G) {
  var dpr = state.dpr || 1;
  var tw = Math.max(1, Math.round(state.CHAR_W * dpr));
  var th = Math.max(1, Math.round(state.CHAR_H * dpr));
  var cv = document.createElement('canvas');
  cv.width = tw * GLYPHS.length; cv.height = th;
  var ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#fff';
  ctx.font = (state.FONT_SIZE * dpr) + 'px "JetBrains Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  for (var i = 1; i < GLYPHS.length; i++) ctx.fillText(GLYPHS[i], i * tw + tw / 2, th / 2);
  if (G.atlas) G.atlas.dispose();
  G.atlas = new THREE.CanvasTexture(cv);
  G.atlas.minFilter = THREE.LinearFilter;
  G.atlas.magFilter = THREE.LinearFilter;
  G.atlas.generateMipmaps = false;
  G.glyphMat.uniforms.tAtlas.value = G.atlas;
}

// ---------------------------------------------------------------- scene

function meshMat(shared, col, kind, id, sway) {
  var m = new THREE.ShaderMaterial({
    vertexShader: MESH_VERT,
    fragmentShader: MESH_FRAG,
    uniforms: {
      uCol: { value: new THREE.Color(col[0], col[1], col[2]) },
      uKind: { value: kind },
      uId: { value: id },
      uSway: { value: sway || 0 }
    }
  });
  shareUniforms(m, shared);
  return m;
}

function shareUniforms(m, shared) {
  for (var k in shared) m.uniforms[k] = shared[k];
}

function buildScene(G) {
  var rnd = mulberry(7);
  var S = G.shared;
  var scene = new THREE.Scene();
  G.scene = scene;

  // sky + stars follow the camera
  var skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT, fragmentShader: SKY_FRAG,
    uniforms: {}, side: THREE.BackSide, depthWrite: false
  });
  shareUniforms(skyMat, S);
  G.sky = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), skyMat);
  G.sky.renderOrder = -10;
  G.sky.frustumCulled = false;
  scene.add(G.sky);

  var NS = 380, sp = new Float32Array(NS * 3), ss = new Float32Array(NS * 3);
  for (var i = 0; i < NS; i++) {
    var th = rnd() * Math.PI * 2, y = 0.06 + rnd() * 0.94;
    var r = Math.sqrt(1 - y * y);
    sp[i * 3] = Math.cos(th) * r * 140; sp[i * 3 + 1] = y * 140; sp[i * 3 + 2] = Math.sin(th) * r * 140;
    ss[i * 3] = rnd(); ss[i * 3 + 1] = rnd(); ss[i * 3 + 2] = rnd();
  }
  var sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  sg.setAttribute('aSeed', new THREE.BufferAttribute(ss, 3));
  var starMat = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    uniforms: { uCol: { value: new THREE.Color(0.75, 0.8, 1.0) }, uFly: { value: 0 } }
  });
  shareUniforms(starMat, S);
  G.stars = new THREE.Points(sg, starMat);
  G.stars.frustumCulled = false;
  scene.add(G.stars);

  // ground
  var gg = new THREE.PlaneGeometry(150, 150, 150, 150);
  gg.rotateX(-Math.PI / 2);
  var pos = gg.attributes.position;
  for (i = 0; i < pos.count; i++) pos.setY(i, groundH(pos.getX(i), pos.getZ(i)));
  gg.computeVertexNormals();
  scene.add(new THREE.Mesh(gg, meshMat(S, [0.1, 0.2, 0.06], 3, 0.2)));

  // pond
  var pg = new THREE.CircleGeometry(1, 48);
  pg.scale(POND_RX * 1.1, POND_RZ * 1.1, 1);
  var rs = state.isMobile ? 128 : 256;
  G.water = new Reflector(pg, {
    textureWidth: rs * 2, textureHeight: rs,
    clipBias: 0.01, multisample: 0,
    shader: {
      name: 'GlyphPond',
      uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        uRip: { value: G.ripples },
        uReflect: { value: 1 }
      },
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG
    }
  });
  shareUniforms(G.water.material, S);
  G.water.material.uniforms.uRip.value = G.ripples;
  G.water.rotation.x = -Math.PI / 2;
  G.water.position.y = -0.08;
  var origBefore = G.water.onBeforeRender;
  G.water.onBeforeRender = function (r, s, c) {
    if (S.uPass.value < 0.5) origBefore.call(this, r, s, c);
  };
  scene.add(G.water);

  // castle wall
  var stone = meshMat(S, [0.36, 0.36, 0.42], 1, 0.6);
  var dark = meshMat(S, [0.02, 0.02, 0.03], 0, 0.6);
  var roof = meshMat(S, [0.3, 0.1, 0.12], 0, 0.6);
  var glow = meshMat(S, [1.0, 0.62, 0.25], 2, 1.0);
  var WZ = -36, base = 0.4;
  var parts = [];
  var b = new THREE.BoxGeometry(76, 5, 1.6); b.translate(0, base + 2.5, WZ); parts.push(b);
  for (var x = -37.4; x <= 37.5; x += 1.5) {
    b = new THREE.BoxGeometry(0.8, 0.9, 1.6); b.translate(x, base + 5.45, WZ); parts.push(b);
  }
  var towers = [[-12, 2.6], [15, 2.4], [-32, 2.8]];
  for (i = 0; i < towers.length; i++) {
    var tx = towers[i][0], tr = towers[i][1];
    b = new THREE.CylinderGeometry(tr, tr + 0.2, 8, 16); b.translate(tx, base + 4, WZ + 0.4); parts.push(b);
    for (var k = 0; k < 10; k++) {
      var a = k / 10 * Math.PI * 2;
      b = new THREE.BoxGeometry(0.7, 0.8, 0.7);
      b.translate(tx + Math.cos(a) * tr, base + 8.4, WZ + 0.4 + Math.sin(a) * tr); parts.push(b);
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(parts), stone));
  var roofs = [];
  for (i = 0; i < towers.length; i++) {
    b = new THREE.ConeGeometry(towers[i][1] + 0.5, 3.6, 16);
    b.translate(towers[i][0], base + 10.6, WZ + 0.4); roofs.push(b);
  }
  scene.add(new THREE.Mesh(mergeGeometries(roofs), roof));
  b = new THREE.BoxGeometry(2.8, 2.6, 0.3); b.translate(1.5, base + 1.9, WZ + 0.75);
  var arch = new THREE.CylinderGeometry(1.4, 1.4, 0.3, 16, 1, false, 0, Math.PI);
  arch.rotateX(Math.PI / 2); arch.rotateZ(Math.PI / 2); arch.translate(1.5, base + 3.2, WZ + 0.75);
  scene.add(new THREE.Mesh(mergeGeometries([b, arch]), dark));
  var wins = [];
  var wp = [[-12, 3.6], [-12, 6.2], [15, 5.4], [-32, 4.8], [6, 3.0], [-20, 3.2]];
  for (i = 0; i < wp.length; i++) {
    var onT = wp[i][0] === -12 ? 2.6 : (wp[i][0] === 15 ? 2.4 : (wp[i][0] === -32 ? 2.8 : 0.8));
    b = new THREE.BoxGeometry(0.45, 0.8, 0.2);
    b.translate(wp[i][0], base + wp[i][1], WZ + 0.4 + onT); wins.push(b);
  }
  // gate torches
  b = new THREE.SphereGeometry(0.22, 8, 6); b.translate(-0.3, base + 3.2, WZ + 1.0); wins.push(b);
  b = new THREE.SphereGeometry(0.22, 8, 6); b.translate(3.3, base + 3.2, WZ + 1.0); wins.push(b);
  scene.add(new THREE.Mesh(mergeGeometries(wins), glow));

  // pines
  var trunk = meshMat(S, [0.2, 0.12, 0.07], 0, 0.6);
  var leaf = meshMat(S, [0.06, 0.2, 0.11], 0, 0.6, 1);
  var trees = [[-10, -6, 1.1], [9.5, -8, 1.3], [-14, 3.5, 1.0], [14, 2, 1.2], [-6.5, -12, 1.4], [5, -14, 1.2], [-17, -9, 1.5], [18, -4, 1.1]];
  var tg = [], lg = [];
  for (i = 0; i < trees.length; i++) {
    var T = trees[i], s = T[2], gy = groundH(T[0], T[1]);
    b = new THREE.CylinderGeometry(0.14 * s, 0.24 * s, 1.8 * s, 7); b.translate(T[0], gy + 0.9 * s, T[1]); tg.push(b);
    var lv = [[1.5, 2.3, 1.9], [1.15, 2.0, 3.0], [0.8, 1.7, 4.0], [0.45, 1.3, 4.9]];
    for (k = 0; k < lv.length; k++) {
      b = new THREE.ConeGeometry(lv[k][0] * s, lv[k][1] * s, 9);
      b.rotateY(rnd() * 3);
      b.translate(T[0], gy + lv[k][2] * s, T[1]); lg.push(b);
    }
  }
  scene.add(new THREE.Mesh(mergeGeometries(tg), trunk));
  var leafG = mergeGeometries(lg.map(function (g) { return g.toNonIndexed(); }));
  leafG.computeVertexNormals();
  scene.add(new THREE.Mesh(leafG, leaf));

  // rocks around the pond
  var rockM = meshMat(S, [0.32, 0.31, 0.33], 0, 0.6);
  var rg = [];
  for (i = 0; i < 9; i++) {
    var ang = rnd() * Math.PI * 2;
    var rr = 1.02 + rnd() * 0.12;
    var rx = Math.cos(ang) * POND_RX * rr, rz = Math.sin(ang) * POND_RZ * rr;
    var sc = 0.3 + rnd() * 0.55;
    b = new THREE.DodecahedronGeometry(1, 0);
    b.scale(sc * (1 + rnd() * 0.5), sc * 0.7, sc);
    b.rotateY(rnd() * 3);
    b.translate(rx, groundH(rx, rz) + sc * 0.15, rz);
    rg.push(b);
  }
  b = new THREE.DodecahedronGeometry(1.2, 0); b.scale(1.3, 0.9, 1); b.translate(-7.5, 0.3, 6.5); rg.push(b);
  b = new THREE.DodecahedronGeometry(0.9, 0); b.scale(1, 1.2, 1); b.translate(8.6, 0.4, -2.5); rg.push(b);
  scene.add(new THREE.Mesh(mergeGeometries(rg), rockM));

  // grass
  var NB = state.isMobile ? 11000 : 36000;
  var RAD = state.isMobile ? 17 : 22;
  var bladeG = new THREE.InstancedBufferGeometry();
  var bp = [], bi = [];
  var SEG = 4;
  for (k = 0; k < SEG; k++) { var tt = k / SEG; bp.push(-0.5, tt, 0, 0.5, tt, 0); }
  bp.push(0, 1, 0);
  for (k = 0; k < SEG - 1; k++) { var o = k * 2; bi.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
  var o2 = (SEG - 1) * 2; bi.push(o2, o2 + 1, SEG * 2);
  bladeG.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  bladeG.setIndex(bi);
  var off = new Float32Array(NB * 3), par = new Float32Array(NB * 4), tint = new Float32Array(NB);
  var n = 0, tries = 0;
  while (n < NB && tries < NB * 4) {
    tries++;
    var gx = (rnd() * 2 - 1) * RAD, gz = (rnd() * 2 - 1) * RAD;
    if (gx * gx + gz * gz > RAD * RAD) continue;
    if (inPond(gx, gz, 1.04)) continue;
    if (gz < -19) continue;
    var near = inPond(gx, gz, 1.35);
    off[n * 3] = gx; off[n * 3 + 1] = groundH(gx, gz) - 0.03; off[n * 3 + 2] = gz;
    par[n * 4] = (near && rnd() < 0.18 ? 1.0 + rnd() * 0.5 : 0.45 + rnd() * 0.5);
    par[n * 4 + 1] = 0.05 + rnd() * 0.05;
    par[n * 4 + 2] = rnd() * Math.PI * 2;
    par[n * 4 + 3] = rnd() * 6.28;
    tint[n] = rnd();
    n++;
  }
  bladeG.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  bladeG.setAttribute('aPar', new THREE.InstancedBufferAttribute(par, 4));
  bladeG.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 1));
  bladeG.instanceCount = n;
  var grassMat = new THREE.ShaderMaterial({
    vertexShader: GRASS_VERT, fragmentShader: GRASS_FRAG,
    uniforms: { uGust: { value: G.gusts }, uWalker: { value: G.walkerPos } },
    side: THREE.DoubleSide
  });
  shareUniforms(grassMat, S);
  G.grass = new THREE.Mesh(bladeG, grassMat);
  G.grass.frustumCulled = false;
  G.bladeCount = n;
  scene.add(G.grass);

  // fireflies
  var NF = state.isMobile ? 34 : 70;
  var fp = new Float32Array(NF * 3), fs = new Float32Array(NF * 3);
  for (i = 0; i < NF; i++) {
    var fa = rnd() * Math.PI * 2, fr = 3 + rnd() * 12;
    fp[i * 3] = Math.cos(fa) * fr; fp[i * 3 + 1] = 0.5 + rnd() * 1.8; fp[i * 3 + 2] = Math.sin(fa) * fr * 0.8;
    fs[i * 3] = rnd(); fs[i * 3 + 1] = rnd(); fs[i * 3 + 2] = rnd();
  }
  var fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  fg.setAttribute('aSeed', new THREE.BufferAttribute(fs, 3));
  var flyMat = new THREE.ShaderMaterial({
    vertexShader: POINT_VERT, fragmentShader: POINT_FRAG,
    uniforms: { uCol: { value: new THREE.Color(0.85, 1.0, 0.35) }, uFly: { value: 1 } }
  });
  shareUniforms(flyMat, S);
  var flies = new THREE.Points(fg, flyMat);
  flies.frustumCulled = false;
  scene.add(flies);

  // the wanderer
  var cloakM = meshMat(S, [0.85, 0.12, 0.14], 0, 0.8);
  var innerM = meshMat(S, [0.01, 0.005, 0.01], 0, 0.8);
  var legM = meshMat(S, [0.12, 0.08, 0.06], 0, 0.8);
  var staffM = meshMat(S, [0.3, 0.2, 0.1], 0, 0.8);
  var lampM = meshMat(S, [1.6, 0.95, 0.4], 2, 1.0);
  var w = new THREE.Group();
  var cloak = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.46, 1.15, 14), cloakM);
  cloak.position.y = 0.9; w.add(cloak);
  var hood = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), cloakM);
  hood.position.y = 1.52; w.add(hood);
  var tip = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.42, 10), cloakM);
  tip.position.set(0, 1.7, -0.16); tip.rotation.x = -0.75; w.add(tip);
  var face = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), innerM);
  face.position.set(0, 1.49, 0.14); w.add(face);
  var legs = [];
  for (i = 0; i < 2; i++) {
    var pivot = new THREE.Group(); pivot.position.set(i ? 0.13 : -0.13, 0.5, 0);
    var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.5, 6), legM);
    leg.position.y = -0.25; pivot.add(leg); w.add(pivot); legs.push(pivot);
  }
  var arm = new THREE.Group(); arm.position.set(0.4, 1.0, 0.08);
  var staff = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 2.0, 6), staffM);
  staff.position.y = 0.2; arm.add(staff);
  var lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), lampM);
  lamp.position.y = 1.25; arm.add(lamp);
  w.add(arm);
  scene.add(w);
  G.walker = { root: w, legs: legs, arm: arm, lamp: lamp, cloak: cloak };
}

// ---------------------------------------------------------------- lifecycle

function sizeTargets(G) {
  var W = state.COLS, H = state.ROWS;
  if (G.W === W && G.H === H && G.rtCol) return;
  G.W = W; G.H = H;
  var sx = state.isMobile ? 2 : 3;
  var sy = Math.max(2, Math.min(8, Math.round(sx * state.CHAR_H / state.CHAR_W)));
  G.sx = sx; G.sy = sy;
  var rw = W * sx, rh = H * sy;
  if (G.rtCol) { G.rtCol.dispose(); G.rtNrm.dispose(); G.rtCell.dispose(); G.depthTex.dispose(); }
  G.depthTex = new THREE.DepthTexture(rw, rh);
  G.depthTex.type = THREE.UnsignedIntType;
  var opt = { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.UnsignedByteType, format: THREE.RGBAFormat };
  G.rtCol = new THREE.WebGLRenderTarget(rw, rh, Object.assign({ depthBuffer: true, depthTexture: G.depthTex }, opt));
  G.rtNrm = new THREE.WebGLRenderTarget(rw, rh, Object.assign({ depthBuffer: true }, opt));
  G.rtCell = new THREE.WebGLRenderTarget(W, H, Object.assign({ depthBuffer: false }, opt));
  var cu = G.cellMat.uniforms;
  cu.tCol.value = G.rtCol.texture;
  cu.tNrm.value = G.rtNrm.texture;
  cu.tDep.value = G.depthTex;
  cu.uSub.value.set(sx, sy);
  G.shared.uPx.value = rh / 40;
  var aspect = (W * state.CHAR_W) / Math.max(1, H * state.CHAR_H);
  G.camera.aspect = aspect;
  G.camera.fov = aspect < 1 ? 66 : 60;
  G.camera.updateProjectionMatrix();
  G.dist = aspect < 1 ? 8.5 : 9.0;
  var dpr = state.dpr || 1;
  G.renderer.setPixelRatio(dpr);
  G.renderer.setSize(W * state.CHAR_W, (H - 1) * state.CHAR_H, true);
  var gu = G.glyphMat.uniforms;
  gu.tCell.value = G.rtCell.texture;
  gu.uCellPx.value.set(state.CHAR_W * dpr, state.CHAR_H * dpr);
  gu.uGrid.value.set(W, H);
  buildAtlas(G);
  G.probeBuf = null; G.nextProbe = 0;
}

function initGlyphworld() {
  cleanupGlyphworld(true);
  state.FONT_SCALE = state.isMobile ? 0.85 : 0.5;
  resize();

  var G = {};
  G.alive = true;
  G.renderer = new THREE.WebGLRenderer({
    antialias: false, alpha: false, powerPreference: 'high-performance'
  });
  G.renderer.autoClear = true;
  // the renderer's own canvas IS the picture: laid over the grid area, under
  // the nav, clicks fall through to the textflow canvas underneath
  var el = G.renderer.domElement;
  el.setAttribute('data-mode-overlay', MODE);
  el.style.position = 'fixed';
  el.style.left = '0';
  el.style.top = state.NAV_H + 'px';
  el.style.zIndex = '2';
  el.style.pointerEvents = 'none';
  document.body.appendChild(el);

  G.shared = {
    uPass: { value: 0 },
    uTime: { value: 0 },
    uMoonDir: { value: new THREE.Vector3(0.16, 0.085, -0.98).normalize() },
    uKeyDir: { value: new THREE.Vector3(-0.45, 0.6, 0.66).normalize() },
    uLantern: { value: new THREE.Vector3(0, 2, 0) },
    uLanternI: { value: 2.4 },
    uFog: { value: new THREE.Color(0.11, 0.08, 0.15) },
    uPx: { value: 8 }
  };
  G.ripples = [];
  for (var i = 0; i < 8; i++) G.ripples.push(new THREE.Vector4(0, 0, -100, 0));
  G.ripIdx = 0;
  G.gusts = [];
  for (i = 0; i < 4; i++) G.gusts.push(new THREE.Vector4(0, 0, -100, 0));
  G.gustIdx = 0;
  G.walkerPos = new THREE.Vector3();

  G.camera = new THREE.PerspectiveCamera(48, 1.6, 0.3, 320);
  buildScene(G);

  G.cellMat = new THREE.ShaderMaterial({
    vertexShader: CELL_VERT, fragmentShader: CELL_FRAG,
    uniforms: {
      tCol: { value: null }, tNrm: { value: null }, tDep: { value: null },
      uSub: { value: new THREE.Vector2(4, 8) },
      uNear: { value: G.camera.near }, uFar: { value: G.camera.far },
      uView: { value: new THREE.Matrix3() },
      uEdge: { value: 0.0018 }
    },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending
  });
  var cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  G.cellQuad = new THREE.Mesh(cg, G.cellMat);
  G.cellQuad.frustumCulled = false;
  G.cellScene = new THREE.Scene();
  G.cellScene.add(G.cellQuad);
  G.cellCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  G.glyphMat = new THREE.ShaderMaterial({
    vertexShader: CELL_VERT, fragmentShader: GLYPH_FRAG,
    uniforms: {
      tCell: { value: null }, tAtlas: { value: null },
      uCellPx: { value: new THREE.Vector2(8, 16) },
      uGrid: { value: new THREE.Vector2(1, 1) },
      uN: { value: GLYPHS.length },
      uBg: { value: new THREE.Vector3(10 / 255, 10 / 255, 15 / 255) }
    },
    depthTest: false, depthWrite: false, blending: THREE.NoBlending
  });
  G.glyphQuad = new THREE.Mesh(cg, G.glyphMat);
  G.glyphQuad.frustumCulled = false;
  G.glyphScene = new THREE.Scene();
  G.glyphScene.add(G.glyphQuad);

  G.yaw = 0; G.pitch = 0.3; G.dragYaw = 0; G.dragPitch = 0; G.yawT = 0; G.pitchT = 0; G.camT = null;
  G.lastGX = 0; G.lastGY = 0; G.dragging = false;
  G.walkA = -1.75; G.phase = 0;
  G.nextRip = 0.3; G.nextGust = 4.0;
  G.lastT = 0;
  G.pending = false;
  G.ray = new THREE.Raycaster();
  G.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  G.hist = {};
  gw = G;
  sizeTargets(G);
  if (typeof window !== 'undefined') {
    // read-only probe for automated checks: what is on screen, where a world
    // point lands in client pixels, and how far the user has orbited
    window.__glyphworld = {
      mode: MODE, blades: G.bladeCount, hist: G.hist,
      project: function (x, y, z) {
        if (!gw) return null;
        var v = new THREE.Vector3(x, y, z).project(gw.camera);
        return { x: (v.x * 0.5 + 0.5) * gw.W * state.CHAR_W, y: (0.5 - v.y * 0.5) * gw.H * state.CHAR_H + state.NAV_H };
      },
      orbit: function () { return gw ? { yaw: gw.yawT, pitch: gw.pitchT } : null; },
      tapWorld: function (x, z) { if (!gw) return null; var v = new THREE.Vector3(x, 0, z).project(gw.camera); return tapAt(gw, (v.x * 0.5 + 0.5) * gw.W, (0.5 - v.y * 0.5) * gw.H); }
    };
  }
}

function cleanupGlyphworld(keepScale) {
  var G = gw;
  if (G) {
    G.alive = false;
    if (G.scene) {
      G.scene.traverse(function (o) {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    if (G.water && G.water.dispose) G.water.dispose();
    if (G.rtCol) { G.rtCol.dispose(); G.rtNrm.dispose(); G.rtCell.dispose(); G.depthTex.dispose(); }
    if (G.cellQuad) { G.cellQuad.geometry.dispose(); G.cellMat.dispose(); }
    if (G.glyphMat) G.glyphMat.dispose();
    if (G.atlas) G.atlas.dispose();
    var el = G.renderer.domElement;
    if (el && el.parentNode) el.parentNode.removeChild(el);
    G.renderer.dispose();
    G.renderer.forceContextLoss();
    gw = null;
  }
  if (keepScale !== true && state.FONT_SCALE !== 1) {
    state.FONT_SCALE = 1;
    resize();
  }
}

function addRipple(G, x, z, amp) {
  G.ripples[G.ripIdx].set(x, z, state.time, amp);
  G.ripIdx = (G.ripIdx + 1) % G.ripples.length;
}

function addGust(G, x, z, amp) {
  G.gusts[G.gustIdx].set(x, z, state.time, amp);
  G.gustIdx = (G.gustIdx + 1) % G.gusts.length;
}

function tapAt(G, gx, gy) {
  var ndc = new THREE.Vector2((gx / G.W) * 2 - 1, 1 - (gy / G.H) * 2);
  G.ray.setFromCamera(ndc, G.camera);
  var hit = new THREE.Vector3();
  if (G.ray.ray.intersectPlane(G.plane, hit) && hit.distanceTo(G.camera.position) < 60) {
    if (inPond(hit.x, hit.z, 1.08)) { addRipple(G, hit.x, hit.z, 1.3); return 'ripple'; }
    addGust(G, hit.x, hit.z, 1.2); return 'gust';
  }
  addGust(G, G.camera.position.x, G.camera.position.z, 1.0);
  return 'gust';
}

function updateWorld(G, t, dt) {
  var S = G.shared;
  S.uTime.value = t;
  S.uLanternI.value = 2.3 + 0.25 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1);

  // the wanderer walks an ellipse round the pond
  var RX = 7.4, RZ = 5.6, speed = 0.95;
  var sx = -Math.sin(G.walkA) * RX, sz = Math.cos(G.walkA) * RZ;
  var sl = Math.sqrt(sx * sx + sz * sz);
  G.walkA += speed * dt / sl;
  G.phase += speed * dt / 0.34;
  var wx = Math.cos(G.walkA) * RX, wz = Math.sin(G.walkA) * RZ;
  var W = G.walker;
  var cp = Math.cos(G.phase);
  W.root.position.set(wx, groundH(wx, wz) + cp * cp * 0.05, wz);
  W.root.rotation.y = Math.atan2(sx, sz);
  W.legs[0].rotation.x = Math.sin(G.phase) * 0.55;
  W.legs[1].rotation.x = -Math.sin(G.phase) * 0.55;
  W.arm.rotation.x = Math.sin(G.phase) * 0.12 - 0.08;
  W.arm.rotation.z = -0.08;
  W.cloak.rotation.z = Math.sin(G.phase) * 0.04;
  G.walkerPos.copy(W.root.position);
  W.root.updateMatrixWorld(true);
  W.lamp.getWorldPosition(S.uLantern.value);

  // ambient events so the world is never still
  if (t > G.nextRip) {
    var a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.8;
    addRipple(G, Math.cos(a) * POND_RX * r, Math.sin(a) * POND_RZ * r, 0.7 + Math.random() * 0.5);
    G.nextRip = t + 1.6 + Math.random() * 2.2;
  }
  if (t > G.nextGust) {
    var ga = Math.random() * Math.PI * 2;
    addGust(G, Math.cos(ga) * 26, Math.sin(ga) * 26, 0.9);
    G.nextGust = t + 7 + Math.random() * 6;
  }

  // camera: slow sway in front of the castle, plus whatever the user dragged
  // drag sets a target; the camera eases toward it at a frame-rate
  // independent rate, so a 30 fps phone and a 144 Hz monitor glide alike
  var kd = 1 - Math.exp(-dt * 9);
  G.dragYaw += (G.yawT - G.dragYaw) * kd;
  G.dragPitch += (G.pitchT - G.dragPitch) * kd;
  G.yaw = 0.5 * Math.sin(t * 0.05) + G.dragYaw;
  var pitch = Math.max(0.06, Math.min(1.2, 0.34 + 0.04 * Math.sin(t * 0.07) + G.dragPitch));
  // follow the wanderer, leaning a little toward the pond
  if (!G.camT) G.camT = new THREE.Vector3(wx * 0.7, 0.7, wz * 0.7 - 0.8);
  var kf = 1 - Math.exp(-dt * 2.5);
  G.camT.x += (wx * 0.7 - G.camT.x) * kf;
  G.camT.z += (wz * 0.7 - 0.8 - G.camT.z) * kf;
  var tx = G.camT.x, ty = 0.7, tz = G.camT.z;
  var d = G.dist;
  var cam = G.camera;
  cam.position.set(tx + Math.sin(G.yaw) * Math.cos(pitch) * d, ty + Math.sin(pitch) * d, tz + Math.cos(G.yaw) * Math.cos(pitch) * d);
  var gh = groundH(cam.position.x, cam.position.z) + 0.6;
  if (cam.position.y < gh) cam.position.y = gh;
  cam.lookAt(tx, ty, tz);
  cam.updateMatrixWorld(true);
  G.sky.position.copy(cam.position);
  G.stars.position.copy(cam.position);
}

function kick(G) {
  var R = G.renderer, S = G.shared;
  G.cellMat.uniforms.uView.value.setFromMatrix4(G.camera.matrixWorldInverse);

  S.uPass.value = 0;
  R.setRenderTarget(G.rtCol);
  R.setClearColor(0x000000, 1);
  R.clear();
  R.render(G.scene, G.camera);
  S.uPass.value = 1;
  R.setRenderTarget(G.rtNrm);
  R.setClearColor(0x000000, 0);
  R.clear();
  R.render(G.scene, G.camera);
  S.uPass.value = 0;
  R.setRenderTarget(G.rtCell);
  R.render(G.cellScene, G.cellCam);
  R.setRenderTarget(null);
  R.render(G.glyphScene, G.cellCam);
}

// Once a second, read the cell grid back for the window.__glyphworld probe
// (glyph histogram for automated checks). Nothing on screen depends on it.
function probe(G, t) {
  if (G.pending || t < G.nextProbe || !window.__glyphworld || !G.renderer.readRenderTargetPixelsAsync) return;
  G.nextProbe = t + 1;
  var W = G.W, H = G.H, rt = G.rtCell;
  if (!G.probeBuf || G.probeBuf.length !== W * H * 4) G.probeBuf = new Uint8Array(W * H * 4);
  var buf = G.probeBuf;
  G.pending = true;
  G.renderer.readRenderTargetPixelsAsync(rt, 0, 0, W, H, buf).then(function () {
    G.pending = false;
    if (!G.alive || rt !== G.rtCell || !window.__glyphworld) return;
    var hist = {}, n = 0;
    for (var y = 1; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var gi = buf[(y * W + x) * 4 + 3];
        if (gi === 0 || gi >= GLYPHS.length) continue;
        hist[GLYPHS[gi]] = (hist[GLYPHS[gi]] || 0) + 1;
        n++;
      }
    }
    var P = window.__glyphworld;
    P.hist = hist; P.drawn = n; P.cells = W * H;
    P.cellPx = [state.CHAR_W, state.CHAR_H];
  }, function () { G.pending = false; });
}

function renderGlyphworld() {
  clearCanvas();
  var G = gw;
  if (!G) return;
  var mine = state.currentMode === MODE;
  var t = state.time;
  var dt = Math.min(0.05, Math.max(0, t - G.lastT));
  G.lastT = t;
  sizeTargets(G);

  if (pointer.clicked && mine) {
    pointer.clicked = false;
    G.lastTap = tapAt(G, pointer.gx, pointer.gy);
    G.dragging = false;
  } else if (pointer.down && mine) {
    if (!G.dragging) { G.dragging = true; G.lastGX = pointer.gx; G.lastGY = pointer.gy; }
    // pointer deltas are in cells, which are now small: convert to CSS px
    var dx = (pointer.gx - G.lastGX) * state.CHAR_W, dy = (pointer.gy - G.lastGY) * state.CHAR_H;
    G.yawT -= dx * 0.0045;
    G.pitchT += dy * 0.0035;
    G.pitchT = Math.max(-0.25, Math.min(0.9, G.pitchT));
    G.lastGX = pointer.gx; G.lastGY = pointer.gy;
  } else {
    G.dragging = false;
  }

  updateWorld(G, t, dt);
  kick(G);
  probe(G, t);
  if (window.__glyphworld) window.__glyphworld.lastTap = G.lastTap || null;

  var W = state.COLS, H = state.ROWS;
  var label = '[glyphworld] drag:orbit  tap:ripple/gust';
  if (W < 50) label = '[glyphworld] drag tap';
  var lx = Math.max(0, W - label.length - 1);
  for (var c = Math.max(0, lx - 1); c < W; c++) drawCharHSL(' ', c, H - 1, 0, 0, 3);
  for (var li = 0; li < label.length && lx + li < W; li++) {
    drawCharHSL(label[li], lx + li, H - 1, 0, 0, 50);
  }
}

registerMode(MODE, { init: initGlyphworld, render: renderGlyphworld, cleanup: cleanupGlyphworld });
