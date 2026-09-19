import { expect, test, type Page } from '@playwright/test';

/**
 * Act 6 — the archive lattice (Step 23b).
 *
 * Deliberately screenshot-free. Every assertion here reads geometry, computed
 * style or the DOM, so the whole file runs on the `mobile-safari` project as
 * well as on `chromium`; the pixel work for this act lives in `boundaries.spec`
 * (the two white-dissolve seams either side of it) and in the step's captures.
 *
 * Each check is written so a broken lattice scores differently from a working
 * one. The drift test is the clearest example: a lattice that never moves fails
 * the first half and a lattice that never stops fails the second, so neither a
 * frozen page nor a runaway one can pass by accident.
 */

const PHONE_WIDTH = 760;

async function openArchive(page: Page): Promise<{ width: number; phone: boolean }> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement.dataset.journeyTier !== undefined,
    null,
    { timeout: 60_000 },
  );
  // Bounded on purpose. `document.fonts.ready` does not always settle in
  // headless WebKit on a loaded software rasteriser (measured: a 180 s test
  // timeout inside this one `evaluate`), and nothing below depends on it —
  // every measurement here is taken after its own `requestAnimationFrame`
  // settle, and the lattice's geometry is set in CSS rather than by text metrics.
  await page.evaluate(() => Promise.race([
    document.fonts?.ready ?? Promise.resolve(),
    new Promise((resolve) => setTimeout(resolve, 3_000)),
  ]));
  const width = page.viewportSize()?.width ?? 1_440;
  return { width, phone: width < PHONE_WIDTH };
}

/** Park the viewport at `t` of the act, the way the island's own clock reads it. */
function seek(page: Page, t: number): Promise<void> {
  return page.evaluate((target) => {
    const section = document.querySelector<HTMLElement>('#archive');
    if (!section) throw new Error('#archive is not in the document');
    const box = section.getBoundingClientRect();
    const top = box.top + window.scrollY;
    const span = Math.max(1, box.height - window.innerHeight);
    window.scrollTo(0, Math.round(top + Number(target) * span));
  }, String(t));
}

function frames(page: Page, count = 4): Promise<void> {
  return page.evaluate((n) => new Promise<void>((resolve) => {
    let left = Number(n);
    const tick = () => (left-- > 0 ? requestAnimationFrame(tick) : resolve());
    requestAnimationFrame(tick);
  }), String(count));
}

/** The island writes `--al-enter` on its root the first time it paints. */
function awaitLattice(page: Page): Promise<unknown> {
  return page.waitForFunction(
    () => Boolean(document.querySelector<HTMLElement>('[data-archive-lattice]')?.style.getPropertyValue('--al-enter')),
    null,
    { timeout: 60_000 },
  );
}

function tileOrigins(page: Page): Promise<Array<[number, number]>> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>('#archive .al-tile')]
    .filter((_, index, all) => index === 0 || index === Math.floor(all.length / 2) || index === all.length - 1)
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return [Math.round(rect.left), Math.round(rect.top)] as [number, number];
    }));
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('serves all 96 photographs as described images before any script runs', async ({ page }) => {
  await openArchive(page);
  const served = await page.evaluate(() => {
    const tiles = [...document.querySelectorAll<HTMLImageElement>('#archive .al-tile__thumb')];
    const columns = Number(getComputedStyle(document.querySelector('.al')!).getPropertyValue('--al-cols'));
    return {
      tiles: tiles.length,
      columns,
      withAlt: tiles.filter((image) => (image.getAttribute('alt') ?? '').trim().length > 0).length,
      // The eager set must be exactly the first row: one short and the act opens
      // on a blank row, one long and the page pays for images nobody has reached.
      eagerIsFirstRow: tiles.every((image, index) =>
        (image.getAttribute('loading') === 'eager') === (index < columns)),
      lazy: tiles.filter((image) => image.getAttribute('loading') === 'lazy').length,
      firstAlt: tiles[0]?.getAttribute('alt'),
      lastAlt: tiles.at(-1)?.getAttribute('alt'),
      // The resolve tile's full-resolution plate is a second copy of a
      // photograph the tile above it already describes, so it is the one image
      // in this section that must carry `alt=""`.
      emptyAlt: [...document.querySelectorAll('#archive img')]
        .filter((image) => (image.getAttribute('alt') ?? '') === '').length,
    };
  });
  expect(served.tiles, 'the served HTML carries the whole archive').toBe(96);
  expect(served.withAlt, 'every tile is a described photograph').toBe(96);
  expect(served.firstAlt).toBe('Final Finish project archive photograph 1 of 96');
  expect(served.lastAlt).toBe('Final Finish project archive photograph 96 of 96');
  expect(served.eagerIsFirstRow, 'eager loading is exactly the first row').toBe(true);
  expect(served.lazy).toBe(96 - served.columns);
  expect(served.emptyAlt, 'only the resolve underlay is decorative').toBe(1);
});

test('reserves its height in CSS, so hydration cannot move the page', async ({ page }) => {
  const { phone } = await openArchive(page);
  await page.waitForTimeout(800);
  const before = await page.evaluate(() => ({
    archive: document.querySelector<HTMLElement>('#archive')!.offsetHeight,
    scrollHeight: document.documentElement.scrollHeight,
  }));

  await seek(page, 0);
  await awaitLattice(page);
  await frames(page, 6);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(600);
  await frames(page, 6);

  const after = await page.evaluate(() => ({
    archive: document.querySelector<HTMLElement>('#archive')!.offsetHeight,
    scrollHeight: document.documentElement.scrollHeight,
    // Step 23's lesson, asserted rather than assumed: this act holds with a
    // sticky host in normal flow and must never create a pin spacer.
    pinSpacers: document.querySelectorAll('#archive .pin-spacer').length,
    tiles: document.querySelectorAll('#archive .al-tile').length,
  }));

  expect(after.archive, 'the act is exactly as tall after hydration as before').toBe(before.archive);
  expect(after.pinSpacers, 'no pin, and therefore no pin spacer').toBe(0);
  // The phone trim happens after hydration and must cost nothing: the tiles it
  // drops are out of flow inside a host whose height is fixed in CSS.
  expect(after.tiles).toBe(phone ? 48 : 96);

  // The page's own scrollHeight is NOT asserted equal here, and the reason is
  // recorded rather than hidden: `#proof` grows by its gallery's ScrollTrigger
  // pin spacer on hydration (measured 2089 -> 4459 px at 1440), which is Step
  // 23's mechanic and not this act's. What this act owes the page is that its
  // own contribution never changes, which is the assertion above. The log keeps
  // the page number visible so a future regression somewhere else is still seen.
  // eslint-disable-next-line no-console
  console.log(`[archive] page scrollHeight ${before.scrollHeight} -> ${after.scrollHeight}`
    + ` (#archive ${before.archive} -> ${after.archive}, pin spacers inside it ${after.pinSpacers})`);
});

test('never puts a transform on .journey or on a chapter', async ({ page }) => {
  await openArchive(page);
  await seek(page, 0.5);
  await awaitLattice(page);
  await frames(page, 6);
  const nodes = await page.evaluate(() => [
    document.querySelector<HTMLElement>('.journey'),
    ...document.querySelectorAll<HTMLElement>('.journey-chapter'),
  ].filter((node): node is HTMLElement => node !== null)
    .map((node) => ({ id: node.id || 'journey', transform: getComputedStyle(node).transform })));
  expect(nodes.length, 'the journey and its ten chapters were found').toBe(11);
  expect(nodes.filter((node) => node.transform !== 'none'), JSON.stringify(nodes)).toEqual([]);
});

test('holds every unapproved photograph dimmed and uncaptioned', async ({ page }) => {
  await openArchive(page);
  await seek(page, 0.5);
  await awaitLattice(page);
  await frames(page, 6);
  const hold = await page.evaluate(() => {
    const inners = [...document.querySelectorAll<HTMLElement>('#archive .al-tile .al-tile__in')];
    const copy = document.querySelector<HTMLElement>('#archive .al-copy')!;
    return {
      tiles: inners.length,
      opacities: [...new Set(inners.map((node) => Number(getComputedStyle(node).opacity).toFixed(2)))],
      renderedCaptions: [...document.querySelectorAll<HTMLElement>('#archive .al-tile__caption')]
        .filter((caption) => getComputedStyle(caption).display !== 'none').length,
      copyVisibility: getComputedStyle(copy).visibility,
      copyOpacity: Number(getComputedStyle(copy).opacity),
      headline: document.querySelector('#archive-title')?.textContent?.trim(),
      count: document.querySelector('#archive .al-copy__count')?.textContent?.trim(),
      link: document.querySelector('#archive .al-copy__link')?.getAttribute('href'),
    };
  });
  // `docs/approvals/2026-09-project-pairs.md` records nothing approved, so the
  // whole lattice is at 0.6 and not one caption is rendered. When a photograph
  // is approved its `--al-alpha` becomes 1 and this expectation has to change
  // with it — which is the point of asserting the exact set.
  expect(hold.opacities, 'one opacity, and it is the unapproved one').toEqual(['0.60']);
  expect(hold.renderedCaptions, 'no tile claims anything while unapproved').toBe(0);
  expect(hold.copyVisibility).toBe('visible');
  expect(hold.copyOpacity).toBeGreaterThan(0.9);
  expect(hold.headline).toBe('Every floor here is a real job.');
  expect(hold.count).toBe('96 photographs. 23 floors. June 2025 to February 2026.');
  expect(hold.link).toBe('/projects');
});

test('drifts across the act and stands still inside the hold window', async ({ page }) => {
  await openArchive(page);
  await seek(page, 0.24);
  await awaitLattice(page);
  await frames(page, 6);
  const driftStart = await tileOrigins(page);
  await seek(page, 0.6);
  await frames(page, 6);
  const driftEnd = await tileOrigins(page);
  await seek(page, 0.42);
  await frames(page, 6);
  const holdStart = await tileOrigins(page);
  await seek(page, 0.58);
  await frames(page, 6);
  const holdEnd = await tileOrigins(page);

  expect(
    driftStart.some((point, index) => point[0] !== driftEnd[index][0] || point[1] !== driftEnd[index][1]),
    `the diagonal must actually travel: ${JSON.stringify({ driftStart, driftEnd })}`,
  ).toBe(true);
  expect(holdStart, 'nothing moves while the headline is being read').toEqual(holdEnd);
});

test('resolves one tile to the viewport, captioned as the archive', async ({ page }) => {
  await openArchive(page);
  await seek(page, 0.5);
  await awaitLattice(page);
  await frames(page, 6);
  await seek(page, 1);
  await frames(page, 10);

  const resolved = await page.evaluate(() => {
    const tile = document.querySelector<HTMLElement>('#archive .al-tile.is-resolving');
    if (!tile) return null;
    const rect = tile.getBoundingClientRect();
    const caption = tile.querySelector<HTMLElement>('.al-tile__caption');
    return {
      worstDelta: Math.max(
        Math.abs(rect.x), Math.abs(rect.y),
        Math.abs(rect.width - window.innerWidth), Math.abs(rect.height - window.innerHeight),
      ),
      captionDisplay: caption ? getComputedStyle(caption).display : 'absent',
      captionText: caption?.textContent?.trim() ?? null,
      fullPlateOpacity: Number(getComputedStyle(tile.querySelector('.al-tile__full')!).opacity),
      othersMaxOpacity: Math.max(...[...document.querySelectorAll<HTMLElement>(
        '#archive .al-tile:not(.is-resolving) .al-tile__in',
      )].map((node) => Number(getComputedStyle(node).opacity))),
    };
  });

  expect(resolved, 'the act ends on a resolved tile').not.toBeNull();
  expect(resolved!.worstDelta, 'the resolved tile is the viewport').toBeLessThan(0.5);
  expect(resolved!.captionDisplay).toBe('block');
  // A single photograph labelled as the archive it came from. Never a pairing
  // claim: nothing here says these two frames are the same room.
  expect(resolved!.captionText).toBe('Finished floor. Final Finish project archive.');
  expect(resolved!.fullPlateOpacity, 'the full-resolution plate is beneath it').toBeGreaterThan(0.9);
  expect(resolved!.othersMaxOpacity, 'the rest of the lattice has gone').toBeLessThan(0.05);
});

test('takes its place in the act order, between the gallery and Your finish', async ({ page }) => {
  await openArchive(page);
  const seen = await page.evaluate(async () => {
    const order: string[] = [];
    const height = document.documentElement.scrollHeight;
    for (let y = 0; y < height; y += 120) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const active = document.querySelector<HTMLElement>('.journey')?.dataset.room;
      if (active && order.at(-1) !== active) order.push(active);
    }
    return order;
  });
  const archive = seen.indexOf('archive');
  expect(archive, 'the archive becomes the active chapter').toBeGreaterThan(-1);
  expect(seen[archive - 1], 'it follows the gallery').toBe('proof');
  expect(seen[archive + 1], 'and hands over to Your finish').toBe('finish-hall');
});

test('scrolls the whole act without a layout shift or a console error', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message.split('\n')[0]}`));
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    (window as unknown as { __clsArm: boolean }).__clsArm = false;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput: boolean }>) {
        const store = window as unknown as { __cls: number; __clsArm: boolean };
        if (entry.hadRecentInput || !store.__clsArm) continue;
        store.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });

  await openArchive(page);
  await seek(page, 0);
  await awaitLattice(page);
  await page.waitForTimeout(700);
  await frames(page, 6);
  // Armed only now: everything above this line is arrival, and the act is not
  // answerable for the shifts the rest of the page makes on its way down.
  await page.evaluate(() => { (window as unknown as { __clsArm: boolean }).__clsArm = true; });
  await page.evaluate(async () => {
    const section = document.querySelector<HTMLElement>('#archive')!;
    const box = section.getBoundingClientRect();
    const top = box.top + window.scrollY;
    const span = Math.max(1, box.height - window.innerHeight);
    for (const direction of [1, -1]) {
      for (let step = 0; step <= 80; step += 1) {
        const t = direction === 1 ? step / 80 : 1 - step / 80;
        window.scrollTo(0, Math.round(top + t * span));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
    }
  });
  await frames(page, 6);

  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  // eslint-disable-next-line no-console
  console.log(`[archive] layout-shift across the act: ${cls.toFixed(5)}`);
  expect(cls, 'the act holds still while it is scrolled through').toBeLessThan(0.02);
  expect(errors, JSON.stringify(errors.slice(0, 4))).toEqual([]);
});
