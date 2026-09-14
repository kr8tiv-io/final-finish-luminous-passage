import { expect, test } from '@playwright/test';

test('saved still preference remains respected by the shared header on another route', async ({page})=>{
  await page.addInitScript(()=>localStorage.setItem('final-finish:journey-controls:v1',JSON.stringify({motionPreference:'still',selectedFinish:'alabaster-stone'})));
  await page.goto('/contact',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.site-header')).toHaveAttribute('data-header-still','');
  const menu=page.locator('.menu-toggle'); if(await menu.isVisible()) await menu.click();
  await expect(page.locator('.nav-label').first()).toHaveCSS('transition-duration','0s');
});

test('material navigation follows focus without moving its touch targets', async ({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const menu=page.locator('.menu-toggle');
  if(await menu.isVisible()) await menu.click();
  const nav=page.locator('[data-primary-navigation]');
  await nav.getByRole('link',{name:'Projects',exact:true}).focus();
  await expect(nav.locator('[data-nav-highlight]')).toHaveAttribute('data-active','true');
  await expect(nav.locator('[data-nav-highlight]')).toHaveAttribute('data-target','/projects');
  await nav.getByRole('link',{name:'Finishes',exact:true}).focus();
  await expect(nav.locator('[data-nav-highlight]')).toHaveAttribute('data-target','/finishes');
  await expect(page.locator('.header-progress')).toBeAttached();
  if(await menu.isVisible()) await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation',{name:'Follow the floor chapters'})).toBeVisible();
  await page.screenshot({path:test.info().outputPath('material-ribbon.png')});
});

test('titles have only a minimal text shadow and planning answers remain HTML', async ({page})=>{
  await page.goto('/#commercial',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#commercial .chapter-copy-surface')).toBeVisible();
  const wash=await page.locator('#commercial').evaluate(el=>getComputedStyle(el,'::after').display);
  expect(wash).toBe('none');
  expect(await page.locator('#commercial .chapter-copy-surface').evaluate(el=>getComputedStyle(el,'::before').display)).toBe('none');
  expect(await page.locator('#commercial .chapter-title').evaluate(el=>getComputedStyle(el,'::before').content)).toBe('none');
  await expect(page.locator('#commercial .chapter-title')).toHaveCSS('text-shadow','rgba(250, 249, 246, 0.45) 0px 1px 4px');
  await expect(page.locator('#commercial .lead')).toHaveCSS('text-shadow','rgba(250, 249, 246, 0.45) 0px 1px 4px');
  expect(await page.locator('#portico').evaluate(el=>getComputedStyle(el,'::after').display)).toBe('none');
  await expect(page.locator('#consultation .chapter-copy-surface')).toBeAttached();
  await expect(page.locator('#commercial .lead')).toHaveCSS('opacity','1');
  await page.screenshot({path:test.info().outputPath('commercial-unshaded-text.png')});
  await page.locator('#floor-planning').scrollIntoViewIfNeeded();
  await expect(page.getByRole('heading',{name:'Before you choose a colour.'})).toBeVisible();
  await page.locator('#floor-planning summary').first().click();
  await expect(page.locator('#floor-planning details').first()).toHaveAttribute('open','');
  await page.screenshot({path:test.info().outputPath('floor-planning.png')});
});

test('intent light responds to focus without moving links and clears in still mode', async ({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const link=page.locator('.header-cta');
  await expect(link).toHaveAttribute('data-intent-motion','');
  const before=(await link.boundingBox())!;
  await link.focus();
  await expect(link).toHaveAttribute('data-intent-active','true');
  const after=(await link.boundingBox())!;
  expect(Math.abs(after.x-before.x)+Math.abs(after.y-before.y)).toBeLessThan(1);
  await expect(link.locator('.intent-glint')).toHaveAttribute('aria-hidden','true');
  await page.getByRole('button',{name:'Pause visual motion',exact:true}).click();
  await expect(link).toHaveAttribute('data-intent-active','false');
  await expect(link.locator('.intent-glint')).toHaveCSS('opacity','0');
});

test('responsive heading masks settle and reflow without replaying hidden text', async ({page})=>{
  await page.goto('/',{waitUntil:'domcontentloaded'});
  const title=page.locator('#portico .display-title');
  await expect(title).toHaveAttribute('data-headline-style','line-rise');
  await expect(title).toHaveAttribute('data-headline-state','settled');
  await expect(title).toHaveCSS('text-wrap','wrap');
  const label=await title.getAttribute('aria-label');
  expect(label?.length).toBeGreaterThan(15);
  await page.setViewportSize({width:390,height:844});
  await expect(title).toHaveAttribute('data-headline-state','settled');
  await expect.poll(()=>title.locator('.headline-line').evaluateAll(lines=>lines.length>0&&lines.every(line=>getComputedStyle(line).opacity==='1'&&getComputedStyle(line).transform==='none'))).toBe(true);
  await page.getByRole('button',{name:'Pause visual motion',exact:true}).click();
  await expect(title).toHaveAttribute('data-headline-state','static');
  await expect(title).toBeVisible();
  await page.screenshot({path:test.info().outputPath('responsive-headline.png')});
});

test('consultation uses one poster composition and preparation retains genuine imagery', async ({page})=>{
  await page.goto('/#consultation',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#consultation .chapter-frame')).toHaveCount(0);
  await expect(page.locator('#consultation .floor-film-poster')).toHaveCount(1);
  await expect(page.locator('#consultation video')).toHaveCount(1);
  await expect(page.locator('[data-story-photo] picture')).toHaveCount(2);
  expect(await page.locator('[data-story-photo] picture').first().evaluate(el=>getComputedStyle(el).maskComposite.split(',').every(value=>value.trim()==='intersect'))).toBe(true);
  await page.locator('#consultation .chapter-title').scrollIntoViewIfNeeded();
  await expect(page.locator('#consultation .chapter-title')).toHaveAttribute('data-headline-state','settled');
  await page.screenshot({path:test.info().outputPath('consultation-single-scene.png')});
  await page.locator('[data-story-photo]').first().scrollIntoViewIfNeeded();
  await expect.poll(()=>page.locator('[data-story-photo] img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await expect(page.locator('[data-story-photo] picture').first()).toHaveCSS('opacity','1');
  await expect(page.locator('[data-story-photo] picture').last()).toHaveCSS('opacity','1');
  await page.screenshot({path:test.info().outputPath('preparation-feather.png')});
});

test('project gallery keeps horizontal travel separate from exact comparison endpoints', async ({page,browser})=>{
  await page.goto('/#proof',{waitUntil:'domcontentloaded'});
  const gallery=page.locator('.transformation-gallery');
  await expect(gallery.locator('.transformation-card')).toHaveCount(3);
  const stage=gallery.locator('.transformation-stage').first();
  const range=stage.getByRole('slider');
  await expect(range).toBeEnabled();
  await stage.scrollIntoViewIfNeeded();
  await expect.poll(()=>stage.locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).complete&&(image as HTMLImageElement).naturalWidth>0))).toBe(true);
  await range.focus(); await page.keyboard.press('Home');
  await expect(range).toHaveValue('0');
  await expect(stage.locator('.transformation-label')).toHaveText('Before');
  await expect(stage.locator('.transformation-photo--after')).toHaveCSS('clip-path','inset(0px 100% 0px 0px)');
  await page.keyboard.press('End'); await expect(range).toHaveValue('100');
  await expect(stage.locator('.transformation-label')).toHaveText('After');
  await expect(stage.locator('.transformation-photo--after')).toHaveCSS('clip-path','inset(0px 0% 0px 0px)');
  await page.keyboard.press('ArrowLeft'); await expect(range).toHaveValue('99');
  await stage.evaluate(el=>window.scrollTo({top:el.getBoundingClientRect().top+window.scrollY-100,behavior:'instant'}));
  const box=(await stage.boundingBox())!;
  await page.mouse.move(box.x+box.width*.75,Math.max(115,box.y+Math.min(box.height*.35,250)));
  await page.mouse.down();
  await page.mouse.move(box.x+box.width*.25,Math.max(115,box.y+Math.min(box.height*.35,250)),{steps:12});
  await page.mouse.up();
  expect(Number(await range.inputValue())).toBeLessThan(35);
  expect(await gallery.locator('.transformation-gallery__viewport').evaluate(el=>el.scrollLeft)).toBeLessThan(5);
  await stage.screenshot({path:test.info().outputPath('project-divider.png')});
  const next=page.getByRole('button',{name:'Next transformation',exact:true});
  await next.click();
  await expect(gallery.locator('.gallery-tabs button').nth(1)).toHaveAttribute('aria-current','true');
  await next.click();
  await expect(next).toBeDisabled();
  await expect(gallery.locator('.gallery-tabs button').nth(2)).toHaveAttribute('aria-current','true');
  await expect(gallery.locator('.transformation-card--portrait img').first()).toHaveCSS('object-fit','contain');
  await expect.poll(()=>gallery.locator('.transformation-gallery__viewport').evaluate(el=>(el as HTMLElement).style.scrollSnapType)).not.toBe('none');
  await expect.poll(()=>gallery.locator('.transformation-card').last().boundingBox().then(box=>box!.x+box!.width)).toBeLessThanOrEqual(page.viewportSize()!.width+1);
  const lastBounds=(await gallery.locator('.transformation-card').last().boundingBox())!;
  expect(lastBounds.x).toBeGreaterThanOrEqual(0);
  expect(lastBounds.x+lastBounds.width).toBeLessThanOrEqual(page.viewportSize()!.width+1);
  await gallery.locator('.transformation-card').last().scrollIntoViewIfNeeded();
  await page.screenshot({path:test.info().outputPath('project-gallery-portrait.png')});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:320,height:740});
  await expect(gallery.locator('.transformation-caption').last()).toHaveCSS('touch-action','auto');
  const controls=await gallery.locator('.transformation-gallery__controls button').evaluateAll(elements=>elements.map(element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,width:box.width,height:box.height};}));
  expect(controls.every(box=>box.left>=0&&box.right<=320&&box.width>=44&&box.height>=44)).toBe(true);
  const noJs=await browser.newContext({javaScriptEnabled:false});
  const staticPage=await noJs.newPage(); await staticPage.goto('/#proof',{waitUntil:'domcontentloaded'});
  await expect(staticPage.locator('.transformation-card')).toHaveCount(3);
  await expect(staticPage.getByRole('button',{name:'Next transformation',exact:true})).toBeDisabled();
  await expect(staticPage.locator('.transformation-range').first()).toBeDisabled();
  await noJs.close();
});

test('pinned projects travel horizontally then release with an immediate motion fallback', async ({page,isMobile})=>{
  test.skip(isMobile,'Phones retain direct native gallery gestures; pin geometry is exercised on the desktop viewport.');
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/#proof',{waitUntil:'domcontentloaded'});
  const gallery=page.locator('.transformation-gallery');
  await expect(gallery).toHaveAttribute('data-gallery-mode','pinned');
  const start=Number(await gallery.getAttribute('data-gallery-pin-start'));
  const end=Number(await gallery.getAttribute('data-gallery-pin-end'));
  expect(end-start).toBeGreaterThan(1000);
  const shell=gallery.locator('.transformation-gallery__pin-shell');
  const track=gallery.locator('.transformation-gallery__track');
  const divider=gallery.getByRole('slider').first();
  const original=await divider.inputValue();
  for(const progress of [.1,.5,.9,.5]) {
    await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),start+(end-start)*progress);
    await expect.poll(()=>shell.boundingBox().then(box=>box!.y)).toBeCloseTo(80,0);
    await expect.poll(()=>track.evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41)).toBeLessThan(-100);
    await expect(divider).toHaveValue(original);
    const box=(await gallery.locator('.transformation-gallery__controls').boundingBox())!;
    expect(box.y+box.height).toBeLessThan(850);
    await expect(page.locator('.journey')).toHaveAttribute('data-journey-on-white','');
  }
  await page.screenshot({path:test.info().outputPath('pinned-transformation-passage.png')});
  await gallery.getByRole('slider').last().focus();
  await expect.poll(()=>gallery.locator('.transformation-gallery__viewport').evaluate(el=>el.scrollLeft)).toBe(0);
  await expect(gallery.locator('.gallery-tabs button').last()).toHaveAttribute('aria-current','true');
  await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),end+180);
  await expect.poll(()=>shell.boundingBox().then(box=>box!.y)).toBeLessThan(0);
  await page.evaluate(y=>window.scrollTo({top:y,behavior:'instant'}),(start+end)/2);
  await page.getByRole('button',{name:'Pause visual motion',exact:true}).click();
  await expect(gallery).toHaveAttribute('data-gallery-mode','native');
  await expect(track).toHaveCSS('transform','none');
  await page.getByRole('link',{name:'Continue down'}).click();
  await expect(page.locator('#transformation-gallery-source')).toBeInViewport();
});
