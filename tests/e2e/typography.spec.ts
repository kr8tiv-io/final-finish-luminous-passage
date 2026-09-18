import { expect, test } from '@playwright/test';

/**
 * Step 13's delivery contract, asserted against a real page rather than the
 * stylesheet.
 *
 * `src/styles/type-scale.test.ts` proves the scale's arithmetic; this file
 * proves the browser agrees — that the one font file named in `<head>` is the
 * one `document.fonts` actually loaded, that nothing reaches out to Google, and
 * that the computed sizes on the page are the tokens and not something a later
 * cascade quietly replaced.
 */

const FONT_URL = '/fonts/manrope-latin-var.woff2';

test('preloads exactly one font file, and it is the one the page loads', async ({ page }) => {
  const fontRequests: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fontRequests.push(request.url());
  });

  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  const preloads = page.locator('link[rel="preload"][as="font"]');
  await expect(preloads).toHaveCount(1);
  const href = await preloads.getAttribute('href');
  expect(href).toBe(FONT_URL);
  expect(await preloads.getAttribute('type')).toBe('font/woff2');
  // Same-origin or not, a CSS font fetch is CORS-mode: without this the preload
  // does not match the real request and the file is downloaded twice.
  expect(await preloads.getAttribute('crossorigin')).not.toBeNull();

  // The preload points at a file the page really uses: document.fonts carries a
  // loaded FontFace whose family is Manrope and whose src names that same URL.
  const loaded = await page.evaluate(() => [...document.fonts]
    .filter((face) => face.status === 'loaded')
    .map((face) => ({ family: face.family, status: face.status })));
  expect(loaded.some((face) => face.family.includes('Manrope'))).toBe(true);

  // …and the network agrees: one font request, for that URL.
  const manrope = fontRequests.filter((url) => url.includes('manrope'));
  expect(manrope).toHaveLength(1);
  expect(new URL(manrope[0]).pathname).toBe(FONT_URL);
});

test('never asks Google for a font', async ({ page }) => {
  const offsite: string[] = [];
  page.on('request', (request) => {
    const { hostname } = new URL(request.url());
    if (hostname.endsWith('googleapis.com') || hostname.endsWith('gstatic.com')) {
      offsite.push(request.url());
    }
  });

  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('link[href*="fonts.googleapis.com"]')).toHaveCount(0);
  await expect(page.locator('link[href*="fonts.gstatic.com"]')).toHaveCount(0);
  expect(offsite).toEqual([]);
});

test('resolves Manrope first on the heading and on body copy', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  const families = await page.evaluate(() => {
    const first = (element: Element) => getComputedStyle(element)
      .fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
    return {
      h1: first(document.querySelector('h1')!),
      body: first(document.body),
    };
  });
  expect(families.h1.startsWith('Manrope')).toBe(true);
  expect(families.body.startsWith('Manrope')).toBe(true);
});

test('computes the scale tokens the stylesheet declares, at 1440 and at 390', async ({ page }) => {
  for (const [width, height, expectations] of [
    [1440, 900, { caption: 14, bodyMin: 17, bodyMax: 18, hero: 97.92, chapterMin: 70 }],
    [390, 844, { caption: 14, bodyMin: 16, bodyMax: 16, hero: 44, chapterMin: 36 }],
  ] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await page.evaluate(() => document.fonts.ready);

    const measured = await page.evaluate(() => {
      const px = (value: string) => Number.parseFloat(value);
      const read = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) return null;
        const style = getComputedStyle(element);
        return {
          fontSize: px(style.fontSize),
          lineHeight: px(style.lineHeight),
          letterSpacing: style.letterSpacing === 'normal' ? 0 : px(style.letterSpacing),
          fontWeight: Number(style.fontWeight),
        };
      };
      return {
        hero: read('.journey .display-title'),
        chapter: read('.journey .chapter-title'),
        lead: read('.journey .lead'),
        body: read('body'),
        caption: read('.journey .eyebrow'),
      };
    });

    expect(measured.caption!.fontSize, `caption at ${width}px`).toBeCloseTo(expectations.caption, 1);
    expect(measured.caption!.letterSpacing / measured.caption!.fontSize).toBeCloseTo(0.08, 2);
    expect(measured.caption!.fontWeight).toBe(600);

    expect(measured.body!.fontSize).toBeGreaterThanOrEqual(expectations.bodyMin);
    expect(measured.body!.fontSize).toBeLessThanOrEqual(expectations.bodyMax);

    expect(measured.hero!.fontSize, `hero at ${width}px`).toBeCloseTo(expectations.hero, 0);
    expect(measured.chapter!.fontSize).toBeGreaterThanOrEqual(expectations.chapterMin);

    // The hierarchy the scale promises, as the browser resolves it.
    expect(measured.hero!.fontSize).toBeGreaterThan(measured.chapter!.fontSize);
    expect(measured.chapter!.fontSize).toBeGreaterThan(measured.lead!.fontSize);
    expect(measured.lead!.fontSize).toBeGreaterThan(measured.body!.fontSize);
    expect(measured.body!.fontSize).toBeGreaterThan(measured.caption!.fontSize);

    // Optical leading: the hero is set tighter than a single em at the top of
    // its range and never looser than one.
    const heroLeading = measured.hero!.lineHeight / measured.hero!.fontSize;
    expect(heroLeading).toBeGreaterThanOrEqual(0.95);
    expect(heroLeading).toBeLessThanOrEqual(1.005);
    // …and its tracking is negative and inside the −0.018em … −0.030em band.
    const heroTracking = measured.hero!.letterSpacing / measured.hero!.fontSize;
    expect(heroTracking).toBeLessThanOrEqual(-0.017);
    expect(heroTracking).toBeGreaterThanOrEqual(-0.031);
  }
});

test('keeps body and caption legible on the paper wash', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => document.fonts.ready);

  // WCAG 1.4.3 against #FAF9F6, computed from the colours the tokens actually
  // resolve to rather than from the hex literals in the stylesheet.
  const ratios = await page.evaluate(() => {
    const channel = (value: number) => {
      const s = value / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (rgb: number[]) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
    const parse = (value: string) => value.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
    const paper = luminance([250, 249, 246]);
    const ratio = (element: Element) => {
      const text = luminance(parse(getComputedStyle(element).color));
      const [lighter, darker] = text > paper ? [text, paper] : [paper, text];
      return (lighter + 0.05) / (darker + 0.05);
    };
    return {
      body: ratio(document.querySelector('.reading-body p')!),
      caption: ratio(document.querySelector('.reading-label strong')!),
    };
  });

  expect(ratios.body, 'body token on #FAF9F6').toBeGreaterThanOrEqual(4.5);
  expect(ratios.caption, 'caption token on #FAF9F6').toBeGreaterThanOrEqual(4.5);
});
