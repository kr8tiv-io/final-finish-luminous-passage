import { expect, test, type Page } from '@playwright/test';

/**
 * Act 4 — Reclaim. The three-room bay, both compositions.
 *
 * The boundary handoff itself is `boundaries.spec`'s job; this spec is about the
 * two things that are new here: a published bay coordinate that the DOM train
 * follows exactly, and a forced-horizontal act that is still native scroll.
 *
 * Every assertion below is paired with something that would make it fail if the
 * bay were inert: a monotonic walk that must also COVER the full travel, a "no
 * transform" check next to a count of the transforms that do exist, a pin check
 * that names the one pin the storyboard allows instead of asserting zero.
 */

const ROOMS = ['garage', 'vault', 'mancave'] as const;
const ACT_4_FOLDS = ['garage:vault', 'vault:mancave'] as const;

async function openJourney(page: Page): Promise<string> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const hydrated = (timeout: number) => page.waitForFunction(
    () => document.documentElement.dataset.journeyTier !== undefined
      && document.querySelector<HTMLElement>('.journey')?.dataset.bayMode !== undefined,
    null,
    { timeout },
  ).then(() => true, () => false);
  if (!await hydrated(30_000)) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.documentElement.dataset.journeyTier !== undefined
        && document.querySelector<HTMLElement>('.journey')?.dataset.bayMode !== undefined,
      null,
      { timeout: 60_000 },
    );
  }
  return String(await page.getAttribute('html', 'data-journey-tier'));
}

function nextFrames(page: Page): Promise<void> {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

/** Document-space top and height of the whole act. */
function bayBox(page: Page): Promise<{ top: number; height: number }> {
  return page.evaluate(() => {
    const node = document.querySelector<HTMLElement>('[data-reclaim-bay]');
    if (!node) return { top: 0, height: 0 };
    const rect = node.getBoundingClientRect();
    return { top: rect.top + window.scrollY, height: rect.height };
  });
}

/** translateX of an element, in CSS pixels, or NaN when it carries no transform. */
function translateX(page: Page, selector: string): Promise<number> {
  return page.evaluate((target) => {
    const node = document.querySelector<HTMLElement>(String(target));
    if (!node) return Number.NaN;
    const value = getComputedStyle(node).transform;
    if (value === 'none') return 0;
    const parsed = value.match(/matrix(3d)?\(([^)]+)\)/);
    if (!parsed) return Number.NaN;
    const parts = parsed[2].split(',').map((part) => Number(part.trim()));
    return parsed[1] ? parts[12] : parts[4];
  }, selector);
}

/** Scroll the viewport centre onto a bay slot, the way the director samples it. */
async function seekBay(page: Page, target: number): Promise<number> {
  let reached = Number.NaN;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    reached = await page.evaluate((want) => {
      const rooms = [...document.querySelectorAll<HTMLElement>('[data-reclaim-bay] [data-bay-room]')];
      if (rooms.length < 2) return Number.NaN;
      const box = (node: HTMLElement) => {
        const rect = node.getBoundingClientRect();
        return { start: rect.top + window.scrollY, end: rect.bottom + window.scrollY };
      };
      const steps = rooms.length - 1;
      const slot = Number(want) * steps;
      const index = Math.min(steps - 1, Math.floor(slot));
      const local = slot - index;
      const a = box(rooms[index]);
      const b = box(rooms[index + 1]);
      // A whole slot frames that room's MIDDLE, so its caption band is on screen;
      // only a fractional slot is a fold, and that is framed inside the breath.
      const centre = local <= 0
        ? (a.start + a.end) / 2
        : local >= 1
          ? (b.start + b.end) / 2
          : a.end + (b.start - a.end) * local;
      window.scrollTo(0, Math.round(centre - window.innerHeight / 2));
      return Number.parseFloat(
        getComputedStyle(document.querySelector('.journey') as HTMLElement).getPropertyValue('--bay-progress'),
      );
    }, String(target));
    await nextFrames(page);
    if (!Number.isFinite(reached) || Math.abs(reached - target) < 0.015) break;
  }
  return reached;
}

test.describe.configure({ mode: 'serial', timeout: 180_000 });

test('the act renders three rooms, one headline, and the copy deck’s five captions', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });

  for (const room of ROOMS) {
    await expect(page.locator(`.journey [data-journey-chapter="${room}"]`)).toHaveCount(1);
  }
  await expect(page.locator('[data-reclaim-bay] [data-bay-room]')).toHaveCount(3);
  await expect(page.getByRole('heading', { name: 'Reclaim your garage or basement.' })).toBeVisible();
  await expect(page.locator('.reclaim-second-line')).toHaveText('Make room for what you love.');

  // `COPY-DECK.md` Act 4: the five captions the storyboard names — workshop, gym,
  // hobby, storage, lounge — read out of the three rooms' caption groups.
  const captions = await page.locator('.reclaim-room__copy').allInnerTexts();
  expect(captions).toHaveLength(3);
  const all = captions.join(' ');
  for (const word of ['workshop', 'gym', 'hobby', 'storage', 'lounge']) {
    expect(all.toLowerCase(), `caption theme: ${word}`).toContain(word);
  }
  // A6: each of the three rooms is labelled as a concept, not an installed job.
  await expect(page.locator('.reclaim-room .chapter-index span')).toHaveCount(3);

  // The third film is wired to the manifest's own encodes, both rungs.
  const sources = await page.locator('#mancave .floor-film-video source').evaluateAll(
    (nodes) => nodes.map((node) => node.getAttribute('src')),
  );
  expect(sources).toEqual([
    '/videos/follow-floor/480/epoxy-mancave.mp4',
    '/videos/follow-floor/720/epoxy-mancave.mp4',
  ]);
  await expect(page.locator('#mancave .floor-film-poster'))
    .toHaveAttribute('src', '/images/brand/epoxy-mancave-poster.jpg');
});

test('the bay is native scroll: no transform on the journey or any chapter, no pin in Act 4', async ({ page }) => {
  await openJourney(page);
  const box = await bayBox(page);
  await page.evaluate((y) => window.scrollTo(0, Number(y)), String(Math.round(box.top + box.height / 2)));
  await nextFrames(page);

  const geometry = await page.evaluate(() => ({
    journey: getComputedStyle(document.querySelector('.journey') as HTMLElement).transform,
    chapters: [...document.querySelectorAll<HTMLElement>('.journey-chapter')]
      .map((node) => [node.id, getComputedStyle(node).transform] as const),
    ancestors: [...document.querySelectorAll<HTMLElement>('[data-reclaim-bay] [data-bay-room]')]
      .flatMap((room) => {
        const chain: string[] = [];
        for (let node = room.parentElement; node && node !== document.body; node = node.parentElement) {
          if (getComputedStyle(node).transform !== 'none') chain.push(`${node.tagName}.${node.className}`);
        }
        return chain;
      }),
    transformed: [...document.querySelectorAll<HTMLElement>('.journey *')]
      .filter((node) => getComputedStyle(node).transform !== 'none').length,
    pins: window.__ffeRoute?.pins?.() ?? ['no-probe'],
    baySpacers: document.querySelectorAll('[data-reclaim-bay] .pin-spacer').length,
  }));

  expect(geometry.journey, '.journey must never carry a transform').toBe('none');
  for (const [id, transform] of geometry.chapters) {
    expect(transform, `chapter section #${id} must never carry a transform`).toBe('none');
  }
  expect(geometry.ancestors, 'no ancestor of a bay room may carry a transform').toEqual([]);
  // Falsifiable: the page really is full of transforms, so "none" above is a
  // statement about these elements rather than about a page that transforms nothing.
  expect(geometry.transformed, 'the journey does transform things, just not those').toBeGreaterThan(0);

  // Directive 2 allows a pin only on the inner wrapper of Act 5 and Act 7. Act 4
  // is sticky-in-flow, so nothing in the bay may pin — and nothing may quietly
  // start pinning elsewhere either, which is why the whole list is asserted.
  expect(geometry.pins.filter((pin) => pin.includes(':in-bay')), 'no pin inside the Reclaim bay').toEqual([]);
  expect(geometry.baySpacers, 'no pin spacer inside the Reclaim bay').toBe(0);
  // eslint-disable-next-line no-console
  console.log(`[pins] ${geometry.pins.length} pinned trigger(s): ${geometry.pins.join(', ') || 'none'}`);
});

test('the act plays garage, vault, mancave, proof in order, and the train follows the published slot', async ({ page }) => {
  const tier = await openJourney(page);
  const horizontal = await page.evaluate(
    () => document.querySelector<HTMLElement>('.journey')?.dataset.bayMode === 'horizontal',
  );
  // eslint-disable-next-line no-console
  console.log(`[bay] tier=${tier} mode=${horizontal ? 'horizontal' : 'stacked'} viewport=${JSON.stringify(page.viewportSize())}`);

  const box = await bayBox(page);
  expect(box.height, 'the act must have measurable length').toBeGreaterThan(0);

  const samples: Array<{ x: number; bay: number; active: string }> = [];
  for (let index = 0; index < 30; index += 1) {
    const y = Math.round(box.top - 400 + ((box.height + 900) * index) / 29);
    await page.evaluate((to) => window.scrollTo(0, Number(to)), String(y));
    await nextFrames(page);
    samples.push({
      x: horizontal ? await translateX(page, '[data-bay-track]') : 0,
      ...await page.evaluate(() => {
        const journey = document.querySelector<HTMLElement>('.journey') as HTMLElement;
        return {
          bay: Number.parseFloat(getComputedStyle(journey).getPropertyValue('--bay-progress')),
          active: journey.dataset.room ?? '',
        };
      }),
    });
  }

  // The act's rooms are visited in order, and the act hands over to #proof.
  const order = [...new Set(samples.map((sample) => sample.active))]
    .filter((id) => [...ROOMS, 'proof'].includes(id as typeof ROOMS[number] | 'proof'));
  expect(order, 'the act plays its rooms in order and exits into the gallery')
    .toEqual(['garage', 'vault', 'mancave', 'proof']);

  // The published slot rises across the act and saturates at both ends.
  const slots = samples.map((sample) => sample.bay);
  expect(slots[0]).toBe(0);
  expect(slots.at(-1)).toBe(1);
  slots.forEach((value, index) => {
    if (index === 0) return;
    expect(value, `the bay slot must never go backwards while scrolling forward: ${slots.join(' ')}`)
      .toBeGreaterThanOrEqual(slots[index - 1] - 0.0005);
  });

  if (horizontal) {
    const xs = samples.map((sample) => sample.x);
    // eslint-disable-next-line no-console
    console.log(`[train] trackX ${xs.map((x) => x.toFixed(0)).join(' ')}`);
    xs.forEach((value, index) => {
      if (index === 0) return;
      expect(value, `the track must travel one way across the act: ${xs.join(' ')}`)
        .toBeLessThanOrEqual(xs[index - 1] + 0.5);
    });
    const width = page.viewportSize()?.width ?? 0;
    // Falsifiable: a track that never moved would satisfy "monotonic" perfectly.
    expect(xs[0], 'the train starts parked on the first room').toBeCloseTo(0, 0);
    expect(xs.at(-1), 'the train ends parked on the last room').toBeCloseTo(-2 * width, 0);

    // Each room plate rides the same published slot as the track, exactly.
    await seekBay(page, 0.5);
    const parked = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-bay-room]')]
      .map((room) => {
        const film = room.querySelector<HTMLElement>('.floor-film');
        const value = film ? getComputedStyle(film).transform : 'none';
        const parsed = value.match(/matrix(3d)?\(([^)]+)\)/);
        const parts = parsed ? parsed[2].split(',').map((part) => Number(part.trim())) : [];
        return { id: room.dataset.bayRoom ?? '', x: parsed ? (parsed[1] ? parts[12] : parts[4]) : 0 };
      }));
    parked.forEach((plate, index) => {
      expect(plate.x, `${plate.id} must be parked one screen from its neighbour`)
        .toBeCloseTo((index - 1) * width, 0);
    });
  }

  // Scrolling back returns the train to exactly where it started.
  await page.evaluate(() => window.scrollTo(0, 0));
  await nextFrames(page);
  await nextFrames(page);
  expect(await page.evaluate(
    () => Number.parseFloat(getComputedStyle(document.querySelector('.journey') as HTMLElement).getPropertyValue('--bay-progress')),
  )).toBe(0);
  if (horizontal) expect(await translateX(page, '[data-bay-track]')).toBe(0);
});

test('the second line arrives in the vault third and every caption settles in its own room', async ({ page }) => {
  await openJourney(page);
  const readCopy = () => page.evaluate(() => ({
    phase: document.querySelector<HTMLElement>('.journey')?.dataset.bayPhase ?? '',
    second: Number(getComputedStyle(document.querySelector('.reclaim-second-line') as HTMLElement).opacity),
    captions: [...document.querySelectorAll<HTMLElement>('[data-bay-room]')].map((room) => ({
      id: room.dataset.bayRoom ?? '',
      phase: room.dataset.roomPhase ?? '',
      opacity: Number(getComputedStyle(room.querySelector('.reclaim-room__copy') as HTMLElement).opacity),
    })),
  }));

  await seekBay(page, 0);
  await page.waitForTimeout(900);
  const atGarage = await readCopy();
  expect(atGarage.phase).toBe('garage');
  expect(atGarage.second, 'the second line waits for the vault third').toBeLessThan(0.1);
  expect(atGarage.captions.find((caption) => caption.id === 'garage')?.opacity).toBeGreaterThan(0.9);
  expect(atGarage.captions.find((caption) => caption.id === 'mancave')?.opacity).toBeLessThan(0.1);

  await seekBay(page, 0.5);
  await page.waitForTimeout(900);
  const atVault = await readCopy();
  expect(atVault.phase).toBe('vault');
  expect(atVault.second, 'the second line arrives in the vault third').toBeGreaterThan(0.9);
  expect(atVault.captions.find((caption) => caption.id === 'vault')?.opacity).toBeGreaterThan(0.9);

  await seekBay(page, 1);
  await page.waitForTimeout(900);
  const atMancave = await readCopy();
  expect(atMancave.phase).toBe('mancave');
  expect(atMancave.captions.find((caption) => caption.id === 'mancave')?.opacity).toBeGreaterThan(0.9);

  // Opacity alone is not enough, and this is the assertion that matters: the
  // caption spent a build laid out at opacity 1, on top in a hit test, and
  // painting nothing at all, because it sat below the bay's own sticky overlays
  // in the stacking order. Only "is it actually on screen" catches that.
  // (The act label lives at the room's bottom edge, below the fold when the room
  // is framed centred, so it is home.spec's visibility test that covers it.)
  await expect(page.locator('#mancave .reclaim-room__copy')).toBeInViewport();

  // The headline's persistence is a property of the horizontal bay, not of the
  // act: in the train it is sticky bottom-left for all three rooms, and on the
  // stacked composition it is an opening statement at the head of the act that
  // scrolls away with the first room. Holding it on a 390 px screen put it on top
  // of the room caption, which is a worse phone than a headline you scroll past.
  const headline = page.getByRole('heading', { name: 'Reclaim your garage or basement.' });
  const horizontal = await page.evaluate(
    () => document.querySelector<HTMLElement>('.journey')?.dataset.bayMode === 'horizontal',
  );
  if (horizontal) {
    await expect(headline, 'the bay holds its headline through the last room').toBeInViewport();
    await seekBay(page, 0.5);
    await expect(headline, 'and through the middle room').toBeInViewport();
  } else {
    const box = await bayBox(page);
    await page.evaluate((y) => window.scrollTo(0, Number(y)), String(Math.round(box.top)));
    await nextFrames(page);
    await expect(headline, 'the stacked act opens on its headline').toBeInViewport();
  }
});

test('the act never produces a horizontal scrollbar, at either composition', async ({ page }) => {
  await openJourney(page);
  const box = await bayBox(page);
  for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
    await page.evaluate((y) => window.scrollTo(0, Number(y)), String(Math.round(box.top + box.height * fraction)));
    await nextFrames(page);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.scrollingElement?.scrollWidth ?? 0,
      innerWidth: window.innerWidth,
      scrollLeft: document.scrollingElement?.scrollLeft ?? 0,
    }));
    expect(overflow.scrollWidth, `no horizontal overflow at ${fraction} of the act`)
      .toBe(overflow.innerWidth);
    expect(overflow.scrollLeft).toBe(0);
  }
});

test('each room scrubs its own film inside its own third', async ({ page }) => {
  const tier = await openJourney(page);
  test.skip(tier === 'still', 'the still tier shows posters and decodes no film');

  for (const [index, room] of ROOMS.entries()) {
    const slot = index / (ROOMS.length - 1);
    await seekBay(page, slot);
    const film = page.locator(`#${room} .floor-film-video`);
    await page.waitForFunction(
      (id) => (document.querySelector<HTMLVideoElement>(`#${id} .floor-film-video`)?.readyState ?? 0) >= 2,
      room,
      { timeout: 60_000 },
    );
    const start = await film.evaluate((node: HTMLVideoElement) => node.currentTime);
    // A third of a room's own height is comfortably inside its own hold window.
    await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.45)));
    await nextFrames(page);
    await page.waitForFunction(
      ([id, from]) => Math.abs(
        (document.querySelector<HTMLVideoElement>(`#${id} .floor-film-video`)?.currentTime ?? 0) - Number(from),
      ) > 0.05,
      [room, String(start)] as const,
      { timeout: 45_000 },
    );
    const moved = await film.evaluate((node: HTMLVideoElement) => node.currentTime);
    // eslint-disable-next-line no-console
    console.log(`[scrub] ${room} currentTime ${start.toFixed(2)} -> ${moved.toFixed(2)}`);
    expect(Math.abs(moved - start), `${room} must scrub its own film`).toBeGreaterThan(0.05);
  }
});

test('only the current and adjacent rooms hold a decoded film', async ({ page }) => {
  const tier = await openJourney(page);
  test.skip(tier === 'still', 'the still tier decodes nothing');

  await seekBay(page, 0);
  await page.waitForTimeout(1_200);
  const residency = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.journey-chapter')]
    .flatMap((chapter) => {
      const film = chapter.querySelector<HTMLVideoElement>('.floor-film-video, .pour-film');
      return film ? [{ id: chapter.id, preload: film.preload, ready: film.readyState }] : [];
    }));
  // eslint-disable-next-line no-console
  console.log(`[residency] ${residency.map((entry) => `${entry.id}:${entry.preload}/${entry.ready}`).join(' ')}`);
  const requested = residency.filter((entry) => entry.preload === 'auto').map((entry) => entry.id);
  expect(requested.sort(), 'only the room on stage and the one it hands to are requested')
    .toEqual(['garage', 'vault']);
  expect(residency.find((entry) => entry.id === 'mancave')?.preload)
    .toBe('none');
});

test('every Act 4 fold is authored as the bay’s own veil mode', async ({ page }) => {
  await openJourney(page);
  const breaths = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
    '[data-reclaim-bay] .journey-breath[data-hall-from][data-hall-to]',
  )].map((node) => `${node.dataset.hallFrom}:${node.dataset.hallTo}`));
  expect(breaths).toEqual([...ACT_4_FOLDS]);

  // Neither fold leaves a white stage any more: the Reclaim reading aside moved
  // out of the bay so the three rooms hand over to one another directly.
  const fromWhite = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
    '[data-reclaim-bay] .journey-breath[data-hall-from][data-hall-to]',
  )].map((node) => node.previousElementSibling?.hasAttribute('data-journey-white-stage') === true));
  expect(fromWhite, 'the bay’s interior is room to room, never room to paper').toEqual([false, false]);
});
