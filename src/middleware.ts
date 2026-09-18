import { defineMiddleware } from 'astro:middleware';
import { applySecurityHeaders } from './lib/security/headers';

// Astro 7 auto-loads `src/middleware.ts` by resolving `${srcDir}middleware` in its own Vite
// plugin (`node_modules/astro/dist/core/middleware/vite-plugin.js`) — confirmed by reading that
// resolver before adding this file. No astro.config.mjs change is needed or made here.
//
// This only reaches on-demand (SSR) responses. Verified against `@astrojs/node`'s standalone
// server (`node_modules/@astrojs/node/dist/standalone.js`): every request hits a static-file
// handler first, which serves a matching prerendered page straight off disk and never calls
// into the Astro app (so never into this middleware) when a static file matches. In this repo
// that means every `*.astro` page (all prerendered) never sees this file at request time; only
// `src/pages/api/**` (each sets `prerender = false`) does. Prerendered/static HTML gets its
// headers from `scripts/build-prerender-headers.mjs` + the host layer instead — see
// `docs/context/DEV-CONTRACT.md`.
/**
 * Step 30 permanent redirects.
 *
 * The seven `/areas/<town>` pages are gone (see `src/pages/service-area.astro` for
 * why), so nothing prerenders at those paths any more. That is precisely what lets
 * this file redirect them: the static-file handler described above only short-
 * circuits the app when a file matches on disk, and after the deletion none does,
 * so these requests reach the Astro app and therefore reach this middleware. A
 * redirect declared in `astro.config.mjs` would not do the job — this project
 * builds static output with an adapter, and Astro emits a meta-refresh HTML page
 * for a config redirect in that mode, not the 301 a cutover needs.
 *
 * Keys are stored without a trailing slash and matched that way, so
 * `/areas/leduc` and `/areas/leduc/` both resolve.
 *
 * The 12 Squarespace cutover URLs (`/home`, `/blog/*`, and the rest of the A8
 * appendix list) are deliberately NOT here: none of them is an area URL, and Step
 * 40 owns that map in `docs/CUTOVER.md` after it re-crawls the live site.
 */
export const PERMANENT_REDIRECTS: Readonly<Record<string, string>> = {
  '/areas': '/service-area',
  '/areas/edmonton': '/service-area',
  '/areas/sherwood-park': '/service-area',
  '/areas/st-albert': '/service-area',
  '/areas/leduc': '/service-area',
  '/areas/fort-saskatchewan': '/service-area',
  '/areas/spruce-grove': '/service-area',
  '/areas/beaumont': '/service-area',
};

/** `/areas/leduc/` and `/areas/leduc` are the same key; `/` stays `/`. */
export function redirectTargetFor(pathname: string): string | undefined {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PERMANENT_REDIRECTS[normalized];
}

export const onRequest = defineMiddleware(async (context, next) => {
  const secure = context.url.protocol === 'https:';

  const target = redirectTargetFor(context.url.pathname);
  if (target) {
    const location = new URL(target, context.url);
    location.search = context.url.search;
    const redirect = new Response(null, { status: 301, headers: { location: location.pathname + location.search } });
    applySecurityHeaders(redirect.headers, secure);
    return redirect;
  }

  const response = await next();
  applySecurityHeaders(response.headers, secure);
  return response;
});
