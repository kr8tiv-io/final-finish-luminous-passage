import { describe, expect, it } from 'vitest';
import { resolveImagePath, getImageDimensions, resolveSocialImage, DEFAULT_OG_IMAGE } from './meta';

describe('resolveImagePath', () => {
  it('prefers an explicit imagePath over the route table', () => {
    expect(resolveImagePath('/services', '/images/brand/consultation-court.jpg')).toBe('/images/brand/consultation-court.jpg');
  });

  it('matches a route-prefix default when no explicit image is given', () => {
    expect(resolveImagePath('/resources/workshop-floor-coating')).toBe('/images/brand/epoxy-finish-poster.jpg');
  });

  it('falls back to the site default pour poster for an unmapped route', () => {
    expect(resolveImagePath('/warranty-questions-nobody-mapped')).toBe(DEFAULT_OG_IMAGE);
  });
});

describe('getImageDimensions / resolveSocialImage', () => {
  it('reads the real pixel size of the resolved image instead of assuming 1200x630', async () => {
    // Regression: og:image:width/height used to be hardcoded to 1200x630 for every page, but
    // several pages (contact, finishes, process, projects) pass images that are not that size.
    const size = await getImageDimensions('/images/brand/foundation-chamber.jpg');
    expect(size).toEqual({ width: 1672, height: 941 });
  });

  it('resolves a full social image descriptor with a correct absolute url', async () => {
    const result = await resolveSocialImage('/process', new URL('https://www.finalfinishepoxy.ca/'), '/images/brand/foundation-chamber.jpg');
    expect(result.url.toString()).toBe('https://www.finalfinishepoxy.ca/images/brand/foundation-chamber.jpg');
    expect(result.width).toBe(1672);
    expect(result.height).toBe(941);
  });
});
