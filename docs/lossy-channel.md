# Lossy-Channel Design

**Status:** living doc · **Authors:** seb + ulant · **Started:** 2026-04-18

> *"Ugly on first pass, immortal on the tenth."* — ulant

Design principles for assets meant to survive repeated aesthetic re-encoding
(pixelification, repaints, screenshots-of-screenshots, meme spread, e-ink
conversions, ASCII remaps, reposts, re-edits). Originated from the
textflow → pixel → ascii → pixel recursion experiment (clawsparty → clawsfry
→ cycle3 decomposition).

---

## Core claim

Shannon's separation theorem, designer-facing form:

> **Semantic payload belongs in the silhouette; detail is sacrificial.**

A silhouette is a `(0,1)` codeword. Shading is a `(0.13, 0.87, 0.42, …)`
float vector. The first survives repeated rounding; the second does not.
Glyph = Hamming code. Rendering = raw float.

## Observed laws

1. **Periodicity beats detail under lossy medium-swap.**
   A periodic horizontal stripe is a single frequency bin — Nyquist-immune,
   redundant, survives every resample/quantize step. Mid-freq detail smears
   on pass 1.

2. **Confetti / sparkle is designed to die.**
   Wideband noise = maximum information density per pixel, zero redundancy.
   The quantizer kills it immediately.

3. **Solid-color blobs outlast detailed silhouettes.**
   (Crab survived longer than figures in the clawsfry recursion because its
   body was a compact red mass with no sub-structure to lose.)

4. **Meme-channel durability is Shannon error-correction.**
   Wojak/pepe outlines persist through 10⁴ edits because they *are* low-freq
   glyphs; fine shading in any given repaint dies instantly.

## Companion principle

**Prevent-pole-preserve-gradient** (ulant, prior coinage):
avoid singularities that pin the renderer's attention; keep the gradient
field intact so downstream tools have continuous signal to work with.

## Design rules (actionable)

- Put the semantic payload in silhouette + periodic structure.
- Let fine detail be explicitly sacrificial — don't grieve it.
- For anything that must survive N aesthetic re-encodings: design at the
  **glyph-banner / checker-floor / outline** level first, detail second.
- When in doubt, ask: "is this (0,1) or raw float?" If float, assume decay.

## Recursion-proof survivors (empirical)

| Element                      | Survives? | Why                                  |
|------------------------------|-----------|--------------------------------------|
| Periodic checker floor       | ✅ 5/5    | Single freq bin, Nyquist-immune      |
| Solid-color silhouette       | ⚠️ ~3/5   | Low-freq but not periodic            |
| Thick outline glyph          | ✅ 5/5    | (0,1) codeword                       |
| Confetti / sparkle           | ❌ 1/5    | Wideband noise, max entropy          |
| Thin gradient shading        | ❌ 1/5    | Float vector, first to round         |
| Detailed silhouette (tanuki) | ❌ 2/5    | Mid-freq detail smears on pass 1     |

## Audio-channel analogues

*(ulant, 2026-04-18)*

Same rubric, time domain. Low-freq periodic structure (bassline, kick,
sustained drone) = the "checker floor" of audio — single-bin energy,
survives lossy transcode, tape hiss, MP3, phone compression. High-freq
aperiodic (cymbal wash, breath noise, sibilance) = confetti — dies on
first pass.

Prediction holds for speech: **formants** (low-freq spectral modes) are
the glyph, **frication noise** is the rendering. Phone-telephone-game
decays consonants first, vowels last — consonants are sparkle, vowels
are silhouette.

## Palette-quantization robustness

*(ulant, 2026-04-18)*

Counterintuitive: **a 6-color palette is MORE robust than 64-color**
under repeated repaints. Fewer codewords = larger distance between
attractors = better error correction. A pixel in the 6-color world
snaps to one of 6 stable buckets every cycle; it can't drift. In
64-color world, boundaries are tight — a pixel near a bucket edge can
migrate to an adjacent bucket on each repaint (especially if renderers
use different quantizers).

**Corollary:** GameBoy / PICO-8 aesthetic is recursion-proof by
construction. Photoshop-smooth 24-bit gradients decay instantly.

## Textflow durability mode (proposal)

*(ulant, 2026-04-18)*

Whitelist of recursion-proof primitives only:

- `checker(w, h, period, c1, c2)` — periodic Nyquist-immune fills
- `glyph(text, color)` — thick 3×5 / 5×7 bitmap fonts, no antialias
- `blob(shape, color)` — solid monochrome regions, no gradient
- `outline(path, weight ≥ 2)` — `(0,1)` strokes, never hairline

Blacklist: gradients, alpha blending, particle systems, dithered shading,
fine silhouettes, any color count > 8.

Goal: a textflow experiment that survives ∞ recursion cycles.

## Quantitative conjectures

*(ulant, 2026-04-18)*

### Palette-shift corollary

Robustness requires a **fixed codebook across hops**. Different palettes
per hop = drift regardless of palette size. Fixed 6-color = attractor
lattice: same 6 every cycle, pixel snaps home. Variable palettes =
moving target, **even 6-color decays**.

### Glyph-thickness floor

Nyquist floor for strokes along a channel chain:

> `stroke_weight ≥ 2 × max(downsample_ratio)` across the chain.

Below that → stroke disappears on the worst hop. Above that wastes
pixels. **Optimal = 2–3 px at target resolution** for most channels.

### Recursion-depth bound

Rough closed-form for how many hops a signal survives:

> `N ≈ log(signal_redundancy) / log(1 + noise_per_hop)`

`signal_redundancy` = how many `(0,1)` codewords the signal is spread
across. **Doubles** with every thick stroke; **halves** with every float
feature. Explains why outlines compound well across hops and shading
doesn't — they compound at different rates inside the log.

## Open questions

- Empirical calibration of the `N ≈ log(R) / log(1+ε)` bound — fit
  against the clawsparty → cycle3 dataset and check residuals.
- Is there a *minimum-useful* palette size (2? 3?) below which
  silhouette collapses into solid color and semantics die faster than
  in a 6-color world?
- Does the "formants survive, frication dies" audio prediction hold?
  Protocol: speech sample → MP3 64kbps × 4 hops, log spectrogram per
  hop, expect formants at 500/1500/2500 Hz to survive 4+ hops,
  frication >6 kHz to die by hop 2.
- Can we extend the framework to motion (GIF → GIF recompression)?
  Low-freq periodic motion (bobbing) as the "checker floor" of
  animation, jitter/flicker as confetti?

## TODO

- [x] ulant co-author pass (landed 2026-04-18)
- [x] Audio-channel analogues section
- [x] Palette-quantization writeup
- [x] Durability-mode proposal
- [x] Quantitative conjectures (palette-shift, stroke floor, N-bound)
- [ ] Prototype `durability-mode` textflow experiment
- [ ] Reference: original clawsparty → clawsfry → cycle3 artifacts
- [ ] Fit N-bound against cycle3 dataset — residuals
- [ ] Run MP3×4 speech experiment, log spectrograms per hop
- [ ] Extend framework to motion / GIF recompression

---

*"pixel → ascii → pixel → ascii → pixel. three passes, semantic collapse,
floor bar is the only survivor across every cycle."* — ulant, 2026-04-18
