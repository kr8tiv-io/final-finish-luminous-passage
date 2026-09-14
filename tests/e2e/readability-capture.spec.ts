import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('built reading journey produces review captures and transfer evidence', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toHaveText('A better floor changes the whole space.');
  await page.screenshot({ path: info.outputPath('01-pearl-opening.png') });
  const arrival = await page.evaluate(() => ({
    navigation: performance.getEntriesByType('navigation').map(entry => entry.toJSON()),
    resources: performance.getEntriesByType('resource').map(entry => entry.toJSON()),
  }));
  await info.attach('arrival-transfer.json', { body: JSON.stringify(arrival, null, 2), contentType: 'application/json' });
  await writeFile(info.outputPath('arrival-transfer.json'), JSON.stringify(arrival, null, 2));
  for (const [id, name] of [
    ['#social-title', '02-customer-proof'], ['#foundation-title', '03-preparation'],
    ['#foundation-details', '04-reading-surface'], ['#proof', '05-transformations'],
    ['#consultation-title', '06-consultation'],
  ]) {
    await page.locator(id).scrollIntoViewIfNeeded();
    await expect(page.locator(id)).toBeVisible();
    if (id === '#social-title') {
      await page.locator('.social-heading').evaluate(element => {
        window.scrollTo({ top: element.getBoundingClientRect().top + scrollY - 120, behavior: 'instant' });
      });
      await expect(page.locator('.social-intro')).toHaveCSS('opacity', '1');
      await expect(page.locator('.google-rating')).toHaveCSS('opacity', '1');
      const reviews = page.locator('.review-window');
      if (await reviews.evaluate(element => element.getBoundingClientRect().top < innerHeight)) {
        await expect(reviews).toHaveCSS('opacity', '1');
      }
    }
    if (id === '#proof') {
      const gallery = page.locator('.transformation-gallery');
      await expect(gallery).toHaveClass(/is-hydrated/, { timeout: 15000 });
      const firstButton = page.getByRole('button', { name: 'First featured project', exact: true });
      if (await firstButton.isVisible() && await firstButton.isEnabled()) await firstButton.click();
      await expect(gallery).toHaveAttribute('data-featured-index', '0');
      const first = gallery.locator('[data-featured-panel]').first();
      await first.scrollIntoViewIfNeeded();
      await expect(first).toBeInViewport();
      await expect.poll(() => first.locator('img').evaluateAll(images =>
        images.every(node => {
          const image = node as HTMLImageElement;
          return image.complete && image.naturalWidth > 0;
        }),
      )).toBe(true);
    }
    if (['#foundation-title', '#consultation-title'].includes(id)) {
      await expect(page.locator(id)).toHaveAttribute('data-headline-state', /settled|static/);
    }
    await page.screenshot({ path: info.outputPath(name + '.png') });
  }
  const route = await page.evaluate(() => ({
    resources: performance.getEntriesByType('resource').map(entry => entry.toJSON()),
    pageWidth: document.documentElement.scrollWidth, viewport: document.documentElement.clientWidth,
    videoState: [...document.querySelectorAll('video')].map(video => ({
      src: video.currentSrc, paused: video.paused, preload: video.preload, ready: video.readyState,
    })),
  }));
  await info.attach('route-transfer.json', { body: JSON.stringify(route, null, 2), contentType: 'application/json' });
  await writeFile(info.outputPath('route-transfer.json'), JSON.stringify(route, null, 2));
  expect(route.pageWidth).toBeLessThanOrEqual(route.viewport + 1);
  expect(errors).toEqual([]);
});
