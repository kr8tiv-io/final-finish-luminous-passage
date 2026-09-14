import { expect, test } from '@playwright/test';
import path from 'node:path';
import sharp from 'sharp';

test('film seeks stay visible and soft transitions reverse without stale chapter layers', async ({ page }) => {
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.journey')).toHaveAttribute('data-journey-enhanced','',{timeout:20000});
  const film = page.locator('.pour-film');
  await expect.poll(() => film.evaluate((video:HTMLVideoElement)=>video.readyState)).toBeGreaterThanOrEqual(2);
  for (const y of [100,230,160,310]) {
    await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),y);
    await expect(film).toHaveCSS('opacity','1');
    await expect.poll(()=>film.evaluate((video:HTMLVideoElement)=>!video.seeking)).toBe(true);
  }
  const breath = page.locator('[data-hall-from="foundation"][data-hall-to="garage"]');
  for (const progress of [.15,.5,.85,.5]) {
    await breath.evaluate((element,p)=>{
      const rect=element.getBoundingClientRect();
      window.scrollTo({top:rect.top+window.scrollY+rect.height*p-window.innerHeight/2,behavior:'instant'});
    },progress);
    await expect.poll(()=>page.locator('.journey').evaluate(el=>Number((el as HTMLElement).style.getPropertyValue('--dissolve')))).toBeCloseTo(progress,1);
    await expect(page.locator('.film-veil canvas')).toHaveAttribute('data-rendered-boundary','foundation:garage');
    await expect.poll(()=>page.locator('.film-veil canvas').getAttribute('data-rendered-progress').then(Number)).toBeCloseTo(progress,1);
  }
  await page.screenshot({path:test.info().outputPath('soft-lateral-transition.png')});
  const whiteExit=page.locator('[data-hall-from="portico"][data-hall-to="foundation"]');
  await whiteExit.evaluate(element=>{
    const rect=element.getBoundingClientRect();
    window.scrollTo({top:rect.top+window.scrollY+rect.height*.25-window.innerHeight/2,behavior:'instant'});
  });
  await expect(page.locator('.journey [data-media-active]')).toHaveCount(0);
  await expect(page.locator('.film-veil canvas')).toHaveAttribute('data-rendered-boundary','portico:foundation');
  await expect.poll(()=>page.locator('.film-veil canvas').getAttribute('data-rendered-progress').then(Number)).toBeCloseTo(.25,1);
  const whiteFrame = await page.screenshot({path:test.info().outputPath('white-to-pearl-transition.png')});
  const dimensions = await sharp(whiteFrame).metadata();
  for (const [x,y] of [[.15,.8],[.45,.75]]) {
    const sample = await sharp(whiteFrame).extract({left:Math.floor(dimensions.width!*x),top:Math.floor(dimensions.height!*y),width:8,height:8}).removeAlpha().stats();
    expect(sample.channels.every(channel=>channel.mean>232), 'The early white-to-stair dissolve must not retain a dark garage framebuffer').toBe(true);
  }
  await page.locator('.social-heading').evaluate(element=>window.scrollTo({top:element.getBoundingClientRect().top+window.scrollY-105,behavior:'instant'}));
  await expect(page.locator('.film-veil canvas')).toHaveAttribute('data-rendered-boundary','clear');
});

test('review cards reflow at narrow widths and remain useful without JavaScript', async ({ page, browser }) => {
  await page.setViewportSize({width:320,height:740});
  await page.goto('/#customer-reviews',{waitUntil:'domcontentloaded'});
  const motion = page.locator('.journey-motion-control');
  await expect(motion).toBeVisible();
  const motionBox = (await motion.boundingBox())!;
  for (const selector of ['.brand', '.menu-toggle', '.header-cta']) {
    const box = (await page.locator(selector).boundingBox())!;
    expect(motionBox.x + motionBox.width <= box.x || box.x + box.width <= motionBox.x, JSON.stringify({selector,motionBox,box})).toBe(true);
  }
  expect(await motion.evaluate(button => {
    const box=button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));
  })).toBe(true);
  await page.addStyleTag({content: '.review-card p { font-size: 1.7rem !important; line-height: 1.8 !important; letter-spacing: .12em !important; word-spacing: .16em !important; }'});
  const cards = await page.locator('.review-card').evaluateAll(cards => cards.map(card => {
    const copy = card.querySelector('p')!.getBoundingClientRect();
    const footer = card.querySelector('footer')!.getBoundingClientRect();
    return {height:card.clientHeight,overlap:copy.bottom>footer.top+1,overflow:card.scrollHeight>card.clientHeight+1};
  }));
  expect(cards.every(card => !card.overlap && !card.overflow)).toBe(true);
  expect(new Set(cards.map(card=>card.height)).size).toBe(1);
  const noJs = await browser.newContext({javaScriptEnabled:false});
  const staticPage = await noJs.newPage();
  await staticPage.goto('/',{waitUntil:'domcontentloaded'});
  await expect(staticPage.locator('.review-card')).toHaveCount(17);
  await expect(staticPage.getByRole('button',{name:'Next customer review',exact:true})).toBeDisabled();
  await expect(staticPage.getByRole('link',{name:'Leave a Google review'})).toHaveAttribute('href',/google.com/);
  await noJs.close();
});

test('early social proof is readable, uniform and horizontally navigable', async ({ page }) => {
  await page.goto('/',{waitUntil:'domcontentloaded'});
  expect(await page.locator('#portico').evaluate(hero => hero.nextElementSibling?.id)).toBe('customer-reviews');
  await page.locator('.social-heading').evaluate(element => window.scrollTo({top:element.getBoundingClientRect().top+window.scrollY-105,behavior:'instant'}));
  await expect(page.locator('.social-intro')).toHaveCSS('opacity','1');
  await page.screenshot({path:test.info().outputPath('social-proof-introduction.png')});
  await page.locator('#customer-reviews').scrollIntoViewIfNeeded();
  await expect(page.locator('.review-card')).toHaveCount(17);
  await expect(page.locator('.rating-count')).toContainText('30+ reviews on Google');
  await expect(page.getByRole('link', { name: 'Leave a Google review' })).toHaveAttribute('href', /google.com\/maps/);
  const sizes = await page.locator('.review-card').evaluateAll(cards => cards.map(card => ({ w:card.clientWidth, h:card.clientHeight })));
  expect(new Set(sizes.map(s => `${s.w}:${s.h}`)).size).toBe(1);
  const next = page.getByRole('button', { name: 'Next customer review', exact: true });
  await next.click();
  await expect.poll(() => page.locator('.review-gallery').evaluate(el => el.scrollLeft)).toBeGreaterThan(200);
  await page.locator('.review-gallery').evaluate(el => el.scrollTo({left:el.scrollWidth,behavior:'instant'}));
  await expect(next).toBeDisabled();
  await expect(page.getByText('Paul Tran', {exact:true})).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({path:test.info().outputPath('early-customer-proof.png')});
});

test('project comparisons keep photo roles and the approved stair concept remains intact', async ({ page }) => {
  const requested: string[] = [];
  page.on('request', request => requested.push(request.url()));
  await page.goto('/#foundation',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#foundation video')).toHaveCount(0);
  await expect(page.locator('#foundation .floor-film-poster')).toHaveAttribute('src', /pearl-stair/);
  await expect(page.locator('[data-material-lens]')).toBeVisible();
  await expect(page.locator('.transformation-card')).toHaveCount(3);
  await expect(page.locator('.transformation-card img')).toHaveCount(6);
  await expect(page.locator('.project-story')).toHaveCount(1);
  await expect(page.locator('.project-story .story-photo')).toHaveCount(2);
  await expect(page.locator('.project-story input[type="range"]')).toHaveCount(0);
  expect(requested.some(url => url.includes('epoxy-walkway.mp4'))).toBe(false);
  await page.screenshot({path:test.info().outputPath('pearl-stair.png')});
  await page.locator('#preparation-in-focus .story-heading').scrollIntoViewIfNeeded();
  await expect(page.locator('#preparation-in-focus .story-heading > div')).toHaveCSS('opacity','1');
  await page.locator('#preparation-in-focus .story-photo--preparation').scrollIntoViewIfNeeded();
  await expect(page.locator('#preparation-in-focus .story-photo--preparation')).toHaveCSS('opacity','1');
  await expect.poll(() => page.locator('#preparation-in-focus .story-photo--preparation img').evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
  await page.screenshot({path:test.info().outputPath('preparation-story.png')});
});

test('first paint remains a useful local-service page with progressive motion', async ({ page }) => {
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A better floor.A different feeling.');
  await expect(page.getByRole('link', { name: 'Request a quote', exact: true }).first()).toHaveAttribute('href', '/contact#quote');
  await expect(page.getByRole('link', { name: 'Try your floor', exact: true })).toHaveAttribute('href', '/floor-visualizer');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('.journey-chapter')).toHaveCount(8);
  await expect(page.locator('main.journey')).not.toHaveAttribute('data-threshold-study');
  await expect(page.locator('.film-veil canvas')).toHaveCount(1, { timeout: 20_000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.locator('.header-phone')).toBeHidden();
  const menu = page.locator('.menu-toggle');
  if (await menu.isVisible()) {
    // Pointer interception here caught Safari's former fixed-header call strip.
    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  }
  await page.evaluate(async () => { await document.fonts.ready; return true; });
  await page.screenshot({ path: test.info().outputPath('opening.png') });
});

test('the pouring film opens first, advances with scroll, and can be paused', async ({ page }) => {
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.journey-controls')).toHaveCount(0);
  await expect(page.locator('.hero-frame')).toHaveCount(0);
  await expect(page.locator('.pour-stage')).toHaveCSS('opacity', '1');
  await expect.poll(() => page.locator('.pour-film').evaluate((video: HTMLVideoElement) => video.readyState)).toBeGreaterThanOrEqual(2);
  // Mobile WebKit has no emulated wheel. Exercise the same native scroll event
  // here; a physical touch gesture remains a separate device acceptance gate.
  await page.evaluate(() => window.scrollBy({ top: 350, behavior: 'instant' }));
  await expect.poll(() => page.locator('.pour-film').evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(.2);
  await page.locator('#portico').evaluate((hero) => window.scrollTo({
    top: hero.getBoundingClientRect().bottom + window.scrollY - window.innerHeight / 2,
    behavior: 'instant',
  }));
  await expect.poll(() => page.locator('.pour-film').evaluate((video: HTMLVideoElement) => Math.abs(video.duration - video.currentTime))).toBeLessThan(.15);
  const pause = page.getByRole('button', { name: 'Pause visual motion', exact: true });
  await pause.focus(); await page.keyboard.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-journey-motion', 'still');
  await page.screenshot({ path: test.info().outputPath('paused-pour.png') });
});

test('reduced motion keeps content and local navigation available', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('html')).toHaveAttribute('data-journey-motion', 'still');
  await expect(page.getByRole('heading', { name: 'Reclaim your garage or basement.' })).toBeAttached();
  await expect(page.getByRole('button', { name: 'Reduced motion is on', exact: true })).toBeDisabled();
  await expect(page.locator('.journey')).not.toHaveAttribute('data-journey-enhanced');
  expect(await page.evaluate(() => [...document.querySelectorAll('video')].every(video => video.paused))).toBe(true);
});

test('consultation preserves finish and returns focus when going back', async ({ page }) => {
  await page.goto('/contact?finish=blue-hour&space=basement#quote',{waitUntil:'domcontentloaded'});
  await expect(page.getByText('Cobalt Terrazzo', { exact: true })).toBeVisible();
  await page.getByLabel('City or postal code').fill('Edmonton');
  await expect(page.getByRole('radio', { name: 'Basement', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Continue to project details' }).click();
  await expect(page.getByText('Step 2 of 3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.getByText('Step 1 of 3', { exact: true })).toBeVisible();
  await expect(page.locator('.quote-form [tabindex="-1"]').first()).toBeFocused();
  await page.getByRole('button', { name: 'Continue to project details' }).click();
  await page.getByRole('button', { name: 'Continue to contact details' }).click();
  await page.getByRole('radio', { name: 'Email', exact: true }).check();
  await expect(page.getByRole('textbox', { name: 'Email', exact: true })).toHaveAttribute('required', '');
  await expect(page.getByRole('textbox', { name: 'Phone (optional)', exact: true })).not.toHaveAttribute('required');
  // Deliberately do not submit to the client's real email account.
});

test('local photo editing keeps AI closed and comparison reaches both endpoints', async ({ page }) => {
  const uploads: string[] = [];
  page.on('request', request => { if (request.method() === 'POST') uploads.push(request.url()); });
  await page.goto('/floor-visualizer',{waitUntil:'domcontentloaded'});
  await expect(page.locator('input[type="file"]').first()).toBeEnabled({ timeout: 20_000 });
  await page.locator('input[type="file"]').first().setInputFiles(path.resolve('public/images/projects/generated/webp/img_3199.webp'));
  await expect(page.getByRole('img', { name: 'Your uploaded room preview' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Floor corner 1', exact: true })).toBeVisible();
  const compare = page.getByRole('slider', { name: 'Compare original photo with finish preview' });
  await compare.focus(); await page.keyboard.press('Home'); await expect(compare).toHaveValue('0');
  await page.keyboard.press('End'); await expect(compare).toHaveValue('100');
  await expect(page.getByRole('button', { name: 'Detect floor with AI' })).toHaveCount(0);
  expect(uploads).toEqual([]);
  await page.locator('.photo-stage').scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath('local-floor-preview.png') });
});

test('local brush can restore objects, undo, and reset when a photo is replaced', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Pointer automation is supplementary to a real touch-device brush review.');
  await page.goto('/floor-visualizer',{waitUntil:'domcontentloaded'});
  const input = page.locator('input[type="file"]').first();
  await expect(input).toBeEnabled({ timeout: 20_000 });
  await input.setInputFiles(path.resolve('public/images/projects/generated/webp/img_3199.webp'));
  await expect(page.getByRole('img', { name: 'Your uploaded room preview' })).toBeVisible();
  const erase = page.getByRole('button', { name: 'Erase object', exact: true });
  await expect(erase).toBeEnabled({ timeout: 20_000 });
  await erase.click();
  const surface = page.locator('.local-mask-brush-surface');
  await expect(surface).toHaveAttribute('data-brush-mode', 'erase');
  await surface.scrollIntoViewIfNeeded();
  const bounds = (await surface.boundingBox())!;
  const stroke = async () => {
    await page.mouse.move(bounds.x + bounds.width * .77, bounds.y + bounds.height * .60);
    await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width * .83, bounds.y + bounds.height * .62, { steps: 8 });
    await page.mouse.up();
  };
  await stroke();
  const undo = page.getByRole('button', { name: 'Undo stroke', exact: true });
  await expect(undo).toBeEnabled();
  await page.locator('.photo-stage').screenshot({ path: test.info().outputPath('local-object-mask.png') });
  await undo.click();
  await expect(undo).toBeDisabled();
  await surface.scrollIntoViewIfNeeded();
  // Re-measure after control focus scrolls the viewport.
  const nextBounds = (await surface.boundingBox())!;
  await page.mouse.click(nextBounds.x + nextBounds.width * .75, nextBounds.y + nextBounds.height * .62);
  await expect(undo).toBeEnabled();
  const photo = page.getByRole('img', { name: 'Your uploaded room preview' });
  const original = await photo.getAttribute('src');
  await page.locator('input[type="file"]').first().setInputFiles(path.resolve('public/images/projects/generated/webp/photo+2026-02-21,+11+09+41+am.webp'));
  await expect(photo).not.toHaveAttribute('src', original!);
  await expect(undo).toBeDisabled();
  await expect(surface).toHaveAttribute('data-brush-mode', 'off');
});
