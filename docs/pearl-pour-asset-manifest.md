# Pearl pour derivative asset manifest

This bounded derivative set is generated from `public/videos/epoxy-pour.mp4` by
`scripts/grade-pearl-pour.mjs`. Originals, route code, and the existing
`public/videos/follow-floor/manifest.json` are unchanged.

## Source contract

- Source: `/videos/epoxy-pour.mp4`
- 1920×1080 H.264, yuv420p, 24/1 fps
- 241 video frames; 10.041667 seconds; no audio
- Camera motion and frame order are inherited directly from the source.

## Derivatives

| Height | Video | Poster |
| ---: | --- | --- |
| 480 | `/videos/follow-floor/480/epoxy-pour-pearl.mp4` · 1,646,132 B · `8aa11ae53002bdfcd2775daaa49b7130fd07a2195704a7cce8ce81ced1bcba9b` | `/images/brand/follow-floor/480/epoxy-pour-pearl-poster.jpg` · 64,120 B · `a77049948f099002088fc9e6c4269207678f677adc346f6069b1e937d66982ca` |
| 720 | `/videos/follow-floor/720/epoxy-pour-pearl.mp4` · 3,176,385 B · `35d65f2e55490207049b19876af8d8f15fa5d3e8872d524ebdb506b52bc863c1` | `/images/brand/follow-floor/720/epoxy-pour-pearl-poster.jpg` · 115,141 B · `8a0f66269fa0c23689267ba2925a509b7762ac23d7be1658a1c768c36dfa11d8` |
| 1080 | `/videos/follow-floor/1080/epoxy-pour-pearl.mp4` · 5,134,814 B · `941b4fd6f82d2d1d07229edbc9400239502102430bca4029619a14e8c301c12e` | `/images/brand/follow-floor/1080/epoxy-pour-pearl-poster.jpg` · 202,606 B · `0e57fb62078f2e5b93d80d84fd382d06531f218c87631420dc5d644c7bf9a19b` |

All videos were verified with ffprobe at 24/1 fps, 241 frames, 10.041667
seconds, yuv420p, and six-frame GOP cadence. Delivery widths are 854, 1280,
and 1920 respectively. Encoding is silent H.264 with the existing CRF budget
(27, 26, 27) and fast-start MP4 flags.

## Grade note

The film-only grade uses a restrained channel mix and saturation reduction:
pearl-white highlights stay bright, warm gold/pink is subdued, and shadows
retain cool blue depth. This is a colour grade, not tracked object cleanup;
source metallic flakes and dark swirls remain intentionally present.

The local frame-4s refinement samples are retained at
`output/pearl-pour-sample/refine1.jpg` through `refine4.jpg`; `refine4.jpg`
was selected for the current rerender.
