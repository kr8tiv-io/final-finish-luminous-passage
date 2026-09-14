import { expect, test } from '@playwright/test';

test('saved still preference is respected by the shared header', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('final-finish:journey-controls:v1', JSON.stringify({ motionPreference: 'still' })));
  await page.goto('/contact', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.site-header')).toHaveAttribute('data-header-still', '');
  await expect(page.locator('.nav-label').first()).toHaveCSS('transition-duration', '0s');
});

test('material navigation responds to keyboard focus without moving its touch targets', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const nav = page.getByRole('navigation', { name: 'Primary navigation' });
  if (page.viewportSize()!.width <= 880) {
    const toggle = page.getByRole('button', { name: /primary menu/i });
    await toggle.focus();
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const projects = nav.getByRole('link', { name: 'Projects', exact: true });
    await expect(projects).toBeVisible();
    await projects.focus();
    await expect(projects).toBeFocused();
    expect((await projects.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    return;
  }
  const projects = nav.getByRole('link', { name: 'Projects', exact: true });
  const before = await projects.boundingBox();
  await projects.focus();
  await expect(nav.locator('[data-nav-highlight]')).toHaveAttribute('data-active', 'true');
  await expect(nav.locator('[data-nav-highlight]')).toHaveAttribute('data-target', '/projects');
  const after = await projects.boundingBox();
  expect(before).toEqual(after);
  expect((await projects.evaluate((element) => element.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);
});

test('chapter copy stays readable without a white text panel and planning remains semantic HTML', async ({ page }) => {
  await page.goto('/#commercial', { waitUntil: 'domcontentloaded' });
  const commercial = page.locator('#commercial');
  await expect(commercial.locator('.chapter-copy-surface')).toBeVisible();
  const layers = await commercial.evaluate((element) => ({
    copy: Number(getComputedStyle(element.querySelector('.chapter-content')!).zIndex),
    feather: Number(getComputedStyle(element, '::after').zIndex),
  }));
  expect(layers.copy).toBeGreaterThan(layers.feather);
  expect(await commercial.locator('.chapter-copy-surface').evaluate((element) => getComputedStyle(element, '::before').display)).toBe('none');
  await page.locator('#floor-planning').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading', { name: 'Before you choose a colour.' })).toBeVisible();
  await page.locator('#floor-planning summary').first().click();
  await expect(page.locator('#floor-planning details').first()).toHaveAttribute('open', '');
});
