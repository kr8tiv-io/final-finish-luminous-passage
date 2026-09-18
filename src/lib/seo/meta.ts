import { resolve } from 'node:path';
import sharp from 'sharp';

/**
 * og:image resolution.
 *
 * `BaseLayout` used to hardcode `og:image:width`/`height` to 1200x630 no matter which image a
 * page actually passed as `imagePath` — several pages (contact, finishes, floor-visualizer,
 * process, projects) already pass their own image, and none of those files are 1200x630 (see the
 * dimensions below, read with `sharp` while building this step). Declaring the wrong size fails
 * crawlers that verify it, so dimensions are now read from the real file instead of assumed.
 */

// Route prefix -> default poster, for the many pages that pass no `imagePath` at all and would
// otherwise fall through to the site-wide default. Longest-prefix-first match. The already-set,
// purpose-cropped 1200x630 `final-finish-epoxy-og.jpg` (derived from the pour/keyframe hero, per
// `scripts/optimize-brand-assets.mjs`) stays the default — "the pour poster" — for every route
// this table does not name.
const ROUTE_IMAGE_MAP: ReadonlyArray<readonly [string, string]> = [
  ['/services', '/images/brand/epoxy-garage-poster.jpg'],
  ['/projects', '/images/brand/epoxy-walkway-poster.jpg'],
  ['/resources', '/images/brand/epoxy-finish-poster.jpg'],
  ['/finishes', '/images/brand/luminous-finish-hall.jpg'],
  ['/floor-visualizer', '/images/brand/luminous-finish-hall.jpg'],
  ['/about', '/images/brand/epoxy-consultation-poster.jpg'],
  ['/contact', '/images/brand/consultation-court.jpg'],
  ['/warranty', '/images/brand/epoxy-consultation-poster.jpg'],
  ['/process', '/images/brand/foundation-chamber.jpg'],
  ['/areas', '/images/brand/epoxy-foundation-poster.jpg'],
];

export const DEFAULT_OG_IMAGE = '/images/brand/final-finish-epoxy-og.jpg';

export function resolveImagePath(pathname: string, explicitImagePath?: string): string {
  if (explicitImagePath) return explicitImagePath;
  const hit = ROUTE_IMAGE_MAP.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit ? hit[1] : DEFAULT_OG_IMAGE;
}

const dimensionCache = new Map<string, { width: number; height: number }>();

/** Reads the real pixel size of a `public/`-relative image path, once per build process. */
export async function getImageDimensions(publicPath: string): Promise<{ width: number; height: number }> {
  if (dimensionCache.has(publicPath)) return dimensionCache.get(publicPath)!;
  const absolute = resolve(process.cwd(), 'public', publicPath.replace(/^\//, ''));
  const { width, height } = await sharp(absolute).metadata();
  const size = { width: width ?? 1200, height: height ?? 630 };
  dimensionCache.set(publicPath, size);
  return size;
}

export async function resolveSocialImage(
  pathname: string,
  siteUrl: URL,
  explicitImagePath?: string,
): Promise<{ url: URL; width: number; height: number; path: string }> {
  const path = resolveImagePath(pathname, explicitImagePath);
  const { width, height } = await getImageDimensions(path);
  return { url: new URL(path, siteUrl), width, height, path };
}
