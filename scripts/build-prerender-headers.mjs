import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { securityHeadersFor } from '../src/lib/security/headers.ts';

// Prerendered/static HTML (every *.astro page in this project — see src/middleware.ts for how
// that was confirmed against @astrojs/node's standalone server) never passes through Astro's
// request pipeline at request time, so it cannot get its security headers from
// src/middleware.ts. This script writes the same header map to a JSON file after a build, for
// the host/reverse-proxy layer (the Caddy config on the eventual VPS path, or an equivalent
// static-header feature on whichever Hostinger path ships first) to apply to every prerendered
// response. See docs/context/DEV-CONTRACT.md for the current gap: nothing in this repo applies
// this file automatically yet.
const outputPath = join('dist', 'prerender-headers.json');

const payload = {
  generatedAt: new Date().toISOString(),
  appliesTo: 'Every prerendered/static route (all *.astro pages in this project). SSR routes under src/pages/api/** already get these from src/middleware.ts and do not need this file.',
  headers: securityHeadersFor(false),
  httpsHeaders: securityHeadersFor(true),
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`Wrote ${outputPath} (${Object.keys(payload.headers).length} headers; +Strict-Transport-Security over https).`);
