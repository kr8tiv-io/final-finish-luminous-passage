import { devices, expect, test, type Page } from '@playwright/test';

/**
 * Step 15 — the layout-level surface plane. Step 18a — everything else drawing
 * through it.
 *
 * CANVAS COUNT, DOCUMENTED. One `<canvas>` with a view registry, and after Step 18a
 * it is the only canvas the site mounts: the boundary compositor (`film-veil`) and
 * the full-screen menu's floor (`nav-floor`) are views of it rather than contexts of
 * their own. `/floor-visualizer` is the one documented exception and it is measured,
 * not assumed: `FinishPreview` mounts its own three.js canvas at rest on that route,
 * before any photo is uploaded, and it is deliberately left alone — it is an
 * interactive tool with its own lifecycle, not a layer of the page's composition.
 * The test below proves the surface plane does not disturb it.
 */
const EXPECTED_TOTAL_CANVASES: ReadonlyArray<readonly [string, number, string]> = [
  ['/', 1, 'SurfaceCanvas alone — the compositor is one of its views'],
  ['/services', 1, 'SurfaceCanvas only'],
  ['/projects', 1, 'SurfaceCanvas only'],
  ['/floor-visualizer', 2, 'SurfaceCanvas + the visualizer FinishPreview canvas, by design'],
];

/** Which views each route is expected to have registered with the menu closed. */
const EXPECTED_VIEWS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['/', ['film-veil', 'surface-floor']],
  ['/services', ['surface-floor']],
  ['/projects', ['surface-floor']],
  ['/floor-visualizer', ['surface-floor']],
];

const SURFACE_CANVAS = 'canvas[data-surface-canvas]';

// Every test here waits for the full `load` event on routes that pull the pour film's
// posters, against a single-threaded built server running the whole file serially. The
// default 30 s is enough in isolation but not behind the multi-route test.
test.describe.configure({ timeout: 60_000 });

async function waitForSurface(page: Page) {
  // The island is client:idle, so it cannot hydrate before its chunk has arrived.
  await page.waitForLoadState('load');
  // On a route that also hydrates something heavy (/floor-visualizer) the probe can
  // still arrive a beat after the rest of the page.
  await page.waitForFunction(() => Boolean(window.__ffeSurface), null, { timeout: 30_000 });
  await page.waitForFunction(
    () => (window.__ffeSurface?.states as { renderer?: string } | undefined)?.renderer === 'webgl',
    null,
    { timeout: 30_000 },
  );
  // One settled frame before anything is sampled.
  await page.waitForTimeout(600);
}

/** Read a viewport pixel out of a real screenshot — the canvas has no preserveDrawingBuffer. */
async function readPixels(page: Page, points: ReadonlyArray<readonly [string, number, number]>) {
  const shot = (await page.screenshot({ type: 'png' })).toString('base64');
  return page.evaluate(async ({ shot, points }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${shot}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const scale = image.width / window.innerWidth;
    return Object.fromEntries(points.map(([name, x, y]) => {
      const data = context.getImageData(Math.round(x * scale), Math.round(y * scale), 1, 1).data;
      return [name, [data[0], data[1], data[2]] as [number, number, number]];
    })) as Record<string, [number, number, number]>;
  }, { shot, points: points as unknown as Array<[string, number, number]> });
}

const channelDelta = (a: readonly number[], b: readonly number[]) =>
  Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));

/** A hydration failure is useless without the page's own complaint attached. */
test.beforeEach(({ page }) => {
  page.on('pageerror', (error) => console.log(`[pageerror] ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[console.error] ${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    if (/\.js(\?|$)/.test(request.url())) console.log(`[requestfailed] ${request.url()}`);
  });
});

test.describe('surface plane', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'desktop WebGL path');

  test('mounts exactly one surface canvas per route, with the total documented', async ({ page }) => {
    test.slow();
    const expectedViews = new Map(EXPECTED_VIEWS.map(([route, views]) => [route, views]));
    for (const [route, total, note] of EXPECTED_TOTAL_CANVASES) {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      await waitForSurface(page);
      expect(page.locator(SURFACE_CANVAS), `${route}: one surface canvas`).toHaveCount(1);
      expect(await page.locator('canvas').count(), `${route}: ${note}`).toBe(total);
      // Falsifiable: the count alone would also pass if a view had silently stopped
      // registering, so name what that one canvas is actually drawing.
      await expect
        .poll(async () => (await page.evaluate(() => window.__ffeSurface!.views())).slice().sort(), { timeout: 15_000 })
        .toEqual([...expectedViews.get(route)!].sort());
      // The plane never intercepts a pointer, on any route — the host, the wrapper
      // react-three-fiber inserts, and the canvas itself.
      await expect(page.locator('.surface-canvas-host')).toHaveCSS('pointer-events', 'none');
      await expect(page.locator(SURFACE_CANVAS)).toHaveCSS('pointer-events', 'none');
      expect(await page.evaluate(() => {
        const canvas = document.querySelector<HTMLElement>('canvas[data-surface-canvas]')!;
        return [...document.querySelectorAll<HTMLElement>('.surface-canvas-host, .surface-canvas-host *')]
          .concat(canvas)
          .every((node) => getComputedStyle(node).pointerEvents === 'none');
      }), `${route}: nothing under the surface host takes a pointer`).toBe(true);
    }
  });

  test('keeps the floor visualizer working with the surface plane mounted', async ({ page }) => {
    await page.goto('/floor-visualizer', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    // NB: the page's <h1> is split by a <br>, so its accessible name has no space
    // between the sentences. `visualizer.spec.ts` asserts the spaced form and fails on
    // this branch for that reason, independently of this step.
    await expect(page.getByRole('heading', { level: 1, name: /Your space\.\s*A new surface\./ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Finish:/i })).toHaveCount(30);
    const choice = page.getByRole('button', { name: 'Finish: Blue Orbit' });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
  });

  test('keeps one canvas while the full-screen menu is open, and gives it back on close', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    const toggle = page.getByRole('button', { name: /primary menu/i });
    expect(await page.locator('canvas').count(), 'menu closed').toBe(1);

    await toggle.click();
    await expect.poll(async () => page.evaluate(() => window.__ffeSurface!.views()), { timeout: 10_000 })
      .toContain('nav-floor');
    expect(await page.locator('canvas').count(), 'menu open: still one canvas').toBe(1);
    // The menu's floor is the one canvas, so the overlay's own paper plate gets out of
    // its way; the view paints opaque paper itself (SurfaceFloor's nav-floor clear).
    await expect(page.locator('.nav-menu__floor')).toHaveAttribute('data-nav-floor-view', 'live');
    await expect(page.locator('.nav-menu__veil')).toHaveCSS('opacity', '0');

    await page.keyboard.press('Escape');
    await expect.poll(async () => page.evaluate(() => window.__ffeSurface!.views()), { timeout: 10_000 })
      .not.toContain('nav-floor');
    expect(await page.locator('canvas').count(), 'menu closed again').toBe(1);
    // The rule that let the overlay's plate step aside is keyed on this attribute, so
    // releasing it is what hands the CSS fallback back. (Its opacity is not asserted
    // here: a closed menu has faded that plate out on its own. The case that matters
    // — the plate returning while the menu is still open — is nav.spec's context-loss
    // and reduced-motion tests.)
    await expect(page.locator('.nav-menu__floor')).not.toHaveAttribute('data-nav-floor-view', 'live');
  });

  test('registers the journey band and the compositor, and renders nothing outside them', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    await expect
      .poll(async () => (await page.evaluate(() => window.__ffeSurface!.views())).slice().sort(), { timeout: 15_000 })
      .toEqual(['film-veil', 'surface-floor']);
    const geometry = await page.evaluate(() => {
      const rect = document.querySelector('[data-surface-fallback]')!.getBoundingClientRect();
      return { ratio: rect.top / window.innerHeight, bottom: rect.bottom, height: window.innerHeight };
    });
    // Storyboard: the horizon sits at 62 % of viewport height.
    expect(geometry.ratio).toBeCloseTo(0.62, 2);
    expect(geometry.bottom).toBeCloseTo(geometry.height, 0);
  });

  test('renders zero frames over 2 s of idle after settle', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    await page.evaluate(() => window.__ffeSurface!.settle());
    await page.waitForTimeout(1_500);
    const before = await page.evaluate(() => window.__ffeSurface!.frames);
    await page.waitForTimeout(2_000);
    const after = await page.evaluate(() => window.__ffeSurface!.frames);
    expect(after - before).toBe(0);
    // Falsifiable: a sweep must move the counter, or "0 frames" would prove nothing.
    await page.evaluate(() => window.__ffeSurface!.sweep(0.4));
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => window.__ffeSurface!.frames)).toBeGreaterThan(after);
  });

  test('morphTo(3) repaints the plane without touching the page above the horizon', async ({ page }) => {
    await page.goto('/dev/surface', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    await page.evaluate(() => {
      window.__ffeSurface!.setHorizon(false);
      window.__ffeSurface!.morphTo(2);
    });
    await page.waitForTimeout(1_200);

    // The plane's density peaks in the upper third of the band, where the floor is far
    // enough to have body but not yet dissolving into the horizon line. Sample across
    // that zone and take the strongest channel move: a single hard-coded pixel would
    // shift meaning with the viewport, and a chip-level sample is noisy by nature.
    const probe = await page.evaluate(() => {
      const rect = document.querySelector('[data-surface-fallback]')!.getBoundingClientRect();
      const x = Math.round(window.innerWidth - 60);
      return {
        band: [0.25, 0.3, 0.35, 0.4].map(
          (f) => [`band${f}`, x, Math.round(rect.top + rect.height * f)] as [string, number, number],
        ),
        centre: ['canvasCentre', x, Math.round(window.innerHeight / 2)] as [string, number, number],
      };
    });
    const points: ReadonlyArray<readonly [string, number, number]> = [...probe.band, probe.centre];

    const before = await readPixels(page, points);
    await page.evaluate(() => window.__ffeSurface!.morphTo(3));
    await page.waitForTimeout(1_200);
    const after = await readPixels(page, points);

    expect(await page.evaluate(() => (window.__ffeSurface!.states as { b: number }).b)).toBe(3);
    const bandDelta = Math.max(...probe.band.map(([name]) => channelDelta(before[name as string], after[name as string])));
    // The plane is a backdrop: the morph is plainly visible inside the band...
    expect(bandDelta).toBeGreaterThan(20);
    // ...and invisible above the horizon, where the page's reading zone lives.
    expect(channelDelta(before.canvasCentre, after.canvasCentre)).toBe(0);
  });

  test('leaves only the horizon line on a white stage', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    await page.evaluate(() => {
      document.querySelector('.chapter-reading[data-journey-white-stage]')?.scrollIntoView({ block: 'center' });
    });
    await page.waitForTimeout(1_800);
    expect(await page.evaluate(() => (window.__ffeSurface!.states as { horizon: boolean }).horizon)).toBe(true);

    const bandTop = await page.evaluate(
      () => Math.round(document.querySelector('[data-surface-fallback]')!.getBoundingClientRect().top),
    );
    const x = await page.evaluate(() => Math.round(window.innerWidth - 60));
    const probes = [
      ['line', x, bandTop],
      ...[-6, -3, 3, 8, 20, 60, 140, 260].map((offset) => [`off${offset}`, x, bandTop + offset] as const),
    ] as ReadonlyArray<readonly [string, number, number]>;
    const pixels = await readPixels(page, probes);

    // The line itself is cobalt ink.
    expect(pixels.line).toEqual([22, 79, 131]);
    // Every other sampled row is untouched paper — the only visible pixel is the line.
    for (const [name, value] of Object.entries(pixels)) {
      if (name === 'line') continue;
      expect(channelDelta(value, [250, 249, 246]), `${name} is paper`).toBeLessThanOrEqual(1);
    }
  });

  test('hides the canvas on context loss and re-mounts the views on restore', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    await expect(page.locator(SURFACE_CANVAS)).toBeVisible();

    // The extension object has to be captured before the loss: once the context is
    // lost, getExtension returns null and the context can never be restored.
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

    await page.evaluate(() => {
      (window as unknown as { __loseContext: WEBGL_lose_context }).__loseContext.restoreContext();
    });
    await expect(page.locator('html')).toHaveAttribute('data-surface', 'webgl', { timeout: 10_000 });
    await expect(page.locator(SURFACE_CANVAS)).toBeVisible();
    // Both views re-registered themselves after the re-mount: the floor because its
    // scene remounts on `restoreKey`, the compositor because it watches the store's
    // renderer state from its own island and never held the context to begin with.
    await expect
      .poll(async () => (await page.evaluate(() => window.__ffeSurface!.views())).slice().sort(), { timeout: 10_000 })
      .toEqual(['film-veil', 'surface-floor']);
  });

  test('swaps the fallback band colour per material state', async ({ page }) => {
    await page.goto('/dev/surface', { waitUntil: 'domcontentloaded' });
    await waitForSurface(page);
    const band = page.locator('[data-surface-fallback]');
    await page.evaluate(() => window.__ffeSurface!.morphTo(1));
    await expect(band).toHaveAttribute('data-surface-state', '1');
    await expect(band).toHaveAttribute('data-surface-name', 'ground-concrete');
    await page.evaluate(() => window.__ffeSurface!.morphTo(5));
    await expect(band).toHaveAttribute('data-surface-state', '5');
    await expect(band).toHaveAttribute('data-surface-name', 'metallic');
    // The swap is a 0.3 s opacity/colour fade, never a layout change.
    await expect(band).toHaveCSS('transition-duration', /0\.3s/);
  });
});

async function expectPhoneFallback(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load');
  await page.waitForFunction(() => Boolean(window.__ffeSurface), null, { timeout: 30_000 });
  await page.waitForTimeout(800);
  // A coarse pointer never gets the plane; it gets the CSS band instead.
  await expect(page.locator(SURFACE_CANVAS)).toHaveCount(0);
  await expect(page.locator('.surface-canvas-host')).toHaveCount(0);
  await expect(page.locator('[data-surface-fallback]')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-surface', 'fallback');
  await expect(page.locator('[data-surface-fallback]')).toHaveAttribute('data-surface-state', /^[0-7]$/);
}

test.describe('surface plane on a phone', () => {
  test.skip(({ browserName }) => browserName === 'chromium', 'mobile-safari project');

  test('renders no canvas and keeps the fallback band', async ({ page }) => {
    await expectPhoneFallback(page);
  });
});

/**
 * The same gate, emulated on Chromium.
 *
 * `devices['iPhone 15 Pro']` normally implies WebKit, which cannot launch on every
 * host (this one is missing icuin77.dll / zlib1.dll). What the admission rule actually
 * reads is the viewport, `isMobile` and `hasTouch` — i.e. `(pointer: coarse)` — so the
 * emulated run measures exactly the same decision and keeps the gate honest where the
 * WebKit binary is unavailable. `defaultBrowserType` is dropped so the project's own
 * browser is used.
 */
const { defaultBrowserType: _phoneEngine, ...IPHONE_15_PRO } = devices['iPhone 15 Pro'];

test.describe('surface plane on an emulated iPhone 15 Pro', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'emulated on the chromium project');
  test.use(IPHONE_15_PRO);

  test('renders no canvas and keeps the fallback band', async ({ page }) => {
    await expectPhoneFallback(page);
    // Falsifiable: the rule under test is the coarse pointer, so prove it is emulated.
    expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true);
    expect(await page.evaluate(() => window.innerWidth)).toBe(393);
  });
});
