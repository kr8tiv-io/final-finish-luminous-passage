#!/usr/bin/env node
/**
 * scripts/capture-journey.mjs
 *
 * Capture harness for the homepage scroll journey. Attaches to a running dev
 * server (default http://127.0.0.1:4333) or, failing that, starts the BUILT
 * app (node dist/server/entry.mjs on 4334) and waits for /api/health. Then
 * drives Playwright chromium at three viewports, scrolling to every homepage
 * chapter/section id, screenshotting each, recording a 60s smooth-scroll
 * video, and collecting console errors/warnings + failed requests.
 *
 * Usage:
 *   node scripts/capture-journey.mjs --label baseline
 *   node scripts/capture-journey.mjs --label baseline --url http://127.0.0.1:4333
 *   node scripts/capture-journey.mjs --label baseline --built
 *
 * Never kills a server it did not start. Idempotent: re-running with the same
 * --label overwrites that label's output directory contents.
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const DEV_URL_DEFAULT = 'http://127.0.0.1:4333';
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

const VIEWPORTS = [
  {
    label: '390x844',
    context: {
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    },
  },
  {
    label: '768x1024',
    context: {
      viewport: { width: 768, height: 1024 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 2,
    },
  },
  {
    label: '1440x900',
    context: {
      viewport: { width: 1440, height: 900 },
      isMobile: false,
      hasTouch: false,
      deviceScaleFactor: 1,
    },
  },
];

const SCROLL_VIDEO_MS = 60_000;

function parseArgs(argv) {
  const args = { label: null, url: null, built: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--label') args.label = argv[++i];
    else if (arg === '--url') args.url = argv[++i];
    else if (arg === '--built') args.built = true;
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
  console.error(
    'Usage: node scripts/capture-journey.mjs --label <name> [--url http://127.0.0.1:4333] [--built]',
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

async function waitForHealth(baseUrl, timeoutMs = 45_000, intervalMs = 500) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkAlive(baseUrl)) return true;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return false;
}

/**
 * Ensures a server is reachable. Returns { baseUrl, ownedChild } where
 * ownedChild is the child process this script started (or null if it
 * attached to a server it did not start). Callers must only kill
 * ownedChild, never a server they merely attached to.
 */
async function ensureServer({ url, built }) {
  if (!built) {
    const devUrl = url ?? DEV_URL_DEFAULT;
    if (await checkAlive(devUrl)) {
      console.log(`[capture-journey] Attaching to existing server at ${devUrl} (not owned).`);
      return { baseUrl: devUrl, ownedChild: null };
    }
    console.log(`[capture-journey] ${devUrl} did not answer ${HEALTH_PATH}; falling back to the built app on 4334.`);
  }

  if (await checkAlive(BUILT_URL)) {
    console.log(`[capture-journey] Attaching to existing built server at ${BUILT_URL} (not owned).`);
    return { baseUrl: BUILT_URL, ownedChild: null };
  }

  console.log(`[capture-journey] Starting built app: node ${BUILT_ENTRY} on ${BUILT_URL}`);
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
      console.error(`[capture-journey] Built app process exited early with code ${code}.\n${startupLog}`);
    }
  });

  const healthy = await waitForHealth(BUILT_URL);
  if (!healthy) {
    child.kill();
    throw new Error(`Built app on ${BUILT_URL} did not answer ${HEALTH_PATH} within timeout.\n${startupLog}`);
  }
  console.log(`[capture-journey] Built app healthy at ${BUILT_URL}`);
  return { baseUrl: BUILT_URL, ownedChild: child };
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

async function runScreenshotPass(browser, baseUrl, viewport, outDir) {
  const context = await browser.newContext(viewport.context);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);

  const consoleEntries = [];
  const failedRequests = [];
  page.on('console', (msg) => {
    const type = msg.type();
    if (type === 'error' || type === 'warning') {
      consoleEntries.push({ type, text: msg.text() });
    }
  });
  page.on('pageerror', (err) => {
    consoleEntries.push({ type: 'error', text: `pageerror: ${err.message}` });
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({ url: request.url(), failure: request.failure()?.errorText ?? 'unknown' });
  });

  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const chapterIds = await collectChapterIds(page);
  const screenshots = [];
  for (const [index, id] of chapterIds.entries()) {
    await page.evaluate((elId) => {
      document.getElementById(elId)?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, id);
    await page.waitForTimeout(500); // settle: let director/veil/video state catch up
    const fileName = `${String(index).padStart(2, '0')}-${id}.png`;
    const filePath = path.join(outDir, fileName);
    await page.screenshot({ path: filePath });
    screenshots.push(path.relative(ROOT, filePath));
  }

  const tier = await page.evaluate(() => document.documentElement.getAttribute('data-journey-tier'));
  const motion = await page.evaluate(() => document.documentElement.getAttribute('data-journey-motion'));
  const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);

  await context.close();

  return {
    chapterIds,
    screenshots,
    consoleErrorCount: consoleEntries.filter((entry) => entry.type === 'error').length,
    consoleWarningCount: consoleEntries.filter((entry) => entry.type === 'warning').length,
    consoleEntries,
    failedRequests,
    tier,
    motion,
    pageHeight,
  };
}

async function runVideoPass(browser, baseUrl, viewport, outDir) {
  const tmpDir = path.join(outDir, '.tmp-video');
  await mkdir(tmpDir, { recursive: true });
  const context = await browser.newContext({
    ...viewport.context,
    recordVideo: { dir: tmpDir, size: viewport.context.viewport },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(SCROLL_VIDEO_MS + 30_000);
  await page.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await page.waitForTimeout(400);

  await page.evaluate(async (durationMs) => {
    const total = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const start = performance.now();
    await new Promise((resolve) => {
      function step(now) {
        const t = Math.min(1, (now - start) / durationMs);
        window.scrollTo(0, total * t);
        if (t < 1) requestAnimationFrame(step);
        else resolve(undefined);
      }
      requestAnimationFrame(step);
    });
  }, SCROLL_VIDEO_MS);

  const video = page.video();
  await page.close();
  await context.close();

  const finalPath = path.join(outDir, 'scroll-video.webm');
  if (video) {
    await video.saveAs(finalPath);
  }
  await rm(tmpDir, { recursive: true, force: true });
  return video ? path.relative(ROOT, finalPath) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { baseUrl, ownedChild } = await ensureServer(args);

  const captureRoot = path.join(ROOT, 'output', 'captures', args.label);
  await mkdir(captureRoot, { recursive: true });

  const browser = await chromium.launch();
  const results = [];

  try {
    for (const viewport of VIEWPORTS) {
      const outDir = path.join(captureRoot, viewport.label);
      await mkdir(outDir, { recursive: true });
      console.log(`[capture-journey] Viewport ${viewport.label}: screenshots`);
      const screenshotResult = await runScreenshotPass(browser, baseUrl, viewport, outDir);
      console.log(`[capture-journey] Viewport ${viewport.label}: 60s scroll video`);
      const videoPath = await runVideoPass(browser, baseUrl, viewport, outDir);
      results.push({
        viewport: viewport.label,
        ...screenshotResult,
        video: videoPath,
      });
    }
  } finally {
    await browser.close();
    if (ownedChild) {
      console.log('[capture-journey] Stopping the built app process this script started.');
      ownedChild.kill();
    }
  }

  const summary = {
    label: args.label,
    baseUrl,
    generatedAt: new Date().toISOString(),
    viewports: results.map((result) => ({
      viewport: result.viewport,
      chapters: result.chapterIds,
      consoleErrorCount: result.consoleErrorCount,
      consoleWarningCount: result.consoleWarningCount,
      failedRequests: result.failedRequests,
      tier: result.tier,
      motion: result.motion,
      pageHeight: result.pageHeight,
      screenshots: result.screenshots,
      video: result.video,
    })),
  };
  const summaryPath = path.join(captureRoot, 'summary.json');
  await writeFile(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`\n[capture-journey] Summary written to ${path.relative(ROOT, summaryPath)}\n`);
  console.table(
    summary.viewports.map((v) => ({
      viewport: v.viewport,
      chapters: v.chapters.length,
      consoleErrors: v.consoleErrorCount,
      consoleWarnings: v.consoleWarningCount,
      failedRequests: v.failedRequests.length,
      tier: v.tier ?? '(unset)',
      motion: v.motion ?? '(unset)',
      pageHeight: v.pageHeight,
    })),
  );
}

main().catch((err) => {
  console.error('[capture-journey] Failed:', err);
  process.exitCode = 1;
});
