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
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  applySecurityHeaders(response.headers, context.url.protocol === 'https:');
  return response;
});
