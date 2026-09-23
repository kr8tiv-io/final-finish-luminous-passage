import { describe, expect, it } from 'vitest';
import { buildBusinessSchema, buildSiteGraph, buildArticleSchema, buildFaqSchema, GOOGLE_MAPS_LISTING_URL } from './schema';

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
    expect(schema.author).toEqual({ '@type': 'Organization', name: 'Final Finish Epoxy Coatings' });
  });

  it('points author and publisher at the business entity when given its @id', () => {
    const businessId = 'https://www.finalfinishepoxy.ca/#business';
    const schema = buildArticleSchema({
      headline: 'Garage Coating Costs in Edmonton',
      description: 'A guide.',
      canonicalUrl: 'https://www.finalfinishepoxy.ca/resources/garage-floor-coating-cost-edmonton/',
      datePublished: '2026-09-22T08:00:00-06:00',
      dateModified: '2026-09-22T08:00:00-06:00',
      businessId,
      logoUrl: 'https://www.finalfinishepoxy.ca/icons/icon-512.png',
      imageUrl: 'https://www.finalfinishepoxy.ca/images/brand/epoxy-finish-poster.jpg',
      section: 'planning',
    });
    expect(schema.author).toMatchObject({ '@id': businessId, name: 'Final Finish Epoxy Coatings' });
    expect(schema.publisher).toEqual(schema.author);
    expect(schema.image).toEqual(['https://www.finalfinishepoxy.ca/images/brand/epoxy-finish-poster.jpg']);
    expect(schema.mainEntityOfPage).toEqual({ '@type': 'WebPage', '@id': 'https://www.finalfinishepoxy.ca/resources/garage-floor-coating-cost-edmonton/' });
  });
});

describe('buildFaqSchema', () => {
  it('mirrors on-page questions as FAQPage, and returns null when there are none', () => {
    const url = 'https://www.finalfinishepoxy.ca/resources/heated-garage-floor-coating/';
    expect(buildFaqSchema([], url)).toBeNull();
    const schema = buildFaqSchema([{ question: 'Can grinding damage in-floor heating tubes?', answer: 'Surface grinding removes only a thin layer.' }], url);
    expect(schema?.['@type']).toBe('FAQPage');
    expect(schema?.mainEntity).toEqual([
      { '@type': 'Question', name: 'Can grinding damage in-floor heating tubes?', acceptedAnswer: { '@type': 'Answer', text: 'Surface grinding removes only a thin layer.' } },
    ]);
  });
});
