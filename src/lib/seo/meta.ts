import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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

const FALLBACK_SIZE = Object.freeze({ width: 1200, height: 630 });

/**
 * Where a `public/`-relative asset can live, in the order worth trying:
 *  - `public/` under the project root derived from this module's own location. In dev the
 *    module is `src/lib/seo/meta.ts`; in the build it is inlined into `dist/server/chunks/*`,
 *    where the same assets sit under `dist/client/`.
 *  - `public/` under `process.cwd()` — only right when the server is launched from the
 *    project root, which the preview harness and a host process manager do not guarantee.
 * The on-demand routes (the 404 page, anything with `prerender = false`) run this at request
 * time, so a wrong root must never turn into a 500: a miss falls back to the default size.
 */
function candidateRoots(): string[] {
  const here = fileURLToPath(import.meta.url);
  return [
    resolve(dirname(here), '../../../public'),
    resolve(dirname(here), '../../client'),
    resolve(dirname(here), '../client'),
    resolve(process.cwd(), 'public'),
    resolve(process.cwd(), 'dist/client'),
  ];
}

/** Reads the real pixel size of a `public/`-relative image path, once per process. */
export async function getImageDimensions(publicPath: string): Promise<{ width: number; height: number }> {
  if (dimensionCache.has(publicPath)) return dimensionCache.get(publicPath)!;
  const relative = publicPath.replace(/^\//, '');
  const file = candidateRoots().map((root) => resolve(root, relative)).find((path) => existsSync(path));
  let size: { width: number; height: number } = FALLBACK_SIZE;
  if (file) {
    try {
      const { width, height } = await sharp(file).metadata();
      size = { width: width ?? FALLBACK_SIZE.width, height: height ?? FALLBACK_SIZE.height };
    } catch {
      size = FALLBACK_SIZE;
    }
  }
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
