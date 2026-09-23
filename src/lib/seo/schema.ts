/**
 * The site-wide business/website JSON-LD graph, and the Article schema for guides.
 *
 * `@type: HomeAndConstructionBusiness` (a recognised LocalBusiness subtype — see
 * https://schema.org/HomeAndConstructionBusiness) was chosen over the bare `LocalBusiness` type
 * back in Step 12/13 and is asserted on by name in `tests/e2e/seo.spec.ts`; this step keeps that
 * type rather than downgrading it, and treats it as "the LocalBusiness node" everywhere a
 * validator needs exactly one of those, keyed on the stable `@id` below.
 *
 * `areaServed` previously listed all seven capital-region towns the pre-Step-32 code claimed.
 * `docs/context/CONTEXT-SHEET.md` A8 lists "towns beyond Edmonton" as **not claimable** absent a
 * written Denis confirmation, and flags this exact field as a live-site risk that needed
 * resolving "no later than Step 29" — it was still in the code at Step 32, so this step drops the
 * six unconfirmed towns and keeps only the two facts A8 actually verifies: Edmonton, Alberta.
 */

export const GOOGLE_MAPS_LISTING_URL = 'https://www.google.com/maps?cid=7470239776211762202';

// Verified in docs/context/CONTEXT-SHEET.md A8/A7 and already used elsewhere in the repo
// (public/llms.txt, src/components/SiteFooter.astro) — not invented for this step.
const SAME_AS = [
  'https://www.facebook.com/profile.php?id=61573826827114',
  'https://www.instagram.com/final_finish_epoxy/',
  GOOGLE_MAPS_LISTING_URL,
];

export interface BusinessSchemaInput {
  businessId: string;
  siteUrl: string;
  logoUrl: string;
  imageUrl: string;
}

export function buildBusinessSchema({ businessId, siteUrl, logoUrl, imageUrl }: BusinessSchemaInput) {
  return {
    '@type': 'HomeAndConstructionBusiness',
    '@id': businessId,
    name: 'Final Finish Epoxy Coatings',
    url: siteUrl,
    logo: logoUrl,
    image: imageUrl,
    telephone: '+1-780-991-1651',
    email: 'finalfinishepoxy@gmail.com',
    // A8: "Founded by Denis" is the only claimable founder fact — no surname is confirmed on the
    // live site or by Denis (see CLAUDE.md locks and CLAIMS-LEDGER.md).
    founder: { '@type': 'Person', name: 'Denis' },
    // A8: Google listing verified 2026-09-18 — Flooring contractor, service-area business,
    // Mon-Fri 8-5.
    openingHoursSpecification: {
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      opens: '08:00',
      closes: '17:00',
    },
    areaServed: [
      { '@type': 'City', name: 'Edmonton' },
      { '@type': 'AdministrativeArea', name: 'Alberta' },
    ],
    sameAs: SAME_AS,
    // No `address` (A8: no street address is claimable) and no `aggregateRating` (Step 32 gate:
    // zero self-serving AggregateRating anywhere on the site).
  } as const;
}

export interface WebsiteSchemaInput {
  websiteId: string;
  siteUrl: string;
  businessId: string;
}

export function buildWebsiteSchema({ websiteId, siteUrl, businessId }: WebsiteSchemaInput) {
  return {
    '@type': 'WebSite',
    '@id': websiteId,
    url: siteUrl,
    name: 'Final Finish Epoxy',
    inLanguage: 'en-CA',
    publisher: { '@id': businessId },
  } as const;
}

export function buildSiteGraph(input: BusinessSchemaInput & { websiteId: string }) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      buildBusinessSchema(input),
      buildWebsiteSchema({ websiteId: input.websiteId, siteUrl: input.siteUrl, businessId: input.businessId }),
    ],
  };
}

export interface ArticleSchemaInput {
  headline: string;
  description: string;
  canonicalUrl: string;
  datePublished: string;
  dateModified: string;
  /** The site graph's business `@id`: author and publisher point at the same entity. */
  businessId?: string;
  logoUrl?: string;
  imageUrl?: string;
  section?: string;
}

export function buildArticleSchema({ headline, description, canonicalUrl, datePublished, dateModified, businessId, logoUrl, imageUrl, section }: ArticleSchemaInput) {
  // One entity, named the same way the business node names it, so search engines and
  // answer engines resolve the guides to the business rather than to a second, bare
  // "Final Finish Epoxy" organisation.
  const organisation = {
    '@type': 'Organization',
    ...(businessId ? { '@id': businessId } : {}),
    name: 'Final Finish Epoxy Coatings',
    ...(logoUrl ? { logo: { '@type': 'ImageObject', url: logoUrl } } : {}),
  };
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline,
    description,
    datePublished,
    dateModified,
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    ...(imageUrl ? { image: [imageUrl] } : {}),
    ...(section ? { articleSection: section } : {}),
    inLanguage: 'en-CA',
    author: organisation,
    publisher: organisation,
    isAccessibleForFree: true,
  } as const;
}

export interface FaqItem {
  question: string;
  answer: string;
}

/** FAQPage for the questions a guide answers on the page itself (never hidden copy). */
export function buildFaqSchema(items: readonly FaqItem[], canonicalUrl: string) {
  if (!items.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    '@id': `${canonicalUrl}#questions`,
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  } as const;
}
