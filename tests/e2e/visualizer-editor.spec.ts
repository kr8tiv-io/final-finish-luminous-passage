import { expect, test, type Page } from '@playwright/test';
import { readFileSync, statSync } from 'node:fs';

/**
 * Step 25 editor gates: the shortlist, the local export, the magnifier, and the rule
 * that no hover ever moves a hit target.
 */

test.describe.configure({ timeout: 120_000 });

async function openVisualizer(page: Page) {
  await page.goto('/floor-visualizer', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Pin this finish' })).toBeEnabled({ timeout: 20_000 });
}

test.describe('floor visualizer editor', () => {
  test('pins, removes, and remembers a three-finish shortlist across a reload', async ({ page }) => {
    await openVisualizer(page);
    await expect(page.getByText(/Pin up to three finishes to compare/i)).toBeVisible();

    for (const name of ['Blue Orbit', 'Cobalt Solid', 'Salt & Pepper']) {
      await page.getByRole('button', { name: `Finish: ${name}` }).click();
      await page.getByRole('button', { name: 'Pin this finish' }).click();
    }
    await expect(page.locator('[data-shortlist-item]')).toHaveCount(3);

    // A fourth pin is refused, with an explanation rather than a silent drop.
    await page.getByRole('button', { name: 'Finish: Ocean Teal' }).click();
    await page.getByRole('button', { name: 'Pin this finish' }).click();
    await expect(page.locator('[data-shortlist-item]')).toHaveCount(3);
    await expect(page.getByText(/shortlist holds 3 finishes/i)).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-shortlist-item]')).toHaveCount(3);
    await expect(page.locator('[data-shortlist-item="blue-orbit"]')).toBeVisible();
    await expect(page.locator('[data-shortlist-item="cobalt"]')).toBeVisible();
    await expect(page.locator('[data-shortlist-item="salt-pepper"]')).toBeVisible();

    await page.getByRole('button', { name: 'Remove Blue Orbit from shortlist' }).click();
    await expect(page.locator('[data-shortlist-item]')).toHaveCount(2);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-shortlist-item]')).toHaveCount(2);
    await expect(page.locator('[data-shortlist-item="blue-orbit"]')).toHaveCount(0);
  });

  test('saves the current floor as a PNG rendered on this device', async ({ page }) => {
    await openVisualizer(page);
    await page.waitForTimeout(2_500);
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: 'Save this floor' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^final-finish-[a-z-]+\.png$/);
    const file = await download.path();
    expect(file).toBeTruthy();
    const bytes = statSync(file!).size;
    expect(bytes).toBeGreaterThanOrEqual(20 * 1024);
    const header = readFileSync(file!).subarray(0, 8);
    expect([...header]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await expect(page.getByText(/never uploaded/i)).toBeVisible();
  });

  test('magnifier toggles on and off, and a press-and-hold shows it too', async ({ page }) => {
    await openVisualizer(page);
    const toggle = page.getByRole('button', { name: /Magnifier/ });
    await expect(page.locator('.finish-lens')).toHaveCount(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.finish-lens')).toBeVisible();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.finish-lens')).toHaveCount(0);

    // The upload card covers most of the stage on a phone; hold somewhere the card is not.
    const spot = await page.evaluate(() => {
      const host = document.querySelector('[data-finish-stage]');
      if (!host) return null;
      const rect = host.getBoundingClientRect();
      const candidates = [[0.5, 0.05], [0.06, 0.06], [0.94, 0.06], [0.06, 0.95], [0.94, 0.95], [0.5, 0.97]];
      for (const [fx, fy] of candidates) {
        const x = rect.left + rect.width * fx;
        const y = rect.top + rect.height * fy;
        const element = document.elementFromPoint(x, y);
        if (element && host.contains(element) && !element.closest('button, label, input')) return { x, y };
      }
      return null;
    });
    expect(spot, 'no free point on the stage to hold').toBeTruthy();
    await page.mouse.move(spot!.x, spot!.y);
    await page.mouse.down();
    await expect(page.locator('.finish-lens')).toBeVisible({ timeout: 5_000 });
    await page.mouse.up();
    await expect(page.locator('.finish-lens')).toHaveCount(0);
  });

  test('no hover moves a hit target anywhere in the visualizer', async ({ page }) => {
    await openVisualizer(page);
    await page.getByRole('button', { name: 'Finish: Blue Orbit' }).click();
    await page.getByRole('button', { name: 'Pin this finish' }).click();
    const targets = page.locator('.visualizer-shell button, .visualizer-shell a');
    const count = await targets.count();
    expect(count).toBeGreaterThan(30);
    for (let index = 0; index < count; index += 1) {
      const target = targets.nth(index);
      if (!(await target.isVisible())) continue;
      await target.scrollIntoViewIfNeeded();
      const before = await target.boundingBox();
      if (!before || before.width < 1) continue;
      await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
      await page.waitForTimeout(380);
      const after = await target.boundingBox();
      expect(after, `target ${index} vanished on hover`).toBeTruthy();
      expect(Math.abs(after!.x - before.x), `target ${index} moved horizontally`).toBeLessThan(0.5);
      expect(Math.abs(after!.y - before.y), `target ${index} moved vertically`).toBeLessThan(0.5);
      expect(Math.abs(after!.width - before.width), `target ${index} changed width`).toBeLessThan(0.5);
      expect(Math.abs(after!.height - before.height), `target ${index} changed height`).toBeLessThan(0.5);
    }
  });

  test('the finish-hall entrance loads the alcove without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/floor-visualizer?from=finish-hall&finish=pearl-current', { waitUntil: 'load' });
    await expect(page.locator('.selected-finish').getByRole('heading', { name: 'Pearl Calacatta' })).toBeVisible();
    await page.waitForTimeout(2_500);
    expect(errors).toEqual([]);
  });

  test('keeps every request on the app origin during a 20-second session', async ({ page }) => {
    const hosts = new Set<string>();
    page.on('request', (request) => {
      const url = request.url();
      if (url.startsWith('data:') || url.startsWith('blob:')) return;
      hosts.add(new URL(url).host);
    });
    await page.goto('/floor-visualizer', { waitUntil: 'load' });
    const origin = new URL(page.url()).host;
    await page.getByRole('button', { name: 'Finish: Copper on Black' }).click();
    await page.getByRole('button', { name: 'Pin this finish' }).click();
    const stage = page.locator('[data-finish-stage]');
    const box = await stage.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      for (let step = 0; step < 12; step += 1) {
        await page.mouse.move(box.x + box.width / 2 + step * 9, box.y + box.height / 2 + step * 3);
        await page.waitForTimeout(40);
      }
      await page.mouse.up();
    }
    await page.waitForTimeout(18_000);
    expect([...hosts]).toEqual([origin]);
  });
});
