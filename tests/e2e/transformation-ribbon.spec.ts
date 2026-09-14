import { expect, test } from '@playwright/test';

test('vertical passage changes the featured project and exposes direct first, last, and skip navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
  const gallery = page.locator('.transformation-gallery');
  await expect(gallery).toHaveAttribute('data-gallery-mode', 'native');
  await expect(gallery).toHaveAttribute('data-gallery-layout', 'passage');
  await expect(gallery.getByText('Project pairing review · not approved for publication')).toBeVisible();

  await expect(gallery.getByRole('button', { name: 'First featured project' })).toBeVisible();
  await expect(gallery.getByRole('button', { name: 'Last featured project' })).toBeVisible();
  await expect(gallery.getByRole('link', { name: 'Skip featured comparisons' })).toBeVisible();
  await expect(gallery).toHaveAttribute('data-featured-index', '0');

  const passage = gallery.locator('.transformation-gallery__passage');
  await passage.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    window.scrollTo({ top: window.scrollY + rect.top + element.scrollHeight - window.innerHeight - 8, behavior: 'instant' });
  });
  await expect(gallery).toHaveAttribute('data-featured-index', '2');

  await gallery.getByRole('button', { name: 'First featured project' }).click();
  await expect(gallery).toHaveAttribute('data-featured-index', '0');
  const firstPanel = gallery.locator('[data-featured-panel]').first();
  await expect.poll(() => firstPanel.evaluate((element) => getComputedStyle(element).getPropertyValue('--panel-x'))).toBe('0%');
  const firstStage = firstPanel.locator('[data-comparison]');
  await firstStage.getByRole('button', { name: 'Show before photograph' }).click();
  await expect(firstStage).toHaveAttribute('data-displayed-reveal', '100');
});

test('keyboard endpoints control the matching visual layer and hover restores the committed reveal', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
  const gallery = page.locator('.transformation-gallery');
  await expect(gallery).toHaveAttribute('data-gallery-layout', 'passage');
  const active = gallery.locator('[data-featured-panel]').first();
  await expect(active).toHaveAttribute('data-active', 'true');
  const stage = active.locator('[data-comparison]');
  const slider = stage.getByRole('slider');

  await stage.scrollIntoViewIfNeeded();
  await expect(slider).toBeEnabled();
  await slider.focus();
  await page.keyboard.press('Home');
  await expect(slider).toHaveValue('0');
  await expect(stage).toHaveAttribute('data-displayed-reveal', '0');
  await expect(stage.locator('.transformation-photo--after')).toHaveCSS('clip-path', /inset\(0px 0px 0px 0%\)|inset\(0px\)/);
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('100');
  await expect(stage).toHaveAttribute('data-displayed-reveal', '100');
  await expect(stage.locator('.transformation-photo--after')).toHaveCSS('clip-path', /100%/);

  await slider.blur();
  const box = await stage.boundingBox();
  if (!box) throw new Error('Expected the featured comparison to have geometry');
  await page.mouse.move(box.x + box.width * .3, box.y + box.height * .45);
  await expect.poll(async () => Number(await stage.getAttribute('data-displayed-reveal'))).toBe(30);
  await page.mouse.move(box.x - 20, box.y - 20);
  await expect(stage).toHaveAttribute('data-displayed-reveal', '100');

  await stage.getByRole('button', { name: 'Show before photograph' }).click();
  await expect(slider).toHaveValue('100');
  await stage.getByRole('button', { name: 'Show after photograph' }).click();
  await expect(slider).toHaveValue('0');
});

test('Explore all navigates native horizontal cards and keeps each divider in its own viewport card', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
  const gallery = page.locator('.transformation-gallery');
  await gallery.getByRole('link', { name: 'Skip featured comparisons' }).click();
  const explore = gallery.locator('#transformation-explore');
  await expect(explore).toBeInViewport();
  await expect(gallery).toHaveAttribute('data-featured-index', '2');
  const passageIndex = await gallery.getAttribute('data-featured-index');

  const ribbon = explore.locator('.transformation-gallery__viewport');
  const before = await ribbon.evaluate((element) => element.scrollLeft);
  await explore.getByRole('button', { name: 'Next project comparison' }).click();
  await expect.poll(() => ribbon.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before);
  await expect(explore).toHaveAttribute('data-explore-index', '1');
  const activeCard = explore.locator('[data-explore-card][data-active="true"]');
  await expect(activeCard).toBeInViewport();
  const slider = activeCard.getByRole('slider');
  await slider.focus();
  await page.keyboard.press('End');
  await expect(slider).toHaveValue('100');
  await expect(activeCard.locator('[data-comparison]')).toHaveAttribute('data-displayed-reveal', '100');
  await expect(gallery).toHaveAttribute('data-featured-index', passageIndex ?? '0');
});

test('phone, short viewport, and still preference retain native flow without a sticky passage', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => localStorage.setItem('final-finish:journey-controls:v1', JSON.stringify({ selectedFinish: 'alabaster-stone', motionPreference: 'still' })));
  await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
  const gallery = page.locator('.transformation-gallery');
  await expect(gallery).toHaveAttribute('data-gallery-layout', 'native');
  await expect(gallery.locator('.transformation-gallery__sticky')).toHaveCSS('position', 'relative');
  await gallery.getByRole('button', { name: 'Next featured project' }).click();
  await expect(gallery).toHaveAttribute('data-featured-index', '1');
  await expect(gallery.locator('[data-featured-panel]').nth(1)).toBeInViewport();

  await page.setViewportSize({ width: 1280, height: 560 });
  await expect(gallery).toHaveAttribute('data-gallery-layout', 'native');
  await expect(gallery.locator('.transformation-gallery__sticky')).toHaveCSS('position', 'relative');
});

test('the server-rendered review retains honest summaries without JavaScript', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
  const gallery = page.locator('.transformation-gallery');
  await expect(gallery.locator('#transformation-gallery-title')).toHaveText('See the difference.');
  await expect(gallery.getByText('Project pairing review · not approved for publication')).toBeVisible();
  await expect(gallery.locator('[data-featured-panel]')).toHaveCount(3);
  await expect(gallery.locator('[data-featured-panel] h3')).toHaveCount(3);
  await expect(gallery.locator('[data-explore-card]')).toHaveCount(3);
  await expect(gallery.locator('[data-comparison]')).toHaveCount(6);
  await expect(gallery.locator('[data-comparison] img')).toHaveCount(12);
  for (const image of await gallery.locator('[data-comparison] img').all()) await expect(image).toHaveAttribute('loading', 'lazy');
  await expect(gallery.locator('[data-comparison]').first()).toHaveAttribute('data-static-fallback', 'side-by-side');
  await expect(gallery.getByRole('link', { name: 'Final Finish Epoxy project archive' })).toHaveAttribute('href', 'https://www.finalfinishepoxy.ca/projects');
  const staticSliders = gallery.locator('input[type="range"]');
  await expect(staticSliders).toHaveCount(6);
  for (const slider of await staticSliders.all()) await expect(slider).toBeDisabled();
  await context.close();
});
