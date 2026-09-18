import { expect, test, type Page } from '@playwright/test';

/**
 * Step 23 — Act 5, the perspective cylinder.
 *
 * Every assertion here is written to be able to fail. Where a gate reads "the
 * ring never rotates" or "the inner track never scrolls", the test first proves
 * the thing it is constraining is actually capable of moving (a track with real
 * overflow, a ring whose rotation demonstrably changes under scroll), so a
 * silently dead cylinder cannot pass by being inert.
 */

const galleryReady = async (page: Page) => {
  await page.waitForSelector('.transformation-gallery.is-hydrated', { timeout: 60_000 });
};

const cylinderReady = async (page: Page) => {
  await galleryReady(page);
  await expect(page.locator('.transformation-gallery')).toHaveAttribute('data-gallery-layout', 'passage');
  await page.waitForFunction(() => Boolean(window.__ffeCylinder), null, { timeout: 30_000 });
};

const pin = (page: Page) => page.evaluate(() => {
  const probe = window.__ffeCylinder!;
  return { start: probe.start(), end: probe.end() };
});

const rotation = (page: Page) => page.evaluate(() => window.__ffeCylinder!.rotation());

const scrollTo = async (page: Page, top: number) => {
  await page.evaluate((value) => window.scrollTo({ top: value, behavior: 'instant' }), top);
  // The scrubbed tween takes one frame, the React commit that reads it takes
  // the next, and the director re-measures on a frame of its own after that.
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }));
};

test.describe('the Act 5 cylinder', () => {
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'Desktop-only: the ring is not admitted on a coarse pointer.');
    // Each of these loads the whole homepage — three films, the canvas, and
    // every island — before it can touch the ring. On a machine running other
    // agents' builds that first navigation alone can pass the 30 s default,
    // which fails the test for a reason that has nothing to do with Act 5.
    test.setTimeout(120_000);
  });

  test('derives the ring from the polygon formula the geometry module exports', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    await cylinderReady(page);

    const ring = await page.evaluate(() => {
      const probe = window.__ffeCylinder!;
      const slot = document.querySelector<HTMLElement>('.transformation-gallery__slot')!;
      return {
        cards: probe.cards,
        radius: probe.radius(),
        innerAngle: probe.innerAngle(),
        cardWidth: slot.getBoundingClientRect().width,
      };
    });
    // Seven faces for three approved pairs (`CYLINDER_MIN_FACES`).
    expect(ring.cards).toBe(3);
    expect(ring.innerAngle).toBeCloseTo(360 / 7, 6);
    const pitch = ring.cardWidth * 1.16;
    expect(ring.radius, `radius for a ${Math.round(ring.cardWidth)}px card`)
      .toBeCloseTo(pitch / (2 * Math.tan(Math.PI / 7)), 3);

    // Each card carries its own index, and the front slot is published.
    const indices = await page.locator('[data-featured-panel]').evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).getPropertyValue('--card-index').trim()));
    expect(indices).toEqual(['0', '1', '2']);
    const slot = await page.locator('.transformation-gallery__passage').getAttribute('data-front-slot');
    expect(slot, 'data-front-slot="x,y,w,h"').toMatch(/^-?\d+,-?\d+,\d+,\d+$/);
    const [, , width, height] = slot!.split(',').map(Number);
    expect(width).toBeGreaterThan(320);
    expect(height).toBeGreaterThan(320);
  });

  test('rotates monotonically forward and returns to its start angle coming back', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    await cylinderReady(page);
    const { start, end } = await pin(page);
    expect(end - start, 'pin travel').toBeGreaterThan(400);

    await scrollTo(page, start);
    const atStart = await rotation(page);
    expect(atStart).toBeCloseTo(0, 3);

    const samples: number[] = [];
    for (let step = 1; step <= 30; step += 1) {
      await scrollTo(page, start + ((end - start) * step) / 30);
      samples.push(await rotation(page));
    }
    for (let index = 1; index < samples.length; index += 1) {
      expect(samples[index], `sample ${index} (${samples[index]}) below sample ${index - 1} (${samples[index - 1]})`)
        .toBeLessThan(samples[index - 1]);
    }
    // Falsifiable: the ring really turned, and it turned by the polygon's own
    // two inner angles rather than by some arbitrary amount.
    const innerAngle = await page.evaluate(() => window.__ffeCylinder!.innerAngle());
    expect(samples.at(-1)!).toBeCloseTo(-innerAngle * 2, 1);

    await scrollTo(page, start);
    expect(await rotation(page), 'back at the start of the pin').toBeCloseTo(atStart, 3);
  });

  test('holds the proof chapter for the whole pinned range and hands over after it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    await cylinderReady(page);
    const { start, end } = await pin(page);
    const room = page.locator('.journey');

    for (const fraction of [0, .05, .25, .5, .75, .95, 1]) {
      await scrollTo(page, start + (end - start) * fraction);
      await expect.poll(() => room.getAttribute('data-room'), { message: `p=${fraction}` }).toBe('proof');
    }
    // Past the act: the director hands over to Your finish. Measured off the
    // next chapter's own box rather than a guessed distance, because the proof
    // chapter carries the explore ribbon after the pin releases.
    await page.evaluate(() => {
      const next = document.querySelector('#finish-hall')!.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + next.top + next.height / 2 - window.innerHeight / 2, behavior: 'instant' });
    });
    await expect.poll(() => room.getAttribute('data-room')).toBe('finish-hall');
  });

  test('is the only ScrollTrigger inside #proof, and transforms nothing above itself', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    await cylinderReady(page);
    const { start, end } = await pin(page);
    await scrollTo(page, start + (end - start) * .5);

    const inProof = await page.evaluate(() => {
      const proof = document.querySelector('#proof')!;
      // `__ffeRoute.scrollTriggers()` counts; the elements come off the same
      // registry through the pinned/trigger nodes ScrollTrigger marks in the DOM.
      const pinned = [...document.querySelectorAll('.pin-spacer')].filter((node) => proof.contains(node));
      return {
        pinSpacers: pinned.length,
        pinSpacerInsideProof: pinned.every((node) => proof.contains(node)),
        pinnedIsThePassage: pinned.every((node) => node.querySelector(':scope > .transformation-gallery__passage') !== null),
        total: window.__ffeRoute?.scrollTriggers() ?? -1,
      };
    });
    expect(inProof.pinSpacers, 'one pinned element inside #proof').toBe(1);
    expect(inProof.pinSpacerInsideProof).toBe(true);
    expect(inProof.pinnedIsThePassage, 'the pinned element is the inner passage, not the section').toBe(true);
    expect(inProof.total, 'the page still has its other triggers, so the count is real').toBeGreaterThan(1);

    const transforms = await page.evaluate(() => ({
      journey: getComputedStyle(document.querySelector('.journey')!).transform,
      proof: getComputedStyle(document.querySelector('#proof')!).transform,
      // Falsifiability: the ring *does* carry a transform, so "none" elsewhere
      // is a measured absence and not a reader that always says "none".
      ring: getComputedStyle(document.querySelector('.transformation-gallery__ring')!).transform,
    }));
    expect(transforms.journey, '.journey').toBe('none');
    expect(transforms.proof, '#proof').toBe('none');
    expect(transforms.ring).toMatch(/^matrix3d\(/);
  });

  test('a divider drag on the front card moves the divider and not the ring', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    await cylinderReady(page);
    const { start } = await pin(page);
    await scrollTo(page, start);

    const stage = page.locator('[data-featured-panel][data-front="true"] [data-comparison]');
    await expect(stage).toHaveCount(1);
    const box = (await stage.boundingBox())!;
    const before = await rotation(page);

    await page.mouse.move(box.x + box.width * .2, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .45, box.y + box.height * .5, { steps: 6 });
    await page.mouse.move(box.x + box.width * .8, box.y + box.height * .5, { steps: 10 });
    await expect.poll(async () => Number(await stage.getAttribute('data-displayed-reveal'))).toBeGreaterThan(70);
    await page.mouse.up();

    const after = await rotation(page);
    expect(after, `rotateY before ${before} / after ${after}`).toBeCloseTo(before, 4);
    expect(await page.evaluate(() => window.scrollY), 'the page did not scroll under the drag').toBeCloseTo(start, 0);
  });

  test('tabbing into the third card scrolls the window, never the inner track', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    await cylinderReady(page);
    const { start } = await pin(page);
    await scrollTo(page, start);

    const before = await page.evaluate(() => window.scrollY);
    await page.locator('[data-featured-panel]').nth(2).locator('input[type="range"]').focus();
    await expect(page.locator('.transformation-gallery')).toHaveAttribute('data-featured-index', '2');
    const after = await page.evaluate(() => window.scrollY);
    expect(after, `scrollY ${before} -> ${after}`).toBeGreaterThan(before + 100);

    // The track is not a sideways scroller in this layout at all — the ring is
    // 3D, so there is nothing for a focus ring or a hash jump to scroll to. The
    // fallback ribbon spec below proves the same element *is* a real scroller
    // when it is laid out flat, so this is a measured difference, not a reader
    // that always returns zero.
    const track = await page.evaluate(() => {
      const element = document.querySelector<HTMLElement>('.transformation-gallery__featured-window')!;
      element.scrollLeft = 240;
      return {
        scrollLeft: element.scrollLeft,
        scrollTop: element.scrollTop,
        overflow: element.scrollWidth - element.clientWidth,
        overflowX: getComputedStyle(element).overflowX,
        snap: getComputedStyle(element).scrollSnapType,
      };
    });
    expect(track.scrollLeft, 'inner track scrollLeft after a forced 240px offset').toBe(0);
    expect(track.scrollTop, 'inner track scrollTop').toBe(0);
    expect(track.overflow, 'no sideways room exists while pinned').toBe(0);
    expect(track.overflowX, 'track overflow while pinned').toBe('hidden');
    expect(track.snap, 'snap is off while pinned').toBe('none');
  });

  test('a resize round trip while pinned costs under 0.02 of layout shift', async ({ page }) => {
    await page.addInitScript(() => {
      (window as unknown as { __shift: number }).__shift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
          if (!entry.hadRecentInput) (window as unknown as { __shift: number }).__shift += entry.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    await cylinderReady(page);
    const { start, end } = await pin(page);
    await scrollTo(page, start + (end - start) * .5);
    await page.waitForTimeout(400);

    const baseline = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);
    await page.setViewportSize({ width: 1024, height: 1000 });
    await page.waitForTimeout(400);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.waitForTimeout(400);
    const total = await page.evaluate(() => (window as unknown as { __shift: number }).__shift);

    expect(total - baseline, `layout shift across 1440 -> 1024 -> 1440 (${(total - baseline).toFixed(4)})`).toBeLessThan(.02);
    await expect(page.locator('.transformation-gallery')).toHaveAttribute('data-gallery-layout', 'passage');
  });
});

test.describe('the Act 5 fallback ribbon', () => {
  test('a coarse pointer gets a native snap ribbon with a live divider on every card', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-safari', 'Phone-only: this is the non-admitted path.');
    // The phone project decodes the full-size pairs; on a machine running other
    // agents' builds the first navigation can outrun the 30 s default.
    test.setTimeout(120_000);
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    await galleryReady(page);
    const gallery = page.locator('.transformation-gallery');

    await expect(gallery).toHaveAttribute('data-gallery-layout', 'native');
    expect(await page.evaluate(() => Boolean(window.__ffeCylinder)), 'no cylinder probe on a phone').toBe(false);
    // Other acts keep their own pins; Act 5 has none.
    expect(
      await page.evaluate(() => document.querySelectorAll('#proof .pin-spacer').length),
      'no pin inside #proof',
    ).toBe(0);

    const ribbon = gallery.locator('.transformation-gallery__featured-window');
    await expect(ribbon).toHaveCSS('scroll-snap-type', 'x mandatory');
    await expect(ribbon).toHaveCSS('overflow-x', 'auto');
    // One card per screen, and — the counterpart to the pinned assertion — the
    // very same element here really is a horizontal scroller with room to move.
    const widths = await page.evaluate(() => {
      const track = document.querySelector<HTMLElement>('.transformation-gallery__featured-window')!;
      const panel = track.querySelector<HTMLElement>('[data-featured-panel]')!;
      return {
        track: track.clientWidth,
        panel: panel.getBoundingClientRect().width,
        overflow: track.scrollWidth - track.clientWidth,
      };
    });
    expect(Math.abs(widths.panel - widths.track), 'one panel fills the ribbon').toBeLessThanOrEqual(2);
    expect(widths.overflow, 'the ribbon has real horizontal overflow').toBeGreaterThan(0);

    // The divider on card 2 is live from the keyboard.
    const second = gallery.locator('[data-featured-panel]').nth(1);
    const slider = second.getByRole('slider');
    await slider.scrollIntoViewIfNeeded();
    await slider.focus();
    const before = Number(await slider.inputValue());
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => Number(await slider.inputValue())).toBe(before + 1);
    await expect(second.locator('[data-comparison]')).toHaveAttribute('data-displayed-reveal', String(before + 1));
  });
});
