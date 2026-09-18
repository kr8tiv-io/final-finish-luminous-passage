import { expect, test } from '@playwright/test';

const FEATURED_NAV = [
  { index: 0, button: 'First featured project' },
  { index: 1, button: 'Next featured project' },
  { index: 2, button: 'Last featured project' },
] as const;

/**
 * The gallery is a `client:visible` island: its layout attributes only mean
 * anything once it has hydrated and taken its first measurement. Waiting for
 * that is not a weakened assertion — it keeps island start-up out of the 5 s
 * assertion window on a loaded machine.
 */
const galleryReady = async (page: import('@playwright/test').Page) => {
  await page.waitForSelector('.transformation-gallery.is-hydrated', { timeout: 60_000 });
};

/** Bounding box of the last featured card, in viewport coordinates. */
const lastCardBox = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const panels = [...document.querySelectorAll<HTMLElement>('[data-featured-panel]')];
  const rect = panels[panels.length - 1].getBoundingClientRect();
  return { left: rect.left, right: rect.right, innerWidth: window.innerWidth };
});

const activeCardBox = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const panel = document.querySelector<HTMLElement>('[data-featured-panel][data-active="true"]');
  if (!panel) throw new Error('no active featured panel');
  const rect = panel.getBoundingClientRect();
  return { left: rect.left, right: rect.right, innerWidth: window.innerWidth };
});

const trackOffsets = (page: import('@playwright/test').Page) => page.evaluate(() => {
  const track = document.querySelector<HTMLElement>('.transformation-gallery__featured-window');
  if (!track) throw new Error('no featured window');
  return { scrollLeft: track.scrollLeft, scrollTop: track.scrollTop, overflow: track.scrollWidth - track.clientWidth };
});

/**
 * Restored from the 2026-09-14 audit (the two desktop assertions that were
 * deleted rather than fixed). The last card must be wholly inside the viewport
 * after every settled action, not parked a panel width off screen.
 */
test('desktop: the last featured card stays inside the viewport after Last, after focus, and across a resize round trip', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop-only: the sticky passage is not admitted on phones.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
  await galleryReady(page);
  const gallery = page.locator('.transformation-gallery');
  await expect(gallery).toHaveAttribute('data-gallery-layout', 'passage');

  await gallery.getByRole('button', { name: 'Last featured project' }).click();
  await expect(gallery).toHaveAttribute('data-featured-index', '2');
  await expect(gallery).toHaveAttribute('data-featured-settled', 'true');
  const afterLast = await lastCardBox(page);
  expect(afterLast.left, 'after Last: last card left edge').toBeGreaterThanOrEqual(0);
  expect(afterLast.right, `after Last: last card right edge (innerWidth ${afterLast.innerWidth})`).toBeLessThanOrEqual(afterLast.innerWidth);

  const lastRange = page.locator('[data-featured-panel]').last().locator('input[type="range"]');
  await lastRange.focus();
  await expect(lastRange).toBeFocused();
  await expect(gallery).toHaveAttribute('data-featured-settled', 'true');
  const afterFocus = await lastCardBox(page);
  expect(afterFocus.left, 'after focusing the last divider: left edge').toBeGreaterThanOrEqual(0);
  expect(afterFocus.right, `after focusing the last divider: right edge (innerWidth ${afterFocus.innerWidth})`).toBeLessThanOrEqual(afterFocus.innerWidth);

  await page.setViewportSize({ width: 1024, height: 1000 });
  await expect(gallery).toHaveAttribute('data-featured-index', '2');
  const atNarrow = await lastCardBox(page);
  expect(atNarrow.left, 'at 1024: left edge').toBeGreaterThanOrEqual(0);
  expect(atNarrow.right, `at 1024: right edge (innerWidth ${atNarrow.innerWidth})`).toBeLessThanOrEqual(atNarrow.innerWidth);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(gallery).toHaveAttribute('data-featured-index', '2');
  await expect.poll(async () => (await lastCardBox(page)).right <= 1440).toBe(true);
  const back = await lastCardBox(page);
  expect(back.left, 'back at 1440: left edge').toBeGreaterThanOrEqual(0);
  expect(back.right, `back at 1440: right edge (innerWidth ${back.innerWidth})`).toBeLessThanOrEqual(back.innerWidth);
});

test('desktop: in the pinned passage the inner track never scrolls — focus moves the window', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'Desktop-only: the sticky passage is not admitted on phones.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
  await galleryReady(page);
  const gallery = page.locator('.transformation-gallery');
  await expect(gallery).toHaveAttribute('data-gallery-layout', 'passage');

  // Falsifiability: the track really is a scroll container with room to move,
  // and a forced offset is pinned back — so "scrollLeft === 0" is a constraint,
  // not a property the element could not violate.
  const overflow = (await trackOffsets(page)).overflow;
  expect(overflow, 'featured track horizontal overflow').toBeGreaterThan(0);
  await page.evaluate(() => { document.querySelector<HTMLElement>('.transformation-gallery__featured-window')!.scrollLeft = 240; });
  await expect.poll(async () => (await trackOffsets(page)).scrollLeft).toBe(0);

  // Leave card 0 first so every button in the loop below is enabled.
  await gallery.getByRole('button', { name: 'Last featured project' }).click();
  await expect(gallery).toHaveAttribute('data-featured-index', '2');

  for (const step of FEATURED_NAV) {
    await gallery.getByRole('button', { name: step.button }).click();
    await expect(gallery).toHaveAttribute('data-featured-index', String(step.index));
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBeGreaterThan(0);
    const settledScrollY = await page.evaluate(() => window.scrollY);

    // Move away, then focus the divider: the window must come back to this
    // card's passage progress and the track must stay at zero.
    await page.evaluate(() => window.scrollBy(0, 120));
    await page.waitForTimeout(80);
    await page.locator('[data-featured-panel][data-active="true"] input[type="range"]').focus();
    await expect(gallery).toHaveAttribute('data-featured-index', String(step.index));
    await expect(gallery).toHaveAttribute('data-featured-settled', 'true');

    const offsets = await trackOffsets(page);
    expect(offsets.scrollLeft, `card ${step.index}: track scrollLeft after focus`).toBe(0);
    expect(offsets.scrollTop, `card ${step.index}: track scrollTop after focus`).toBe(0);
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(Math.abs(scrollY - settledScrollY), `card ${step.index}: window returned to the passage target (${scrollY} vs ${settledScrollY})`).toBeLessThanOrEqual(2);

    const card = await activeCardBox(page);
    expect(card.left, `card ${step.index}: left edge after focus`).toBeGreaterThanOrEqual(0);
    expect(card.right, `card ${step.index}: right edge after focus`).toBeLessThanOrEqual(card.innerWidth);
  }
});

test('vertical passage changes the featured project and exposes direct first, last, and skip navigation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
  await galleryReady(page);
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
  await galleryReady(page);
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
  await galleryReady(page);
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
  await galleryReady(page);
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
