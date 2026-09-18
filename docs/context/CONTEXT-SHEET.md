# Context Sheet — Final Finish Epoxy rebuild

_Generated Step 3 of the master plan, 2026-09-18. Source: `C:\Users\lucid\.claude\plans\i-was-working-on-calm-gizmo.md` (Part A), re-verified against the repo on disk at the time of writing. This file replaces the need to re-derive the project history — read it before touching motion, copy, or claims code._

## How to use this sheet

You are an AI or a human joining this project mid-stream. This document is the standalone context you need before writing a line of code:

1. **Read A1–A3 first** if you are touching motion code (`journey-director.ts`, `FilmVeil.tsx`, `JourneyMotion.tsx`) — they explain why the current `C:\workspace\final-finish-epoxy` tree looks the way it does, which of its behaviors are bugs versus intentional, and what "Antigravity" broke.
2. **Read A4–A4b** if you are building a signature moment (a scroll transition, a hover, a headline reveal) — A4 is Matt's actual asks in his own words, A4b decodes every reference site he supplied into a literal, implementable mechanic. Never fetch or screenshot a reference URL; the mechanic is already decoded here.
3. **Read A5** before writing any copy that touches audience segments, pain points, or town names — it also tells you which facts in those research docs are contaminated with competitor claims and must never appear as a Final Finish fact.
4. **Read A6–A7** for locked decisions (palette, type, six-act structure) and the asset inventory (films, photos, reviews, 3D) so you do not re-litigate a decision Matt already made or go looking for an asset that does not exist.
5. **Read A8** before writing or editing any factual claim on the site (phone, email, hours, warranty, service area, review count, process facts). It is the only source of truth for what finalfinishepoxy.ca is allowed to say. Cross-reference every claim against `docs/context/CLAIMS-LEDGER.md`.
6. If something here conflicts with what you observe in the live repo, the repo wins for code state and this sheet wins for intent — flag the conflict in `docs/context/HARVEST.md` or a step's own notes rather than silently picking one.

Everything below is Part A of the master plan, reorganized as a standalone reference. Every file path and URL from the plan is preserved verbatim.

---

## A1. Three code generations exist; Antigravity worked on the stale one

Matt has driven three different AI systems (Codex, Grok, Antigravity) against this rebuild since August 31, producing three divergent code trees. Only one of them is a valid base for further work.

| Generation | Location | State | Verdict |
|---|---|---|---|
| **G1 Sept 8 "Grok/Codex root"** | `C:\Users\lucid\Documents\Codex\2026-08-31\the-subsequent-information-relates-to-this\work\final-finish-epoxy` (branch `backup-main-275710b`, 47 commits, 12 dirty) | Instrument Serif + Bricolage, 8 pinned chapters, FilmVeil dissolve, Lenis, 6 reviews | Superseded |
| **G2 Sept 14 "Follow the Floor"** | same repo, `.worktrees\follow-the-floor` (branch `feature/follow-the-floor`, 204 uncommitted entries) = GitHub `review/cinematic-readability-2026-09-14` (`eb3ecf3`, 219 files ahead of `main`) | Manrope type system, "A better floor changes the whole space." opening, pearl-blue graded pour, 480/720/1080 encodes, journey-director on native scroll, 17 reviews after hero, transformation gallery, white reading passages, 191 unit tests, captures in `docs/readability/` | **Newest and best. Baseline.** |
| **G3 Sept 15–17 "Antigravity"** | `C:\workspace\final-finish-epoxy` (fresh `git init`, 0 commits, 796 staged, no remote) | G1 files (Matt copied them) + Antigravity edits: FilmVeil/JourneyMotion patches, white text, Keystatic, 30 templated blog posts, `Scene.jsx`, `SEO.astro` | Forked from G1, not G2. Broken (blank backgrounds, 256× `texImage2D: no video`). **Archive.** |

GitHub `main` is still `e182dcf` (Sept 8). Antigravity also created a stray **public** repo `kr8tiv-io/final-finish-epoxy` (one README commit); Matt should make it private or delete it. Hostinger: no staging exists; the stored API token is rejected on hosting and VPS endpoints (`Unauthenticated`). **Matt-only prerequisite: a fresh hPanel API token before any staging step.** Git commits on this machine must bypass the global `core.hooksPath=C:/Users/lucid/.git-hooks` hook (fails with `fork` errors; reproduced by the critique agent too) and all agents use PowerShell/Node, never Git Bash.

As of this writing, `C:\workspace\final-finish-epoxy` is checked out at `review/cinematic-readability-2026-09-14` (the G2 base) and `C:\workspace\_archive\final-finish-epoxy-antigravity-2026-09-18` holds the archived G3 tree — Step 1/2 of the plan's Phase 0 are already reflected on disk.

## A2. Root causes of what Matt saw in G3 (`C:\workspace\final-finish-epoxy`)

These are the concrete, file-and-line-verified reasons the Antigravity build looked broken to Matt — a cream page with no imagery, vibrating transitions, and template-spam content:

- `src/pages/index.astro:378-382` hides every poster/video (`opacity: 0.0001 !important`) whenever the WebGL canvas exists; `FilmVeil.tsx:59` shader alpha is `sin(p·π)·0.72`, zero at both ends of every transition; `dissolve.ts:18` holds progress at 0 for the first 38% of each chapter. Result: cream page and text, no imagery except a ghost mid-transition.
- Two owners per property (GSAP and React both write `--reveal`; two opacity systems on chapter text; `ScrollTrigger.update` bound twice; velocity handler re-tweens all chapters on fast scroll = the "vibrate").
- Seven `position: fixed` film layers stacked; `frameloop="always"` with two `getComputedStyle` per frame; leaked VideoTextures.
- 30 blog files are template spam (`scripts/generate-seo-blogs.mjs`), collection unregistered, `/blog` empty; Keystatic admin unauthenticated; `AggregateRating 5.0` self-markup; `deploy.yml` SCPs a Node build into `public_html`; no SMTP/Resend/FAL secrets reach production.

These are archived, not fixed in place — G3 is not the base. They are recorded here so nobody accidentally reintroduces the same pattern (a second opacity owner, a shader that zeroes alpha at both transition ends, an unregistered content collection) while extending G2.

## A3. G2 architecture (verified) and what it left open

**Architecture:** no Lenis, no ScrollTrigger pins on the homepage. `src/lib/motion/journey-director.ts` (rAF + `useSyncExternalStore`) owns every cinematic coordinate from native scroll; `JourneyMotion.tsx` writes `data-media-active`, promotes only resident videos, scrubs `currentTime`, runs SplitText line masks keyed to the title's real reading position; `FilmVeil.tsx` is a `frameloop="demand"` overlay that paints only inside a transition (`0 < p < 1`) with five shader modes (`white-dissolve`, `aperture`, `fold`, `resin-wipe`, `preparation-curl`); HTML posters/videos are the base layer. Headline vocabulary: `line-rise`, `lateral-curtain`, `depth-settle`, `epoxy-mask`. `readable-experience.css` (paper wash, copy in the bottom half of each media chapter) overrides `journey.css`. Page: pour hero → SocialProof (17) → foundation (still only: `pearl-stair-v2` + material lens) → garage → vault → finish hall → commercial (poster) → proof (TransformationGallery: sticky featured passage + explore ribbon) → ProjectStory → FloorPlanning → consultation (poster), each media chapter followed by a white `ChapterReading` aside. ≈19–20 viewport heights in staging.

**Solved in G2 (do not redo):** readable type system, first-paint service line + CTA, six white passages, pearl-blue grade (same 241 frames), 3-tier encodes (24 fps, 6-frame GOP), single director, compositor with exact endpoints, current/adjacent media residency, 17 review cards with a dated 5.0/30 snapshot, divider ownership, three-stage quote, phone arrival ≈0.72 MB.

**Open in G2 (its own ledger + code map):** hard media cut at `transitionProgress === 0.5` when the veil has not confirmed a paint (`journey-director.ts:203`, `journey.css:39-43` has no transition); two writers of canvas opacity (`FilmVeil.tsx:405` and `:449-468`); a second seam at p=1 (veil blends the poster while the base shows the video frame); production renders an **empty** proof gallery (all 3 pairs `pending`); the two desktop gallery position tests the audit said not to weaken were deleted rather than fixed; two admission rules; two before/after divider implementations with opposite semantics; three chapter-numbering systems; `.journey-rail` rendered but `display:none`; six CSS vars written per frame and read by nothing; ~34 MB unreferenced video; dead modules (`dissolve.ts`, `passage.ts`, `LuminousPassage*`, `LightSkim`, `FloorMix`, `ScrollDissolves`, `HeroFinishMesh`, `JourneyControls`, `ProofConsult`, `google-reviews.json`); unused deps (`lenis`, 3 font packages); rating snapshot silently expires 2026-10-09; areas pages still city-substitution; Nodemailer advisories; `projects.spec.ts` asserts 6 published pairs; no `ClientRouter` (every route change is a white flash); no 404, manifest, font preload, or WebGL context-restore path; `pearl-stair-v2` is an AI edit of `epoxy-walkway-poster.jpg` at 1672×941 with **no Blender scene**; stair Blender ascent failed the visual gate twice.

Every item in the "Open in G2" list above is a named target of a later step in the 40-step plan (Part C) — do not treat these as unknowns; they are the backlog.

## A4. Matt's instructions, consolidated (51 Codex turns + 24 Antigravity turns)

**Non-negotiables**
- Keep the films and the scroll-drawn pour opening; the pour opens the site. Pearl/marble with translucent dreamy blue, cleaner, fewer dark fragments; same motion and timing.
- Bright, white, spacious; no hard edges between photos or sections; blends gradual and slightly uneven; white space *connected* by motion, never empty spacers.
- Text legible: no big white halos or frosted panels; at most a barely-visible shadow; titles slightly less stark.
- No AI-sounding copy, no exclamation-point voice, no magnetic buttons, no "Wix" feel, not a "typical scrollable website".
- Awwwards-worthy, Apple/Tesla-modern, "$100k agency" finish; stunning on iPhone, Android, tablet, desktop.
- Fast: Astro islands, compressed assets, capability tiers; SEO + AI-SEO throughout.
- Tiered agents (ultra orchestrator + reviewer; high for motion; medium/low mechanical) and an auditor that checks everyone's work and implements easy wins.
- Denis locks: `(780) 991-1651`, `finalfinishepoxy@gmail.com`. No invented warranty, address, hours, prices, cure times, credentials.

**Specific asks still unmet (most recent first)**
1. Before/after: ~15 best same-angle pairs from the projects page + Facebook, each with a hover/drag slider, in a scroll carousel like jh3y's, on white, short SEO-minded caption each; "See the difference" = forced horizontal scroll, then continue down.
2. Text motion: study gsap.com; SplitText line masks, words arriving from different directions, images appearing, interesting hover effects.
3. Scene transitions: "one scene swallows the other", "fold the whole screen into itself and shoot left", horizontal pulls, complete dissolves, an epoxy-shaped layer mask (Creative Ocean) on at least one transition, a layered composition that moves as one (isladjan).
4. Social proof right after the landing: 30+ Google reviews, many same-size cards, up to date, interesting scroll feature, more detail under the cards.
5. A "Reclaim your garage or basement" chapter; sections speaking to researched demographics/pain points; more SEO words.
6. Slow walk up the stairs at "The finish begins below the surface"; fix timing; replace the speckled stair texture with something intentional (e.g. a magnifying square lens).
7. Navigation bar "more dynamic"; the site should read as a 3D experience; something creative in Three.js for the splash title.
8. Consultation: less shading, only behind the words; drop the awkward two-image flip.
9. More photos, better blended; some images too low-res.
10. Visualizer: 30 finishes in an ornate 3D pillared alcove; upload a photo and see your floor.
11. Launch with the 50 guides; replace the Squarespace site; new Hostinger temp domain; kr8tiv-io repo with an illustrated README.

**References he supplied** (mechanics only, never visuals): jh3y `PovoorJ`, Creative Ocean `qBbBLyB`, isladjan `abdyPBw`, Igloo Inc (+ case study), Pioneer Corn (Resn), Young Multi, gsap.com + showcase, `greensock/gsap-skills` (installed at `~/.agents/skills/gsap-*`), Lusion Atlas Motion / Oryzo AI, aurahomes.fun, competitors (Whitcrete, Fusion Floors, B.Protek, PE Coatings, Sealing Innovation, Garage Living), Google listing `cid=7470239776211762202`.

**Confirmed with Matt (2026-09-18)** — for completeness, the standing decisions he already made when this plan was approved:

1. Base tree = G2 review branch, with the best elements of G1 and G3 harvested onto it (B1/B2, `HARVEST.md`).
2. Footage: no new or paid generation; 2.5D from existing stills, plus pearl-grading the existing walkway film (B6).
3. Host: Hostinger Node app on a fresh temp subdomain (B9). **Still needed from Matt: a fresh hPanel API token** before Step 38.
4. Typography: Manrope only, locked (B5).

Remaining Matt-only actions during execution: send the Denis approval pack (Step 6), paste the hPanel token (Step 38), pick stairs A vs B from the side-by-side (Step 20), walk staging on a real iPhone (Step 35/40), make the stray public repo private (Step 39).

**Important rule for any agent reading references:** all reference sites (jh3y, Creative Ocean, isladjan, etc.) are mechanics-only, never visuals. Never fetch, screenshot, or attempt to reproduce their visual style — only borrow the decoded interaction mechanic in A4b below. Also never reproduce copyrighted code or copy from these sites; the decoded mechanics are original re-implementations against this project's own assets.

### A4b. Reference mechanics, decoded from source → step

| Reference | Verified mechanic | Borrow as | Step |
|---|---|---|---|
| jh3y `PovoorJ` | CSS 3D **cylinder** of cards (`rotateY(inner-angle×index) translateZ(-radius)`, `radius=(w+gap)/sin(360/n)`) rotated 0→-360° by scroll (`scroll-timeline` + GSAP `scrub` fallback), edge fade via `mask: linear-gradient`, counter-rotating shine. No slider in the pen. | Perspective ribbon: keep the cylinder CSS, drive `rotateY` from a pinned ScrollTrigger (`ease:'none'`), front card flat and largest, `Draggable` slider only on the front card, `<input type=range>` for keyboard, shine = coated side | 23 |
| Creative Ocean `qBbBLyB` | Fixed SVG scene, 7 layers on one `scrub:1` timeline; the cloud image is used twice, visible layer **and** `<mask>` content with a white rect beneath, so the rising cloud wipes to the next headline through its own silhouette. | Poured-resin alpha plate used as layer + mask; next statement revealed inside the resin front; `pin`, `end:'+=200%'`, `scrub:1` | 24 |
| isladjan `abdyPBw` | Each layer group on its own ScrollTrigger with a **different scrub lag (1–4 s)** and tiny offsets, so the scene moves as one body with velocity-dependent separation; sky = tweened `<radialGradient>` attrs; scene change = foreground hill scales 1.5× and flies off. | Preparation layers with staggered scrub lags; gloss ramp via gradient attrs; foreground "hill" becomes the squeegee sweep | 21, 22 |
| Igloo Inc | Virtual scroll → damped progress; transitions = two render targets mixed in a post effect (RGB shift + displacement + frost); KTX2 + Draco + MSDF. | Render-target blend with subtle chromatic/displacement for the pour→white handoff and menu open; DOM text stays | 17, 18 |
| Pioneer Corn | Pre-authored clips scrubbed by scroll (`mixer.setTime(p×duration)`), baked lighting, A/B render targets, loop. | If B6 allows new footage: scrub authored clips; otherwise the A/B blend for the stair dolly | 20 |
| Young Multi | React + GSAP + Lenis, no WebGL: sticky horizontal train, React-Bits `ScrollStack` (`scale = 1 − p×(1 − (0.85 + i×0.03))`, blur), `ScrollFloat` chars (`yPercent:120, scaleY:2.3, scaleX:0.7 → 0`, `back.inOut(2)`, stagger 0.03), blinds preloader, smoke/ink **video** transitions with blend modes, header theme per section. | Card stack for the process timeline; char float for one eyebrow style; ink → resin-swirl video plate in cobalt; header theme per chapter. No cursor, no magnetic. | 14, 22, 28 |
| gsap.com | Letters in `overflow:hidden` `.clip` wrappers sliding up with `rotateX` from a bottom origin; **in-place letter swap** via stacked variants/`rotateY`; horizontal word track; real `visually-hidden` heading + `aria-hidden` animated copy; entrances use `toggleActions`, never scrub. | Masked line/char fold reveals (`SplitText mask`, `autoSplit`, `onSplit` returning the tween, `aria:'auto'`), one word swap "Concrete → Coated", `easeReverse:true` on hover-out | 14, 15 |
| Lusion Atlas / Oryzo | **Both are Astro sites**: several small canvases instead of one giant scene, SplitText `mask:'chars'`, chapter cadence, DrawSVG drafting overlays. | Confirms B3; spec callouts via DrawSVG; layout-level canvas with views | 15, 18, 21 |
| aurahomes.fun | Damped R3F dolly (`MathUtils.damp`) over piecewise-linear progress; copy plates fade-hold-fade in disjoint windows. | Stair dolly damping; "one plate legible at a time" | 20 |

Tooling facts: no official GSAP MCP exists (official skills: `/plugin marketplace add greensock/gsap-skills` → `/plugin install gsap-skills@gsap-skills`, or `npx skills add https://github.com/greensock/gsap-skills`); Astro docs MCP: `claude mcp add --transport http astro-docs https://mcp.docs.astro.build/mcp`; GSAP 3.13 made all plugins free and rewrote SplitText (`autoSplit`, `mask`, `aria`, `onSplit`); 3.15 added `easeReverse`.

### A4b expanded — mechanic pseudo-code per reference

These are inline, ≤ 40-line sketches an agent brief can hand a motion engineer without fetching the source page. They are original re-implementations sized to this project's own assets, not transcriptions of the reference's code.

**jh3y `PovoorJ` → perspective ribbon (Step 23)**
```
n = cardCount
innerAngle = 360 / n
radius = (cardWidth + gap) / sin(innerAngle * PI / 180)
for i in 0..n-1:
  card[i].transform = `rotateY(${innerAngle * i}deg) translateZ(${-radius}px)`
ribbon.style.maskImage = 'linear-gradient(90deg, transparent, black 12%, black 88%, transparent)'
ScrollTrigger.create({
  trigger: ribbonSection, pin: true, scrub: true, end: '+=200%',
  onUpdate: (self) => gsap.set(ribbon, { rotationY: -360 * self.progress, ease: 'none' })
})
// front card only: Draggable.create(frontSlider, { type: 'x', bounds: sliderTrack })
```

**Creative Ocean `qBbBLyB` → resin-mask headline (Step 24)**
```
// one resin plate used twice: as a visible layer, and as SVG <mask> content over a white rect
<mask id="resinReveal"><rect width="100%" height="100%" fill="white"/><image href={resinPlate} /></mask>
<rect className="next-statement-bg" mask="url(#resinReveal)" />
gsap.to(resinPlate, { yPercent: -120, ease: 'none', scrollTrigger: { trigger, pin: true, scrub: 1, end: '+=200%' } })
```

**isladjan `abdyPBw` → staggered preparation layers (Steps 21, 22)**
```
layers = [grind, repair, primer, base, flake, topcoat]
layers.forEach((layer, i) => {
  ScrollTrigger.create({ trigger, scrub: 1 + i * 0.6, start: 'top bottom', end: 'bottom top',
    onUpdate: (self) => gsap.set(layer, { y: self.progress * (10 + i * 4) }) })
})
// scene change: gsap.to(foregroundHill, { scale: 1.5, xPercent: 120, ease: 'power2.in' })
```

**Igloo Inc → render-target blend (Steps 17, 18)**
```
progress = damp(progress, targetProgress, dampingFactor, deltaTime) // never snap
composer.addPass(new ShaderPass(BlendShader, { uProgress: progress, uChromaticStrength: 0.004, uDisplacement: displacementTex }))
```

**Pioneer Corn → scrubbed authored clip / A-B blend (Step 20)**
```
mixer.setTime(scrollProgress * clipDuration) // if new footage is ever allowed (B6 currently forbids it)
// else: crossfade renderTargetA (walkway pearl-grade) <-> renderTargetB (2.5D stair) by scrollProgress
```

**Young Multi → card stack + char float (Steps 14, 22, 28)**
```
// ScrollStack
scale = 1 - progress * (1 - (0.85 + i * 0.03))
gsap.set(card[i], { scale, filter: `blur(${(1 - scale) * 6}px)` })
// ScrollFloat char
gsap.from(char, { yPercent: 120, scaleY: 2.3, scaleX: 0.7, ease: 'back.inOut(2)', stagger: 0.03 })
```

**gsap.com → masked line/char fold + word swap (Steps 14, 15)**
```
SplitText.create(heading, { type: 'lines', mask: 'lines', autoSplit: true, aria: 'auto',
  onSplit: (self) => gsap.from(self.lines, { yPercent: 100, rotationX: -80, transformOrigin: '50% 100%', stagger: 0.05, ease: 'power3.out' }) })
// word swap: two stacked spans, gsap.to(oldWord, { rotationY: 90, opacity: 0 }); gsap.fromTo(newWord, { rotationY: -90, opacity: 0 }, { rotationY: 0, opacity: 1 })
```

**Lusion Atlas / Oryzo → layout-level canvas with views (Step 15, 18, 21)**
```
// confirms B3: one <Canvas> in BaseLayout, drei <View> per moment
<View track={menuFloorRef} /> <View track={stairPlateRef} /> <View track={veilRef} />
```

**aurahomes.fun → damped dolly (Step 20)**
```
camera.position.z = MathUtils.damp(camera.position.z, targetZ(progress), 4, deltaTime)
// copy plates: fade-hold-fade in disjoint progress windows, never two plates legible at once
```

## A5. Research docs (Downloads) — audience hypotheses, not Final Finish claims

Three files in `C:\Users\lucid\Downloads` (`Strategic Website Copy and SEO Framework…`, `Demographic Profile…`, `Strategic Market Analysis…`). Useful: segments (downtown modernizer, suburban family, enthusiast/hobbyist, Nisku industrial, healthcare/hospitality), pain points (60°C swing, salt/brine, hot-tire pickup, MVT, dusty slab, DIY fallacy, coating vs paint), voice ("trusted craftsman", direct-to-owner), town names.

**Danger:** they also contain competitors' facts (Floor X2, 15/20-year warranties, "4.9 stars 90+ reviews", "10,000+ floors", other companies' phone numbers). **None of it may appear as a Final Finish claim.** When writing copy (Steps 5, 29), you may use the segment/pain-point language, never the numbers or names attached to a competitor in these files. Cross-check every number against `docs/context/CLAIMS-LEDGER.md`.

## A6. Decisions Matt already confirmed in the Codex thread (carry forward)

Palette warm white `#FAF9F6`, charcoal `#17222A`, cobalt `#164F83`, bronze accent; client logo stays. Manrope (Sept 6 onward; Matt on G2: "I don't mind the font"; G1 serif "kind of lame"). Six-act homepage (pour → beneath the finish → reclaim → real transformation → make it yours → talk to Denis); Sept 14 refinement: hybrid editorial, three featured transformations then free exploration, pearl-and-blue pour, independent ultra review. Copy lines: "A better floor changes the whole space." / "Reclaim your garage or basement. Make room for what you love." People-free architectural imagery, always labelled concept. Service-claim boundary = what finalfinishepoxy.ca offers. Stack settled (Astro + islands + R3F + GSAP; native scroll; Framer Motion only for local UI; one WebGL context per page). Production target approved Aug 31: Hostinger VPS (Docker + Caddy, blue-green); staging on a fresh `*.hostingersite.com`. Recurring blockers: GitHub OAuth lacks `workflow` scope; Hostinger API 403/401; Windows EPERM in the asset-recovery test; Lighthouse hangs on Windows.

Do not re-open any decision in this section without Matt's explicit sign-off — they are locked, not defaults.

## A7. Assets on disk (G2 tree)

Films `public/videos/follow-floor/{480,720,1080}/epoxy-{pour,pour-pearl,walkway,garage,basement,finish,consultation}.mp4` + `manifest.json` (only 480/720 of pour-pearl, garage, basement, finish are referenced); posters `public/images/brand/*poster.jpg`, `pearl-stair-v2.{avif,webp,jpg}`; photos: 96 originals (LFS) + 384 derivatives + provenance `src/data/project-photo-pairs.json` (0 approved), shortlist `docs/project-pair-approval-queue.md`; reviews `src/data/customer-proof.json` (17 excerpts, 5.0/30 verified 2026-09-09); 3D `public/3d/luminous-passage-*.glb` (2.2 MB, unused), `public/scenes/follow-floor-threshold/scene.glb` (dev study); content: 50 guides, 7 area pages, 4 service pages. Tooling present: Node 24.13, ffmpeg 8.1, Blender 5.2, git-lfs 3.7, Playwright, Vitest, Blender MCP + Hostinger MCP connected; official GSAP skills (Sept 8 copy).

Note verified during Step 3 authorship: the current repo also carries `src/data/google-reviews.json` (30-entry set feeding `ProofConsult.astro`, distinct from the 17-excerpt `customer-proof.json` feeding the post-hero social proof band) and `src/data/areas.ts` (the 7 area records: Edmonton, Sherwood Park, St. Albert, Leduc, Fort Saskatchewan, Spruce Grove, Beaumont) referenced above as "areas pages still city-substitution" and "7 area pages".

## A8. The client's live site, verified 2026-09-18 (only source of truth for claims)

- Squarespace 7.1, 12 URLs (`/`, `/about`, `/services` + 3, `/projects`, `/contact`, `/blog` + 3 posts). Archivo Black + Space Grotesk, black/white/grey UI; the logo (navy `#103060` → electric blue `#2050c0` "F" of slanted tiles) is the only blue. Three homepage buttons 404. Five `<h1>`s. `LocalBusiness` schema with empty address/hours. No analytics.
- **Allowed copy facts:** "Founded by Denis"; "quality floor makeovers in Edmonton, Alberta"; services = residential (garage, decorative epoxy, flake, metallic), commercial (surface preparation, crack filling, anti-slip), concrete (repair, levelling/restoration, diamond grinding); spaces: garage, barn, workshop, warehouses, showrooms, industrial facilities, kitchens, bathrooms. Process facts exist **only** in the blog post "Our Epoxy Flooring Process": free estimate from photos or an in-person visit, **two-day installation** (varies), grinding, cosmetic crack filling, flake broadcast, scrape, top coat, optional anti-slip top coat.
- **Not claimable:** warranty, prices, polyaspartic/polyurea, years in business, insurance, towns beyond Edmonton, the surname "Tadic" (G2 uses it; verify or drop), "#1 in Alberta"/"affordable prices".
- **Google:** 5.0 · 30 reviews today; Flooring contractor; service-area business; Mon–Fri 8–5; topic chips job quality 8, epoxy flooring 7, attention to detail 6; one reviewer came via a Facebook ad. **Facebook:** 130 followers; latest post a Morinville garage.
- **Projects page:** 96 images in **23 gallery rows = 23 jobs** (before → prep → after, June 2025–Feb 2026); **~19 rows have a usable same-angle pair**; cleanest rows 6, 8, 9, 12, 14–16, 19–23. URL list: `C:\Users\lucid\.claude\projects\C--Users-lucid-Desktop\257df285-af58-4576-a2c1-2e142ad81b99\tool-results\b8jactkoi.txt`. The originals are already in G2's archive, so 15 pairs is achievable pending Denis's approval.
- **Competitors:** Fusion Floors is the bar (7.5/10: dark cinematic, seven `img-comparison-slider` before/afters, town list, licensed/insured badge); Whitcrete (calculator, est. 2010, 10-yr warranty); B.Protek (2-minute quote, 20-yr warranty); PE Coatings (Squarespace, Calendly). All name polyaspartic and towns; none has a visualizer.
- Cutover needs a 301 map for the 12 Squarespace URLs (incl. `/home`, `/blog/*`).

Awwwards scoring: Design 40 · Usability 30 · Creativity 20 · Content 10.

**Live-site facts currently at risk in the repo** (see `docs/context/CLAIMS-LEDGER.md` for the full grep and disposition): `src/pages/services/index.astro` and `src/data/areas.ts` name Sherwood Park, St. Albert, Leduc, Fort Saskatchewan, Spruce Grove, and Beaumont as service areas — this is a "towns beyond Edmonton" claim, which A8 lists as **not claimable** absent Denis confirmation. `src/pages/about.astro` uses the surname "Tadic" in visible copy and a `Person` schema (`Denis Tadic`) — A8 flags this surname as unverified. Both must be resolved (verify with Denis or drop) no later than Step 29.

---

## Appendix — cutover redirect list (12 Squarespace URLs)

Carried forward from A8/A1 for Step 40 (`docs/CUTOVER.md`) so the 301 map has a fixed source list to work from:

- `/`
- `/home`
- `/about`
- `/services`
- `/services` + 3 sub-pages (Squarespace's own services sub-structure — enumerate exact paths from the live site again at cutover time, since Squarespace slugs are not guaranteed stable)
- `/projects`
- `/contact`
- `/blog`
- `/blog/*` (3 existing posts)

This list is a starting point, not final — Step 40 must re-crawl the live site immediately before cutover to catch any URL added between now and launch.

## Appendix — quick-reference index

- Root causes of the broken G3 build: A2.
- What NOT to change without asking (locked decisions): A6, plus the "Do not" list carried into `CLAUDE.md`/`AGENTS.md` from `continue.md`.
- What a specific reference mechanic decodes to and which step uses it: A4b.
- Whether a fact is safe to put on the site: A8, cross-checked in `CLAUDE-LEDGER` — see `docs/context/CLAIMS-LEDGER.md`.
- What assets already exist, so you don't regenerate them: A7.
- The full 40-step plan, tiers, and ownership: `C:\Users\lucid\.claude\plans\i-was-working-on-calm-gizmo.md` Parts C and D (this sheet only carries Part A).
- The context-engineering graph: `docs/context/graph.json` / `docs/context/graph.md`, built by `scripts/context-graph.mjs`.
