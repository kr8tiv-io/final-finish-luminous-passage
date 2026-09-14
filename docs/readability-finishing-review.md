# Readability finishing review — 2026-09-14

This pass reviewed the running local preview at `http://127.0.0.1:4333` through the in-app browser, using screenshots, scrolling, navigation, and comparison controls. It began read-only; the coordinating agent then authorized one bounded CSS polish batch. The author smoke checks below are not independent certification of those edits.

## Observed findings

| Severity | Evidence | Outcome |
| --- | --- | --- |
| High | At 1440 × 1000 and scroll Y about 3250, the foundation headline's second line and architectural caption remained washed out after its headline state was `settled`. At 390 × 844, the same overlap obscured the lower headline and caption above the reading panel. The next white stage's upper feather occupied this region above the chapter's text layer. | CSS polish applied; independent regression review remains required. |
| Medium | At 320 × 740 with a classic vertical scrollbar, the document's client width was 305px but scroll width was 320px. A horizontal page scrollbar was visible. `body { min-width: 320px; }` forced the overflow; checking against `window.innerWidth` alone misses it. | Removed the rigid minimum width. Author smoke check returned client width 305px and scroll width 305px. |
| High | The initial transformation comparison labeled the finished left half “Before” and the raw concrete right half “After”. Clicking “Show before photograph” changed the announced value to `0% after photograph visible` while the visible stage still used `--reveal: 91%`. | Reported to the gallery owner. No gallery files changed in this batch. Gallery review paused while its owner revises the interaction. |

## Bounded polish

- `src/styles/readable-experience.css`: chapter text and captions sit above broad section blends. The six chapter reading panels no longer add an upper feather across the preceding headline; the preceding chapter already finishes on the paper background.
- `src/styles/global.css`: body minimum width is zero so the layout follows the actual available document width.

The existing type sizes, hero crop, animation timing, imagery, and shader implementation were preserved. The frontend design and accessibility review focused this batch on readable text layering and actual reflow rather than additional decoration.

## Browser observations

- **1440 × 1000:** the hero has a legible main message and contact routes. Three customer excerpts fit across the page. Following the polish, both foundation headline lines visibly settle at full contrast and the architectural caption remains readable. DOM checks showed both line opacities at `1`, text colour `rgb(23, 34, 42)`, chapter content at z-index `5`, and the reading panel's upper pseudo-element hidden.
- **390 × 844:** the opening pour remains visible above the message; the 44px heading and 18px lead are readable. The menu opens without clipping and Escape closes it. The customer review Next button advanced the visible position to `02 / 17`. The foundation reading panel is clear, including after switching to Still mode.
- **320 × 740:** after the width fix, the opening title and controls remain within the available width and the horizontal page scrollbar is gone in the observed browser.
- **390 × 844 service and guide sample:** the concrete preparation page's hero and first body section, and its linked “Cracks and Spalling Before Coat” guide introduction, showed clear hierarchy and readable body text. This is a visual sample, not an audit of every guide or service route.

## Remaining gates

- A separate verifier must check the finished CSS against desktop, phone, Still, reduced-motion, and no-JavaScript layouts. This pass did not run a screen reader or use physical phones.
- The transformation gallery's revised featured passage and Explore comparison interactions require their own review. The observed material comprises three pending prototype pairings, not fifteen approved projects.
- Project pairing/publication approval and the required inventory of fifteen distinct pairs remain unresolved.
- The independent Blender stair asset and any production 3D promotion still require visual asset approval. No new asset was promoted in this batch.
- The Google figures remain explicitly dated to the existing verified snapshot. This pass did not obtain a new live rating verification.
- Protected staging access, remaining content findings, and deployment approval are outside this CSS batch.

## Final read-only motion pass

The coordinating agent subsequently confirmed independent verification of the bounded CSS changes by Terra (`readability_regressions`): five Chromium axe scans and ten routes; ten WebKit routes, three readability checks, three visualizer checks, and four floor-journey checks. The coordinator also reported all six current readable-experience checks passing, covering the 320px client width, no-JavaScript navigation, SaveData without film/WebGL imports, and the WebGL fallback. These results supersede the pending CSS-verification note above. Physical devices and field performance remain open gates.

The final motion review used the frozen director, compositor, and HTML headline source. No browser surface was available to this reviewer through CUA on the resumed pass, so the coordinator authorized a separate artifact-producing Playwright check. `playwright.finishing-review.config.ts` uses the existing port 4333 preview without a server command; `tests/e2e/finishing-review.spec.ts` records the limited review sequence.

Both motion capture checks passed: desktop Chromium at 1440 × 1000 and emulated phone WebKit at 390 × 844. Screenshots at quarter, middle, and three-quarter progress show the opening film receding into the customer-review surface, with text remaining above the blend. The phone's entering finish-mask frame visibly reads the partial “Find your” before the full “Find your finish.” settles in the same position. Still mode shows the complete, unsplit heading. The desktop entering screenshot had already settled by capture time; it is not presented as a partial-mask frame. No page errors were recorded by either check.

Inspectable PNG sequences and the recorded videos are under `output/playwright/finishing-review/finishing-review-record-th-fa1e6--headline-for-visual-review-review-desktop/` and the corresponding `review-phone/` directory. These are headless browser and emulation evidence, not physical-phone or field-performance certification. No blocking motion defect was found in this limited pass.

## Final gallery review and targeted regression

This resumed pass was read-only for application source. The separate capture test was extended to exercise the frozen gallery at 1440 × 1000 in Chromium and 390 × 844 in emulated WebKit. The owner first corrected the pre-hydration eager-image leak and native fallback navigation before this pass began.

The independent pass found one reproducible **medium-severity interaction defect**: after First → Last → First, a click on Before completed but the displayed reveal remained at 50. The recorded trace showed a real pointer click on an enabled, stable button. The owner confirmed that locking the rounded featured index could move the comparison during the click. The owner preserved the rendered fractional position during interaction, retained the focus lock, and made direct featured navigation land atomically. Free vertical scrolling still drives the continuous featured passage.

The exact original desktop sequence then passed without an added settlement wait. Its recorded evidence shows:

- Native page scrolling selects the first, middle, and last featured projects. Each captured hold is flat, with readable titles and captions beneath the image.
- First and Last reach their projects, and Skip reaches the separate Explore section.
- Before shows the raw concrete photograph; After shows the finished floor. A keyboard-set 5% reveal survives a roughly 70% hover preview and restores when the pointer leaves.
- Explore contains a real comparison for each project. Next changes the comparison in the current section, not a comparator above the page. On desktop, the active image and divider are visible at the Explore landing position; the large image's lower controls and caption can require ordinary vertical scrolling.
- Reveal settings survive Explore forward/back navigation and are shared with the corresponding featured comparison. Still mode exposes normal-flow comparisons without transformed or inert panels.
- The final last-caption detail capture contains the complete rationale. An apparent missing prefix in an earlier moving capture was not reproduced as a persistent source or CSS defect.

The first complete phone sequence also passed, including native Next twice, Previous backtracking, Before/After, all three Explore comparisons, saved settings, and Still. Its screenshots show the active Explore image, divider, endpoint buttons, and caption in the same phone viewport. This phone pass preceded the final desktop click-lock/navigation correction.

The latest phone rerun is **not certified by this reviewer**: it first exceeded the five-second hydration expectation; one narrow retry with a fifteen-second hydration allowance instead stalled in `page.goto(..., waitUntil: 'networkidle')` until the sixty-second test timeout. Other regression browsers were running concurrently, and the coordinator reported similar startup timeouts. That context is not proof of the cause. These failures did not reproduce the desktop interaction defect, but neither are they passing phone evidence. This reviewer stopped browser work and handed the exact isolated phone command to the coordinator.

### Preserved gallery evidence

| Directory under `output/playwright/` | Recorded result |
| --- | --- |
| `finishing-gallery-review/` | Initial desktop lost-click trace/video and three featured PNGs; complete passing phone sequence with PNGs/video. |
| `finishing-gallery-settled/` | Diagnostic desktop trace showing the intermediate position did not settle before the owner's final correction. |
| `finishing-gallery-final/` | Passing final desktop sequence, endpoint/hover/Explore/Still PNGs and video; later phone hydration timeout trace. |
| `finishing-gallery-final-phone/` | Narrow phone retry navigation timeout trace/video. |

The test is `tests/e2e/finishing-review.spec.ts`, selected by `--grep gallery` with `playwright.finishing-review.config.ts`. The coordinator can isolate `--project=review-phone` without starting or replacing the existing preview server.

## Final media-loading integration check

After the coordinator froze the inactive-media positioning and native-video-poster changes, the same two motion capture probes passed again: Chromium at 1440 × 1000 and emulated WebKit at 390 × 844, 2/2 in 17.9 seconds. New evidence is preserved separately under `output/playwright/finishing-motion-final/`.

The inspected final frames retain the opening pour above the phone message, a coherent film-to-review white handoff, and legible review text. The phone's finish title is visibly partial during the HTML mask, complete after settling, and complete without split lines in Still mode. No page errors were recorded. This is a limited visual integration check, not a loading-performance benchmark.

## Handoff judgment

No unresolved reproduced desktop gallery or motion defect remains in the reviewed sequences. The final isolated phone rerun remains with the coordinator. The gallery material is still three pending prototype pairings—not fifteen approved projects. Physical phones, field performance, project/publication approval, the independent stair asset, protected staging access, and unresolved content/deployment gates remain outside this review's approval. No application-source edits were made during this final pass, and the shared port 4333 preview was preserved.

## Isolated phone closure

The coordinator subsequently ran the final phone gallery check alone: **1/1 passed in 14 seconds**, with no runtime changes. Evidence is preserved under `output/playwright/finishing-gallery-isolated-phone/`. The coordinator also reported WebKit readability 8/8 and all twelve previously failing broad-suite cases passing serially; this reviewer did not rerun those broader checks.

This reviewer independently inspected the isolated run's ten PNGs without opening another browser. The first, middle, and last native comparisons are visible with their titles and complete captions. Before and After show the correct full photographs. All three Explore captures keep the active comparison, divider, endpoint buttons, and caption within the 390 × 844 viewport; the first retains its saved 5% reveal. The last caption is complete, and the Still capture preserves the second project's saved full-Before state in normal flow. No new visual defect was found in these artifacts.

This passing isolated run and artifact inspection close the final emulated-phone rerun gate noted above. The earlier timeout records remain preserved, and physical-device, field-performance, asset, publication, and staging approvals remain separate gates. Review and documentation are frozen.
