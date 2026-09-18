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

  /**
   * Step 18a: the menu's floor stopped being a `<Canvas>` of its own and became the
   * `nav-floor` view of the one layout canvas. So "did the floor go away" is now a
   * question for the view registry and the `data-nav-floor-view` attribute the
   * registering effect writes, not for a canvas element count — and the canvas count
   * is asserted as a constant instead, which is the stronger statement.
   */
  const views = (page: Page) => page.evaluate(() => window.__ffeSurface?.views() ?? []);

  test('opens the floor as a view of the one canvas and gives it back on close', async ({ page }) => {
    const count = () => page.locator('canvas').count();
    const baseline = await count();
    expect(baseline, 'the homepage draws through a single canvas').toBe(1);

    await openMenu(page);
    await expect.poll(() => views(page), { timeout: 10_000 }).toContain('nav-floor');
    await expect(page.locator('[data-nav-menu-floor]')).toHaveAttribute('data-nav-floor-view', 'live');
    expect(await count(), 'an open menu adds no second context').toBe(baseline);

    await page.keyboard.press('Escape');
    await expect(menu(page)).toBeHidden();
    await expect.poll(() => views(page), { timeout: 10_000 }).not.toContain('nav-floor');
    await expect(page.locator('[data-nav-menu-floor]')).not.toHaveAttribute('data-nav-floor-view', 'live');
    expect(await count()).toBe(baseline);
  });

  /**
   * The legibility floor the migration inherited.
   *
   * `FloorMenuScene`'s retired shader ended every finish with
   * `ffeKeepLegible(colour, 0.46)` — a hard clamp that lifted the floor until its
   * luminance reached 46 % of paper's. Paper is #FAF9F6 (linear 0.955), so the rule
   * permitted backgrounds down to 0.439 linear, which is 172 in 8-bit. The shared
   * material has no such clamp, so `MENU_PLANE_OPACITY` reproduces it with alpha and
   * this test is what keeps it honest: it measures the real composited frame on the
   * darkest finish, so a future change that lets the floor swallow the list fails here.
   */
  test('keeps menu type legible over the darkest live floor', async ({ page }) => {
    await openMenu(page);
    await expect.poll(() => views(page), { timeout: 10_000 }).toContain('nav-floor');
    await page.waitForTimeout(2_500);
    // Cobalt metallic is the darkest destination finish.
    await page.getByRole('link', { name: 'Finishes' }).hover();
    await page.waitForTimeout(1_600);

    const measure = async () => page.evaluate(async (data) => {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('could not decode the menu capture'));
        element.src = `data:image/png;base64,${data}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true })!;
      context.drawImage(image, 0, 0);
      const scale = image.naturalWidth / window.innerWidth;
      const toLinear = (value: number) => {
        const channel = value / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      };
      const luminance = (r: number, g: number, b: number) =>
        0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

      const labels = [
        ...document.querySelectorAll<HTMLElement>('[data-nav-menu] [data-primary-navigation] a'),
        ...document.querySelectorAll<HTMLElement>('[data-nav-menu] [data-nav-index]'),
        ...document.querySelectorAll<HTMLElement>('[data-nav-menu-meta] a'),
      ];
      let darkestBackground = 1;
      let worstLinkRatio = Infinity;
      for (const label of labels) {
        const rect = label.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        const pixels = context.getImageData(
          Math.round(rect.left * scale),
          Math.round(rect.top * scale),
          Math.max(1, Math.round(rect.width * scale)),
          Math.max(1, Math.round(rect.height * scale)),
        ).data;
        const values: number[] = [];
        for (let i = 0; i < pixels.length; i += 4) values.push(luminance(pixels[i], pixels[i + 1], pixels[i + 2]));
        values.sort((a, b) => a - b);
        // Dark text on a light floor never reaches the light end of its own box.
        const background = values[Math.floor(values.length * 0.9)];
        darkestBackground = Math.min(darkestBackground, background);
        if (label.matches('a[href]') && label.closest('[data-primary-navigation]')) {
          const [r, g, b] = getComputedStyle(label).color.match(/[\d.]+/g)!.map(Number);
          const text = luminance(r, g, b);
          worstLinkRatio = Math.min(
            worstLinkRatio,
            (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05),
          );
        }
      }
      // Back out the 8-bit grey, the unit the retired clamp was written in.
      const srgb = Math.round((darkestBackground <= 0.0031308
        ? darkestBackground * 12.92
        : 1.055 * darkestBackground ** (1 / 2.4) - 0.055) * 255);
      return { darkestBackground: srgb, worstLinkRatio };
    }, (await page.screenshot({ type: 'png' })).toString('base64'));

    const withFloor = await measure();
    // eslint-disable-next-line no-console
    console.log(`[menu] darkest background behind a label ${withFloor.darkestBackground}/255, `
      + `worst destination contrast ${withFloor.worstLinkRatio.toFixed(2)}:1`);
    expect(withFloor.darkestBackground, 'the floor must not go below the retired ffeKeepLegible clamp')
      .toBeGreaterThanOrEqual(172);
    expect(withFloor.worstLinkRatio, 'display destinations must clear 3:1 over the floor')
      .toBeGreaterThanOrEqual(3);

    // Falsifiable: put the menu back on its CSS fallback — release the attribute so
    // the overlay's paper plate returns, and drop the rectangle so the view is
    // skipped — and the same measurement must land on paper. Without this control a
    // menu that never painted a floor at all would pass the assertions above just as
    // happily, and the numbers would prove nothing about the floor.
    await page.evaluate(() => {
      const floor = document.querySelector<HTMLElement>('[data-nav-menu-floor]')!;
      floor.removeAttribute('data-nav-floor-view');
      floor.style.display = 'none';
      window.__ffeSurface?.invalidate();
    });
    await expect(page.locator('.nav-menu__veil')).toHaveCSS('opacity', '0.96');
    await page.waitForTimeout(500);
    const withoutFloor = await measure();
    // eslint-disable-next-line no-console
    console.log(`[menu] on the CSS fallback instead: ${withoutFloor.darkestBackground}/255`);
    expect(withoutFloor.darkestBackground, 'the fallback menu is paper behind every label')
      .toBeGreaterThanOrEqual(230);
    expect(withoutFloor.darkestBackground - withFloor.darkestBackground,
      'the measurement must be sensing the floor, not the page').toBeGreaterThan(20);
    await page.keyboard.press('Escape');
  });

  test('stays usable after the floor context is lost', async ({ page }) => {
    await openMenu(page);
    await expect.poll(() => views(page), { timeout: 10_000 }).toContain('nav-floor');
    const lost = await page.evaluate(() => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-surface-canvas]');
      if (!canvas) return 'absent';
      const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
      const extension = (context as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context');
      if (!extension) return 'unsupported';
      extension.loseContext();
      return 'lost';
    });
    expect(['lost', 'absent', 'unsupported']).toContain(lost);
    if (lost === 'lost') {
      // The store flips to `fallback`, which is what both CSS fallbacks key on.
      await expect(page.locator('html')).toHaveAttribute('data-surface', 'fallback', { timeout: 6_000 });
      // The overlay's own paper plate comes straight back, so the menu is never
      // see-through onto the page behind it.
      await expect(page.locator('.nav-menu__veil')).toHaveCSS('opacity', '0.96');
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
    // Reduced motion refuses the plane outright, so there is no view to claim and the
    // CSS gradient floor under an intact paper veil is the whole menu.
    expect(await views(page)).not.toContain('nav-floor');
    await expect(page.locator('[data-nav-menu-floor]')).not.toHaveAttribute('data-nav-floor-view', 'live');
    await expect(page.locator('.nav-menu__veil')).toHaveCSS('opacity', '0.96');
    await page.keyboard.press('Escape');
    await expect(toggle(page)).toHaveAttribute('aria-expanded', 'false');
    await expect(menu(page)).toBeHidden();
    await context.close();
  });
});
