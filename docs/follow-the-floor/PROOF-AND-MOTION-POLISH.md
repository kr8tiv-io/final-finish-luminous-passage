# Proof, space, and a quieter material language

Iteration: September 8, 2026 (Edmonton). This extends the Follow the Floor implementation; it does not close the remaining launch gates.

## What changed

- The pouring film still opens the experience. There is no hero floor-colour overlay.
- Immediately afterward, a spacious white stage introduces the Google rating and 17 distinct customer excerpts. Cards share one width/height, with touch/trackpad scrolling, previous/next controls, an accessible reading region, and a progress indicator. The gallery arrives laterally with GSAP; it does not move away while someone reads it.
- Three additional editorial project stories alternate preparation and finished-surface photographs in generous, staggered layouts. Together with the existing evidence section, the homepage now shows four sets of real project imagery. Full runtime AVIF/WebP images replace thumbnail use in these new stories.
- Photo edges and white-stage boundaries use larger, asymmetric feathering. Scene transitions receive more scroll travel: 56svh desktop and 38svh mobile, removed in still/reduced-motion mode.
- The dark speckled stair scene has been replaced by a luminous pearl-grey architectural still and a gently moving square detail lens. The old footage remains preserved, but is not requested by the homepage. This is a generated concept—not a photograph of installed work or a newly generated video.

## Evidence and publication

On September 8 in Edmonton (September 9, 02:08 UTC), the public [Google listing](https://www.google.com/maps?cid=7470239776211762202) showed **5.0 from 30 reviews**, all five stars. The website and phone matched Final Finish Epoxy. Seventeen individually attributed excerpts were selected from that listing. Each excerpt is at most 25 words; whitespace is normalized without rewriting the customer's sentiment.

`src/data/customer-proof.json` records the dated rating separately from the selected excerpts. `ratingIsCurrent` suppresses an older-than-30-day total **when the static homepage is next built**. Existing deployments do not self-refresh: both hero and review section visibly show the check date, and refresh requires re-verification plus a rebuild. This is **not** an automatically synchronized Google feed or a runtime expiry guarantee. The “Leave a Google review” link opens the verified listing with an explicit instruction to choose “Write a review”; it does not fabricate a direct review-composer URL. No review was submitted.

All project pictures come from the client's [existing Projects page](https://www.finalfinishepoxy.ca/projects). Pair identity/specifications still require Denis's approval. Therefore the page presents preparation and finished surfaces as separate documentary views, with no manufactured same-angle wipe, invented location, warranty, timing, or performance claim. Supplied demographic documents informed customer questions, not unverified technical promises.

## Motion engineering

The previous shader combined a drifting noise/luminance mask, translucent blending, and a halfway DOM video switch. Those mechanisms could expose different frames while the user was scrolling. The revised compositor uses a stable, slightly irregular analytic edge, locks media choices during a boundary, and uses opaque compositing while ready. White intervals own the reading surface. Editorial GSAP transforms never share ownership with the film director.

Final visual review also caught a stale WebKit framebuffer after rapid reversal. Texture/uniform binding now runs before paint; internal render keys distinguish white from media; an explicit transparent draw clears old content. Replacement boundaries remain hidden until two consecutive actual draws, and the test marker comes from the material that was drawn—not the requested React state. A browser screenshot regression checks two white pixel regions during the early white-to-stair handoff. Added after visual inspection exposed the stale garage frame, it passes on the corrected implementation.

The phone motion control now sits in the header rather than covering review navigation. A 320-pixel test checks all four touch targets for overlap and verifies the pause control receives pointer input. The developer toolbar is disabled in this client-facing local preview; it is not part of the design.

Primary references consulted:

- [GSAP ScrollTrigger](https://gsap.com/docs/v3/Plugins/ScrollTrigger/): scrub/reading-stop separation, lifecycle cleanup, and native scrolling.
- [GSAP Flip](https://gsap.com/docs/v3/Plugins/Flip/): spatial continuity reference; no copied third-party layouts or licensed demo assets.
- [Astro components](https://docs.astro.build/en/basics/astro-components/) and [styling](https://docs.astro.build/en/guides/styling/): server-rendered content with a separate, client-only motion island.

No animation dependency was added. These are original choreography and shader changes built on the installed GSAP/Three.js stack—not a claim to an official “top-rated animation” ranking.

## New concept asset

Built-in image generation/editing was used, not an external paid API runner.

- Preserved source: `assets/brand/source/pearl-stair-v2.png`.
- Runtime derivatives: `public/images/brand/pearl-stair-v2.avif`, `.webp`, `.jpg`.
- Output dimensions: 1672 × 941.
- Edit target: existing `public/images/brand/epoxy-walkway-poster.jpg`.

Final prompt:

> Use case: precise-object-edit. Asset type: full-width cinematic website architecture plate, 16:9 high-resolution photorealistic. Image1 is edit target. Preserve the exact camera perspective, stair geometry, wall profiles, composition and empty people-free architecture. Replace ONLY the black-speckled horizontal foreground floor with beautiful luminous pearl-grey seamless epoxy: refined milky mineral depth, subtle ivory/taupe flowing cloudy movement, extremely fine texture, no chunky black dots. Change the dark evening lighting to bright soft morning architectural daylight with long feathered natural reflections. Remove the hard orange diamond/square patch entirely; no glowing symbol, no light sticker, no triangle. Retain believable contact shadows at stair base, gently reflective satin-to-polished epoxy (not a perfect mirror), pale limestone architecture. Atmosphere clean, elegant, contemporary, expensive architectural photography. Crisp fine material details, no fake bloom or fog, no people, text, objects, logos or watermark. The bottom foreground floor is the product focus. Do not change viewpoint or add buildings.

## Verification boundary

Browser emulation is supplementary, not physical Apple/Android validation. No live client-domain changes, deployments, external form submissions, or penetration-testing claims are part of this iteration. Current test results and final screenshots are recorded in the implementation handoff after verification.

Final run: **161 unit tests passed; 152 Astro files with zero diagnostics; staging build passed; 28 browser tests passed and two desktop-only brush cases were intentionally skipped on phone profiles.** Screenshots are in `output/playwright/proof-polish-release-gate`; selected actual captures are preserved under `docs/follow-the-floor/images`. The original checkout and source films remain preserved.
