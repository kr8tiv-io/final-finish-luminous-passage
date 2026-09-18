/**
 * The one security header map for the whole site (Step 10). Every prerendered page and every
 * on-demand (SSR) response gets the same policy — there is no per-route variation, so this is a
 * flat map rather than a per-pathname table.
 *
 * Two consumers:
 * - `src/middleware.ts` applies this live, per request, to on-demand responses (`/api/**`, the
 *   only routes with `prerender = false` in this project — see each route file).
 * - `scripts/build-prerender-headers.mjs` writes the same map to `dist/prerender-headers.json`
 *   after a build, for the host/reverse-proxy layer to apply to prerendered/static HTML, which
 *   never passes through Astro's request pipeline at request time (confirmed against
 *   `@astrojs/node`'s standalone server: it serves a matching static file straight off disk
 *   before an incoming request ever reaches `astro:middleware`). See
 *   `docs/context/DEV-CONTRACT.md` for the full explanation and the current gap.
 */

/** Content-Security-Policy, one directive per array entry, joined with `; ` below. */
const CONTENT_SECURITY_POLICY_DIRECTIVES = [
  "default-src 'self'",
  // 'unsafe-inline' + blob: — the FilmVeil/journey motion stack loads its Three.js shader
  // work and worker/decoder bundles through blob: URLs; there is no build step yet that
  // hashes or nonces the inline bootstrap script, so 'unsafe-inline' stays until one does.
  "script-src 'self' 'unsafe-inline' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self' blob:",
  // Vite inlines assets under its assetsInlineLimit as base64 data: URIs directly into the
  // CSS bundle rather than emitting a separate file — verified in the real production build,
  // dist/client/_astro/SiteFooter.*.css ships a small subsetted @font-face this way. Without
  // `data:` here the built homepage fails its own CSP on a real, shipped font, not a
  // hypothetical one.
  "font-src 'self' data:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
];

export const CONTENT_SECURITY_POLICY = CONTENT_SECURITY_POLICY_DIRECTIVES.join('; ');

/** Headers sent on every response, regardless of protocol. */
export const BASE_SECURITY_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Content-Type-Options': 'nosniff',
});

export const STRICT_TRANSPORT_SECURITY_HEADER = 'Strict-Transport-Security';
// 2 years, subdomains included; not preload-submitted yet (that is a one-way, cross-origin
// commitment this repo has not made).
export const STRICT_TRANSPORT_SECURITY_VALUE = 'max-age=63072000; includeSubDomains';

/**
 * The full header set for one response. HSTS is meaningless (and actively confusing during
 * local http development) on a plaintext connection, so it is added only when the request
 * itself arrived over https.
 */
export function securityHeadersFor(isHttps: boolean): Record<string, string> {
  const headers: Record<string, string> = { ...BASE_SECURITY_HEADERS };
  if (isHttps) headers[STRICT_TRANSPORT_SECURITY_HEADER] = STRICT_TRANSPORT_SECURITY_VALUE;
  return headers;
}

/** Applies `securityHeadersFor(isHttps)` onto a live `Headers` instance (a `Response`'s). */
export function applySecurityHeaders(target: Headers, isHttps: boolean): void {
  for (const [name, value] of Object.entries(securityHeadersFor(isHttps))) {
    target.set(name, value);
  }
}
