# Readable cinema — verification ledger

14 September 2026. Local implementation review, not production certification.

## Frozen implementation checks

| Check | Observed result |
| --- | --- |
| Unit tests | 191/191 passed across 40 files on the final gallery source. |
| Astro / TypeScript | 180 files; zero errors, warnings or hints with the required staging environment. |
| Content and deployment contracts | 19/19 passed. Fifty articles pass structural checks, not blanket editorial approval. |
| Homepage, routes, quote fixtures, visualizer and axe | All 60 selected Chromium/WebKit cases passed across the initial run and isolated retries: 48 initial passes, then all 12 affected cases passed serially in 27.7 seconds. |
| Transformation behaviour | Owner's 10/10 browser cases and 11/11 focused unit cases passed. Independent review subsequently found a rapid-click race; the corrected exact desktop sequence passed. |
| First-paint/readability/fallbacks | 8/8 Chromium cases independently verified by Terra; 8/8 WebKit cases passed in the final isolated root run. Includes no JavaScript, Save-Data, unavailable WebGL, actual 320px client-width reflow and inactive-media loading policy. |
| Final signature motion | Independent Astra reviewer recorded and inspected two passing desktop/phone probes after the final media-loading changes. |
| Final phone gallery | Root's isolated WebKit review sequence passed in 14 seconds after the frozen desktop interaction correction. Includes native selection, endpoints, hover restoration where applicable, Explore state and Still. |
| Final built application | Staging build passed; both desktop/phone delivery captures passed against the frozen built server. The capture waits for gallery hydration and decoded comparison images, and settled chapter headings. |
| Final polish regressions | Six additional desktop/WebKit checks passed for chapter layering, client-width reflow and no-JavaScript navigation. |
| Project asset inventory | 96 originals and 384 runtime variants decoded; no stale generated files. |
| Committed 3D inventory | Six GLBs, 45 PNG maps, 2,217,608 GLB bytes validated. This does not establish visual quality. |
| Asset transaction recovery | 8/9 tests passed. Recovery rename fails reproducibly with Windows `EPERM` at `scripts/generate-project-variants.mjs:86`; this gate remains open. |

The coordinator accidentally overrode the configured one-worker limit while other review browsers were active. Development-server navigation/hydration stalled and some parallel test artifacts collided. The failed cases were not counted as passes: all twelve were rerun alone with one worker and passed without application changes. The final phone review was likewise repeated alone. Preserve serial browser execution and unique output directories for separate review suites.

`npm run check` requires `SITE_ENV=staging` and a valid `PUBLIC_SITE_URL`; an invocation without the required environment failed closed before diagnostics. The configured invocation passed. Deployment validation was not weakened.

## Built-application measurements

`playwright.delivery.config.ts` captures the built Node application on port 4334, independently of the development preview on 4333. These are local browser measurements: no CDN, representative mobile hardware, calibrated mobile network or field-user data is involved.

The measured preload improvement in the 02:22 → 02:31 local capture sequence was:

| Arrival, including navigation response | Before loading fixes | After loading fixes |
| --- | ---: | ---: |
| Desktop Chromium | 8,418,687 B | 5,150,725 B |
| Emulated phone WebKit | 3,352,506 B | 723,525 B |

Desktop arrival includes the deferred 720p pour and WebGL renderer, not merely critical essentials. The changes remove eager full-resolution comparison pairs, redundant native video posters and offscreen layers that appeared fixed in the viewport. The phone reduction is approximately 78% in these captures.

The sampled route subsequently transferred 11,710,676 B of resources on desktop and 3,042,803 B on WebKit. These figures **do not certify the complete-route budget**: the capture jumps between selected chapters, and headless WebKit does not prove all films decoded as they would on an iPhone. Nor do transfer sizes establish LCP, INP, CLS or frame-rate targets.

The final frozen build was recaptured separately at 02:50. Desktop arrival was 5,150,725 B; WebKit arrival was 635,558 B. Its sampled route resources were 11,550,114 B and 3,042,795 B respectively. The approximately 88 KB phone difference from the earlier run reflects when the deferred compositor module arrived; do not treat that as a further application optimization. The conservative 0.72 MB arrival figure remains the documentation headline.

Raw local outputs include screenshots, videos, `arrival-transfer.json`, and `route-transfer.json` under `output/playwright/readability-delivery/`. Curated current screenshots and final motion recordings are copied into this documentation directory without retouching. Opening/proof images are from that built run; the comparison images and motion recordings are the independent review's final local captures. An intermediate delivery-capture attempt tried to click the mobile-hidden First control; the harness was corrected to respect visibility before the final two passing captures. No application code changed for that capture correction.

## Independent finishing process

The Astra/ultra reviewer first inspected without edits. The coordinator allowed a single bounded CSS batch: chapter-copy layering above blend feathers, and removal of a rigid body minimum width. A different Terra verifier checked those changes. Subsequent gallery defects went back to the gallery owner; the reviewer did not rewrite or self-certify that component.

Read [the detailed independent review](../readability-finishing-review.md) for original defects, fixes, failed and successful traces, and the distinction between live browser inspection and captured headless/emulation evidence. Official GSAP guidance shaped timeline ownership, cleanup and motion fallbacks; accessibility guidance shaped first-paint text, native controls, focus and reflow checks.

## Release gates still open

- Client visual approval of the pearl-blue grade and signature transitions. Dark source fragments are not claimed to have been tracked out.
- A production-quality stair-ascent asset. The new Blender study was not promoted; the stronger existing still remains.
- Publication approval of all three staged comparison candidates and enough genuine additional pairs to approach fifteen distinct projects. No fabricated registration or duplicated jobs.
- Current Google rating verification, approved project facts and complete guide/service editorial review.
- Physical iPhone/Android, screen readers, calibrated performance and field Core Web Vitals.
- The Windows asset-recovery failure described above.
- Protected temporary Hostinger staging, real sandbox delivery, provider/privacy/spending configuration and production abuse controls. No remote deployment or live-domain cutover occurred.

No completed penetration test, all-device compatibility, ranking outcome or award recognition is claimed.
