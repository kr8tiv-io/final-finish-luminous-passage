import { expect, test } from '@playwright/test';

test.describe('floor visualizer', () => {
  test('presents 30 inspiration finishes and a private manual workflow', async ({ page }) => {
    await page.goto('/floor-visualizer');

    await expect(page.getByRole('heading', { level: 1, name: 'See the room you have. Try the floor it could become.' })).toBeVisible();
    await expect(page.getByLabel('Upload a room or garage photo')).toHaveAttribute('accept', /image/);
    await expect(page.getByRole('button', { name: /finish:/i })).toHaveCount(30);
    await expect(page.getByText(/manual mode keeps the photo on this device/i)).toBeVisible();
    await expect(page.getByText(/visualization for design inspiration/i)).toBeVisible();
  });

  test('lets the visitor select a finish before uploading', async ({ page }) => {
    await page.goto('/floor-visualizer');
    await page.getByRole('button', { name: 'Finish: Blue Orbit' }).click();

    await expect(page.getByRole('heading', { name: 'Blue Orbit' })).toBeVisible();
    await expect(page.getByText(/Cobalt and midnight-blue movement/i)).toBeVisible();
  });

  test('requires explicit consent before AI floor detection', async ({ page }) => {
    let sessionRequests = 0;
    let submittedSession = '';
    await page.route('**/api/visualizer/session', async (route) => {
      sessionRequests += 1;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token: 'visualizer-test-session', expiresInSeconds: 600 }) });
    });
    await page.route('**/api/visualizer/mask', async (route) => {
      submittedSession = route.request().headers()['x-visualizer-session'] ?? '';
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ requestId: 'mask-test', masks: [] }) });
    });
    await page.goto('/floor-visualizer');
    const upload = page.getByLabel('Upload a room or garage photo');
    await expect(upload).toBeEnabled();
    await upload.setInputFiles({
      name: 'garage.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=', 'base64'),
    });

    const detect = page.getByRole('button', { name: 'Detect floor with AI' });
    await expect(detect).toBeDisabled();
    await page.getByLabel(/I consent to sending this downscaled photo/i).check();
    await expect(detect).toBeEnabled();
    await detect.click();
    await expect(page.getByText(/Floor detection complete/i)).toBeVisible();
    expect(sessionRequests).toBe(1);
    expect(submittedSession).toBe('visualizer-test-session');
  });

  test('keeps four manual floor corners adjustable without uploading to AI', async ({ page }) => {
    await page.goto('/floor-visualizer');
    const upload = page.getByLabel('Upload a room or garage photo');
    await expect(upload).toBeEnabled();
    await upload.setInputFiles({
      name: 'garage.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=', 'base64'),
    });

    const firstCorner = page.getByRole('slider', { name: 'Floor corner 1' });
    await expect(page.getByRole('slider', { name: /Floor corner/ })).toHaveCount(4);
    const before = await page.locator('.finish-plane').getAttribute('style');
    await firstCorner.press('ArrowRight');
    await expect(page.locator('.finish-plane')).not.toHaveAttribute('style', before ?? '');
    await expect(page.getByText(/Drag the four corners/i)).toBeVisible();
  });
});
