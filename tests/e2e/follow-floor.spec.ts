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
  // Five since Step 22 folded Act 4's two reading asides into the one the copy
  // deck authors — `home.spec` asserts the same count on the enhanced page, and
  // this file had been left on the pre-Step-22 six.
  await expect(page.locator('.chapter-reading')).toHaveCount(5);
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

/**
 * Step 19 replaced the horizontal review pager with the storyboard's rows of cards, so the
 * narrow-screen contract changed shape: the seventeen excerpts are now read by scrolling
 * the page itself, one column wide, with no sideways scroller and no pager buttons to
 * strand a thumb on. The overflow half of this test is unchanged and is the point of it.
 */
test('social proof reads as one column on a narrow screen without sideways scrolling', async ({ page }) => {
  test.slow(); // A 320 px WebKit emulation loads the whole journey well past the 30 s default.
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/#customer-reviews', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.review-card')).toHaveCount(17);
  await expect(page.locator('[data-review-direction]')).toHaveCount(0);
  expect(await page.locator('.review-gallery').evaluate((element) => {
    const style = getComputedStyle(element);
    return { columns: style.gridTemplateColumns.split(' ').length, overflowX: style.overflowX, scrollable: element.scrollWidth > element.clientWidth + 1 };
  })).toEqual({ columns: 1, overflowX: 'visible', scrollable: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
});
