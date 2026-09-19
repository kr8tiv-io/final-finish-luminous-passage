# Motion vocabulary

Every named motion on this site, its real mechanic, and what it becomes when motion is
refused. One id, one mechanic, one owner. If a step's brief says "use `line-rise`", this
file — not the step — decides what that means.

**Authority.** `EXPERIENCE-STORYBOARD.md` §3 and §7 decide *which* id plays *where*;
this file decides *what each id is*. Where an implemented value differs from the
storyboard's proposed value, the implemented value is recorded here as fact and the
difference is called out in the row's note — implementation wins on numbers, the
storyboard wins on casting.

**Provenance.** Every `implemented` row's `duration`, `ease`, `property` and `owner`
were read out of the source on 2026-09-18 at the cited `file:line`, not copied from a
brief. Nothing in the implemented tables is aspirational. `planned` rows carry the
storyboard's proposed values and the step that will own them; they are the contract that
step is held to, not a description of anything that runs today.

**Validation.** `node scripts/context-graph.mjs` parses the tables below and fails when a
row is missing a value, when a vocabulary id cited in `graph.json` does not exist here,
and when a motion-touching step cites no id at all.

---

## How to cite an id in code

**The convention is a JSDoc `@motion` tag.** One tag per id, on the block comment of the
function, timeline, spec object, or component that owns that id:

```ts
/**
 * The pearl pour's headline entrance.
 * @motion line-rise
 */
```

For a CSS-owned id the same tag goes in a leading block comment above the rule:

```css
/* @motion nav-echo */
.nav-label, .nav-label-echo { transition: transform 420ms cubic-bezier(.2,.8,.2,1); }
```

Why a tag and not a `data-motion` attribute: more than half of this vocabulary lives in
`.ts` modules that never touch an element (`headline-motion.ts` returns specs,
`journey-transitions.ts` returns a mode number, `surface-materials.ts` exports two
constants). A DOM attribute cannot mark those, so a DOM attribute cannot be the single
convention — and two conventions is no convention. The tag works in `.ts`, `.tsx`,
`.astro` frontmatter and `.css` alike, survives minification irrelevance because it is a
comment, and is greppable in one pass:

```
rg -n "@motion\s+([a-z0-9-]+)" src/
```

Rules:

1. The tag goes on the **owner** named in the table's `owner` column, and nowhere else.
   A consumer of an id does not re-tag it.
2. An id with two owners (a `full`-tier and a fallback implementation) is tagged in both,
   and both appear in the `owner` cell separated by ` · `.
3. A new motion may not ship without a row here first. Adding the tag without the row is
   the failure this file's validator exists to catch.

**Tagging is assigned to the owning step, not to Step 14.** Step 14 does not edit
component files. The exact insertion points are listed in [Where each id must be
tagged](#where-each-id-must-be-tagged); each line names the step that must add it.

---

## Schema

| Column | Meaning |
|---|---|
| `id` | Stable identifier, used in code tags, briefs and `graph.json` `vocab` arrays. |
| `kind` | `text`, `scene`, `hover`, or `layout`. |
| `status` | `implemented` (running in this tree, values measured) or `planned` (owned by a future step). |
| `duration` | Seconds, or `scrub` when scroll position is the clock. Scrub rows name their window. |
| `ease` | GSAP ease string, a CSS timing function, or the shader/analytic curve. Never blank. |
| `property` | What actually changes. Transform, opacity, clip-path, uniform, attribute. |
| `trigger` | What starts it. |
| `reduced-motion` | What happens under `prefers-reduced-motion: reduce`, `motionPreference: 'still'`, or `html[data-journey-tier="still"]`. Never "nothing": the narrative must still read. |
| `reference` | The `CONTEXT-SHEET.md` A4b reference it borrows from, or `native` when this project invented it. |
| `owner` | `file:line` of the code that owns it. |

---

## Text choreography rules

Binding on every step that animates type. Sources: storyboard §3, `MOTION-BIBLE.md`
Top 10 items 1–3, and the `SplitText` aria handling already proven in
`JourneyMotion.tsx:102` and `EditorialMotion.tsx:26`.

**T1 — Momentum.** Text arrives from the direction the scene just came from. After a
shoot-left, the next caption enters from the right. After a dolly, the headline settles
out of depth. After the resin falls, the next lines rise. A caption that enters against
the direction of travel is a bug, not a choice.

**T2 — Headings stay HTML.** The `<h1>`/`<h2>` in the markup is the accessible,
crawlable heading. SVG or canvas duplicates are `aria-hidden`. No heading is ever
composited as an image or a texture.

**T3 — One accessible string per heading, always.** `SplitText` with `aria:'auto'` on
elements whose role permits `aria-label` (headings, links, buttons). On a generic element
— a `<p>` eyebrow — `aria:'auto'` would write `aria-label` where a generic role prohibits
it (axe `aria-prohibited-attr`, WCAG 4.1.2), so the pattern is `aria:'hidden'` plus one
real `.sr-only` string inserted beside it and removed on revert. That is exactly what
`EditorialMotion.tsx:26-31` does and it is the only approved workaround.

**T4 — Split settings.** `type` is `lines`, `lines,chars`, or `words,chars`. Masking is
`mask:'lines'` or `mask:'words'` — a clip wrapper, never an opacity ramp, so the glyphs
are at full contrast in every frame they are on screen. `autoSplit:true` always, so a font
swap or a resize re-splits instead of leaving a stale measurement.

**T5 — Entrances use `toggleActions`, not `scrub`.** Scrub belongs to scene-linked media
and to diagrams that are the subject of the scroll. A heading that scrubs is a heading the
visitor can hold half-arrived, which is the readability failure the whole reading-zone
work exists to prevent. The one sanctioned exception is `char-float`
(`EditorialMotion.tsx:38`), a scrubbed eyebrow whose start is above the viewport and
therefore resolves to progress 1 — its settled state — on any deep link.

**T6 — Stagger has a ceiling.** Per-line stagger is clamped so the last line of a
headline lands within 1.25 s of the first: `headlineStagger()`
(`headline-motion.ts:110`) computes `min(spec.stagger, (1.25 − duration) / (lines − 1))`.
Any new text id obeys the same 1.25 s total-arrival budget.

**T7 — Settled means settled.** Every headline reaches its final position before its act's
hold window opens, and nothing moves while the visitor is reading, comparing, dragging a
divider, or typing. A hydration that happens *after* a reading position must render the
settled state, never a start state — the `alreadyRead()` guard
(`EditorialMotion.tsx:10`) is mandatory for any entrance that can be scrolled past before
its island hydrates.

**T8 — Reduced motion keeps the words.** Under `still`, text is at its settled position
with `clearProps` applied (`JourneyMotion.tsx:110-115`), splits are reverted, and the
`.sr-only` twins are removed. No text is ever hidden because motion was refused.

**T9 — Text never lives on the canvas.** Storyboard §2: the DOM layer is the paper,
posters, video, and all text. The WebGL layer never renders a glyph.

---

## Hover set

Site-wide the hover vocabulary is exactly four ids: **`glint`**, **`nav-echo`**,
**`image-lens`**, **`underline-travel`**. Nothing else is added without a new row here.

**H1 — No hover moves a hit target.** Not by transform, not by margin, not by size. The
material moves inside a stationary box. `intent-motion.css:4` disables the inherited
button lift for this reason; `header-ribbon.ts:5` states the same rule for the nav.

**H2 — Hover-out reverses on the same curve.** `easeReverse:true` on a paused tween played
forward on `pointerenter` and reversed on `pointerleave`
(`EditorialMotion.tsx:94`, `:98`; `FloorMenuScene.tsx:321`). Never a second tween with a
second ease; never a snap-back.

**H3 — Fine pointer only.** Every hover effect is built inside a
`(hover: hover) and (pointer: fine)` `matchMedia` condition
(`EditorialMotion.tsx:170`) or guarded per-event against `pointerType === 'touch'`
(`intent-motion.ts:37`). A touch device gets the settled state, never a stuck hover.

**H4 — Focus gets the same affordance.** `focus` activates and `blur` resets, on the same
tween as hover (`intent-motion.ts:44-45`, `header-ribbon.ts:38`). Keyboard users see the
same material response.

**H5 — No frosted panels, no custom cursor, no magnetic buttons.** Rejected explicitly
(`CLAUDE.md`). `nav-material` is a gradient plus inset box-shadows, **not**
`backdrop-filter` — `nav-menu.css:332` pins `backdrop-filter: none` so this cannot drift.

**H6 — Reduced motion removes the effect, not the affordance.** `.intent-glint` is
`display: none` under reduce (`intent-motion.css:6`); the nav's transitions go to `none`
(`header-ribbon.css:24`); the link is still a link, still focusable, still underlined by
its own static styling.

---

## Rows — implemented

Measured from this tree on 2026-09-18.

### Text

| id | kind | status | duration | ease | property | trigger | reduced-motion | reference | owner |
|---|---|---|---|---|---|---|---|---|---|
| `line-rise` | text | implemented | 0.6 s, stagger 0.055 (desktop) / 0.04 (≤680 px), clamped by T6 | `power3.out` | per-line `yPercent` 30→0 (compact 20→0) + `opacity` 0→1, inside `mask:'lines'` | `revealChapter` on the director's `readingChapter` (reading line = `scrollY + 0.66 × vh`) | Settled position, `clearProps:'all'`, split reverted | native (G2) | `src/lib/motion/headline-motion.ts:35` · `src/components/motion/JourneyMotion.tsx:121` |
| `lateral-curtain` | text | implemented | 0.6 s, stagger 0.06 / 0.04 | `power3.out` | per-line `xPercent` −13→0 (compact −8→0) + `opacity` 0→1, masked | same as `line-rise`; cast on `garage`, `commercial` | Settled position | native (G2) | `src/lib/motion/headline-motion.ts:41` |
| `depth-settle` | text | implemented | 0.6 s, stagger 0.05 / 0.035 | `power3.out` | `y` 14→0, `z` −42→0, `rotationX` 4→0 at `transformPerspective` 900 (compact 8 / −22 / 2.5 / 760) + `opacity` | same as `line-rise`; cast on `vault`, `consultation` | Settled position | native (G2) | `src/lib/motion/headline-motion.ts:47` |
| `epoxy-mask` | text | implemented | 0.6 s, stagger 0.04 / 0.03 | `power3.out` | `clip-path` polygon, a 13-point ragged resin edge sweeping 0%→112% across the line box; `willChange:'clip-path'`, no `transformOrigin` | same as `line-rise`; cast on `finish-hall` | Settled clip-path (`EPOXY_MASK_TO`) | native (G2) | `src/lib/motion/headline-motion.ts:53` (shapes at `:20-21`) |
| `label-curtain` | text | implemented | 0.35 s, stagger 0 | `power3.out` | `xPercent` −8→0 + `opacity` 0→1 on `.eyebrow`, `.lead`, `.chapter-link` | `revealChapter`, alongside the headline it supports | `gsap.set(clearProps:'all')` on preference change | native (G2) | `src/lib/motion/headline-motion.ts:99` · `src/components/motion/JourneyMotion.tsx:161` |
| `char-fold` | text | implemented | 0.8 s, stagger 0.02 | `expo.out` | per-char `yPercent` 110→0, `rotateX` −40→0 about `50% 100%`, inside `mask:'lines'`; `aria:'auto'` | `ScrollTrigger` `top 80%`, `once:true` | Not built: whole stage skipped under `still`; heading renders settled | gsap.com clip wrappers | `src/components/motion/EditorialMotion.tsx:44` |
| `char-float` | text | implemented | 1 s, stagger 0.03 | `back.inOut(2)` | per-char `opacity` 0→1, `yPercent` 120→0, `scaleY` 2.3→1, `scaleX` 0.7→1 | scrubbed, `top 85%` → `top 45%` (T5's sanctioned exception) | Not built; `.sr-only` twin removed on revert, eyebrow renders as plain text | Young Multi | `src/components/motion/EditorialMotion.tsx:32` |
| `statement-words` | text | implemented | 0.95 s, stagger 0.1 | `power3.out` | per-word `yPercent` 118→0, `rotate` 5→0, inside `mask:'words'` | `top 88%`, `toggleActions:'play none none reset'` | `matchMedia` branch not built; statement static | gsap.com word masks | `src/scripts/preparation-layers.ts:181` |
| `caption-wipe` | text | implemented | 0.75 s parts, stagger 0.05; 0.6 s rule | `power3.out` parts, `power2.out` rule | caption parts `yPercent` 108→0 inside a clip; `[data-prep-rule]` `scaleX` 0→1 | per-layer `top ${72 − i×3}%`, `toggleActions:'play none none reverse'` | Not built; captions static and fully legible | isladjan `abdyPBw` | `src/scripts/preparation-layers.ts:202` |
| `editorial-reveal` | text | implemented | 0.85 s, stagger 0.09 | `power3.out` | children `y` 36→0 + `opacity` 0→1 | `top 91%`, `once:true`, skipped when `alreadyRead(el, .91)` | Not built; block renders settled | native (G2) | `src/components/motion/EditorialMotion.tsx:174` |
| `rating-clip` | text | implemented | 1.05 s number; 0.5 s stars, stagger 0.07, offset +0.34 s | `expo.out` number, `power2.out` stars | `.rating-number` `yPercent` 118→0 through its own clip; stars `scale` 1.08→1 + `opacity` about `50% 60%` | `top 88%`, `once:true`, skipped when `alreadyRead(el, .88)` | Not built; the real 5.0 is printed, never counted up | native | `src/components/motion/EditorialMotion.tsx:67` |
| `lateral-card-arrival` | text | implemented | 0.7 s, stagger 0.08 | `power3.out` | per-card `x` ±64 px by index parity, `y` 32→0, `opacity` 0→1 | `top 94%`, `once:true`, skipped when `alreadyRead(el, .94)` | Not built; cards static, revealed by intersection | A4 alternating arrivals | `src/components/motion/EditorialMotion.tsx:83` |
| `story-photo-arrival` | text | implemented | 1.35 s image; 0.7 s caption at +0.35 s | `power3.out` | `<picture>` `xPercent` ±5 by index parity, `y` 42→0, `scale` 0.965→1, `opacity`; `<figcaption>` `y` 12→0 + `opacity` | `top 88%`, `once:true`, skipped when `alreadyRead(el, .88)` | Not built; photograph and caption static | ERA counter-parallax | `src/components/motion/EditorialMotion.tsx:180` |

### Scene — the film veil (shader, `full` tier only)

All five modes are scrubbed by `transitionProgress`; there is no GSAP tween and no
duration. The only curve is the shader's own `easeInOut(t) = t²(3 − 2t)`
(`FilmVeil.tsx:53`), applied to progress before each mode shapes its front. Every mode
adds `staticUndulation(uv)` (`FilmVeil.tsx:58`: a 2π broad sine at ±0.018 plus a 4π fine
sine at ±0.007) so no front is a straight line, and every mode blooms toward
`rgb(248, 247, 243)` on a `sin(pπ)` envelope so the seam carries light.

Common reduced-motion contract: the shader is gated to the `full` tier
(`CLAUDE.md`), `balanced` runs `handoff-crossfade` instead, and `still` swaps
end states with no transition. `uVisible` 0 writes `vec4(0.0)` — fully transparent —
so a refused veil never tints the plates (`FilmVeil.tsx:68`).

| id | kind | status | duration | ease | property | trigger | reduced-motion | reference | owner |
|---|---|---|---|---|---|---|---|---|---|
| `white-dissolve` | scene | implemented | scrub over the boundary's `transitionProgress` 0→1 | shader `smoothstep(0.22, 0.78, p + organic)`; bloom `pow(sin(pπ), 1.45) × 0.62` | whole-frame blend weight `tFrom`→`tTo`; the widest bloom of the five | `portico:foundation`; storyboard also casts it 6→S2 and 8→9 | `handoff-crossfade` (`balanced`) / end-state swap (`still`) | Igloo Inc render-target blend | `src/components/motion/FilmVeil.tsx:81` · cast at `src/lib/motion/journey-transitions.ts:24` |
| `aperture` | scene | implemented | scrub | `easeInOut(p)` mapped to an aperture radius −0.25→1.05; feather ±0.16 | radial front on `max(\|u−.5\|×0.82, \|v−.5\|)` with the aspect clamped at 1.65; gaussian light σ 0.17 × 0.16 | `garage:vault`; storyboard casts 7→8 | as above | Igloo Inc | `src/components/motion/FilmVeil.tsx:84` · cast at `journey-transitions.ts:26` |
| `fold` | scene | implemented | scrub | `easeInOut(p)` mapped −0.24→1.24; feather ±0.15 | vertical front travelling on `uv.x` (or `1 − uv.x` when `direction` is −1); gaussian light σ 0.16 × 0.13 | default style, plus `vault:finish-hall` (−1), `finish-hall:commercial` (+1), `commercial:proof` (−1), `proof:consultation` (+1) | as above | Creative Ocean | `src/components/motion/FilmVeil.tsx:90` · cast at `journey-transitions.ts:21`, `:27-30` |
| `resin-wipe` | scene | implemented | scrub | `easeInOut(p)` mapped −0.18→1.18; feather ±0.14 | front rises on `uv.y` displaced by `staticUndulation(uv.yx) × 2.35` so the resin edge is uneven; strongest light term, σ 0.12 × 0.2 | the `customer-reviews` white-target wipe | as above | Creative Ocean `qBbBLyB` | `src/components/motion/FilmVeil.tsx:96` · cast at `journey-transitions.ts:34` |
| `preparation-curl` | scene | implemented | scrub | `easeInOut(p)` mapped −0.2→1.2; feather ±0.11 (the tightest front) | directional front on `uv.x` bowed by `sin(uv.y π) × 0.075` and 1.8× the organic term, so the edge curls rather than wipes; light σ 0.105 × 0.18 | `foundation:garage` | as above | isladjan `abdyPBw` | `src/components/motion/FilmVeil.tsx:101` · cast at `journey-transitions.ts:25` |

### Scene — media handoff and film clock

| id | kind | status | duration | ease | property | trigger | reduced-motion | reference | owner |
|---|---|---|---|---|---|---|---|---|---|
| `handoff-crossfade` | scene | implemented | scrub; the fade occupies `transitionProgress ∈ [0.38, 0.62]` (0.5 ± feather 0.12) | analytic smoothstep `v²(3 − 2v)` inside `dissolveWeight` | `--handoff` on `.journey`, read as the incoming plate's `opacity` | any boundary where the veil has not confirmed a painted frame; it *is* the transition in `balanced` | This is itself the reduced path; `still` swaps end states with no fade | native | `src/lib/motion/journey-director.ts:238` (feather `:85`) · written `JourneyMotion.tsx:253` · consumed `src/styles/journey.css:54` |
| `frame-zero-hold` | scene | implemented | scrub; held for the whole boundary interior | n/a (a clamp, not a curve) | the incoming chapter's `video.currentTime` pinned to 0 — its poster frame — every frame of the interior | `transitionProgress` strictly between 0 and 1 | Videos paused and `preload='none'`; the poster is the picture | native | `src/components/motion/JourneyMotion.tsx:295` |
| `film-scrub` | scene | implemented | scrub over the chapter's own window | direct for every chapter except `foundation`, which is `smoothstep` over `chapterProgress ∈ [0.14, 0.84]` | `video.currentTime = progress × duration`, with a 0.12 s seek tolerance so repeated requests inside the window are free | active chapter, document visible, not `saveData`, outside a boundary interior | Paused on frame 0; poster carries the act | Terminal Industries scrubbed sequence | `src/lib/motion/journey-film-timing.ts:15` · driven `JourneyMotion.tsx:283` |

### Scene — the preparation diagram

One shared `ScrollTrigger` window (`top 80%` → `bottom 20%`) with a **different scrub lag
per layer**, which is the whole mechanic: scroll slowly and the stack reads as one body,
scroll fast and the plates separate by lag, then close again when the scroll stops.
Every layer timeline is padded to the same `SPAN` of 2.8 so the per-layer offsets stay
proportional after ScrollTrigger normalizes them. Nothing here writes a layout property.

| id | kind | status | duration | ease | property | trigger | reduced-motion | reference | owner |
|---|---|---|---|---|---|---|---|---|---|
| `layered-scrub` | scene | implemented | scrub; per-layer lag **1 · 1.6 · 2 · 2.4 · 2.8 · 3.2 · 3.6 s** (slab, grind, repair, primer, base, flakes, topcoat), each tween 1.25 s long inside its timeline, placed at `i × 0.07` | `power2.out` per layer; the lag itself is ScrollTrigger's own smoothing, not an ease | per-group `y` 40/40/40/73/96/118/140 → 0, `x` −32/−32/−32/−58/−77/−94/−112 → 0, `opacity` 0→1 | `[data-prep-stage]`, `top 80%` → `bottom 20%` | `matchMedia` branch not built; `section[data-prep-motion="still"]`, diagram assembled and labelled | isladjan `abdyPBw` | `src/scripts/preparation-layers.ts:87` (specs `:23-31`) |
| `layer-drift` | scene | implemented | scrub, lag 0.6 s | `none` (linear against scroll) | `[data-prep-figure]` `y` 44 → −44 across `top bottom` → `bottom top` | the diagram entering and leaving the viewport | Not built; figure static | isladjan | `src/scripts/preparation-layers.ts:75` |
| `grind-swirl` | scene | implemented | scrub; 0.95 s ellipses (stagger 0.055) at +0.18, 0.8 s dust at +0.3 | `none` ellipses, `power1.out` dust | `drawSVG` `50% 50%` → `0% 100%` on the swirl ellipses; dust `opacity` 0→1, `y` 26→0 | inside the `grind` layer timeline | Not built; swirls fully drawn | isladjan | `src/scripts/preparation-layers.ts:102` |
| `crack-repair` | scene | implemented | scrub; 0.35 s crack reveal at +0, 0.95 s fill (stagger 0.12) at +0.35 | `none` crack, `power1.inOut` fill | cracks `opacity` 0→0.85; `drawSVG` `0% 0%` → `0% 100%` draws the repair fill along each crack | inside the `repair` layer timeline | Not built; cracks and fills drawn | isladjan + DrawSVG | `src/scripts/preparation-layers.ts:117` |
| `flake-fall` | scene | implemented | scrub; 0.55 s, stagger `{each: 0.004, from: 'random'}` at +0.1 | `power2.out` | flakes `y` −120→0, `opacity` 0→0.95, `scale` 0.3→1, `rotation` −80→0 | inside the `flakes` layer timeline | Not built; flakes at rest on the coat | native | `src/scripts/preparation-layers.ts:132` |
| `topcoat-edge` | scene | implemented | scrub; 0.8 s at +0.45 | `power2.out` | `drawSVG` `50% 50%` → `0% 100%` and `opacity` 0→0.9 on the clear-coat edge | inside the `topcoat` layer timeline | Not built; edge drawn | isladjan + DrawSVG | `src/scripts/preparation-layers.ts:149` |
| `gloss-sweep` | scene | implemented | 1.8 s, `repeat: −1`, `repeatDelay` 2.6 s | `power1.inOut` | gradient **attributes** `x1` −220→960, `x2` 20→1200 on `#prep-gloss` — an attribute sweep, not a transform | `ScrollTrigger.onToggle` over `bottom 72%` → `bottom −30%`; paused when off screen, so it never runs unseen | Not built; gradient parked at its start | isladjan sky ramp | `src/scripts/preparation-layers.ts:164` |

### Scene — the resin layer mask

Spike C, landed. The storyboard calls this `resin-layer-mask`; the code's ScrollTrigger id
and its header comment say `resin-mask`. **Canonical id: `resin-layer-mask`**;
`resin-mask` is the ScrollTrigger id only and must not be cited as a vocabulary id.
Deviation on record: the storyboard proposed `end:'+=200%'`, the implementation uses
`+=180%` — the shorter pin measured better against the reading-zone gate and stands until
Step 24 re-argues it.

| id | kind | status | duration | ease | property | trigger | reduced-motion | reference | owner |
|---|---|---|---|---|---|---|---|---|---|
| `resin-layer-mask` | scene | implemented | scrub 1 (fine pointer) / `true` (coarse), pinned `top top` → `+=180%`, `anticipatePin: 1` | timeline default `none`; all shaping is positional | one tween raises **both** copies of the poured-resin silhouette — the visible gloss plate and the `<mask>` body — `y` `h × 1.02` → `−h × 0.22` over 0.84 of the timeline at offset 0.08, so the statement is revealed inside the resin's own edge. Under it: photo `scale` 1.17→1 with `xPercent` 2.4→−3.2, veil `opacity` 0.1→0.36, vignette 0.22→0.56, under-pour `y` `h×1.04` → `−h×0.34`, statement counter-drift `h×0.13` → `−h×0.03` | the stage reaching the top of the viewport | `buildStill()`: `data-resin-mode="still"`, settled heading over the static plate, no pin | Creative Ocean `qBbBLyB` | `src/scripts/resin-reveal.ts:222` · markup `src/components/home/ResinReveal.astro:96` |
| `specular-window` | scene | implemented | scrub; 0.84 s travel at offset 0.08, 0.07 s fade in at 0.08 and out at 0.87 | `none` | a `drawSVG` window of fixed width 0.17 walked from −0.17 to 1 along the rim path, painted on both the hairline and its soft twin; stroke widths are viewport-relative (`max(1.2, w × 0.0017)` and 2.8×) so it is a hairline on a phone | rides the `resin-layer-mask` timeline | Not built | Creative Ocean | `src/scripts/resin-reveal.ts:265` (painter `:205`) |
| `meniscus-filter` | scene | implemented | scrub (rides the plate; the filter itself is static) | none — a fixed displacement field, not a tween; its motion is entirely the plate's | `feTurbulence` `fractalNoise` `baseFrequency="0.005 0.022"`, 1 octave, seed 7 → `feDisplacementMap scale="13"`, with the filter region clamped in JS to the meniscus band only (`height = amplitude × 2.4 + band × 0.9`) so turbulence never rasterises a full frame on a scrub tick | applied to the meniscus path for the life of the pin | Not built; plate renders unfiltered | Creative Ocean | `src/components/home/ResinReveal.astro:78` · region `src/scripts/resin-reveal.ts:164` |

**Finding worth keeping: `mask-type: alpha` is load-bearing.** `ResinReveal.astro:98`
sets it as both an attribute and an inline style. The SVG default is a *luminance* mask,
which makes Chrome run a luminance conversion over the whole declared mask region on
every frame of the scrub. With `mask-type: alpha` the mask body is used directly. Any
future mask-based reveal (`shrink-to-card`, `tile-resolve`) inherits this rule, together
with the companion rule already applied here: clamp the mask region and the paper rect it
reveals to the frame plus a 2 % pad, because an oversized mask region is the single most
expensive thing this mechanic can do.

### Scene — the floor plane

| id | kind | status | duration | ease | property | trigger | reduced-motion | reference | owner |
|---|---|---|---|---|---|---|---|---|---|
| `material-morph` | scene | implemented | **0.6 s** discrete (`SURFACE_MORPH_DURATION`); `scrub` when the director drives it | **`power2.inOut`** (`SURFACE_MORPH_EASE`); none when scrubbed | `uMix` blends `uMaterial` between two of the eight states (0 liquid pearl → 7 paper). Scrubbed form: `setMix(transitionProgress)` with no tween, so nothing competes with the coordinate the director owns. Discrete form: `gsap.quickTo`, which reuses one tween instance — so an interrupted morph **reverses on the same ease** instead of snapping and restarting | boundary `transitionProgress` (scrubbed); nav-menu hover, dev page, `webglcontextrestored` (discrete) | CSS fallback band swaps its gradient with a 300 ms opacity fade; under `still` the band's transitions are `none` | Step 18 floor plane | `src/lib/motion/surface-materials.ts:143` · scrubbed `src/lib/motion/surface-store.ts:415` · discrete `surface-store.ts:391` · driver `src/components/motion/SurfaceFloor.tsx:263` · fallback `src/styles/surface.css:46` |
| `settle` | scene | implemented | **0.5 s** (`SURFACE_SETTLE_DURATION`) | **`power2.out`** (`SURFACE_SETTLE_EASE`) | every live uniform damps to rest in one pass: `uSweep` → nearest integer, `uPlaneOpacity` → 0 or 1 by horizon mode, `uHorizonOpacity` → 1 or the 0.1 floor | the two silences (S1, S2), and the footer at the end of Act 10 | Immediate rest; the horizon line is already at its resting opacity | Igloo damped progress | `src/components/motion/SurfaceFloor.tsx:319` · constants `surface-materials.ts:146` |
| `sweep` | scene | implemented | caller's duration; **1.6 s** default, **1.08 s** when raised by a `material-morph` (`0.6 × 1.8`) | **`none`** — a specular sweep must travel at constant speed or it reads as a wobble | `uSweep` advanced by exactly +1 (one full pass of the shader's specular band), then stopped: when the tween ends nothing keeps advancing | follows every discrete `material-morph` | Not driven; `uSweep` stays where it is | native | `src/components/motion/SurfaceFloor.tsx:308` · raised `surface-store.ts:399` |
| `horizon` | scene | implemented | **0.6 s** (`SURFACE_MORPH_DURATION`), or 0 on bind | `power2.inOut` | `uPlaneOpacity` 1→0 and `uHorizonOpacity` 0.1→1: the plane switches off and a **1 CSS-pixel** cobalt `#164f83` line at 62 % viewport height becomes the whole scene | `whiteStageActive` from the director, via `chapterSurfaceTarget` | Line drawn at its target opacity with no tween | storyboard S1 / S2 / Act 9 | `src/components/motion/SurfaceFloor.tsx:291` · colour and height `surface-materials.ts:139-141` |
| `material-lens` | scene | implemented | scrub, lag 0.6 s | `none` | `[data-material-lens]` `y` 38 → −22, `x` 12 → −12 across `#foundation` `top bottom` → `bottom top` | the foundation act passing the viewport | Not built; lens static | native | `src/components/motion/EditorialMotion.tsx:191` |

### Layout — navigation

| id | kind | status | duration | ease | property | trigger | reduced-motion | reference | owner |
|---|---|---|---|---|---|---|---|---|---|
| `flip-menu` | layout | implemented | open **0.7 s** Flip, stagger 0.04, at +0.06 s; close **0.52 s**, stagger `{each: 0.03, from: 'end'}`. Chrome: veil 0.62 s @0, floor 0.9 s @0.08, spine 0.9 s @0.12, indices 0.55 s @0.4, stations 0.55 s @0.45, dots 0.5 s @0.48, meta 0.6 s @0.5 | Flip `power3.inOut`; open timeline default `power3.out`, close default `power2.in`; veil `power3.inOut`, floor `power2.out`, spine `power2.inOut`, dots `back.out(2.4)` | the header's own `<nav>` is physically moved into the overlay and Flip animates each label span — `scale: true`, `absolute: false`, so the whole flight is **transform only** and the browser reports zero layout shift. A frozen `.nav-slot` holds the header's grid column open. Veil `clip-path` `inset(0 0 100% 0)` → `inset(0)`; spine `drawSVG` 0→100 % | toggle click, Escape, link click, outside click, viewport-class change | `choreographed()` false → no Flip state captured, `clearProps` on the chrome, menu opens and closes instantly with focus moved correctly | gsap Flip | `src/components/nav/nav-menu-controller.ts:296` (open) · `:322` (close) · vars `:42` |
| `nav-parallax` | layout | implemented | 0.7 s | `power3.out` | `--nav-parallax-x/y` on the panel, hard-capped at **±8 px** at depth 1 (`±16`/`±12` px of pointer range) | pointer move inside the open overlay, rAF-throttled | Not driven; parallax reset to 0 | native | `src/components/nav/nav-menu-controller.ts:268` |
| `floor-blend` | layout | implemented | **0.45 s** | **`power2.out`, `easeReverse: true`** | hovering a destination blends the live floor plane toward that act's finish by raising one shader weight uniform (`uWeightPearl` / `Grey` / `Cobalt` / `Salt` / `Fade`) — a weight, not a swapped material, so a fast pointer never stalls on a compile | `pointerenter` / `focus` on a menu link; `pointerleave` on the list clears it | Menu is not choreographed; floor holds its state | Step 18 floor plane | `src/components/nav/FloorMenuScene.tsx:321` · dispatch `nav-menu-controller.ts:255` |
| `floor-sweep` | layout | implemented | **7.2 s**, `repeat: −1` | **`none`** | `uSweep` drives a `pow(sin(...), 18)` specular band across the menu floor; GSAP owns time, the renderer stays on demand and is invalidated on every second tick | the menu floor being mounted | Not started | native | `src/components/nav/FloorMenuScene.tsx:296` |
| `nav-material` | hover | implemented | **0.48 s** (0 s when `still()`), plus a 180 ms CSS opacity fade on the plate itself | `power3.out`, `overwrite: true` | the highlight plate's `x`, `y`, `width`, `height` move to the hovered link's measured box. **The highlight moves; the links and their hit areas never do.** The plate is a gradient with inset box-shadows — not `backdrop-filter` | `pointerenter` / `focus` on a nav link; `pointerleave` / `focusout` restores to `aria-current`; re-seated after the Flip menu hands the nav back | `duration: 0`, so the plate jumps to the focused link with no travel; `header-ribbon.css:24` drops the CSS transitions | native | `src/scripts/header-ribbon.ts:30` · plate `src/styles/header-ribbon.css:8` |
| `header-progress` | layout | implemented | none — no tween exists; the value is recomputed each rAF | none — strictly linear in scroll position, by definition: a progress rule that eased would lie about where the visitor is | `transform: scaleX(scrollY / (scrollHeight − innerHeight))` on a 2 px gradient rule pinned to the header's bottom edge | scroll, rAF-coalesced | Still written — a progress indicator is information, not decoration | native | `src/scripts/header-ribbon.ts:44` · `src/styles/header-ribbon.css:15` |
| `ribbon-progress` | layout | implemented | none — no tween exists; the value is recomputed each rAF | none — linear in the hero's own scroll position, clamped to 0…1 | `--ribbon-progress` 0→1 as the hero passes, derived from `−rect.top / (rect.height − innerHeight × 0.35)` | scroll while `#portico` is on screen | Pinned to 0 | native | `src/scripts/header-ribbon.ts:47` |

### Hover

| id | kind | status | duration | ease | property | trigger | reduced-motion | reference | owner |
|---|---|---|---|---|---|---|---|---|---|
| `glint` | hover | implemented | **0.36 s** position, **0.2 s** opacity | `power3.out` position, `power2.out` opacity | a 9 rem radial highlight at `z-index: −1` inside the link tracks the pointer via `gsap.quickTo` on `x`/`y`, clamped to the link's own box. **A moving reflection inside a stationary link**: the hit target never changes, and `intent-motion.css:4` cancels the inherited button lift | `pointerenter` / `pointermove` on fine pointers only, and `focus` for keyboard parity; reset on `pointerleave`, blur, scroll, resize, tab hide | `.intent-glint { display: none }`; every tween killed and opacity set to 0 | native | `src/scripts/intent-motion.ts:19` · `src/styles/intent-motion.css:3` |
| `nav-echo` | hover | implemented | **420 ms** | `cubic-bezier(.2, .8, .2, 1)` | two stacked copies of the label inside an `overflow: clip` window: the ink label leaves upward (`translateY(−110%)`) as its cobalt echo arrives from below (`110%` → `0`). CSS only — no JS, no measurement, nothing to keep in sync | `:hover` / `:focus-visible` on a header nav link | `transition: none` under reduce, `[data-header-still]`, and `html[data-journey-motion='still']` — the echo swaps instantly | native | `src/styles/header-ribbon.css:11` |
| `underline-travel` | hover | implemented | **0.18 s** | **`power2.out` with `easeReverse: true`** — hover-out retraces the same curve | `.link-rule` `scaleX` 0→1 on a paused tween played forward on `pointerenter` and reversed on `pointerleave` | fine pointer only, built inside the `finePointer` `matchMedia` condition | Stage not built; the link keeps its static rule | gsap.com `easeReverse` | `src/components/motion/EditorialMotion.tsx:97` |
| `ribbon-underline` | hover | implemented | **350 ms** | `cubic-bezier(.22, 1, .36, 1)` | `transform: scaleX(0→1)` from the left on a 2 px cobalt rule under a hero-ribbon link. The CSS-only sibling of `underline-travel`; Step 28 folds the two into one id when it takes the site-wide hover pass | `:hover` / `:focus-visible` | inherits the global reduced-motion transition reset | gsap.com underline | `src/styles/journey.css:72` |
| `card-ring` | hover | implemented | **0.18 s** | **`power2.out` with `easeReverse: true`** | `box-shadow: 0 0 0 1px rgba(22, 79, 131, .55)` — a 1 px cobalt ring drawn **outside** the box, so nothing reflows and no hit target moves | `pointerenter` / `pointerleave` on a review card, fine pointer only | Stage not built; card is static | native | `src/components/motion/EditorialMotion.tsx:93` |

---

## Rows — planned

Storyboard §7 values, carried verbatim except where a column was unspecified and has been
resolved here. Each row names the step that will own it; that step may not change a value
in this table without amending this file in the same commit.

| id | kind | status | duration | ease | property | trigger | reduced-motion | reference | owner |
|---|---|---|---|---|---|---|---|---|---|
| `word-converge` | text | planned | 0.9 s total, stagger 0.05 s | `power3.out` | per-word `x`/`y` ±48 px, direction by word index (L, R, below, above) + `opacity`, inside `mask:'words'` | Act 1 entrance; Act 10 replays it as a bookend along the same paths | Static, settled position | A4 "words from different directions"; gsap.com clip wrappers | Step 17 → `src/lib/motion/headline-motion.ts` |
| `word-swap` | text | planned | 0.45 s per swap | `power2.inOut` | one word is masked out upward while its replacement arrives from below in the same clip — "Concrete → Coated" | Act 5 eyebrow, driven by the front card's index | Both words printed, static, joined by the arrow | gsap.com | Step 23 → `src/components/projects/TransformationGallery.tsx` |
| `caption-drift` | text | planned | 0.5 s, 0.12 s lag behind its parent | `power2.out` | 12 px translate **along the axis of travel** (T1) + `opacity` | its parent layer or tile resolving | Static | isladjan per-layer lag | Step 21 → `src/components/motion/EditorialMotion.tsx` |
| `image-lens` | hover | planned | 0.4 s in, same out | `power3.out`, `easeReverse: true` | a magnifier inset follows the pointer over a photograph and shows the same image at a higher scale. Moves no hit target (H1); fine pointer only (H3) | `pointerenter` / `pointermove` on a lens-bearing figure | Tap-to-toggle static inset on touch; nothing under `still` | A4 material lens | Step 28 → `src/scripts/intent-motion.ts` |
| `hold-window` | layout | planned | scrub — a published progress range per act | n/a | freezes every scroll-linked transform at its end value inside the range, so the act is **physically still** while it is being read | the director publishing the range for the active act | Whole act static | A4 "stops for reading"; aurahomes | Step 17 → `src/lib/motion/journey-director.ts` (publisher), consumers via `gsap.matchMedia` |
| `page-wipe` | layout | planned | 0.5 s out, 0.6 s in | `power2.inOut` | a paper field wipes across the viewport between routes while the persistent canvas and header stay mounted; islands tear down on `astro:before-swap` | `<ClientRouter />` navigation | Instant swap, no wipe; focus moved to the new `<h1>` | Astro view transitions | Step 12 → `src/layouts/BaseLayout.astro` |
| `swallow` | scene | planned | scrub over 0.8 vh | `none`; `power2.inOut` shaping on scale | the incoming film opens as a small rectangle at the stair's top landing and grows until it swallows the frame | Act 3 → Act 4 boundary | Crossfade to the incoming act | A4 "one scene swallows the other" | Step 22 → `src/lib/motion/journey-transitions.ts` |
| `fold-and-shoot-left` | scene | planned | scrub over 0.6 vh per fold | `none` | the whole screen folds into itself and shoots left; the next room slides in from the right under a `resin-swirl-plate` | Act 4's two interior room changes | `handoff-crossfade` between the three posters | A4 "fold the screen into itself" | Step 22 → `src/lib/motion/journey-transitions.ts` + `FilmVeil.tsx` |
| `horizontal-pull` | scene | planned | scrub over 0.4 vh | `none` | paper bleeds in from the left and right edges while the outgoing scene contracts between them | rides `shrink-to-card` at the Act 4 → 5 boundary | Paper simply present | A4 horizontal pulls | Step 23 → `src/lib/motion/journey-transitions.ts` |
| `shrink-to-card` | scene | planned | scrub over 0.6 vh | `none`; `power2.inOut` shaping on scale | full-bleed scene `scale` 1 → 0.32 translating into the front-card slot, with `horizontal-pull` under it | Act 4 → Act 5 boundary | Crossfade to the card | A4 "swallow", inverted | Step 23 → `journey-transitions.ts` + `TransformationGallery.tsx` |
| `resin-swirl-plate` | scene | planned | loop, ≈ 2 s per pass | `none` | a cobalt-recoloured, alpha-keyed resin loop (VP9 alpha WebM) bridges each fold in Act 4 | plays only inside a `fold-and-shoot-left` | Omitted entirely — its PNG still renders at 0 % opacity, so the fold reads as a plain crossfade | Young Multi ink plate, recoloured | Step 22 → `src/components/motion/FilmVeil.tsx` |
| `perspective-cylinder` | layout | planned | scrub across the act | `none` (`scrub: true`) | approved before/after pairs laid on a CSS-3D cylinder, `rotateY` driven by scroll; the front card is flat, largest, and carries the only live divider (an `<input type="range">` for keyboard) | Act 5, pinned inner wrapper only | Native horizontal snap ribbon, one card per screen, divider on every card, no pin | jh3y `PovoorJ` | Step 23 → `src/components/projects/TransformationGallery.tsx` |
| `unwrap-to-lattice` | scene | implemented | scrub over the act's first 0.20 (≈ 0.7 vh of a 3.5 vh act) | `none` | the gallery's published front-slot rect (`data-front-slot`) is turned into a transform with `Flip.fit(..., { scale: true, getVars: true })` and scrubbed back to identity, while the other 95 tiles fade and scale up in an outward stagger keyed on `--al-d`, their normalised distance from the lead tile | the `archive` chapter becoming active | Same stagger with no Flip: the lead tile enters from a centred card rect | jh3y cylinder → Lusion | Step 23b → `src/components/home/ArchiveLattice.tsx:47` (tag), `:331` (`buildUnwrap`) |
| `lattice-flyover` | scene | planned | scrub over 2.0 vh | damped, λ 4 (`MathUtils.damp`) | camera pitch 0 → 55°, diagonal `x`/`z` drift across the 12 × 8 photograph plane, then a push-in; per-tile `y` ripple ≤ 0.004 | Act 6 interior | CSS grid opacity stagger, no camera | Igloo damped progress; A4 lattice | Step 23b → `src/components/home/ArchiveLattice.tsx` — **still planned.** Step 23b shipped the DOM half of Act 6 only. The base layer it would sit on (a real two-axis wrapping parallax drift over 96 `<img>` tiles, with per-row/per-column lag) is live and is what a `full`-tier visitor sees today; the WebGL camera over `archive-atlas-2048.webp` is not built, and the file carries a documented hook for it rather than a tag |
| `tile-resolve` | scene | implemented | scrub over the act's last 0.12 (≈ 0.4 vh), settled before the exit boundary | `none` | `Flip.from(state, { absolute: true, scale: true })`, scrubbed: one tile leaves the lattice for the sticky host's own rect — which is the viewport's for the whole stuck window — while the full-resolution `<picture>` beneath it fades up on `--al-resolve` and every other tile fades out. `scale: true` rather than Flip's default width/height animation, because a visible element resized frame by frame is a layout shift and the act's budget is 0.02 | the diagonal drift completing | Crossfade; in `still` the tile simply sits full-width in the CSS grid with its caption | gsap Flip | Step 23b → `src/components/home/ArchiveLattice.tsx:48` (tag), `:389` (`enterResolve`) |
| `stair-dolly` | scene | planned | scrub over 1.5 vh | damped, λ 4 | camera `z` 0 → −0.08, `y` +0.02, pitch ≤ 2° over the 2.5D depth plate | Act 3's first half | Scrubbed `scale(1 → 1.06)` on the still | aurahomes dolly; Pioneer A/B blend | Step 20 → `src/components/motion/StairAscent.tsx` |
| `layer-explode` | scene | planned | scrub over 1.5 vh | `none`; per-slab scrub lag `1 + i × 0.6` s | six slabs lift apart: `y` offset 0 → 0.02 × i, top slab `opacity` 1 → 0.35, DrawSVG labels naming each | Act 3's second half, `full` tier only | The shipped `layered-scrub` SVG cutaway **is** the `balanced`/`still` version | isladjan `abdyPBw` | Step 20 → `StairAscent.tsx` (`full`) · `src/scripts/preparation-layers.ts` (others) |

---

## Where each id must be tagged

Step 14 owns documentation, not components, so it does not insert these. Each line is an
instruction to the step in its last column: add `@motion <id>` to the block comment at
that anchor, or create the comment if there is none.

| id(s) | Anchor | Step that adds the tag |
|---|---|---|
| `line-rise`, `lateral-curtain`, `depth-settle`, `epoxy-mask` | `src/lib/motion/headline-motion.ts:34` (`DESKTOP_SPECS`), one tag per spec key at `:35`, `:41`, `:47`, `:53` | 17 |
| `label-curtain` | `src/lib/motion/headline-motion.ts:92` (`headlineMotionSpec`, the `target === 'label'` branch) | 17 |
| `word-converge` | new spec entry beside the four above | 17 |
| `white-dissolve`, `aperture`, `fold`, `resin-wipe`, `preparation-curl` | `src/lib/motion/journey-transitions.ts:23` (`TRANSITIONS`) and `:33` (`WHITE_TARGET_TRANSITIONS`) — one tag per `kind` | 17 |
| `handoff-crossfade` | `src/lib/motion/journey-director.ts:84` (the `JOURNEY_HANDOFF_FEATHER` doc comment) | 17 |
| `frame-zero-hold`, `film-scrub` | `src/components/motion/JourneyMotion.tsx:289` (the existing frame-0 comment) and `src/lib/motion/journey-film-timing.ts:12` | 17 |
| `hold-window` | `src/lib/motion/journey-director.ts`, on the new publisher | 17 |
| `flip-menu`, `nav-parallax` | `src/components/nav/nav-menu-controller.ts:13` (module comment) and `:261` (the parallax section banner) | 18 |
| `floor-blend`, `floor-sweep` | `src/components/nav/FloorMenuScene.tsx:9` (module comment) and `:290` (the sweep comment) | 18 |
| `nav-material`, `header-progress`, `ribbon-progress` | `src/scripts/header-ribbon.ts:5` (module comment); plate rule `src/styles/header-ribbon.css:8` | 18 |
| `nav-echo` | `src/styles/header-ribbon.css:11` | 18 |
| `char-fold`, `char-float`, `rating-clip`, `lateral-card-arrival`, `underline-travel`, `card-ring` | `src/components/motion/EditorialMotion.tsx:12` (the `buildReviewStage` doc comment) plus one tag per tween at `:32`, `:44`, `:67`, `:83`, `:93`, `:97` | 19 |
| `editorial-reveal`, `story-photo-arrival`, `material-lens` | `src/components/motion/EditorialMotion.tsx:121` (the default-export doc comment) | 19 |
| `layered-scrub`, `layer-drift`, `grind-swirl`, `crack-repair`, `flake-fall`, `topcoat-edge`, `gloss-sweep` | `src/scripts/preparation-layers.ts:5` (module comment already names `layered-scrub`; add the other six) | 21 |
| `caption-wipe`, `statement-words` | `src/scripts/preparation-layers.ts:200` and `:181` | 21 |
| `caption-drift` | wherever Step 21 lands it in `EditorialMotion.tsx` | 21 |
| `swallow`, `fold-and-shoot-left`, `horizontal-pull`, `resin-swirl-plate` | `src/lib/motion/journey-transitions.ts:23`, as new `TRANSITIONS` entries | 22 |
| `perspective-cylinder`, `word-swap`, `shrink-to-card` | `src/components/projects/TransformationGallery.tsx`, on the cylinder builder | 23 |
| `unwrap-to-lattice`, `tile-resolve` | `src/components/home/ArchiveLattice.tsx:47`–`:48`, module comment — **done** | 23b |
| `lattice-flyover` | `src/components/home/ArchiveLattice.tsx`, module comment — **not tagged yet**, because Step 23b did not build the WebGL flyover. The file's closing "THE FLYOVER HOOK" comment names the atlas, the view registration, the shared clock and the one `surface-store.ts` line it would change | whichever step lands the `full`-tier flyover |
| `resin-layer-mask`, `specular-window`, `meniscus-filter` | `src/scripts/resin-reveal.ts:5` — **and correct the comment's `resin-mask` to `resin-layer-mask`**, leaving the ScrollTrigger id at `:225` alone | 24 |
| `stair-dolly`, `layer-explode` | `src/components/motion/StairAscent.tsx`, module comment | 20 |
| `material-morph`, `settle`, `sweep`, `horizon` | `src/lib/motion/surface-materials.ts:143` and `src/components/motion/SurfaceFloor.tsx:270` (the `driver` object) | 15 |
| `glint`, `image-lens`, `ribbon-underline` | `src/scripts/intent-motion.ts:4` (module comment); `src/styles/journey.css:72` | 28 |
| `page-wipe` | `src/layouts/BaseLayout.astro`, frontmatter | 12 |

---

## Completion gate

`node scripts/context-graph.mjs` enforces all four, and exits non-zero on any of them:

1. Every row in both tables has a value in **every** column — no blanks, no `TODO`.
2. Every `implemented` row carries a real duration and ease; `scrub` and `n/a` are
   accepted only where the row also explains the window or states that no curve exists.
3. Every vocabulary id cited in a `graph.json` step's `vocab` array exists here.
4. Every motion-touching step cites at least one id. This is an **error**, not a warning,
   now that both tables are complete.
