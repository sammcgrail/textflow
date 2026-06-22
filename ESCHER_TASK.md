# ESCHER / ALHAMBRA build — continuation brief

## STATUS (updated 07:43, block 1)
- ✅ **TEXTFLOW DONE + LIVE**: modes `escher`, `alhambra`, `circlelimit` written, wired (all 6 files incl. glow.js), committed+pushed (master `cc90595`), docker-deployed, CF purged. Serving 200 at textflow.sebland.com/{escher,alhambra,circlelimit}. Links posted to Discord.
  - NOT visually verified: the headless screenshot harness returns a blank frame on textflow's WebGL pipeline. Run `node generate-thumbs.mjs` (needs PUBLIC url) or eyeball in a real browser; tweak palettes/params/thresholds if a mode looks off.
  - `circlelimit` font-shrink: verify `resizeWebGL()` honors the overridden COLS/ROWS/FONT_SIZE (read webgl-renderer.js). If it recomputes font itself, adapt the approach so the high-detail grid actually takes effect.
- ⬜ **TODO: pfive-style `escherwarp`** (GLSL Droste / Print-Gallery mind-warp). Build + deploy to box/app, add Caddy route, run check-mobile.py, CF purge, commit+push. Then post its link to this Discord channel. (Design below.)

---


Sam asked (Discord claws group `1484079826166874162`, 2026-06-22) for:
1. A **textflow** mode `escher` — impossible-geometry illusions (Penrose stairs / Ascending-Descending).
2. A **textflow** mode `alhambra` — Moorish wallpaper-group tessellation (azulejo jewel tones).
3. A **textflow** mode `circlelimit` — the "escher/alhambra **high-detail**" one: hyperbolic Poincaré-disk tiling (Circle Limit III) that **turns the font size DOWN** so it renders in fine grain. This is the literal "turn down the font size so it's extra high detailed" ask.
4. A **pfive-style** page `escherwarp` — "mind-warping Escher illusion animations" (p5.js WEBGL + GLSL). Best fit: infinite **Droste-effect** conformal zoom (the Print Gallery math) + impossible-geometry / hyperbolic warp.

**When all four are live, post clickable links to the Discord channel** via
`/root/seb/scripts/send-discord "1484079826166874162" --from-file <msg.md>`:
- https://textflow.sebland.com/escher
- https://textflow.sebland.com/alhambra
- https://textflow.sebland.com/circlelimit
- https://escherwarp.sebland.com (and/or https://sebland.com/escherwarp/)

FIRST: `git -C /root/textflow status` and check which mode files already exist so you don't duplicate. Check `/root/box/app/static/escherwarp/` too.

---

## Textflow mode API (verified from source)

A mode is a self-registering file in `src/modes/<name>.js`:
```js
import { clearCanvas, drawCharHSL } from '../core/draw.js';
import { pointer } from '../core/pointer.js';        // pointer.down, pointer.gx, pointer.gy (grid coords), pointer.clicked
import { registerMode } from '../core/registry.js';
import { state } from '../core/state.js';            // state.COLS, state.ROWS, state.time (sec, float), FONT_SIZE, CHAR_W/H, NAV_H, useWebGL, ctx
import { RAMP_DENSE } from '../core/ramps.js';        // ' .`-:;=+*#%@$'  (sparse->dense)

function initX(){ /* called on switch + on resize (handleResize calls mode.init) */ }
function renderX(){
  clearCanvas();
  var W = state.COLS, H = state.ROWS;
  for (var y=0;y<H;y++) for (var x=0;x<W;x++){
    drawCharHSL(ch, x, y, hue/*0-360*/, sat/*0-100*/, light/*0-100*/);
  }
}
registerMode('x', { init: initX, render: renderX, cleanup: cleanupX });
```
- `drawCharHSL(ch,x,y,h,s,l)` — ' ' (space) is skipped. Use light=0 / `continue` to leave a cell dark.
- Pointer interaction pattern (guard by mode name): `var active = pointer.down && state.currentMode==='x';`
- `state.time` resets to 0 on mode switch.

### WIRING CHECKLIST (the gotcha — subagents ALWAYS forget glow.js)
For EACH new mode add an entry in ALL of these (READ each file first, match its exact format):
1. `src/modes/<name>.js`            — the mode itself (registerMode)
2. `src/core/glow.js`               — `glows` dict entry `name: { color:'rgba(...)', blur:N }`  ← **REQUIRED or applyGlow() crashes on `g.blur` (Canvas2D fallback path)**
3. `src/modes-list.js`              — registry list (read format first)
4. `src/modes/modeGroups.js`        — mode→group mapping for lazy-load
5. `src/modes/groups/<group>.js`    — import the mode in its group bundle (or add to core.js)
6. `src/modes/index.js`             — barrel import (eager/legacy build)

Pick a group (e.g. an existing "geometry/fractal"-ish group, or core.js). Verify after: `grep -rn "'escher'\|escher" src/` should hit all 6 files.

### Build + deploy textflow (memory: NOT `restart` — Vite builds at image build time)
```
cd /root/textflow && docker compose up --build -d
```
Served at textflow.sebland.com (Caddy). Then **purge CF cache**. Then **commit+push** (branch master).
Optional: thumbnails via `node generate-thumbs.mjs` (needs PUBLIC url, not localhost).
Deep links are pathname-based (router.js) — `/escher` works once the mode is registered + in modeGroups.

---

## Mode designs

### `escher` (impossible geometry)
Isometric **Penrose staircase / Ascending-Descending**. Draw an iso-projected closed loop of "steps" using box/line ASCII (`# % = | / \\ _`). Animate a bright band marching along the loop path so it reads as endless ascent. Cool stone palette (hue ~210-230, low sat) for the structure, warm highlight band (hue ~40) sweeping `state.time`. Tap cycles illusion: penrose-stairs → penrose-triangle → impossible-cube. Drag rotates the iso azimuth.

### `alhambra` (Moorish tessellation)
A **p6m/p4m wallpaper-group** tiling. Fold (x,y) into a fundamental domain via reflections+rotations (cf. kaleidoscope.js `segments` fold), fill with an interlacing star-and-petal motif. Jewel azulejo palette: cycle between teal (180), lapis (220), gold (45), terracotta (15). Slow hue drift + an Escher **Metamorphosis** wave (a band traveling across x that morphs motif A→B). Density char from RAMP_DENSE by motif value.

### `circlelimit` (HIGH-DETAIL — shrinks font)
**Poincaré-disk hyperbolic tiling** (Circle Limit III fish). Map cell (x,y) to disk coords; near the rim r→1 the motif repeats at ever-smaller scale via a log-polar / conformal map. Color the interlocking arcs (green 140 / red 0 / yellow 50 / blue 210). Shrink the font in init for fine grain, restore on cleanup:
```js
import { state } from '../core/state.js';
import { resize } from '../core/canvas.js';
import { resizeWebGL } from '../core/webgl-renderer.js';
function applyFineGrid(scale){            // scale<1 => smaller font => more COLS/ROWS => more detail
  var w = window.innerWidth, h = window.innerHeight - 14 /*INFO_BAR_H*/;
  var base = Math.max(10, Math.min(16, w/70));
  state.FONT_SIZE = Math.max(5, base*scale);   // ~0.5 => ~2x density (4x cells). Try 0.5; mobile maybe 0.6.
  var mc = state.ctx; mc.font = state.FONT_SIZE+'px "JetBrains Mono", monospace'; mc.textBaseline='top';
  state.CHAR_W = mc.measureText('M').width; state.CHAR_H = state.FONT_SIZE*1.25;
  state.COLS = Math.floor(w/state.CHAR_W); state.ROWS = Math.floor((h-state.NAV_H)/state.CHAR_H);
  if (state.useWebGL) resizeWebGL();
}
function initCirclelimit(){ applyFineGrid(0.5); /* build any caches keyed on COLS/ROWS */ }
function cleanupCirclelimit(){ resize(); }   // restore default grid when leaving the mode
registerMode('circlelimit',{ init:initCirclelimit, render:renderCirclelimit, cleanup:cleanupCirclelimit });
```
Verify: MSDF atlas is resolution-independent so small font stays crisp (atlas baked at original FONT_SIZE — fine). Confirm `resizeWebGL()` rebuilds instance buffers for the larger COLS*ROWS (read webgl-renderer.js). Precedent for in-mode font measuring: `src/modes/brightmatch.js`. Perf: COLS*ROWS quadruples — keep the per-cell math cheap; cap ROWS work if FPS drops.

---

## pfive-style `escherwarp` (p5.js WEBGL + GLSL)

Model on the existing pfive shader app:
- Repo source: `/root/pfive/srv/pfive/index.html` (single file, p5.js 1.9.4 via cdnjs, custom GLSL frag shader, tap/drag interactions, loader, HUD).
- Served copy / deploy: see `/root/seb/skills/pfive/SKILL.md` and memory (pfive lives at `/root/box/app/static/pfive/`). **Read the pfive SKILL.md first** for uniforms map + headless-screenshot template (WebGL needs swiftshader; snap chromium is AppArmor-broken).

Make a NEW sibling page `escherwarp` (don't overwrite pfive). Shader ideas (mind-warp, pick/combine):
- **Droste / Print Gallery conformal map**: `z = log(r) + i*theta`, scale+rotate periodically, `exp` back → infinite self-similar zoom. (This is the exact Lenstra "Print Gallery" math.)
- **Penrose / impossible-tri** line illusion via repeated rotated isometric stripes.
- **Hyperbolic Poincaré** tiling warp toward a circle boundary.
- Domain-warped tessellation morph (birds↔fish), IQ cosine palette like pfive.
Tap = cycle warp; double = palette; drag = warp strength. Keep pfive's loader + HUD.

### Deploy escherwarp (New Static App Checklist + mobile baseline)
1. File: `/root/box/app/static/escherwarp/index.html` (apply FULL mobile baseline from MEMORY.md; for full-screen WebGL canvas use `touch-action:none`, 100dvh, safe-area).
2. Caddyfile: add route in `/root/box/app/Caddyfile` BEFORE `# seb status dashboard`; for the subdomain `escherwarp.sebland.com` mirror how pfive.sebland.com is configured.
3. Rebuild: `cd /root/box/app && docker compose build --no-cache web && docker compose up -d web`
4. **Purge CF cache.**
5. **Mobile gate (MUST pass):** `/root/seb/skills/sebland-app/scripts/check-mobile.py /root/box/app/static/escherwarp/index.html` (exit 0).
6. Screenshot-verify with headless-chromium + swiftshader (see pfive SKILL.md / MEMORY.md). Commit+push the pfive repo if escherwarp lives there.

---

## Final step
Post ONE Discord message with all four clickable links + a one-line description each. Save a memory entry (type=project, contact=discord:1484079826166874162) recording the four new Escher/Alhambra artifacts and their URLs. Done.
