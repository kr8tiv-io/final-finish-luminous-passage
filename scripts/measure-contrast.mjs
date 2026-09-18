#!/usr/bin/env node
/**
 * measure-contrast.mjs — frame-contrast sampler.
 *
 * Text on this site sits over moving film. A single screenshot proves nothing: the
 * frame under a headline at film second 0 is not the frame under it at second 6, and
 * the failure is almost always one bright frame in the middle of a pour. So this script
 * walks every media chapter at every breakpoint in **0.5 s film steps**, and at each
 * step measures the real contrast between each visible text box and the pixels actually
 * behind it.
 *
 * Method, per sample:
 *   1. Scroll to the position whose `chapterProgress` maps to the wanted film time
 *      (the director's own mapping, `journey-film-timing.ts`), and let the page's own
 *      scrub drive `video.currentTime`. If the director is holding the film — a
 *      boundary interior pins the incoming plate to frame 0 (`frame-zero-hold`), and a
 *      non-resident film is never seeked at all — seek the element directly and mark
 *      the sample `seeded`.
 *   2. Enumerate the text-bearing elements inside the chapter's reading zone that are
 *      actually on screen and actually painted.
 *   3. Hide them all with `visibility: hidden`, screenshot the viewport, restore them.
 *   4. For each box, take the per-channel **median** of the pixels behind it and
 *      compute the WCAG contrast ratio against the computed text colour.
 *
 * Thresholds: 4.5:1 for body, 3:1 for WCAG large text (>= 24 px, or >= 18.66 px at
 * weight >= 700). A box whose background median is within 6/255 of the paper
 * (#FAF9F6) on every channel is sitting on the paper wash and is reported as `wash`
 * rather than flagged — the wash is the fix, so a box that already has it is not an
 * offender.
 *
 * This script MEASURES. It never edits CSS. Step 16 owns the fixes.
 *
 * Usage:
 *   $env:FFE_BASE_URL='http://127.0.0.1:4373'; node scripts/measure-contrast.mjs
 *   node scripts/measure-contrast.mjs --breakpoints=390,1440 --step=1 --chapters=portico
 */

import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import sharp from 'sharp';

/* ----------------------------------------------------------------- arguments */

const argv = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);

const BASE = argv.base ?? process.env.FFE_BASE_URL ?? 'http://127.0.0.1:4373';
const OUT_DIR = argv.out ?? path.join('output', 'step-14');
const REPORT_PATH = argv.report ?? path.join('docs', 'context', 'CONTRAST-REPORT.md');
const FILM_STEP = Number(argv.step ?? 0.5);
const BREAKPOINTS = (argv.breakpoints ?? '390,768,1440').split(',').map((width) => {
  const value = Number(width.trim());
  // Heights are the jury devices: iPhone 15 Pro, iPad portrait, a 1440 laptop.
  const height = value <= 430 ? 844 : value <= 820 ? 1024 : 900;
  return { width: value, height, label: `${value}x${height}` };
});
/** The seven chapters that carry media behind their reading zone. `proof` is a white stage. */
const ALL_CHAPTERS = ['portico', 'foundation', 'garage', 'vault', 'finish-hall', 'commercial', 'consultation'];
const CHAPTERS = argv.chapters ? argv.chapters.split(',').map((id) => id.trim()) : ALL_CHAPTERS;

/** Storyboard paper. A background median this close to it is the wash, not a film frame. */
const PAPER = [250, 249, 246];
const WASH_TOLERANCE = 6;
const BODY_MIN = 4.5;
const LARGE_MIN = 3;
/** Samples with no film get this many evenly spaced progress stops instead. */
const STATIC_STOPS = [0, 0.25, 0.5, 0.75, 1];
const CAPTURE_COUNT = 3;

/* ------------------------------------------------------------------- colour */

const srgbToLinear = (channel) => {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
const ratioFromLuminance = (a, b) => {
  const [high, low] = a > b ? [a, b] : [b, a];
  return (high + 0.05) / (low + 0.05);
};
const contrast = (foreground, background) => ratioFromLuminance(luminance(foreground), luminance(background));
const composite = (foreground, alpha, background) =>
  foreground.map((channel, index) => Math.round(channel * alpha + background[index] * (1 - alpha)));

function parseColor(value) {
  const match = /rgba?\(([^)]+)\)/.exec(value ?? '');
  if (!match) return { rgb: [0, 0, 0], alpha: 1 };
  const parts = match[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  return { rgb: [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0], alpha: parts[3] === undefined ? 1 : parts[3] };
}

const isWash = (rgb) => rgb.every((channel, index) => Math.abs(channel - PAPER[index]) <= WASH_TOLERANCE);
const round = (value, places = 2) => Number(value.toFixed(places));

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * fraction)));
  return sorted[index];
}

/* --------------------------------------------------------------- film clock */

/** Mirrors `journey-film-timing.ts`: only `foundation` reshapes its clock. */
const FOUNDATION_WINDOW = { start: 0.14, end: 0.84 };
const smoothstep = (value) => value * value * (3 - 2 * value);
/** Invert smoothstep so a wanted film time becomes a scroll position. */
function inverseSmoothstep(target) {
  const clamped = Math.min(1, Math.max(0, target));
  return 0.5 - Math.sin(Math.asin(1 - 2 * clamped) / 3);
}
function progressForFilmTime(chapter, filmTime, duration) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const raw = Math.min(1, Math.max(0, filmTime / duration));
  if (chapter !== 'foundation') return raw;
  const { start, end } = FOUNDATION_WINDOW;
  return start + inverseSmoothstep(raw) * (end - start);
}

/* ------------------------------------------------------------- page helpers */

async function settle(page, frames = 2) {
  await page.evaluate(async (count) => {
    for (let index = 0; index < count; index += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }
  }, frames);
}

async function readGeometry(page) {
  return page.evaluate((chapterIds) => {
    const journey = document.querySelector('.journey');
    const journeyTop = journey ? journey.getBoundingClientRect().top + window.scrollY : 0;
    const chapters = chapterIds.flatMap((id) => {
      const node = document.querySelector(`.journey [data-journey-chapter="${id}"]`);
      if (!node) return [];
      const rect = node.getBoundingClientRect();
      const video = node.querySelector('.pour-film, .floor-film-video');
      return [{
        id,
        start: Math.round(rect.top + window.scrollY),
        end: Math.round(rect.bottom + window.scrollY),
        hasVideo: Boolean(video),
        readingZone: Boolean(node.querySelector('.chapter-content')),
      }];
    });
    return {
      journeyTop: Math.round(journeyTop),
      documentHeight: document.documentElement.scrollHeight,
      tier: document.documentElement.dataset.journeyTier ?? null,
      motion: document.documentElement.dataset.journeyMotion ?? null,
      chapters,
    };
  }, CHAPTERS);
}

/** Force the chapter's film to load so its duration is known even when not resident. */
async function filmDuration(page, chapterId) {
  return page.evaluate(async (id) => {
    const video = document.querySelector(`.journey [data-journey-chapter="${id}"] .pour-film, .journey [data-journey-chapter="${id}"] .floor-film-video`);
    if (!video) return null;
    if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
    video.preload = 'auto';
    video.load();
    await new Promise((resolve) => {
      const done = () => resolve();
      video.addEventListener('loadedmetadata', done, { once: true });
      video.addEventListener('error', done, { once: true });
      setTimeout(done, 4000);
    });
    return Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
  }, chapterId);
}

/**
 * Put the chapter's film on the wanted frame. Scroll first — that is the real page
 * behaviour; only seek directly when the director declines to move it.
 */
async function positionFilm(page, chapterId, scrollY, wantedTime) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), scrollY);
  await settle(page, 3);
  const observed = await page.evaluate(async ({ id, wanted }) => {
    const video = document.querySelector(`.journey [data-journey-chapter="${id}"] .pour-film, .journey [data-journey-chapter="${id}"] .floor-film-video`);
    if (!video) return { currentTime: null, seeded: false, readyState: null };
    const waitForSeek = () => new Promise((resolve) => {
      if (!video.seeking) { resolve(); return; }
      const done = () => resolve();
      video.addEventListener('seeked', done, { once: true });
      setTimeout(done, 1500);
    });
    await waitForSeek();
    if (wanted === null || Math.abs(video.currentTime - wanted) <= 0.25) {
      return { currentTime: video.currentTime, seeded: false, readyState: video.readyState };
    }
    // The director is holding this plate (boundary frame-0 hold, non-resident film,
    // or save-data). Seed the frame directly so the sample still measures real pixels.
    video.currentTime = wanted;
    await waitForSeek();
    return { currentTime: video.currentTime, seeded: true, readyState: video.readyState };
  }, { id: chapterId, wanted: wantedTime });
  await settle(page, 2);
  return observed;
}

/* -------------------------------------------------------------- text boxes */

/** Runs in the page. Text-bearing, on-screen, actually-painted elements of one reading zone. */
const collectBoxes = (chapterId) => {
  const chapter = document.querySelector(`.journey [data-journey-chapter="${chapterId}"]`);
  if (!chapter) return [];
  const zone = chapter.querySelector('.chapter-content') ?? chapter;
  const boxes = [];
  const occluded = [];
  const consider = (element) => {
    // Only elements that paint their OWN glyphs: a wrapper whose text lives in a
    // child would otherwise be measured twice, at the wrong box.
    const ownText = [...element.childNodes]
      .filter((node) => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0)
      .map((node) => node.textContent.trim())
      .join(' ');
    if (!ownText) return;
    // Visually hidden only. `aria-hidden` must NOT exclude anything here: SplitText
    // with `aria:'auto'` marks every generated line and char div `aria-hidden="true"`
    // and puts one label on the parent, so filtering on it would drop every split
    // headline on the page — precisely the boxes the 3:1 threshold exists for.
    if (element.closest('.sr-only, .visually-hidden')) return;
    const style = getComputedStyle(element);
    if (style.visibility === 'hidden' || style.display === 'none') return;
    if (Number.parseFloat(style.opacity) < 0.05) return;
    const rect = element.getBoundingClientRect();
    if (rect.width < 4 || rect.height < 4) return;
    if (rect.bottom <= 0 || rect.top >= innerHeight || rect.right <= 0 || rect.left >= innerWidth) return;
    // Occlusion test. The header is fixed and opaque, so at the end of an act the
    // hero's CTAs pass underneath it. Sampling those measures the header's paper
    // against white button text and reports ~1:1 — a failure the visitor never sees,
    // because the text is not on screen at all. Hit-test five points across the box;
    // a hit on the element, a descendant, or an ancestor counts as visible.
    const points = [[0.5, 0.5], [0.25, 0.35], [0.75, 0.35], [0.25, 0.65], [0.75, 0.65]];
    const visible = points.some(([fx, fy]) => {
      const x = rect.left + rect.width * fx;
      const y = rect.top + rect.height * fy;
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return false;
      const hit = document.elementFromPoint(x, y);
      return Boolean(hit) && (hit === element || element.contains(hit) || hit.contains(element));
    });
    if (!visible) { occluded.push(ownText.slice(0, 30)); return; }
    const fontSize = Number.parseFloat(style.fontSize) || 16;
    const fontWeight = Number.parseFloat(style.fontWeight) || 400;
    boxes.push({
      tag: element.tagName,
      cls: (element.className && element.className.toString ? element.className.toString() : '').slice(0, 48),
      text: ownText.slice(0, 60),
      rect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      color: style.color,
      ownBackground: style.backgroundColor,
      fontSize,
      fontWeight,
      // WCAG 1.4.3 large text. Size decides the threshold, not the tag name.
      large: fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700),
    });
  };
  consider(zone);
  zone.querySelectorAll('*').forEach((element) => consider(element));
  return { boxes, occluded };
};

/** Runs in the page. Hides every text-bearing element in the zone; remembers what it changed. */
const hideBoxes = (chapterId) => {
  const chapter = document.querySelector(`.journey [data-journey-chapter="${chapterId}"]`);
  if (!chapter) return 0;
  const zone = chapter.querySelector('.chapter-content') ?? chapter;
  const targets = [zone, ...zone.querySelectorAll('*')].filter((element) =>
    [...element.childNodes].some((node) => node.nodeType === 3 && (node.textContent ?? '').trim().length > 0));
  window.__contrastHidden = targets.map((element) => [element, element.style.visibility]);
  targets.forEach((element) => { element.style.visibility = 'hidden'; });
  return targets.length;
};

/** Runs in the page. Puts every hidden element back exactly as it was. */
const restoreBoxes = () => {
  (window.__contrastHidden ?? []).forEach(([element, previous]) => {
    if (previous) element.style.visibility = previous;
    else element.style.removeProperty('visibility');
  });
  window.__contrastHidden = [];
  return true;
};

/* ------------------------------------------------------------ pixel sampling */

/** Median and luminance percentiles of the pixels under a viewport-space rect. */
function sampleRegion(raw, info, rect) {
  const left = Math.max(0, Math.floor(rect.x));
  const top = Math.max(0, Math.floor(rect.y));
  const right = Math.min(info.width, Math.ceil(rect.x + rect.width));
  const bottom = Math.min(info.height, Math.ceil(rect.y + rect.height));
  if (right <= left || bottom <= top) return null;

  // A full headline box can be 1400 x 200 px; stride so no sample costs more than
  // ~40k pixels while still covering the whole box evenly.
  const width = right - left;
  const height = bottom - top;
  const stride = Math.max(1, Math.round(Math.sqrt((width * height) / 40000)));
  const reds = [];
  const greens = [];
  const blues = [];
  const luminances = [];
  for (let y = top; y < bottom; y += stride) {
    for (let x = left; x < right; x += stride) {
      const offset = (y * info.width + x) * info.channels;
      const pixel = [raw[offset], raw[offset + 1], raw[offset + 2]];
      reds.push(pixel[0]);
      greens.push(pixel[1]);
      blues.push(pixel[2]);
      luminances.push(luminance(pixel));
    }
  }
  if (reds.length === 0) return null;
  const sort = (list) => list.sort((a, b) => a - b);
  sort(reds); sort(greens); sort(blues); sort(luminances);
  return {
    pixels: reds.length,
    median: [percentile(reds, 0.5), percentile(greens, 0.5), percentile(blues, 0.5)],
    luminancePercentiles: [0.05, 0.25, 0.5, 0.75, 0.95].map((fraction) => percentile(luminances, fraction)),
  };
}

/* -------------------------------------------------------------------- run */

async function measureBreakpoint(browser, breakpoint) {
  const context = await browser.newContext({
    viewport: { width: breakpoint.width, height: breakpoint.height },
    deviceScaleFactor: 1,
    // Never measure a reduced-motion build here: the whole point is the moving frame.
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.journey', { timeout: 20000 });
  await page.waitForTimeout(1800);
  await settle(page, 3);

  let geometry = await readGeometry(page);
  const results = [];

  for (const chapterId of CHAPTERS) {
    if (!geometry.chapters.some((entry) => entry.id === chapterId)) {
      results.push({ chapter: chapterId, breakpoint: breakpoint.label, missing: true, samples: [] });
      continue;
    }
    const duration = geometry.chapters.find((entry) => entry.id === chapterId).hasVideo
      ? await filmDuration(page, chapterId)
      : null;
    // Geometry is re-read per chapter, immediately before sampling it, and after the
    // film has been forced to load. The document grows during a run — ScrollTrigger's
    // pin spacer for the resin mask is added on refresh, and refreshes fire on
    // `document.fonts.ready` and on every film that finishes loading. Measuring once
    // per breakpoint silently sampled the late chapters at stale coordinates, which
    // read as "no text on screen" rather than as an error.
    const fresh = await readGeometry(page);
    const chapter = fresh.chapters.find((entry) => entry.id === chapterId);
    if (!chapter) {
      results.push({ chapter: chapterId, breakpoint: breakpoint.label, missing: true, samples: [] });
      continue;
    }
    const stale = geometry.chapters.find((entry) => entry.id === chapterId);
    const drift = chapter.start - stale.start;
    geometry = fresh;
    const progressStart = Math.max(geometry.journeyTop, chapter.start - breakpoint.height / 2);
    const progressEnd = chapter.end - breakpoint.height / 2;
    const span = Math.max(1, progressEnd - progressStart);

    const stops = duration
      ? Array.from({ length: Math.floor(duration / FILM_STEP) + 1 }, (_, index) => index * FILM_STEP)
      : STATIC_STOPS;
    const samples = [];
    let occludedTotal = 0;

    for (const stop of stops) {
      const progress = duration ? progressForFilmTime(chapterId, stop, duration) : stop;
      const scrollY = Math.round(progressStart + progress * span);
      const film = await positionFilm(page, chapterId, scrollY, duration ? stop : null);

      const collected = await page.evaluate(collectBoxes, chapterId);
      const boxes = collected.boxes;
      occludedTotal += collected.occluded.length;
      if (boxes.length === 0) {
        samples.push({ filmTime: duration ? stop : null, progress: round(progress, 3), scrollY, boxes: [], film });
        continue;
      }

      await page.evaluate(hideBoxes, chapterId);
      await settle(page, 2);
      const shot = await page.screenshot({ type: 'png' });
      await page.evaluate(restoreBoxes);
      await settle(page, 1);

      const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
      const measured = boxes.flatMap((box) => {
        const region = sampleRegion(data, info, box.rect);
        if (!region) return [];
        const text = parseColor(box.color);
        const own = parseColor(box.ownBackground);
        // An element that paints its own background is sitting on that background,
        // not on the film — but `visibility: hidden` removed it from the sample, so
        // composite it back before judging the box.
        const background = own.alpha > 0 ? composite(own.rgb, own.alpha, region.median) : region.median;
        const foreground = text.alpha < 1 ? composite(text.rgb, text.alpha, background) : text.rgb;
        const medianRatio = contrast(foreground, background);
        const textLuminance = luminance(foreground);
        // The median can flatter a box that straddles a bright edge; the worst of the
        // luminance percentiles is what the visitor's eye actually lands on.
        const worstRatio = Math.min(...region.luminancePercentiles.map((value) => ratioFromLuminance(textLuminance, value)));
        const threshold = box.large ? LARGE_MIN : BODY_MIN;
        const wash = isWash(background);
        return [{
          ...box,
          background,
          foreground,
          medianRatio: round(medianRatio),
          worstRatio: round(worstRatio),
          threshold,
          wash,
          pixels: region.pixels,
          fails: medianRatio < threshold && !wash,
          failsWorst: worstRatio < threshold && !wash,
        }];
      });

      samples.push({ filmTime: duration ? round(stop, 2) : null, progress: round(progress, 3), scrollY, film, boxes: measured });
    }

    results.push({
      chapter: chapterId,
      breakpoint: breakpoint.label,
      duration: duration ? round(duration, 2) : null,
      hasReadingZone: chapter.readingZone,
      scrollSpan: [Math.round(progressStart), Math.round(progressEnd)],
      drift,
      occluded: occludedTotal,
      samples,
    });
    const boxCount = samples.reduce((total, s) => total + s.boxes.length, 0);
    process.stdout.write(`  ${chapterId.padEnd(13)} ${String(samples.length).padStart(2)} samples, ${String(boxCount).padStart(4)} boxes${occludedTotal ? `, ${occludedTotal} occluded` : ''}${drift ? `  (chapter moved ${drift > 0 ? '+' : ''}${drift} px since load)` : ''}${boxCount === 0 ? '  <-- NO TEXT ON SCREEN' : ''}\n`);
  }

  const meta = { tier: geometry.tier, motion: geometry.motion, documentHeight: geometry.documentHeight };
  await context.close();
  return { breakpoint, meta, results };
}

/**
 * Re-visit the worst boxes and photograph them with the text visible.
 *
 * A raw `scrollY` from the measuring run cannot be replayed: the document height the
 * sample was taken at is not the height a freshly loaded page has (the resin mask's pin
 * spacer alone moves the late chapters by ~1000 px). So the capture recomputes the
 * scroll position from the recorded chapter progress against freshly measured geometry,
 * then re-finds the box by identity and re-measures it. If the reproduced ratio does not
 * match the recorded one, the capture says so instead of quietly showing the wrong thing.
 */
async function captureOffenders(browser, offenders) {
  const captures = [];
  for (const [index, offender] of offenders.entries()) {
    const context = await browser.newContext({
      viewport: { width: offender.viewport.width, height: offender.viewport.height },
      deviceScaleFactor: 1,
      reducedMotion: 'no-preference',
    });
    const page = await context.newPage();
    const file = path.join(OUT_DIR, `contrast-worst-${index + 1}-${offender.chapter}-${offender.viewport.width}.png`);
    try {
      await page.goto(BASE, { waitUntil: 'networkidle' });
      await page.waitForSelector('.journey', { timeout: 20000 });
      await page.waitForTimeout(1500);
      await settle(page, 3);
      if (offender.filmTime !== null) await filmDuration(page, offender.chapter);

      const geometry = await readGeometry(page);
      const chapter = geometry.chapters.find((entry) => entry.id === offender.chapter);
      if (!chapter) throw new Error(`chapter ${offender.chapter} not found at capture time`);
      const progressStart = Math.max(geometry.journeyTop, chapter.start - offender.viewport.height / 2);
      const progressEnd = chapter.end - offender.viewport.height / 2;
      const scrollY = Math.round(progressStart + offender.progress * Math.max(1, progressEnd - progressStart));
      await positionFilm(page, offender.chapter, scrollY, offender.filmTime);

      // Re-find the box by identity; its viewport rect now is the one to photograph.
      const { boxes } = await page.evaluate(collectBoxes, offender.chapter);
      const match = boxes.find((box) => box.tag === offender.tag && box.cls === offender.cls && box.text === offender.text)
        ?? boxes.find((box) => box.text === offender.text);
      if (!match) throw new Error(`box "${offender.text.slice(0, 24)}" not on screen at capture time`);

      // Re-measure it, so the picture and the number are known to be the same thing.
      await page.evaluate(hideBoxes, offender.chapter);
      await settle(page, 2);
      const shot = await page.screenshot({ type: 'png' });
      await page.evaluate(restoreBoxes);
      await settle(page, 1);
      const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
      const region = sampleRegion(data, info, match.rect);
      const text = parseColor(match.color);
      const own = parseColor(match.ownBackground);
      const background = region && own.alpha > 0 ? composite(own.rgb, own.alpha, region.median) : region?.median;
      const reproduced = region
        ? round(contrast(text.alpha < 1 ? composite(text.rgb, text.alpha, background) : text.rgb, background))
        : null;

      const pad = 26;
      const clip = {
        x: Math.max(0, Math.floor(match.rect.x - pad)),
        y: Math.max(0, Math.floor(match.rect.y - pad)),
        width: Math.ceil(match.rect.width + pad * 2),
        height: Math.ceil(match.rect.height + pad * 2),
      };
      clip.width = Math.max(8, Math.min(clip.width, offender.viewport.width - clip.x));
      clip.height = Math.max(8, Math.min(clip.height, offender.viewport.height - clip.y));
      await page.screenshot({ path: file, clip });
      captures.push({ ...offender, file: file.replace(/\\/g, '/'), reproduced, capturedAtScrollY: scrollY });
    } catch (error) {
      captures.push({ ...offender, file: null, reproduced: null, error: String(error.message ?? error).slice(0, 160) });
    }
    await context.close();
  }
  return captures;
}

/* ----------------------------------------------------------------- report */

function aggregate(runs) {
  const rows = [];
  for (const run of runs) {
    for (const result of run.results) {
      const boxes = result.samples.flatMap((sample) => sample.boxes);
      const ratios = boxes.map((box) => box.medianRatio).sort((a, b) => a - b);
      rows.push({
        chapter: result.chapter,
        breakpoint: run.breakpoint.label,
        width: run.breakpoint.width,
        duration: result.duration,
        samples: result.samples.length,
        seeded: result.samples.filter((sample) => sample.film?.seeded).length,
        boxes: boxes.length,
        min: ratios.length ? ratios[0] : null,
        median: ratios.length ? round(percentile(ratios, 0.5)) : null,
        max: ratios.length ? ratios[ratios.length - 1] : null,
        wash: boxes.filter((box) => box.wash).length,
        fails: boxes.filter((box) => box.fails).length,
        failsWorst: boxes.filter((box) => box.failsWorst).length,
        occluded: result.occluded ?? 0,
      });
    }
  }
  return rows;
}

function collectOffenders(runs) {
  const offenders = [];
  for (const run of runs) {
    for (const result of run.results) {
      for (const sample of result.samples) {
        for (const box of sample.boxes) {
          if (box.wash) continue;
          offenders.push({
            chapter: result.chapter,
            viewport: { width: run.breakpoint.width, height: run.breakpoint.height },
            breakpoint: run.breakpoint.label,
            filmTime: sample.filmTime,
            scrollY: sample.scrollY,
            progress: sample.progress,
            rect: box.rect,
            tag: box.tag,
            cls: box.cls,
            text: box.text,
            fontSize: box.fontSize,
            large: box.large,
            threshold: box.threshold,
            medianRatio: box.medianRatio,
            worstRatio: box.worstRatio,
            foreground: box.foreground,
            background: box.background,
            margin: round(box.medianRatio - box.threshold),
          });
        }
      }
    }
  }
  return offenders.sort((a, b) => a.margin - b.margin);
}

/**
 * The three worst boxes are usually three instances of the same box — the four ribbon
 * numerals, the same eyebrow at three film times. Photograph three *distinct* problems
 * instead: worst per (chapter, breakpoint, element), still in worst-first order.
 */
function distinctOffenders(offenders, count) {
  const seen = new Set();
  const picked = [];
  for (const offender of offenders) {
    const key = `${offender.chapter}|${offender.viewport.width}|${offender.tag}.${offender.cls.split(/\s+/)[0] ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(offender);
    if (picked.length >= count) break;
  }
  return picked;
}

function renderReport({ rows, runs, offenders, captures, startedAt }) {
  const lines = [];
  const totalBoxes = rows.reduce((total, row) => total + row.boxes, 0);
  const totalFails = rows.reduce((total, row) => total + row.fails, 0);

  lines.push('# Contrast report — text over moving film');
  lines.push('');
  lines.push(`_Generated by \`scripts/measure-contrast.mjs\` on ${startedAt} against \`${BASE}\`. Do not hand-edit; re-run the script._`);
  lines.push('');
  lines.push('## What this measures');
  lines.push('');
  lines.push(`Every media chapter, at every breakpoint, sampled in **${FILM_STEP} s film steps**. At each step the script hides the reading zone's text with \`visibility: hidden\`, screenshots the viewport, restores the text, and takes the **per-channel median** of the pixels behind each text box. Contrast is WCAG 1.4.3 relative luminance, text colour against that median. Where an element paints its own background, that background is composited back in before judging — hiding it for the sample must not flatter it.`);
  lines.push('');
  lines.push(`Thresholds: **${BODY_MIN}:1** body, **${LARGE_MIN}:1** WCAG large text (>= 24 px, or >= 18.66 px at weight >= 700). A box whose background median is within ${WASH_TOLERANCE}/255 of the paper \`#FAF9F6\` on every channel is on the paper wash and is reported as \`wash\`, not flagged.`);
  lines.push('');
  lines.push('`median` is the headline number. `worst` is the lowest contrast among the 5th/25th/50th/75th/95th luminance percentiles of the same pixels — it catches a box that straddles a bright edge, where the median flatters it.');
  lines.push('');
  lines.push('**This script does not fix anything.** Step 16 owns the reading-zone CSS.');
  lines.push('');
  lines.push('## Totals');
  lines.push('');
  lines.push(`- Breakpoints: ${runs.map((run) => run.breakpoint.label).join(', ')}`);
  lines.push(`- Chapter x breakpoint cells: **${rows.length}**`);
  lines.push(`- Samples: **${rows.reduce((total, row) => total + row.samples, 0)}** (${rows.reduce((total, row) => total + row.seeded, 0)} needed a direct seek because the director held the film)`);
  lines.push(`- Text boxes measured: **${totalBoxes}**`);
  lines.push(`- Boxes below threshold on the median, paper wash absent: **${totalFails}**`);
  lines.push(`- Boxes below threshold on the worst percentile: **${rows.reduce((total, row) => total + row.failsWorst, 0)}**`);
  lines.push(`- Boxes already on the paper wash: **${rows.reduce((total, row) => total + row.wash, 0)}**`);
  lines.push(`- Box readings discarded as occluded (text passing under the fixed header, or otherwise covered): **${rows.reduce((total, row) => total + row.occluded, 0)}**`);
  lines.push('');
  for (const run of runs) {
    lines.push(`- \`${run.breakpoint.label}\` — tier \`${run.meta.tier}\`, motion \`${run.meta.motion}\`, document ${run.meta.documentHeight} px`);
  }
  lines.push('');

  lines.push('## Every chapter x breakpoint');
  lines.push('');
  lines.push('| chapter | breakpoint | film | samples | boxes | min | median | max | wash | fail (median) | fail (worst) |');
  lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const row of rows) {
    const film = row.duration ? `${row.duration} s` : 'none';
    const fmt = (value) => (value === null ? '—' : value.toFixed(2));
    lines.push(`| \`${row.chapter}\` | ${row.breakpoint} | ${film} | ${row.samples} | ${row.boxes} | ${fmt(row.min)} | ${fmt(row.median)} | ${fmt(row.max)} | ${row.wash} | ${row.fails} | ${row.failsWorst} |`);
  }
  lines.push('');

  lines.push('## Worst boxes');
  lines.push('');
  if (offenders.length === 0) {
    lines.push('No box off the paper wash was measured. Nothing to rank.');
  } else {
    // A ranking that runs all the way down to 14:1 boxes is a list nobody reads.
    // Show what is failing, plus the near-misses one bright frame away from failing.
    const actionable = offenders.filter((offender) => offender.margin < 1).slice(0, 25);
    lines.push(`Ranked by margin — median contrast minus the box's own threshold. Everything failing, plus every box within 1.0 of failing (${actionable.length} of ${offenders.length} boxes off the wash). Top of this list is what Step 16 fixes first.`);
    lines.push('');
    lines.push('| # | chapter | bp | element | text | px | threshold | median | worst | margin | text colour | background median |');
    lines.push('|---:|---|---|---|---|---:|---:|---:|---:|---:|---|---|');
    for (const [index, offender] of actionable.entries()) {
      const rgb = (value) => `rgb(${value.join(' ')})`;
      const text = offender.text.replace(/\|/g, '\\|').slice(0, 38);
      const mark = offender.margin < 0 ? '**' : '';
      lines.push(`| ${index + 1} | \`${offender.chapter}\` | ${offender.viewport.width} | \`${offender.tag.toLowerCase()}${offender.cls ? `.${offender.cls.split(/\s+/)[0]}` : ''}\` | ${text} | ${Math.round(offender.fontSize)} | ${offender.threshold.toFixed(1)} | ${mark}${offender.medianRatio.toFixed(2)}${mark} | ${offender.worstRatio.toFixed(2)} | ${offender.margin > 0 ? '+' : ''}${offender.margin.toFixed(2)} | ${rgb(offender.foreground)} | ${rgb(offender.background)} |`);
    }
    if (actionable.length === 0) lines.push('| — | — | — | — | nothing within 1.0 of its threshold | — | — | — | — | — | — | — |');
  }
  lines.push('');

  lines.push('## Captures');
  lines.push('');
  lines.push('The worst box per distinct element, so three captures are three problems rather than three copies of one.');
  lines.push('');
  if (captures.length === 0) lines.push('No captures taken.');
  for (const [index, capture] of captures.entries()) {
    lines.push(`${index + 1}. \`${capture.chapter}\` at ${capture.viewport.width} px${capture.filmTime === null ? '' : `, film ${capture.filmTime} s`} — ${capture.tag.toLowerCase()} "${capture.text.slice(0, 40)}", median **${capture.medianRatio.toFixed(2)}:1** against a threshold of ${capture.threshold.toFixed(1)}:1.`);
    if (capture.file) {
      const agrees = capture.reproduced !== null && Math.abs(capture.reproduced - capture.medianRatio) <= 1;
      lines.push(`   \`${capture.file}\` — re-measured at capture time: **${capture.reproduced === null ? 'n/a' : `${capture.reproduced.toFixed(2)}:1`}**${agrees ? '' : ' (differs from the sampled value: the frame is scroll-sensitive, treat the sampled number as authoritative)'}`);
    } else {
      lines.push(`   capture failed: ${capture.error}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/* -------------------------------------------------------------------- main */

async function main() {
  const startedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);
  mkdirSync(OUT_DIR, { recursive: true });
  // A capture from an earlier run would otherwise survive as a "worst offender" that
  // this run no longer ranks, and the report would cite a stale picture.
  if (existsSync(OUT_DIR)) {
    readdirSync(OUT_DIR)
      .filter((name) => name.startsWith('contrast-worst-'))
      .forEach((name) => rmSync(path.join(OUT_DIR, name), { force: true }));
  }

  console.log(`measure-contrast: ${BASE}`);
  const browser = await chromium.launch();
  const runs = [];
  try {
    for (const breakpoint of BREAKPOINTS) {
      console.log(`${breakpoint.label}:`);
      runs.push(await measureBreakpoint(browser, breakpoint));
    }
    const rows = aggregate(runs);
    const offenders = collectOffenders(runs);
    const captures = await captureOffenders(browser, distinctOffenders(offenders, CAPTURE_COUNT));

    writeFileSync(REPORT_PATH, `${renderReport({ rows, runs, offenders, captures, startedAt })}\n`);
    writeFileSync(path.join(OUT_DIR, 'contrast-samples.json'), `${JSON.stringify({ base: BASE, startedAt, rows, offenders: offenders.slice(0, 60) }, null, 2)}\n`);

    const fails = rows.reduce((total, row) => total + row.fails, 0);
    console.log(`\n${rows.length} chapter x breakpoint cells, ${rows.reduce((t, r) => t + r.boxes, 0)} boxes, ${fails} below threshold off the wash.`);
    console.log(`Report: ${REPORT_PATH}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
