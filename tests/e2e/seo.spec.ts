import { expect, test } from '@playwright/test';

test('publishes truthful business and website structured data', async ({ page }) => {
  await page.goto('/');
  const graphScript = page.locator('script[type="application/ld+json"][data-site-schema]');
  await expect(graphScript).toHaveCount(1);
  const graph = JSON.parse((await graphScript.textContent()) ?? '{}')['@graph'];
  expect(graph).toEqual(expect.arrayContaining([
    expect.objectContaining({ '@type': 'HomeAndConstructionBusiness', telephone: '+1-780-991-1651', email: 'finalfinishepoxy@gmail.com', founder: { '@type': 'Person', name: 'Denis' } }),
    expect.objectContaining({ '@type': 'WebSite', name: 'Final Finish Epoxy' }),
  ]));
  expect(graph[0].areaServed).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Edmonton' }),
  ]));
  // Step 32: A8 lists towns beyond Edmonton as not claimable without a written Denis
  // confirmation — the pre-Step-32 schema named all six capital-region towns here.
  expect(graph[0].areaServed).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ name: 'Sherwood Park' }),
  ]));
  expect(graph[0].address).toBeUndefined();
  expect(graph[0].aggregateRating).toBeUndefined();
});

test('emits exactly one BreadcrumbList, positioned 1..n, on an interior page but not the homepage', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('script[type="application/ld+json"][data-breadcrumb-schema]')).toHaveCount(0);

  await page.goto('/resources/workshop-floor-coating/');
  const breadcrumbScript = page.locator('script[type="application/ld+json"][data-breadcrumb-schema]');
  await expect(breadcrumbScript).toHaveCount(1);
  const breadcrumb = JSON.parse((await breadcrumbScript.textContent()) ?? '{}');
  expect(breadcrumb['@type']).toBe('BreadcrumbList');
  expect(breadcrumb.itemListElement.map((item: { position: number }) => item.position)).toEqual([1, 2, 3]);
  expect(breadcrumb.itemListElement[0].name).toBe('Home');
});

test('publishes an Article schema on a resources guide with a real, non-invented date', async ({ page }) => {
  await page.goto('/resources/workshop-floor-coating/');
  const articleScript = page.locator('script[type="application/ld+json"][data-page-schema]');
  await expect(articleScript).toHaveCount(1);
  const article = JSON.parse((await articleScript.textContent()) ?? '{}');
  expect(article['@type']).toBe('Article');
  expect(article.headline).toBeTruthy();
  expect(article.author).toEqual({ '@type': 'Organization', name: 'Final Finish Epoxy' });
  expect(new Date(article.datePublished).toString()).not.toBe('Invalid Date');
  expect(new Date(article.dateModified).getTime()).toBeGreaterThanOrEqual(new Date(article.datePublished).getTime());
});

test('serves a valid web app manifest with reachable icons', async ({ page, request }) => {
  await page.goto('/');
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toBe('/manifest.webmanifest');
  const manifestResponse = await request.get(manifestHref!);
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = await manifestResponse.json();
  expect(manifest.name).toBe('Final Finish Epoxy Coatings');
  expect(Array.isArray(manifest.icons)).toBe(true);
  for (const icon of manifest.icons) {
    const iconResponse = await request.get(icon.src);
    expect(iconResponse.ok()).toBeTruthy();
  }
  const appleTouchIconHref = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
  expect(appleTouchIconHref).toBe('/icons/apple-touch-icon.png');
  const appleTouchIconResponse = await request.get(appleTouchIconHref!);
  expect(appleTouchIconResponse.ok()).toBeTruthy();
});

test('canonical tag matches the requested URL on sampled routes', async ({ page }) => {
  for (const path of ['/', '/services', '/resources/workshop-floor-coating/', '/contact', '/areas/leduc/']) {
    await page.goto(path);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    const expectedPath = path === '/' ? '/' : path;
    expect(new URL(canonical!).pathname.replace(/\/$/, '') || '/').toBe(expectedPath.replace(/\/$/, '') || '/');
  }
});

test('renders the 404 page with the site header/nav and a real 404 status', async ({ page }) => {
  const response = await page.goto('/this-page-does-not-exist-anywhere');
  expect(response?.status()).toBe(404);
  await expect(page.locator('[data-site-header]')).toBeVisible();
  await expect(page.locator('h1')).toContainText('That page is not here.');
  // Both the persistent header nav and this page's own button row link to /services and
  // /contact, so scope to the page body to avoid Playwright's strict-mode ambiguity.
  await expect(page.locator('#main-content a[href="/services"]')).toBeVisible();
  await expect(page.locator('#main-content a[href="/contact"]')).toBeVisible();
});

test('llms-full.txt is reachable and carries full per-route text alongside llms.txt', async ({ request }) => {
  const full = await request.get('/llms-full.txt');
  expect(full.ok()).toBeTruthy();
  const copy = await full.text();
  // Unlike the curated llms.txt summary, llms-full.txt mirrors real page text verbatim — so it
  // legitimately includes the homepage's actual dated Google rating line ("5.0 · 30+ Google
  // reviews, checked <date>"), which is a sourced fact (A8), not the self-serving/stale claim
  // the llms.txt test below guards against. This test checks reachability and real coverage.
  expect(copy).toContain('finalfinishepoxy.ca/resources/');
  expect(copy).toContain('finalfinishepoxy.ca/services');
});

test('blocks crawlers on staging while retaining truthful AI guidance', async ({ request }) => {
  const robots = await request.get('/robots.txt');
  const robotsText = await robots.text();
  expect(robotsText).toContain('Disallow: /');
  expect(robotsText).not.toContain('Sitemap:');

  const llms = await request.get('/llms.txt');
  const copy = await llms.text();
  expect(copy).toContain('Final Finish Epoxy');
  expect(copy).toContain('(780) 991-1651');
  expect(copy).toContain('/resources');
  expect(copy).not.toMatch(/5\.0|best in Edmonton|lifetime warranty/i);
});

test('sends the Step 10 security header set on on-demand (SSR) responses', async ({ request }) => {
  // src/middleware.ts only reaches on-demand routes (everything under src/pages/api/**, each
  // marked `prerender = false`) — see docs/context/DEV-CONTRACT.md, "Security headers", for why
  // prerendered *.astro pages are asserted separately (or not at all) rather than here.
  const response = await request.get('/api/health');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("default-src 'self'");
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['content-security-policy']).toContain("connect-src 'self' blob:");
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
  expect(headers['x-content-type-options']).toBe('nosniff');
  // The dev/build servers this suite runs against are always plain http; HSTS must never be
  // sent on a non-https response.
  expect(headers['strict-transport-security']).toBeUndefined();
});
