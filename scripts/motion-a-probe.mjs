#!/usr/bin/env node
/**
 * scripts/motion-a-probe.mjs — the Motion-A gates, measured on the BUILT app.
 *
 * Every number this prints is taken from a real rendered page on
 * `node dist/server/entry.mjs`, never from source. It never starts or stops a
 * server: point it at one that is already listening (`--url`).
 *
 *   node scripts/motion-a-probe.mjs --url http://127.0.0.1:4396 --out output/motion-a
 *
 * What it measures, and why each one is falsifiable rather than self-confirming:
 *
 *  A. Act 1 span. Computed with the director's own arithmetic — the scroll range
 *     over which `chapterProgress` runs 0 to 1, which is the section's height
 *     less half a viewport — so the reported vh is comparable with the
 *     storyboard's "2.6 vh" and with the 1.1 vh this step started from.
 *  A2. Copy coverage. The veil is `position: fixed; inset: 0` and, while it
 *     paints, writes an opaque composite across the whole viewport, so "covering
 *     the copy" is a viewport-wide fact. Reported from the compositor's own
 *     `data-rendered-boundary`, and CONTROLLED with two pixel measures (the
 *     paper fraction of the copy's box and of the plate strip beside it) that
 *     must read differently inside and outside the wipe — otherwise the state
 *     read would be proving nothing.
 *  B. Scroll-intent promotion. Idle bytes, promotion latency after one wheel
 *     tick, and the poster/first-frame pixel difference.
 *  C. Reported by `measure:delivery`, not here.
 *  D. Foundation film scrub and residency.
 *  E. Deep-link lock-on-entry darkness and pending runs.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';

const PAPER = [250, 249, 246];
const PAPER_TOLERANCE = 10;

function parseArgs(argv) {
  const args = { url: 'http://127.0.0.1:4396', out: 'output/motion-a' };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url') args.url = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

const nextFrames = (page, count = 2) => page.evaluate((n) => new Promise((resolve) => {
  let left = Number(n);
  const tick = () => (left-- > 0 ? requestAnimationFrame(tick) : resolve());
  requestAnimationFrame(tick);
}), String(count));

/** One wheel tick — the scroll-intent signal a visitor gives. */
const signalIntent = (page) => page.mouse.wheel(0, 1);

async function hydrate(page, url, { intent = true } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.documentElement.dataset.journeyTier !== undefined,
    null,
    { timeout: 60_000 },
  );
  if (intent) await signalIntent(page);
  return page.getAttribute('html', 'data-journey-tier');
}

/** The director's own act geometry, read from the rendered document. */
const actGeometry = (page, id) => page.evaluate((chapter) => {
  const journey = document.querySelector('.journey');
  const node = document.querySelector(`.journey [data-journey-chapter="${chapter}"]`);
  if (!journey || !node) return null;
  const box = (element) => {
    const rect = element.getBoundingClientRect();
    return { start: rect.top + window.scrollY, end: rect.bottom + window.scrollY };
  };
  const top = box(journey).start;
  const self = box(node);
  const vh = window.innerHeight;
  const progressStart = Math.max(top, self.start - vh / 2);
  const progressEnd = self.end - vh / 2;
  return {
    sectionHeight: self.end - self.start,
    progressStart,
    progressEnd,
    span: progressEnd - progressStart,
    viewportHeight: vh,
    vh: (progressEnd - progressStart) / vh,
  };
}, id);

/**
 * Put `chapterProgress` at `p` and let the director settle on it.
 *
 * Re-measures after every scroll rather than trusting the first geometry: a
 * chapter whose plate has just gone `position: fixed` changes the document's
 * height under the scroll that caused it, and a single-shot seek would land at a
 * progress nobody asked for. The achieved value is returned so the caller can
 * assert on it instead of assuming.
 */
async function seekAct(page, id, p) {
  let reached = Number.NaN;
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const geometry = await actGeometry(page, id);
    if (!geometry) return Number.NaN;
    await page.evaluate((y) => window.scrollTo(0, Number(y)), String(
      Math.round(geometry.progressStart + (geometry.progressEnd - geometry.progressStart) * p),
    ));
    await nextFrames(page);
    const settled = await actGeometry(page, id);
    if (!settled) return Number.NaN;
    const scrollY = await page.evaluate(() => window.scrollY);
    reached = (scrollY - settled.progressStart) / Math.max(1, settled.progressEnd - settled.progressStart);
    if (Math.abs(reached - p) < 0.005) break;
  }
  return reached;
}

/** Mean luminance and paper fraction of one viewport rectangle. */
async function scanRect(page, clip) {
  const box = {
    x: Math.max(0, Math.round(clip.x)),
    y: Math.max(0, Math.round(clip.y)),
    width: Math.max(1, Math.round(clip.width)),
    height: Math.max(1, Math.round(clip.height)),
  };
  const shot = (await page.screenshot({ clip: box })).toString('base64');
  return page.evaluate(async ([data, paper, tolerance]) => {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('undecodable capture'));
      element.src = `data:image/png;base64,${data}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(200, image.naturalWidth);
    canvas.height = Math.max(1, Math.round((image.naturalHeight / image.naturalWidth) * canvas.width));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const { data: pixels } = context.getImageData(0, 0, canvas.width, canvas.height);
    const reference = JSON.parse(paper);
    let luminance = 0;
    let paperPixels = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      luminance += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
      const near = reference.every((channel, index) => Math.abs(pixels[i + index] - channel) <= Number(tolerance));
      if (near) paperPixels += 1;
    }
    const total = pixels.length / 4;
    return { mean: luminance / total, paperFraction: paperPixels / total };
  }, [shot, JSON.stringify(PAPER), String(PAPER_TOLERANCE)]);
}

const veilState = (page) => page.evaluate(() => {
  const host = document.querySelector('.film-veil');
  const journey = document.querySelector('.journey');
  return {
    rendered: host?.dataset.renderedBoundary ?? 'no-compositor',
    owner: journey?.dataset.mediaOwner ?? '',
    boundary: journey?.dataset.room ?? '',
  };
});

/** The copy's viewport rectangle, clamped to the viewport. */
const copyRect = (page, selector) => page.evaluate((target) => {
  const node = document.querySelector(target);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  const x = Math.max(0, rect.left);
  const y = Math.max(0, rect.top);
  const right = Math.min(window.innerWidth, rect.right);
  const bottom = Math.min(window.innerHeight, rect.bottom);
  return {
    x, y, width: right - x, height: bottom - y,
    onScreen: right > x && bottom > y,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  };
}, selector);

/* ------------------------------------------------------------------ A + A2 */

async function probeActOne(page, url, label, out) {
  await hydrate(page, url);
  // The film has to be decoded before the scrub is sampled, or `currentTime`
  // stays at 0 for all twenty samples and "monotonic" is true for a film that
  // never moved. The spread is reported alongside the verdict for the same
  // reason: a monotonic walk of length zero proves nothing.
  await page.waitForFunction(
    () => (document.querySelector('.pour-film')?.readyState ?? 0) >= 2,
    null,
    { timeout: 120_000 },
  );
  const geometry = await actGeometry(page, 'portico');
  const samples = [];
  for (let i = 0; i < 20; i += 1) {
    const p = i / 19;
    const reached = await seekAct(page, 'portico', p);
    await nextFrames(page, 3);
    const state = await veilState(page);
    const copy = await copyRect(page, '.hero-content');
    const film = await page.evaluate(() => {
      const video = document.querySelector('.pour-film');
      return video ? { currentTime: video.currentTime, readyState: video.readyState } : null;
    });
    const covered = state.rendered !== 'clear' && state.rendered !== 'no-compositor' && Boolean(copy?.onScreen);
    const copyScan = copy?.onScreen && copy.width > 4 && copy.height > 4
      ? await scanRect(page, copy)
      : null;
    // The plate strip: the right-hand third of the viewport, which the hero copy
    // never reaches (`.hero-content` carries `padding-right: 42%`). It is the
    // act's PICTURE, so its paper fraction says whether the wipe has replaced it.
    const plateScan = await scanRect(page, {
      x: (copy?.viewportWidth ?? 1_440) * 0.68,
      y: (copy?.viewportHeight ?? 900) * 0.2,
      width: (copy?.viewportWidth ?? 1_440) * 0.3,
      height: (copy?.viewportHeight ?? 900) * 0.5,
    });
    samples.push({
      p: Number(p.toFixed(4)),
      reached: Number(reached.toFixed(4)),
      rendered: state.rendered,
      covered,
      copyOnScreen: Boolean(copy?.onScreen),
      copyPaperFraction: copyScan ? Number(copyScan.paperFraction.toFixed(4)) : null,
      platePaperFraction: Number(plateScan.paperFraction.toFixed(4)),
      plateMeanLuminance: Number(plateScan.mean.toFixed(2)),
      filmTime: film ? Number(film.currentTime.toFixed(4)) : null,
      filmReadyState: film?.readyState ?? null,
    });
  }

  for (const p of [0, 0.4, 0.8, 1]) {
    await seekAct(page, 'portico', p);
    await nextFrames(page, 3);
    await page.screenshot({ path: path.join(out, `hero-${label}-p${String(p).replace('.', '')}.png`) });
  }

  const times = samples.map((sample) => sample.filmTime).filter((value) => value !== null);
  let worstBacktrack = 0;
  for (let i = 1; i < times.length; i += 1) {
    worstBacktrack = Math.max(worstBacktrack, times[i - 1] - times[i]);
  }
  const onScreen = samples.filter((sample) => sample.copyOnScreen);
  const wiped = samples.filter((sample) => sample.rendered === 'customer-reviews:white-target');
  return {
    geometry,
    samples,
    coveredSamples: samples.filter((sample) => sample.covered).length,
    uncoveredFraction: Number((1 - samples.filter((sample) => sample.covered).length / samples.length).toFixed(4)),
    // Reported so an "uncovered everywhere" run cannot be read as a pass when the
    // truth is that the wipe never painted at all. `wipeRange` is where in the act
    // the compositor actually held `customer-reviews:white-target`.
    wipeSamples: wiped.length,
    wipeRange: wiped.length ? [wiped[0].p, wiped.at(-1).p] : null,
    platePaperAtActBody: samples[10]?.platePaperFraction ?? null,
    platePaperAtWipe: wiped.length ? Math.min(...wiped.map((sample) => sample.platePaperFraction)) : null,
    copyOnScreenSamples: onScreen.length,
    filmMonotonic: worstBacktrack <= 0.13,
    worstBacktrack: Number(worstBacktrack.toFixed(4)),
    filmSpread: times.length ? Number((Math.max(...times) - Math.min(...times)).toFixed(3)) : 0,
  };
}

/* ---------------------------------------------------------------------- B */

async function probePromotion(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1_440, height: 900 } });
  const page = await context.newPage();
  const videoResponses = [];
  page.on('response', (response) => {
    if (/\/videos\/.*\.mp4(?:\?|$)/.test(response.url())) {
      videoResponses.push({ url: response.url(), at: Date.now() });
    }
  });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.journeyTier !== undefined, null, { timeout: 60_000 });
  await page.waitForTimeout(5_000);
  const idleRequests = videoResponses.length;
  const idlePreload = await page.evaluate(() => document.querySelector('.pour-film')?.preload ?? null);

  /**
   * Measured INSIDE the page, wheel event to promotion, not across CDP.
   * A Date.now() pair either side of `page.mouse.wheel` + `waitForFunction`
   * charges the promotion for the driver's round trips and its first poll — it
   * read 248 ms for a promotion that a MutationObserver puts at a fraction of a
   * frame. The observer is armed before the wheel, so it cannot miss it.
   */
  await page.evaluate(() => {
    window.__promotion = { wheelAt: null, promotedAt: null };
    const film = document.querySelector('.pour-film');
    window.addEventListener('wheel', () => {
      if (window.__promotion.wheelAt === null) window.__promotion.wheelAt = performance.now();
    }, { passive: true, capture: true });
    if (!film) return;
    new MutationObserver(() => {
      if (film.preload === 'auto' && window.__promotion.promotedAt === null) {
        window.__promotion.promotedAt = performance.now();
      }
    }).observe(film, { attributes: true, attributeFilter: ['preload', 'src'] });
  });
  await page.mouse.wheel(0, 1);
  await page.waitForFunction(
    () => document.querySelector('.pour-film')?.preload === 'auto',
    null,
    { timeout: 5_000 },
  );
  const promotion = await page.evaluate(() => window.__promotion);
  await page.waitForFunction(
    () => (document.querySelector('.pour-film')?.readyState ?? 0) >= 2,
    null,
    { timeout: 90_000 },
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await nextFrames(page, 6);
  await page.waitForFunction(
    () => document.querySelector('.pour-film')?.hasAttribute('data-video-ready') === true,
    null,
    { timeout: 30_000 },
  ).catch(() => {});
  await nextFrames(page, 4);

  // Poster against the first scrubbed frame. Both are the SAME rectangle of the
  // same page one frame apart; only the film's own opacity changes, so a
  // difference here is the pop this contract forbids and nothing else.
  const strip = { x: 1_440 * 0.6, y: 0, width: 1_440 * 0.4, height: 640 };
  const withFilm = (await page.screenshot({ clip: strip })).toString('base64');
  await page.evaluate(() => {
    const video = document.querySelector('.pour-film');
    if (video) video.style.visibility = 'hidden';
  });
  await nextFrames(page, 3);
  const withPoster = (await page.screenshot({ clip: strip })).toString('base64');
  const diff = await page.evaluate(async ([a, b]) => {
    const decode = (data) => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('undecodable capture'));
      image.src = `data:image/png;base64,${data}`;
    });
    const [one, two] = await Promise.all([decode(a), decode(b)]);
    const width = 200;
    const height = Math.max(1, Math.round((one.naturalHeight / one.naturalWidth) * width));
    const raster = (image) => {
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(image, 0, 0, width, height);
      return context.getImageData(0, 0, width, height).data;
    };
    const first = raster(one);
    const second = raster(two);
    let sum = 0;
    for (let i = 0; i < first.length; i += 4) {
      sum += (Math.abs(first[i] - second[i])
        + Math.abs(first[i + 1] - second[i + 1])
        + Math.abs(first[i + 2] - second[i + 2])) / 3;
    }
    return sum / (first.length / 4) / 255;
  }, [withFilm, withPoster]);
  await page.evaluate(() => {
    const video = document.querySelector('.pour-film');
    if (video) video.style.removeProperty('visibility');
  });

  const source = await page.evaluate(() => document.querySelector('.pour-film')?.currentSrc ?? '');
  await context.close();
  return {
    idleSeconds: 5,
    idleVideoRequests: idleRequests,
    idlePreload,
    promotionLatencyMs: promotion.wheelAt !== null && promotion.promotedAt !== null
      ? Number((promotion.promotedAt - promotion.wheelAt).toFixed(2))
      : null,
    videoRequestsAfterWheel: videoResponses.length,
    firstRungAfterIntent: source,
    posterVsFirstFrameMeanAbs: Number((diff * 100).toFixed(3)),
  };
}

/* ---------------------------------------------------------------------- D */

async function probeFoundation(page, url, label, out) {
  await hydrate(page, url);
  await seekAct(page, 'foundation', 0.5);
  await page.waitForFunction(
    () => (document.querySelector('#foundation .floor-film-video')?.readyState ?? 0) >= 2,
    null,
    { timeout: 90_000 },
  );
  const samples = [];
  for (let i = 0; i < 20; i += 1) {
    const p = i / 19;
    const reached = await seekAct(page, 'foundation', p);
    await nextFrames(page, 3);
    const film = await page.evaluate(() => {
      const video = document.querySelector('#foundation .floor-film-video');
      return video
        ? { currentTime: video.currentTime, readyState: video.readyState, preload: video.preload, src: video.currentSrc }
        : null;
    });
    samples.push({
      p: Number(p.toFixed(4)),
      reached: Number(reached.toFixed(4)),
      currentTime: film ? Number(film.currentTime.toFixed(4)) : null,
      readyState: film?.readyState ?? null,
    });
  }
  for (const p of [0, 0.5, 1]) {
    await seekAct(page, 'foundation', p);
    await nextFrames(page, 3);
    await page.screenshot({ path: path.join(out, `foundation-${label}-p${String(p).replace('.', '')}.png`) });
  }
  const times = samples.map((sample) => sample.currentTime).filter((value) => value !== null);
  let worstBacktrack = 0;
  for (let i = 1; i < times.length; i += 1) worstBacktrack = Math.max(worstBacktrack, times[i - 1] - times[i]);

  // Residency: park on a chapter far from Act 3 and the film must be released.
  await seekAct(page, 'mancave', 0.5);
  await page.waitForTimeout(1_200);
  const residency = await page.evaluate(() => [...document.querySelectorAll('.journey-chapter')]
    .flatMap((chapter) => {
      const film = chapter.querySelector('.floor-film-video, .pour-film');
      return film ? [`${chapter.id}:${film.preload}`] : [];
    }));
  await seekAct(page, 'foundation', 0.5);
  await page.waitForTimeout(1_200);
  const residencyOnAct3 = await page.evaluate(() => [...document.querySelectorAll('.journey-chapter')]
    .flatMap((chapter) => {
      const film = chapter.querySelector('.floor-film-video, .pour-film');
      return film ? [`${chapter.id}:${film.preload}`] : [];
    }));
  return {
    samples,
    monotonic: worstBacktrack <= 0.13,
    worstBacktrack: Number(worstBacktrack.toFixed(4)),
    spread: times.length ? Number((Math.max(...times) - Math.min(...times)).toFixed(3)) : 0,
    residencyAwayFromAct3: residency,
    residencyOnAct3,
    currentSrc: await page.evaluate(() => document.querySelector('#foundation .floor-film-video')?.currentSrc ?? ''),
  };
}

/* ---------------------------------------------------------------------- E */

/**
 * Hide the reading layer, exactly as `boundaries.spec` does, so a frame is the
 * media area and nothing else. Without it the walk measures the white reading
 * stage sliding past and reads it as the picture going dark.
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

const breathGeometry = (page, key) => page.evaluate((boundary) => {
  const node = [...document.querySelectorAll('.journey-breath[data-hall-from][data-hall-to]')]
    .find((candidate) => `${candidate.dataset.hallFrom}:${candidate.dataset.hallTo}` === boundary);
  if (!node) return null;
  const rect = node.getBoundingClientRect();
  return { start: rect.top + window.scrollY, end: rect.bottom + window.scrollY };
}, key);

async function seekBreath(page, key, p) {
  const geometry = await breathGeometry(page, key);
  if (!geometry) return Number.NaN;
  await page.evaluate((y) => window.scrollTo(0, Number(y)), String(
    Math.round(geometry.start + (geometry.end - geometry.start) * p - (await page.evaluate(() => window.innerHeight)) / 2),
  ));
  await nextFrames(page, 3);
  const settled = await breathGeometry(page, key);
  const scrollY = await page.evaluate(() => window.scrollY);
  const vh = await page.evaluate(() => window.innerHeight);
  return (scrollY + vh / 2 - settled.start) / Math.max(1, settled.end - settled.start);
}

async function probeDeepLink(browser, url, out) {
  const context = await browser.newContext({ viewport: { width: 1_440, height: 900 } });
  const page = await context.newPage();
  // The walk the brief names: land inside the boundary's destination by deep
  // link, then scroll back up into `garage:vault`.
  await page.goto(`${url}/#vault`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.journeyTier !== undefined, null, { timeout: 60_000 });
  await page.addStyleTag({ content: MEDIA_ONLY_CSS });
  await signalIntent(page);
  const tier = await page.getAttribute('html', 'data-journey-tier');
  const viewport = { x: 0, y: 0, width: 1_440, height: 900 };

  /**
   * The reference is the boundary's OWN endpoints, not the rooms' chapter
   * centres: at p≈0 the veil is transparent and the garage plate is the frame,
   * at p≈1 the vault plate is. Those are the two pictures a frame inside the
   * boundary is a blend of, so "6% below the darker of them" is the honest
   * threshold. Measured mid-chapter instead, the reference carried the white
   * reading stage and every correct frame read 20-33% "too dark".
   */
  const endpoints = {};
  for (const [name, p] of [['garage', 0.02], ['vault', 0.98]]) {
    await seekBreath(page, 'garage:vault', p);
    await page.waitForTimeout(900);
    await nextFrames(page, 4);
    endpoints[name] = Number((await scanRect(page, viewport)).mean.toFixed(2));
  }
  const darker = Math.min(endpoints.garage, endpoints.vault);

  const frames = [];
  for (const target of [0.25, 0.5, 0.75]) {
    const geometry = await breathGeometry(page, 'garage:vault');
    if (!geometry) break;
    // Park well past the boundary, then walk back up into it a frame at a time.
    // The approach is deliberately coarse until just past the exit and fine from
    // there in, because the frame this gate is about is the one right after the
    // lock is taken — a walk that steps over the interior in two frames would
    // report "no dark frame" without ever having looked at the moment in question.
    await page.evaluate((y) => window.scrollTo(0, Number(y)), String(Math.round(geometry.end + 900)));
    await nextFrames(page, 4);
    const span = geometry.end - geometry.start;
    const steps = 14;
    const from = geometry.start + span * 1.04 + 450;
    const to = geometry.start + span * target;
    for (let i = 1; i <= steps; i += 1) {
      await page.evaluate((y) => window.scrollTo(0, Number(y)), String(
        Math.round(from + (to - from) * (i / steps) - 450),
      ));
      await nextFrames(page, 2);
      const state = await veilState(page);
      const progress = await page.evaluate(() => {
        const node = [...document.querySelectorAll('.journey-breath[data-hall-from][data-hall-to]')]
          .find((candidate) => `${candidate.dataset.hallFrom}:${candidate.dataset.hallTo}` === 'garage:vault');
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        const start = rect.top + window.scrollY;
        const end = rect.bottom + window.scrollY;
        return (window.scrollY + window.innerHeight / 2 - start) / Math.max(1, end - start);
      });
      const inside = progress !== null && progress > 0 && progress < 1;
      const scan = await scanRect(page, viewport);
      frames.push({
        target,
        step: i,
        progress: progress === null ? null : Number(progress.toFixed(4)),
        inside,
        rendered: state.rendered,
        mean: Number(scan.mean.toFixed(2)),
        belowDarkerEndpoint: Number((((darker - scan.mean) / darker) * 100).toFixed(2)),
      });
    }
    if (target === 0.5) {
      await page.screenshot({ path: path.join(out, 'deeplink-garage-vault-p05.png') });
    }
  }

  const interior = frames.filter((frame) => frame.inside);
  let longestPending = 0;
  let run = 0;
  for (const frame of interior) {
    run = frame.rendered === 'pending' ? run + 1 : 0;
    longestPending = Math.max(longestPending, run);
  }
  const worst = interior.reduce(
    (acc, frame) => (frame.belowDarkerEndpoint > acc.belowDarkerEndpoint ? frame : acc),
    { belowDarkerEndpoint: -Infinity },
  );
  await context.close();
  return {
    tier,
    endpointMean: endpoints,
    darkerEndpointMean: darker,
    frames,
    interiorFrames: interior.length,
    longestPendingRun: longestPending,
    worstFrameBelowDarkerEndpointPct: Number.isFinite(worst.belowDarkerEndpoint) ? worst.belowDarkerEndpoint : null,
    worstFrame: Number.isFinite(worst.belowDarkerEndpoint) ? worst : null,
  };
}

/* --------------------------------------------------------------------- LCP */

async function probeLcp(browser, url, viewport, deviceScaleFactor) {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  const page = await context.newPage();
  await page.addInitScript(() => {
    window.__lcp = null;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__lcp = {
          startTime: entry.startTime,
          size: entry.size,
          url: entry.url,
          selector: entry.element
            ? `${entry.element.tagName.toLowerCase()}${entry.element.className ? `.${String(entry.element.className).split(/\s+/).join('.')}` : ''}`
            : null,
        };
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  });
  // Warm the cache the way a returning visitor has it, then measure that load.
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1_200);
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(1_500);
  const lcp = await page.evaluate(() => window.__lcp);
  const poster = await page.evaluate(() => {
    const image = document.querySelector('.pour-poster');
    return image ? { currentSrc: image.currentSrc, dpr: window.devicePixelRatio } : null;
  });
  await context.close();
  return { lcp, poster };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const out = path.resolve(args.out);
  await mkdir(out, { recursive: true });
  const browser = await chromium.launch();
  const report = { url: args.url, at: new Date().toISOString() };

  for (const [label, viewport] of [['1440', { width: 1_440, height: 900 }], ['390', { width: 390, height: 844 }]]) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const errors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));
    report[`actOne_${label}`] = await probeActOne(page, args.url, label, out);
    report[`actOne_${label}`].tier = await page.getAttribute('html', 'data-journey-tier');
    report[`foundation_${label}`] = await probeFoundation(page, args.url, label, out);
    report[`consoleErrors_${label}`] = errors;
    await context.close();
  }

  report.promotion = await probePromotion(browser, args.url);
  report.deepLink = await probeDeepLink(browser, args.url, out);
  report.lcpDesktop = await probeLcp(browser, args.url, { width: 1_440, height: 900 }, 1);
  report.lcpPhone = await probeLcp(browser, args.url, { width: 390, height: 844 }, 3);
  report.lcpPhoneDevice = await probeLcp(
    browser,
    args.url,
    devices['iPhone 15 Pro'].viewport,
    devices['iPhone 15 Pro'].deviceScaleFactor,
  );

  await browser.close();
  await writeFile(path.join(out, 'motion-a-probe.json'), `${JSON.stringify(report, null, 2)}\n`);

  const line = (label, value) => console.log(`${label.padEnd(46)} ${value}`);
  console.log('\n=== Motion A gates ===');
  for (const label of ['1440', '390']) {
    const act = report[`actOne_${label}`];
    line(`Act 1 span @${label} (tier ${act.tier})`, `${act.geometry.span.toFixed(0)} px = ${act.geometry.vh.toFixed(2)} vh`);
    line(`  copy-uncovered fraction @${label}`, `${act.uncoveredFraction.toFixed(3)} (wipe seen on ${act.wipeSamples}/20 samples, p ${JSON.stringify(act.wipeRange)})`);
    line(`  pour currentTime monotonic @${label}`, `${act.filmMonotonic} (worst backtrack ${act.worstBacktrack}s, spread ${act.filmSpread}s)`);
    const foundation = report[`foundation_${label}`];
    line(`Act 3 currentTime monotonic @${label}`, `${foundation.monotonic} (worst ${foundation.worstBacktrack}s, spread ${foundation.spread}s)`);
    line(`  Act 3 rung @${label}`, foundation.currentSrc.split('/follow-floor/')[1] ?? '—');
    line(`  console errors @${label}`, report[`consoleErrors_${label}`].length);
  }
  line('idle 5 s video requests', report.promotion.idleVideoRequests);
  line('preload while idle', report.promotion.idlePreload);
  line('promotion latency after one wheel tick', `${report.promotion.promotionLatencyMs} ms`);
  line('poster vs first scrubbed frame', `${report.promotion.posterVsFirstFrameMeanAbs}%`);
  line('LCP desktop', `${report.lcpDesktop.lcp?.selector} @ ${report.lcpDesktop.lcp?.startTime?.toFixed(0)} ms`);
  line('LCP phone (DPR 3)', `${report.lcpPhone.lcp?.selector} @ ${report.lcpPhone.lcp?.startTime?.toFixed(0)} ms`);
  line('phone poster rung (DPR 3)', report.lcpPhone.poster?.currentSrc?.split('/follow-floor/')[1] ?? '—');
  line('deep link worst interior frame', `${report.deepLink.worstFrameBelowDarkerEndpointPct}% below the darker endpoint`);
  line('deep link interior frames scored', report.deepLink.interiorFrames);
  line('deep link longest pending run', report.deepLink.longestPendingRun);
  console.log(`\nwrote ${path.join(out, 'motion-a-probe.json')}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
