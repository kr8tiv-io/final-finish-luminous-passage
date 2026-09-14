import { expect, test } from '@playwright/test';

test('motion enhancement does not erase the first-paint heading or lead paths', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const title = page.getByRole('heading', { level: 1, name: 'A better floor changes the whole space.' });
  await expect(title).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-journey-motion', 'enhanced', { timeout: 8_000 });
  await expect(title).toBeVisible();
  await expect(page.getByRole('link', { name: 'Request a quote', exact: true }).first()).toBeVisible();
});

test('reduced motion leaves the full local-service narrative available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-journey-motion', 'still');
  await expect(page.getByRole('button', { name: 'Reduced motion is on', exact: true })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Reclaim your garage or basement.' })).toBeAttached();
  await expect(page.locator('.chapter-reading')).toHaveCount(6);
  expect(await page.evaluate(() => [...document.querySelectorAll('video')].every((video) => video.paused))).toBe(true);
});

test('the consultation chapter is one poster composition with both next steps', async ({ page }) => {
  await page.goto('/#consultation', { waitUntil: 'domcontentloaded' });
  const consultation = page.locator('#consultation');
  await expect(consultation.locator('.chapter-frame')).toHaveCount(0);
  await expect(consultation.locator('.floor-film-poster')).toHaveCount(1);
  await expect(consultation.locator('video')).toHaveCount(0);
  await expect(consultation.getByRole('link', { name: 'Preview a finish' })).toHaveAttribute('href', '/floor-visualizer');
  await expect(consultation.getByRole('link', { name: 'Request a quote' })).toHaveAttribute('href', '/contact#quote');
});

test('social proof remains scrollable and does not create narrow-screen overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#customer-reviews', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.review-card')).toHaveCount(17);
  const next = page.getByRole('button', { name: 'Next customer review', exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await expect.poll(() => page.locator('.review-gallery').evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
