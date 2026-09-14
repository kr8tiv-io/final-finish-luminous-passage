import { expect, test } from '@playwright/test';

async function assertNoHorizontalOverflow(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test('foundation heading and caption stay above any visual treatment', async ({ page }) => {
  await page.goto('/#foundation', { waitUntil: 'domcontentloaded' });
  const foundation = page.locator('#foundation');
  await foundation.scrollIntoViewIfNeeded();
  await expect(foundation.getByRole('heading', { name: 'The finish begins below the surface.' })).toBeVisible();
  await expect(foundation.locator('[data-material-lens]')).toBeVisible();
  const layers = await foundation.evaluate((element) => ({
    copy: Number(getComputedStyle(element.querySelector('.chapter-content')!).zIndex),
    feather: Number(getComputedStyle(element, '::after').zIndex),
  }));
  expect(layers.copy).toBeGreaterThan(layers.feather);
  const geometry = await foundation.locator('.chapter-title, [data-material-lens] figcaption').evaluateAll((nodes) => nodes.map((node) => {
    const box = node.getBoundingClientRect();
    return { width: box.width, height: box.height, top: box.top, bottom: box.bottom, display: getComputedStyle(node).display };
  }));
  expect(geometry).toHaveLength(2);
  expect(geometry.filter((item) => item.display !== 'none').every((item) => item.width > 0 && item.height > 0 && item.bottom > item.top)).toBe(true);
  await foundation.screenshot({ path: test.info().outputPath('foundation-readable.png') });
});

test('320px routes use client-width reflow without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  for (const route of ['/', '/contact', '/floor-visualizer']) {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await assertNoHorizontalOverflow(page);
  }
});

test('mobile navigation remains reachable when JavaScript is unavailable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 740 } });
  const page = await context.newPage();
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'Services' })).toBeVisible();
  await expect(navigation.getByRole('link', { name: 'See your floor' })).toHaveAttribute('href', '/floor-visualizer');
  await assertNoHorizontalOverflow(page);
  await context.close();
});
