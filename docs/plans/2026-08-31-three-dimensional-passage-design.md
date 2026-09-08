# Final Finish Epoxy — 3D-First Continuous Passage

## Status

Approved by the client-side project owner on August 31, 2026.

## Problem

The first homepage implementation loads a real React Three Fiber scene and moves its camera with scroll, but the scene is visually subordinate: it renders at 14% opacity beneath full-strength photographic chapter plates and is disabled on coarse-pointer devices. The result reads as a polished static website rather than the promised cinematic architectural journey.

## Creative direction

The homepage becomes one continuous, luminous building. The visitor does not scroll past five unrelated hero sections; scrolling moves them through a sequence of connected spaces:

1. **Daylit Portico** — a white stone threshold and immediate forward motion.
2. **Foundation Chamber** — the architecture becomes more structural and exposes the preparation story.
3. **Luminous Finish Hall** — light, reflections, and the floor surface transform across finish families.
4. **Proof Arcade** — real Final Finish project photographs occupy dimensional gallery panels; paired images reveal before and after.
5. **Consultation Alcove** — the passage opens into a bright, calm destination with the visualizer and quote calls to action.

The aesthetic remains classical-contemporary rather than theme-park Roman: monumental proportion, restrained columns and arches, honed mineral surfaces, glass, daylight, cobalt shadow, and immaculate epoxy floors. Movement should feel like a luxury architectural film.

## Experience architecture

### Primary visual layer

- A fixed, full-viewport React Three Fiber canvas is the dominant visual surface at full opacity.
- Existing Blender-authored GLB chunks form one coordinate-aligned world and load progressively.
- The static architectural plates become first-paint posters and emergency fallbacks only. They do not cover the running 3D scene.
- HTML copy remains above the canvas in an accessible semantic layer, with generous transparent space so visitors can see the building.
- A restrained vignette, grain, and directional gradient keep copy legible without flattening the scene.

### Scroll and camera

- The homepage owns a dedicated journey progress region rather than dividing camera progress by the entire document height.
- Progress maps to authored chapter ranges in the Blender manifest.
- Camera positions use smooth interpolation with a small amount of inertial settling.
- Chapter transitions have authored beats: threshold approach, aperture reveal, lateral gallery drift, floor-level emphasis, and final arrival.
- Copy enters and exits in synchronization with the camera rather than simply translating every section at the same rate.
- A visible progress rail names the current room and provides orientation without interrupting immersion.

### Environmental motion

- Architectural light intensity and colour temperature shift by room.
- Floor highlights and reflection strength change subtly with camera travel.
- The finish hall cycles through a restrained set of representative surface treatments.
- Doors, screens, or gallery apertures reveal the next space as it approaches.
- Very light volumetric atmosphere and suspended particles provide depth on capable devices; they never become decorative noise.
- Motion stops completely when the page is idle because the canvas uses demand rendering.

### Proof Arcade

- Real, approved project assets are mapped onto in-world gallery planes.
- Each proof panel uses one closely aligned before/after pair.
- Desktop pointer movement or focus changes the panel from before to after.
- Touch users receive a clear drag/tap comparison control in the HTML layer.
- Labels remain factual and approval-gated; the effect must never imply a project pairing that Denis has not approved.

## Capability strategy

### Desktop and capable tablets

- Full scene, high-quality GLBs, antialiasing, bounded device pixel ratio, dynamic room lighting, and complete camera route.

### Phones and lower-power devices

- The 3D journey remains visibly animated instead of automatically becoming a still page.
- Load the three core GLB chunks, reduce pixel ratio and light count, omit particles, reduce texture resolution, and shorten interpolation tails.
- Touch input scrolls the same authored route; no hover-only information is required.

### Reduced motion, data saver, or no WebGL2

- Use the people-free cinematic plates with short opacity transitions or a fully static experience according to the visitor preference.
- Preserve every page section, project comparison, link, and conversion path.

## Performance and delivery

- Keep the people-free hero poster as the high-priority LCP asset.
- Start scene loading after first paint, but reveal it decisively as soon as the entry chunk is ready.
- Load later GLB chunks and project textures as journey progress approaches their zones.
- Keep the existing total GLB budget below 6 MB and the entry path below 1.5 MB.
- Bound DPR to 1.5 on high quality and approximately 1.0 on low quality.
- Retain `frameloop="demand"`; invalidate only on scroll, camera settling, active material transitions, or interaction.
- Keep Three.js code out of the critical first-paint bundle through the existing lazy boundary.
- Prefer baked lighting/PBR textures to expensive real-time shadow maps.

## SEO and accessibility

- All headings, paragraphs, links, calls to action, project labels, and service content remain server-rendered HTML.
- The canvas stays `aria-hidden`; it is never the sole carrier of information.
- Keyboard users can reach every project comparison and call to action.
- Reduced-motion behavior is explicit and testable.
- The journey must not alter canonicals, structured data, route visibility, robots policy, or production approval gates.
- Visual text is not baked into Blender textures or images.

## Failure handling

- The people-free entry poster remains visible until the entry GLB is loaded and rendered.
- A scene-load error restores the poster experience without blanking the page.
- A context-loss or WebGL capability failure downgrades to the poster journey.
- Later chunks may fail independently; the camera route must remain within the last successfully loaded zone.

## Acceptance criteria

- At the top of the page, the rendered architecture is visibly the Three.js scene—not a 14% blended detail.
- A normal desktop scroll produces unmistakable forward camera travel through at least five authored spaces.
- The floor, lighting, architecture, and copy each change in sync at chapter transitions.
- Phones retain visible movement unless reduced motion, data saver, or WebGL limitations require fallback.
- Real project proof appears during the journey and remains usable by pointer, touch, and keyboard.
- The first meaningful paint remains a lightweight people-free poster while 3D loads progressively.
- Existing content, security, SEO, accessibility, and production build gates remain green.

## Verification

- Unit tests cover capability selection, progress mapping, chapter ranges, and fallback state.
- Browser tests assert a full-opacity ready scene, camera/progress changes after scroll, mobile low-quality motion, reduced-motion fallback, and project proof interaction.
- Visual browser inspection captures entry, finish hall, proof arcade, and final alcove states at desktop and phone widths.
- Production and staging builds, Astro checks, full unit tests, accessibility tests, and the browser matrix run after implementation.
