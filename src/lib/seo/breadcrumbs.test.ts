import { describe, expect, it } from 'vitest';
import { buildBreadcrumbList } from './breadcrumbs';

const origin = new URL('https://www.finalfinishepoxy.ca');

describe('buildBreadcrumbList', () => {
  it('returns null on the homepage — a single "Home" crumb is not a breadcrumb', () => {
    expect(buildBreadcrumbList(origin, '/', 'Final Finish Epoxy | Edmonton Epoxy Floor Coatings')).toBeNull();
  });

  it('numbers positions 1..n starting from Home', () => {
    const list = buildBreadcrumbList(origin, '/services', 'Epoxy Flooring Services Edmonton | Final Finish');
    expect(list?.itemListElement.map((item) => item.position)).toEqual([1, 2]);
    expect(list?.itemListElement[0]).toMatchObject({ name: 'Home', item: 'https://www.finalfinishepoxy.ca/' });
  });

  it('labels a known section from the map and the leaf from the stripped page title', () => {
    const list = buildBreadcrumbList(origin, '/resources/workshop-floor-coating', 'Workshop Floor Coating Planning | Final Finish Epoxy');
    expect(list?.itemListElement).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.finalfinishepoxy.ca/' },
      { '@type': 'ListItem', position: 2, name: 'Resources', item: 'https://www.finalfinishepoxy.ca/resources/' },
      { '@type': 'ListItem', position: 3, name: 'Workshop Floor Coating Planning', item: 'https://www.finalfinishepoxy.ca/resources/workshop-floor-coating/' },
    ]);
  });

  it('title-cases an unmapped ancestor segment as a last resort', () => {
    const list = buildBreadcrumbList(origin, '/blog/some-post', 'Some Post Title | Final Finish');
    expect(list?.itemListElement[1].name).toBe('Blog');
    expect(list?.itemListElement[2].name).toBe('Some Post Title');
  });
});
