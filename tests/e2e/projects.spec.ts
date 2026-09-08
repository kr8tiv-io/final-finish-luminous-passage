import { expect, test } from '@playwright/test';

test.describe('real project transformations', () => {
  test('publishes six curated same-angle comparisons with responsive sources', async ({ page }) => {
    await page.goto('/projects');

    const comparisons = page.locator('[data-project-comparison]');
    await expect(comparisons).toHaveCount(6);
    await expect(page.locator('[data-project-comparison] source[type="image/avif"]')).toHaveCount(12);
    await expect(page.locator('[data-project-comparison] source[type="image/webp"]')).toHaveCount(24);
    await expect(page.locator('[data-project-comparison] img')).toHaveCount(12);
    await expect(comparisons.first().locator('picture').first().locator('source').first()).toHaveAttribute('srcset', /\/thumbnails\//);
    await expect(comparisons.first().locator('picture').first().locator('source').first()).toHaveAttribute('media', '(max-width: 767px)');
    await expect(comparisons.first().locator('picture').first().locator('source').nth(1)).toHaveAttribute('media', '(min-width: 768px)');
    await expect(page.getByText('Pairing review', { exact: true }).first()).toBeVisible();
  });

  test('supports keyboard comparison and pointer reveal without hiding the native range', async ({ page }) => {
    await page.goto('/projects');

    const first = page.locator('[data-project-comparison]').first();
    const slider = first.getByRole('slider');
    await expect(slider).toHaveValue('50');
    await slider.focus();
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue('51');

    await first.scrollIntoViewIfNeeded();
    const box = await first.locator('[data-comparison-stage]').boundingBox();
    if (!box) throw new Error('comparison stage has no layout box');
    await page.mouse.move(box.x + box.width * 0.82, box.y + box.height * 0.5);
    await expect(slider).toHaveValue(/8[01-3]/);
  });

  test('brings a real transformation into the homepage proof arcade', async ({ page }) => {
    await page.goto('/');
    const featured = page.locator('[data-featured-project-comparison]');
    await expect(featured).toBeVisible();
    await expect(featured.getByRole('slider')).toHaveAccessibleName(/Reveal the finished floor/i);
  });
});
