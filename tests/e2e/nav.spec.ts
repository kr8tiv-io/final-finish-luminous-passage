import { expect, test, type Page } from '@playwright/test';
import axeCore from 'axe-core';

const { source: axeSource } = axeCore;

const menu = (page: Page) => page.locator('[data-nav-menu]');
const toggle = (page: Page) => page.getByRole('button', { name: /primary menu/i });
const primaryNav = (page: Page) => page.getByRole('navigation', { name: 'Primary navigation' });

async function openMenu(page: Page) {
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  await expect(menu(page)).toBeVisible();
}

test.describe('full-screen navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // The homepage's own canvas island hydrates after load; let it settle so
    // "baseline" means the page's steady state, not a half-mounted one.
    await page.waitForLoadState('load').catch(() => {});
    await page.waitForTimeout(900);
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('opens into the numbered list and closes back into the header', async ({ page }) => {
    await expect(menu(page)).toBeHidden();
    await openMenu(page);

    // Exactly one navigation landmark, and it is the one inside the menu now.
    await expect(page.getByRole('navigation', { name: 'Primary navigation' })).toHaveCount(1);
    await expect(menu(page).locator('[data-primary-navigation]')).toHaveCount(1);
    const links = primaryNav(page).getByRole('link');
    await expect(links).toHaveCount(6);
    await expect(links.first()).toHaveAccessibleName('Services');
    await expect(menu(page).locator('[data-nav-index]').first()).toHaveText('01');
    await expect(menu(page).locator('[data-nav-index]')).toHaveCount(6);

    // Main and footer are inert and hidden from assistive technology.
    await expect(page.locator('#main-content')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('body > .site-footer')).toHaveAttribute('aria-hidden', 'true');
    expect(await page.locator('#main-content').evaluate((element) => (element as HTMLElement).inert)).toBe(true);
    expect(await page.locator('body > .site-footer').evaluate((element) => (element as HTMLElement).inert)).toBe(true);

    await page.keyboard.press('Escape');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle(page)).toBeFocused();
    await expect(menu(page)).toBeHidden();
    // The nav is handed back to the header.
    await expect(page.locator('.site-header [data-primary-navigation]')).toHaveCount(1);
    expect(await page.locator('#main-content').evaluate((element) => (element as HTMLElement).inert)).toBe(false);
    await expect(page.locator('#main-content')).not.toHaveAttribute('aria-hidden', 'true');
    await expect(page.locator('body > .site-footer')).not.toHaveAttribute('aria-hidden', 'true');
  });

  test('traps Tab inside the header and menu, and rovings focus with the arrow keys', async ({ page }) => {
    await openMenu(page);
    const links = primaryNav(page).getByRole('link');
    await expect(links.first()).toBeFocused();

    await page.keyboard.press('ArrowDown');
    await expect(links.nth(1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(links.first()).toBeFocused();
    await page.keyboard.press('End');
    await expect(links.nth(5)).toBeFocused();
    await page.keyboard.press('Home');
    await expect(links.first()).toBeFocused();

    const order = await page.evaluate(() => {
      const selector = 'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])';
      const header = document.querySelector('.site-header')!;
      const overlay = document.querySelector('[data-nav-menu]')!;
      return [...header.querySelectorAll(selector), ...overlay.querySelectorAll(selector)]
        .filter((element) => (element as HTMLElement).offsetParent !== null)
        .length;
    });
    expect(order).toBeGreaterThan(6);

    // A full cycle of Tab never escapes the header/menu pair and returns to the start.
    const insideMenuChrome = async () =>
      page.evaluate(() => {
        const active = document.activeElement;
        if (!active) return false;
        return Boolean(document.querySelector('.site-header')?.contains(active) || document.querySelector('[data-nav-menu]')?.contains(active));
      });
    for (let step = 0; step < order; step += 1) {
      await page.keyboard.press('Tab');
      expect(await insideMenuChrome()).toBe(true);
    }
    await expect(links.first()).toBeFocused();
    // The toggle stays reachable inside the cycle.
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'true');
  });

  test('has no automated WCAG A or AA violations while open', async ({ page }) => {
    await openMenu(page);
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const audit = await (window as typeof window & { axe: { run: (context: Document, options: object) => Promise<{ violations: unknown[] }> } }).axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
      });
      return audit.violations;
    });
    expect(violations).toEqual([]);
  });

  test('keeps the canvas count at its baseline once closed', async ({ page }) => {
    const count = () => page.locator('canvas').count();
    const baseline = await count();
    await openMenu(page);
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await page.waitForTimeout(600);
    await expect(page.locator('canvas[data-nav-floor]')).toHaveCount(0);
    expect(await count()).toBe(baseline);
  });

  test('stays usable after the floor context is lost', async ({ page }) => {
    await openMenu(page);
    await page.locator('canvas[data-nav-floor]').waitFor({ state: 'attached', timeout: 4000 }).catch(() => {});
    const lost = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-nav-floor]');
      if (!canvas) return 'absent';
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const extension = (context as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context');
      if (!extension) return 'unsupported';
      extension.loseContext();
      return 'lost';
    });
    expect(['lost', 'absent', 'unsupported']).toContain(lost);
    if (lost === 'lost') {
      await expect(page.locator('canvas[data-nav-floor]')).toHaveCount(0, { timeout: 4000 });
    }
    // The CSS floor stays, and the menu still navigates.
    await expect(page.locator('[data-nav-menu-floor]')).toBeVisible();
    const links = primaryNav(page).getByRole('link');
    await expect(links).toHaveCount(6);
    await links.nth(2).focus();
    await expect(links.nth(2)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
  });

  test('is fully functional with reduced motion and no canvas', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const baseline = await page.locator('canvas').count();
    await openMenu(page);
    await expect(primaryNav(page).getByRole('link')).toHaveCount(6);
    await expect(primaryNav(page).getByRole('link').first()).toBeVisible();
    await page.waitForTimeout(600);
    expect(await page.locator('canvas').count()).toBe(baseline);
    await expect(page.locator('canvas[data-nav-floor]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(menu(page)).toBeHidden();
    await context.close();
  });
});
