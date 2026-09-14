import { test, expect } from '@playwright/test';

test('first-paint message and contact routes work without enhancement', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A better floor changes the whole space.');
  await expect(page.locator('.hero-content .button-primary')).toBeInViewport();
  await expect(page.locator('.hero-content .lead')).toBeInViewport();
  await expect(page.locator('#customer-reviews')).toHaveClass(/white-stage/);
  await context.close();
});

test('reading surfaces use legible body text and keep full paragraphs off cinematic imagery', async ({ page }) => {
  await page.goto('/');
  const panels = page.locator('.chapter-reading');
  await expect(panels).toHaveCount(6);
  for (const panel of await panels.all()) {
    const styles = await panel.locator('p').first().evaluate(el => ({
      size: parseFloat(getComputedStyle(el).fontSize), opacity: getComputedStyle(el).opacity,
    }));
    expect(styles.size).toBeGreaterThanOrEqual(16);
    expect(styles.opacity).toBe('1');
  }
  const navSize = await page.locator('[data-primary-navigation] a').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
  expect(navSize).toBeGreaterThanOrEqual(14);
});

test('320px reflow leaves essential text and menu inside the page', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator('h1')).toHaveText('A better floor changes the whole space.');
  const width = await page.evaluate(() => ({ page: document.documentElement.scrollWidth, available: document.documentElement.clientWidth }));
  expect(width.page).toBeLessThanOrEqual(width.available + 1);
  const title = await page.locator('h1').boundingBox();
  expect(title!.x).toBeGreaterThanOrEqual(0);
  expect(title!.x + title!.width).toBeLessThanOrEqual(320);
  await expect(page.getByRole('button', { name: /menu/i })).toBeVisible();
});

test('phone navigation stays useful without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Primary navigation', exact: true }).getByRole('link', { name: 'Services', exact: true })).toBeVisible();
  await context.close();
});

test('Save-Data keeps the cinematic canvas and discretionary films unloaded', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
  });
  const requests: string[] = [];
  page.on('request', request => requests.push(request.url()));
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toHaveText('A better floor changes the whole space.');
  await expect(page.locator('.film-veil')).toHaveAttribute('data-film-veil', 'still');
  await expect(page.locator('.film-veil canvas')).toHaveCount(0);
  expect(requests.filter(url => /\/FilmVeil(?:\.|-)[^/]*(?:tsx|js)(?:\?|$)/.test(url))).toEqual([]);
  expect(requests.filter(url => /\.mp4(?:\?|$)/.test(url))).toEqual([]);
});

test('unavailable WebGL leaves the first-paint poster and contact action usable', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
      if (/^webgl|experimental-webgl/.test(kind)) return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('.film-veil canvas')).toHaveCount(0);
  await expect(page.locator('.hero-content .button-primary')).toBeInViewport();
  await expect(page.locator('h1')).toHaveText('A better floor changes the whole space.');
  const firstPoster = page.locator('#portico .pour-poster');
  await expect(firstPoster).toBeVisible();
  expect(await firstPoster.evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

test('native video posters do not bypass the responsive image loading policy', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.journey video[poster]')).toHaveCount(0);
  await expect(page.locator('.pour-stage > .pour-poster')).toHaveAttribute('loading', 'eager');
  for (const poster of await page.locator('.floor-film > .floor-film-poster').all()) {
    await expect(poster).toHaveAttribute('loading', 'lazy');
  }
});

test('inactive cinematic media stays offscreen instead of defeating lazy loading', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  const media = page.locator('#commercial .floor-film');
  await expect(media).toHaveCSS('position', 'absolute');
  const geometry = await media.boundingBox();
  expect(geometry!.y).toBeGreaterThan(page.viewportSize()!.height);
});
