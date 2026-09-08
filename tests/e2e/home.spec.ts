import { expect, test } from '@playwright/test';

test.describe('Final Finish homepage', () => {
  test('states the Edmonton value proposition and exposes both lead paths', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Final Finish Epoxy.*Edmonton/i);
    await expect(page.getByRole('heading', { level: 1, name: 'Epoxy floors, finished properly.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Visualize your floor' }).first()).toHaveAttribute('href', '/floor-visualizer');
    await expect(page.getByRole('link', { name: 'Request a quote' }).first()).toHaveAttribute('href', '/contact#quote');
    await expect(page.getByRole('link', { name: /Call Denis/i }).first()).toHaveAttribute('href', 'tel:+17809911651');
  });

  test('opens and closes the keyboard-accessible mobile primary menu', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /primary menu/i });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.focus();
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Services' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  test('keeps all five architectural chapters available as semantic content', async ({ page }) => {
    await page.goto('/');

    const chapters = page.locator('[data-journey-chapter]');
    await expect(chapters).toHaveCount(8);
    await expect(page.getByRole('heading', { name: 'The finish begins below the surface.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Real floors. Revealed honestly.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bring us the floor you have.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Five stars on Google. The work holds up in person.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Read reviews' })).toHaveAttribute('href', /google\.com\/maps/);
    await expect(page.getByRole('link', { name: 'Write a review' })).toHaveAttribute('href', /writereview/);
  });

  test('ships a real high-priority architectural first frame and social preview', async ({ page }) => {
    await page.goto('/');

    const firstFrame = page.getByRole('img', { name: /luminous architectural passage/i });
    await expect(firstFrame).toBeVisible();
    await expect(firstFrame).toHaveAttribute('fetchpriority', 'high');
    await expect(firstFrame).toHaveAttribute('width', '1680');
    await expect(page.locator('.hero-frame source[type="image/avif"]')).toHaveAttribute('srcset', '/images/brand/luminous-passage-keyframe.avif');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://staging.example.com/images/brand/final-finish-epoxy-og.jpg');
  });

  test('does not mount the homepage 3D passage', async ({ page }) => {
    const heavyRequests: string[] = [];
    page.on('request', (request) => {
      if (/LuminousPassageScene|\.glb(?:\?|$)/.test(request.url())) heavyRequests.push(request.url());
    });
    await page.goto('/');

    await expect(page.locator('.passage-host')).toHaveCount(0);
    await expect(page.locator('.film-veil')).toHaveCount(1);
    await expect(page.locator('.hero-frame')).toBeVisible();
    expect(heavyRequests).toEqual([]);
  });

  test('carries three optimized cinematic plates through the later rooms', async ({ page }) => {
    await page.goto('/');

    const chapterFrames = page.locator('picture[data-chapter-frame]');
    await expect(chapterFrames).toHaveCount(3);
    await expect(chapterFrames.locator('source[type="image/avif"]')).toHaveCount(3);
    await expect(page.locator('img[src="/images/brand/foundation-chamber.jpg"]')).toHaveAttribute('loading', 'lazy');
  });

  test('keeps heavy 3D and oversized proof images off the critical path', async ({ page }) => {
    const heavyRequests: string[] = [];
    page.on('request', (request) => {
      if (/LuminousPassageScene|\.glb(?:\?|$)/.test(request.url())) heavyRequests.push(request.url());
    });

    await page.goto('/');
    await page.waitForTimeout(750);

    expect(heavyRequests).toEqual([]);
    await expect(page.locator('[data-featured-project-comparison] picture').first().locator('source').first()).toHaveAttribute('srcset', /\/thumbnails\//);
  });

  test('enhances the scroll journey after preserving the static first paint', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('data-journey-motion', 'enhanced', { timeout: 8_000 });
    const skipVeil = await page.evaluate(
      () => window.matchMedia('(pointer: coarse)').matches || window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    );
    await expect(page.locator('.film-veil canvas')).toHaveCount(skipVeil ? 0 : 1);
    const spine = page.locator('.journey-draw-path');
    if (await spine.isVisible()) {
      await expect(spine).toHaveAttribute('d', /M12 4 C13\.2 50/);
      await expect(page.locator('.journey-draw-stations path')).toHaveCount(8);
    }
  });

  test('opens on a local scroll-scrubbed epoxy pour film', async ({ page }) => {
    await page.goto('/');

    const film = page.locator('video.pour-film');
    await expect(page.locator('.pour-stage')).toBeVisible();
    await expect(film).toHaveAttribute('muted', '');
    await expect(film).toHaveAttribute('playsinline', '');
    await expect(film.locator('source')).toHaveAttribute('src', '/videos/epoxy-pour.mp4');
    await expect(film.locator('source')).toHaveAttribute('type', 'video/mp4');
    await expect(page.locator('.pour-poster')).toHaveAttribute('src', '/images/brand/epoxy-pour-poster.jpg');
  });

  test('carries scroll-scrubbed epoxy films through the later rooms', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('.floor-film')).toHaveCount(6);
    await expect(page.locator('.floor-film-poster[src="/images/brand/epoxy-walkway-poster.jpg"]')).toHaveCount(1);
    await expect(page.locator('.floor-film-poster[src="/images/brand/epoxy-garage-poster.jpg"]')).toHaveCount(1);
    await expect(page.locator('.floor-film-video source[src="/videos/epoxy-walkway.mp4"]')).toHaveCount(1);
    await expect(page.locator('.floor-film-video source[src="/videos/epoxy-garage.mp4"]')).toHaveCount(1);
    await expect(page.locator('.floor-film-video source[src="/videos/epoxy-mancave.mp4"]')).toHaveCount(1);
    await expect(page.locator('.floor-film-video source[src="/videos/epoxy-finish.mp4"]')).toHaveCount(1);
    await expect(page.locator('.floor-film-video source[src="/videos/epoxy-consultation.mp4"]')).toHaveCount(1);
  });
});
