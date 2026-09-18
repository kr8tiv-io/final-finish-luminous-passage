import { expect, test, type Page } from '@playwright/test';

/**
 * The publication contract, not a photo count. Three before/after pairings are
 * wired in `src/data/transformation-gallery.ts` and all three are `pending`,
 * so a staging build shows exactly those three behind the review badge, and a
 * production build shows none of them (covered by the unit test on
 * `resolveGalleryRender`, which is the decision this page renders from).
 */
test.describe('real project transformations', () => {
  test('stages exactly the three pending pairings behind the publication-review badge', async ({ page }) => {
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    const gallery = page.locator('.transformation-gallery');

    await expect(gallery.getByText('Project pairing review · not approved for publication')).toBeVisible();
    await expect(gallery.locator('[data-featured-panel]')).toHaveCount(3);
    await expect(gallery.locator('[data-explore-card]')).toHaveCount(3);
    // One featured plus one explore instance of each pairing.
    await expect(gallery.locator('[data-comparison]')).toHaveCount(6);
    await expect(gallery.locator('[data-comparison] img')).toHaveCount(12);
    await expect(gallery.getByText('Pairings shown in this review are pending publication approval.')).toBeVisible();
    await expect(gallery.locator('.transformation-gallery--selected')).toHaveCount(0);
    await expect(page.getByText('remain available in the archive')).toHaveCount(0);
  });

  test('routes the homepage proof section to the public archive', async ({ page }) => {
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    const proof = page.locator('#proof');
    await expect(proof.locator('.transformation-gallery')).toBeVisible();
    await expect(proof.getByRole('link', { name: /Explore the project archive/ })).toHaveAttribute('href', '/projects');
    await expect(proof.getByRole('link', { name: 'Final Finish Epoxy project archive' })).toHaveAttribute('href', 'https://www.finalfinishepoxy.ca/projects');
  });
});

/**
 * `/projects` and the homepage proof act now mount the same component
 * (`Comparison.tsx`) under the same publication rule. Step 11 deleted
 * `BeforeAfterProject`, which was a second divider implementation with its own
 * drag rules — the rule now has exactly one owner and one presentation per
 * environment:
 *
 *   staging    — the live divider on all six curated pairs, behind the
 *                "not approved for publication" note.
 *   production — six static two-up figures. A single photograph carries no
 *                pairing claim, so it publishes without Denis's approval;
 *                a divider asserts the two frames are one job, so it does not.
 *
 * The suite's own base URL is the staging build. `FFE_PROD_BASE_URL` points the
 * production half at a production build served alongside it; without it that
 * half is skipped rather than silently asserted against staging markup.
 */
const PROD_BASE_URL = process.env.FFE_PROD_BASE_URL;

const openArchive = async (page: Page, base?: string) => {
  await page.goto(base ? new URL('/projects', base).toString() : '/projects');
  await page.locator('#transformations').scrollIntoViewIfNeeded();
};

test.describe('the curated project archive', () => {
  test('staging publishes six reviewable comparisons, each with its own divider', async ({ page }) => {
    await openArchive(page);

    await expect(page.locator('.comparison-grid')).toHaveAttribute('data-pairing-mode', 'review');
    await expect(page.getByText('Project pairing review · not approved for publication')).toBeVisible();
    await expect(page.locator('.transformation-comparison')).toHaveCount(6);
    await expect(page.locator('[data-comparison]')).toHaveCount(6);
    await expect(page.getByRole('slider')).toHaveCount(6);
    // The retired second implementation must not come back alongside it.
    await expect(page.locator('.project-evidence')).toHaveCount(0);
    await expect(page.locator('[data-project-comparison]')).toHaveCount(0);
  });

  test('staging dividers reach both endpoints from the keyboard and clip the after photograph with them', async ({ page }) => {
    await openArchive(page);
    const stage = page.locator('[data-comparison]').first();
    await stage.scrollIntoViewIfNeeded();
    const slider = stage.getByRole('slider');
    // Falsifiability: the control is only meaningful once the island has taken
    // over, so prove it is live before asserting what it does.
    await expect(slider).toBeEnabled({ timeout: 30_000 });

    await slider.focus();
    await page.keyboard.press('Home');
    await expect(slider).toHaveValue('0');
    await expect(stage).toHaveAttribute('data-displayed-reveal', '0');
    await expect(stage.locator('.transformation-photo--after')).toHaveCSS('clip-path', /inset\(0px 0px 0px 0%\)|inset\(0px\)/);

    await page.keyboard.press('End');
    await expect(slider).toHaveValue('100');
    await expect(stage).toHaveAttribute('data-displayed-reveal', '100');
    await expect(stage.locator('.transformation-photo--after')).toHaveCSS('clip-path', /100%/);

    await stage.getByRole('button', { name: 'Show after photograph' }).click();
    await expect(slider).toHaveValue('0');
    await stage.getByRole('button', { name: 'Show before photograph' }).click();
    await expect(slider).toHaveValue('100');
  });

  test('staging serves both photographs of every pairing with a modern source', async ({ page }) => {
    await openArchive(page);

    await expect(page.locator('.transformation-photo picture')).toHaveCount(12);
    await expect(page.locator('.transformation-photo img')).toHaveCount(12);
    await expect(page.locator('.transformation-photo source[type="image/avif"]')).toHaveCount(12);
    await expect(page.locator('.transformation-photo source[type="image/webp"]')).toHaveCount(12);
    await expect(page.locator('.transformation-photo source[type="image/avif"]').first()).toHaveAttribute('srcset', /\/avif\//);
    await expect(page.locator('.transformation-photo source[type="image/webp"]').first()).toHaveAttribute('srcset', /\/webp\//);
    await expect(page.locator('.transformation-photo img').first()).toHaveAttribute('src', /\/jpeg\//);
    for (const image of await page.locator('.transformation-photo img').all()) {
      await expect(image).toHaveAttribute('loading', 'lazy');
      await expect(image).not.toHaveAttribute('alt', '');
    }
  });

  test('production publishes six static two-up figures and no pairing divider', async ({ page }) => {
    test.skip(!PROD_BASE_URL, 'Set FFE_PROD_BASE_URL to a production build to check the published presentation.');
    await openArchive(page, PROD_BASE_URL);

    await expect(page.locator('.comparison-grid')).toHaveAttribute('data-pairing-mode', 'static');
    const figures = page.locator('.project-evidence');
    await expect(figures).toHaveCount(6);
    await expect(page.getByRole('slider')).toHaveCount(0);
    await expect(page.locator('[data-comparison]')).toHaveCount(0);
    await expect(page.locator('.transformation-comparison')).toHaveCount(0);
    await expect(page.getByText('Project pairing review · not approved for publication')).toHaveCount(0);
    await expect(page.getByText('Project pairing awaiting confirmation')).toHaveCount(6);
  });

  test('production serves both photographs of every evidence pairing with a modern source', async ({ page }) => {
    test.skip(!PROD_BASE_URL, 'Set FFE_PROD_BASE_URL to a production build to check the published presentation.');
    await openArchive(page, PROD_BASE_URL);

    // Before and after for each of the six pairings.
    await expect(page.locator('.project-evidence img')).toHaveCount(12);
    await expect(page.locator('.project-evidence source[type="image/avif"]')).toHaveCount(12);
    await expect(page.locator('.project-evidence source[type="image/webp"]')).toHaveCount(12);
    await expect(page.locator('.project-evidence source[type="image/webp"]').first()).toHaveAttribute('srcset', /\/webp\//);
    await expect(page.locator('.project-evidence img').first()).toHaveAttribute('src', /\/jpeg\//);
    await expect(page.locator('.project-evidence img').first()).toHaveAttribute('loading', 'lazy');
    for (const caption of ['Concrete preparation', 'Finished surface']) {
      await expect(page.getByText(caption, { exact: true })).toHaveCount(6);
    }
  });
});
