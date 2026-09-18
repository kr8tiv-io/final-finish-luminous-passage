import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { dissolveWeight } from '../../src/lib/motion/journey-media';

/**
 * Every room boundary, walked forward and in reverse, at five points inside it.
 *
 * The step this spec guards removed the hard `transitionProgress < 0.5` media
 * cut. What replaces it is a published `mediaOwner` plus a DOM plate crossfade
 * (`--handoff`), so the picture is continuous whether the WebGL veil confirmed
 * a paint (`full`) or was never downloaded at all (`balanced`).
 */

/** Read straight out of the transition table so the two can never drift apart. */
const TRANSITION_SOURCE = readFileSync(
  new URL('../../src/lib/motion/journey-transitions.ts', import.meta.url),
  'utf8',
);
const BOUNDARY_KEYS = [...TRANSITION_SOURCE.matchAll(/^ {2}'([a-z-]+:[a-z-]+)': Object\.freeze/gm)]
  .map((match) => match[1]);

const SAMPLES = [0.05, 0.25, 0.5, 0.75, 0.95] as const;
const PAPER: readonly [number, number, number] = [250, 249, 246];
const PAPER_TOLERANCE = 8;
/**
 * A pixel counts as "changed" only past this per-channel step. Over the 0.02 of
 * progress between the two seam samples the steepest veil edge (`preparation-curl`,
 * a +/-0.11 smoothstep whose front travels ~0.044 uv) can legitimately move a
 * pixel by about a fifth of the distance between the two rooms, so anything
 * smaller is a sweep, not a cut. A real cut moves most pixels the whole way,
 * which the control measurement in the same test proves this still catches.
 */
const SEAM_CHANNEL_TOLERANCE = 48;
const SEAM_PIXEL_BUDGET = 0.02;
const CONTROL_PIXEL_FLOOR = 0.2;

/**
 * Single-frame flash detector for the exit side of a boundary.
 *
 * A flash is a frame that jumps away from the trend and straight back, so the
 * frame must be a local extremum AND differ from both neighbours by more than
 * this. Requiring the extremum matters: on a plain "differs from both
 * neighbours" rule the steepest part of a perfectly smooth ramp trips it — a
 * real walk measured on this build (the pre-Step-11b vault:finish-hall exit,
 * kept as the fixture below because it is real data, not because that boundary
 * still exists) reads 163.6 -> 152.9 -> 142.4, a straight line, which that rule
 * scores at 6.9%.
 */
const FLASH_BUDGET = 0.06;
const SCAN_FRAMES = 40;

interface BoundaryInfo {
  readonly key: string;
  readonly fromWhite: boolean;
  readonly toHasPlate: boolean;
}

interface BoundaryState {
  readonly owner: string;
  readonly handoff: number;
  readonly stage: string | null;
  readonly staged: readonly string[];
  readonly renderedBoundary: string | null;
}

/**
 * Hide the reading layer so the measurement is the media area and nothing else.
 *
 * The white reading stages and the chapter paper wash are in normal flow: they
 * scroll, so between two samples 0.02 of progress apart their edges move about
 * 8 px and drag a full-width band of paper-against-room contrast into the diff
 * (measured: 3.44% of pixels on foundation:garage, entirely from that band).
 * Their backgrounds and feather gradients are switched off here for the same
 * reason their text is — none of it is the media handoff under test.
 *
 * `body` keeps its own paper background on purpose: uncovered area must still
 * read as exactly #FAF9F6, or the "went blank" assertion could never fail.
 */
const MEDIA_ONLY_CSS = `
  .journey .chapter-content, .journey .chapter-index, .journey .material-lens,
  .journey .hero-light, .journey .hero-proof, .journey-motion-control,
  .site-header, .site-footer,
  .journey .white-stage > *, .journey .review-window { visibility: hidden !important; }
  .journey .white-stage { background: transparent !important; }
  .journey .white-stage::before, .journey .white-stage::after,
  .journey .journey-chapter::after { display: none !important; }
`;

async function openJourney(page: Page): Promise<string> {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  // Headless WebKit on a software rasteriser takes its time hydrating the island,
  // and late in a long serial run it sometimes parses the document without ever
  // running it. One reload clears that; the assertion is unchanged, so a journey
  // that genuinely will not publish a tier still fails here.
  const hydrated = async (timeout: number) => page.waitForFunction(
    () => document.documentElement.dataset.journeyTier !== undefined,
    null,
    { timeout },
  ).then(() => true, () => false);
  if (!await hydrated(30_000)) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(
      () => document.documentElement.dataset.journeyTier !== undefined,
      null,
      { timeout: 60_000 },
    );
  }
  await page.addStyleTag({ content: MEDIA_ONLY_CSS });
  // The opening plate is eager, so this one really does wait for a decode.
  // The chapter plates are lazy and only start loading once the director puts
  // them on stage, which is what `awaitStagedPlates` covers at each sample.
  await page.waitForFunction(() => {
    const poster = document.querySelector<HTMLImageElement>('.journey .pour-poster');
    return Boolean(poster && poster.complete && poster.naturalWidth > 0);
  }, null, { timeout: 45_000 });
  const tier = await page.getAttribute('html', 'data-journey-tier');
  expect(tier, 'the journey must publish a resolved capability tier').not.toBeNull();
  return String(tier);
}

function readBoundaries(page: Page): Promise<BoundaryInfo[]> {
  return page.evaluate(() => [...document.querySelectorAll<HTMLElement>(
    '.journey-breath[data-hall-from][data-hall-to]',
  )].map((node) => {
    const to = node.dataset.hallTo ?? '';
    const chapter = document.querySelector(`.journey [data-journey-chapter="${to}"]`);
    return {
      key: `${node.dataset.hallFrom}:${to}`,
      fromWhite: node.hasAttribute('data-hall-from-white')
        || node.previousElementSibling?.hasAttribute('data-journey-white-stage') === true,
      toHasPlate: Boolean(chapter?.querySelector('.floor-film, .chapter-frame, .pour-stage, .hero-frame')),
    };
  }));
}

/** Scroll the viewport centre to `p` of a boundary the way the director measures it. */
async function seek(page: Page, key: string, p: number): Promise<number> {
  let achieved = Number.NaN;
  // Generous on attempts, strict on the result: the caller still asserts the
  // achieved progress, so a page that will not settle fails rather than drifts.
  for (let attempt = 0; attempt < 24; attempt += 1) {
    achieved = await page.evaluate(([boundary, target]) => {
      const node = [...document.querySelectorAll<HTMLElement>('.journey-breath[data-hall-from][data-hall-to]')]
        .find((candidate) => `${candidate.dataset.hallFrom}:${candidate.dataset.hallTo}` === boundary);
      if (!node) return Number.NaN;
      const rect = node.getBoundingClientRect();
      const start = rect.top + window.scrollY;
      const end = rect.bottom + window.scrollY;
      window.scrollTo(0, Math.round(start + (end - start) * Number(target) - window.innerHeight / 2));
      const settled = node.getBoundingClientRect();
      const settledStart = settled.top + window.scrollY;
      const settledEnd = settled.bottom + window.scrollY;
      return (window.scrollY + window.innerHeight / 2 - settledStart)
        / Math.max(1, settledEnd - settledStart);
    }, [key, String(p)] as const);
    await nextFrames(page);
    if (Math.abs(achieved - p) < 0.004) break;
  }
  return achieved;
}

function nextFrames(page: Page): Promise<void> {
  return page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
}

/** Wait until the plate crossfade has actually reached the weight this `p` implies. */
async function settle(page: Page, expected: number): Promise<void> {
  await page.waitForFunction((target) => {
    const journey = document.querySelector<HTMLElement>('.journey');
    if (!journey) return false;
    const handoff = Number.parseFloat(getComputedStyle(journey).getPropertyValue('--handoff'));
    return Number.isFinite(handoff) && Math.abs(handoff - Number(target)) < 0.03;
  }, String(expected), { timeout: 30_000 });
  // The compositor renders on demand, so `--handoff` can be right while the
  // canvas still holds the previous progress. Wait until the painted frame has
  // stopped moving, otherwise a shot catches a stale wipe position and the
  // measurement reads a jump the visitor never saw: that is the whole of the
  // 11.34% this spec once reported for foundation:garage, which measures 1.01%
  // once settled — and 0.84-1.43% at equal steps either side of the seam.
  await page.waitForFunction(() => {
    // Step 18a: the compositor is a view of the one layout canvas, so its frame state
    // lives on `.film-veil` — the element it owns — instead of on a `<canvas>` it now
    // shares with the floor band and the menu. Absent dataset = no compositor (the
    // `balanced` tier never downloads it), which is the old "no canvas" branch.
    const host = document.querySelector<HTMLElement>('.film-veil');
    if (!host?.dataset.renderedBoundary) return true;
    const frame = `${host.dataset.renderedBoundary}:${host.dataset.renderedProgress}`;
    const store = window as unknown as { __veilSettle?: { frame: string; hits: number } };
    if (store.__veilSettle?.frame === frame) store.__veilSettle.hits += 1;
    else store.__veilSettle = { frame, hits: 1 };
    return store.__veilSettle.hits >= 3 && !frame.startsWith('pending');
  }, null, { timeout: 15_000, polling: 'raf' });
  await nextFrames(page);
}

/**
 * Every plate currently on stage must be decoded before a pixel is judged.
 * Chapter posters are `loading="lazy"`: they only begin loading when the
 * director makes their plate fixed and visible, so on a cold server the first
 * frame of a boundary can still be bare paper. Measured without this wait, the
 * first run after a restart read foundation:garage as 11.34% changed across the
 * seam; every later run, with the images warm, read 0.82%.
 */
function awaitStagedPlates(page: Page): Promise<unknown> {
  return page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(
    '.journey [data-media-active] .floor-film-poster, .journey [data-media-active] .pour-poster',
  )].every((image) => image.complete && image.naturalWidth > 0), null, { timeout: 45_000 });
}

function readState(page: Page): Promise<BoundaryState> {
  return page.evaluate(() => {
    const journey = document.querySelector<HTMLElement>('.journey');
    const veilHost = document.querySelector<HTMLElement>('.film-veil');
    return {
      owner: journey?.dataset.mediaOwner ?? '',
      handoff: Number.parseFloat(getComputedStyle(journey as HTMLElement).getPropertyValue('--handoff')),
      stage: journey?.dataset.mediaStage ?? null,
      staged: [...document.querySelectorAll<HTMLElement>('.journey [data-media-active]')]
        .map((node) => `${node.dataset.journeyChapter}/${node.dataset.mediaRole ?? '-'}`),
      renderedBoundary: veilHost?.dataset.renderedBoundary ?? null,
    };
  });
}

async function mediaShot(page: Page): Promise<string> {
  const size = page.viewportSize() ?? { width: 1_280, height: 720 };
  const buffer = await page.screenshot({ clip: { x: 0, y: 0, width: size.width, height: size.height } });
  return buffer.toString('base64');
}

/**
 * Pixel diff without a native decoder: the browser that produced the PNGs
 * decodes them again, both are drawn into one small canvas, and the pixels are
 * compared there. `pngjs`/`pixelmatch` are not in this tree, and adding a
 * dependency for a diff the page can do itself is not worth a lockfile change.
 * Plain `<img>` and `<canvas>`, not `createImageBitmap`/`OffscreenCanvas`, so
 * the same code runs on the WebKit build this repo pins.
 */
function pixelDiff(page: Page, left: string, right: string, tolerance: number): Promise<{
  fraction: number;
  mean: number;
  max: number;
}> {
  return page.evaluate(async ([a, b, limit]) => {
    const decode = (data: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('could not decode a capture'));
      image.src = `data:image/png;base64,${data}`;
    });
    const [one, two] = await Promise.all([decode(a), decode(b)]);
    const width = 240;
    const height = Math.max(1, Math.round((one.naturalHeight / one.naturalWidth) * width));
    const raster = (image: HTMLImageElement) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('no 2d context for the pixel diff');
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const first = raster(one);
    const second = raster(two);
    let differing = 0;
    let sum = 0;
    let max = 0;
    for (let i = 0; i < first.length; i += 4) {
      const delta = Math.max(
        Math.abs(first[i] - second[i]),
        Math.abs(first[i + 1] - second[i + 1]),
        Math.abs(first[i + 2] - second[i + 2]),
      );
      sum += delta;
      if (delta > max) max = delta;
      if (delta > Number(limit)) differing += 1;
    }
    const total = first.length / 4;
    return { fraction: differing / total, mean: sum / total, max };
  }, [left, right, String(tolerance)] as const);
}

/** Corners inset a tenth of the media area, plus its centre. */
function sampleFivePoints(page: Page, shot: string): Promise<Array<[number, number, number]>> {
  return page.evaluate(async (data) => {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('could not decode a capture'));
      element.src = `data:image/png;base64,${data}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2d context for point sampling');
    context.drawImage(image, 0, 0);
    const x0 = Math.round(canvas.width * 0.1);
    const x1 = Math.round(canvas.width * 0.9) - 1;
    const y0 = Math.round(canvas.height * 0.1);
    const y1 = Math.round(canvas.height * 0.9) - 1;
    const points: Array<[number, number]> = [
      [x0, y0], [x1, y0], [x0, y1], [x1, y1],
      [Math.round(canvas.width / 2), Math.round(canvas.height / 2)],
    ];
    return points.map(([x, y]) => {
      const pixel = context.getImageData(x, y, 1, 1).data;
      return [pixel[0], pixel[1], pixel[2]] as [number, number, number];
    });
  }, shot);
}

const isPaper = (pixel: readonly [number, number, number]) => pixel
  .every((channel, index) => Math.abs(channel - PAPER[index]) <= PAPER_TOLERANCE);

/**
 * Mean relative luminance of one captured frame, averaged down in the page.
 * Plain `<img>` and `<canvas>` so the pinned WebKit build can run it too.
 */
function meanLuminance(page: Page, shot: string): Promise<number> {
  return page.evaluate(async (data) => {
    const bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('could not decode a capture'));
      element.src = `data:image/png;base64,${data}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 100;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('no 2d context for the luminance scan');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height);
    let total = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      total += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    }
    return total / (pixels.length / 4);
  }, shot);
}

interface FlashReport {
  readonly worst: number;
  readonly at: number;
  readonly handoverStep: number;
  readonly medianStep: number;
}

/** Score a luminance walk for single-frame excursions away from its own trend. */
function scoreFlashes(luminance: readonly number[]): FlashReport {
  let worst = 0;
  let at = -1;
  const steps: number[] = [];
  for (let i = 1; i < luminance.length; i += 1) {
    steps.push(Math.abs(luminance[i] - luminance[i - 1]) / Math.max(1, luminance[i - 1]));
  }
  for (let i = 1; i < luminance.length - 1; i += 1) {
    const back = luminance[i] - luminance[i - 1];
    const forward = luminance[i] - luminance[i + 1];
    // Same sign on both sides = a peak or a trough, i.e. a frame that went out
    // of line and came back. Opposite signs are just a ramp passing through.
    if (Math.sign(back) !== Math.sign(forward) || back === 0) continue;
    const excursion = Math.min(
      Math.abs(back) / Math.max(1, luminance[i - 1]),
      Math.abs(forward) / Math.max(1, luminance[i + 1]),
    );
    if (excursion > worst) {
      worst = excursion;
      at = i;
    }
  }
  const sorted = [...steps].sort((a, b) => a - b);
  return {
    worst,
    at,
    handoverStep: Math.max(...steps),
    medianStep: sorted[Math.floor(sorted.length / 2)] ?? 0,
  };
}

/** Longest run of consecutive frames the compositor spent unconfirmed. */
function longestPendingRun(page: Page, frames: number): Promise<{ longest: number; samples: string[] }> {
  return page.evaluate((count) => new Promise<{ longest: number; samples: string[] }>((resolve) => {
    const veilHost = document.querySelector<HTMLElement>('.film-veil');
    const samples: string[] = [];
    let longest = 0;
    let run = 0;
    let remaining = Number(count);
    const tick = () => {
      const value = veilHost?.dataset.renderedBoundary ?? 'no-compositor';
      samples.push(value);
      run = value === 'pending' ? run + 1 : 0;
      if (run > longest) longest = run;
      remaining -= 1;
      // Keep the director publishing so the compositor is asked for new frames.
      window.scrollBy(0, remaining % 2 === 0 ? 1 : -1);
      if (remaining > 0) requestAnimationFrame(tick);
      else resolve({ longest, samples });
    };
    requestAnimationFrame(tick);
  }), String(frames));
}

// Serial, and generous: a single boundary walks ten settled scroll positions and
// takes several screenshots, which is minutes of work on a software rasteriser.
test.describe.configure({ mode: 'serial', timeout: 240_000 });

test('the flash detector catches a flash and ignores a steep ramp', () => {
  // A real walk measured on this build: smooth, monotonic, steep in the middle.
  const ramp = [249, 248.7, 247.8, 245.6, 241.6, 235.4, 228, 220.7, 213.2, 205.6,
    198.1, 190.6, 182.6, 173.5, 163.6, 152.9, 142.4, 133.3, 126.5, 121.9, 119.4];
  expect(scoreFlashes(ramp).worst, 'a smooth ramp is not a flash').toBeLessThan(FLASH_BUDGET);

  // The same walk with one frame blanking to paper and back: that must fail.
  const flashed = [...ramp];
  flashed[10] = 249;
  const caught = scoreFlashes(flashed);
  expect(caught.worst, 'a one-frame blank must be caught').toBeGreaterThan(FLASH_BUDGET);
  expect(caught.at).toBe(10);
});

/**
 * The eight adjacencies of the storyboard's act order (§2), after Step 11b put
 * `proof` (act 05) between Reclaim and Your finish and Step 22 gave Act 4 its
 * third room. Spelled out rather than counted: a table that reorders itself and
 * a page that reorders with it would both satisfy a length check while the acts
 * came out in the wrong sequence.
 *
 * `garage:vault` and `vault:mancave` are the bay's two interior folds. They are
 * the first media-to-media boundaries in Act 4 — the Reclaim reading aside used
 * to sit between the rooms, so `garage:vault` left a white stage — which means
 * both are now held to the stricter "never blank at any sample" rule below.
 */
const EXPECTED_BOUNDARY_KEYS = [
  'portico:foundation',
  'foundation:garage',
  'garage:vault',
  'vault:mancave',
  'mancave:proof',
  'proof:finish-hall',
  'finish-hall:commercial',
  'commercial:consultation',
] as const;

test('the transition table and the rendered journey agree on every boundary', async ({ page }) => {
  await openJourney(page);
  const boundaries = await readBoundaries(page);
  expect(BOUNDARY_KEYS).toEqual([...EXPECTED_BOUNDARY_KEYS]);
  expect(boundaries.map((boundary) => boundary.key)).toEqual(BOUNDARY_KEYS);
});

test('the retired chapter rail is gone from the document', async ({ page }) => {
  await openJourney(page);
  await expect(page.locator('.journey-rail')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.locator('[data-journey-target]')).toHaveCount(0, { timeout: 15_000 });
});

for (const key of BOUNDARY_KEYS) {
  test(`${key} hands the media over continuously, forward and in reverse`, async ({ page }) => {
    const tier = await openJourney(page);
    expect(['full', 'balanced', 'still']).toContain(tier);
    const boundary = (await readBoundaries(page)).find((candidate) => candidate.key === key);
    expect(boundary, `${key} must exist in the rendered journey`).toBeTruthy();

    const walk = async (direction: 'forward' | 'reverse') => {
      const order = direction === 'forward' ? [...SAMPLES] : [...SAMPLES].reverse();
      const seen: Array<{ p: number; state: BoundaryState; shot: string }> = [];
      for (const p of order) {
        const achieved = await seek(page, key, p);
        expect(Math.abs(achieved - p), `${key} ${direction} could not settle at p=${p}`).toBeLessThan(0.01);
        await settle(page, dissolveWeight(p, 0.5, 0.12));
        await awaitStagedPlates(page);
        const state = await readState(page);
        seen.push({ p, state, shot: await mediaShot(page) });
      }
      return direction === 'forward' ? seen : seen.reverse();
    };

    for (const direction of ['forward', 'reverse'] as const) {
      const walked = await walk(direction);

      // (a) the tier is published for the whole walk.
      expect(await page.getAttribute('html', 'data-journey-tier')).toBe(tier);

      // The handoff is monotonic and reaches both ends, in either direction.
      const handoffs = walked.map((entry) => entry.state.handoff);
      expect(handoffs[0], `${key} ${direction} must start on the outgoing room`).toBeLessThan(0.02);
      expect(handoffs.at(-1), `${key} ${direction} must end on the incoming room`).toBeGreaterThan(0.98);
      handoffs.forEach((value, index) => {
        if (index === 0) return;
        expect(value, `${key} ${direction} handoff must not go backwards`)
          .toBeGreaterThanOrEqual(handoffs[index - 1] - 0.001);
      });

      // The owner follows the published crossfade weight, never a bare progress
      // threshold: either the compositor confirmed this boundary, or the plate
      // that the weight puts in front owns the picture.
      walked.forEach(({ p, state }) => {
        const expectedDomOwner = state.handoff < 0.5 ? 'from' : 'to';
        expect(['veil', expectedDomOwner], `${key} ${direction} p=${p} handoff=${state.handoff} owner`)
          .toContain(state.owner);
      });

      // (c) the media area is never uniformly paper once the incoming room is up.
      // A boundary that leaves a white reading stage legitimately starts on paper,
      // so only a media-to-media boundary is held to it across the whole interior.
      const mediaToMedia = boundary && !boundary.fromWhite && boundary.toHasPlate;
      const checked = walked.filter(({ p }) => mediaToMedia || p >= 0.75);
      for (const { p, shot } of checked) {
        if (!boundary?.toHasPlate) continue;
        const points = await sampleFivePoints(page, shot);
        expect(points.every(isPaper), `${key} ${direction} p=${p} went blank: ${JSON.stringify(points)}`)
          .toBe(false);
      }
    }

    // (b) the p = 0.5 seam. Two samples 0.02 of progress apart must look like one
    // picture, while the same measurement over a real change must not - otherwise
    // the threshold would pass a frozen page just as happily.
    // Approach the seam the way a visitor meets it: out of the boundary, then
    // forward through it. The compositor locks its textures when the interior is
    // entered and keeps them for the whole boundary, and which texture it picks
    // for the incoming room depends on the direction it locked in — a lock taken
    // scrolling backwards composites that room's film where a forward lock
    // composites its poster. Measuring from a random direction measures that
    // difference rather than the handoff.
    await seek(page, key, -0.1);
    await nextFrames(page);
    await seek(page, key, 0.49);
    await settle(page, dissolveWeight(0.49, 0.5, 0.12));
    await awaitStagedPlates(page);
    const beforeState = await readState(page);
    const before = await mediaShot(page);
    await seek(page, key, 0.51);
    await settle(page, dissolveWeight(0.51, 0.5, 0.12));
    await awaitStagedPlates(page);
    const afterState = await readState(page);
    const after = await mediaShot(page);
    const seam = await pixelDiff(page, before, after, SEAM_CHANNEL_TOLERANCE);
    // eslint-disable-next-line no-console
    console.log(`[seam] ${key} ${(seam.fraction * 100).toFixed(3)}% changed, mean delta ${seam.mean.toFixed(2)}, max ${seam.max}`
      + ` (owner ${beforeState.owner}->${afterState.owner}, rendered ${beforeState.renderedBoundary}->${afterState.renderedBoundary})`);
    // Both samples must be drawn by the same renderer. Swapping the compositor
    // for the plate crossfade (or back) inside one boundary is itself a seam.
    // `from` -> `to` is not a swap: it is the same DOM crossfade naming whichever
    // plate the weight has put in front, which is what the midpoint means.
    expect(afterState.owner === 'veil', `${key} changed renderer across its own midpoint`)
      .toBe(beforeState.owner === 'veil');
    expect(seam.fraction, `${key} cuts at the seam instead of dissolving through it`)
      .toBeLessThan(SEAM_PIXEL_BUDGET);

    if (boundary?.toHasPlate) {
      await seek(page, key, 0.25);
      await settle(page, dissolveWeight(0.25, 0.5, 0.12));
      await awaitStagedPlates(page);
      const opening = await mediaShot(page);
      await seek(page, key, 0.95);
      await settle(page, dissolveWeight(0.95, 0.5, 0.12));
      await awaitStagedPlates(page);
      const closing = await mediaShot(page);
      const control = await pixelDiff(page, opening, closing, SEAM_CHANNEL_TOLERANCE);
      // eslint-disable-next-line no-console
      console.log(`[control] ${key} ${(control.fraction * 100).toFixed(2)}% changed across the whole boundary`);
      expect(control.fraction, `${key} never changes picture, so the seam measurement proves nothing`)
        .toBeGreaterThan(CONTROL_PIXEL_FLOOR);
    }

    // (d) the compositor must not sit unconfirmed through the interior.
    if (tier === 'full') {
      await seek(page, key, 0.5);
      await settle(page, dissolveWeight(0.5, 0.5, 0.12));
      await awaitStagedPlates(page);
      const { longest, samples } = await longestPendingRun(page, 30);
      // eslint-disable-next-line no-console
      console.log(`[pending] ${key} longest run ${longest} of ${samples.length} frames`);
      expect(longest, `${key} left the compositor pending for ${longest} frames`).toBeLessThanOrEqual(2);
    }
  });
}

for (const key of BOUNDARY_KEYS) {
  test(`${key} carries its exit without a single-frame flash`, async ({ page }) => {
    await openJourney(page);
    // A continuous scroll from just before the boundary to just past its exit —
    // the side Matt reported flickering — one rendered frame per step.
    const height = await page.evaluate((boundary) => {
      const node = [...document.querySelectorAll<HTMLElement>('.journey-breath[data-hall-from][data-hall-to]')]
        .find((candidate) => `${candidate.dataset.hallFrom}:${candidate.dataset.hallTo}` === boundary);
      return node ? node.getBoundingClientRect().height : 0;
    }, key);
    expect(height, `${key} must have a measurable breath`).toBeGreaterThan(0);
    await seek(page, key, -0.15);

    const step = Math.max(4, Math.round((height * 1.3) / SCAN_FRAMES));
    const luminance: number[] = [];
    const pending: string[] = [];
    for (let i = 0; i < SCAN_FRAMES; i += 1) {
      await page.evaluate((delta) => window.scrollBy(0, Number(delta)), String(step));
      await nextFrames(page);
      luminance.push(await meanLuminance(page, await mediaShot(page)));
      pending.push(await page.evaluate(
        () => document.querySelector<HTMLElement>('.film-veil')?.dataset.renderedBoundary ?? 'no-compositor',
      ));
    }

    const flash = scoreFlashes(luminance);
    // eslint-disable-next-line no-console
    console.log(`[flash] ${key} worst single-frame excursion ${(flash.worst * 100).toFixed(2)}% at frame ${flash.at}; `
      + `largest frame-to-frame step ${(flash.handoverStep * 100).toFixed(2)}%, median ${(flash.medianStep * 100).toFixed(2)}%`);
    expect(
      flash.worst,
      `${key}: frame ${flash.at} of the exit scan jumps ${(flash.worst * 100).toFixed(2)}% off the trend and back`,
    ).toBeLessThan(FLASH_BUDGET);

    // The compositor must not spend the interior unconfirmed while scrolling.
    let longest = 0;
    let run = 0;
    pending.forEach((value) => {
      run = value === 'pending' ? run + 1 : 0;
      if (run > longest) longest = run;
    });
    expect(longest, `${key}: the compositor was pending for ${longest} consecutive scanned frames`)
      .toBeLessThanOrEqual(2);
  });
}

test('the capability tier matches what this browser can actually do', async ({ page }) => {
  const tier = await openJourney(page);
  const capabilities = await page.evaluate(() => {
    let webgl2 = false;
    let floatBuffers = false;
    try {
      const context = document.createElement('canvas').getContext('webgl2');
      webgl2 = Boolean(context);
      floatBuffers = Boolean(context?.getExtension('EXT_color_buffer_float'));
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch { /* treated as no WebGL2 at all */ }
    return { webgl2, floatBuffers, coarsePointer: window.matchMedia('(pointer: coarse)').matches };
  });

  // Step 18a: the compositor is a registered view of the one layout canvas, not a
  // canvas of its own, so "is there a compositor" is a question for the view registry.
  const veilRegistered = () => page.evaluate(
    () => (window.__ffeSurface?.views() ?? []).includes('film-veil'),
  );

  if (capabilities.coarsePointer || !capabilities.webgl2 || !capabilities.floatBuffers) {
    expect(tier, 'touch or a missing float buffer must cap the journey at balanced').toBe('balanced');
    // `balanced` must not pay for a compositor it will never run — and with the
    // canvas gone with it, not for a WebGL context either.
    await expect.poll(veilRegistered, { timeout: 15_000 }).toBe(false);
    expect(await page.getAttribute('.film-veil', 'data-film-veil')).toBe('still');
    expect(await page.locator('canvas').count(), 'balanced holds no WebGL context at all').toBe(0);
  } else {
    expect(tier).toBe('full');
    await expect.poll(veilRegistered, { timeout: 15_000 }).toBe(true);
    // The lock: one canvas for the whole page, compositor and floor band together.
    expect(await page.locator('canvas').count(), 'the journey draws through one canvas').toBe(1);
  }

  // The narrative keeps its film in `balanced`: the pour still scrubs with scroll.
  const film = page.locator('.pour-film');
  await expect(film).toHaveCount(1, { timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await nextFrames(page);
  await page.waitForFunction(
    () => (document.querySelector<HTMLVideoElement>('.pour-film')?.readyState ?? 0) >= 2,
    null,
    { timeout: 45_000 },
  );
  const start = await film.evaluate((node: HTMLVideoElement) => node.currentTime);
  await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 0.8)));
  await nextFrames(page);
  await page.waitForFunction(
    (from) => Math.abs((document.querySelector<HTMLVideoElement>('.pour-film')?.currentTime ?? 0) - Number(from)) > 0.05,
    String(start),
    { timeout: 30_000 },
  );
  const moved = await film.evaluate((node: HTMLVideoElement) => node.currentTime);
  expect(Math.abs(moved - start), 'the chapter film must still scrub with scroll').toBeGreaterThan(0.05);
});

test('the compositor confirms its paint without reading the framebuffer back', async ({ page }) => {
  // `advanceVeilPaintConfirmation` counts completed passes for a render key; it
  // must never grow into a `gl.readPixels` check. A readback is a full pipeline
  // stall, and on this software rasteriser the driver announces it, so the
  // announcement is the assertion. Only the `full` tier has a compositor.
  let readPixelsWarnings = 0;
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('ReadPixels')) readPixelsWarnings += 1;
  });

  const tier = await openJourney(page);
  test.skip(tier !== 'full', 'no compositor below the full tier');
  await page.waitForFunction(
    () => (window.__ffeSurface?.views() ?? []).includes('film-veil'),
    null,
    { timeout: 30_000 },
  );
  await page.evaluate(() => window.scrollTo(0, Math.round(window.innerHeight * 1.6)));
  await page.waitForTimeout(2_000);

  // Bringing a WebGL canvas up costs the compositor one readback of its own,
  // which is not ours and is emitted before this counter is reset.
  const duringBringUp = readPixelsWarnings;
  readPixelsWarnings = 0;

  const steps = await page.evaluate(async () => {
    const height = document.documentElement.scrollHeight;
    let counted = 0;
    for (let y = 0; y < height; y += 60) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      counted += 1;
    }
    for (let y = height; y > 0; y -= 60) {
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      counted += 1;
    }
    return counted;
  });
  await page.waitForTimeout(500);

  // eslint-disable-next-line no-console
  console.log(`[readpixels] ${steps} scroll steps: ${readPixelsWarnings} stall warnings (${duringBringUp} at canvas bring-up)`);
  expect(steps, 'the scroll must actually cover the route').toBeGreaterThan(100);
  expect(
    readPixelsWarnings,
    `${readPixelsWarnings} GPU readback stalls across ${steps} scrolled frames — the veil is reading its framebuffer back`,
  ).toBe(0);
});
