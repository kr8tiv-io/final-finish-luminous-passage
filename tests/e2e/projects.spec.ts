import { expect, test } from '@playwright/test';

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

  /**
   * The same publication rule as the homepage gallery, on the other page that
   * shows the archive. `BeforeAfterProject` only renders the draggable
   * comparison when `pairingApproved` is true, and `projects.astro` passes no
   * approval, so today the page publishes six honest two-up evidence figures
   * and zero comparisons. The old assertion here claimed six published
   * comparisons with A/B sources; that contract does not exist. Step 11 folds
   * this page onto the gallery's single Comparison component, and the
   * draggable/keyboard behaviour is covered on the real comparisons in
   * transformation-ribbon.spec.ts meanwhile.
   */
  test('shows the curated archive pairings as unapproved evidence, not as published comparisons', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('#transformations').scrollIntoViewIfNeeded();

    await expect(page.locator('.project-comparison')).toHaveCount(6);
    await expect(page.getByText('Project pairing awaiting confirmation')).toHaveCount(6);
    await expect(page.locator('[data-project-comparison]')).toHaveCount(0);
    await expect(page.getByRole('slider')).toHaveCount(0);
  });

  test('serves both photographs of every evidence pairing with a modern source', async ({ page }) => {
    await page.goto('/projects');
    await page.locator('#transformations').scrollIntoViewIfNeeded();

    const figures = page.locator('.project-evidence');
    await expect(figures).toHaveCount(6);
    // Before and after for each of the six pairings.
    await expect(page.locator('.project-evidence img')).toHaveCount(12);
    await expect(page.locator('.project-evidence source[type="image/webp"]')).toHaveCount(12);
    await expect(page.locator('.project-evidence source[type="image/webp"]').first()).toHaveAttribute('srcset', /\/webp\//);
    await expect(page.locator('.project-evidence img').first()).toHaveAttribute('src', /\/jpeg\//);
    await expect(page.locator('.project-evidence img').first()).toHaveAttribute('loading', 'lazy');
    for (const caption of ['Concrete preparation', 'Finished surface']) {
      await expect(page.getByText(caption, { exact: true })).toHaveCount(6);
    }
  });

  test('routes the homepage proof section to the public archive', async ({ page }) => {
    await page.goto('/#proof', { waitUntil: 'domcontentloaded' });
    const proof = page.locator('#proof');
    await expect(proof.locator('.transformation-gallery')).toBeVisible();
    await expect(proof.getByRole('link', { name: /Explore the project archive/ })).toHaveAttribute('href', '/projects');
    await expect(proof.getByRole('link', { name: 'Final Finish Epoxy project archive' })).toHaveAttribute('href', 'https://www.finalfinishepoxy.ca/projects');
  });
});
