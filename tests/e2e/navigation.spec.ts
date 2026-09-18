import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

/**
 * Step 12 — route transitions and island lifecycle.
 *
 * Two promises are under test and they pull against each other. The site must never
 * white-flash between routes, which is why `<ClientRouter />` keeps the document and
 * `transition:persist` keeps the header and the one WebGL context. And it must never
 * leak motion state across routes, which is the bill that comes with keeping them:
 * a director that was never stopped, ScrollTriggers measuring a page that is gone,
 * a canvas still drawing a view whose rectangle left with the last body.
 *
 * Every assertion below is written as a comparison against a **fresh load of the same
 * route**, not against a constant. A constant would pass just as happily if the page
 * had stopped building the thing being counted; the fresh load is the control.
 */

const OUTPUT = new URL('../../output/step-12/', import.meta.url);

/** The walk the brief specifies, run twice. */
const LAP = [
  { label: '-> /services', path: '/services' },
  { label: '<- back (/)', path: '/' },
  { label: '-> /projects', path: '/projects' },
  { label: '-> / (brand)', path: '/' },
] as const;

interface RouteState {
  readonly path: string;
  readonly canvases: number;
  readonly canvasStamp: string | null;
  readonly views: readonly string[];
  readonly scrollTriggers: number;
  readonly teardowns: number;
  readonly bindings: number;
  readonly headerRoute: string | null;
  readonly activeLinks: readonly string[];
  readonly surfaceAttribute: string | null;
  readonly journeyRevision: string | null;
}

const readRouteState = (): RouteState => ({
  path: location.pathname,
  canvases: document.querySelectorAll('canvas').length,
  canvasStamp: document.querySelector<HTMLCanvasElement>('canvas[data-surface-canvas]')?.dataset.surfaceInstance ?? null,
  views: (window.__ffeSurface?.views() ?? []).slice().sort(),
  scrollTriggers: window.__ffeRoute?.scrollTriggers() ?? -1,
  teardowns: window.__ffeRoute?.teardowns() ?? -1,
  bindings: window.__ffeRoute?.bindings() ?? -1,
  headerRoute: document.querySelector<HTMLElement>('[data-site-header]')?.dataset.route ?? null,
  activeLinks: [...document.querySelectorAll<HTMLAnchorElement>('[data-primary-navigation] a')]
    .filter((link) => link.getAttribute('aria-current') === 'page')
    .map((link) => link.pathname),
  surfaceAttribute: document.documentElement.dataset.surface ?? null,
  journeyRevision: document.querySelector<HTMLElement>('.journey')?.dataset.journeyRevision ?? null,
});

/**
 * The canvas is `client:idle` and the compositor is deferred behind an idle callback,
 * so "arrived" means the page has loaded *and* the surface has published a renderer —
 * anything sampled before that measures a half-mounted page, not a route.
 */
async function settle(page: Page) {
  await page.waitForLoadState('load').catch(() => {});
  await settleArrival(page);
}

/**
 * Wait for the page to be *finished arriving*, on a signal that is not one of the
 * things asserted afterwards.
 *
 * `FilmVeilLoader` defers its import behind a `requestIdleCallback` with a 1.5 s
 * timeout, so "the document is here" is not yet "the compositor has had its chance",
 * and a fixed wait races it on a busy machine. `data-film-veil` is the loader's own
 * decision — `on` once it has admitted the compositor — which is a different fact from
 * "the view registry contains `film-veil`". Waiting on the first and asserting the
 * second still fails if the compositor never registers.
 */
async function settleArrival(page: Page, expectedPath?: string) {
  // First the navigation itself: a click starts a view transition and the swap can take
  // well over a second on a loaded machine (brand hop measured at median 466 ms, max
  // 797 ms in isolation, longer under parallel Playwright runs). Every wait below is
  // satisfiable on the *outgoing* document, so without this the fixed settle could
  // expire before the URL changed and "arrived" would fail on a page that simply had
  // not swapped yet.
  if (expectedPath) {
    await page.waitForURL((url) => url.pathname === expectedPath, { timeout: 30_000 }).catch(() => {});
  }
  // Three deferred things have to have landed, and none of them is what is asserted:
  //  - the `client:idle` island itself (`window.__ffeSurface`);
  //  - its lazy renderer chunk, which is what puts a <canvas> in the document at all;
  //  - `FilmVeilLoader`'s own decision, deferred behind a `requestIdleCallback` with a
  //    1.5 s timeout, and written as `data-film-veil`.
  // Waiting on those and then asserting the *view registry* still fails if either
  // layer stops registering — which is the point.
  await page.waitForFunction(
    () => Boolean(window.__ffeSurface) && document.querySelector('canvas[data-surface-canvas]') !== null,
    null,
    { timeout: 30_000 },
  ).catch(() => {});
  await page.waitForFunction(() => {
    const veil = document.querySelector<HTMLElement>('.film-veil');
    return veil === null || veil.dataset.filmVeil === 'on' || veil.dataset.filmVeil === 'still';
  }, null, { timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(2_600);
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

const toLinear = (value: number) => {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};
const LINEAR = Array.from({ length: 256 }, (_, index) => toLinear(index));

/** Mean relative luminance of a PNG, 0..1. A frame of pure #FFFFFF scores 1. */
async function frameWhiteness(buffer: Buffer): Promise<number> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let sum = 0;
  for (let index = 0; index < data.length; index += info.channels) {
    sum += 0.2126 * LINEAR[data[index]] + 0.7152 * LINEAR[data[index + 1]] + 0.0722 * LINEAR[data[index + 2]];
  }
  return sum / (info.width * info.height);
}

test.describe('route transitions', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'client-side routing + WebGL desktop path');
  test.describe.configure({ timeout: 300_000 });

  test('walks the routes twice without leaking motion, canvases or console errors', async ({ page }) => {
    test.slow();
    const errors = watchErrors(page);

    // Control: what each route looks like when the browser built it from scratch.
    const fresh = new Map<string, RouteState>();
    for (const path of ['/', '/services', '/projects']) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await settle(page);
      const state = await page.evaluate(readRouteState);
      fresh.set(path, state);
      // eslint-disable-next-line no-console
      console.log(`[fresh]   ${path.padEnd(10)} triggers ${state.scrollTriggers}  canvases ${state.canvases}  `
        + `views [${state.views.join(', ')}]  header ${state.headerRoute}`);
    }
    // Falsifiable: if the homepage had stopped building its scroll choreography the
    // equality checks below would pass on 0 === 0 and prove nothing.
    expect(fresh.get('/')!.scrollTriggers, 'the homepage builds scroll choreography at all').toBeGreaterThan(20);

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const firstStamp = (await page.evaluate(readRouteState)).canvasStamp;
    expect(firstStamp, 'the surface canvas stamps itself once').not.toBeNull();

    for (let lap = 0; lap < 2; lap += 1) {
      for (const hop of LAP) {
        if (hop.label.startsWith('<-')) await page.goBack();
        else if (hop.path === '/') await page.getByRole('link', { name: 'Final Finish Epoxy home' }).click();
        else await page.getByRole('link', { name: hop.path === '/services' ? 'Services' : 'Projects', exact: true }).first().click();
        await settleArrival(page, hop.path);

        const state = await page.evaluate(readRouteState);
        const control = fresh.get(hop.path)!;
        // eslint-disable-next-line no-console
        console.log(`[lap ${lap}]   ${hop.label.padEnd(14)} triggers ${state.scrollTriggers} (fresh ${control.scrollTriggers})  `
          + `canvases ${state.canvases}  views [${state.views.join(', ')}]  header ${state.headerRoute}  `
          + `teardowns ${state.teardowns}  bindings ${state.bindings}`);

        expect(state.path, `${hop.label}: arrived`).toBe(hop.path);
        expect(state.scrollTriggers, `${hop.label}: ScrollTriggers match a fresh load`).toBe(control.scrollTriggers);
        expect(state.views, `${hop.label}: the canvas draws exactly the fresh load's views`).toEqual(control.views);
        expect(state.canvases, `${hop.label}: exactly one canvas`).toBe(1);
        expect(state.canvases, `${hop.label}: same canvas count as a fresh load`).toBe(control.canvases);
        expect(state.canvasStamp, `${hop.label}: the same <canvas> element crossed the swap`).toBe(firstStamp);
        expect(state.surfaceAttribute, `${hop.label}: html[data-surface] re-asserted after the swap`)
          .toBe(control.surfaceAttribute);
        // The per-document registries must not grow: one more teardown per lap is a leak.
        expect(state.teardowns, `${hop.label}: registered teardowns match a fresh load`).toBe(control.teardowns);
        expect(state.bindings, `${hop.label}: route-scoped bindings are not duplicated`).toBe(control.bindings);
        // The persisted header re-derives the route it is now on.
        expect(state.headerRoute, `${hop.label}: header route theme`).toBe(control.headerRoute);
        expect(state.activeLinks, `${hop.label}: header active link`).toEqual(control.activeLinks);
      }
    }

    expect(errors, `console errors across two laps: ${errors.join(' | ')}`).toEqual([]);
  });

  test('leaves the journey director driving the homepage after a round trip', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await settle(page);

    await page.getByRole('link', { name: 'Services', exact: true }).first().click();
    await page.waitForTimeout(2_000);
    // Off the journey, the director is stopped: nothing is publishing a revision.
    expect(await page.evaluate(() => document.querySelector('.journey'))).toBeNull();

    await page.goBack();
    await settleArrival(page, '/');
    const revision = () => page.evaluate(() =>
      Number(document.querySelector<HTMLElement>('.journey')?.dataset.journeyRevision ?? '-1'));
    const before = await revision();
    expect(before, 'the director published at least once on the returned-to homepage').toBeGreaterThan(0);

    await page.mouse.wheel(0, 1_600);
    await expect.poll(revision, { timeout: 10_000 }).toBeGreaterThan(before);
    const after = await revision();
    // eslint-disable-next-line no-console
    console.log(`[director] snapshot revision after returning to /: ${before} -> ${after} while scrolling`);
  });

  test('never paints a near-white frame while the paper wipe crosses', async ({ page }) => {
    test.slow();
    mkdirSync(OUTPUT, { recursive: true });
    await page.goto('/services', { waitUntil: 'domcontentloaded' });
    await settle(page);
    const settledWhiteness = await frameWhiteness(await page.screenshot({ type: 'png' }));

    const cdp = await page.context().newCDPSession(page);
    const frames: Buffer[] = [];
    cdp.on('Page.screencastFrame', async (event) => {
      frames.push(Buffer.from(event.data, 'base64'));
      await cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {});
    });
    // One frame per composited frame: ~16 ms apart while the wipe is running.
    await cdp.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 720, maxHeight: 450 });
    await page.getByRole('link', { name: 'Projects', exact: true }).first().click();
    await page.waitForTimeout(1_600);
    await cdp.send('Page.stopScreencast');
    await cdp.detach().catch(() => {});

    expect(frames.length, 'the screencast recorded the navigation').toBeGreaterThan(10);
    let whitest = -1;
    let whitestFrame: Buffer | null = null;
    for (const frame of frames) {
      const value = await frameWhiteness(frame);
      if (value > whitest) { whitest = value; whitestFrame = frame; }
    }
    const capture = new URL('./navigation-whitest-frame.png', OUTPUT);
    if (whitestFrame) writeFileSync(capture, whitestFrame);
    // eslint-disable-next-line no-console
    console.log(`[wipe] ${frames.length} frames across /services -> /projects · whitest mean luminance `
      + `${whitest.toFixed(4)} (settled /services reads ${settledWhiteness.toFixed(4)}) · ${capture.pathname}`);

    expect(whitest, 'no frame of the navigation is a white flash').toBeLessThan(0.98);
    // Falsifiable in the other direction: a site whose settled pages already read as
    // near-white would make the assertion above meaningless.
    expect(settledWhiteness, 'a settled page is itself well under the flash threshold').toBeLessThan(0.98);
  });

  test('plays the 520 ms paper wipe, and a 200 ms cross-fade when motion is refused', async ({ browser }) => {
    const sample = async (reducedMotion: 'reduce' | 'no-preference') => {
      const context = await browser.newContext({ reducedMotion });
      const page = await context.newPage();
      await page.addInitScript(() => {
        // The running view-transition animations, straight off the timeline. Reading
        // these rather than a computed style is what makes the measurement real: a
        // computed style resolves to the same declaration whether a transition is in
        // flight or not (verified by the `idle` control below).
        const live = () => document.getAnimations().flatMap((animation) => {
          const effect = animation.effect as KeyframeEffect | null;
          const pseudo = effect?.pseudoElement ?? '';
          if (!pseudo.startsWith('::view-transition')) return [];
          return [{
            pseudo,
            name: (animation as Animation & { animationName?: string }).animationName ?? '',
            duration: Number(effect!.getComputedTiming().activeDuration),
          }];
        });
        (window as unknown as { __wipeProbe?: unknown }).__wipeProbe = null;
        document.addEventListener('astro:before-swap', () => {
          const start = performance.now();
          const record = { animations: [] as ReturnType<typeof live>, firstSeen: -1, lastSeen: -1 };
          (window as unknown as { __wipeProbe: typeof record }).__wipeProbe = record;
          const tick = () => {
            const now = performance.now() - start;
            const current = live();
            if (current.length > 0) {
              if (record.firstSeen < 0) record.firstSeen = now;
              record.lastSeen = now;
              if (record.animations.length === 0) record.animations = current;
            }
            if (now < 1_400) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
      });
      await page.goto('/services', { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('load').catch(() => {});
      await page.waitForTimeout(1_500);
      // Control: outside a navigation the browser is running no view-transition
      // animation at all, so what is measured below is the live transition and not a
      // computed style that would have read the same either way.
      const idle = await page.evaluate(() => document.getAnimations()
        .filter((animation) => ((animation.effect as KeyframeEffect | null)?.pseudoElement ?? '')
          .startsWith('::view-transition')).length);
      await page.getByRole('link', { name: 'Projects', exact: true }).first().click();
      await page.waitForTimeout(1_800);
      const record = await page.evaluate(() => (window as unknown as {
        __wipeProbe: { animations: Array<{ pseudo: string; name: string; duration: number }>; firstSeen: number; lastSeen: number };
      }).__wipeProbe);
      await context.close();
      return { idle, ...record };
    };

    const full = await sample('no-preference');
    // eslint-disable-next-line no-console
    console.log('[wipe] full motion:', JSON.stringify(full));
    expect(full.idle, 'no view-transition animation is running between navigations').toBe(0);
    const wipeIn = full.animations.find((entry) => entry.pseudo === '::view-transition-new(root)')!;
    const wipeOut = full.animations.find((entry) => entry.pseudo === '::view-transition-old(root)')!;
    expect(wipeIn.name).toBe('ffe-page-wipe-in');
    expect(wipeOut.name).toBe('ffe-page-wipe-out');
    expect(wipeIn.duration).toBe(520);
    expect(wipeOut.duration).toBe(520);
    expect(full.lastSeen - full.firstSeen, 'the wipe is on screen for about its own length')
      .toBeGreaterThan(380);

    const reduced = await sample('reduce');
    // eslint-disable-next-line no-console
    console.log('[wipe] reduced motion:', JSON.stringify(reduced));
    expect(reduced.idle).toBe(0);
    const fadeIn = reduced.animations.find((entry) => entry.pseudo === '::view-transition-new(root)')!;
    const fadeOut = reduced.animations.find((entry) => entry.pseudo === '::view-transition-old(root)')!;
    // Astro's own stylesheet forces `animation: none !important` on these under
    // reduced motion; the cross-fade being here at all is the override working.
    expect(fadeIn.name).toBe('ffe-route-fade-in');
    expect(fadeOut.name).toBe('ffe-route-fade-out');
    expect(fadeIn.duration).toBe(200);
    expect(fadeOut.duration).toBe(200);
    expect(reduced.lastSeen - reduced.firstSeen, 'the cross-fade is over in a fraction of the wipe')
      .toBeLessThan(full.lastSeen - full.firstSeen);

    // The computed style agrees with the running animation, which is what a future
    // change to the CSS would have to keep true.
    expect(reduced.animations.every((entry) => entry.duration === 200)).toBe(true);
  });

  test('prefetches a primary destination on hover', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('load').catch(() => {});
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));
    await expect(page.locator('[data-primary-navigation] a[href="/finishes"]')).toHaveAttribute('data-astro-prefetch', 'hover');
    expect(requests.some((url) => url.endsWith('/finishes')), 'not fetched before the hover').toBe(false);
    await page.getByRole('link', { name: 'Finishes', exact: true }).first().hover();
    await expect.poll(() => requests.filter((url) => url.endsWith('/finishes')).length, { timeout: 10_000 })
      .toBeGreaterThan(0);
  });

  test('re-measures the page when it comes back from the back/forward cache', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await settle(page);
    await page.evaluate(() => window.__ffeSurface!.resetFrames());
    await page.waitForTimeout(1_200);
    expect(await page.evaluate(() => window.__ffeSurface!.frames), 'an idle page renders nothing').toBe(0);
    // Playwright cannot force a real bfcache restore, so the event itself is
    // synthesised; what is being tested is that the handler is wired and asks the
    // demand-rendered canvas for a frame, which an idle page otherwise never does.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect.poll(() => page.evaluate(() => window.__ffeSurface!.frames), { timeout: 5_000 }).toBeGreaterThan(0);
  });
});
