#!/usr/bin/env node
/**
 * scripts/measure-delivery.mjs
 *
 * Delivery/perf measurement against the BUILT app (node dist/server/entry.mjs
 * on 4334; started if not already listening — never kills a server it did
 * not start). For desktop (1440x900) and phone (390x844) it records:
 *   - arrival transfer bytes (all responses until networkidle after first paint)
 *   - full-route transfer bytes after a scripted scroll through all chapters
 *   - LCP element selector + time, CLS sum (hadRecentInput=false),
 *     an INP proxy (max PerformanceObserver('event') duration),
 *     long tasks > 50ms (count + longest), largest 10 resources by bytes,
 *     and total font bytes
 * via page.addInitScript + buffered PerformanceObserver entries.
 *
 * Writes output/delivery/<label>.json and prints a pass/fail table against
 * the Step 34 thresholds:
 *   phone arrival <= 0.8 MB, desktop arrival <= 5 MB,
 *   route <= 12 MB (phone) / 18 MB (desktop) [assumption; plan says "12/18 MB"
 *   without stating which viewport maps to which figure — this script assumes
 *   the larger figure applies to desktop, whose 1080p pour/finish-hall films
 *   are heavier over a full scroll route. Documented in docs/context/DEV-CONTRACT.md.],
 *   LCP <= 2.5s, CLS < .02, INP proxy <= 200ms, no long task > 200ms.
 *
 * Usage:
 *   node scripts/measure-delivery.mjs --label baseline
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const BUILT_URL = 'http://127.0.0.1:4334';
const BUILT_ENTRY = path.join(ROOT, 'dist', 'server', 'entry.mjs');
const HEALTH_PATH = '/api/health';

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

const THRESHOLDS = {
  arrivalBytes: { desktop: 5 * 1024 * 1024, phone: 0.8 * 1024 * 1024 },
  routeBytes: { desktop: 18 * 1024 * 1024, phone: 12 * 1024 * 1024 },
  lcpMs: 2500,
  cls: 0.02,
  inpMs: 200,
  longTaskMaxMs: 200,
};

function parseArgs(argv) {
  const args = { label: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--label') args.label = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    }
  }
  if (!args.label) {
    printUsage();
    process.exit(1);
  }
  return args;
}

function printUsage() {
  console.error('Usage: node scripts/measure-delivery.mjs --label <name>');
}

async function checkAlive(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}${HEALTH_PATH}`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForHealth(baseUrl, timeoutMs = 45_000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkAlive(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/** Always targets the built app on 4334. Never kills a server it did not start. */
async function ensureBuiltServer() {
  if (await checkAlive(BUILT_URL)) {
    console.log(`[measure-delivery] Attaching to existing built server at ${BUILT_URL} (not owned).`);
    return { baseUrl: BUILT_URL, ownedChild: null };
  }
  console.log(`[measure-delivery] Starting built app: node ${BUILT_ENTRY} on ${BUILT_URL}`);
  const child = spawn(process.execPath, [BUILT_ENTRY], {
    cwd: ROOT,
    env: {
      ...process.env,
      SITE_ENV: 'staging',
      PUBLIC_SITE_URL: BUILT_URL,
      HOST: '127.0.0.1',
      PORT: '4334',
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
  const healthy = await waitForHealth(BUILT_URL);
  if (!healthy) {
    child.kill();
    throw new Error(`Built app on ${BUILT_URL} did not answer ${HEALTH_PATH} within timeout.\n${startupLog}`);
  }
  console.log(`[measure-delivery] Built app healthy at ${BUILT_URL}`);
  return { baseUrl: BUILT_URL, ownedChild: child };
}

function initMetricsScript() {
  window.__deliveryMetrics = { lcp: null, cls: 0, longTasks: [], maxEventDuration: 0 };
  try {
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1];
      if (last) {
        const element = last.element ?? null;
        window.__deliveryMetrics.lcp = {
          startTime: last.startTime,
          size: last.size,
          selector: element
            ? element.id
              ? `#${element.id}`
              : `${element.tagName?.toLowerCase() ?? 'unknown'}${element.className ? '.' + String(element.className).trim().split(/\s+/).join('.') : ''}`
            : null,
        };
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  } catch {
    /* LCP unsupported */
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__deliveryMetrics.cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  } catch {
    /* CLS unsupported */
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__deliveryMetrics.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    /* longtask unsupported */
  }
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > window.__deliveryMetrics.maxEventDuration) {
          window.__deliveryMetrics.maxEventDuration = entry.duration;
        }
      }
    }).observe({ type: 'event', buffered: true, durationThreshold: 16 });
  } catch {
    /* event timing unsupported */
  }
}

function sumResourceEntries(resources, navigation) {
  const nav = navigation?.[0]?.transferSize ?? 0;
  const res = resources.reduce((total, entry) => total + (entry.transferSize ?? 0), 0);
  return nav + res;
}

function isFontResource(entry) {
  return /\.(woff2?|ttf|otf)(\?|$)/i.test(entry.name);
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

async function measureProject(browser, baseUrl, project) {
  const context = await browser.newContext(project.context);
  const page = await context.newPage();
  page.setDefaultTimeout(45_000);
  await page.addInitScript(initMetricsScript);

  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);

  const arrivalPerf = await page.evaluate(() => ({
    navigation: performance.getEntriesByType('navigation').map((e) => e.toJSON()),
    resources: performance.getEntriesByType('resource').map((e) => e.toJSON()),
  }));
  const arrivalBytes = sumResourceEntries(arrivalPerf.resources, arrivalPerf.navigation);

  const chapterIds = await collectChapterIds(page);
  for (const id of chapterIds) {
    await page.evaluate((elId) => {
      document.getElementById(elId)?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, id);
    await page.waitForTimeout(400);
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(300);

  const routePerf = await page.evaluate(() => ({
    navigation: performance.getEntriesByType('navigation').map((e) => e.toJSON()),
    resources: performance.getEntriesByType('resource').map((e) => e.toJSON()),
  }));
  const routeBytes = sumResourceEntries(routePerf.resources, routePerf.navigation);

  const metrics = await page.evaluate(() => window.__deliveryMetrics);

  const sortedResources = [...routePerf.resources].sort(
    (a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0),
  );
  const largestResources = sortedResources.slice(0, 10).map((entry) => ({
    name: entry.name,
    transferSize: entry.transferSize ?? 0,
  }));
  const fontBytes = routePerf.resources
    .filter(isFontResource)
    .reduce((total, entry) => total + (entry.transferSize ?? 0), 0);

  const longTasksOver50 = (metrics?.longTasks ?? []).filter((task) => task.duration > 50);
  const longestLongTask = longTasksOver50.reduce(
    (max, task) => (task.duration > max ? task.duration : max),
    0,
  );

  await context.close();

  return {
    project: project.key,
    label: project.label,
    chapters: chapterIds,
    arrivalBytes,
    routeBytes,
    lcp: metrics?.lcp ?? null,
    cls: metrics?.cls ?? 0,
    inpProxyMs: metrics?.maxEventDuration ?? 0,
    longTasks: {
      countOver50ms: longTasksOver50.length,
      longestMs: longestLongTask,
    },
    largestResources,
    fontBytes,
  };
}

function evaluatePass(result) {
  const arrivalThreshold = THRESHOLDS.arrivalBytes[result.project];
  const routeThreshold = THRESHOLDS.routeBytes[result.project];
  const lcpMs = result.lcp?.startTime ?? Infinity;
  return {
    arrival: result.arrivalBytes <= arrivalThreshold,
    route: result.routeBytes <= routeThreshold,
    lcp: lcpMs <= THRESHOLDS.lcpMs,
    cls: result.cls < THRESHOLDS.cls,
    inp: result.inpProxyMs <= THRESHOLDS.inpMs,
    longTask: result.longTasks.longestMs <= THRESHOLDS.longTaskMaxMs,
  };
}

function bytesToMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(2);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { baseUrl, ownedChild } = await ensureBuiltServer();

  const outDir = path.join(ROOT, 'output', 'delivery');
  await mkdir(outDir, { recursive: true });

  const browser = await chromium.launch();
  const results = [];
  try {
    for (const project of PROJECTS) {
      console.log(`[measure-delivery] Measuring ${project.label}`);
      results.push(await measureProject(browser, baseUrl, project));
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
    thresholds: THRESHOLDS,
    results: results.map((result) => ({ ...result, pass: evaluatePass(result) })),
  };
  const outPath = path.join(outDir, `${args.label}.json`);
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`\n[measure-delivery] Report written to ${path.relative(ROOT, outPath)}\n`);

  console.table(
    report.results.map((result) => {
      const pass = result.pass;
      const flag = (ok) => (ok ? 'PASS' : 'FAIL');
      return {
        project: result.label,
        'arrival MB': `${bytesToMb(result.arrivalBytes)} ${flag(pass.arrival)}`,
        'route MB': `${bytesToMb(result.routeBytes)} ${flag(pass.route)}`,
        'LCP ms': `${Math.round(result.lcp?.startTime ?? -1)} ${flag(pass.lcp)}`,
        CLS: `${result.cls.toFixed(4)} ${flag(pass.cls)}`,
        'INP proxy ms': `${Math.round(result.inpProxyMs)} ${flag(pass.inp)}`,
        'longest long task ms': `${Math.round(result.longTasks.longestMs)} ${flag(pass.longTask)}`,
      };
    }),
  );
}

main().catch((err) => {
  console.error('[measure-delivery] Failed:', err);
  process.exitCode = 1;
});
