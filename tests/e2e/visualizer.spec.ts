import { expect, test } from '@playwright/test';
import path from 'node:path';

const roomPhoto = path.resolve('public/images/projects/generated/webp/img_3199.webp');

test.describe('floor visualizer', () => {
  test('presents 30 inspirations and describes its private manual workflow', async ({ page }) => {
    await page.goto('/floor-visualizer', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: 'Your space. A new surface.' })).toBeVisible();
    await expect(page.getByLabel('Upload a room or garage photo')).toHaveAttribute('accept', /image\/jpeg,image\/png,image\/webp/);
    await expect(page.getByRole('button', { name: /Finish:/i })).toHaveCount(30);
    await expect(page.getByText(/Manual mode keeps the photo on this device/i)).toBeVisible();
    await expect(page.getByText(/Visualization for design inspiration/i)).toBeVisible();
  });

  test('changes a selected finish before a photo is added', async ({ page }) => {
    await page.goto('/floor-visualizer', { waitUntil: 'domcontentloaded' });
    const choice = page.getByRole('button', { name: 'Finish: Blue Orbit' });
    await choice.click();
    await expect(choice).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.selected-finish').getByRole('heading', { name: 'Blue Orbit' })).toBeVisible();
  });

  test('keeps a valid room photo and manual geometry local while the AI gate is off', async ({ page }) => {
    const posts: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST') posts.push(request.url());
    });
    await page.goto('/floor-visualizer', { waitUntil: 'domcontentloaded' });
    const upload = page.getByLabel('Upload a room or garage photo');
    await expect(upload).toBeEnabled({ timeout: 20_000 });
    await upload.setInputFiles(roomPhoto);
    await expect(page.getByRole('img', { name: 'Your uploaded room preview' })).toBeVisible();
    await expect(page.getByRole('slider', { name: /Floor corner/ })).toHaveCount(4);
    const corner = page.getByRole('slider', { name: 'Floor corner 1' });
    const before = await page.locator('.finish-plane').getAttribute('style');
    await corner.press('ArrowRight');
    await expect(page.locator('.finish-plane')).not.toHaveAttribute('style', before ?? '');
    const compare = page.getByRole('slider', { name: 'Compare original photo with finish preview' });
    await compare.press('Home');
    await expect(compare).toHaveValue('0');
    await compare.press('End');
    await expect(compare).toHaveValue('100');
    await expect(page.getByRole('button', { name: 'Detect floor with AI' })).toHaveCount(0);
    await expect(page.getByText(/Automatic detection is not enabled for this preview/i)).toBeVisible();
    expect(posts).toEqual([]);
  });
});
