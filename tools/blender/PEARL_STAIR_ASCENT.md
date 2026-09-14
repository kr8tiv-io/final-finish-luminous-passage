# Pearl Stair Ascent — unapproved local study

Status: **study-unready; not used by the client route**.

On 2026-09-08, the local source audit found no existing footage that could
truthfully provide a walk up the pearl-grey stairs:

- `epoxy-walkway.mp4` is a shallow camera push toward static stairs and uses the
  rejected black-speckled finish.
- `epoxy-basement.mp4` is a lateral room move; its staircase is off-axis and the
  camera never ascends it.
- The remaining garage, finish, and mancave films contain no stair ascent.

The procedural Blender study therefore uses fifteen real treads, a 9.4 m stair
width, and a nine-second camera route that advances 16.4 m while rising 2.475 m
at human eye height. The camera stays on the architectural centreline with a
fixed 27 mm lens: it is a genuine smooth 3D ascent, not a crop, image zoom, or
simulated head-bob. It uses only local Blender 5.2 and ffmpeg.

## Quality decision

The revised 1280×720 quality-gate frame is generated at:

`output/blender/pearl-stair-ascent-preview.jpg`

The 2026-09-08 version was rejected before animation rendering because it read
too clean and synthetic beside `assets/brand/source/pearl-stair-v2.png`. The
current quality pass adds a deep pearl forecourt, layered hand-trowelled
variation, rounded nosings, recessed tread shadows, panelled retaining walls,
veneered sloped balustrades, foot posts, caps, and warmer low daylight. It is
still a review study: no master, delivery video, poster, or Blend output is
produced by `--preview`, and `index.astro` remains on the approved pearl still.

Do not publish a full render without a new visual-quality approval. The builder
retains `status: study-unready` in both the Blender scene and any study manifest.

## Reproducing the quality gate

From the repository root:

```powershell
blender --background --factory-startup --python tools/blender/tests/test_pearl_stair_ascent.py
blender --background --factory-startup --python tools/blender/build_pearl_stair_ascent.py -- --preview
```

The dormant full-study path is nine seconds at 24 fps with a six-frame
GOP and 480p/720p H.264 outputs. Those dimensions match the existing journey
film delivery convention but are not evidence of creative approval.

## Scroll contract retained for a future approved clip

`src/lib/motion/journey-film-timing.ts` maps the foundation chapter as follows:

- chapter 0–14%: hold the coherent first frame;
- chapter 14–84%: deterministic smooth ascent;
- chapter 84–100%: hold the landing frame.

All other chapter films retain their linear scroll clocks. The mapping is exact
at both endpoints and produces the same frame when traversed in reverse. It is
currently inert because the foundation remains poster-only.

A future approved film can be integrated by adding a foundation `.floor-film-video`
with 480p and 720p sources in `index.astro`; no compositor or `FilmVeil` change is
required. Reduced-motion and save-data visitors should continue to receive the
approved still.
