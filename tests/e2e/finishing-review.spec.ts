import { expect, test } from '@playwright/test';

test('record the frozen opening handoff and finish headline for visual review', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/', { waitUntil: 'networkidle' });
  await expect(page.locator('#hero-title')).toHaveAttribute('data-headline-state', 'settled');
  await page.screenshot({ path: info.outputPath('01-opening.png') });
  const reviewTop = await page.locator('#customer-reviews').evaluate(el => el.getBoundingClientRect().top + scrollY);
  const height = page.viewportSize()!.height;
  const distance = Math.min(420, Math.max(180, height * .34));
  const samples: unknown[] = [];
  for (const [index, progress] of [0, .25, .5, .75, 1].entries()) {
    await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), reviewTop - distance + distance * progress - height / 2);
    await page.waitForTimeout(120);
    await page.screenshot({ path: info.outputPath(`02-handoff-${index}.png`) });
    samples.push(await page.evaluate(() => ({
      scrollY,
      canvas: [...document.querySelectorAll('.film-veil canvas')].map(canvas => ({
        boundary: (canvas as HTMLElement).dataset.renderedBoundary,
        progress: (canvas as HTMLElement).dataset.renderedProgress,
        opacity: getComputedStyle(canvas).opacity,
      })),
    })));
  }
  await page.locator('#social-title').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath('03-reviews-landed.png') });

  const title = page.locator('#finish-title');
  const titleTop = await title.evaluate(el => el.getBoundingClientRect().top + scrollY);
  await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), titleTop - height * .84);
  await page.waitForTimeout(100);
  const before = await title.boundingBox();
  await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), titleTop - height * .55);
  await page.waitForTimeout(100);
  await page.screenshot({ path: info.outputPath('04-finish-mask-entering.png') });
  await expect(title).toHaveAttribute('data-headline-state', 'settled');
  await page.screenshot({ path: info.outputPath('05-finish-mask-settled.png') });
  const after = await title.boundingBox();
  expect(after?.width).toBeCloseTo(before!.width, 1);
  expect(after?.height).toBeCloseTo(before!.height, 1);
  await expect(title).toHaveAttribute('aria-label', 'Find your finish.');
  await expect(page.locator('#finish-title .headline-line')).toHaveCount(1);
  await page.getByRole('button', { name: 'Pause visual motion' }).click();
  await title.scrollIntoViewIfNeeded();
  await expect(title).toHaveAttribute('data-headline-state', 'static');
  await expect(page.locator('#finish-title .headline-line')).toHaveCount(0);
  await page.screenshot({ path: info.outputPath('06-finish-still.png') });
  await info.attach('observed-state.json', { body: JSON.stringify({ samples, before, after, errors }, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('record the frozen gallery passage and native comparisons for independent review', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/#proof', { waitUntil: 'networkidle' });
  const gallery = page.locator('.transformation-gallery');
  await gallery.scrollIntoViewIfNeeded();
  await expect(gallery).toHaveClass(/is-hydrated/, { timeout: 15000 });
  const desktop = info.project.name === 'review-desktop';
  const observations: Record<string, unknown> = {};
  await expect(gallery).toHaveAttribute('data-gallery-layout', desktop ? 'passage' : 'native');
  const featured = gallery.locator('[data-featured-panel]');
  await expect(featured).toHaveCount(3);
  if (desktop) {
    const geometry = await gallery.evaluate(el => ({
      start: el.querySelector('.transformation-gallery__passage')!.getBoundingClientRect().top + scrollY - 88,
      travel: Number.parseFloat((el as HTMLElement).style.getPropertyValue('--passage-travel')),
    }));
    await page.mouse.move(2, 2);
    for (const index of [0, 1, 2]) {
      await page.evaluate(top => window.scrollTo({ top, behavior: 'instant' }), geometry.start + geometry.travel * index / 2);
      await expect(gallery).toHaveAttribute('data-featured-index', String(index));
      await page.waitForTimeout(180);
      await page.screenshot({ path: info.outputPath(`01-featured-${index}.png`) });
      observations[`featured-${index}`] = await featured.nth(index).evaluate(el => ({
        transform: getComputedStyle(el).transform,
        bounds: el.getBoundingClientRect().toJSON(),
        title: el.querySelector('h3')?.textContent,
      }));
    }
    await page.getByRole('button', { name: 'First featured project', exact: true }).click();
    await expect(gallery).toHaveAttribute('data-featured-index', '0');
    await page.getByRole('button', { name: 'Last featured project', exact: true }).click();
    await expect(gallery).toHaveAttribute('data-featured-index', '2');
    await page.getByRole('button', { name: 'First featured project', exact: true }).click();
    await expect(gallery).toHaveAttribute('data-featured-index', '0');
  } else {
    await featured.first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('01-native-featured-first.png') });
    for (const index of [1, 2]) {
      await page.getByRole('button', { name: 'Next featured project', exact: true }).click();
      await expect(gallery).toHaveAttribute('data-featured-index', String(index));
      await page.waitForTimeout(750);
      await expect(featured.nth(index)).toBeInViewport();
      await page.screenshot({ path: info.outputPath(`01-native-featured-${index}.png`) });
    }
    for (const index of [1, 0]) {
      await page.getByRole('button', { name: 'Previous featured project', exact: true }).click();
      await expect(gallery).toHaveAttribute('data-featured-index', String(index));
    }
    await featured.first().scrollIntoViewIfNeeded();
  }

  const firstStage = featured.first().locator('[data-comparison]');
  await firstStage.getByRole('button', { name: 'Show before photograph', exact: true }).click();
  await expect(firstStage).toHaveAttribute('data-displayed-reveal', '100');
  await page.screenshot({ path: info.outputPath('02-before-endpoint.png') });
  await firstStage.getByRole('button', { name: 'Show after photograph', exact: true }).click();
  await expect(firstStage).toHaveAttribute('data-displayed-reveal', '0');
  await page.screenshot({ path: info.outputPath('03-after-endpoint.png') });
  const firstSlider = firstStage.getByRole('slider');
  await firstSlider.focus();
  await firstSlider.press('Home');
  for (let step = 0; step < 5; step += 1) await firstSlider.press('ArrowRight');
  await expect(firstStage).toHaveAttribute('data-displayed-reveal', '5');
  if (desktop) {
    await firstSlider.evaluate(el => (el as HTMLElement).blur());
    const box = await firstStage.boundingBox();
    await page.mouse.move(box!.x + box!.width * .7, box!.y + box!.height * .45);
    await expect.poll(async () => Number(await firstStage.getAttribute('data-displayed-reveal'))).toBeGreaterThan(65);
    await page.screenshot({ path: info.outputPath('04-hover-preview.png') });
    await page.mouse.move(2, 2);
    await expect(firstStage).toHaveAttribute('data-displayed-reveal', '5');
    await page.screenshot({ path: info.outputPath('05-hover-restored.png') });
  }

  await page.getByRole('link', { name: 'Skip featured comparisons', exact: true }).click();
  const explore = page.locator('#transformation-explore');
  await expect(explore).toHaveAttribute('data-explore-index', '0');
  const cards = explore.locator('[data-explore-card]');
  await expect(cards.first().locator('[data-comparison]')).toHaveAttribute('data-displayed-reveal', '5');
  const exploreTop = await explore.boundingBox();
  observations.exploreHeading = exploreTop;
  for (const index of [0, 1, 2]) {
    if (index > 0) {
      await explore.getByRole('button', { name: 'Next project comparison', exact: true }).click();
      await expect(explore).toHaveAttribute('data-explore-index', String(index));
    }
    await page.waitForTimeout(700);
    await expect(cards.nth(index)).toHaveAttribute('data-active', 'true');
    await expect(cards.nth(index).locator('[data-comparison]')).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`06-explore-${index}.png`) });
    observations[`explore-${index}`] = await cards.nth(index).evaluate(el => ({
      transform: getComputedStyle(el).transform,
      bounds: el.getBoundingClientRect().toJSON(),
      stageBounds: el.querySelector('[data-comparison]')!.getBoundingClientRect().toJSON(),
      rationale: el.querySelector('.transformation-rationale')?.textContent,
    }));
    if (index === 2) await cards.nth(index).locator('.transformation-rationale').screenshot({ path: info.outputPath('06-last-caption-detail.png') });
    if (index === 1) {
      const slider = cards.nth(index).getByRole('slider');
      await slider.focus();
      await slider.press('End');
      await expect(cards.nth(index).locator('[data-comparison]')).toHaveAttribute('data-displayed-reveal', '100');
    }
  }
  await explore.getByRole('button', { name: 'Previous project comparison', exact: true }).click();
  await expect(explore).toHaveAttribute('data-explore-index', '1');
  await expect(cards.nth(1).locator('[data-comparison]')).toHaveAttribute('data-displayed-reveal', '100');
  await explore.getByRole('button', { name: 'Previous project comparison', exact: true }).click();
  await expect(explore).toHaveAttribute('data-explore-index', '0');
  await expect(cards.first().locator('[data-comparison]')).toHaveAttribute('data-displayed-reveal', '5');
  await page.getByRole('button', { name: 'Pause visual motion', exact: true }).click();
  await expect(gallery).toHaveAttribute('data-gallery-layout', 'native');
  await featured.nth(1).scrollIntoViewIfNeeded();
  await expect(featured.nth(1).locator('[data-comparison]')).toHaveAttribute('data-displayed-reveal', '100');
  await page.screenshot({ path: info.outputPath('07-still-native-second.png') });
  observations.nativePanels = await featured.evaluateAll(els => els.map(el => ({
    position: getComputedStyle(el).position,
    transform: getComputedStyle(el).transform,
    hidden: el.getAttribute('aria-hidden'),
    inert: (el as HTMLElement).inert,
  })));
  await info.attach('observed-gallery-state.json', { body: JSON.stringify({ observations, errors }, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});
