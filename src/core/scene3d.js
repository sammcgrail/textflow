// scene3d.js: a small software 3D pipeline that renders to the character grid.
//
//   camera      perspective, orbit (target, yaw, pitch, dist, fov) + screen shift
//   meshes      MeshBuilder primitives (ellipsoid / superquadric box, tube, lathe,
//               sheet) -> typed-array Mesh; per-group rigid matrices (bones),
//               per-group grow(0..1) that assembles triangles from a scatter
//   points      point-cloud splats (sphere impostors) into the same G-buffer
//   G-buffer    per-cell z (1/z), normal, albedo, material, world y
//   shading     Lambert + hemisphere ambient + rim + Blinn specular, per material,
//               luminance -> glyph ramp, cool shadow tint -> lit albedo -> white
//   layers      solid (lit mesh/points), glow (bright cells bloom into a blurred
//               buffer that tints neighbours and fills empty cells with faint
//               glyphs), marks (depth-tested glyphs: particles, grass, text,
//               lines), bg (stars, only where nothing else is)
//   helpers     createStages (grow(name) timing), sampleSurface (points that
//               assemble from scatter), paletteWave / mixWave (white-hot band
//               sweeping along a body coordinate with the new palette behind it),
//               createParticles (drips, splashes, sparks, petals), createRipples
//
// Order per frame: s3.begin(cam) -> drawMesh/drawPoints -> shade() -> marks
// (mark/markWorld/textWorld/lineWorld/drawParticles/drawRipples/bg) -> present().
// Marks are depth-tested at write time against the solid layer, so draw them
// after shade(). Everything is typed arrays; no allocation inside the loops.

import { drawChar } from './draw.js';
import { state } from './state.js';

export var TAU = Math.PI * 2;
export var RAMP_SOLID = ' .:-=+*%#@';
export var RAMP_SOFT = ' .,:;=+*o0O@';

var CHS = [];
export function chr(c) { return CHS[c] || (CHS[c] = String.fromCharCode(c)); }
export function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
export function smooth(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
export function easeOut(v) { v = clamp01(v); return 1 - (1 - v) * (1 - v) * (1 - v); }
export function hash1(n) { var s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
export function hash2(x, y) { var s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
export function per(t, T) { return TAU * t / T; }
function spow(v, e) { return v < 0 ? -Math.pow(-v, e) : Math.pow(v, e); }

// ---------------------------------------------------------------------------
// small vector / matrix helpers (3x4 affine: [r00 r01 r02 r10 r11 r12 r20 r21 r22 tx ty tz])
// ---------------------------------------------------------------------------
export function norm3(v) { var l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
export function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
export function mat34() { return new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]); }
// rotation about axis (unit) by angle, around pivot p, written into m
export function matRotAbout(m, axis, ang, p) {
  var x = axis[0], y = axis[1], z = axis[2], c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  m[0] = t * x * x + c; m[1] = t * x * y - s * z; m[2] = t * x * z + s * y;
  m[3] = t * x * y + s * z; m[4] = t * y * y + c; m[5] = t * y * z - s * x;
  m[6] = t * x * z - s * y; m[7] = t * y * z + s * x; m[8] = t * z * z + c;
  p = p || [0, 0, 0];
  m[9] = p[0] - (m[0] * p[0] + m[1] * p[1] + m[2] * p[2]);
  m[10] = p[1] - (m[3] * p[0] + m[4] * p[1] + m[5] * p[2]);
  m[11] = p[2] - (m[6] * p[0] + m[7] * p[1] + m[8] * p[2]);
  return m;
}
export function matYaw(m, ang, tx, ty, tz) {
  var c = Math.cos(ang), s = Math.sin(ang);
  m[0] = c; m[1] = 0; m[2] = s; m[3] = 0; m[4] = 1; m[5] = 0; m[6] = -s; m[7] = 0; m[8] = c;
  m[9] = tx || 0; m[10] = ty || 0; m[11] = tz || 0;
  return m;
}
export function xformPoint(m, p, out) {
  var x = p[0], y = p[1], z = p[2];
  out[0] = m[0] * x + m[1] * y + m[2] * z + m[9];
  out[1] = m[3] * x + m[4] * y + m[5] * z + m[10];
  out[2] = m[6] * x + m[7] * y + m[8] * z + m[11];
  return out;
}
// basis whose Y axis points along dir (for limbs/blades), returned as [ax, ay, az]
export function basisAlong(dir, hint) {
  var y = norm3(dir);
  hint = hint || (Math.abs(y[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]);
  var x = norm3(cross3(hint, y));
  var z = cross3(x, y);
  return [x, y, z];
}

// ---------------------------------------------------------------------------
// MeshBuilder
// ---------------------------------------------------------------------------
export function MeshBuilder() {
  this.P = []; this.N = []; this.C = []; this.VG = []; this.I = []; this.TM = []; this.TF = [];
  this.groups = {}; this.groupNames = []; this.sheets = [];
}
MeshBuilder.prototype.group = function (name) {
  if (!(name in this.groups)) { this.groups[name] = this.groupNames.length; this.groupNames.push(name); }
  return this.groups[name];
};
// generic parametric grid. fn(u, v, out[3]); o: {col:[r,g,b] or fn(u,v,out), mat, group,
// wrapU, closed (fix orientation), twoSided, nu, nv}
MeshBuilder.prototype.grid = function (fn, nu, nv, o) {
  o = o || {};
  var base = this.P.length / 3, triBase = this.I.length / 3;
  var cu = o.wrapU ? nu : nu + 1, cv = nv + 1, tmp = [0, 0, 0], col = [200, 200, 200];
  var g = this.group(o.group || 'main');
  for (var j = 0; j < cv; j++) {
    for (var i = 0; i < cu; i++) {
      fn(i / nu, j / nv, tmp);
      this.P.push(tmp[0], tmp[1], tmp[2]); this.N.push(0, 0, 0);
      if (typeof o.col === 'function') o.col(i / nu, j / nv, col); else if (o.col) { col = o.col; }
      this.C.push(col[0] / 255, col[1] / 255, col[2] / 255);
      this.VG.push(g);
    }
  }
  for (j = 0; j < nv; j++) {
    for (i = 0; i < nu; i++) {
      var a = base + j * cu + i, b = base + j * cu + (o.wrapU ? (i + 1) % nu : i + 1);
      var c = a + cu, d = b + cu;
      this.I.push(a, b, d, a, d, c);
      this.TM.push(o.mat || 0, o.mat || 0);
      this.TF.push(o.twoSided ? 1 : 0, o.twoSided ? 1 : 0);
    }
  }
  this._normals(base, this.P.length / 3, triBase, this.I.length / 3, !!o.closed);
  var h = { fn: fn, nu: nu, nv: nv, cu: cu, cv: cv, base: base, count: cu * cv, t0: triBase, t1: this.I.length / 3 };
  if (o.sheet) { this.sheets.push(h); return this.sheets.length - 1; }
  return h;
};
MeshBuilder.prototype._normals = function (v0, v1, t0, t1, closed) {
  var P = this.P, N = this.N, I = this.I;
  accumulateNormals(P, N, I, v0, v1, t0, t1);
  if (closed) {
    var cx = 0, cy = 0, cz = 0, n = v1 - v0;
    for (var v = v0; v < v1; v++) { cx += P[v * 3]; cy += P[v * 3 + 1]; cz += P[v * 3 + 2]; }
    cx /= n; cy /= n; cz /= n;
    var s = 0;
    for (v = v0; v < v1; v++) s += N[v * 3] * (P[v * 3] - cx) + N[v * 3 + 1] * (P[v * 3 + 1] - cy) + N[v * 3 + 2] * (P[v * 3 + 2] - cz);
    if (s < 0) for (v = v0 * 3; v < v1 * 3; v++) N[v] = -N[v];
  }
};
function accumulateNormals(P, N, I, v0, v1, t0, t1) {
  for (var v = v0 * 3; v < v1 * 3; v++) N[v] = 0;
  for (var t = t0; t < t1; t++) {
    var a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    var ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    var wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
    N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
    N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
  }
  for (v = v0; v < v1; v++) {
    var l = Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1;
    N[v * 3] /= l; N[v * 3 + 1] /= l; N[v * 3 + 2] /= l;
  }
}
function applyBasis(c, B, x, y, z, out) {
  if (!B) { out[0] = c[0] + x; out[1] = c[1] + y; out[2] = c[2] + z; return; }
  out[0] = c[0] + B[0][0] * x + B[1][0] * y + B[2][0] * z;
  out[1] = c[1] + B[0][1] * x + B[1][1] * y + B[2][1] * z;
  out[2] = c[2] + B[0][2] * x + B[1][2] * y + B[2][2] * z;
}
// superquadric: e = 1 ellipsoid, e -> 0.2 a bevelled box. r = [rx, ry, rz] along basis axes
MeshBuilder.prototype.ellipsoid = function (c, r, B, o) {
  o = o || {};
  var e1 = o.e1 || o.e || 1, e2 = o.e2 || o.e || 1;
  var fn = function (u, v, out) {
    var th = -Math.PI / 2 + v * Math.PI, ph = u * TAU;
    if (o.half && v < 0.5) th = 0;  // open dome (pauldron) by collapsing lower half onto the rim
    var ct = Math.cos(th), st = Math.sin(th);
    var x = r[0] * spow(ct, e1) * spow(Math.cos(ph), e2);
    var y = r[1] * spow(st, e1);
    var z = r[2] * spow(ct, e1) * spow(Math.sin(ph), e2);
    applyBasis(c, B, x, y, z, out);
  };
  return this.grid(fn, o.nu || 18, o.nv || 12, Object.assign({ wrapU: true, closed: true }, o));
};
MeshBuilder.prototype.box = function (c, half, B, o) {
  o = Object.assign({ e: 0.22, nu: 16, nv: 10 }, o || {});
  return this.ellipsoid(c, half, B, o);
};
// tube along a polyline with per-point radius, capped. o.segs ring resolution
MeshBuilder.prototype.tube = function (pts, radii, o) {
  o = o || {};
  var segs = o.segs || 10, n = pts.length;
  var rings = [], rad = [], tang = [];
  for (var i = 0; i < n; i++) {
    var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    tang.push(norm3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]));
  }
  var t0 = tang[0], t1 = tang[n - 1], r0 = radii[0], r1 = radii[n - 1];
  var cap = o.cap === undefined ? 1 : o.cap;
  if (cap) {
    rings.push([pts[0][0] - t0[0] * r0 * 0.9 * cap, pts[0][1] - t0[1] * r0 * 0.9 * cap, pts[0][2] - t0[2] * r0 * 0.9 * cap]); rad.push(0);
    rings.push([pts[0][0] - t0[0] * r0 * 0.6 * cap, pts[0][1] - t0[1] * r0 * 0.6 * cap, pts[0][2] - t0[2] * r0 * 0.6 * cap]); rad.push(r0 * 0.78);
  }
  for (i = 0; i < n; i++) { rings.push(pts[i]); rad.push(radii[i]); }
  if (cap) {
    rings.push([pts[n - 1][0] + t1[0] * r1 * 0.6 * cap, pts[n - 1][1] + t1[1] * r1 * 0.6 * cap, pts[n - 1][2] + t1[2] * r1 * 0.6 * cap]); rad.push(r1 * 0.78);
    rings.push([pts[n - 1][0] + t1[0] * r1 * 0.9 * cap, pts[n - 1][1] + t1[1] * r1 * 0.9 * cap, pts[n - 1][2] + t1[2] * r1 * 0.9 * cap]); rad.push(0);
  }
  // parallel-transport frames
  var m = rings.length, fx = [], fz = [];
  var tt = [];
  for (i = 0; i < m; i++) {
    var pa = rings[Math.max(0, i - 1)], pb = rings[Math.min(m - 1, i + 1)];
    tt.push(norm3([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]]));
  }
  var ref = Math.abs(tt[0][1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  var x = norm3(cross3(ref, tt[0]));
  for (i = 0; i < m; i++) {
    var t = tt[i];
    var d = x[0] * t[0] + x[1] * t[1] + x[2] * t[2];
    x = norm3([x[0] - d * t[0], x[1] - d * t[1], x[2] - d * t[2]]);
    fx.push(x); fz.push(cross3(t, x));
  }
  var sq = o.square || 0;
  var fn = function (u, v, out) {
    var k = Math.round(v * (m - 1)), ph = u * TAU, rr = rad[k];
    var cph = Math.cos(ph), sph = Math.sin(ph);
    if (sq) { cph = spow(cph, 1 - sq); sph = spow(sph, 1 - sq); }
    var ax = rr * cph * (o.sx || 1), az = rr * sph * (o.sz || 1);
    var p = rings[k];
    out[0] = p[0] + fx[k][0] * ax + fz[k][0] * az;
    out[1] = p[1] + fx[k][1] * ax + fz[k][1] * az;
    out[2] = p[2] + fx[k][2] * ax + fz[k][2] * az;
  };
  return this.grid(fn, segs, m - 1, Object.assign({ wrapU: true, closed: true }, o));
};
// lathe: profile [[r, y], ...] around basis Y at c
MeshBuilder.prototype.lathe = function (profile, c, B, o) {
  o = o || {};
  var m = profile.length;
  var fn = function (u, v, out) {
    var k = Math.round(v * (m - 1)), ph = u * TAU, r = profile[k][0];
    applyBasis(c, B, r * Math.cos(ph) * (o.sx || 1), profile[k][1], r * Math.sin(ph) * (o.sz || 1), out);
  };
  return this.grid(fn, o.segs || 16, m - 1, Object.assign({ wrapU: true, closed: true }, o));
};
// two-sided parametric sheet (cloth, capes, banners): returns a handle for updateSheet
MeshBuilder.prototype.sheet = function (fn, nu, nv, o) {
  return this.grid(fn, nu, nv, Object.assign({ twoSided: true, sheet: true }, o || {}));
};
MeshBuilder.prototype.build = function () {
  var nv = this.P.length / 3, nt = this.I.length / 3;
  var tg = new Uint8Array(nt);
  for (var t = 0; t < nt; t++) tg[t] = this.VG[this.I[t * 3]];
  return {
    nv: nv, nt: nt,
    pos: new Float32Array(this.P), nrm: new Float32Array(this.N), col: new Float32Array(this.C),
    vg: new Uint8Array(this.VG), idx: new Uint32Array(this.I),
    tmat: new Uint8Array(this.TM), tflag: new Uint8Array(this.TF), tgrp: tg,
    groups: this.groups, groupNames: this.groupNames, sheets: this.sheets,
    wp: new Float32Array(nv * 3), wn: new Float32Array(nv * 3),
    sx: new Float32Array(nv), sy: new Float32Array(nv), iz: new Float32Array(nv),
  };
};
// ---------------------------------------------------------------------------
// baked meshes: a scanned / generated model shipped as a small binary buffer
// ---------------------------------------------------------------------------
// decode a base64 string to bytes (browser atob, or Buffer under node)
export function b64bytes(s) {
  if (typeof atob === 'function') {
    var bin = atob(s), n = bin.length, out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(s, 'base64'));
}
// Build a drawable mesh (same shape as MeshBuilder.build()) from plain arrays:
//   o.pos  Float32Array nv*3 (metres)   o.idx  Uint16/Uint32Array nt*3
//   o.col  Float32Array nv*3 (0..1) or Uint8Array nv*3 (0..255)
//   o.vmat Uint8Array nv (material per vertex; a triangle takes its first vertex's)
//   o.vgrp Uint8Array nv (group per vertex)   o.groupNames ['body', 'sword', ...]
// Normals are area-weighted smooth normals; o.flip reverses them (inward winding).
export function meshFromArrays(o) {
  var nv = o.pos.length / 3, nt = o.idx.length / 3, i;
  var col = o.col instanceof Float32Array ? o.col : new Float32Array(nv * 3);
  if (!(o.col instanceof Float32Array)) for (i = 0; i < nv * 3; i++) col[i] = o.col[i] / 255;
  var vg = o.vgrp || new Uint8Array(nv), vm = o.vmat || new Uint8Array(nv);
  var idx = o.idx instanceof Uint32Array ? o.idx : new Uint32Array(o.idx);
  var nrm = new Float32Array(nv * 3);
  accumulateNormals(o.pos, nrm, idx, 0, nv, 0, nt);
  if (o.flip) for (i = 0; i < nv * 3; i++) nrm[i] = -nrm[i];
  var tm = new Uint8Array(nt), tg = new Uint8Array(nt);
  for (var t = 0; t < nt; t++) { var a = idx[t * 3]; tm[t] = vm[a]; tg[t] = vg[a]; }
  var names = o.groupNames || ['main'], groups = {};
  for (i = 0; i < names.length; i++) groups[names[i]] = i;
  return {
    nv: nv, nt: nt, pos: o.pos, nrm: nrm, col: col, vg: vg, idx: idx,
    tmat: tm, tflag: new Uint8Array(nt), tgrp: tg, groups: groups, groupNames: names, sheets: [],
    wp: new Float32Array(nv * 3), wn: new Float32Array(nv * 3),
    sx: new Float32Array(nv), sy: new Float32Array(nv), iz: new Float32Array(nv),
  };
}
// blur vertex normals over the triangle graph (iters passes): a dense scanned surface has
// more wrinkles than a character cell can show, and per-cell normal noise reads as glyph noise
export function smoothNormals(mesh, iters, keep) {
  var N = mesh.nrm, I = mesh.idx, nv = mesh.nv, nt = mesh.nt, A = new Float32Array(nv * 3), k = keep === undefined ? 0.5 : keep;
  for (var it = 0; it < iters; it++) {
    for (var v = 0; v < nv * 3; v++) A[v] = N[v] * k;
    for (var t = 0; t < nt; t++) {
      var a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
      for (var q = 0; q < 3; q++) { var s = N[a + q] + N[b + q] + N[c + q]; A[a + q] += s; A[b + q] += s; A[c + q] += s; }
    }
    for (v = 0; v < nv; v++) {
      var l = Math.hypot(A[v * 3], A[v * 3 + 1], A[v * 3 + 2]) || 1;
      N[v * 3] = A[v * 3] / l; N[v * 3 + 1] = A[v * 3 + 1] / l; N[v * 3 + 2] = A[v * 3 + 2] / l;
    }
  }
  return mesh;
}
// recompute smooth normals for a vertex range after moving vertices (cloth sway on a baked mesh)
export function refreshNormals(mesh, t0, t1, v0, v1) {
  accumulateNormals(mesh.pos, mesh.nrm, mesh.idx, v0 || 0, v1 === undefined ? mesh.nv : v1, t0 || 0, t1 === undefined ? mesh.nt : t1);
}

// re-evaluate a sheet's positions (e.g. a cloak in the wind) and its normals
export function updateSheet(mesh, h, fn) {
  var s = mesh.sheets[h], tmp = [0, 0, 0], P = mesh.pos;
  fn = fn || s.fn;
  for (var j = 0; j < s.cv; j++) {
    for (var i = 0; i < s.cu; i++) {
      fn(i / s.nu, j / s.nv, tmp);
      var k = (s.base + j * s.cu + i) * 3;
      P[k] = tmp[0]; P[k + 1] = tmp[1]; P[k + 2] = tmp[2];
    }
  }
  accumulateNormals(P, mesh.nrm, mesh.idx, s.base, s.base + s.count, s.t0, s.t1);
}
// area-weighted surface samples -> point cloud {n, pos, nrm, col, grp, seed}
export function sampleSurface(mesh, count) {
  var nt = mesh.nt, I = mesh.idx, P = mesh.pos, area = new Float32Array(nt), tot = 0;
  for (var t = 0; t < nt; t++) {
    var a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
    var ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    var wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
    tot += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) * 0.5;
    area[t] = tot;
  }
  var out = { n: count, pos: new Float32Array(count * 3), nrm: new Float32Array(count * 3), col: new Float32Array(count * 3),
    grp: new Uint8Array(count), mat: new Uint8Array(count), seed: new Float32Array(count) };
  for (var i = 0; i < count; i++) {
    var r = hash1(i * 3.7 + 1.3) * tot, lo = 0, hi = nt - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (area[mid] < r) lo = mid + 1; else hi = mid; }
    var ta = I[lo * 3], tb = I[lo * 3 + 1], tc = I[lo * 3 + 2];
    var r1 = Math.sqrt(hash1(i * 9.1 + 4.2)), r2 = hash1(i * 5.3 + 7.7);
    var wa = 1 - r1, wb = r1 * (1 - r2), wc = r1 * r2;
    for (var q = 0; q < 3; q++) {
      out.pos[i * 3 + q] = P[ta * 3 + q] * wa + P[tb * 3 + q] * wb + P[tc * 3 + q] * wc;
      out.nrm[i * 3 + q] = mesh.nrm[ta * 3 + q] * wa + mesh.nrm[tb * 3 + q] * wb + mesh.nrm[tc * 3 + q] * wc;
      out.col[i * 3 + q] = mesh.col[ta * 3 + q];
    }
    out.grp[i] = mesh.tgrp[lo]; out.mat[i] = mesh.tmat[lo]; out.seed[i] = hash1(i * 1.37 + 0.5);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Scene3D
// ---------------------------------------------------------------------------
var DEFAULT_MAT = { kd: 1, ks: 0.35, shin: 24, rim: 0.35, amb: 1, dark: [30, 40, 80], ramp: RAMP_SOLID,
  glowAt: 0.92, glow: 0.5, gamma: 1, minLum: 0.04, emit: 0, expo: 1.5 };

export function Scene3D() {
  this.W = 0; this.H = 0; this.n = 0;
  this.cam = { target: [0, 0, 0], yaw: 0, pitch: 0, dist: 5, fov: 0.6, shiftX: 0, shiftY: 0 };
  this.eye = [0, 0, 0]; this.fwd = [0, 0, -1]; this.right = [1, 0, 0]; this.up = [0, 1, 0];
  // key light (dir), optional fill light (fillDir, fill), hemisphere ambient, rim tint
  this.light = { dir: norm3([-0.5, 0.7, 0.5]), amb: 0.16, fillDir: norm3([0.7, 0.2, -0.3]), fill: 0, rimCol: [0.55, 0.7, 1], specCol: [1, 1, 1] };
  this.mats = [];
  this.bloom = 0.9; this.glowFill = 1;
  this.wave = null;
  // screen-space part separation: a neighbour nearer by > dist darkens the cell (contact
  // shadow / crease), a farther or empty neighbour brightens it (silhouette rim)
  this.edge = { dist: 0.05, dark: 0.16, sil: 0.12 };
  this.grain = 0.05;
  this.stats = { tris: 0, cells: 0, ms: 0, ema: 0 };
  this.budget = 14; this.quality = 1;
}
Scene3D.prototype.material = function (id, m) { this.mats[id] = Object.assign({}, DEFAULT_MAT, m); return this; };
Scene3D.prototype.resize = function () {
  var W = state.COLS, H = state.ROWS;
  if (W === this.W && H === this.H && this.cw === state.CHAR_W) return false;
  this.W = W; this.H = H; this.n = W * H; this.cw = state.CHAR_W; this.chh = state.CHAR_H;
  var n = this.n;
  this.depth = new Float32Array(n); this.nx = new Float32Array(n); this.ny = new Float32Array(n); this.nz = new Float32Array(n);
  this.ar = new Float32Array(n); this.ag = new Float32Array(n); this.ab = new Float32Array(n);
  this.mat = new Uint8Array(n); this.wy = new Float32Array(n); this.gid = new Uint8Array(n);
  this.sch = new Uint16Array(n); this.sr = new Float32Array(n); this.sg = new Float32Array(n); this.sb = new Float32Array(n); this.sl = new Float32Array(n);
  this.mch = new Uint16Array(n); this.mr = new Float32Array(n); this.mg = new Float32Array(n); this.mb = new Float32Array(n);
  this.ma = new Float32Array(n); this.mz = new Float32Array(n);
  this.bch = new Uint16Array(n); this.br = new Float32Array(n); this.bgc = new Float32Array(n); this.bb = new Float32Array(n); this.ba = new Float32Array(n);
  this.gr = new Float32Array(n); this.gg = new Float32Array(n); this.gb = new Float32Array(n); this.tmp = new Float32Array(n);
  return true;
};
Scene3D.prototype.begin = function (cam) {
  this._t0 = performance.now();
  this.resize();
  if (cam) this.cam = cam;
  var c = this.cam, cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  var e = this.eye, T = c.target;
  e[0] = T[0] + c.dist * cp * Math.sin(c.yaw); e[1] = T[1] + c.dist * sp; e[2] = T[2] + c.dist * cp * Math.cos(c.yaw);
  var f = norm3([T[0] - e[0], T[1] - e[1], T[2] - e[2]]);
  var r = norm3(cross3(f, [0, 1, 0]));
  var u = cross3(r, f);
  this.fwd = f; this.right = r; this.up = u;
  var hpx = this.H * this.chh;
  this.fpx = 0.5 * hpx / Math.tan(c.fov * 0.5);
  this.fc = this.fpx / this.cw; this.fr = this.fpx / this.chh;
  this.cx = this.W * (0.5 + (c.shiftX || 0)); this.cy = this.H * (0.5 + (c.shiftY || 0));
  this.depth.fill(0); this.mch.fill(0); this.bch.fill(0); this.mz.fill(0);
  this.gr.fill(0); this.gg.fill(0); this.gb.fill(0);
  this.stats.tris = 0;
};
// project world point -> this._p = [sx, sy, iz]; returns false when behind the camera
Scene3D.prototype.project = function (x, y, z, out) {
  var e = this.eye, dx = x - e[0], dy = y - e[1], dz = z - e[2];
  var zv = dx * this.fwd[0] + dy * this.fwd[1] + dz * this.fwd[2];
  if (zv < 0.05) return false;
  var xv = dx * this.right[0] + dy * this.right[1] + dz * this.right[2];
  var yv = dx * this.up[0] + dy * this.up[1] + dz * this.up[2];
  var iz = 1 / zv;
  out[0] = this.cx + xv * iz * this.fc; out[1] = this.cy - yv * iz * this.fr; out[2] = iz;
  return true;
};
// direction at infinity (stars) -> cell coords
Scene3D.prototype.projectDir = function (dx, dy, dz, out) {
  var zv = dx * this.fwd[0] + dy * this.fwd[1] + dz * this.fwd[2];
  if (zv < 0.05) return false;
  var xv = dx * this.right[0] + dy * this.right[1] + dz * this.right[2];
  var yv = dx * this.up[0] + dy * this.up[1] + dz * this.up[2];
  out[0] = this.cx + xv / zv * this.fc; out[1] = this.cy - yv / zv * this.fr; out[2] = 0;
  return true;
};
// world-space ray for a cell centre -> out [dx,dy,dz]
Scene3D.prototype.ray = function (ix, iy, out) {
  var a = (ix + 0.5 - this.cx) / this.fc, b = -(iy + 0.5 - this.cy) / this.fr;
  var f = this.fwd, r = this.right, u = this.up;
  out[0] = f[0] + r[0] * a + u[0] * b; out[1] = f[1] + r[1] * a + u[1] * b; out[2] = f[2] + r[2] * a + u[2] * b;
  return out;
};
// ray-cast a cell onto the plane y = py; out = [wx, wz, iz, dist]; false if it misses
Scene3D.prototype.groundHit = function (ix, iy, py, out) {
  var d = this.ray(ix, iy, this._rd || (this._rd = [0, 0, 0]));
  if (d[1] > -1e-4) return false;
  var t = (py - this.eye[1]) / d[1];  // in units of the un-normalised ray, whose fwd component is 1
  out[0] = this.eye[0] + d[0] * t; out[1] = this.eye[2] + d[2] * t; out[2] = 1 / t;
  out[3] = t * Math.hypot(d[0], d[1], d[2]);
  return true;
};
Scene3D.prototype.hit = function (ix, iy) {
  ix = ix | 0; iy = iy | 0;
  if (ix < 0 || iy < 0 || ix >= this.W || iy >= this.H) return -1;
  var ci = iy * this.W + ix;
  return this.depth[ci] > 0 ? this.gid[ci] : -1;
};

// ---- triangles --------------------------------------------------------------
var _p0 = [0, 0, 0], _p1 = [0, 0, 0], _p2 = [0, 0, 0], _w = [0, 0, 0];
// o: {model: mat34, groupMat: [mat34|null per group], grow: Float32Array/array per group, scatter: metres}
Scene3D.prototype.drawMesh = function (mesh, o) {
  o = o || {};
  var M = o.model, GM = o.groupMat, grow = o.grow;
  var P = mesh.pos, N = mesh.nrm, WP = mesh.wp, WN = mesh.wn, VG = mesh.vg;
  var SX = mesh.sx, SY = mesh.sy, IZ = mesh.iz;
  for (var v = 0; v < mesh.nv; v++) {
    var k = v * 3, x = P[k], y = P[k + 1], z = P[k + 2], nx = N[k], ny = N[k + 1], nz = N[k + 2];
    var g = GM && GM[VG[v]];
    if (g) {
      var x2 = g[0] * x + g[1] * y + g[2] * z + g[9], y2 = g[3] * x + g[4] * y + g[5] * z + g[10], z2 = g[6] * x + g[7] * y + g[8] * z + g[11];
      x = x2; y = y2; z = z2;
      x2 = g[0] * nx + g[1] * ny + g[2] * nz; y2 = g[3] * nx + g[4] * ny + g[5] * nz; z2 = g[6] * nx + g[7] * ny + g[8] * nz;
      nx = x2; ny = y2; nz = z2;
    }
    if (M) {
      var x3 = M[0] * x + M[1] * y + M[2] * z + M[9], y3 = M[3] * x + M[4] * y + M[5] * z + M[10], z3 = M[6] * x + M[7] * y + M[8] * z + M[11];
      x = x3; y = y3; z = z3;
      x3 = M[0] * nx + M[1] * ny + M[2] * nz; y3 = M[3] * nx + M[4] * ny + M[5] * nz; z3 = M[6] * nx + M[7] * ny + M[8] * nz;
      nx = x3; ny = y3; nz = z3;
    }
    WP[k] = x; WP[k + 1] = y; WP[k + 2] = z; WN[k] = nx; WN[k + 1] = ny; WN[k + 2] = nz;
    if (this.project(x, y, z, _w)) { SX[v] = _w[0]; SY[v] = _w[1]; IZ[v] = _w[2]; } else IZ[v] = -1;
  }
  var I = mesh.idx, TF = mesh.tflag, TG = mesh.tgrp, TM = mesh.tmat, e = this.eye;
  var scat = o.scatter || 1.5;
  for (var t = 0; t < mesh.nt; t++) {
    var gk = grow ? grow[TG[t]] : 1;
    if (gk !== undefined && gk <= 0) continue;
    var a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
    if (!(TF[t] & 1)) {
      var cx = WN[a * 3] + WN[b * 3] + WN[c * 3], cy = WN[a * 3 + 1] + WN[b * 3 + 1] + WN[c * 3 + 1], cz = WN[a * 3 + 2] + WN[b * 3 + 2] + WN[c * 3 + 2];
      if (cx * (WP[a * 3] - e[0]) + cy * (WP[a * 3 + 1] - e[1]) + cz * (WP[a * 3 + 2] - e[2]) > 0) continue;
    }
    if (gk !== undefined && gk < 1) {
      // assemble from scatter: each triangle arrives on its own schedule
      var h = hash1(t * 0.731 + 0.17), q = clamp01((gk - h * 0.55) / 0.45);
      if (q <= 0) continue;
      var off = (1 - q) * (1 - q) * scat;
      var ox = (hash1(t * 1.3 + 2) - 0.5) * 2 * off, oy = (hash1(t * 2.1 + 5) - 0.2) * off, oz = (hash1(t * 3.7 + 9) - 0.5) * 2 * off;
      if (!this.project(WP[a * 3] + ox, WP[a * 3 + 1] + oy, WP[a * 3 + 2] + oz, _p0)) continue;
      if (!this.project(WP[b * 3] + ox, WP[b * 3 + 1] + oy, WP[b * 3 + 2] + oz, _p1)) continue;
      if (!this.project(WP[c * 3] + ox, WP[c * 3 + 1] + oy, WP[c * 3 + 2] + oz, _p2)) continue;
      this._tri(mesh, a, b, c, _p0[0], _p0[1], _p0[2], _p1[0], _p1[1], _p1[2], _p2[0], _p2[1], _p2[2], TM[t], TG[t]);
      continue;
    }
    if (IZ[a] < 0 || IZ[b] < 0 || IZ[c] < 0) continue;
    this._tri(mesh, a, b, c, SX[a], SY[a], IZ[a], SX[b], SY[b], IZ[b], SX[c], SY[c], IZ[c], TM[t], TG[t]);
  }
};
Scene3D.prototype._tri = function (mesh, a, b, c, x0, y0, z0, x1, y1, z1, x2, y2, z2, mat, gid) {
  var W = this.W, H = this.H;
  var minX = Math.max(0, Math.floor(Math.min(x0, x1, x2) - 0.5) + 0), maxX = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2) - 0.5));
  var minY = Math.max(0, Math.floor(Math.min(y0, y1, y2) - 0.5) + 0), maxY = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2) - 0.5));
  if (minX > maxX || minY > maxY) return;
  var area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
  if (area > -1e-9 && area < 1e-9) return;
  var ia = 1 / area;
  this.stats.tris++;
  var WN = mesh.wn, WP = mesh.wp, C = mesh.col, D = this.depth;
  var a3 = a * 3, b3 = b * 3, c3 = c * 3;
  for (var py = minY; py <= maxY; py++) {
    var cy = py + 0.5;
    for (var px = minX; px <= maxX; px++) {
      var cx = px + 0.5;
      var w0 = ((x1 - cx) * (y2 - cy) - (x2 - cx) * (y1 - cy)) * ia;
      var w1 = ((x2 - cx) * (y0 - cy) - (x0 - cx) * (y2 - cy)) * ia;
      var w2 = 1 - w0 - w1;
      if (w0 < -1e-5 || w1 < -1e-5 || w2 < -1e-5) continue;
      var iz = w0 * z0 + w1 * z1 + w2 * z2;
      var ci = py * W + px;
      if (iz <= D[ci]) continue;
      D[ci] = iz;
      this.nx[ci] = w0 * WN[a3] + w1 * WN[b3] + w2 * WN[c3];
      this.ny[ci] = w0 * WN[a3 + 1] + w1 * WN[b3 + 1] + w2 * WN[c3 + 1];
      this.nz[ci] = w0 * WN[a3 + 2] + w1 * WN[b3 + 2] + w2 * WN[c3 + 2];
      this.ar[ci] = w0 * C[a3] + w1 * C[b3] + w2 * C[c3];
      this.ag[ci] = w0 * C[a3 + 1] + w1 * C[b3 + 1] + w2 * C[c3 + 1];
      this.ab[ci] = w0 * C[a3 + 2] + w1 * C[b3 + 2] + w2 * C[c3 + 2];
      this.wy[ci] = w0 * WP[a3 + 1] + w1 * WP[b3 + 1] + w2 * WP[c3 + 1];
      this.mat[ci] = mat; this.gid[ci] = gid;
    }
  }
};

// ---- point cloud splats -------------------------------------------------------
// pts: {n, pos, nrm?, col, mat?, grp?, seed?}; o: {model, size (metres), mat, gid, grow (0..1 assembles from scatter), scatter}
Scene3D.prototype.drawPoints = function (pts, o) {
  o = o || {};
  var M = o.model, size = o.size || 0.02, P = pts.pos, NR = pts.nrm, C = pts.col;
  var k = o.grow === undefined ? 1 : o.grow, scat = o.scatter || 1.5, W = this.W, H = this.H, D = this.depth;
  var fw = this.fwd, rt = this.right, up = this.up;
  for (var i = 0; i < pts.n; i++) {
    var s = pts.seed ? pts.seed[i] : hash1(i), q = clamp01((k - s * 0.55) / 0.45);
    if (q <= 0) continue;
    var x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    if (M) { var x2 = M[0] * x + M[1] * y + M[2] * z + M[9], y2 = M[3] * x + M[4] * y + M[5] * z + M[10]; z = M[6] * x + M[7] * y + M[8] * z + M[11]; x = x2; y = y2; }
    if (q < 1) {
      var off = (1 - q) * (1 - q) * scat;
      x += (hash1(i * 1.3 + 2) - 0.5) * 2 * off; y += (hash1(i * 2.1 + 5) - 0.2) * off; z += (hash1(i * 3.7 + 9) - 0.5) * 2 * off;
    }
    if (!this.project(x, y, z, _w)) continue;
    var nx, ny, nz;
    if (NR) {
      nx = NR[i * 3]; ny = NR[i * 3 + 1]; nz = NR[i * 3 + 2];
      if (M) { var a1 = M[0] * nx + M[1] * ny + M[2] * nz, a2 = M[3] * nx + M[4] * ny + M[5] * nz; nz = M[6] * nx + M[7] * ny + M[8] * nz; nx = a1; ny = a2; }
    }
    var rc = Math.max(0.5, size * this.fpx * _w[2] / this.cw), rr = Math.max(0.5, size * this.fpx * _w[2] / this.chh);
    var x0 = Math.max(0, Math.floor(_w[0] - rc)), x1 = Math.min(W - 1, Math.floor(_w[0] + rc));
    var y0 = Math.max(0, Math.floor(_w[1] - rr)), y1 = Math.min(H - 1, Math.floor(_w[1] + rr));
    for (var py = y0; py <= y1; py++) {
      for (var px = x0; px <= x1; px++) {
        var dx = (px + 0.5 - _w[0]) / rc, dy = (py + 0.5 - _w[1]) / rr, d2 = dx * dx + dy * dy;
        if (d2 > 1 && !(px === (_w[0] | 0) && py === (_w[1] | 0))) continue;
        var ci = py * W + px, dz = Math.sqrt(Math.max(0, 1 - d2));
        var iz = _w[2] * (1 + dz * size * _w[2]);
        if (iz <= D[ci]) continue;
        D[ci] = iz;
        if (NR) { this.nx[ci] = nx; this.ny[ci] = ny; this.nz[ci] = nz; }
        else {  // sphere impostor normal
          this.nx[ci] = rt[0] * dx - up[0] * dy - fw[0] * dz; this.ny[ci] = rt[1] * dx - up[1] * dy - fw[1] * dz; this.nz[ci] = rt[2] * dx - up[2] * dy - fw[2] * dz;
        }
        this.ar[ci] = C[i * 3]; this.ag[ci] = C[i * 3 + 1]; this.ab[ci] = C[i * 3 + 2];
        this.wy[ci] = y; this.mat[ci] = pts.mat ? pts.mat[i] : (o.mat || 0); this.gid[ci] = pts.grp ? pts.grp[i] : (o.gid || 0);
      }
    }
  }
};

// ---- shading ------------------------------------------------------------------
// wave: {y0, y1, front (0..1 along y0->y1), width, from:[r,g,b] mult, to:[r,g,b] mult, hot:[r,g,b], mats: {id:1}}
Scene3D.prototype.shade = function () {
  var n = this.n, W = this.W, L = this.light, Ld = L.dir, D = this.depth;
  var f = this.fwd, r = this.right, u = this.up;
  var hx = 0, hy = 0, hz = 0, wv = this.wave, tmpw = { on: 0, band: 0 };
  for (var ci = 0; ci < n; ci++) {
    if (D[ci] <= 0) continue;
    var m = this.mats[this.mat[ci]] || DEFAULT_MAT;
    var px = ci % W, py = (ci - px) / W;
    var a = (px + 0.5 - this.cx) / this.fc, b = -(py + 0.5 - this.cy) / this.fr;
    var vx = -(f[0] + r[0] * a + u[0] * b), vy = -(f[1] + r[1] * a + u[1] * b), vz = -(f[2] + r[2] * a + u[2] * b);
    var vl = 1 / Math.hypot(vx, vy, vz); vx *= vl; vy *= vl; vz *= vl;
    var nx = this.nx[ci], ny = this.ny[ci], nz = this.nz[ci];
    var nl = 1 / (Math.hypot(nx, ny, nz) || 1); nx *= nl; ny *= nl; nz *= nl;
    var ndv = nx * vx + ny * vy + nz * vz;
    if (ndv < 0) { nx = -nx; ny = -ny; nz = -nz; ndv = -ndv; }   // two-sided cloth, back faces
    var diff = nx * Ld[0] + ny * Ld[1] + nz * Ld[2]; if (diff < 0) diff = 0;
    var hemi = 0.55 + 0.45 * ny;
    var lam = m.amb * L.amb * hemi + m.kd * diff;
    if (L.fill) { var fd = L.fillDir, fl = nx * fd[0] + ny * fd[1] + nz * fd[2]; if (fl > 0) lam += m.kd * L.fill * fl; }
    var rim = m.rim * Math.pow(1 - ndv, 3);
    hx = Ld[0] + vx; hy = Ld[1] + vy; hz = Ld[2] + vz;
    var hl = 1 / (Math.hypot(hx, hy, hz) || 1);
    var ndh = (nx * hx + ny * hy + nz * hz) * hl;
    var spec = ndh > 0 ? m.ks * Math.pow(ndh, m.shin) : 0;
    var lum = lam + rim * 0.7 + spec + m.emit;
    if (this.edge) {
      var ed = this.edge, zc = 1 / D[ci], occ = 0, sil = 0;
      for (var q = 0; q < 6; q++) {
        var nb = q === 0 ? (px > 0 ? ci - 1 : -1) : q === 1 ? (px < W - 1 ? ci + 1 : -1) : q === 2 ? (py > 0 ? ci - W : -1) : q === 3 ? (ci + W < n ? ci + W : -1)
          : q === 4 ? (px > 1 ? ci - 2 : -1) : (px < W - 2 ? ci + 2 : -1);
        if (nb < 0) continue;
        var dn = D[nb];
        if (dn <= 0) { sil++; continue; }
        var dz = zc - 1 / dn;
        if (dz > ed.dist) occ += q < 4 ? 1 : 0.6; else if (dz < -ed.dist * 3) sil += q < 4 ? 1 : 0.5;
      }
      if (occ) lum *= Math.max(0.25, 1 - ed.dark * occ);
      if (sil) lum += ed.sil * Math.min(2, sil);
    }
    if (this.grain) lum += (hash1(ci * 0.7131 + this.gid[ci]) - 0.5) * this.grain;
    lum = 1 - Math.exp(-m.expo * lum);   // filmic-ish roll-off so lit plates don't all read '@'
    if (m.gamma !== 1) lum = Math.pow(lum, m.gamma);
    var ramp = m.ramp, ri = lum < m.minLum ? 0 : 1 + Math.floor(clamp01(lum) * (ramp.length - 1.001));
    if (ri >= ramp.length) ri = ramp.length - 1;
    this.sch[ci] = ramp.charCodeAt(ri);
    var al = this.ar[ci] * 255, ag = this.ag[ci] * 255, ab = this.ab[ci] * 255;
    if (wv && (!wv.mats || wv.mats[this.mat[ci]])) {
      paletteWave((this.wy[ci] - wv.y0) / (wv.y1 - wv.y0), wv.front, wv.width, tmpw);
      var fr = wv.from, to = wv.to;
      al *= fr[0] + (to[0] - fr[0]) * tmpw.on; ag *= fr[1] + (to[1] - fr[1]) * tmpw.on; ab *= fr[2] + (to[2] - fr[2]) * tmpw.on;
      if (tmpw.band > 0.01) {
        var bw = tmpw.band, hot = wv.hot || [255, 255, 255];
        al += (hot[0] - al) * bw; ag += (hot[1] - ag) * bw; ab += (hot[2] - ab) * bw;
        lum += bw * 0.6;
        this.sch[ci] = ramp.charCodeAt(Math.min(ramp.length - 1, ri + ((bw * 3) | 0)));
      }
    }
    var lt = clamp01(lam * 1.1), dk = m.dark;
    var cr = dk[0] + (al - dk[0]) * lt, cg = dk[1] + (ag - dk[1]) * lt, cb = dk[2] + (ab - dk[2]) * lt;
    var rc = L.rimCol;
    cr += rc[0] * rim * 255; cg += rc[1] * rim * 255; cb += rc[2] * rim * 255;
    var sp = spec > 1 ? 1 : spec;
    cr += (255 - cr) * sp; cg += (255 - cg) * sp; cb += (255 - cb) * sp;
    this.sr[ci] = cr > 255 ? 255 : cr; this.sg[ci] = cg > 255 ? 255 : cg; this.sb[ci] = cb > 255 ? 255 : cb;
    this.sl[ci] = lum;
    if (lum > m.glowAt) {
      var gk = (lum - m.glowAt) * m.glow;
      this.gr[ci] += this.sr[ci] / 255 * gk; this.gg[ci] += this.sg[ci] / 255 * gk; this.gb[ci] += this.sb[ci] / 255 * gk;
    }
  }
};

// ---- marks ----------------------------------------------------------------------
// iz <= 0 means an overlay that ignores depth. Returns true if written.
Scene3D.prototype.mark = function (ix, iy, code, r, g, b, a, iz, glow) {
  ix = ix | 0; iy = iy | 0;
  if (ix < 0 || iy < 0 || ix >= this.W || iy >= this.H) return false;
  var ci = iy * this.W + ix, z = iz > 0 ? iz : 1e9;
  if (iz > 0 && this.depth[ci] > iz * 1.004) return false;
  if (this.mch[ci] && this.mz[ci] > z) return false;
  this.mch[ci] = code; this.mr[ci] = r; this.mg[ci] = g; this.mb[ci] = b; this.ma[ci] = a; this.mz[ci] = z;
  if (glow) { var k = glow * a / 255; this.gr[ci] += r * k; this.gg[ci] += g * k; this.gb[ci] += b * k; }
  return true;
};
Scene3D.prototype.markWorld = function (x, y, z, code, r, g, b, a, glow) {
  if (!this.project(x, y, z, _w)) return false;
  return this.mark(Math.floor(_w[0]), Math.floor(_w[1]), code, r, g, b, a, _w[2], glow);
};
Scene3D.prototype.textWorld = function (x, y, z, str, r, g, b, a, glow, dyRows) {
  if (!this.project(x, y, z, _w)) return false;
  var x0 = Math.floor(_w[0] - str.length * 0.5 + 0.5), y0 = Math.floor(_w[1]) + (dyRows || 0), iz = _w[2];
  for (var i = 0; i < str.length; i++) {
    var c = str.charCodeAt(i);
    if (c !== 32) this.mark(x0 + i, y0, c, r, g, b, a, iz, glow);
  }
  return true;
};
// stroke glyph for a screen-space direction (cells)
Scene3D.prototype.strokeCode = function (dx, dy) {
  var ang = Math.atan2(-dy * this.chh, dx * this.cw);  // pixel space, y up
  var a = ((ang % Math.PI) + Math.PI) % Math.PI;      // 0..pi
  if (a < 0.39 || a > 2.75) return 45;   // -
  if (a < 1.18) return 47;               // /
  if (a < 1.96) return 124;              // |
  return 92;                             // \
};
var _l0 = [0, 0, 0], _l1 = [0, 0, 0];
Scene3D.prototype.lineWorld = function (x0, y0, z0, x1, y1, z1, r, g, b, a, glow, code) {
  if (!this.project(x0, y0, z0, _l0) || !this.project(x1, y1, z1, _l1)) return;
  var dx = _l1[0] - _l0[0], dy = _l1[1] - _l0[1];
  var steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) * 1.2));
  var cc = code || this.strokeCode(dx, dy);
  for (var i = 0; i <= steps; i++) {
    var t = i / steps;
    this.mark(Math.floor(_l0[0] + dx * t), Math.floor(_l0[1] + dy * t), cc, r, g, b, a, _l0[2] + (_l1[2] - _l0[2]) * t, glow);
  }
};
Scene3D.prototype.bg = function (ix, iy, code, r, g, b, a) {
  ix = ix | 0; iy = iy | 0;
  if (ix < 0 || iy < 0 || ix >= this.W || iy >= this.H) return;
  var ci = iy * this.W + ix;
  this.bch[ci] = code; this.br[ci] = r; this.bgc[ci] = g; this.bb[ci] = b; this.ba[ci] = a;
};

// ---- glow blur + composite ---------------------------------------------------------
Scene3D.prototype._blur = function (A) {
  var W = this.W, H = this.H, T = this.tmp, x, y, i;
  for (y = 0; y < H; y++) {           // horizontal, radius 2 (cells are ~2x taller than wide)
    var o = y * W;
    for (x = 0; x < W; x++) {
      i = o + x;
      var s = A[i] * 0.3;
      s += (x > 0 ? A[i - 1] : 0) * 0.22 + (x < W - 1 ? A[i + 1] : 0) * 0.22;
      s += (x > 1 ? A[i - 2] : 0) * 0.13 + (x < W - 2 ? A[i + 2] : 0) * 0.13;
      T[i] = s;
    }
  }
  for (y = 0; y < H; y++) {           // vertical, radius 1
    for (x = 0; x < W; x++) {
      i = y * W + x;
      A[i] = T[i] * 0.5 + (y > 0 ? T[i - W] : 0) * 0.25 + (y < H - 1 ? T[i + W] : 0) * 0.25;
    }
  }
};
Scene3D.prototype.present = function () {
  this._blur(this.gr); this._blur(this.gg); this._blur(this.gb);
  var W = this.W, n = this.n, D = this.depth, bl = this.bloom * 255, cells = 0;
  for (var ci = 0; ci < n; ci++) {
    var px = ci % W, py = (ci - px) / W;
    var gR = this.gr[ci], gG = this.gg[ci], gB = this.gb[ci], r, g, b;
    if (this.mch[ci]) {
      r = this.mr[ci] + gR * bl * 0.5; g = this.mg[ci] + gG * bl * 0.5; b = this.mb[ci] + gB * bl * 0.5;
      drawChar(chr(this.mch[ci]), px, py, r > 255 ? 255 : r | 0, g > 255 ? 255 : g | 0, b > 255 ? 255 : b | 0, this.ma[ci]);
      cells++; continue;
    }
    if (D[ci] > 0) {
      var c = this.sch[ci];
      if (c === 32) continue;
      r = this.sr[ci] + gR * bl; g = this.sg[ci] + gG * bl; b = this.sb[ci] + gB * bl;
      drawChar(chr(c), px, py, r > 255 ? 255 : r | 0, g > 255 ? 255 : g | 0, b > 255 ? 255 : b | 0, 1);
      cells++; continue;
    }
    var gm = gR > gG ? (gR > gB ? gR : gB) : (gG > gB ? gG : gB);
    if (gm > 0.06 && this.glowFill) {
      var k = 1 / gm, code = gm > 0.3 ? 58 : 46;   // : or .
      drawChar(chr(code), px, py, Math.min(255, gR * k * 255) | 0, Math.min(255, gG * k * 255) | 0, Math.min(255, gB * k * 255) | 0, Math.min(0.9, 0.25 + gm));
      cells++; continue;
    }
    if (this.bch[ci]) { drawChar(chr(this.bch[ci]), px, py, this.br[ci] | 0, this.bgc[ci] | 0, this.bb[ci] | 0, this.ba[ci]); cells++; }
  }
  var st = this.stats;
  st.cells = cells;
  st.ms = performance.now() - this._t0;
  st.ema = st.ema ? st.ema * 0.92 + st.ms * 0.08 : st.ms;
  // adaptive quality: modes scale their optional detail by s3.quality
  if (st.ema > this.budget && this.quality > 0.5) this.quality -= 0.02;
  else if (st.ema < this.budget * 0.6 && this.quality < 1) this.quality += 0.01;
};

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
// staged build-up: spec {name: [start, duration]}; grow(name, t) -> eased 0..1
export function createStages(spec) {
  var st = { t0: 0, spec: spec };
  st.restart = function (t) { st.t0 = t; };
  st.raw = function (name, t) { var s = spec[name]; if (!s) return 1; return clamp01((t - st.t0 - s[0]) / s[1]); };
  st.grow = function (name, t) { return easeOut(st.raw(name, t)); };
  st.done = function (t) { for (var k in spec) if (st.raw(k, t) < 1) return false; return true; };
  return st;
}
// palette wave: front moves 0 -> 1 along a body coordinate; behind it (coord < front) is
// the new palette (on = 1), at it a white-hot band. out = {on, band}
export function paletteWave(coord, front, width, out) {
  var w = width || 0.12;
  out.on = smooth((front - coord) / w + 0.5);
  var d = (front - coord) / (w * 0.7);
  out.band = front > -1 ? Math.exp(-d * d) : 0;
  return out;
}
// mix two rgb triples by a wave state; returns out
export function mixWave(a, b, wv, out, hot) {
  hot = hot || [255, 255, 255];
  for (var i = 0; i < 3; i++) { var c = a[i] + (b[i] - a[i]) * wv.on; out[i] = c + (hot[i] - c) * wv.band * 0.95; }
  return out;
}

// particles: kinds is a table {id: {grav, drag, wind, life}}; step() moves them,
// calling onGround(p, i) when they cross groundY (return true to keep).
export function createParticles(max) {
  var P = { n: 0, max: max, x: new Float32Array(max), y: new Float32Array(max), z: new Float32Array(max),
    vx: new Float32Array(max), vy: new Float32Array(max), vz: new Float32Array(max),
    age: new Float32Array(max), life: new Float32Array(max), kind: new Uint8Array(max), seed: new Float32Array(max) };
  P.emit = function (kind, x, y, z, vx, vy, vz, life) {
    var i = P.n < max ? P.n++ : (Math.random() * max) | 0;
    P.x[i] = x; P.y[i] = y; P.z[i] = z; P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz;
    P.age[i] = 0; P.life[i] = life; P.kind[i] = kind; P.seed[i] = Math.random();
    return i;
  };
  P.step = function (dt, kinds, groundY, onGround, wind) {
    var j = 0;
    for (var i = 0; i < P.n; i++) {
      var k = kinds[P.kind[i]] || {};
      P.age[i] += dt;
      if (P.age[i] >= P.life[i]) continue;
      var dr = k.drag ? Math.exp(-k.drag * dt) : 1;
      P.vx[i] *= dr; P.vz[i] *= dr; P.vy[i] = P.vy[i] * dr - (k.grav || 0) * dt;
      if (wind && k.wind) { P.vx[i] += wind[0] * k.wind * dt; P.vz[i] += wind[1] * k.wind * dt; }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
      if (P.y[i] < groundY && P.vy[i] < 0) {
        if (!onGround || !onGround(P, i)) continue;
        if (P.y[i] < groundY) P.y[i] = groundY;
      }
      if (j !== i) {
        P.x[j] = P.x[i]; P.y[j] = P.y[i]; P.z[j] = P.z[i]; P.vx[j] = P.vx[i]; P.vy[j] = P.vy[i]; P.vz[j] = P.vz[i];
        P.age[j] = P.age[i]; P.life[j] = P.life[i]; P.kind[j] = P.kind[i]; P.seed[j] = P.seed[i];
      }
      j++;
    }
    P.n = j;
  };
  return P;
}
// styles {kind: {glyphs: 'oO.', col:[r,g,b], hot:[r,g,b], glow, alpha}}: glyph by age fraction
Scene3D.prototype.drawParticles = function (P, styles) {
  for (var i = 0; i < P.n; i++) {
    var s = styles[P.kind[i]];
    if (!s) continue;
    var f = P.age[i] / P.life[i], gl = s.glyphs;
    var code = gl.charCodeAt(Math.min(gl.length - 1, (f * gl.length) | 0));
    var h = s.hot ? (1 - f) * (1 - f) : 0, c = s.col, ht = s.hot || c;
    var a = (s.alpha || 1) * (1 - f * f * 0.6);
    this.markWorld(P.x[i], P.y[i], P.z[i], code, c[0] + (ht[0] - c[0]) * h, c[1] + (ht[1] - c[1]) * h, c[2] + (ht[2] - c[2]) * h, a, s.glow || 0);
  }
};
// ripples on a horizontal plane
export function createRipples(max) {
  var R = { n: 0, x: new Float32Array(max), z: new Float32Array(max), y: new Float32Array(max), age: new Float32Array(max),
    life: new Float32Array(max), r0: new Float32Array(max), speed: new Float32Array(max) };
  R.add = function (x, y, z, life, speed, r0) {
    var i = R.n < max ? R.n++ : 0;
    R.x[i] = x; R.y[i] = y; R.z[i] = z; R.age[i] = 0; R.life[i] = life; R.speed[i] = speed; R.r0[i] = r0 || 0.01;
  };
  R.step = function (dt) {
    var j = 0;
    for (var i = 0; i < R.n; i++) {
      R.age[i] += dt;
      if (R.age[i] >= R.life[i]) continue;
      if (j !== i) { R.x[j] = R.x[i]; R.y[j] = R.y[i]; R.z[j] = R.z[i]; R.age[j] = R.age[i]; R.life[j] = R.life[i]; R.speed[j] = R.speed[i]; R.r0[j] = R.r0[i]; }
      j++;
    }
    R.n = j;
  };
  R.radius = function (i) { return R.r0[i] + R.speed[i] * Math.pow(R.age[i], 0.8); };
  // ring intensity at (x, z), the reel's exp(-((rd-1)*R/w)^2) * fade
  R.at = function (x, z, w) {
    var s = 0;
    for (var i = 0; i < R.n; i++) {
      var rad = R.radius(i), d = Math.hypot(x - R.x[i], z - R.z[i]) - rad, q = d / (w || 0.03);
      s += Math.exp(-q * q) * (1 - R.age[i] / R.life[i]);
    }
    return s;
  };
  return R;
}
// draw ripples as stroked rings (glyph follows the projected tangent)
Scene3D.prototype.drawRipples = function (R, col, glow) {
  for (var i = 0; i < R.n; i++) {
    var rad = R.radius(i), f = R.age[i] / R.life[i], segs = 28;
    for (var s = 0; s < segs; s++) {
      var a0 = s / segs * TAU, a1 = (s + 1) / segs * TAU;
      this.lineWorld(R.x[i] + Math.cos(a0) * rad, R.y[i], R.z[i] + Math.sin(a0) * rad,
        R.x[i] + Math.cos(a1) * rad, R.y[i], R.z[i] + Math.sin(a1) * rad, col[0], col[1], col[2], 1 - f * 0.8, glow || 0);
    }
  }
};
