import { expect, test } from '@playwright/test';

test.describe('Final Finish homepage', () => {
  test('states the current value proposition and preserves both lead paths', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle(/Final Finish Epoxy.*Edmonton/i);
    await expect(page.getByRole('heading', { level: 1, name: 'A better floor changes the whole space.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Try your floor', exact: true })).toHaveAttribute('href', '/floor-visualizer');
    await expect(page.getByRole('link', { name: 'Request a quote', exact: true }).first()).toHaveAttribute('href', '/contact#quote');
    await expect(page.getByRole('link', { name: /Call Denis/i }).first()).toHaveAttribute('href', 'tel:+17809911651');
  });

  test('keeps the first paint semantic while motion enhancement remains optional', async ({ page, browser }) => {
    const staticContext = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await staticContext.newPage();
    await staticPage.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(staticPage.getByRole('heading', { level: 1, name: 'A better floor changes the whole space.' })).toBeVisible();
    await expect(staticPage.getByRole('link', { name: 'Request a quote', exact: true }).first()).toHaveAttribute('href', '/contact#quote');
    await staticContext.close();

    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('data-journey-motion', 'enhanced', { timeout: 8_000 });
    await expect(page.locator('.journey-motion-control')).toBeVisible();
  });

  test('uses the responsive local pour assets rather than a 3D hero', async ({ page }) => {
    const heavyRequests: string[] = [];
    page.on('request', (request) => {
      if (/LuminousPassageScene|\.glb(?:\?|$)/.test(request.url())) heavyRequests.push(request.url());
    });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const film = page.locator('.pour-film');
    await expect(page.locator('.pour-stage')).toBeVisible();
    await expect(page.locator('.pour-poster')).toHaveAttribute('fetchpriority', 'high');
    await expect(page.locator('.pour-poster')).toHaveAttribute('src', /follow-floor\/720\/epoxy-pour-pearl-poster/);
    await expect(film).toHaveAttribute('muted', '');
    await expect(film).toHaveAttribute('playsinline', '');
    await expect(film.locator('source')).toHaveCount(2);
    await expect(page.locator('.passage-host')).toHaveCount(0);
    expect(heavyRequests).toEqual([]);
  });

  test('keeps each chapter narrative in six readable white panels', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const readings = page.locator('.chapter-reading');
    await expect(readings).toHaveCount(6);
    expect(await readings.evaluateAll((nodes) => nodes.every((node) => node.hasAttribute('data-journey-white-stage')))).toBe(true);
    await expect(page.getByRole('heading', { name: 'The finish begins below the surface.' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Let’s talk about your space.' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Tell us about your project' })).toHaveAttribute('href', '/contact#quote');
  });

  /**
   * The storyboard's ten acts, in the order it tells them (§2). `#proof` is act
   * 05 but still sits after act 08 in the DOM — Step 23 is what moves the
   * gallery between Reclaim and Your finish — so the ordering rule is checked
   * in act order and the one chapter whose DOM position does not yet match its
   * number is named below. When Step 23 lands, `PENDING_ACT_MOVE` becomes `[]`.
   */
  const ACT_ORDER = ['portico', 'foundation', 'garage', 'vault', 'proof', 'finish-hall', 'commercial', 'consultation'];
  const PENDING_ACT_MOVE = ['proof'];

  test('numbers the acts 01 to 10 with one shared number for the two Reclaim rooms', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    const rendered = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.chapter-index')].map((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return {
        chapter: node.closest('[id]')?.id ?? '',
        text: (node.textContent ?? '').trim(),
        tagged: node.hasAttribute('data-act-label'),
        visible: style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && box.width > 0 && box.height > 0,
      };
    }));

    // Falsifiability: the act numbers really are on screen, and every act label
    // carries the hook this test selects on — a future label that forgets it
    // cannot slip past by being invisible to the query.
    expect(rendered.length, 'chapter indices rendered').toBeGreaterThan(0);
    expect(rendered.every((entry) => entry.visible), `every act label is visible: ${JSON.stringify(rendered)}`).toBe(true);
    expect(rendered.every((entry) => entry.tagged), 'every .chapter-index is tagged data-act-label').toBe(true);

    const domOrder = rendered.map((entry) => entry.text.slice(0, 2));
    const byChapter = new Map(rendered.map((entry) => [entry.chapter, entry.text.slice(0, 2)]));
    expect([...byChapter.keys()].sort()).toEqual([...ACT_ORDER].sort());

    // Starts at 01, and no number ever comes back after a different one has
    // been shown — a repeat is only legal for consecutive rooms of one act.
    expect(domOrder[0]).toBe('01');
    const firstSeen = domOrder.map((number, index) => domOrder.indexOf(number) === index || domOrder[index - 1] === number);
    expect(firstSeen.every(Boolean), `no number repeats non-consecutively: ${domOrder.join(' ')}`).toBe(true);
    const repeated = [...new Set(domOrder.filter((number, index) => domOrder.indexOf(number) !== index))];
    expect(repeated, `the only repeated act number is the Reclaim pair: ${domOrder.join(' ')}`).toEqual(['04']);
    expect(domOrder.filter((number) => number === '04')).toHaveLength(2);
    expect([byChapter.get('garage'), byChapter.get('vault')]).toEqual(['04', '04']);

    // Non-decreasing through the acts as the storyboard tells them.
    const actOrder = ACT_ORDER.map((chapter) => byChapter.get(chapter)!);
    const rising = actOrder.every((number, index) => index === 0 || Number(number) >= Number(actOrder[index - 1]));
    expect(rising, `act numbers rise in act order: ${actOrder.join(' ')}`).toBe(true);

    // Non-decreasing in DOM order too, once the one section that has not yet
    // moved into its act position is set aside by name rather than hidden.
    const settled = rendered.filter((entry) => !PENDING_ACT_MOVE.includes(entry.chapter));
    expect(settled.map((entry) => entry.chapter), 'every other chapter already stands in act order')
      .toEqual(ACT_ORDER.filter((chapter) => !PENDING_ACT_MOVE.includes(chapter)));
    const settledNumbers = settled.map((entry) => entry.text.slice(0, 2));
    const neverFalls = settledNumbers.every((number, index) => index === 0 || Number(number) >= Number(settledNumbers[index - 1]));
    expect(neverFalls, `act numbers never fall in DOM order: ${settledNumbers.join(' ')}`).toBe(true);

    // The reading panel under each chapter repeats that chapter's act number.
    const readings = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('[data-reading-for]')].map((node) => [
      node.dataset.readingFor ?? '',
      node.querySelector<HTMLElement>('[data-reading-act]')?.textContent?.trim() ?? '',
    ]));
    expect(readings.length).toBe(6);
    for (const [chapter, number] of readings) {
      expect(number, `reading panel for #${chapter}`).toBe(byChapter.get(chapter));
    }
  });

  test('routes the hero ribbon to the four act anchors it names', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const ribbon = page.locator('[data-hero-ribbon] a');
    await expect(ribbon).toHaveCount(4);
    expect(await ribbon.evaluateAll((nodes) => nodes.map((node) => [
      node.querySelector('span')?.textContent?.trim(),
      node.getAttribute('href'),
    ]))).toEqual([
      ['01', '#portico'],
      ['02', '#customer-reviews'],
      ['05', '#proof'],
      ['07', '#finish-hall'],
    ]);
    for (const href of ['#portico', '#customer-reviews', '#proof', '#finish-hall']) {
      await expect(page.locator(href)).toHaveCount(1);
    }
  });

  test('opens and closes the keyboard-accessible mobile primary menu', async ({ page }) => {
    await page.setViewportSize({ width: 700, height: 800 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const toggle = page.getByRole('button', { name: /primary menu/i });
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.focus();
    await toggle.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Services' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});
