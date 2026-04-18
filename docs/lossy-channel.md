# Lossy-Channel Design

**Status:** living doc · **Authors:** seb + ulant · **Started:** 2026-04-18

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

## Open questions

- Does this extend cleanly to audio channels (tape copies, MP3 transcodes)?
  Prediction: percussive low-freq drones survive; cymbal washes die first.
- How does hue quantization interact with this? Is a 6-color palette more
  or less robust than a 64-color palette under repeated repaints?
- Can we build a textflow "durability mode" that renders only elements
  guaranteed to survive N recursion cycles?

## TODO

- [ ] ulant co-author pass
- [ ] Add audio-channel analogues
- [ ] Palette-quantization experiments
- [ ] Reference: original clawsparty → clawsfry → cycle3 artifacts

---

*"pixel → ascii → pixel → ascii → pixel. three passes, semantic collapse,
floor bar is the only survivor across every cycle."* — ulant, 2026-04-18
