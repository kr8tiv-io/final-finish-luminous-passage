import { describe, expect, it } from 'vitest';
import { buildBusinessSchema, buildSiteGraph, buildArticleSchema, GOOGLE_MAPS_LISTING_URL } from './schema';

const businessInput = {
  businessId: 'https://www.finalfinishepoxy.ca/#business',
  siteUrl: 'https://www.finalfinishepoxy.ca/',
  logoUrl: 'https://www.finalfinishepoxy.ca/icons/icon-512.png',
  imageUrl: 'https://www.finalfinishepoxy.ca/images/brand/final-finish-epoxy-og.jpg',
};

describe('buildBusinessSchema', () => {
  it('never claims a town beyond Edmonton, Alberta (A8: not claimable without Denis confirmation)', () => {
    const schema = buildBusinessSchema(businessInput);
    const townNames = schema.areaServed.map((place) => place.name);
    expect(townNames).toEqual(['Edmonton', 'Alberta']);
    expect(townNames).not.toContain('Sherwood Park');
  });

  it('names Denis as founder with no surname (CLAUDE.md lock)', () => {
    expect(buildBusinessSchema(businessInput).founder).toEqual({ '@type': 'Person', name: 'Denis' });
  });

  it('never carries an address or an aggregateRating', () => {
    const schema = buildBusinessSchema(businessInput) as Record<string, unknown>;
    expect(schema.address).toBeUndefined();
    expect(schema.aggregateRating).toBeUndefined();
  });

  it('includes the Google Business Profile listing (verified cid) in sameAs', () => {
    expect(buildBusinessSchema(businessInput).sameAs).toContain(GOOGLE_MAPS_LISTING_URL);
  });
});

describe('buildSiteGraph', () => {
  it('produces exactly one business node and one website node, sharing the same @id link', () => {
    const graph = buildSiteGraph({ ...businessInput, websiteId: 'https://www.finalfinishepoxy.ca/#website' });
    const types = graph['@graph'].map((node) => node['@type']);
    expect(types).toEqual(['HomeAndConstructionBusiness', 'WebSite']);
    expect((graph['@graph'][1] as { publisher: { '@id': string } }).publisher['@id']).toBe(businessInput.businessId);
  });
});

describe('buildArticleSchema', () => {
  it('sets the required fields the Step 32 validator checks for', () => {
    const schema = buildArticleSchema({
      headline: 'Workshop Floor Coating Planning',
      description: 'A guide.',
      canonicalUrl: 'https://www.finalfinishepoxy.ca/resources/workshop-floor-coating/',
      datePublished: '2026-09-08T08:54:03-06:00',
      dateModified: '2026-09-08T08:54:03-06:00',
    });
    expect(schema['@type']).toBe('Article');
    expect(schema.headline).toBeTruthy();
    expect(schema.datePublished).toBeTruthy();
    expect(schema.author).toEqual({ '@type': 'Organization', name: 'Final Finish Epoxy' });
  });
});
