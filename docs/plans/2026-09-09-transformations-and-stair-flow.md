# Transformation gallery and stair flow implementation plan

**Goal:** Refine the approved Follow the Floor experience with authentic overlay comparisons, a deliberate stair passage, a material-led navigation ribbon and quieter reading surfaces.

**Architecture:** Keep native scrolling, Astro HTML, the existing single WebGL compositor, and GSAP as the motion owner. Gallery interaction is local and must not change the director. Preserve the dirty baseline and all source assets; the September 9 03:00 UTC checkpoint contains the previous iteration.

**Stack:** Astro, React islands, GSAP, Three.js; local Blender only if a genuine ascent can meet visual quality. No additional subscriptions or paid generation.

## Confirmed design and tradeoffs

The user's requested horizontal gallery is preferred over more vertically stacked comparison sections. Each selected project has one sharp, aspect-correct before/after overlay with a vertical handle; the gallery navigates horizontally outside that interaction. Native overflow and explicit buttons prevent a comparison drag from unexpectedly changing projects. Edge dissolves affect only the outer frame, never the reveal boundary or evidence itself.

Keep the pouring first scene. The main navigation gains a material highlight and fine progress ribbon; a small hero chapter ribbon gives immediate access to proof, transformations and finishes. The existing high-level art direction and typography stay unchanged. **Latest user correction supersedes the earlier halo direction: remove white shadows/backgrounds from all cinematic titles and subtitles entirely.**

The stair must not be sold as a 3D ascent if it is only a photo zoom. First inspect local footage, camera tracks and models; implement a matching spatial passage only if achievable without a visual downgrade. Independently extend its transition/reading windows and keep first/last frames stable.

## Package 1 — Genuine transformation gallery (Terra/high)

Files: new `src/components/projects/TransformationGallery.tsx`, adjacent stylesheet, new selection data and pure interaction helpers/tests. Root integrates in `src/pages/index.astro`.

1. Inspect actual pairs and verify source filenames on the client's Projects page. Select matching geometry and adequate resolution, not merely filename proximity.
2. Write and run failing tests for clamp/endpoints, project navigation and comparison ownership.
3. Implement three or fewer strong comparisons, native ranges and GSAP horizontal navigation, with full-resolution responsive formats and retained image proportions.
4. Keep visual matching separate from Denis's approval; no invented job location, product system or timing.
5. Verify touch/keyboard 0% and 100%, interrupted navigation, no-JavaScript content, no horizontal page overflow, and review actual browser screenshots.

## Package 2 — Stair passage and timing (Sol/high)

Files: `src/components/motion/FilmVeil.tsx`, `JourneyMotion.tsx`, `src/lib/motion/journey-director.ts` and tests, dedicated new stair files if justified. Root owns chapter markup/CSS.

1. Diagnose transition vs section geometry and inspect available films/models.
2. Write failing timing/window tests. Keep the previous atomic binding and clear-frame regressions.
3. Implement a longer arrival, a distinct reading/travel stop, and a deliberate departure; avoid walking while the incoming plate is still washed out.
4. Present actual browser output before claiming a genuine ascent. Use the approved pearl still if a new spatial result fails its visual gate, and disclose the remaining asset requirement.

## Package 3 — Material ribbon, shading and review detail (root)

Files: `src/components/SiteHeader.astro`, new header-motion module/styles, `src/pages/index.astro`, `src/styles/journey.css`, `src/components/home/SocialProof.astro`, `tests/e2e/refinements.spec.ts`.

1. Add failing browser tests for moving highlight, visible direct routes and localized text surfaces.
2. Implement interruptible hover/focus navigation movement, a native-scroll progress ribbon and meaningful hero chapter links. Preserve 44px controls and mobile header clearance.
3. Remove full-section white wash and, following the final user correction, all white title/subtitle halos. Check foreground composition and mobile presentation in actual screenshots.
4. Give review cards attributable topic detail and a quieter base. Keep all 17 actual excerpts unchanged and equal-size reflow behavior.

## Package 4 — Useful planning content (root)

Files: new `src/components/home/FloorPlanning.astro`, homepage integration and focused styles.

1. Confirm existing marketing context; use supplied demographic research as hypotheses, not technical proof.
2. Add concise server-rendered planning questions with links to preparation, residential and commercial services.
3. Avoid invented prices, cure times, warranties, availability and AI-ranking promises. Keep a direct route to Denis.

## Package 5 — Integration and independent check (root + Astra/ultra)

1. Run one browser suite at a time using existing localhost4333; workers must not run Playwright concurrently.
2. Run `npm test`, staging `npm run check`, expanded browser gate and `npm run build:staging`.
3. Inspect desktop/phone-sized screenshots and rapid forward/reverse motion; record any remaining physical-device/asset gate honestly.
4. Preserve an illustrated handoff and a new checkpoint with `node scripts/checkpoint-follow-floor.mjs`. No live deployment, real quote submission or external photo processing is part of this iteration.

## Subsequent approved refinement — official GSAP skills

The latest user feedback supersedes the no-shadow and native-only gallery defaults above. Use only a 4px, low-opacity white text shadow; no panels or broad halos. Make the comparison gallery a native-vertical-scroll-driven pinned horizontal passage, with an explicit bypass and still/short-screen fallback. Keep comparison controls independent.

Install the eight official `greensock/gsap-skills` for Codex with the requested skills CLI. Apply the core, timeline, ScrollTrigger, plugins, React and performance guidance. Existing installed GSAP 3.15.0 matches the registry's current release; no dependency upgrade is needed.

- Sol/high owns responsive SplitText line choreography and its pure contracts.
- Terra/high owns the single gallery pin, linear travel, navigation and lifecycle cleanup.
- Root owns restrained pointer-light effects, tiny text shadows, broad uneven preparation-photo masks, compact equal-height reviews, and removing the consultation's mismatched secondary image.
- Astra/ultra reviews the integrated source. Root runs all browser verification serially, including pause/reflow, exact comparison endpoints, static controls and media boundary regressions.

Study GSAP's homepage and official showcase for purposeful sequencing; do not copy their branding or their looping decorative characters. Preserve the luminous Final Finish visual direction and actual project evidence.
