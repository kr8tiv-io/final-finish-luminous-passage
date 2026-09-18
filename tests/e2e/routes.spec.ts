import { expect, test } from '@playwright/test';

const publicRoutes = [
  ['/services', 'Epoxy flooring services, built around the slab.'],
  ['/services/garage-floor-coating-edmonton', 'A garage floor you can wash off in March.'],
  ['/services/residential-epoxy-flooring', 'The rooms in the house nobody finished.'],
  ['/services/commercial-epoxy-flooring', 'Built around your working day.'],
  ['/services/concrete-solutions', 'The concrete decides what the floor can be.'],
  ['/service-area', 'Where we work.'],
  ['/finishes', 'Three finish families. 30 ways to begin.'],
  ['/projects', 'The floor is the evidence.'],
  ['/resources', 'Clear answers before you coat a floor.'],
  ['/about', 'A local finish, with a real name behind it.'],
  ['/process', 'How a floor actually goes.'],
] as const;

for (const [route, heading] of publicRoutes) {
  test(`${route} has a unique page proposition`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', new RegExp(`${route.replaceAll('/', '\\/')}$`));
  });
}

/**
 * Step 12. A route that does not opt into the router is a route that reloads the
 * document, which is the white frame the paper wipe exists to remove — and a route
 * whose header or canvas is not persisted hands the swap two elements to rebuild
 * instead of re-point. Both are properties of `BaseLayout`, so they are asserted per
 * route rather than once: a page that stops using the layout stops having them.
 */
for (const [route] of publicRoutes) {
  test(`${route} opts into the client router with the header and canvas persisted`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('meta[name="astro-view-transitions-enabled"]')).toHaveAttribute('content', 'true');
    await expect(page.locator('[data-site-header]')).toHaveAttribute('data-astro-transition-persist', 'site-header');
    await expect(page.locator('[data-surface-fallback]')).toHaveAttribute('data-astro-transition-persist', 'surface-band');
    await expect(page.locator('astro-island[data-astro-transition-persist="site-surface"]')).toHaveCount(1);
  });
}

/**
 * Step 30. Seven `/areas/<town>` pages were replaced by one `/service-area` page,
 * because six of the towns were a coverage claim `CONTEXT-SHEET.md` A8 forbids.
 * Deleting a URL that has been crawled is only safe if the old address keeps
 * resolving, so each one is asserted as a real 301 with a real Location rather
 * than being allowed to become a 404. `maxRedirects: 0` is what makes this
 * falsifiable: without it Playwright follows the hop and a 404 at the end of a
 * chain would still report 200.
 */
const retiredAreaRoutes = [
  '/areas',
  '/areas/edmonton',
  '/areas/sherwood-park',
  '/areas/st-albert',
  '/areas/leduc',
  '/areas/fort-saskatchewan',
  '/areas/spruce-grove',
  '/areas/beaumont',
];

for (const route of retiredAreaRoutes) {
  test(`${route} is permanently redirected to /service-area`, async ({ request }) => {
    const response = await request.get(route, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe('/service-area');
  });

  test(`${route}/ (trailing slash) is permanently redirected to /service-area`, async ({ request }) => {
    const response = await request.get(`${route}/`, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe('/service-area');
  });
}

test('the retired area pages are gone rather than quietly rebuilt', async ({ page }) => {
  await page.goto('/service-area', { waitUntil: 'domcontentloaded' });
  const footerLinks = await page.locator('.footer-areas a').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href')));
  expect(footerLinks.some((href) => href?.startsWith('/areas/'))).toBe(false);
  expect(footerLinks).toContain('/service-area');
});

test('quote form starts with project location and preserves direct calling', async ({ page }) => {
  await page.goto('/contact#quote', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { level: 1, name: 'Let’s talk about your space.' })).toBeVisible();
  await expect(page.getByLabel('City or postal code')).toBeVisible();
  await expect(page.getByRole('link', { name: /Call Denis/i }).first()).toHaveAttribute('href', 'tel:+17809911651');
  await expect(page.getByText('Step 1 of 3', { exact: true })).toBeVisible();
});

test('quote handoff delivers the selected project details to the local route fixture', async ({ page }) => {
  let delivered: Record<string, unknown> | undefined;
  await page.route('**/api/quote', async (route) => {
    delivered = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ reference: 'FFE-TEST123' }) });
  });
  await page.goto('/contact?finish=blue-hour&space=basement#quote', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Cobalt Terrazzo', { exact: true })).toBeVisible();
  await page.getByLabel('City or postal code').fill('Edmonton, AB');
  await page.getByRole('button', { name: 'Continue to project details' }).click();
  await page.getByLabel('Approximate size').selectOption('two-car');
  await page.getByLabel('Finish direction').selectOption('metallic');
  await page.getByRole('button', { name: 'Continue to contact details' }).click();
  await page.getByLabel('Name').fill('Alex Smith');
  await page.getByLabel('Email (optional)').fill('alex@example.com');
  await page.getByRole('textbox', { name: 'Phone', exact: true }).fill('780-555-0199');
  await page.getByLabel(/I agree Final Finish may contact me/i).check();
  await page.getByRole('button', { name: 'Send quote request' }).click();
  await expect(page.getByRole('heading', { name: 'Thank you. Your project details are on their way.' })).toBeVisible();
  await expect(page.getByText('FFE-TEST123')).toBeVisible();
  expect(delivered).toMatchObject({
    location: 'Edmonton, AB', spaceType: 'basement', sizeBand: 'two-car', finishInterest: 'metallic',
    name: 'Alex Smith', email: 'alex@example.com', phone: '780-555-0199', consent: true, visualizerFinishId: 'blue-hour',
  });
});

test('health endpoint exposes a cache-safe deployment probe', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toContain('no-store');
  await expect(response.json()).resolves.toMatchObject({ status: 'ok', service: 'final-finish-epoxy' });
});
