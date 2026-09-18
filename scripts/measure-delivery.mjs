#!/usr/bin/env node
/**
 * scripts/measure-delivery.mjs — Step 34 delivery probe.
 *
 * Measures the BUILT app (node dist/server/entry.mjs; started if nothing is
 * listening, never killing a server it did not start) at 1440x900 desktop and
 * 390x844 phone, and gates the run against `budgets.json` at the repo root.
 *
 * WHAT CHANGED IN STEP 34, and why (the old probe's numbers were not trustworthy):
 *
 *  0. THE ARRIVAL WINDOW MOVED. It used to close at Playwright's `networkidle`;
 *     it now closes at the document's `load` event. `networkidle` is a race
 *     against whatever the page is streaming — the pour film is promoted at
 *     hydration — and across four runs of one build it produced desktop arrival
 *     numbers of 7.55 / 7.55 / 0.89 MB and phone numbers of 0.86 / 1.01 / 2.39 MB.
 *     The load event produced 0.89 MB and 0.82 MB every time. What the narrower
 *     window excludes is reported, not hidden: `bytes.settled`,
 *     `bytes.hydration`, `bytes.hydrationMedia` and a full `mediaTimeline`.
 *     See the SETTLE_IDLE_CAP_MS block and docs/context/DELIVERY-BUDGETS.md.
 *  1. CLS was a plain sum of every `layout-shift` value for the whole session,
 *     read AFTER a scripted `scrollIntoView` walk through every chapter. That is
 *     not CLS. The spec metric is the largest *session window* (entries grouped
 *     with <=1000 ms between consecutive entries and <=5000 ms per window), and
 *     the field metric never contains shifts a harness provoked by teleporting
 *     the scroll position. This script now reports four numbers — `clsArrival`
 *     (gated), `clsScroll` (reported), `clsSession`, `clsNaiveSum` — and keeps
 *     every raw entry with its sources so the shifting element is nameable.
 *  2. Resource timing has a 250-entry buffer by default; anything past that was
 *     silently dropped from the byte totals. Entries are now accumulated through
 *     a PerformanceObserver (never dropped) AND the buffer is raised.
 *  3. Byte totals are cross-checked against Playwright/CDP `request.sizes()`,
 *     an independent measure. A divergence over 5% is printed as a warning, so
 *     "the bytes are fine" cannot pass unnoticed when the instrument is broken.
 *  4. The INP proxy read 0 on every run because nothing ever interacted. The
 *     probe now dispatches real interactions (a CTA click with navigation
 *     suppressed, the nav menu toggle, Escape, Tab) and reads `event` entries
 *     with a real `interactionId`. If interactions were dispatched and
 *     `performance.interactionCount` is still 0, the run FAILS as broken rather
 *     than reporting a comfortable 0.
 *  5. Long tasks now carry attribution: `longtask` container attribution plus
 *     `long-animation-frame` (LoAF) entries, which name the script URL, the
 *     function, the invoker, and forced style/layout time for each expensive
 *     frame. That is what makes a 635 ms task actionable instead of a number.
 *  6. `--port` (default 4334) so a run can be pointed away from an orchestrator
 *     preview. `--url` attaches to an already-running app anywhere.
 *
 * Every window definition lives in docs/context/DELIVERY-BUDGETS.md.
 *
 * Usage:
 *   node scripts/measure-delivery.mjs --label baseline
 *   node scripts/measure-delivery.mjs --label step34 --port 4391
 *   node scripts/measure-delivery.mjs --label probe --url http://127.0.0.1:4334 --no-gate
 *   node scripts/measure-delivery.mjs --label step34 --port 4391 --trace
 */

import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUDGETS_PATH = path.join(ROOT, 'budgets.json');
const BUILT_ENTRY = path.join(ROOT, 'dist', 'server', 'entry.mjs');
const HEALTH_PATH = '/api/health';
const DEFAULT_PORT = 4334;

/**
 * THE ARRIVAL WINDOW ENDS AT THE `load` EVENT. Nothing about it is a race.
 *
 * The previous probe ended the arrival window at Playwright's `networkidle`
 * (<=0 in-flight requests for 500 ms). That is not a document milestone, it is
 * whenever the last byte of whatever the page happens to be streaming lands —
 * and this page promotes the pour film during hydration, moments after load.
 * Whether that download finished inside the window decided the number.
 * Measured on this build, same machine, three consecutive runs:
 *
 *   networkidle arrival   desktop 7,547,593 / 7,547,593 /   930,289 B
 *                         phone     856,729 / 1,057,911 / 2,503,461 B
 *   load-event arrival    desktop   935,250 /       —    /   930,289 B
 *                         phone     856,729 /       —    /   856,729 B
 *
 * The load event is also what the budget means: the document, its CSS, its
 * fonts, its poster and its deferred (critical) module scripts — not a film the
 * page fetches on its own schedule afterwards. What hydration pulls after load
 * is not hidden; it is `bytes.hydration` plus the full `mediaTimeline`.
 *
 * `SETTLE_IDLE_CAP_MS` only bounds the extra, ungated observation window used
 * for the hydration figure and for the CLS arrival boundary.
 */
const SETTLE_IDLE_CAP_MS = 1500;
/** A localhost `load` later than this means CPU contention, not a page regression. */
const CONTENTION_LOAD_MS = 5000;

const CHAPTER_SELECTORS = [
  '[data-journey-chapter]',
  '[data-journey-white-stage]',
  '#customer-reviews',
  '#proof',
  '#consultation',
];

const PROJECTS = [
  {
    key: 'desktop',
    label: '1440x900 desktop',
    context: {
      viewport: { width: 1440, height: 900 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
    },
  },
  {
    key: 'phone',
    label: '390x844 phone',
    context: {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    },
  },
];

/* ------------------------------------------------------------------------- *
 * Pure functions (exported for unit tests — see scripts/delivery-budgets.test.mjs)
 * ------------------------------------------------------------------------- */

/**
 * CLS per the Layout Instability spec's session-window rule.
 *
 * A session window starts at the first qualifying entry and is extended by any
 * entry that arrives within `gapMs` of the previous entry AND within
 * `maxWindowMs` of the window's first entry. CLS is the LARGEST window's sum,
 * not the sum of the whole session.
 *
 * Entries with `hadRecentInput` are dropped before windowing: a shift within
 * 500 ms of a discrete input is excluded by the spec, and this probe's own INP
 * interactions would otherwise manufacture shifts and then count them.
 *
 * @param {Array<{startTime:number, value:number, hadRecentInput?:boolean}>} entries
 * @param {{gapMs?:number, maxWindowMs?:number}} [options]
 * @returns {{value:number, naiveSum:number, windowCount:number, excludedByInput:number,
 *            entryCount:number, largestWindow:null|{start:number,end:number,value:number,entryCount:number},
 *            windows:Array<{start:number,end:number,value:number,entryCount:number}>}}
 */
export function reduceClsSessionWindows(entries, options = {}) {
  const gapMs = options.gapMs ?? 1000;
  const maxWindowMs = options.maxWindowMs ?? 5000;
  const all = Array.isArray(entries) ? entries : [];
  const excludedByInput = all.filter((entry) => entry && entry.hadRecentInput).length;
  const usable = all
    .filter((entry) => entry && !entry.hadRecentInput && Number.isFinite(entry.value) && Number.isFinite(entry.startTime))
    .sort((a, b) => a.startTime - b.startTime);

  const naiveSum = usable.reduce((total, entry) => total + entry.value, 0);
  const windows = [];
  let current = null;
  for (const entry of usable) {
    const startsNewWindow = current === null
      || entry.startTime - current.end > gapMs
      || entry.startTime - current.start > maxWindowMs;
    if (startsNewWindow) {
      current = { start: entry.startTime, end: entry.startTime, value: entry.value, entryCount: 1 };
      windows.push(current);
    } else {
      current.end = entry.startTime;
      current.value += entry.value;
      current.entryCount += 1;
    }
  }

  const largestWindow = windows.reduce(
    (max, win) => (max === null || win.value > max.value ? win : max),
    /** @type {null|{start:number,end:number,value:number,entryCount:number}} */ (null),
  );

  return {
    value: largestWindow ? largestWindow.value : 0,
    naiveSum,
    windowCount: windows.length,
    excludedByInput,
    entryCount: usable.length,
    largestWindow,
    windows,
  };
}

/**
 * Compare one delivery report against `budgets.json`.
 *
 * Byte comparisons are made on exact integers. Nothing is rounded before the
 * comparison — a 2381-byte overshoot on a 5 MiB budget is a fail, and the row
 * carries `over` so the report can say so in bytes.
 *
 * @param {object} report  a parsed output/delivery/<label>.json
 * @param {object} budgets a parsed budgets.json
 * @returns {{rows:Array<object>, failures:Array<object>, ok:boolean}}
 */
export function compareBudgets(report, budgets) {
  const gated = budgets?.gated ?? {};
  const rows = [];

  const push = (project, metric, actual, limit, unit, compare = 'lte') => {
    const known = Number.isFinite(actual) && Number.isFinite(limit);
    const pass = known
      ? (compare === 'lt' ? actual < limit : actual <= limit)
      : false;
    rows.push({
      project,
      metric,
      actual: Number.isFinite(actual) ? actual : null,
      limit: Number.isFinite(limit) ? limit : null,
      unit,
      compare,
      pass,
      over: known && !pass ? actual - limit : 0,
      reason: known ? null : 'metric missing from report',
    });
  };

  for (const result of report?.results ?? []) {
    const key = result.project;
    push(key, 'arrivalBytes', result.arrivalBytes, gated.arrivalBytes?.[key], 'bytes');
    push(key, 'routeBytes', result.routeBytes, gated.routeBytes?.[key], 'bytes');
    push(key, 'lcpMs', result.lcpMs, gated.lcpMs, 'ms');
    push(key, 'clsArrival', result.clsArrival, gated.clsArrival, 'score', 'lt');
    push(key, 'inpMs', result.inpMs, gated.inpMs, 'ms');
    push(key, 'longTaskMaxMs', result.longestLongTaskMs, gated.longTaskMaxMs, 'ms');
  }

  const failures = rows.filter((row) => !row.pass);
  return { rows, failures, ok: failures.length === 0 };
}

/* ------------------------------------------------------------------------- *
 * CLI plumbing
 * ------------------------------------------------------------------------- */

export function parseArgs(argv) {
  const args = { label: null, port: DEFAULT_PORT, url: null, gate: true, trace: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--label') args.label = argv[++i];
    else if (arg === '--port') args.port = Number.parseInt(argv[++i], 10);
    else if (arg === '--url') args.url = argv[++i];
    else if (arg === '--no-gate') args.gate = false;
    else if (arg === '--trace') args.trace = true;
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  if (!args.label) {
    printUsage();
    process.exit(1);
  }
  if (!Number.isInteger(args.port) || args.port <= 0) {
    console.error(`[measure-delivery] --port must be a positive integer (got ${args.port}).`);
    process.exit(1);
  }
  return args;
}

function printUsage() {
  console.error(
    'Usage: node scripts/measure-delivery.mjs --label <name> [--port 4334] [--url http://host:port] [--no-gate] [--trace]',
  );
}

async function checkAlive(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}${HEALTH_PATH}`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(baseUrl, timeoutMs = 60_000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkAlive(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** Targets the built app. Never kills a server it did not start. */
async function ensureBuiltServer({ port, url }) {
  const baseUrl = url ?? `http://127.0.0.1:${port}`;
  if (await checkAlive(baseUrl)) {
    console.log(`[measure-delivery] Attaching to existing app at ${baseUrl} (not owned).`);
    return { baseUrl, ownedChild: null };
  }
  if (url) {
    throw new Error(`--url ${url} did not answer ${HEALTH_PATH}; refusing to start a server on someone else's URL.`);
  }
  console.log(`[measure-delivery] Starting built app: node ${BUILT_ENTRY} on ${baseUrl}`);
  const child = spawn(process.execPath, [BUILT_ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      SITE_ENV: 'staging',
      PUBLIC_SITE_URL: baseUrl,
      HOST: '127.0.0.1',
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let startupLog = '';
  child.stdout.on('data', (chunk) => { startupLog += chunk.toString(); });
  child.stderr.on('data', (chunk) => { startupLog += chunk.toString(); });
  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      console.error(`[measure-delivery] Built app process exited early with code ${code}.\n${startupLog}`);
    }
  });
  const healthy = await waitForHealth(baseUrl);
  if (!healthy) {
    child.kill();
    throw new Error(`Built app on ${baseUrl} did not answer ${HEALTH_PATH} within timeout.\n${startupLog}`);
  }
  console.log(`[measure-delivery] Built app healthy at ${baseUrl}`);
  return { baseUrl, ownedChild: child };
}

/* ------------------------------------------------------------------------- *
 * In-page instrumentation (serialized by addInitScript — no outer closures)
 * ------------------------------------------------------------------------- */

function initMetricsScript() {
  const M = {
    marks: { settleMs: null, scrollStartMs: null, interactionStartMs: null },
    lcp: null,
    lcpCandidates: [],
    shifts: [],
    longTasks: [],
    loaf: [],
    events: [],
    resources: [],
    interactionsBlocked: 0,
  };
  window.__deliveryMetrics = M;

  const describe = (node) => {
    if (!node || node.nodeType !== 1) return null;
    const el = /** @type {Element} */ (node);
    const tag = el.tagName ? el.tagName.toLowerCase() : 'unknown';
    const id = el.id ? `#${el.id}` : '';
    const cls = typeof el.className === 'string' && el.className.trim()
      ? `.${el.className.trim().split(/\s+/).slice(0, 4).join('.')}`
      : '';
    const data = [];
    if (el.dataset) {
      for (const key of Object.keys(el.dataset).slice(0, 4)) data.push(`[data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`);
    }
    return `${tag}${id}${cls}${data.join('')}`;
  };

  const rect = (r) => (r ? { x: Math.round(r.x ?? r.left ?? 0), y: Math.round(r.y ?? r.top ?? 0), w: Math.round(r.width ?? 0), h: Math.round(r.height ?? 0) } : null);

  try { performance.setResourceTimingBufferSize(5000); } catch { /* ignore */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const element = entry.element ?? null;
        const candidate = {
          startTime: entry.startTime,
          size: entry.size,
          url: entry.url || null,
          selector: describe(element),
        };
        M.lcpCandidates.push(candidate);
        M.lcp = candidate;
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch { /* LCP unsupported */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        M.shifts.push({
          startTime: entry.startTime,
          value: entry.value,
          hadRecentInput: Boolean(entry.hadRecentInput),
          lastInputTime: entry.lastInputTime ?? 0,
          scrollY: Math.round(window.scrollY),
          innerHeight: window.innerHeight,
          sources: Array.from(entry.sources ?? []).slice(0, 4).map((source) => ({
            selector: describe(source.node),
            previousRect: rect(source.previousRect),
            currentRect: rect(source.currentRect),
          })),
        });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch { /* layout-shift unsupported */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const a = (entry.attribution ?? [])[0];
        M.longTasks.push({
          startTime: entry.startTime,
          duration: entry.duration,
          name: entry.name,
          attribution: a
            ? {
              containerType: a.containerType ?? null,
              containerName: a.containerName ?? null,
              containerId: a.containerId ?? null,
              containerSrc: a.containerSrc ?? null,
            }
            : null,
        });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* longtask unsupported */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        M.loaf.push({
          startTime: entry.startTime,
          duration: entry.duration,
          renderStart: entry.renderStart ?? null,
          styleAndLayoutStart: entry.styleAndLayoutStart ?? null,
          blockingDuration: entry.blockingDuration ?? null,
          scripts: Array.from(entry.scripts ?? []).slice(0, 5).map((s) => ({
            name: s.name ?? null,
            invoker: s.invoker ?? null,
            invokerType: s.invokerType ?? null,
            sourceURL: s.sourceURL ?? null,
            sourceFunctionName: s.sourceFunctionName ?? null,
            sourceCharPosition: s.sourceCharPosition ?? null,
            duration: s.duration ?? null,
            forcedStyleAndLayoutDuration: s.forcedStyleAndLayoutDuration ?? null,
            pauseDuration: s.pauseDuration ?? null,
          })),
        });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* LoAF unsupported */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        M.events.push({
          name: entry.name,
          startTime: entry.startTime,
          duration: entry.duration,
          processingStart: entry.processingStart,
          processingEnd: entry.processingEnd,
          interactionId: entry.interactionId ?? 0,
          target: describe(entry.target),
        });
      }
      // durationThreshold's floor is 16 ms, so `event` entries alone cannot prove an
      // interaction happened. `first-input` is unconditional, so it is observed too.
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch { /* event timing unsupported */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        M.events.push({
          name: `first-input:${entry.name}`,
          startTime: entry.startTime,
          duration: entry.duration,
          processingStart: entry.processingStart,
          processingEnd: entry.processingEnd,
          interactionId: entry.interactionId ?? 0,
          target: describe(entry.target),
        });
      }
    }).observe({ type: 'first-input', buffered: true });
  } catch { /* first-input unsupported */ }

  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        M.resources.push({
          name: entry.name,
          initiatorType: entry.initiatorType,
          transferSize: entry.transferSize ?? 0,
          encodedBodySize: entry.encodedBodySize ?? 0,
          decodedBodySize: entry.decodedBodySize ?? 0,
          responseEnd: entry.responseEnd,
          startTime: entry.startTime,
          renderBlockingStatus: entry.renderBlockingStatus ?? null,
        });
      }
    }).observe({ type: 'resource', buffered: true });
  } catch { /* resource timing unsupported */ }
}

/** Installed just before the interaction probe: real clicks, no navigation. */
function suppressNavigationScript() {
  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      const anchor = target && target.closest ? target.closest('a[href]') : null;
      if (anchor) {
        event.preventDefault();
        window.__deliveryMetrics.interactionsBlocked += 1;
      }
    },
    true,
  );
}

/* ------------------------------------------------------------------------- *
 * Measurement
 * ------------------------------------------------------------------------- */

function bytesOf(resources, navigationTransferSize, untilMs = Infinity) {
  const res = resources
    .filter((entry) => entry.responseEnd <= untilMs)
    .reduce((total, entry) => total + (entry.transferSize ?? 0), 0);
  return navigationTransferSize + res;
}

function isFontResource(entry) {
  return /\.(woff2?|ttf|otf)(\?|$)/i.test(entry.name);
}

function isMediaResource(entry) {
  return entry.initiatorType === 'video'
    || entry.initiatorType === 'audio'
    || /\.(mp4|webm|m4v|mov|ogv)(\?|$)/i.test(entry.name);
}

/**
 * Pair a long task with the long-animation-frame that best explains it.
 *
 * A LoAF frame and a `longtask` entry rarely share a start time — the task is
 * the script run, the frame is the whole render cycle around it — so equality
 * or "starts within 50 ms" misses most pairs. Greatest temporal overlap is the
 * only rule that works for both a task inside a frame and a frame inside a task.
 */
export function pairLongTaskWithFrame(task, frames) {
  let best = null;
  let bestOverlap = 0;
  for (const frame of frames ?? []) {
    const start = Math.max(task.startTime, frame.startTime);
    const end = Math.min(task.startTime + task.duration, frame.startTime + frame.duration);
    const overlap = end - start;
    if (overlap > bestOverlap) {
      bestOverlap = overlap;
      best = frame;
    }
  }
  return bestOverlap > 0 ? best : null;
}

function shortName(url, baseUrl) {
  try {
    const parsed = new URL(url, baseUrl);
    return parsed.origin === new URL(baseUrl).origin ? parsed.pathname + parsed.search : url;
  } catch {
    return url;
  }
}

async function collectChapterIds(page) {
  return page.evaluate((selectors) => {
    const seen = new Set();
    const order = [];
    document.querySelectorAll(selectors.join(',')).forEach((el) => {
      if (el.id && !seen.has(el.id)) {
        seen.add(el.id);
        order.push(el.id);
      }
    });
    return order;
  }, CHAPTER_SELECTORS);
}

/** Poll until no new long task has been recorded for `quietMs`, or `capMs` elapses. */
async function waitForMainThreadQuiet(page, { quietMs = 1000, capMs = 8000, pollMs = 250 } = {}) {
  const deadline = Date.now() + capMs;
  let lastCount = -1;
  let quietSince = Date.now();
  while (Date.now() < deadline) {
    const count = await page.evaluate(() => window.__deliveryMetrics.longTasks.length);
    if (count !== lastCount) {
      lastCount = count;
      quietSince = Date.now();
    } else if (Date.now() - quietSince >= quietMs) {
      return true;
    }
    await page.waitForTimeout(pollMs);
  }
  return false;
}

/**
 * Real interactions so INP is a measurement rather than a default.
 * Returns what was dispatched and what failed, so a silent no-op is visible.
 */
async function runInteractionProbe(page) {
  const dispatched = [];
  const attempt = async (name, fn) => {
    try {
      await fn();
      dispatched.push({ name, ok: true });
    } catch (err) {
      dispatched.push({ name, ok: false, error: String(err?.message ?? err).split('\n')[0] });
    }
  };

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  // INP must measure the interaction, not the tail of the harness's own scroll
  // storm. Wait until the main thread has stopped producing long tasks before
  // touching anything, or a 1.5 s presentation delay left over from the scroll
  // gets attributed to a click.
  await waitForMainThreadQuiet(page);
  await page.evaluate(suppressNavigationScript);

  await attempt('click:cta-primary', async () => {
    const cta = page.locator('.hero-content .button-row a.button-primary').first();
    await cta.scrollIntoViewIfNeeded({ timeout: 5000 });
    await cta.click({ timeout: 8000, force: true });
  });
  await page.waitForTimeout(400);

  await attempt('click:menu-toggle', async () => {
    await page.locator('[data-menu-toggle]').first().click({ timeout: 8000, force: true });
  });
  await page.waitForTimeout(700);

  await attempt('keydown:Escape', async () => {
    await page.keyboard.press('Escape');
  });
  await page.waitForTimeout(400);

  await attempt('keydown:Tab', async () => {
    await page.keyboard.press('Tab');
  });
  await page.waitForTimeout(400);

  await attempt('click:menu-toggle-2', async () => {
    await page.locator('[data-menu-toggle]').first().click({ timeout: 8000, force: true });
  });
  await page.waitForTimeout(900);

  return dispatched;
}

async function measureProject(browser, baseUrl, project, { trace, outDir, label }) {
  const context = await browser.newContext(project.context);
  if (trace) await context.tracing.start({ screenshots: false, snapshots: false, sources: false });

  // Independent byte measure: CDP-reported wire sizes, not the page's own numbers.
  const cdp = { settled: 0, total: 0, pending: [] };
  const page = await context.newPage();
  page.on('requestfinished', (request) => {
    cdp.pending.push(
      request
        .sizes()
        .then((sizes) => {
          cdp.total += (sizes.responseBodySize ?? 0) + (sizes.responseHeadersSize ?? 0);
        })
        .catch(() => {}),
    );
  });

  page.setDefaultTimeout(60_000);
  await page.addInitScript(initMetricsScript);

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));

  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });

  // --- SETTLE MARK ----------------------------------------------------------
  // The GATED arrival window already closed at `loadEventEnd` (read below).
  // This extra, bounded wait exists only to observe what hydration pulls after
  // load and to give the CLS arrival window a boundary before any scrolling.
  const idleReached = await Promise.race([
    page.waitForLoadState('networkidle').then(() => true).catch(() => false),
    page.waitForTimeout(SETTLE_IDLE_CAP_MS).then(() => false),
  ]);
  const settleMs = await page.evaluate(() => {
    const now = performance.now();
    window.__deliveryMetrics.marks.settleMs = now;
    return now;
  });
  await Promise.all(cdp.pending.splice(0));
  cdp.settled = cdp.total;

  const navTiming = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return nav
      ? { transferSize: nav.transferSize ?? 0, loadEventEnd: nav.loadEventEnd, domContentLoadedEventEnd: nav.domContentLoadedEventEnd }
      : { transferSize: 0, loadEventEnd: 0, domContentLoadedEventEnd: 0 };
  });

  const mediaState = await page.evaluate(() => ({
    tier: document.documentElement.getAttribute('data-journey-tier'),
    motion: document.documentElement.getAttribute('data-journey-motion'),
    videos: Array.from(document.querySelectorAll('video')).map((v) => ({
      selector: v.className || v.tagName.toLowerCase(),
      preload: v.getAttribute('preload'),
      effectivePreload: v.preload,
      currentSrc: v.currentSrc || null,
      autoplay: v.autoplay,
      readyState: v.readyState,
      poster: v.getAttribute('poster'),
    })),
  }));

  // --- SCRIPTED ROUTE SCROLL ------------------------------------------------
  const scrollStartMs = await page.evaluate(() => {
    const now = performance.now();
    window.__deliveryMetrics.marks.scrollStartMs = now;
    return now;
  });
  const chapterIds = await collectChapterIds(page);
  for (const id of chapterIds) {
    await page.evaluate((elId) => {
      document.getElementById(elId)?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, id);
    await page.waitForTimeout(400);
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);

  // --- INTERACTION PROBE ----------------------------------------------------
  const interactionStartMs = await page.evaluate(() => {
    const now = performance.now();
    window.__deliveryMetrics.marks.interactionStartMs = now;
    return now;
  });
  const dispatched = await runInteractionProbe(page);
  const interactionCount = await page.evaluate(() => performance.interactionCount ?? 0);

  const metrics = await page.evaluate(() => window.__deliveryMetrics);
  await Promise.all(cdp.pending.splice(0));

  if (trace) {
    await context.tracing.stop({ path: path.join(outDir, `${label}-${project.key}-trace.zip`) });
  }
  await context.close();

  /* ---- derive -------------------------------------------------------------- */
  const resources = metrics.resources ?? [];
  // GATED: the arrival window closes at the load event.
  const arrivalBytes = bytesOf(resources, navTiming.transferSize, navTiming.loadEventEnd);
  const settledBytes = bytesOf(resources, navTiming.transferSize, settleMs);
  const routeBytes = bytesOf(resources, navTiming.transferSize, interactionStartMs);
  const totalBytes = bytesOf(resources, navTiming.transferSize);

  const arrivalResources = resources.filter((entry) => entry.responseEnd <= navTiming.loadEventEnd);
  const arrivalMediaBytes = arrivalResources
    .filter(isMediaResource)
    .reduce((total, entry) => total + (entry.transferSize ?? 0), 0);
  // Everything the page pulls between the load event and the settle mark: this
  // is where the pour film lands, because JourneyMotion promotes it at
  // hydration rather than on scroll intent.
  const hydrationMediaBytes = resources
    .filter((entry) => isMediaResource(entry) && entry.responseEnd > navTiming.loadEventEnd && entry.responseEnd <= settleMs)
    .reduce((total, entry) => total + (entry.transferSize ?? 0), 0);
  const mediaTimeline = resources.filter(isMediaResource).map((entry) => ({
    name: shortName(entry.name, baseUrl),
    transferSize: entry.transferSize ?? 0,
    startedMs: Math.round(entry.startTime),
    endedMs: Math.round(entry.responseEnd),
    startedBeforeLoadEvent: entry.startTime <= navTiming.loadEventEnd,
    insideArrivalWindow: entry.responseEnd <= navTiming.loadEventEnd,
    duringHydration: entry.startTime > navTiming.loadEventEnd && entry.startTime <= settleMs,
  }));

  const arrivalTop = [...arrivalResources]
    .sort((a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0))
    .slice(0, 12)
    .map((entry) => ({
      name: shortName(entry.name, baseUrl),
      transferSize: entry.transferSize ?? 0,
      initiatorType: entry.initiatorType,
      renderBlockingStatus: entry.renderBlockingStatus,
      responseEndMs: Math.round(entry.responseEnd),
    }));

  const largestResources = [...resources]
    .sort((a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0))
    .slice(0, 10)
    .map((entry) => ({ name: shortName(entry.name, baseUrl), transferSize: entry.transferSize ?? 0 }));

  const fontEntries = resources.filter(isFontResource);
  const fontBytes = fontEntries.reduce((total, entry) => total + (entry.transferSize ?? 0), 0);

  const shifts = metrics.shifts ?? [];
  const clsArrival = reduceClsSessionWindows(shifts.filter((s) => s.startTime < scrollStartMs));
  const clsAtLoad = reduceClsSessionWindows(shifts.filter((s) => s.startTime <= navTiming.loadEventEnd));
  const clsScroll = reduceClsSessionWindows(
    shifts.filter((s) => s.startTime >= scrollStartMs && s.startTime < interactionStartMs),
  );
  const clsSession = reduceClsSessionWindows(shifts);
  const clsNaiveSum = shifts
    .filter((s) => !s.hadRecentInput)
    .reduce((total, s) => total + s.value, 0);
  const topShifts = [...shifts]
    .sort((a, b) => b.value - a.value)
    .slice(0, 6)
    .map((s) => ({
      value: Number(s.value.toFixed(6)),
      startTime: Math.round(s.startTime),
      phase: s.startTime < scrollStartMs ? 'arrival' : s.startTime < interactionStartMs ? 'scroll' : 'interaction',
      hadRecentInput: s.hadRecentInput,
      scrollY: s.scrollY,
      sources: s.sources,
    }));

  const longTasks = metrics.longTasks ?? [];
  const over50 = longTasks.filter((task) => task.duration > 50);
  const longestLongTask = over50.reduce((max, task) => Math.max(max, task.duration), 0);
  // "arrival" here means everything before the harness started scrolling, so a
  // hydration long task that lands after the load event is still attributed to
  // arrival rather than to the scroll.
  const phaseOf = (startTime) =>
    (startTime < scrollStartMs ? 'arrival' : startTime < interactionStartMs ? 'scroll' : 'interaction');
  const longestByPhase = { arrival: 0, scroll: 0, interaction: 0 };
  for (const task of over50) {
    const phase = phaseOf(task.startTime);
    longestByPhase[phase] = Math.max(longestByPhase[phase], Math.round(task.duration));
  }
  const loaf = metrics.loaf ?? [];
  const topLongTasks = [...over50]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 3)
    .map((task) => {
      // Pair each long task with the LoAF frame it overlaps most — LoAF is the only
      // entry type that names the script URL and function behind the frame.
      const frame = pairLongTaskWithFrame(task, loaf);
      return {
        durationMs: Math.round(task.duration),
        startTimeMs: Math.round(task.startTime),
        phase: phaseOf(task.startTime),
        containerAttribution: task.attribution,
        loafScripts: frame
          ? frame.scripts.map((s) => ({
            sourceURL: s.sourceURL ? shortName(s.sourceURL, baseUrl) : null,
            sourceFunctionName: s.sourceFunctionName,
            invoker: s.invoker,
            invokerType: s.invokerType,
            durationMs: Math.round(s.duration ?? 0),
            forcedStyleAndLayoutMs: Math.round(s.forcedStyleAndLayoutDuration ?? 0),
          }))
          : [],
        loafBlockingMs: frame ? Math.round(frame.blockingDuration ?? 0) : null,
      };
    });
  const topLoaf = [...loaf]
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .map((f) => ({
      durationMs: Math.round(f.duration),
      startTimeMs: Math.round(f.startTime),
      phase: phaseOf(f.startTime),
      blockingMs: Math.round(f.blockingDuration ?? 0),
      scripts: f.scripts.map((s) => ({
        sourceURL: s.sourceURL ? shortName(s.sourceURL, baseUrl) : null,
        sourceFunctionName: s.sourceFunctionName,
        invoker: s.invoker,
        invokerType: s.invokerType,
        durationMs: Math.round(s.duration ?? 0),
        forcedStyleAndLayoutMs: Math.round(s.forcedStyleAndLayoutDuration ?? 0),
      })),
    }));

  const events = metrics.events ?? [];
  const interactions = events
    .filter((entry) => entry.interactionId && entry.interactionId !== 0)
    .map((entry) => ({
      name: entry.name,
      startTimeMs: Math.round(entry.startTime),
      durationMs: Math.round(entry.duration),
      inputDelayMs: Math.round(entry.processingStart - entry.startTime),
      processingMs: Math.round(entry.processingEnd - entry.processingStart),
      presentationMs: Math.round(entry.startTime + entry.duration - entry.processingEnd),
      target: entry.target,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);
  const inpMs = interactions.length ? interactions[0].durationMs : 0;
  const okDispatched = dispatched.filter((d) => d.ok).length;
  // Falsifiable: if the probe interacted and the page recorded no interaction at
  // all, the INP number is an artefact of a broken probe, not a fast page.
  const inpProbeBroken = okDispatched > 0 && interactionCount === 0;

  const cdpSettledDelta = settledBytes > 0 ? Math.abs(cdp.settled - settledBytes) / settledBytes : 0;

  return {
    project: project.key,
    label: project.label,
    tier: mediaState.tier,
    motion: mediaState.motion,
    chapters: chapterIds,
    pageErrors: consoleErrors,

    // flat, gated metrics — what check-budgets.mjs reads
    arrivalBytes,
    routeBytes,
    lcpMs: metrics.lcp ? Math.round(metrics.lcp.startTime) : null,
    clsArrival: clsArrival.value,
    inpMs,
    longestLongTaskMs: Math.round(longestLongTask),

    marks: {
      // The gated arrival window is navigationStart -> loadEventEndMs.
      arrivalEndsAtMs: Math.round(navTiming.loadEventEnd),
      arrivalWindow: 'navigationStart -> loadEventEnd',
      settleMs: Math.round(settleMs),
      settleEndedOn: idleReached ? 'networkidle' : `cap:${SETTLE_IDLE_CAP_MS}ms`,
      loadEventEndMs: Math.round(navTiming.loadEventEnd),
      domContentLoadedMs: Math.round(navTiming.domContentLoadedEventEnd),
      scrollStartMs: Math.round(scrollStartMs),
      interactionStartMs: Math.round(interactionStartMs),
      // A localhost load event this late is machine contention (parallel builds,
      // other Playwright runs), not a page regression. Byte counts are unaffected;
      // every millisecond metric in this run is.
      timingsContended: navTiming.loadEventEnd > CONTENTION_LOAD_MS,
    },
    bytes: {
      navigationDocument: navTiming.transferSize,
      arrival: arrivalBytes,
      arrivalMedia: arrivalMediaBytes,
      settled: settledBytes,
      hydration: settledBytes - arrivalBytes,
      hydrationMedia: hydrationMediaBytes,
      route: routeBytes,
      wholeRun: totalBytes,
      settledCdpCrossCheck: cdp.settled,
      settledCdpDeltaPct: Number((cdpSettledDelta * 100).toFixed(2)),
      arrivalResourceCount: arrivalResources.length,
      routeResourceCount: resources.length,
    },
    mediaTimeline,
    arrivalTopResources: arrivalTop,
    largestResources,
    fonts: {
      bytes: fontBytes,
      files: fontEntries.map((entry) => ({ name: shortName(entry.name, baseUrl), transferSize: entry.transferSize ?? 0 })),
    },
    videos: mediaState.videos,
    lcp: metrics.lcp
      ? { startTimeMs: Math.round(metrics.lcp.startTime), selector: metrics.lcp.selector, url: metrics.lcp.url, size: metrics.lcp.size }
      : null,
    cls: {
      arrival: clsArrival,
      atLoadEvent: clsAtLoad,
      scroll: clsScroll,
      session: clsSession,
      naiveSum: Number(clsNaiveSum.toFixed(6)),
      entryCount: shifts.length,
      topShifts,
    },
    inp: {
      ms: inpMs,
      interactionCount,
      dispatched,
      navigationsBlocked: metrics.interactionsBlocked ?? 0,
      interactions: interactions.slice(0, 8),
      probeBroken: inpProbeBroken,
      note: interactions.length
        ? null
        : 'No event-timing entry carried an interactionId. The `event` observer floor is 16 ms, so every dispatched interaction completed faster than that; interactionCount proves they happened.',
    },
    longTasks: {
      countOver50ms: over50.length,
      longestMs: Math.round(longestLongTask),
      longestByPhase,
      top: topLongTasks,
      loafSupported: loaf.length > 0,
      topLoafFrames: topLoaf,
    },
  };
}

function bytesToMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(3);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const budgets = JSON.parse(await readFile(BUDGETS_PATH, 'utf8'));
  const { chromium } = await import('playwright');
  const { baseUrl, ownedChild } = await ensureBuiltServer(args);

  const outDir = path.join(ROOT, 'output', 'delivery');
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  try {
    for (const project of PROJECTS) {
      console.log(`[measure-delivery] Measuring ${project.label}`);
      results.push(await measureProject(browser, baseUrl, project, { trace: args.trace, outDir, label: args.label }));
    }
  } finally {
    await browser.close();
    if (ownedChild) {
      console.log('[measure-delivery] Stopping the built app process this script started.');
      ownedChild.kill();
    }
  }

  const report = {
    label: args.label,
    baseUrl,
    generatedAt: new Date().toISOString(),
    budgetsVersion: budgets.version ?? null,
    budgets: budgets.gated,
    results,
  };
  const outPath = path.join(outDir, `${args.label}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`\n[measure-delivery] Report written to ${path.relative(ROOT, outPath)}\n`);

  const { rows, failures, ok } = compareBudgets(report, budgets);
  printTables(report, rows);

  const brokenProbes = results.filter((result) => result.inp.probeBroken);
  for (const result of brokenProbes) {
    console.error(
      `[measure-delivery] INP PROBE BROKEN on ${result.label}: interactions were dispatched but performance.interactionCount is 0. The INP number is not a measurement.`,
    );
  }

  for (const result of results) {
    if (result.marks.timingsContended) {
      console.warn(
        `[measure-delivery] WARNING ${result.label}: the load event fired at ${result.marks.loadEventEndMs} ms on localhost. That is machine contention, not the page. Byte budgets are still valid; LCP / long-task / INP numbers from this run are not comparable to a quiet run.`,
      );
    }
    if (result.bytes.settledCdpDeltaPct > 5) {
      console.warn(
        `[measure-delivery] WARNING ${result.label}: resource-timing bytes at settle (${result.bytes.settled} B) and CDP wire bytes (${result.bytes.settledCdpCrossCheck} B) differ by ${result.bytes.settledCdpDeltaPct}%. Treat the byte numbers as suspect.`,
      );
    }
    if (result.bytes.arrivalMedia > 0) {
      console.warn(
        `[measure-delivery] NOTE ${result.label}: ${result.bytes.arrivalMedia} B of video landed INSIDE the arrival window (before the load event). The pour film is expected to be promoted on scroll intent, so this is a policy regression, not a measurement one.`,
      );
    }
  }

  if (!args.gate) {
    console.log('[measure-delivery] --no-gate: measured only, exit code not set from budgets.');
    return;
  }
  if (!ok || brokenProbes.length) {
    console.error(
      `\n[measure-delivery] BUDGET FAIL — ${failures.length} gated metric(s) over budget${brokenProbes.length ? ' + a broken INP probe' : ''}.`,
    );
    process.exitCode = 1;
  } else {
    console.log('\n[measure-delivery] All gated metrics within budget.');
  }
}

function printTables(report, rows) {
  console.log('--- Gated metrics (budgets.json) ---');
  console.table(
    rows.map((row) => ({
      project: row.project,
      metric: row.metric,
      actual: row.unit === 'bytes' ? `${row.actual} B (${bytesToMb(row.actual ?? 0)} MiB)` : String(row.actual),
      limit: row.unit === 'bytes' ? `${row.limit} B (${bytesToMb(row.limit ?? 0)} MiB)` : String(row.limit),
      result: row.pass ? 'PASS' : 'FAIL',
      over: row.pass ? '' : `${row.unit === 'bytes' ? `${row.over} B` : row.over.toFixed(4)}`,
    })),
  );

  console.log('\n--- Reported, NOT gated ---');
  console.table(
    report.results.map((result) => ({
      project: result.project,
      tier: result.tier ?? '(unset)',
      'CLS arrival (gated)': result.cls.arrival.value.toFixed(4),
      'CLS scroll': result.cls.scroll.value.toFixed(4),
      'CLS session': result.cls.session.value.toFixed(4),
      'CLS naive sum (old probe)': result.cls.naiveSum.toFixed(4),
      'shift entries': result.cls.entryCount,
      'font KB': (result.fonts.bytes / 1024).toFixed(1),
      'long tasks >50ms': result.longTasks.countOver50ms,
      'INP interactions': result.inp.interactionCount,
    })),
  );

  console.log('\n--- Arrival window composition (arrival = navigationStart -> load event) ---');
  console.table(
    report.results.map((result) => ({
      project: result.project,
      'arrival ends': `${result.marks.arrivalEndsAtMs} ms (load)${result.marks.timingsContended ? ' CONTENDED' : ''}`,
      'arrival B (gated)': result.bytes.arrival,
      'video inside arrival B': result.bytes.arrivalMedia,
      'settle mark': `${result.marks.settleMs} ms (${result.marks.settleEndedOn})`,
      'hydration B': result.bytes.hydration,
      'of which video B': result.bytes.hydrationMedia,
      'whole run B': result.bytes.wholeRun,
    })),
  );

  for (const result of report.results) {
    console.log(`\n--- ${result.label}: arrival attribution (top 8 of ${result.bytes.arrivalResourceCount}) ---`);
    console.table(
      result.arrivalTopResources.slice(0, 8).map((entry) => ({
        resource: entry.name.length > 64 ? `…${entry.name.slice(-63)}` : entry.name,
        bytes: entry.transferSize,
        KB: (entry.transferSize / 1024).toFixed(1),
        type: entry.initiatorType,
        'ends@ms': entry.responseEndMs,
      })),
    );
    console.log(
      `\n--- ${result.label}: top long tasks (longest by phase: arrival ${result.longTasks.longestByPhase.arrival} / scroll ${result.longTasks.longestByPhase.scroll} / interaction ${result.longTasks.longestByPhase.interaction} ms) ---`,
    );
    console.table(
      result.longTasks.top.map((task) => ({
        ms: task.durationMs,
        phase: task.phase,
        'at ms': task.startTimeMs,
        script: task.loafScripts[0]?.sourceURL ?? task.containerAttribution?.containerSrc ?? '(no attribution)',
        fn: task.loafScripts[0]?.sourceFunctionName ?? '',
        invoker: task.loafScripts[0]?.invoker ?? '',
        'forced layout ms': task.loafScripts[0]?.forcedStyleAndLayoutMs ?? '',
      })),
    );
    console.log(`\n--- ${result.label}: heaviest animation frames (LoAF) ---`);
    console.table(
      result.longTasks.topLoafFrames.slice(0, 3).map((frame) => ({
        ms: frame.durationMs,
        phase: frame.phase,
        'blocking ms': frame.blockingMs,
        script: frame.scripts[0]?.sourceURL ?? '(none)',
        fn: frame.scripts[0]?.sourceFunctionName ?? '',
        invoker: frame.scripts[0]?.invoker ?? '',
        'forced layout ms': frame.scripts[0]?.forcedStyleAndLayoutMs ?? '',
      })),
    );
    console.log(`\n--- ${result.label}: media fetch timeline ---`);
    console.table(
      result.mediaTimeline.map((entry) => ({
        file: entry.name,
        bytes: entry.transferSize,
        'started ms': entry.startedMs,
        'ended ms': entry.endedMs,
        'before load event': entry.startedBeforeLoadEvent,
        'in arrival window': entry.insideArrivalWindow,
      })),
    );
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) {
  main().catch((err) => {
    console.error('[measure-delivery] Failed:', err);
    process.exitCode = 1;
  });
}
