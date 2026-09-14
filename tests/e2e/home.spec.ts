import { expect, test } from '@playwright/test';

test.describe('Final Finish homepage', () => {
  test('states the current value proposition and preserves both lead paths', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Final Finish Epoxy.*Edmonton/i);
    await expect(page.getByRole('heading', { level: 1, name: 'A better floor changes the whole space.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try your floor', exact: true })).toHaveAttribute('href', '/floor-visualizer');
    await expect(page.getByRole('link', { name: 'Request a quote', exact: true }).first()).toHaveAttribute('href', '/contact#quote');
    await expect(page.getByRole('link', { name: /Call Denis/i }).first()).toHaveAttribute('href', 'tel:+17809911651');
  });

  test('keeps the first paint semantic while motion enhancement remains optional', async ({ page, browser }) => {
    const staticContext = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await staticContext.newPage();
    await staticPage.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(staticPage.getByRole('heading', { level: 1, name: 'A better floor changes the whole space.' })).toBeVisible();
    await expect(staticPage.getByRole('link', { name: 'Request a quote', exact: true }).first()).toHaveAttribute('href', '/contact#quote');
    await staticContext.close();

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-journey-motion', 'enhanced', { timeout: 8_000 });
    await expect(page.locator('.journey-motion-control')).toBeVisible();
  });

  test('uses the responsive local pour assets rather than a 3D hero', async ({ page }) => {
    const heavyRequests: string[] = [];
    page.on('request', (request) => {
      if (/LuminousPassageScene|\.glb(?:\?|$)/.test(request.url())) heavyRequests.push(request.url());
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const film = page.locator('.pour-film');
    await expect(page.locator('.pour-stage')).toBeVisible();
    await expect(page.locator('.pour-poster')).toHaveAttribute('fetchpriority', 'high');
    await expect(page.locator('.pour-poster')).toHaveAttribute('src', /follow-floor\/720\/epoxy-pour-pearl-poster/);
    await expect(film).toHaveAttribute('muted', '');
    await expect(film).toHaveAttribute('playsinline', '');
    await expect(film.locator('source')).toHaveCount(2);
    await expect(page.locator('.passage-host')).toHaveCount(0);
    expect(heavyRequests).toEqual([]);
  });

  test('keeps each chapter narrative in six readable white panels', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const readings = page.locator('.chapter-reading');
    await expect(readings).toHaveCount(6);
    expect(await readings.evaluateAll((nodes) => nodes.every((node) => node.hasAttribute('data-journey-white-stage')))).toBe(true);
    await expect(page.getByRole('heading', { name: 'The finish begins below the surface.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Let’s talk about your space.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tell us about your project' })).toHaveAttribute('href', '/contact#quote');
  });

  test('opens and closes the keyboard-accessible mobile primary menu', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const toggle = page.getByRole('button', { name: /primary menu/i });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.focus();
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Services' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
