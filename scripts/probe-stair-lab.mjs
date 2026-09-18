/**
 * Step 20 gate probe and capture pass for `/lab/stairs`.
 *
 * Runs against the BUILT app (DEV-CONTRACT.md: dev-mode Vite is not the delivery
 * path). It does not start or stop a server — point it at one that is already up:
 *
 *   node scripts/probe-stair-lab.mjs --url http://127.0.0.1:4378
 *
 * What it produces under `output/step-20/`:
 *   captures/<viewport>/panel-a-p{0,50,100}.png
 *   captures/<viewport>/panel-b-p{0,50,100}.png
 *   video/panel-{a,b}-<viewport>.webm        10 s scripted scroll each
 *   report.json                              every number below
 *
 * What it measures, and why each measurement could fail:
 *
 *  - **Parallax divergence.** Sub-pixel horizontal shift between p = 0 and p = 1, by
 *    2-D normalised cross-correlation of a dozen patches across each row band,
 *    peak-interpolated with a parabola in x. Reported per band as the mean |dx| and
 *    as the slope d(dx)/dx, which is the quantity that isolates depth from screen
 *    position: for a straight dolly, dx = x * delta/(d-delta), so the slope is
 *    delta/(d-delta) and its ratio between two bands is the ratio of their
 *    distances. A flat card returns the same slope for both bands and the gate reads
 *    1.0. The search covers dy as well as dx because rise and pitch move the picture
 *    down several pixels, and a patch read at fixed rows would be matching different
 *    content at p = 1.
 *
 *  - **SSIM on a riser crop**, p = 0 against p = 1, 8x8 windows at stride 4, plus the
 *    three numbers that say what a given score means: the crop's measured vertical
 *    travel, the score after aligning for that travel, and the score a *perfect*
 *    plate would get on the fixed crop at the same travel (`displacementCeiling`).
 *    Without those, a low fixed-crop score cannot be told apart from a torn plate.
 *
 *  - **Holes.** `?probe=holes` paints the panel host magenta under the canvas and
 *    hides the DOM still, so any pixel the plate does not cover is countable. The
 *    control run re-mounts the plate with `overscan=1&pitch=8` — the guard removed
 *    and the pitch past its cap — and its hole count is printed beside the real one.
 *    If the control does not move, the counter is not measuring anything.
 *
 *  - **Canvas count, view registry, console errors, scrub monotonicity** — read off
 *    the live page, not inferred.
 */
import { mkdirSync, rmSync, writeFileSync, renameSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = resolve(root, 'output/step-20');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 ? argv[index + 1] : fallback;
};
const baseUrl = flag('url', 'http://127.0.0.1:4378').replace(/\/$/, '');

const VIEWPORTS = [
  { label: '1440', width: 1440, height: 900 },
  { label: '390', width: 390, height: 844 },
];
const STOPS = [
  { key: 'p0', progress: 0 },
  { key: 'p50', progress: 0.5 },
  { key: 'p100', progress: 1 },
];

/* -------------------------------------------------------------------------- */
/* Plate geometry, mirrored from DepthPlate.tsx so the bands can be derived     */
/* rather than eyeballed.                                                      */
/* -------------------------------------------------------------------------- */
const PLATE_ASPECT = 1672 / 941;
const OVERSCAN = 1.038;
const OVERSCAN_TOP_BIAS = 0.8;
const SOURCE_W = 1672;
const SOURCE_H = 941;

/**
 * Source-pixel row/column -> capture pixel, mirroring `stairPlaneBox` in
 * `DepthPlate.tsx` (a .mjs script cannot import the .tsx, so the arithmetic is
 * duplicated — and `verifyMapping()` below re-derives it from the rendered frame so
 * a drift between the two shows up as a failed assertion rather than as bands
 * quietly measured in the wrong place).
 *
 * Everything is in units of the visible frustum height at the base distance, which
 * cancels `STAIR_NEAR_Z` and the fov out of the mapping entirely.
 */
function plateMapping(viewWidth, viewHeight) {
  const aspect = viewWidth / viewHeight;
  const planeHeight = Math.max(aspect / PLATE_ASPECT, 1) * OVERSCAN;
  const planeWidth = PLATE_ASPECT * planeHeight;
  const offsetY = (OVERSCAN_TOP_BIAS * planeHeight * (OVERSCAN - 1)) / (2 * OVERSCAN);
  return {
    // plate row -> world y -> frame y
    rowToY: (ys) => {
      const worldY = (0.5 - ys / SOURCE_H) * planeHeight + offsetY;
      return (0.5 - worldY) * viewHeight;
    },
    colToX: (xs) => {
      const worldX = (xs / SOURCE_W - 0.5) * planeWidth;
      return (0.5 + worldX / aspect) * viewWidth;
    },
    planeHeight,
    planeWidth,
    offsetY,
  };
}

/**
 * The mapping claims the twelve measured nosing rows land on particular capture
 * rows. Check it: each predicted row should sit on a local maximum of the frame's
 * own vertical luminance gradient. A control offset by 9 px is scored beside it.
 */
function verifyMapping(image, mapping, nosingRows) {
  const x0 = Math.round(image.width * 0.35);
  const x1 = Math.round(image.width * 0.65);
  const gradient = new Float64Array(image.height);
  for (let y = 1; y < image.height; y += 1) {
    let sum = 0;
    for (let x = x0; x < x1; x += 1) sum += Math.abs(image.data[y * image.width + x] - image.data[(y - 1) * image.width + x]);
    gradient[y] = sum / (x1 - x0);
  }
  const score = (offset) => nosingRows.map((row) => {
    const predicted = Math.round(mapping.rowToY(row)) + offset;
    let best = 0;
    for (let y = predicted - 3; y <= predicted + 3; y += 1) if (y > 0 && y < image.height) best = Math.max(best, gradient[y]);
    return Number(best.toFixed(1));
  });
  const measured = score(0);
  const control = score(9);
  return {
    predictedRows: nosingRows.map((row) => Math.round(mapping.rowToY(row))),
    gradientAtPredicted: measured,
    weakest: Math.min(...measured),
    controlWeakestAt9pxOffset: Math.min(...control),
  };
}

/* -------------------------------------------------------------------------- */
/* Image maths                                                                 */
/* -------------------------------------------------------------------------- */

async function grey(file) {
  const { data, info } = await sharp(file).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/**
 * 2-D normalised cross-correlation of one patch, sub-pixel in x.
 *
 * A 1-D row-profile match is not enough here: `rise` and `pitch` move the picture
 * down several pixels, so a patch read at the same rows in both frames holds
 * different content and its horizontal correlation is noise (an earlier revision
 * measured +11 px and -8 px in neighbouring windows of the same riser). Searching
 * dy as well as dx fixes that, and each patch reports its own peak correlation so a
 * window with nothing to match can be dropped instead of voting.
 */
function patchShift(a, b, box, rangeX = 16, rangeY = 16) {
  const width = box.x1 - box.x0;
  const height = box.y1 - box.y0;
  let sum = 0;
  for (let y = box.y0; y < box.y1; y += 1) for (let x = box.x0; x < box.x1; x += 1) sum += a.data[y * a.width + x];
  const meanA = sum / (width * height);
  let varianceA = 0;
  for (let y = box.y0; y < box.y1; y += 1) for (let x = box.x0; x < box.x1; x += 1) varianceA += (a.data[y * a.width + x] - meanA) ** 2;
  if (varianceA / (width * height) < 6) return null;

  const score = (dx, dy) => {
    let sb = 0;
    let n = 0;
    for (let y = box.y0; y < box.y1; y += 1) {
      const yy = y + dy;
      if (yy < 0 || yy >= b.height) return -2;
      for (let x = box.x0; x < box.x1; x += 1) {
        const xx = x + dx;
        if (xx < 0 || xx >= b.width) return -2;
        sb += b.data[yy * b.width + xx];
        n += 1;
      }
    }
    const meanB = sb / n;
    let num = 0;
    let da = 0;
    let db = 0;
    for (let y = box.y0; y < box.y1; y += 1) {
      for (let x = box.x0; x < box.x1; x += 1) {
        const va = a.data[y * a.width + x] - meanA;
        const vb = b.data[(y + dy) * b.width + x + dx] - meanB;
        num += va * vb;
        da += va * va;
        db += vb * vb;
      }
    }
    return num / Math.sqrt(Math.max(1e-9, da * db));
  };

  let best = { dx: 0, dy: 0, r: -2 };
  for (let dy = -rangeY; dy <= rangeY; dy += 1) {
    for (let dx = -rangeX; dx <= rangeX; dx += 1) {
      const r = score(dx, dy);
      if (r > best.r) best = { dx, dy, r };
    }
  }
  if (best.r < 0 || Math.abs(best.dx) === rangeX || Math.abs(best.dy) === rangeY) return null;
  const left = score(best.dx - 1, best.dy);
  const right = score(best.dx + 1, best.dy);
  const denominator = left - 2 * best.r + right;
  const offset = Math.abs(denominator) < 1e-9 ? 0 : (0.5 * (left - right)) / denominator;
  // Correlating a[x] against b[x+dx] peaks at dx = the distance the feature
  // travelled, so the reported shift is +dx. The back-wall band is the sign check:
  // under a forward dolly its shift must grow positive to the right of the
  // principal point, which an earlier revision of this file got backwards.
  return { dx: best.dx + offset, dy: best.dy, r: best.r };
}

/** Vertical travel of a band's content — the dy of one patch spanning the whole band. */
function bandVerticalShift(imageA, imageB, band) {
  const result = patchShift(imageA, imageB, band, 6, 24);
  return result ? result.dy : 0;
}

/**
 * Mean |dx| and least-squares slope d(dx)/dx over a row band, from patches that
 * actually matched (peak correlation >= 0.6). For a straight dolly,
 * dx = x * delta/(d - delta), so the slope isolates depth from screen position.
 */
function bandShift(imageA, imageB, band) {
  const windowWidth = Math.max(90, Math.round((band.x1 - band.x0) / 6));
  const step = Math.max(24, Math.round((band.x1 - band.x0 - windowWidth) / 11));
  const samples = [];
  let rejected = 0;
  for (let x = band.x0; x + windowWidth <= band.x1; x += step) {
    const result = patchShift(imageA, imageB, { x0: x, x1: x + windowWidth, y0: band.y0, y1: band.y1 });
    if (!result || result.r < 0.6) { rejected += 1; continue; }
    samples.push({ centre: x + windowWidth / 2, ...result });
  }
  const verticalTravelPx = Number(bandVerticalShift(imageA, imageB, band).toFixed(2));
  if (samples.length < 3) return { samples: samples.length, rejected, verticalTravelPx, meanAbsShift: null, slopePerPx: null };
  const centre = imageA.width / 2;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  let absolute = 0;
  for (const sample of samples) {
    const x = sample.centre - centre;
    sx += x;
    sy += sample.dx;
    sxx += x * x;
    sxy += x * sample.dx;
    absolute += Math.abs(sample.dx);
  }
  const n = samples.length;
  const slope = (sxy * n - sx * sy) / (sxx * n - sx * sx);
  return {
    samples: n,
    rejected,
    verticalTravelPx,
    meanAbsShift: Number((absolute / n).toFixed(3)),
    slopePerPx: Number(slope.toFixed(6)),
    points: samples.map((sample) => ({ x: Math.round(sample.centre), dx: Number(sample.dx.toFixed(2)), dy: sample.dy, r: Number(sample.r.toFixed(3)) })),
  };
}

/** SSIM over 8x8 windows at stride 4, on 8-bit greyscale. */
function ssim(a, b) {
  if (a.width !== b.width || a.height !== b.height) throw new Error('SSIM size mismatch');
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const win = 8;
  const stride = 4;
  let total = 0;
  let count = 0;
  for (let y = 0; y + win <= a.height; y += stride) {
    for (let x = 0; x + win <= a.width; x += stride) {
      let sa = 0;
      let sb = 0;
      let saa = 0;
      let sbb = 0;
      let sab = 0;
      for (let j = 0; j < win; j += 1) {
        for (let i = 0; i < win; i += 1) {
          const va = a.data[(y + j) * a.width + x + i];
          const vb = b.data[(y + j) * b.width + x + i];
          sa += va; sb += vb; saa += va * va; sbb += vb * vb; sab += va * vb;
        }
      }
      const n = win * win;
      const ma = sa / n;
      const mb = sb / n;
      const va = saa / n - ma * ma;
      const vb = sbb / n - mb * mb;
      const cab = sab / n - ma * mb;
      total += ((2 * ma * mb + C1) * (2 * cab + C2)) / ((ma * ma + mb * mb + C1) * (va + vb + C2));
      count += 1;
    }
  }
  return Number((total / count).toFixed(4));
}

async function cropGrey(file, region) {
  const { data, info } = await sharp(file).extract(region).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function magentaFraction(file) {
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels;
  const pixels = info.width * info.height;
  let hits = 0;
  for (let i = 0; i < pixels; i += 1) {
    const r = data[i * channels];
    const g = data[i * channels + 1];
    const b = data[i * channels + 2];
    if (r > 200 && b > 200 && g < 70) hits += 1;
  }
  return { pixels, magenta: hits, percent: Number(((hits / pixels) * 100).toFixed(5)) };
}

/* -------------------------------------------------------------------------- */
/* Page driving                                                                */
/* -------------------------------------------------------------------------- */

async function settleAt(page, panel, progress) {
  await page.evaluate(([selector, p]) => {
    const section = document.querySelector(selector);
    const travel = section.offsetHeight - window.innerHeight;
    window.scrollTo({ top: section.offsetTop + travel * p, behavior: 'instant' });
  }, [`[data-stair-panel="${panel}"]`, progress]);
  await page.waitForTimeout(120);
  if (panel === 'b') {
    await page.waitForFunction((p) => {
      const host = document.querySelector('[data-depth-plate]');
      if (!host) return false;
      const value = Number(host.dataset.plateProgress);
      return Number.isFinite(value) && Math.abs(value - p) < 0.002;
    }, progress, { timeout: 8000 }).catch(() => undefined);
  } else {
    await page.waitForFunction(() => {
      const video = document.querySelector('[data-stair-film]');
      return video && video.readyState >= 2 && !video.seeking;
    }, undefined, { timeout: 8000 }).catch(() => undefined);
  }
  await page.waitForTimeout(280);
}

async function pageReady(page) {
  await page.waitForFunction(() => Boolean(window.__stairLab), undefined, { timeout: 15000 }).catch(() => undefined);
  await page.waitForFunction(() => {
    const video = document.querySelector('[data-stair-film]');
    return video ? Number.isFinite(video.duration) && video.duration > 0 : true;
  }, undefined, { timeout: 15000 }).catch(() => undefined);
  /*
   * Keep the demand-rendered canvas drawing every animation frame, for the whole
   * session. Two reasons, both harness-only:
   *  - `SurfaceFloor`'s renderer is created with `preserveDrawingBuffer: false`, so
   *    a canvas that has not drawn since the last composite screenshots as empty.
   *    A real browser keeps showing the last composited layer; Playwright does not.
   *  - headless rAF throttling starves the store's own re-invalidation, which made
   *    the λ 4 damping take ~8 frames per second instead of ~60 and left the plate
   *    short of its target. This restores a realistic frame budget; it does not
   *    change what the component computes.
   */
  await page.evaluate(() => {
    const tick = () => {
      window.__ffeSurface?.invalidate();
      window.__ffeStairKeepAlive = requestAnimationFrame(tick);
    };
    tick();
  });
  await page.waitForTimeout(600);
}

async function main() {
  rmSync(join(outputRoot, 'captures'), { recursive: true, force: true });
  rmSync(join(outputRoot, 'video'), { recursive: true, force: true });
  mkdirSync(join(outputRoot, 'video'), { recursive: true });

  const browser = await chromium.launch();
  const report = { baseUrl, generatedAt: new Date().toISOString(), viewports: {}, gates: {} };
  const consoleErrors = [];

  for (const viewport of VIEWPORTS) {
    const directory = join(outputRoot, 'captures', viewport.label);
    mkdirSync(directory, { recursive: true });
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push({ viewport: viewport.label, text: message.text() });
    });
    page.on('pageerror', (error) => consoleErrors.push({ viewport: viewport.label, text: `pageerror: ${error.message}` }));

    await page.goto(`${baseUrl}/lab/stairs?probe=plain`, { waitUntil: 'load' });
    await pageReady(page);

    const surface = await page.evaluate(() => ({
      canvases: document.querySelectorAll('canvas').length,
      views: window.__ffeSurface ? window.__ffeSurface.views() : null,
      renderer: window.__ffeSurface ? window.__ffeSurface.states.renderer : null,
      tier: document.documentElement.dataset.journeyTier ?? null,
      bandRect: (() => {
        const band = document.querySelector('[data-surface-fallback]');
        if (!band) return null;
        const rect = band.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      })(),
    }));

    const shots = {};
    for (const panel of ['a', 'b']) {
      for (const stop of STOPS) {
        await settleAt(page, panel, stop.progress);
        const file = join(directory, `panel-${panel}-${stop.key}.png`);
        await page.screenshot({ path: file });
        shots[`${panel}-${stop.key}`] = file;
      }
    }

    /*
     * A second pass on the route as a visitor gets it — header, scrim, headline,
     * caption and the A/B pill all present. The measurement pass above runs with
     * `?probe=plain` because the fixed header sits exactly over the back-wall band;
     * these are the frames to look at, those are the frames to measure.
     */
    await page.goto(`${baseUrl}/lab/stairs`, { waitUntil: 'load' });
    await pageReady(page);
    for (const panel of ['a', 'b']) {
      for (const stop of STOPS) {
        await settleAt(page, panel, stop.progress);
        const file = join(directory, `review-panel-${panel}-${stop.key}.png`);
        await page.screenshot({ path: file });
        shots[`review-${panel}-${stop.key}`] = file;
      }
    }

    const scrub = await page.evaluate(() => {
      const lab = window.__stairLab;
      return lab ? { monotonicViolations: lab.monotonicViolations, samples: lab.samples, videoDuration: lab.videoDuration, plateFrames: lab.plateFrames } : null;
    });

    report.viewports[viewport.label] = { ...viewport, surface, scrub, shots: Object.fromEntries(Object.entries(shots).map(([key, file]) => [key, file.replace(root, '').replace(/\\/g, '/').replace(/^\//, '')])) };
    await context.close();
  }

  /* ---- B gates, at 1440 ---- */
  const wide = VIEWPORTS[0];
  const mapping = plateMapping(wide.width, wide.height);
  const bandFor = (ysTop, ysBottom, xsLeft, xsRight) => ({
    y0: Math.max(0, Math.round(mapping.rowToY(ysTop))),
    y1: Math.min(wide.height, Math.round(mapping.rowToY(ysBottom))),
    x0: Math.max(0, Math.round(mapping.colToX(xsLeft))),
    x1: Math.min(wide.width, Math.round(mapping.colToX(xsRight))),
  });
  // Foreground tread: the two lowest risers, source rows 400..433. Stopping at 433
  // keeps the polished floor (a far nearer plane, and the depth map's largest
  // discontinuity) out of the patch; 400 gives the patch enough height to match.
  const foregroundBand = bandFor(400, 433, 320, 1360);
  // Back wall: the parapet, source rows 104..142, across its own width.
  const backWallBand = bandFor(104, 142, 780, 1165);

  const p0 = join(outputRoot, 'captures', wide.label, 'panel-b-p0.png');
  const p1 = join(outputRoot, 'captures', wide.label, 'panel-b-p100.png');
  const imageA = await grey(p0);
  const imageB = await grey(p1);

  const foreground = bandShift(imageA, imageB, foregroundBand);
  const backWall = bandShift(imageA, imageB, backWallBand);
  const slopeRatio = foreground.slopePerPx && backWall.slopePerPx
    ? Number((Math.abs(foreground.slopePerPx) / Math.abs(backWall.slopePerPx)).toFixed(3))
    : null;
  const meanRatio = foreground.meanAbsShift && backWall.meanAbsShift
    ? Number((foreground.meanAbsShift / backWall.meanAbsShift).toFixed(3))
    : null;

  // Riser crop: source rows 250..400, the middle of the flight.
  const riserCrop = {
    left: Math.round(mapping.colToX(560)),
    top: Math.round(mapping.rowToY(250)),
    width: Math.round(mapping.colToX(1120)) - Math.round(mapping.colToX(560)),
    height: Math.round(mapping.rowToY(400)) - Math.round(mapping.rowToY(250)),
  };
  const riserA = await cropGrey(p0, riserCrop);
  const riserB = await cropGrey(p1, riserCrop);
  const riserSsim = ssim(riserA, riserB);

  /*
   * The literal gate compares a *fixed* crop across a *real camera move*, so the
   * number it returns is dominated by how far the crop's content travelled, not by
   * whether the plate held together. Three more numbers separate the two causes:
   *
   *   dy            the crop's vertical travel, measured by 1-D correlation of its
   *                 row profiles
   *   aligned       SSIM after taking the p = 1 crop from where that content now is
   *   displacement  SSIM of the p = 0 crop against *itself* offset by the same dy —
   *                 i.e. what a perfectly intact plate would score on the fixed crop
   *
   * If `p0VsP1` and `displacementOnly` agree, the fixed-crop score is travel and
   * nothing else. If `aligned` were also low, the plate really had torn.
   */
  const dy = Math.round(bandVerticalShift(imageA, imageB, {
    y0: riserCrop.top,
    y1: riserCrop.top + riserCrop.height,
    x0: riserCrop.left,
    x1: riserCrop.left + riserCrop.width,
  }));
  const alignedB = await cropGrey(p1, { ...riserCrop, top: riserCrop.top + dy });
  const displacedA = await cropGrey(p0, { ...riserCrop, top: riserCrop.top - dy });
  const riserSsimAligned = ssim(riserA, alignedB);
  const riserSsimDisplacementOnly = ssim(riserA, displacedA);
  const shiftedCrop = await cropGrey(p0, { ...riserCrop, left: riserCrop.left + 12 });
  const riserSsimReference = ssim(riserA, shiftedCrop);
  /*
   * What a *perfect* plate scores on this crop for a given vertical travel. The
   * risers are a high-contrast grating with a ~25 px period in the capture, so this
   * curve is the ceiling any camera move can reach on the fixed-crop metric.
   */
  const displacementCeiling = [];
  for (const offset of [1, 2, 3, 5, 9]) {
    const moved = await cropGrey(p0, { ...riserCrop, top: riserCrop.top - offset });
    displacementCeiling.push({ verticalOffsetPx: offset, ssim: ssim(riserA, moved) });
  }

  /*
   * How much of the fixed-crop SSIM loss is the pitch? Re-render p = 1 with the
   * pitch overridden to 0 and 0.15 deg and score the same crop. This is what makes
   * the "SSIM vs a visible camera move" claim a measurement instead of an argument.
   */
  const ssimSensitivity = [];
  {
    const sensitivityContext = await browser.newContext({ viewport: { width: wide.width, height: wide.height }, deviceScaleFactor: 1 });
    const sensitivityPage = await sensitivityContext.newPage();
    for (const pitch of [0, 0.15, 0.35]) {
      await sensitivityPage.goto(`${baseUrl}/lab/stairs?probe=plain&pitch=${pitch}`, { waitUntil: 'load' });
      await pageReady(sensitivityPage);
      await settleAt(sensitivityPage, 'b', 1);
      const file = join(outputRoot, 'captures', wide.label, `panel-b-p100-pitch${String(pitch).replace('.', '')}.png`);
      await sensitivityPage.screenshot({ path: file });
      const variantFull = await grey(file);
      const travel = Math.round(bandVerticalShift(imageA, variantFull, {
        y0: riserCrop.top, y1: riserCrop.top + riserCrop.height, x0: riserCrop.left, x1: riserCrop.left + riserCrop.width,
      }));
      const variant = await cropGrey(file, riserCrop);
      ssimSensitivity.push({ pitchDegrees: pitch, verticalTravelPx: travel, fixedCropSsim: ssim(riserA, variant) });
    }
    await sensitivityContext.close();
  }

  /* ---- holes ---- */
  const holeShots = {};
  const context = await browser.newContext({ viewport: { width: wide.width, height: wide.height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  page.on('pageerror', (error) => consoleErrors.push({ viewport: 'holes', text: `pageerror: ${error.message}` }));
  for (const [key, query] of [['guarded', 'probe=holes'], ['control', 'probe=holes&overscan=1&pitch=8']]) {
    await page.goto(`${baseUrl}/lab/stairs?${query}`, { waitUntil: 'load' });
    await pageReady(page);
    await settleAt(page, 'b', 1);
    const file = join(outputRoot, 'captures', wide.label, `panel-b-holes-${key}.png`);
    await page.screenshot({ path: file });
    holeShots[key] = await magentaFraction(file);
    holeShots[`${key}File`] = file.replace(root, '').replace(/\\/g, '/').replace(/^\//, '');
  }
  await context.close();

  /* ---- 10 s scroll videos ---- */
  for (const viewport of VIEWPORTS) {
    for (const panel of ['a', 'b']) {
      const temporary = join(outputRoot, 'video', `tmp-${panel}-${viewport.label}`);
      mkdirSync(temporary, { recursive: true });
      const videoContext = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        recordVideo: { dir: temporary, size: { width: viewport.width, height: viewport.height } },
      });
      const videoPage = await videoContext.newPage();
      await videoPage.goto(`${baseUrl}/lab/stairs`, { waitUntil: 'load' });
      await pageReady(videoPage);
      await settleAt(videoPage, panel, 0);
      const steps = 100;
      for (let i = 0; i <= steps; i += 1) {
        await videoPage.evaluate(([selector, p]) => {
          const section = document.querySelector(selector);
          const travel = section.offsetHeight - window.innerHeight;
          window.scrollTo({ top: section.offsetTop + travel * p, behavior: 'instant' });
        }, [`[data-stair-panel="${panel}"]`, i / steps]);
        await videoPage.waitForTimeout(100);
      }
      await videoContext.close();
      const produced = readdirSync(temporary).find((name) => name.endsWith('.webm'));
      if (produced) renameSync(join(temporary, produced), join(outputRoot, 'video', `panel-${panel}-${viewport.label}.webm`));
      rmSync(temporary, { recursive: true, force: true });
    }
  }

  await browser.close();

  report.gates = {
    canvasesOnPage: Object.fromEntries(Object.entries(report.viewports).map(([key, value]) => [key, value.surface.canvases])),
    consoleErrors: { count: consoleErrors.length, entries: consoleErrors.slice(0, 20) },
    parallax: {
      foregroundTreadBand: { ...foregroundBand, sourceRows: [400, 433], ...foreground },
      backWallBand: { ...backWallBand, sourceRows: [104, 142], ...backWall },
      slopeRatioForegroundOverBackWall: slopeRatio,
      meanAbsShiftRatio: meanRatio,
      pass: slopeRatio !== null && slopeRatio >= 2,
    },
    riserSsim: {
      crop: riserCrop,
      p0VsP1: riserSsim,
      verticalTravelPx: dy,
      aligned: riserSsimAligned,
      displacementOnly: riserSsimDisplacementOnly,
      referenceP0VsP0Shifted12px: riserSsimReference,
      displacementCeiling,
      pitchSensitivity: ssimSensitivity,
      pass: riserSsim >= 0.85,
      passAligned: riserSsimAligned >= 0.85,
    },
    mapping: verifyMapping(imageA, mapping, [418, 383, 352, 324, 297, 273, 250, 229, 209, 192, 175, 160]),
    holes: {
      guarded: holeShots.guarded,
      control: holeShots.control,
      guardedFile: holeShots.guardedFile,
      controlFile: holeShots.controlFile,
      pass: holeShots.guarded.percent < 0.01,
      controlMoves: holeShots.control.percent > holeShots.guarded.percent,
    },
  };

  writeFileSync(join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.gates, null, 2));
  console.log(JSON.stringify(Object.fromEntries(Object.entries(report.viewports).map(([key, value]) => [key, { surface: value.surface, scrub: value.scrub }])), null, 2));
}

await main();
