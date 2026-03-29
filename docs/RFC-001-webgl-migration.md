# RFC-001: WebGL Migration

**Status:** Proposal
**Author:** seb
**Date:** 2026-03-29

## Problem

textflow currently renders ~5,000–6,000 `fillText()` calls per frame through Canvas 2D. While recent optimizations (color quantization, font caching, glow throttling, `alpha: false`, `desynchronized: true`) brought measurable gains, the fundamental bottleneck remains: **Canvas 2D `fillText()` is CPU-bound and cannot be batched**.

Profiling across all 139 modes shows:
- Desktop: 18–22 FPS on math-heavy modes (wave, fluid, bubbles, ripple, slime)
- Mobile: significantly worse — each `fillText` is expensive on low-power GPUs
- The glow overlay (CSS `filter: blur()` on a scaled-down canvas copy) is another CPU bottleneck

## Proposal

Migrate textflow's rendering pipeline from Canvas 2D to **WebGL 2** (with Canvas 2D fallback), using a **font texture atlas + instanced quad rendering** approach.

### Key Insight: Mode Files Don't Change

All 139 modes interact with rendering through exactly two functions:

```javascript
drawChar(ch, x, y, r, g, b, a)     // RGBA color
drawCharHSL(ch, x, y, h, s, l)     // HSL color
```

These are the **only** rendering API calls any mode makes. The migration rewires what happens *inside* these functions — modes are untouched.

## Architecture

### 1. Font Texture Atlas (`src/core/atlas.js`, ~60 lines)

Pre-render all printable ASCII characters (32–126 = 95 glyphs) to a single texture at startup:

```
┌───┬───┬───┬───┬───┬───┐
│ ! │ " │ # │ $ │ % │ & │  ← Row 0
├───┼───┼───┼───┼───┼───┤
│ ' │ ( │ ) │ * │ + │ , │  ← Row 1
├───┼───┼───┼───┼───┼───┤
│ ...                    │
└────────────────────────┘
```

- Render each glyph with `fillText` onto a temporary 2D canvas
- Upload as a single WebGL texture (LUMINANCE or ALPHA channel)
- Each glyph's UV coordinates are stored in a lookup array indexed by char code
- Re-generated on resize (font size changes)

### 2. Instance Buffer (`src/core/draw.js` changes, ~80 lines)

Replace `fillText` calls with buffer writes:

```javascript
// BEFORE (Canvas 2D)
export function drawChar(ch, x, y, r, g, b, a) {
  ctx.fillStyle = 'rgba(...)';
  ctx.fillText(ch, x * CHAR_W, NAV_H + y * CHAR_H);
}

// AFTER (WebGL)
var instanceData = new Float32Array(MAX_INSTANCES * 8);
var instanceCount = 0;

export function drawChar(ch, x, y, r, g, b, a) {
  if (ch === ' ') return;
  var i = instanceCount * 8;
  instanceData[i]   = x;           // grid x
  instanceData[i+1] = y;           // grid y
  instanceData[i+2] = ch.charCodeAt(0); // glyph index
  instanceData[i+3] = r / 255;     // color r (normalized)
  instanceData[i+4] = g / 255;     // color g
  instanceData[i+5] = b / 255;     // color b
  instanceData[i+6] = a;           // alpha
  instanceData[i+7] = 0;           // reserved/padding
  instanceCount++;
}
```

### 3. WebGL Renderer (`src/core/webgl-renderer.js`, ~200 lines)

Single draw call per frame replaces thousands of `fillText` calls:

```javascript
export function flushFrame() {
  gl.bufferSubData(gl.ARRAY_BUFFER, 0,
    instanceData.subarray(0, instanceCount * 8));
  gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 4, instanceCount);
  instanceCount = 0;
}
```

**Vertex shader** — positions a quad per instance using grid coordinates:
```glsl
attribute vec2 a_quad;          // unit quad corners
attribute float a_x, a_y;      // grid position
attribute float a_glyph;        // char code → UV lookup
attribute vec4 a_color;         // RGBA

uniform vec2 u_gridSize;        // COLS, ROWS
uniform vec2 u_charSize;        // CHAR_W, CHAR_H in clip space
uniform float u_navH;           // nav bar offset

varying vec2 v_uv;
varying vec4 v_color;

void main() {
  vec2 pos = (vec2(a_x, a_y) + a_quad) * u_charSize;
  pos.y += u_navH;
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
  v_uv = getGlyphUV(a_glyph, a_quad); // atlas lookup
  v_color = a_color;
}
```

**Fragment shader** — samples glyph texture and applies color:
```glsl
uniform sampler2D u_atlas;
varying vec2 v_uv;
varying vec4 v_color;

void main() {
  float mask = texture2D(u_atlas, v_uv).a;
  if (mask < 0.1) discard;
  gl_FragColor = v_color * mask;
}
```

### 4. Bloom Shader (replaces CSS blur glow, ~80 lines)

Current glow pipeline:
1. `drawImage(mainCanvas)` to scaled-down glow canvas
2. CSS `filter: blur(Npx)` on the glow canvas
3. Browser composites both canvases

WebGL bloom pipeline:
1. Render scene to framebuffer texture
2. Downsample + Kawase blur (4 passes, much cheaper than Gaussian)
3. Additive blend bloom texture back onto scene
4. Single canvas — no separate glow overlay element

The bloom shader receives per-mode color tint and blur radius from the existing `glows` config object, so all 139 mode glow configs work unchanged.

### 5. Integration (`src/core/loop.js` + `src/entry.js` changes, ~30 lines)

```javascript
// loop.js — add flush after mode render
export function loop(ts) {
  // ... time update ...
  renderers[state.currentMode]();  // mode fills instance buffer
  flushFrame();                     // single WebGL draw call
  applyBloom();                     // bloom post-process
  drawFPS();
  requestAnimationFrame(loop);
}

// entry.js — WebGL context init
var gl = state.canvas.getContext('webgl2')
      || state.canvas.getContext('webgl');
if (!gl) {
  // Fallback: keep Canvas 2D path (already works)
  state.ctx = state.canvas.getContext('2d', { alpha: false });
}
```

## Performance Impact

| Metric | Canvas 2D (current) | WebGL (projected) |
|--------|---------------------|-------------------|
| Draw calls/frame | ~5,000–6,000 `fillText` | **1** `drawArraysInstanced` |
| Glow cost | CSS blur on 2nd canvas | Kawase blur shader (GPU) |
| CPU→GPU sync | Per-char fillStyle changes | Single buffer upload |
| Desktop FPS | 18–22 (heavy modes) | **55–60** projected |
| Mobile FPS | 8–15 | **30–50** projected |
| Memory | ~2MB (canvas pixels) | ~4MB (atlas + buffers) |

## Migration Plan

### Phase 1: Dual Renderer (behind feature flag)
- Add `?renderer=webgl` URL param / `state.useWebGL` flag
- Implement atlas, instance buffer, basic quad shader
- Both paths available — Canvas 2D remains default
- Validate visual parity on all 139 modes
- **Estimated effort: 2–3 sessions**

### Phase 2: WebGL Glow → Bloom
- Replace CSS blur glow canvas with bloom shader
- Remove `<canvas id="glow">` element
- Single-canvas rendering pipeline
- **Estimated effort: 1–2 sessions**

### Phase 3: WebGL Default + Canvas 2D Fallback
- Make WebGL the default renderer
- Canvas 2D only activates if WebGL unavailable (rare in 2026)
- Remove glow canvas from HTML
- Performance benchmarking across device matrix
- **Estimated effort: 1 session**

## Files Changed

| File | Change | Lines |
|------|--------|-------|
| `src/core/atlas.js` | **New** — Font texture atlas generation | ~60 |
| `src/core/webgl-renderer.js` | **New** — WebGL context, shaders, flush | ~200 |
| `src/core/shaders/char.vert` | **New** — Vertex shader | ~30 |
| `src/core/shaders/char.frag` | **New** — Fragment shader | ~15 |
| `src/core/shaders/bloom.frag` | **New** — Bloom post-process shader | ~40 |
| `src/core/draw.js` | Modified — buffer writes instead of fillText | ~40 changed |
| `src/core/glow.js` | Modified — bloom shader instead of CSS blur | ~60 changed |
| `src/core/loop.js` | Modified — add `flushFrame()` call | ~5 changed |
| `src/entry.js` | Modified — WebGL context init | ~10 changed |
| `src/index.html` | Modified — remove glow canvas (Phase 3) | ~2 changed |
| **Total** | | **~460 lines** |

**Minimal changes to mode files:** Video modes updated to use `drawString()` helper for PAUSED overlay text (replacing direct `ctx.fillText`), and `propfont` mode given a WebGL-compatible codepath using monospace density ramp.

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| WebGL not available | Canvas 2D fallback (already works) |
| Font rendering fidelity | Pre-render with same font at exact size; regenerate on resize |
| Video modes (`getImageData`) | Video modes already use 2D canvas for pixel reading; can keep a secondary 2D canvas for video decode |
| HSL→RGB conversion in shader | Convert in `drawCharHSL` on CPU (cheap) before writing to buffer |
| Atlas texture size on mobile | 95 glyphs × 16px = ~1520×16 texture — well within limits |

## Relationship to Pretext

The [pretext](https://github.com/chenglou/pretext) reference implementation uses Canvas 2D with similar character-grid rendering. Our WebGL migration **diverges** from pretext's approach but is architecturally compatible:

- Pretext's core concept (character grid → visual output) is preserved
- The mode→draw abstraction layer (`drawChar`/`drawCharHSL`) remains identical
- We're optimizing the *rendering backend*, not the *rendering model*
- If pretext ever adds WebGL support, our abstraction makes it easy to adopt

## Open Questions

1. **Should bloom intensity be configurable per-mode?** Currently each mode specifies `blur` and `color` in `glow.js`. The bloom shader can accept these same params.
2. **~~WebGL 2 required or WebGL 1 sufficient?~~** Resolved: WebGL 2 only. No WebGL 1 fallback — instancing is built-in, `gl.RGBA8` sized formats are available, and 98%+ browser support in 2026 makes WebGL 1 fallback unnecessary. Canvas 2D is the fallback for the rare cases where WebGL 2 is unavailable.
3. **Should we add a "quality" toggle?** Low = skip bloom, Medium = 2-pass bloom, High = 4-pass bloom. Could help on very low-end mobile.
