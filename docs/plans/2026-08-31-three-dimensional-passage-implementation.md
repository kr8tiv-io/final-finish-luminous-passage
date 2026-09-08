# 3D-First Continuous Passage Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the Final Finish homepage into an unmistakable, scroll-controlled journey through one continuous Three.js building while preserving fast first paint, semantic SEO content, accessibility, and reliable mobile fallbacks.

**Architecture:** Keep the existing server-rendered Astro page as the semantic and conversion layer, but promote the lazily loaded React Three Fiber canvas to the dominant fixed visual surface. A pure journey-state module maps the dedicated homepage scroll region to camera, chapter, lighting, material, and proof-arcade states; React consumes that state and invalidates the demand-rendered canvas only while movement or transitions are active.

**Tech Stack:** Astro 7, React 19, React Three Fiber, Three.js, Drei, GSAP ScrollTrigger, Lenis, Blender-authored GLB assets, Vitest, Playwright, axe-core.

---

### Task 1: Define the journey state contract with tests

**Files:**
- Modify: `src/lib/motion/passage.ts`
- Modify: `src/lib/motion/passage.test.ts`

**Step 1: Write the failing capability-policy tests**

Add tests proving that a coarse pointer no longer forces a still page when WebGL2 is available, while reduced motion and data saver remain hard fallbacks:

```ts
it('keeps visible low-quality 3D motion on touch devices', () => {
  expect(choosePassageQuality({
    webgl2: true,
    reducedMotion: false,
    saveData: false,
    coarsePointer: true,
    deviceMemory: 6,
  })).toBe('low');
});

it.each([
  { webgl2: false, reducedMotion: false, saveData: false },
  { webgl2: true, reducedMotion: true, saveData: false },
  { webgl2: true, reducedMotion: false, saveData: true },
])('uses a still fallback for hard constraints', (caps) => {
  expect(choosePassageQuality({ ...caps, coarsePointer: false, deviceMemory: 8 })).toBe('still');
});
```

**Step 2: Run the tests and confirm RED**

Run: `npx vitest run src/lib/motion/passage.test.ts`

Expected: the touch-device assertion fails because the current function returns `still`.

**Step 3: Add chapter-aware journey state**

Add explicit chapter ranges and pure helpers:

```ts
export const passageChapters = [
  { slug: 'portico', start: 0, end: 0.18 },
  { slug: 'foundation', start: 0.18, end: 0.38 },
  { slug: 'finish-hall', start: 0.38, end: 0.62 },
  { slug: 'proof', start: 0.62, end: 0.82 },
  { slug: 'consultation', start: 0.82, end: 1 },
] as const;

export function journeyProgress(scrollY: number, journeyTop: number, journeyHeight: number, viewportHeight: number) {
  const travel = Math.max(1, journeyHeight - viewportHeight);
  return Math.min(1, Math.max(0, (scrollY - journeyTop) / travel));
}

export function passageChapterAt(progress: number) {
  return passageChapters.find((chapter) => progress < chapter.end) ?? passageChapters.at(-1)!;
}

export function chapterProgress(progress: number) {
  const chapter = passageChapterAt(progress);
  return Math.min(1, Math.max(0, (progress - chapter.start) / (chapter.end - chapter.start)));
}
```

Change the quality policy so coarse pointer or memory at/below 4 GB selects `low`; only no WebGL2, reduced motion, or data saver selects `still`.

**Step 4: Add and pass boundary tests**

Test clamping, every chapter boundary, a short/non-scrollable region, and chapter-local progress.

Run: `npx vitest run src/lib/motion/passage.test.ts`

Expected: PASS with all motion-state tests green.

**Step 5: Commit**

```powershell
git add src/lib/motion/passage.ts src/lib/motion/passage.test.ts
git -c core.hooksPath=NUL commit -m "test: define cinematic passage state"
```

### Task 2: Make the 3D canvas the primary visual layer

**Files:**
- Modify: `src/components/motion/LuminousPassageLoader.tsx`
- Modify: `src/pages/index.astro`
- Modify: `tests/e2e/home.spec.ts`

**Step 1: Write failing browser assertions**

Add assertions that a ready capable scene has a canvas, `data-passage-ready="true"`, computed opacity of `1`, `mix-blend-mode: normal`, and a hidden poster state. Add a reduced-motion context assertion that the poster remains visible and no canvas mounts.

Run: `npx playwright test tests/e2e/home.spec.ts --project=chromium -g "primary 3D"`

Expected: RED because the current host opacity is `0.14`, uses `multiply`, and the poster never yields visual ownership.

**Step 2: Model explicit loader phases**

Represent `poster`, `loading`, `ready`, and `failed` states in `LuminousPassageLoader`. Add `onError` support to the lazy scene boundary and expose the phase as `data-passage-state`. Keep the poster until the first rendered frame calls `onReady`.

**Step 3: Rebuild the stacking contract**

In `index.astro`:

- Set `.passage-host` to fixed, full viewport, opacity `1` when ready, normal blend mode, and a z-index below semantic overlays but above the poster.
- Fade `.hero-frame` and chapter cinematic plates to opacity `0` only after ready state is reflected on the journey root.
- Retain a subtle global legibility scrim rather than five opaque image covers.
- Give the canvas a luminous neutral background so no blank frame appears between chunks.

**Step 4: Pass the focused browser test**

Run: `npx playwright test tests/e2e/home.spec.ts --project=chromium -g "primary 3D"`

Expected: PASS; screenshot visibly shows rendered geometry rather than the photographic plate once ready.

**Step 5: Commit**

```powershell
git add src/components/motion/LuminousPassageLoader.tsx src/pages/index.astro tests/e2e/home.spec.ts
git -c core.hooksPath=NUL commit -m "feat: promote the passage canvas to primary"
```

### Task 3: Author scroll-directed camera, lighting, and material beats

**Files:**
- Modify: `src/components/motion/LuminousPassageScene.tsx`
- Create: `src/components/motion/PassageDirector.tsx`
- Modify: `src/lib/motion/passage.ts`
- Modify: `src/lib/motion/passage.test.ts`

**Step 1: Write failing director-state tests**

Create pure `passageEnvironmentAt(progress)` expectations for five chapter midpoints. Each result must include chapter, warm/cool light mix, fog near/far, floor emphasis, and proof visibility. Assert distinct values at portico, foundation, finish hall, proof, and consultation.

Run: `npx vitest run src/lib/motion/passage.test.ts`

Expected: RED because the environment sampler does not exist.

**Step 2: Implement the pure environment sampler**

Use bounded interpolation between authored states. Keep values small and intentional:

```ts
type PassageEnvironment = {
  chapter: PassageChapterSlug;
  key: number;
  fill: number;
  warmth: number;
  fogNear: number;
  fogFar: number;
  floorEnergy: number;
  proofMix: number;
};
```

**Step 3: Build `PassageDirector`**

The director should:

- Read the dedicated journey element bounds.
- Compute progress with the pure helper.
- Sample the existing Blender camera route.
- Smooth camera position and target independently.
- Animate named light refs, fog, and floor-compatible materials.
- Set `data-passage-progress` and `data-passage-chapter` on the journey root for HTML synchronization.
- Invalidate while the camera or environment is settling, then stop.

Use refs rather than React state inside the render loop. Register passive scroll and resize listeners and clean them up.

**Step 4: Replace the flat world lighting**

Move light refs into `LuminousPassageScene`. Use ACES tone mapping and sRGB output, but rely on baked textures and two or three animated lights rather than real-time shadows. Traverse cloned scenes once to configure anisotropy, colour space, and safe material roughness; do not mutate cached Drei source scenes.

**Step 5: Run tests and inspect isolated runtime logs**

Run:

```powershell
npx vitest run src/lib/motion/passage.test.ts
npm run check
```

Expected: all motion tests pass and Astro reports zero diagnostics.

**Step 6: Commit**

```powershell
git add src/components/motion/LuminousPassageScene.tsx src/components/motion/PassageDirector.tsx src/lib/motion/passage.ts src/lib/motion/passage.test.ts
git -c core.hooksPath=NUL commit -m "feat: direct the architectural camera journey"
```

### Task 4: Synchronize cinematic HTML chapters with the 3D route

**Files:**
- Modify: `src/pages/index.astro`
- Modify: `src/components/motion/JourneyMotion.tsx`
- Modify: `tests/e2e/home.spec.ts`

**Step 1: Write failing chapter synchronization tests**

In Playwright, scroll to each chapter marker and assert that the journey root exposes the expected `data-active-chapter`; verify the progress rail label and active state change. Confirm the semantic headings remain present before JavaScript enhancement.

**Step 2: Restructure the homepage journey**

- Make the journey a dedicated long-form scroll track of approximately five viewport chapters.
- Keep each chapter transparent and use placement/asymmetry to frame the architecture rather than cover it.
- Add a fixed room rail with `01–05`, active room label, and a progress line.
- Keep the existing service copy and conversion links, but reduce large opaque blocks.
- Replace chapter photographs with optional translucent in-world echoes or poster-only fallback layers.

**Step 3: Reauthor GSAP motion**

Update `JourneyMotion` so each chapter has a distinct entrance/exit composition:

- Portico: typography separates as the visitor moves through the first arch.
- Foundation: copy rises from a low architectural datum.
- Finish hall: copy slides laterally while the camera drifts through material bays.
- Proof: the HTML proof card settles while the in-world gallery becomes visible.
- Consultation: the layout recentres and decelerates at arrival.

Avoid applying the same `y` transform to every section. Update the active rail and CSS custom property `--journey-progress` from ScrollTrigger callbacks.

**Step 4: Pass tests and perform a desktop visual checkpoint**

Run: `npx playwright test tests/e2e/home.spec.ts --project=chromium`

Open the local homepage and capture entry, finish hall, proof arcade, and consultation screenshots. Reject the checkpoint if the same static plate dominates multiple captures.

**Step 5: Commit**

```powershell
git add src/pages/index.astro src/components/motion/JourneyMotion.tsx tests/e2e/home.spec.ts
git -c core.hooksPath=NUL commit -m "feat: choreograph the semantic journey chapters"
```

### Task 5: Put real project proof inside the passage

**Files:**
- Create: `src/components/motion/ProofArcade.tsx`
- Modify: `src/components/motion/LuminousPassageScene.tsx`
- Modify: `src/components/motion/LuminousPassageLoader.tsx`
- Modify: `src/pages/index.astro`
- Modify: `tests/e2e/projects.spec.ts`

**Step 1: Write failing proof-arcade assertions**

Assert that the journey exposes a proof-arcade interaction with a factual label, keyboard-operable before/after range, and both optimized project URLs. The canvas enhancement must not remove or duplicate the accessible HTML control.

**Step 2: Build in-world project panels**

Use the featured approved-candidate pair from `project-photo-pairs.json`. Pass only optimized public WebP URLs into the lazy scene. `ProofArcade` uses two texture planes in the authored proof zone and crossfades them with a lightweight shader/uniform driven by proof progress and pointer proximity.

Do not upload or transform visitor data. Do not treat candidate pairing as approved; retain the staging disclosure.

**Step 3: Link canvas and HTML interaction**

Expose a shared custom event or compact external store for proof mix so the existing keyboard/touch slider and the in-world plane show the same before/after value. The accessible HTML slider remains the source of truth.

**Step 4: Pass proof tests and inspect real media**

Run: `npx playwright test tests/e2e/projects.spec.ts --project=chromium`

Expected: all project tests pass, the gallery responds to keyboard and pointer, and network logs show optimized derivatives rather than archival originals.

**Step 5: Commit**

```powershell
git add src/components/motion/ProofArcade.tsx src/components/motion/LuminousPassageScene.tsx src/components/motion/LuminousPassageLoader.tsx src/pages/index.astro tests/e2e/projects.spec.ts
git -c core.hooksPath=NUL commit -m "feat: install real proof inside the 3d arcade"
```

### Task 6: Preserve visible mobile motion and rigorous fallbacks

**Files:**
- Modify: `src/components/motion/LuminousPassageLoader.tsx`
- Modify: `src/components/motion/LuminousPassageScene.tsx`
- Modify: `src/pages/index.astro`
- Modify: `tests/e2e/home.spec.ts`
- Modify: `src/lib/motion/passage.test.ts`

**Step 1: Write failing mobile and reduced-motion tests**

- Mobile Safari emulation must choose `low`, mount a canvas, become ready, and change chapter/progress after touch scrolling.
- Reduced motion must choose `still`, mount no canvas, keep the people-free plate visible, and expose all semantic chapters.
- Data saver behavior remains covered at the pure function level.

**Step 2: Implement the low-quality scene budget**

- Load the entry, gallery, and court chunks only.
- DPR range approximately `[0.8, 1.0]`.
- Disable particles and secondary proof-plane depth effects.
- Use two lights and baked materials.
- Keep camera motion but reduce settling duration.

**Step 3: Make the fallback intentional**

Add a `noscript`/still presentation using the people-free poster and existing semantic sections. Reduced motion should remove scroll scrubbing and reveal copy immediately.

**Step 4: Run focused mobile tests**

Run:

```powershell
npx playwright test tests/e2e/home.spec.ts --project=mobile-safari
npx vitest run src/lib/motion/passage.test.ts
```

Expected: mobile has visible motion; reduced-motion and data-saver fallbacks remain correct.

**Step 5: Commit**

```powershell
git add src/components/motion/LuminousPassageLoader.tsx src/components/motion/LuminousPassageScene.tsx src/pages/index.astro tests/e2e/home.spec.ts src/lib/motion/passage.test.ts
git -c core.hooksPath=NUL commit -m "perf: preserve the journey on mobile"
```

### Task 7: Complete verification and visual review

**Files:**
- Modify as required by defects found during verification.
- Update: `docs/plans/2026-08-31-three-dimensional-passage-design.md` only if implementation intentionally changes the approved design.

**Step 1: Run static and unit verification**

```powershell
npm test
$env:SITE_ENV='staging'
$env:PUBLIC_SITE_URL='https://staging.example.com'
npm run check
```

Expected: 100% passing and zero Astro errors, warnings, or hints.

**Step 2: Run asset, content, and security verification**

```powershell
npm run test:project-assets
npm run test:3d:node
npm run test:content
npx vitest run src/lib/security/request-guards.test.ts src/lib/security/quote-route.test.ts src/lib/visualizer/mask-handler.test.ts src/lib/visualizer/mask-route.test.ts src/lib/visualizer/session-route.test.ts
```

Expected: all suites pass with no regression to the visualizer or paid API controls.

**Step 3: Build both deployment modes**

```powershell
$env:PUBLIC_SITE_URL='https://staging.example.com'
npm run build:staging
$env:PUBLIC_SITE_URL='https://www.finalfinishepoxy.ca'
npm run build:production
```

Expected: staging includes all review-gated resources and is non-indexable; production excludes all unapproved draft article routes.

**Step 4: Run the full browser matrix**

Run: `npm run test:e2e`

Expected: Chromium and mobile Safari projects pass accessibility, routes, SEO, project proof, visualizer, and the new 3D journey assertions.

**Step 5: Perform visual checkpoints in the live browser**

At desktop and phone widths, inspect and capture:

- Entry after first GLB render.
- Foundation-to-finish transition.
- Finish-hall floor/light state.
- Proof Arcade with before and after states.
- Consultation arrival.

Acceptance: the camera position, geometry, lighting/floor treatment, and copy composition visibly differ between checkpoints. The people-free poster appears only during load/fallback, not over the ready canvas.

**Step 6: Run an independent code and experience review**

Review for runtime cleanup, material cloning, memory use, scroll correctness, mobile heat, keyboard operation, contrast, and truthful project labeling. Fix every P1/P2 finding and rerun the affected verification.

**Step 7: Commit the verified result**

```powershell
git add -A
git -c core.hooksPath=NUL commit -m "feat: deliver the cinematic 3d passage"
```
