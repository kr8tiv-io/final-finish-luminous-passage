import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { devices, expect, test, type Browser, type ConsoleMessage, type Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * Step 33 — the resilience pack.
 *
 * Four failures this site is allowed to have, and what it has to do about each:
 *
 *  1. the GPU takes its context away mid-scroll (`WEBGL_lose_context`);
 *  2. a motion island throws during render;
 *  3. the visitor arrives on a 2G-class connection;
 *  4. the visitor comes back through the back/forward cache.
 *
 * None of these is exotic. (1) is a driver reset or a laptop waking from sleep, (2) is
 * one bad chunk, (3) is a phone in a basement — which is where a lot of this site's
 * subject matter literally is — and (4) is the back button.
 *
 * WHAT THIS FILE DOES NOT DO: it never writes `data-media-active`, `--handoff`,
 * `data-journey-tier` or any other attribute the director and `JourneyMotion` own. It
 * reads them. The one thing it writes into the page is `window.__ffeFault`, the
 * staging-only fault hook in `MotionErrorBoundary.tsx`, and a scratch element in the
 * falsifiability control at the end of the recovery test.
 */

const OUTPUT_DIR = join(process.cwd(), 'output', 'step-33');
mkdirSync(OUTPUT_DIR, { recursive: true });

const SURFACE_CANVAS = 'canvas[data-surface-canvas]';

/** Everything here waits on a built page with films on it; 30 s is not enough. */
test.describe.configure({ timeout: 120_000 });

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

async function waitForSurface(page: Page) {
  await page.waitForLoadState('load');
  await page.waitForFunction(() => Boolean(window.__ffeSurface), null, { timeout: 30_000 });
  await page.waitForFunction(
    () => (window.__ffeSurface?.states as { renderer?: string } | undefined)?.renderer === 'webgl',
    null,
    { timeout: 30_000 },
  );
  await page.waitForTimeout(700);
}

/** Console errors, collected per test so "0 console errors" is a number and not a hope. */
function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/**
 * Park the page inside a boundary, as close to the compositor's own p = 0.5 as the
 * scroll grid allows.
 *
 * The veil publishes what it actually painted on `.film-veil` — `data-rendered-boundary`
 * and `data-rendered-progress` — so this reads the compositor's own answer rather than
 * inferring a boundary from chapter geometry. Coarse sweep first, then a fine pass
 * around the best hit; returns the scroll position and the progress it landed on.
 */
interface ParkedBoundary {
  readonly scrollY: number;
  readonly progress: number;
  readonly boundary: string;
}

async function parkAtBoundary(page: Page): Promise<ParkedBoundary> {
  const sample = async (top: number) => {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);
    await page.waitForTimeout(140);
    return page.evaluate(() => {
      const veil = document.querySelector<HTMLElement>('.film-veil');
      return {
        boundary: veil?.dataset.renderedBoundary ?? 'clear',
        progress: Number(veil?.dataset.renderedProgress ?? '0'),
      };
    });
  };

  const height = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const hits: ParkedBoundary[] = [];
  const offBy = (hit: ParkedBoundary) => Math.abs(hit.progress - 0.5);
  const best = (): ParkedBoundary => hits.reduce((closest, hit) => (offBy(hit) < offBy(closest) ? hit : closest));
  const consider = (scrollY: number, hit: { boundary: string; progress: number }) => {
    if (hit.boundary === 'clear' || hit.boundary === 'pending') return;
    hits.push({ scrollY, progress: hit.progress, boundary: hit.boundary });
  };

  for (let top = 0; top <= Math.min(height, 12_000); top += 120) {
    consider(top, await sample(top));
    if (hits.length > 0 && offBy(best()) < 0.04) break;
  }
  expect(hits.length, 'a scroll position where the compositor is mid-boundary').toBeGreaterThan(0);
  const coarse = best();
  for (let offset = -110; offset <= 110; offset += 20) {
    const top = coarse.scrollY + offset;
    if (top < 0) continue;
    consider(top, await sample(top));
  }
  const parked = best();
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), parked.scrollY);
  await page.waitForTimeout(500);
  return parked;
}

/**
 * A pixelmatch-shaped diff, done with `sharp` because that is the image dependency this
 * project already has. Both frames are decoded to raw RGB at the same size; a pixel
 * counts as different when any channel moves more than `threshold`.
 *
 * `threshold: 24` is a deliberately loose per-pixel gate and the ratio is the assertion.
 * The plane is antialiased and tone-mapped, so a few least-significant bits move between
 * any two draws of the identical scene; what must not move is the picture.
 */
async function diffRatio(a: Buffer, b: Buffer, threshold = 24): Promise<{ ratio: number; changed: number; total: number }> {
  const left = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const right = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  expect(left.info.width, 'frames must be the same width to compare').toBe(right.info.width);
  expect(left.info.height, 'frames must be the same height to compare').toBe(right.info.height);
  const total = left.info.width * left.info.height;
  let changed = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const delta = Math.max(
      Math.abs(left.data[offset] - right.data[offset]),
      Math.abs(left.data[offset + 1] - right.data[offset + 1]),
      Math.abs(left.data[offset + 2] - right.data[offset + 2]),
    );
    if (delta > threshold) changed += 1;
  }
  return { ratio: changed / total, changed, total };
}

function save(name: string, buffer: Buffer) {
  writeFileSync(join(OUTPUT_DIR, name), buffer);
}

/**
 * A frame that has stopped changing — and the two mistakes it exists to avoid.
 *
 * FIRST: the first version of this test compared a "before" frame that was still
 * black. At a boundary the compositor samples `video[data-video-ready]`, and a film on
 * `preload="none"` had been promoted but had not decoded a frame yet, so the
 * `VideoTexture` uploaded nothing. The comparison then read 42.8% and looked like a
 * restore regression when what had actually happened was the film arriving fifteen
 * seconds later. `warmJourney` below is the fix for that half.
 *
 * SECOND: "wait until two screenshots agree" is meaningless on its own here, because
 * the canvas is `frameloop="demand"`. An idle page draws nothing and shows the last
 * frame it drew forever, so a stale black frame is perfectly stable. Every sample
 * therefore asks for a frame first. Three consecutive agreements, not two, because two
 * is one coincidence away from a wrong answer.
 */
async function stableShot(page: Page, label: string): Promise<Buffer> {
  const sample = async () => {
    await page.evaluate(() => window.__ffeSurface?.invalidate());
    await page.waitForTimeout(160);
    return page.screenshot({ type: 'png' });
  };
  let previous = await sample();
  let agreements = 0;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await page.waitForTimeout(350);
    const next = await sample();
    const { ratio } = await diffRatio(previous, next);
    previous = next;
    agreements = ratio <= 0.002 ? agreements + 1 : 0;
    if (agreements >= 3) return next;
  }
  test.info().annotations.push({ type: 'unstable-frame', description: label });
  return previous;
}

/**
 * Scroll the whole journey once, then come back.
 *
 * Every film on this page is `preload="none"` and is promoted by `JourneyMotion` as
 * the visitor reaches its chapter. A test that parks at a boundary without doing that
 * walk first is racing the promotion of the two plates it is about to photograph.
 */
async function warmJourney(page: Page) {
  const limit = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  for (let index = 0; index <= 16; index += 1) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round((limit * index) / 16));
    await page.waitForTimeout(260);
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(400);
}

/**
 * The two films a given boundary blends, decoded.
 *
 * Scoped to the boundary rather than to the page, because "every video on the page has
 * decoded a frame" is not a condition this page ever satisfies: `JourneyMotion` promotes
 * a chapter's film while it is resident and lets it go again afterwards, so a film that
 * resolved a `currentSrc` during the warm-up pass and then left residency sits at
 * `readyState` 0 forever. Waiting on all of them waits for something that never happens.
 */
async function waitForBoundaryPlates(page: Page, boundary: string) {
  const chapters = boundary.split(':').filter((id) => id.length > 0);
  await page.waitForFunction((ids) => {
    const films = ids.flatMap((id) => [...document.querySelectorAll<HTMLVideoElement>(`#${id} video`)])
      .filter((video) => video.currentSrc !== '');
    // A poster-to-poster boundary has no film to wait for and is ready by definition.
    return films.every((video) => video.readyState >= 2);
  }, chapters, { timeout: 45_000 });
}

/* -------------------------------------------------------------------------- */
/* 1. Context loss and restore                                                 */
/* -------------------------------------------------------------------------- */

test.describe('WebGL context loss and restore', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop WebGL path');

  test('loses the context mid-boundary and comes back to the same picture', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    await warmJourney(page);

    const parked = await parkAtBoundary(page);
    test.info().annotations.push({
      type: 'boundary',
      description: `${parked.boundary} at p=${parked.progress.toFixed(3)}, scrollY=${parked.scrollY}`,
    });

    await waitForBoundaryPlates(page, parked.boundary);
    // Park every tween at rest on both sides of the outage, so the comparison is of the
    // picture and not of where a 1.6 s specular sweep happened to be when the shutter
    // fired. `settle(0)` is the store's own "damp everything now" and writes no new state.
    await page.evaluate(() => window.__ffeSurface!.settle(0));
    const before = await stableShot(page, 'before the loss');
    save('context-loss-before.png', before);

    /* ---- lose it ---- */
    await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-surface-canvas]')!;
      const lose = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
      (window as unknown as { __loseContext: WEBGL_lose_context }).__loseContext = lose;
      lose.loseContext();
    });

    await expect(page.locator('.surface-canvas-host')).toHaveAttribute('data-surface-lost', '');
    await expect(page.locator(SURFACE_CANVAS)).toBeHidden();
    await expect(page.locator('html')).toHaveAttribute('data-surface', 'fallback');
    await expect(page.locator('[data-surface-fallback]')).toBeVisible();
    expect(await page.evaluate(() => window.__ffeSurface!.lost)).toBe(true);

    /*
     * WHAT THE DOM IS DOING DURING THE OUTAGE — observed, never written.
     *
     * The director keeps publishing: `--handoff` and `data-journey-revision` move with
     * the scroll exactly as they did before the loss, because nothing about the GPU
     * reaches `journey-director.ts`.
     *
     * `data-media-active` is the one that does NOT survive on the `full` tier, and that
     * is not this step's to change. `FilmVeil` drops `data-journey-enhanced` the moment
     * the renderer stops reporting `webgl`, `JourneyMotion` reads that as
     * `compositorReady`, and on `full` its `stageOwned` requires it — so every chapter
     * comes off stage and the page falls back to its posters rather than to a DOM
     * crossfade. `balanced` does carry the crossfade (`tier === 'balanced'` short-circuits
     * the same condition), which is why this is a `full`-tier gap and not a bug in the
     * fallback. Recorded here and in the step report; the fix would be in
     * `JourneyMotion.tsx`, which belongs to another owner.
     *
     * What IS asserted is the thing that matters to a visitor: the page never goes blank.
     */
    const outage = await page.evaluate(() => {
      const journey = document.querySelector<HTMLElement>('.journey')!;
      const posters = [...document.querySelectorAll<HTMLImageElement>('.floor-film-poster')];
      return {
        handoff: journey.style.getPropertyValue('--handoff'),
        revision: Number(journey.dataset.journeyRevision ?? '-1'),
        staged: document.querySelectorAll('[data-media-active]').length,
        enhanced: journey.hasAttribute('data-journey-enhanced'),
        // A poster is "carrying the picture" when it has decoded and is on screen.
        postersOnScreen: posters.filter((image) => {
          const box = image.getBoundingClientRect();
          return image.naturalWidth > 0 && box.bottom > 0 && box.top < window.innerHeight && box.width > 0;
        }).length,
        headingsOnScreen: [...document.querySelectorAll<HTMLElement>('.journey h1, .journey h2')]
          .filter((node) => {
            const box = node.getBoundingClientRect();
            return box.bottom > 0 && box.top < window.innerHeight && node.textContent!.trim().length > 0;
          }).length,
      };
    });
    test.info().annotations.push({ type: 'outage', description: JSON.stringify(outage) });
    expect(outage.enhanced, 'the compositor stands down during the outage').toBe(false);
    expect(outage.postersOnScreen, 'the picture is still carried by a decoded poster').toBeGreaterThan(0);
    const outageShot = await page.screenshot({ type: 'png' });
    save('context-loss-outage.png', outageShot);

    // The director is still publishing: scrolling moves its revision with no GPU at all.
    const revisionBeforeScroll = outage.revision;
    await page.evaluate((y) => window.scrollTo({ top: y + 400, behavior: 'instant' }), parked.scrollY);
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => Number(document.querySelector<HTMLElement>('.journey')!.dataset.journeyRevision)),
      'the director keeps publishing through the outage',
    ).toBeGreaterThan(revisionBeforeScroll);
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), parked.scrollY);
    await page.waitForTimeout(300);

    /* ---- restore it ---- */
    await page.evaluate(() => {
      (window as unknown as { __loseContext: WEBGL_lose_context }).__loseContext.restoreContext();
    });
    await expect(page.locator('html')).toHaveAttribute('data-surface', 'webgl', { timeout: 15_000 });
    await expect(page.locator(SURFACE_CANVAS)).toBeVisible();
    await expect(page.locator('.surface-canvas-host')).toHaveAttribute('data-surface-restores', '1');
    expect(await page.evaluate(() => window.__ffeSurface!.restores)).toBe(1);
    expect(await page.evaluate(() => window.__ffeSurface!.lost)).toBe(false);

    // Every view drew again — the floor because its scene re-mounted on `restoreKey`,
    // the compositor because it never unregistered and its textures re-uploaded.
    await expect
      .poll(async () => (await page.evaluate(() => window.__ffeSurface!.views())).slice().sort(), { timeout: 15_000 })
      .toEqual(['film-veil', 'surface-floor']);
    // The warm-up ran again: a restored context that reused the old PMREM bake would
    // have left this record untouched from before the loss.
    await expect
      .poll(async () => (await page.evaluate(() => window.__ffeSurface!.warmup))?.steps?.environment, { timeout: 15_000 })
      .toBeGreaterThanOrEqual(0);
    // Presence and the horizon answer came back rather than resetting to the scene's
    // construction defaults, which is `bindDriver`'s replay doing its job.
    const restoredState = await page.evaluate(() => window.__ffeSurface!.states as Record<string, unknown>);
    expect(restoredState.renderer).toBe('webgl');
    expect(typeof restoredState.presence).toBe('number');
    await expect(page.locator('[data-surface-fallback]')).toHaveAttribute('data-horizon-line', /visible|hidden/);

    // The compositor is painting the same boundary at the same progress it was.
    await expect
      .poll(async () => page.evaluate(() => document.querySelector<HTMLElement>('.film-veil')!.dataset.renderedBoundary), { timeout: 15_000 })
      .toBe(parked.boundary);

    await waitForBoundaryPlates(page, parked.boundary);
    await page.evaluate(() => window.__ffeSurface!.settle(0));
    const after = await stableShot(page, 'after the restore');
    save('context-loss-after.png', after);

    const restored = await diffRatio(before, after);
    const outageDiff = await diffRatio(before, outageShot);
    test.info().annotations.push({
      type: 'pixel-diff',
      description: `restored ${(restored.ratio * 100).toFixed(3)}% (${restored.changed}/${restored.total}) · `
        + `outage control ${(outageDiff.ratio * 100).toFixed(3)}%`,
    });
    // The gate.
    expect(restored.ratio, 'the frame after a restore matches the frame before the loss').toBeLessThan(0.02);
    // Falsifiable: the same metric on a frame that genuinely differs must fail the gate,
    // or "< 2%" would only be proving that the comparison itself is broken.
    expect(outageDiff.ratio, 'the outage frame is measurably different, so the metric can fail').toBeGreaterThan(0.02);

    expect(consoleErrors, 'console errors across the whole loss/restore cycle').toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 2. Motion island failure and recovery                                       */
/* -------------------------------------------------------------------------- */

test.describe('motion island failure', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop WebGL path');

  test('catches a render error, falls back without moving the page, and re-mounts on interaction', async ({ page, baseURL }) => {
    const consoleErrors = collectConsoleErrors(page);
    // "No network" is the other half of "report once", so it is measured rather than
    // asserted from the source: every request to an origin that is not this server's
    // would be a report going somewhere.
    const origin = new URL(baseURL ?? 'http://127.0.0.1:4397').origin;
    const offSite: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (!url.startsWith(origin) && !url.startsWith('data:') && !url.startsWith('blob:')) offSite.push(url);
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);

    // The staging fault hook exists, and it knows which islands are live.
    expect(await page.evaluate(() => Boolean(window.__ffeFault))).toBe(true);
    expect(await page.evaluate(() => [...window.__ffeFault!.islands()].sort())).toEqual(['motion', 'surface']);

    // Layout shift, measured from here on. `hadRecentInput` entries are excluded the
    // same way `scripts/measure-delivery.mjs` excludes them.
    await page.evaluate(() => {
      const state = { value: 0 };
      (window as unknown as { __shift: { value: number } }).__shift = state;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
          if (!entry.hadRecentInput) state.value += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: false });
    });
    await page.waitForTimeout(300);

    /* ---- break it ---- */
    await page.evaluate(() => window.__ffeFault!.throwIn('surface'));

    await expect(page.locator('[data-motion-fallback="surface"]')).toHaveCount(1);
    await expect(page.locator('.surface-canvas-host')).toHaveAttribute('data-surface-failed', '');
    // The quiet fallback, per tier: the canvas stands down and the CSS band — the same
    // floor every `balanced` visitor already sees — comes back. Never a blank strip.
    await expect(page.locator('html')).toHaveAttribute('data-surface', 'fallback');
    await expect(page.locator(SURFACE_CANVAS)).toHaveCount(0);
    await expect(page.locator('[data-surface-fallback]')).toBeVisible();
    expect(await page.evaluate(() => window.__ffeSurface!.failed)).toBe(true);
    expect(await page.evaluate(() => window.__ffeFault!.failures().surface)).toBe(1);

    /*
     * Reported once, to the console, and nowhere else.
     *
     * Exactly two things land in this list and both are accounted for:
     *
     *  1. the boundary's own `console.error` — the report, and it must appear once;
     *  2. React 19 reporting the caught error itself. It does that for every error a
     *     boundary catches unless the root is created with `onCaughtError`, which
     *     `@astrojs/react` does not expose — it arrives as a console error whose text is
     *     the thrown `Error` and its stack, i.e. the injected fault by name, so it is
     *     identified rather than waved past.
     *
     * Anything else in this list is a real complaint and fails here.
     */
    test.info().annotations.push({
      type: 'console',
      description: consoleErrors.map((text) => text.split('\n')[0]).join(' | '),
    });
    const reports = consoleErrors.filter((text) => /the "surface" island failed/.test(text));
    expect(reports.length, 'one report per failure, from the boundary').toBe(1);
    const rethrown = consoleErrors.filter(
      (text) => /^(pageerror: )?Error: \[motion\] injected fault in the "surface" island/.test(text),
    );
    expect(rethrown.length, "React's own report of the same error, once").toBe(1);
    expect(consoleErrors.length, 'nothing else complained').toBe(2);
    expect(offSite, 'the report went nowhere off this origin').toEqual([]);

    const shiftAfterFailure = await page.evaluate(
      () => (window as unknown as { __shift: { value: number } }).__shift.value,
    );
    expect(shiftAfterFailure, 'the fallback moves nothing').toBeLessThan(0.001);

    // The rest of the page is untouched: it still scrolls, and the director still
    // publishes. Scrolled with `scrollTo` rather than the wheel or a click on purpose —
    // a pointer event is one of the two things that trigger the retry, and the retry
    // has to be attributable below.
    const revisionBefore = await page.evaluate(
      () => Number(document.querySelector<HTMLElement>('.journey')!.dataset.journeyRevision),
    );
    await page.evaluate(() => window.scrollTo({ top: 2_400, behavior: 'instant' }));
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY), 'the page still scrolls').toBeGreaterThan(1_000);
    expect(
      await page.evaluate(() => Number(document.querySelector<HTMLElement>('.journey')!.dataset.journeyRevision)),
      'the director still publishes',
    ).toBeGreaterThan(revisionBefore);

    /* ---- retry ---- */
    await page.evaluate(() => window.__ffeFault!.clear('surface'));
    // Still failed: clearing the fault is not itself a retry. The retry is the visitor's.
    await expect(page.locator('[data-motion-fallback="surface"]')).toHaveCount(1);

    await page.keyboard.press('Shift');
    await expect(page.locator('[data-motion-fallback="surface"]')).toHaveCount(0);
    await expect(page.locator('.surface-canvas-host')).not.toHaveAttribute('data-surface-failed', '');
    await expect(page.locator(SURFACE_CANVAS)).toHaveCount(1, { timeout: 30_000 });
    await expect(page.locator('html')).toHaveAttribute('data-surface', 'webgl', { timeout: 30_000 });
    await expect
      .poll(async () => (await page.evaluate(() => window.__ffeSurface!.views())).slice().sort(), { timeout: 30_000 })
      .toEqual(['film-veil', 'surface-floor']);

    /*
     * Falsifiability for the layout-shift number above. A counter that can only ever
     * read 0 — because the observer was never wired, or because `buffered: false`
     * silently dropped everything — would have passed that assertion by doing nothing.
     * So: force a shift, confirm the counter sees it, and put the page back.
     */
    const shiftBeforeControl = await page.evaluate(
      () => (window as unknown as { __shift: { value: number } }).__shift.value,
    );
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.id = 'ffe-shift-control';
      spacer.style.height = '240px';
      document.querySelector('#main-content')!.prepend(spacer);
    });
    await page.waitForTimeout(600);
    const shiftWithControl = await page.evaluate(
      () => (window as unknown as { __shift: { value: number } }).__shift.value,
    );
    await page.evaluate(() => document.querySelector('#ffe-shift-control')?.remove());
    expect(shiftWithControl, 'the layout-shift observer can actually register a shift')
      .toBeGreaterThan(shiftBeforeControl);
  });

  test('keeps the journey readable when the page-level motion islands fail', async ({ page }) => {
    collectConsoleErrors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    await page.evaluate(() => window.scrollTo({ top: 2_600, behavior: 'instant' }));
    await page.waitForTimeout(500);

    // `motion` is the default island id, so this trips `FilmVeilLoader` and
    // `JourneyMotionLoader` together — the worst case for the journey.
    await page.evaluate(() => window.__ffeFault!.throwIn('motion'));
    await page.waitForTimeout(800);

    expect(await page.evaluate(() => window.__ffeFault!.failures().motion)).toBeGreaterThanOrEqual(1);
    // Nothing blank: the acts, the headlines and the posters are all still on the page,
    // which is the same content a `still` visitor is served.
    const readable = await page.evaluate(() => ({
      chapters: document.querySelectorAll('[data-journey-chapter]').length,
      actLabels: [...document.querySelectorAll('[data-act-label]')]
        .filter((node) => (node.textContent ?? '').trim().length > 0).length,
      headings: [...document.querySelectorAll<HTMLElement>('.journey h1, .journey h2')]
        .filter((node) => (node.textContent ?? '').trim().length > 0).length,
      decodedPosters: [...document.querySelectorAll<HTMLImageElement>('.floor-film-poster')]
        .filter((image) => image.naturalWidth > 0).length,
    }));
    expect(readable.chapters).toBe(9);
    expect(readable.actLabels).toBe(9);
    expect(readable.headings).toBeGreaterThanOrEqual(5);
    expect(readable.decodedPosters).toBeGreaterThan(0);

    // And it still scrolls.
    await page.evaluate(() => window.scrollTo({ top: 5_200, behavior: 'instant' }));
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(4_000);
    save('motion-fallback.png', await page.screenshot({ type: 'png' }));
  });
});

/* -------------------------------------------------------------------------- */
/* 3. A 2G-class connection resolves to `still`                                */
/* -------------------------------------------------------------------------- */

/**
 * Chromium's `navigator.connection.effectiveType` is computed by the network quality
 * estimator and does NOT follow `Network.emulateNetworkConditions` reliably in a
 * headless run — the estimator needs real samples it will not get from a localhost
 * server. So both are applied: CDP throttling for the bytes (which is what the capture
 * at the end of this file is actually filmed under) and an init-script shim for the
 * `connection` object the tier resolver reads. The shim is the same shape the browser
 * exposes, installed before any page script runs.
 */
/**
 * A 2G profile that is slow enough to be honest and fast enough to finish.
 *
 * Chrome DevTools' own "Slow 3G" preset is 400 kbps down / 400 ms RTT; textbook 2G is
 * ~250 kbps. This sits at 300 kbps with a 400 ms round trip, which puts the phone's
 * 0.8 MB arrival budget at roughly 22 s of real transfer. The first profile tried here
 * was 50 kbps / 1800 ms — a defensible number for EDGE, and one that simply never
 * finished loading inside any test timeout worth having. Recorded so the next person
 * does not "fix" this by making it slower.
 */
const SLOW_2G_PROFILE = {
  offline: false,
  latency: 400,
  downloadThroughput: (300 * 1_024) / 8,
  uploadThroughput: (100 * 1_024) / 8,
};

/** `devices['iPhone 15 Pro']` without the WebKit implication — see surface.spec.ts. */
const { defaultBrowserType: _phoneEngine, ...IPHONE_15_PRO } = devices['iPhone 15 Pro'];

/**
 * What the page believes its connection is.
 *
 * `NetworkInformation` is not in this project's DOM lib, so `navigator.connection` is
 * read through the same widening `journey-tier.ts` uses. It is written out at each call
 * site rather than shared from a helper, because a helper declared in the test file
 * does not exist inside `page.evaluate` — that body is serialised and run in the
 * browser, where only what it closes over through arguments is available.
 */
const READ_EFFECTIVE_TYPE = () =>
  (navigator as Navigator & { connection?: { effectiveType?: string } }).connection?.effectiveType;

async function shimSlowConnection(page: Page, effectiveType: string) {
  await page.addInitScript((type) => {
    const connection = {
      effectiveType: type,
      type: 'cellular',
      saveData: false,
      rtt: 1_800,
      downlink: 0.05,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
      onchange: null,
    };
    Object.defineProperty(navigator, 'connection', { configurable: true, get: () => connection });
    Object.defineProperty(navigator, 'mozConnection', { configurable: true, get: () => connection });
    Object.defineProperty(navigator, 'webkitConnection', { configurable: true, get: () => connection });
  }, effectiveType);
}

test.describe('a 2g connection', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP network emulation');
  // Every byte of this page arrives over a 300 kbps pipe here. 120 s is not enough.
  test.describe.configure({ timeout: 240_000 });

  test('resolves to the still tier with the whole narrative intact and no video bytes', async ({ page, context }) => {
    const consoleErrors = collectConsoleErrors(page);
    const mediaRequests: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (request.resourceType() === 'media' || /\.(mp4|webm|m4v|mov)(\?|$)/i.test(url)) mediaRequests.push(url);
    });

    await shimSlowConnection(page, '2g');
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', SLOW_2G_PROFILE);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // Falsifiable: prove the shim is what the page sees before trusting the tier.
    expect(await page.evaluate(READ_EFFECTIVE_TYPE)).toBe('2g');
    await expect(page.locator('html')).toHaveAttribute('data-journey-tier', 'still', { timeout: 60_000 });
    await expect(page.locator('html')).toHaveAttribute('data-journey-motion', 'still');
    // `still` refuses the plane too: no canvas, the CSS band instead.
    await expect(page.locator(SURFACE_CANVAS)).toHaveCount(0);
    await expect(page.locator('[data-surface-fallback]')).toBeVisible();

    // Walk the whole page so anything lazy has every chance to ask for a film.
    const steps = await page.evaluate(() => {
      const limit = document.documentElement.scrollHeight - window.innerHeight;
      return Array.from({ length: 14 }, (_, index) => Math.round((limit * index) / 13));
    });
    for (const top of steps) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);
      await page.waitForTimeout(260);
    }
    await page.waitForTimeout(800);

    const narrative = await page.evaluate(() => ({
      chapters: [...document.querySelectorAll<HTMLElement>('[data-journey-chapter]')]
        .map((node) => node.dataset.journeyChapter ?? ''),
      actLabels: [...document.querySelectorAll('[data-act-label]')]
        .map((node) => (node.textContent ?? '').trim())
        .filter((text) => text.length > 0),
      headlines: [...document.querySelectorAll<HTMLElement>('.journey h1, .journey h2')]
        .map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim())
        .filter((text) => text.length > 0),
      posters: [...document.querySelectorAll<HTMLImageElement>('.floor-film-poster')].length,
      decodedPosters: [...document.querySelectorAll<HTMLImageElement>('.floor-film-poster')]
        .filter((image) => image.naturalWidth > 0).length,
      videos: document.querySelectorAll('video').length,
      // HAVE_NOTHING. `currentSrc` is NOT the measure: the resource selection algorithm
      // resolves a `<source>` and sets `currentSrc` on every one of these films without
      // fetching a byte, because they are all `preload="none"`. `readyState` is what
      // says whether media data actually arrived.
      videosWithMediaData: [...document.querySelectorAll<HTMLVideoElement>('video')]
        .filter((video) => video.readyState > 0).length,
      videosLoading: [...document.querySelectorAll<HTMLVideoElement>('video')]
        .filter((video) => video.networkState === 2 /* NETWORK_LOADING */).length,
    }));
    test.info().annotations.push({
      type: 'still-narrative',
      description: `${narrative.chapters.length} chapters · ${narrative.actLabels.length} act labels · `
        + `${narrative.headlines.length} headlines · ${narrative.decodedPosters}/${narrative.posters} posters decoded · `
        + `${narrative.videosWithMediaData}/${narrative.videos} films with media data · `
        + `${mediaRequests.length} video requests`,
    });

    expect(narrative.chapters).toEqual([
      'portico', 'foundation', 'garage', 'vault', 'mancave', 'proof', 'finish-hall', 'commercial', 'consultation',
    ]);
    expect(narrative.actLabels.length, 'every act label').toBe(9);
    expect(narrative.headlines.length, 'every headline').toBeGreaterThanOrEqual(5);
    expect(narrative.posters, 'every poster element').toBe(7);
    // Posters are `loading="lazy"`, so over a 300 kbps pipe the count decoded by the
    // end of the walk is a network fact, not a tier fact. The tier fact is that they
    // are all in the document and that some of them have painted.
    expect(narrative.decodedPosters, 'posters are arriving and painting').toBeGreaterThan(0);
    expect(narrative.videos, 'the films are in the document, just never fetched').toBe(7);
    expect(narrative.videosWithMediaData, 'not one film has any media data').toBe(0);
    expect(narrative.videosLoading, 'and not one is fetching').toBe(0);
    expect(mediaRequests, 'no video bytes requested on a 2g connection').toEqual([]);
    expect(consoleErrors).toEqual([]);

    save('still-2g-desktop.png', await page.screenshot({ type: 'png' }));
  });
});

test.describe('a 3g phone', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'emulated on the chromium project');
  // A coarse pointer is what the rule under test reads, and only real device emulation
  // produces one — a 390-wide viewport on a desktop context still matches
  // `(pointer: fine)`, which is how the first version of this test managed to assert
  // `balanced` against a page that was correctly resolving `full`.
  test.use(IPHONE_15_PRO);
  test.describe.configure({ timeout: 180_000 });

  test('stays on balanced rather than dropping to still', async ({ page }) => {
    await shimSlowConnection(page, '3g');
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect(await page.evaluate(READ_EFFECTIVE_TYPE)).toBe('3g');
    // 3g is not 2g, and a phone is not a desktop. Without this the `still` assertion
    // above would also pass on a resolver that answered `still` for every cellular
    // connection.
    await expect(page.locator('html')).toHaveAttribute('data-journey-tier', 'balanced', { timeout: 90_000 });
  });
});

/* -------------------------------------------------------------------------- */
/* 4. bfcache restore                                                          */
/* -------------------------------------------------------------------------- */

test.describe('back/forward cache restore', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop path');

  /**
   * LIMITATION, STATED UP FRONT: Playwright cannot force a real bfcache restore.
   *
   * There is no CDP command to freeze a page into the back/forward cache and thaw it,
   * and navigating away and back in an automated context does not reliably produce a
   * `persisted: true` `pageshow` — Chromium declines to cache a page for many reasons
   * an automated run happens to hit. What is under test here is therefore the
   * *handler*, not the browser: a synthetic `PageTransitionEvent` with
   * `persisted: true`, dispatched at `window`, which is byte-for-byte the event
   * `route-lifecycle.ts`'s `documentRestored` listens for.
   *
   * That leaves one thing unproven — that Chromium really does fire this event for
   * this page — and the honest place for it is a manual check on the deployed staging
   * host (Step 39's device pass), not a green test that implies more than it measured.
   *
   * The `persisted: false` control below is what keeps the synthetic half falsifiable:
   * the same event, the same page state, the same geometry change, and the handler must
   * do nothing at all.
   *
   * NOT A DUPLICATE of `navigation.spec.ts`'s "re-measures the page when it comes back
   * from the back/forward cache". That one (Step 12) proves the handler is wired at all,
   * by showing an idle canvas is asked for a frame. This one proves the other half of
   * `documentRestored` — that `invalidateGeometry` really re-measures, rather than
   * republishing the metrics it already held — by moving the journey underneath the
   * director first and requiring it to notice.
   */
  test('re-measures the journey and asks for a frame on a persisted pageshow', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    await page.evaluate(() => window.scrollTo({ top: 3_200, behavior: 'instant' }));
    // The director re-measures on `load` events in the capture phase, so every lazy
    // image and every promoted film that is still arriving moves its revision. The
    // controls below are only meaningful once the page has stopped fetching.
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1_200);
    await page.evaluate(() => window.__ffeSurface!.settle(0));
    await page.waitForTimeout(600);
    await page.evaluate(() => window.__ffeSurface!.resetFrames());

    const read = () => page.evaluate(() => {
      const journey = document.querySelector<HTMLElement>('.journey')!;
      return {
        revision: Number(journey.dataset.journeyRevision ?? '-1'),
        room: journey.dataset.room ?? '',
        handoff: journey.style.getPropertyValue('--handoff'),
        frames: window.__ffeSurface!.frames,
      };
    });
    const settled = await read();
    expect(settled.revision, 'the director has published at least once').toBeGreaterThan(0);

    /*
     * Move the journey under the director without telling it.
     *
     * A spacer prepended to `<body>`, OUTSIDE `.journey`, shifts every chapter's
     * document offset by its height while changing no observed element's *size*. The
     * director's ResizeObserver watches `.journey` and its chapters' boxes, so it does
     * not fire; `resize` and `orientationchange` do not fire either. The metrics it is
     * holding are therefore stale by exactly 1800 px, and only a re-measure can notice.
     */
    await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.id = 'ffe-bfcache-spacer';
      spacer.style.height = '1800px';
      spacer.style.width = '100%';
      document.body.prepend(spacer);
      window.scrollTo({ top: 3_200, behavior: 'instant' });
    });
    await page.waitForTimeout(900);
    const stale = await read();
    // The chapter the director thinks it is in has not moved, because nothing told it
    // to look again. (Its `revision` is deliberately NOT asserted frozen here: the
    // snapshot carries scroll direction and handoff as well, and either can tick over
    // for reasons that have nothing to do with geometry. `room` is the field only a
    // re-measure can move while the scroll position is pinned.)
    expect(stale.room, 'nothing re-measured the geometry on its own').toBe(settled.room);

    /* ---- the control: a non-persisted pageshow must do nothing ---- */
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    });
    await page.waitForTimeout(900);
    const afterControl = await read();
    expect(afterControl.room, 'pageshow without `persisted` is not a restore').toBe(stale.room);
    expect(afterControl.frames, 'and it asks the canvas for no frame').toBe(stale.frames);

    /* ---- the restore ---- */
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    });

    await expect
      .poll(async () => (await read()).room, { timeout: 10_000 })
      .not.toBe(afterControl.room);
    const restored = await read();
    test.info().annotations.push({
      type: 'bfcache',
      description: `revision ${afterControl.revision} -> ${restored.revision}; `
        + `room ${afterControl.room} -> ${restored.room}; frames ${afterControl.frames} -> ${restored.frames}`,
    });
    // `invalidateGeometry` re-read the chapter rects: 1800 px earlier in the journey is
    // a different chapter, and the director found it without a scroll event.
    expect(restored.room, 'the chapter metrics were re-measured').not.toBe(afterControl.room);
    expect(restored.revision, 'the director published the re-measure').toBeGreaterThan(afterControl.revision);
    // ...and the demand-rendered canvas was asked for a frame, which is the other half
    // of `documentRestored`.
    expect(restored.frames, 'the canvas was re-armed').toBeGreaterThan(afterControl.frames);

    await page.evaluate(() => document.querySelector('#ffe-bfcache-spacer')?.remove());
    expect(consoleErrors).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* 5. The slow-network capture                                                 */
/* -------------------------------------------------------------------------- */

test.describe('slow-network capture', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'CDP network emulation');
  test.describe.configure({ timeout: 300_000 });

  /**
   * Six seconds of scrolling at 390 under the 2G profile, filmed. Not an assertion —
   * evidence. The gate it serves is a human one: open the mid frame and confirm the
   * posters and the copy are legible with no film in sight.
   *
   * Its own context, because `recordVideo` is a context option and this is the only
   * test in the file that wants one.
   */
  test('films six seconds of a 2g phone scroll', async ({ browser }: { browser: Browser }) => {
    // Playwright names its own recording after the page, so it records into a scratch
    // directory and the named copy is saved beside the stills.
    const context = await browser.newContext({
      ...IPHONE_15_PRO,
      recordVideo: { dir: join(OUTPUT_DIR, 'raw'), size: { width: 390, height: 844 } },
    });
    const page = await context.newPage();
    const mediaRequests: string[] = [];
    page.on('request', (request) => {
      if (request.resourceType() === 'media' || /\.(mp4|webm)(\?|$)/i.test(request.url())) {
        mediaRequests.push(request.url());
      }
    });

    await shimSlowConnection(page, '2g');
    const session = await context.newCDPSession(page);
    await session.send('Network.enable');
    await session.send('Network.emulateNetworkConditions', SLOW_2G_PROFILE);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-journey-tier', 'still', { timeout: 90_000 });
    /*
     * Let arrival finish before the camera rolls.
     *
     * The first take filmed from `domcontentloaded` + 1.2 s and its mid frame showed a
     * legible act label and a legible headline over an empty poster box, because at
     * 300 kbps the `loading="lazy"` stills were still in flight. That is a true picture
     * of the first two seconds and a false picture of the experience — the thing this
     * capture is evidence for is what a 2G visitor scrolls through, not how long the
     * first paint takes (Step 34 owns that number). The throttle stays on for the whole
     * scroll, so every poster that comes into view during it still arrives over 2G.
     */
    await page.waitForLoadState('networkidle').catch(() => undefined);

    /*
     * A slow pass first, so the six seconds are a scroll and not a download.
     *
     * Every still on this page is `loading="lazy"`, so it does not begin fetching until
     * it is near the viewport — and at 300 kbps a fresh ~150 KB still takes about four
     * seconds. A six-second scroll of the whole page therefore outruns them from cold:
     * the first take's mid frame was a legible act label and a legible headline over an
     * empty poster box, with 3 of 7 stills decoded. That is a true finding about a
     * first-time 2G visitor who scrolls immediately, and it is reported as one — but it
     * is not what this capture is evidence for, which is what the `still` tier looks
     * like when a 2G visitor reads it. So the page is walked once at reading pace, the
     * stills are allowed to land, and then the camera rolls. The throttle never comes
     * off.
     */
    const limit = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    for (let index = 0; index <= 12; index += 1) {
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), Math.round((limit * index) / 12));
      await page.waitForTimeout(900);
    }
    await page.waitForFunction(() => {
      const stills = [...document.querySelectorAll<HTMLImageElement>('.floor-film-poster')];
      return stills.length > 0 && stills.every((image) => image.naturalWidth > 0);
    }, null, { timeout: 120_000 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(1_200);

    const FRAMES = 60;
    const STEP_MS = 100;
    let midFrame: { stillsOnScreen: number; wordsOnScreen: number } | null = null;
    for (let index = 0; index <= FRAMES; index += 1) {
      const top = Math.round((limit * index) / FRAMES);
      await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), top);
      if (index === Math.round(FRAMES / 2)) {
        writeFileSync(join(OUTPUT_DIR, 'slow-2g-390-mid.png'), await page.screenshot({ type: 'png' }));
        // Read AT the mid frame, not after the loop — the first version of this asked
        // the page what was on screen once the scroll had already reached the bottom,
        // and dutifully reported that the journey was nowhere in sight.
        midFrame = await page.evaluate(() => {
          const onScreen = (element: Element) => {
            const box = element.getBoundingClientRect();
            return box.bottom > 0 && box.top < window.innerHeight && box.width > 0 && box.height > 0;
          };
          return {
            stillsOnScreen: [...document.querySelectorAll<HTMLImageElement>('.floor-film-poster')]
              .filter((image) => onScreen(image) && image.naturalWidth > 0).length,
            wordsOnScreen: [...document.querySelectorAll<HTMLElement>('.journey h1, .journey h2, .journey p')]
              .filter((node) => onScreen(node) && (node.textContent ?? '').trim().length > 0).length,
          };
        });
      }
      await page.waitForTimeout(STEP_MS);
    }

    // "Legible" is checked rather than eyeballed: at the mid frame there is a decoded
    // still on screen and there is copy on screen.
    test.info().annotations.push({ type: 'capture', description: JSON.stringify(midFrame) });
    expect(midFrame!.stillsOnScreen, 'a decoded still is on screen at the mid frame').toBeGreaterThan(0);
    expect(midFrame!.wordsOnScreen, 'and so is the copy').toBeGreaterThan(0);

    expect(mediaRequests, 'no film bytes across the whole scroll').toEqual([]);
    const video = page.video();
    expect(video, 'a video was recorded').not.toBeNull();
    await context.close();
    await video!.saveAs(join(OUTPUT_DIR, 'slow-2g-390-scroll.webm'));
  });
});
