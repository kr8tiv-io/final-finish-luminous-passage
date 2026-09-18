/**
 * BreadcrumbList, auto-derived from the URL path.
 *
 * Every non-home route gets one so a page never has to hand-roll its own — `ResourceLayout`
 * previously built its own 3-level breadcrumb inline; that is now this same generic walk, since
 * `/resources/<slug>/` already matches the general "Home / section / this page" shape.
 */

/** Known top-level sections get a proper label; anything else falls back to a slugified guess. */
const SECTION_LABELS: Readonly<Record<string, string>> = {
  services: 'Services',
  resources: 'Resources',
  areas: 'Service Areas',
  projects: 'Projects',
  contact: 'Contact',
  about: 'About',
  warranty: 'Warranty',
  finishes: 'Finishes',
  'floor-visualizer': 'Floor Visualizer',
  process: 'Our Process',
  dev: 'Developer',
};

function titleCaseSlug(slug: string): string {
  return slug.split('-').filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

/** Strips the ` | Final Finish...` (or similar) site-name suffix pages append to `<title>`. */
function leafLabelFromTitle(pageTitle: string): string {
  return pageTitle.split(' | ')[0].trim();
}

export interface BreadcrumbItem {
  position: number;
  name: string;
  item: string;
}

export interface BreadcrumbList {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: Array<{ '@type': 'ListItem'; position: number; name: string; item: string }>;
}

/**
 * Builds the BreadcrumbList for `pathname` against `canonicalOrigin`, or returns null on the
 * homepage (a single-crumb "Home" trail is not a breadcrumb).
 */
export function buildBreadcrumbList(
  canonicalOrigin: URL,
  pathname: string,
  pageTitle: string,
): BreadcrumbList | null {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return null;

  const items: Array<{ '@type': 'ListItem'; position: number; name: string; item: string }> = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: new URL('/', canonicalOrigin).toString() },
  ];

  let cumulative = '';
  segments.forEach((segment, index) => {
    cumulative += `/${segment}`;
    const isLeaf = index === segments.length - 1;
    const name = isLeaf
      ? (leafLabelFromTitle(pageTitle) || SECTION_LABELS[segment] || titleCaseSlug(segment))
      : (SECTION_LABELS[segment] ?? titleCaseSlug(segment));
    items.push({
      '@type': 'ListItem',
      position: index + 2,
      name,
      item: new URL(`${cumulative}/`, canonicalOrigin).toString(),
    });
  });

  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items };
}
