# Asset ledger — every derived binary, and where it came from

Companion to `EXPERIENCE-STORYBOARD.md` §5. One row per file this repo
*generates*. Sources are Final Finish Epoxy's own footage and job photography;
nothing here is licensed stock, and nothing was bought. The concept films
(`epoxy-*.mp4`) are art-directed renders commissioned for this build and owned
with the rest of the brand package; the project photographs are Denis's own job
records, harvested from finalfinishepoxy.ca and still gated behind
`approvalRequired` until he signs off (`docs/approvals/2026-09-project-pairs.md`).

Every hash below is the SHA-256 of the committed file. Re-run the command in the
row and the hash must come back identical — these are deterministic pipelines,
not hand retouches.

Paths are repo-relative. `Consumed by` names the storyboard act and the step in
`docs/context/graph.md` that wires the asset.

---

## Wave 3 — man-cave film (Act 4)

| File | Source | Command | Dimensions | Bytes | SHA-256 | Consumed by |
| --- | --- | --- | ---: | ---: | --- | --- |
| `public/videos/follow-floor/480/epoxy-mancave.mp4` | `assets/films/source/epoxy-mancave.mp4` (`0df8e843…ffe8c`) | `node scripts/encode-journey-films.mjs --only mancave` | 854×480, 145 f @ 24/1, 6.041667 s | 1,023,132 | `7ea9b1d3df8b344e2fe2226730465f02972677415d7a10cbbd7f3d02ba28952a` | Act 4 `mancave` room · step-22 |
| `public/videos/follow-floor/720/epoxy-mancave.mp4` | same | same | 1280×720, 145 f @ 24/1, 6.041667 s | 2,162,496 | `cdd5398b15398a79ca1ed0a12bd66c38657c6c4914e8e0f5d5ab52ea42fd674a` | Act 4 `mancave` room · step-22 |
| `public/images/brand/epoxy-mancave-poster.jpg` | same | `ffmpeg -i assets/films/source/epoxy-mancave.mp4 -frames:v 1 -vf scale=1280:720 -q:v 2 public/images/brand/epoxy-mancave-poster.jpg` | 1280×720 | 118,545 | `f56287c9b26c00579ca9d5ef7cb40422d183bf17be22530608b307587d484dcb` | Act 4 poster / `still` tier · step-22 |

**No 1080 rung, on purpose.** `fold-and-shoot-left` keeps two Act 4 rooms
resident at once and the storyboard budgets the act at ~2.4 MB of 480p film. The
man cave is never a full-bleed hero, so `filmHeights` in
`scripts/encode-journey-films.mjs:12` stops its ladder at 720.

**Poster contract.** The poster is frame 0, at the same pixel size as
`epoxy-garage-poster.jpg`. Against a fresh frame-0 extract it is bit-identical
(0.0000% mean absolute difference); against frame 0 decoded out of the shipped
720 encode it is 0.8387%, which is tighter than the shipped garage poster's own
1.0821%. Frame 10 of the same film measures 3.5723%, so the check can fail.

The previously committed poster was replaced: it measured 3.85% against frame 0
and was a brighter, differently framed grade, which would have shown as a jump
at the poster→film handoff (`frame-zero-hold`).

---

## Wave 3 — resin plates (Acts 1, 4, 7)

All four files come out of `node scripts/extract-resin-plates.mjs`.

| File | Source | Dimensions | Bytes | SHA-256 | Consumed by |
| --- | --- | ---: | ---: | --- | --- |
| `public/images/brand/plates/resin-front-2048.png` | RGB `public/videos/follow-floor/1080/epoxy-pour-pearl.mp4` f235 (`941b4fd6…1c12e`); alpha `assets/films/source/epoxy-pour.mp4` f235 (`22e11bea…0d4bf`) | 2048×1152 | 1,014,584 | `211085ecc3cbdafded64c60965b88523aa36d93265108928e4965d1544889bdd` | Act 1 `resin-wipe` bloom · step-17 |
| `public/images/brand/plates/resin-front-2048.webp` | same | 2048×1152 | 358,326 | `2b110ed50d9e20f2098a75f9ef291bbcccf768ca274113d564d163cc96c849c1` | Act 1 · step-17; Act 7 `resin-layer-mask` · step-24 |
| `public/images/brand/plates/resin-front-1024.png` | same | 1024×576 | 316,587 | `846b91ea2f7017941c061305c73bf909ba28a624b0e82959e4f9d53f57d2b35c` | phone rung (storyboard §6: plate ≤ 1024 px on phone) |
| `public/images/brand/plates/resin-front-1024.webp` | same | 1024×576 | 150,544 | `771406018d4afe9361d1186159c01cef81d6a7fbc1738fb258f42544eedf78b8` | phone rung |
| `public/videos/follow-floor/plates/resin-swirl-cobalt.webm` | frames 60–120 of the same pair | 1280×720, VP9 + alpha, 49 f @ 24/1, 2.042 s | 1,274,128 | `881157b72d079e7bcb111f3a9d99e24053692fc6e36b5a0a25b43f047742f852` | Act 4 interior `resin-swirl-plate` · step-22 |
| `public/videos/follow-floor/plates/resin-swirl-cobalt.png` | loop frame 0 | 1280×720 | 461,269 | `b8dc76cad939a6f3342cebe838893676601b30c74651122cc8e2106c9f928c56` | `still` / no-WebGL fallback for the above |

### Why the alpha is solved on the ungraded film

`scripts/grade-pearl-pour.mjs` exists to neutralise the pour's warm metallic
cast. That is right for the picture and fatal for a key: after the grade, resin
and concrete sit on the same cool grey axis — the best single channel separates
them at d = 0.94, i.e. the two populations overlap. The ungraded source still
holds the separation, so the matte is solved there and applied to the
pearl-graded RGB. The two are frame-locked by construction (same 241 frames at
24/1, asserted on every run of the grade script).

### The key

Not a colorkey. The concrete is defocused background: a *narrow* colour at
*zero* local contrast. The matte is `low chroma AND low local contrast`, both as
soft ramps, multiplied — then confined to the region that can be reached by
flooding inward from the frame border, which makes a hole in the middle of the
pool structurally impossible. Spill is removed by unpremultiplying every partial
pixel against the measured concrete colour, `rgb(167,194,196)`. The edge is
feathered with two box passes at r = 3 (≈ 9 px visible).

### Frame choice

Surveyed all 36 frames in the storyboard's 200–235 window. Resin coverage rises
monotonically (83.85% at f200 → 87.55% at f235) while exposed concrete falls
(9.55% → 6.85%). f235 is the widest front that still shows concrete, so it is
the plate.

### Measured gates

- **Edge band 56.01% semi-transparent** (109,477 of 195,465 px), against a
  required 8%. Decile histogram of alpha across the band:
  `0–.1: 51078 · .1–.2: 11548 · .2–.3: 9328 · .3–.4: 8135 · .4–.5: 7807 ·
  .5–.6: 8967 · .6–.7: 8188 · .7–.8: 9268 · .8–.9: 12156 · .9–1: 68990` —
  a populated middle, which is what "not a hard key" means numerically.
- **Loop seam 4.05/255** between the last and first decoded frame, *below* the
  mean (5.26) and median (5.43) adjacent-frame step inside the clip. A genuine
  cut in the same clip (frames 0↔24) measures 34.88, so the metric discriminates.
- **Swirl loop 1,244 KiB** against the 1,536 KiB budget.
- Composites for eyes, not just numbers: `output/assets-w3/resin-front-over-paper.png`,
  `resin-front-over-finish-hall.png`, `resin-swirl-over-paper.png`,
  `resin-swirl-over-finish-hall.png` (gitignored; regenerate with the script).

### Cobalt

Duotone toward `#164F83` with a luminance ramp at gamma 2.0, and a highlight
window opening at 0.90 that hands the specular ridges and the silver flake back
to the original pearl. A near-linear ramp (gamma 0.85) lands on ice blue instead
of cobalt, because the pour is high-key almost everywhere.

---

## Wave 3 — archive atlas (Act 6)

Built by `node scripts/build-archive-atlas.mjs` from all 96
`public/images/projects/generated/thumbnails/*.webp` (resize 320×240 cover,
position centre), ordered by `sourcePageOrder` in
`src/data/project-photo-pairs.json`.

| File | Dimensions | Bytes | SHA-256 | Consumed by |
| --- | ---: | ---: | --- | --- |
| `public/images/projects/atlas/archive-atlas-4096.webp` | 3840×1920, 12×8 tiles of 320×240 | 1,163,950 | `0079d5eb75a34a570528bf67dfe9e97b8cb99636e011f18399111ffc070b0e7a` | Act 6 lattice · step-23b |
| `public/images/projects/atlas/archive-atlas-2048.webp` | 1920×960, 12×8 tiles of 160×120 | 288,436 | `61ec842ee8a73d8091d40e1b5fa68b0eaa8113fffe4fb377a75474197df7e07b` | Act 6 phone rung · step-23b |
| `public/images/projects/atlas/archive-atlas.json` | 96 tile records | 46,335 | `ba092c4bfc8f4ea12ce24880483065ec749e7ee5b634e4c059d66e431e50b9dc` | Act 6 UV table · step-23b |

Each tile record carries `id`, `sourcePageOrder`, `index/column/row`,
`approvalRequired`, the thumbnail path it came from, a GL-convention
`uv {u,v,w,h}` (origin **bottom-left**, drops straight into a three.js
`Texture.offset`/`repeat`) and a DOM-convention `pixel {x,y,w,h}` (origin
top-left, in 4096-rung pixels). Both origins are stated in the JSON header so a
consumer never has to guess.

All 96 tiles are `approvalRequired: true`, so at present Act 6 renders the whole
lattice at 60% opacity with no captions (storyboard §6).

**Placement is verified, not asserted.** The script re-cuts every tile out of
the written atlas and compares it to an independent resize of its own thumbnail:
mean 1.325%, worst 2.540% (WebP quality 82 accounts for it). The same comparison
against a *neighbour's* photo measures 20.249%, so a transposed or shifted grid
could not pass.

**Placement, not folder.** `public/images/projects/atlas/` is the path
`docs/context/graph.md` step-23b already names.
`scripts/validate-project-assets.mjs` accepts it: its `runtime root must contain
only the four generated directories` check is scoped to
`public/images/projects/generated`, and its `public/images/projects` check only
refuses `generated.backup-*`. Verified — the validator returns
`assetCount 96, decodedPaths 384, staleFiles 0` with the atlas folder present.

**KTX2 is out of scope for this wave.** The storyboard's eventual target is
`archive-atlas-4096.ktx2`; Basis/KTX2 needs a toolchain this repo does not carry
(no `toktx`, no `basisu`, no `@gltf-transform/cli`). These rungs are WebP. The
JSON is format-agnostic — adding a KTX2 rung means appending to `rungs[]`, not
reshaping the tile table.

---

## Footprint

| Tree | Delta |
| --- | ---: |
| `public/videos` | +4.69 MB |
| `public/images` | +2.95 MB |
| **Total** | **+7.65 MB across 13 files** |

`public/images` is net-positive despite the man-cave poster getting *smaller*
(360,674 → 118,545 B): the old file was an off-contract grade at q≈95, the new
one is the frame-0 extract at the same `-q:v 2` every other poster uses.

---

## Staging and regeneration

`scripts/extract-resin-plates.mjs` decodes its working frames into
`.asset-staging/resin-plates/` and skips extraction when they are already there;
`output/assets-w3/` holds the QA composites and a machine-readable
`resin-plates-report.json`. Both directories are gitignored. Delete
`.asset-staging/resin-plates/` to force a clean re-decode.

`scripts/encode-journey-films.mjs` never re-encodes an existing target. Run it
bare for a full rebuild, or with `--only <films>` to touch one film and merge —
rather than rewrite — `public/videos/follow-floor/manifest.json`.

---

## Wave 4 — Act 3 stair spike (Step 20)

The A/B behind `/lab/stairs` (staging only). Nothing here is wired into
`index.astro`; the homepage is untouched by this step.

### A — pearl-graded walkway film

`node scripts/grade-stair-walk.mjs [--replace]` regrades the G1 walkway film; then
`node scripts/encode-journey-films.mjs --only walkway-pearl` builds the ladder and
merges the manifest. The grade never rescales, crops, retimes or trims — the camera
walk is the same 145 frames at 24/1 it always was, asserted on every run.

| File | Source | Dimensions | Bytes | SHA-256 | Consumed by |
| --- | --- | ---: | ---: | --- | --- |
| `assets/films/source/epoxy-walkway-pearl.mp4` | `assets/films/source/epoxy-walkway.mp4` (`3e443c48…1d29a`) | 1920x1080, 145 f @ 24/1, 6.041667 s | 6,246,116 | `4877dae4cc29cd44ee033f852476a13a276715d62b7ac29ff2987e71cffd3eb4` | ladder master, Act 3 option A · step-20 |
| `public/videos/follow-floor/480/epoxy-walkway-pearl.mp4` | the master above | 854x480, 145 f @ 24/1 | 500,493 | `ba6656351cadf752c6a9c65840cc2a8704b3a93c5456266b34739a5a1afcc836` | Act 3 phone rung · step-20 |
| `public/videos/follow-floor/720/epoxy-walkway-pearl.mp4` | same | 1280x720, 145 f @ 24/1 | 1,171,571 | `214472382f9596be5c7ad33eba70d062b73bf9bf94cb488d90c3b9a556b1a0bd` | Act 3 panel A scrub · step-20 |
| `public/videos/follow-floor/1080/epoxy-walkway-pearl.mp4` | same | 1920x1080, 145 f @ 24/1 | 2,177,071 | `ddc5a72d3f6c090bef83a9fdcfe50ffe741e45a0dcc7dde8cc0d03b3ca5e97dd` | Act 3 desktop rung · step-20 |
| `public/images/brand/epoxy-walkway-pearl-poster.jpg` | frame 0 of the master, `scale=1280:720 -q:v 2` | 1280x720 | 85,909 | `0dddbf643e610a3217dc9eb1e421c5ab4f6da9321d6af3f49fb1577002ab7a11` | Act 3 poster / `still` tier · step-20 |

**Grade deltas from the approved pour recipe** (`scripts/grade-pearl-pour.mjs`): the
`colorchannelmixer` is carried over unchanged — it is the whole answer to the warm
light patch. `eq` moves `saturation 0.52 -> 0.42`, `contrast 1.02 -> 0.98`,
`brightness 0.055 -> 0.04`, and gains `gamma 1.26` (the pour needed no midtone lift;
this is a night exterior whose floor sits at mean luma 34/255). New, with no
counterpart in the pour: a two-level depth-aware smoothing of the floor only
(`gblur` sigma 3.5 then sigma 9, composited through a positional `maskedmerge` ramp
that follows the floor/wall junction), which is what removes the speckled terrazzo
Matt rejected. Full rationale in the script header.

**Measured gates** (frame 60, floor crop 360x200 at (250,820)):

- **Cadence parity.** 145 frames at 24/1 in, 145 frames at 24/1 out; 1920x1080 both.
- **Speckle.** Variance of the residual after a 13x13 local mean: **40.633 -> 0.812,
  a 98.0 % reduction**. Raw crop variance 136.0 -> 137.3 (the midtone lift multiplies
  the shading the grade is not trying to remove); at matched exposure that raw figure
  falls 80.3 %. A colour-only control grade scores 62.247 on the same metric, so the
  number is measuring the blur and not the colour pass.
- **Warm patch** (120x120 at (1280,680), located as the frame's warmest block):
  R-B **+96.1 -> -3.5**. Sodium orange to pearl-cool.
- **Poster.** 0.6701 % mean absolute difference against a fresh frame-0 extract at the
  same 1280x720 (threshold 1 %).

### B — 2.5D stair plate

`node scripts/build-stair-plate.mjs` then `node scripts/build-stair-depth.mjs`.

| File | Source | Dimensions | Bytes | SHA-256 | Consumed by |
| --- | --- | ---: | ---: | --- | --- |
| `assets/stair/pearl-stair-v2-2x.jpg` | `public/images/brand/pearl-stair-v2.jpg` (`5a7d071f…e0efd`), lanczos3 2x | 3344x1882 | 911,589 | `db4ac0187ceec87c15b4da300aefd7890edfd9f8307961d0db024bbaa29285eb` | plate master · step-20 |
| `assets/stair/pearl-stair-v2-1024.jpg` | the master above | 1024x576 | 141,537 | `f68ffd2d4bd87fc5f11da35b2642612e2513a1c5e16c132366b7731e8b0e7f59` | phone master · step-20 |
| `public/images/brand/stair/pearl-stair-v2-2048.webp` | same | 2048x1153 | 142,700 | `80997813805350ee5ec6c8bd34941e87445bb69c82debb6ae3bfa49afb723f17` | `DepthPlate` colour, desktop · step-20 |
| `public/images/brand/stair/pearl-stair-v2-2048.jpg` | same | 2048x1153 | 251,832 | `9dd4316fa9e7756f23ec0986b5fc1869bcf69c904f0d78810963bd4618b37ff3` | `balanced` / no-WebGL still, desktop · step-20 |
| `public/images/brand/stair/pearl-stair-v2-1024.webp` | same | 1024x576 | 54,834 | `ffbc0f28566b34a7bd383a28baca3552172cc0b70414ce037439ed3b55bed314` | `DepthPlate` colour, phone · step-20 |
| `public/images/brand/stair/pearl-stair-v2-1024.jpg` | same | 1024x576 | 82,674 | `6f839a15c0c350be88c773de89f50c1084c5c2a6acaeb3dde57219c4aa597f5d` | `balanced` / no-WebGL still, phone · step-20 |
| `public/images/brand/stair/pearl-stair-v2-depth-2048.png` | authored from the still (see below) | 2048x1153, 16-bit greyscale | 15,203 | `7d565b2787ab18d35e4848a5ce56d363d930056de3fec378ed876a6cc3776c34` | `DepthPlate` displacement, desktop · step-20 |
| `public/images/brand/stair/pearl-stair-v2-depth-1024.png` | same | 1024x576, 16-bit greyscale | 6,151 | `6b51dec65e31bcbe0cb47ff64c489f3d13fd0b6a6f4eb5466d87173802ef2ca7` | `DepthPlate` displacement, phone · step-20 |

**The depth map is authored, not inferred.** No monocular-depth model is available
offline and none may be downloaded, so the geometry is measured off the picture. The
twelve tread nosings sit at rows 418, 383, 352, 324, 297, 273, 250, 229, 209, 192,
175, 160; the floor line at 434; the landing at 144-160; the parapet at 102-144.
Fitting the Moebius law a stair obeys under perspective, `y(n) = (a n + b)/(n + g)`,
gives `g = d0/T = 20.34` at **rmse 0.45 px, worst residual 0.98 px** — so each riser's
distance is 20.34 + n tread units and the top riser is 1.541x the bottom one's, which
is measurement rather than assumption. (Including row 434 in the fit pushes rmse to
3.79 px, which is how we know 434 is the floor line and not a thirteenth nosing.) The
one assumption is the camera's eye height in risers, `H_c/R = 8.8`; it fixes the
ground horizon at row 196 and puts the frame's bottom edge at 6.50 T. The map stores
disparity, so 65535 is nearest.

**The file really is 16-bit.** sharp 0.35 / libvips 8.18 accepts `raw.depth: 'ushort'`,
writes `bitDepth 16` into IHDR and still quantises the samples to 8-bit steps
(measured: 4096 came back as 4112). The PNG is therefore encoded in
`scripts/build-stair-depth.mjs` directly and decoded again by the same script: 0 of
2,360,844 samples differ, and the run fails if every sampled value is a multiple of
257.

**Regeneration is guarded.** `verifyNosings()` re-measures the twelve rows against the
still on every run and refuses to build if the weakest gradient there drops below 12.
It currently measures 16.5; the same check run against rows offset by 8 px measures
7.8, i.e. the control would fail.

### Footprint

| Tree | Delta |
| --- | ---: |
| `public/videos` | +3.672 MB (3 encodes + the manifest row) |
| `public/images` | +0.610 MB (7 files) |
| **Shipped total** | **+4.28 MB across 10 files** |
| `assets/` (masters, not served) | +7.06 MB across 3 files |

`public/images/projects/generated/**` is LFS-tracked, so a whole-tree `git cat-file`
diff of `public/images` reads +143 MB; the figure above is the sum of this step's own
files, which is the number that matters for delivery.
