import { expect, test } from '@playwright/test';
import axeCore from 'axe-core';

const { source: axeSource } = axeCore;

/**
 * Act 2, "The proof". The section is a dated snapshot of one public Google listing, so
 * these tests are mostly anti-fabrication checks: the words on a card must be the words in
 * `customer-proof.json`, a topic tag must be inside the quote it labels, and no line the
 * business writes for itself may carry an exclamation point. The motion checks are the
 * other half — a row arrives from its own side and then holds perfectly still.
 */

const SECTION = '#customer-reviews';

/**
 * Walk the whole section past the reading line so every row plays its entrance. Six steps
 * is enough for any width: the entrances are `once` triggers, and ScrollTrigger fires
 * every start a jump crosses, so the steps are there to give the tweens time, not to avoid
 * missing one. The `html` attribute is read as an attribute, never as a visible element —
 * WebKit will not resolve a visibility wait on `<html>`.
 */
async function playEveryRow(page: import('@playwright/test').Page) {
  await expect(page.locator('html')).toHaveAttribute('data-journey-motion', 'enhanced', { timeout: 15_000 });
  const height = page.viewportSize()?.height ?? 900;
  const bounds = await page.locator(SECTION).evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { top: box.top + window.scrollY, bottom: box.bottom + window.scrollY };
  });
  const span = Math.max(bounds.bottom - bounds.top, height);
  for (let step = 0; step <= 5; step += 1) {
    await page.evaluate((value) => window.scrollTo({ top: value, behavior: 'instant' }), bounds.top - height * 0.5 + (span / 5) * step);
    await page.waitForTimeout(260);
  }
  await page.evaluate((value) => window.scrollTo({ top: value, behavior: 'instant' }), bounds.bottom - height);
  await page.waitForTimeout(1_200);
}

/** Cards grouped into the rows the grid actually laid out, in visual order. */
const readRows = () => {
  const rows = new Map<number, { position: number; height: number; from: string | null; transform: string; opacity: string }[]>();
  for (const card of document.querySelectorAll<HTMLElement>('.review-card')) {
    const box = card.getBoundingClientRect();
    const key = Math.round(box.top + window.scrollY);
    const entry = {
      position: Number(card.dataset.reviewPosition),
      height: box.height,
      from: card.dataset.arriveFrom ?? null,
      transform: getComputedStyle(card).transform,
      opacity: getComputedStyle(card).opacity,
    };
    const row = rows.get(key);
    if (row) row.push(entry);
    else rows.set(key, [entry]);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, entries]) => entries);
};

test.describe('Act 2 — the proof', () => {
  // Every scroll-walking test below drives the page through the whole section on a
  // WebKit emulation that is slower than the 30 s default allows for.
  test.slow();

  test('leads with the dated Google snapshot and the deck headline', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const section = page.locator(SECTION);
    const rating = section.locator('[data-rating-block]');

    // The rating block is the first thing in the section, as the storyboard casts it.
    expect(await section.evaluate((node) => {
      const block = node.querySelector('[data-rating-block]');
      const heading = node.querySelector('#social-title');
      return Boolean(block && heading && (block.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0);
    })).toBe(true);

    await expect(rating.locator('.rating-number')).toContainText('5.0');
    await expect(rating.locator('.rating-count')).toContainText('30 reviews on Google');
    await expect(rating.locator('small')).toHaveText('Checked 9 September 2026');
    await expect(rating.locator('.rating-count')).toHaveAttribute('href', /google\.com\/maps/);
    await expect(rating).toHaveAttribute('data-rating-fresh', 'true');

    await expect(section.getByRole('heading', { level: 2, name: 'The word from our customers.' })).toBeVisible();
    await expect(section.locator('.eyebrow')).toHaveText('Final Finish, in their words');
    await expect(section.locator('.social-intro > p').nth(1)).toHaveText(
      'From the first conversation to the finished floor. What customers say about working with Denis and the team.',
    );
    await expect(section.getByRole('link', { name: /Read every review on Google/ })).toHaveAttribute('href', /google\.com\/maps/);
  });

  test('renders seventeen verbatim excerpts, quiet ones first', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const cards = page.locator('.review-card');
    await expect(cards).toHaveCount(17);

    const rendered = await cards.evaluateAll((nodes) => nodes.map((node) => ({
      quote: node.querySelector('[data-review-quote]')?.textContent?.trim() ?? '',
      name: node.querySelector('footer strong')?.textContent?.trim() ?? '',
      link: node.querySelector('[data-review-link]')?.textContent?.trim() ?? '',
      href: node.querySelector('[data-review-link]')?.getAttribute('href') ?? '',
      verified: node.querySelector('.review-meta')?.textContent ?? '',
    })));

    // Every card carries a quote, an attributed name, and a source label that says where
    // the words came from; none of that is optional and none of it is decorative.
    for (const card of rendered) {
      expect(card.quote.length, `quote for ${card.name}`).toBeGreaterThan(10);
      expect(card.name.length, 'attributed name').toBeGreaterThan(1);
      expect(card.link, `source label for ${card.name}`).toContain('Google review');
      expect(card.href).toMatch(/google\.com\/maps/);
      expect(card.verified, `verification stamp for ${card.name}`).toContain('Verified 9 September 2026');
    }
    expect(new Set(rendered.map((card) => card.name)).size).toBe(17);

    // COPY-DECK Act 2's featured order: the front row is the quiet one, and the bridge to
    // Act 3 (preparation) leads. The five excerpts that end in an exclamation point are the
    // back row, which is also what keeps the voice rule true on first read.
    expect(rendered[0].name).toBe('Glenda Clarke');
    expect(rendered.slice(0, 12).some((card) => card.quote.includes('!'))).toBe(false);
    expect(rendered.slice(12).every((card) => card.quote.includes('!'))).toBe(true);
  });

  test('tags only what the customer actually said', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const tags = await page.locator('.review-card').evaluateAll((nodes) => nodes.map((node) => ({
      name: node.querySelector('footer strong')?.textContent?.trim() ?? '',
      quote: (node.querySelector('[data-review-quote]')?.textContent ?? '').toLowerCase(),
      label: node.querySelector('.review-tag')?.textContent?.trim() ?? null,
      phrase: node.querySelector('.review-tag')?.getAttribute('data-topic-source') ?? null,
    })));

    const APPROVED = ['Job quality', 'Epoxy flooring', 'Attention to detail', 'Preparation', 'Communication', 'Commercial'];
    const tagged = tags.filter((tag) => tag.label !== null);

    // Falsifiable both ways: tags exist at all, and every one of them is a phrase lifted
    // from its own quote. A tag invented for a review that never said it fails here.
    expect(tagged.length, 'some excerpts do carry a derived tag').toBeGreaterThan(5);
    expect(tagged.length, 'and some do not — a tag is never manufactured to fill a slot').toBeLessThan(tags.length);
    for (const tag of tagged) {
      expect(APPROVED, `${tag.name}: "${tag.label}" is a COPY-DECK label`).toContain(tag.label);
      expect(tag.phrase, `${tag.name}: tag records the phrase it came from`).toBeTruthy();
      expect(tag.quote, `${tag.name}: "${tag.phrase}" is in that customer's own words`).toContain(tag.phrase!.toLowerCase());
    }
  });

  test('ships no control that reveals nothing', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    // "Read more" is rendered per review that has a longer body in the data. None does
    // today, so the control must be absent rather than present and inert.
    const longer = await page.locator('.review-card').evaluateAll((nodes) => nodes.map((node) => ({
      control: Boolean(node.querySelector('.review-more')),
      body: node.querySelector('.review-more p')?.textContent?.trim() ?? '',
    })));
    for (const card of longer) expect(card.control ? card.body.length > 0 : true).toBe(true);
    expect(longer.filter((card) => card.control).length).toBe(await page.locator('.review-more p').count());
  });

  test('says nothing in the business own voice with an exclamation point', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const bangs = await page.locator(SECTION).evaluate((node) => {
      const copy = node.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('[data-review-quote]').forEach((quote) => quote.remove());
      return (copy.textContent ?? '').match(/!/g)?.length ?? 0;
    });
    expect(bangs, 'exclamation points outside a customer quote').toBe(0);
    // Falsifiability: the quotes that do contain one are still on the page.
    expect(await page.locator(SECTION).evaluate((node) => (node.textContent ?? '').match(/!/g)?.length ?? 0)).toBeGreaterThan(0);
  });

  for (const width of [320, 768, 1440]) {
    test(`keeps every row's cards the same height at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/', { waitUntil: 'domcontentloaded' });
      await playEveryRow(page);

      const rows = await page.evaluate(readRows);
      expect(rows.flat()).toHaveLength(17);
      const columns = width >= 1200 ? 3 : width >= 768 ? 2 : 1;
      expect(rows[0]).toHaveLength(columns);

      for (const [index, row] of rows.entries()) {
        const heights = row.map((card) => card.height);
        const spread = Math.max(...heights) - Math.min(...heights);
        expect(spread, `row ${index} height spread at ${width}px: ${heights.join(', ')}`).toBeLessThanOrEqual(1);
      }
    });
  }

  test('rows arrive from alternating sides and then hold perfectly still', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await playEveryRow(page);

    // A coarse pointer resolves to the `balanced` tier (`resolveJourneyTier`), where the
    // whole grid arrives from below instead of travelling sideways. Both tiers are a real
    // contract, so the test asserts whichever one this device actually resolved to.
    const tier = await page.evaluate(() => document.documentElement.dataset.journeyTier ?? 'full');
    const rows = await page.evaluate(readRows);
    const directions = rows.map((row) => [...new Set(row.map((card) => card.from))]);
    for (const [index, row] of directions.entries()) {
      expect(row, `row ${index} arrives from one side`).toHaveLength(1);
      expect(row[0], `row ${index} direction on the ${tier} tier`)
        .toBe(tier === 'full' ? (index % 2 === 0 ? 'left' : 'right') : 'below');
    }

    // Settled means settled (T7): once a row has been read, every card in it is at its
    // identity transform and full opacity — nothing is left mid-arrival or half-faded.
    for (const card of rows.flat()) {
      expect(card.transform === 'none' || /^matrix\(1, 0, 0, 1, 0, 0\)$/.test(card.transform), `card ${card.position} transform: ${card.transform}`).toBe(true);
      expect(Number(card.opacity), `card ${card.position} opacity`).toBe(1);
    }
  });

  test('one column on a phone, and the phone arrival comes from below', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await playEveryRow(page);
    const rows = await page.evaluate(readRows);
    expect(rows).toHaveLength(17);
    expect(new Set(rows.flat().map((card) => card.from))).toEqual(new Set(['below']));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
  });

  test('moves no hit target on hover', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await playEveryRow(page);
    await page.locator('.review-card').first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);

    const card = page.locator('.review-card').first();
    const link = card.locator('[data-review-link]');
    const before = { card: await card.boundingBox(), link: await link.boundingBox() };
    await card.hover();
    await link.hover();
    await page.waitForTimeout(450);
    const after = { card: await card.boundingBox(), link: await link.boundingBox() };

    expect(before.card).toEqual(after.card);
    expect(before.link).toEqual(after.link);

    // H3: the hover set is built only under `(hover: hover) and (pointer: fine)`. On a
    // touch device the correct result is no ring at all — never a stuck hover — so the
    // falsifiability check is pointed at whichever of the two this device is.
    const finePointer = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
    const ring = await card.evaluate((node) => getComputedStyle(node).boxShadow);
    const rule = await link.locator('.link-rule').evaluate((node) => getComputedStyle(node).transform);
    if (finePointer) {
      expect(ring, 'the cobalt ring is drawn on hover').toContain('rgba(22, 79, 131, 0.55)');
      expect(rule, 'the underline travels on hover').not.toBe('matrix(0, 0, 0, 1, 0, 0)');
    } else {
      expect(ring, 'a touch device gets no ring').not.toContain('rgba(22, 79, 131, 0.55)');
      expect(rule, 'and no half-drawn underline').toBe('matrix(0, 0, 0, 1, 0, 0)');
    }
  });

  test('gives the keyboard every card link in reading order', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('.review-card').first().scrollIntoViewIfNeeded();
    const names = await page.locator('.review-card footer strong').evaluateAll((nodes) => nodes.map((node) => node.textContent?.trim() ?? ''));

    // Every card link takes focus, and focus lands on the card it belongs to. This is the
    // part that holds in every browser; WebKit only tabs between links when the OS
    // "Full Keyboard Access" setting is on, so the Tab walk below runs where Tab works.
    const reached = await page.locator('.review-card [data-review-link]').evaluateAll((nodes) => nodes.map((node) => {
      (node as HTMLElement).focus();
      return document.activeElement === node
        ? document.activeElement?.closest('.review-card')?.querySelector('footer strong')?.textContent?.trim() ?? ''
        : 'NOT FOCUSABLE';
    }));
    expect(reached).toEqual(names);

    const first = page.locator('.review-card [data-review-link]').first();
    await first.focus();
    await page.keyboard.press('Tab');
    const tabMoves = await page.evaluate(() => document.activeElement?.hasAttribute('data-review-link') === true);
    test.skip(!tabMoves, 'this browser does not move focus between links with Tab');

    const order = [names[1]];
    for (let step = 2; step < 4; step += 1) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(() => document.activeElement?.closest('.review-card')?.querySelector('footer strong')?.textContent?.trim() ?? ''));
    }
    expect(order).toEqual(names.slice(1, 4));
  });

  test('has no automated accessibility violations inside the section', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await playEveryRow(page);
    await page.addScriptTag({ content: axeSource });
    const violations = await page.evaluate(async () => {
      const audit = await (window as typeof window & { axe: { run: (context: string, options: object) => Promise<{ violations: { id: string; nodes: unknown[] }[] }> } })
        .axe.run('#customer-reviews', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } });
      return audit.violations.map((violation) => ({ id: violation.id, nodes: violation.nodes.length }));
    });
    expect(violations).toEqual([]);
  });
});
