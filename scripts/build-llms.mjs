import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { deploymentSettings } from '../src/lib/deployment.js';

/**
 * llms.txt / llms-full.txt, generated from the built HTML (not hand-maintained).
 *
 * Runs after `scripts/build-prerender-headers.mjs` in the `postbuild` chain (see package.json),
 * so it walks the same `dist/client` this project's static output already exists in when this
 * script runs. `public/llms.txt` (committed, hand-written) still ships for `astro dev`/`astro
 * preview` before a build has run; this script overwrites the built copy with one derived from
 * every actual indexable page, which the hand-written file could not keep in sync with (it only
 * ever listed the primary nav, not all fifty `/resources` guides).
 */

const MAX_ROUTE_TEXT_BYTES = 8 * 1024;

async function walkHtmlFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walkHtmlFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      found.push(full);
    }
  }
  return found;
}

function routeFromFile(distClientDir, filePath) {
  const rel = relative(distClientDir, filePath).split(sep).join('/');
  if (rel === 'index.html') return '/';
  if (rel.endsWith('/index.html')) return `/${rel.slice(0, -'index.html'.length)}`;
  return `/${rel.slice(0, -'.html'.length)}`;
}

function extractTag(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1].trim() : '';
}

function decodeEntities(text) {
  return text
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&mdash;/g, '—')
    .replace(/&nbsp;/g, ' ');
}

function extractMainText(html) {
  const withoutNoise = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ');
  const mainMatch = withoutNoise.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  const scoped = mainMatch ? mainMatch[1] : withoutNoise;
  const text = decodeEntities(scoped.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  const bytes = Buffer.from(text, 'utf8');
  return bytes.length > MAX_ROUTE_TEXT_BYTES ? bytes.subarray(0, MAX_ROUTE_TEXT_BYTES).toString('utf8') : text;
}

async function main() {
  const siteEnvironment = process.env.SITE_ENV;
  const publicSiteUrl = process.env.PUBLIC_SITE_URL;
  if (!siteEnvironment || !publicSiteUrl) {
    console.log('build-llms: SITE_ENV/PUBLIC_SITE_URL not set, skipping (not a project build invocation).');
    return;
  }
  const deployment = deploymentSettings(siteEnvironment, publicSiteUrl);
  const distClientDir = join('dist', 'client');

  let htmlFiles;
  try {
    htmlFiles = await walkHtmlFiles(distClientDir);
  } catch {
    console.log(`build-llms: ${distClientDir} not found, skipping.`);
    return;
  }

  const routes = [];
  let skippedInternal = 0;
  for (const file of htmlFiles.sort()) {
    const html = await readFile(file, 'utf8');
    const route = routeFromFile(distClientDir, file);
    // Not a literal "is this page noindexed" check: on staging every page carries
    // noindex,nofollow (see src/lib/deployment.js `deploymentSettings` — the whole environment
    // is gated, not individual pages), and tests/e2e/seo.spec.ts's
    // "retains truthful AI guidance" case already asserts staging's llms.txt still lists real
    // pages such as /resources. So exclusion here is by route, matching the two routes that are
    // genuinely never real content in any environment: the 404 page and the /dev/* local-review
    // tree (which itself 404s outside development — see src/pages/dev/surface.astro).
    if (route === '/404' || route.startsWith('/dev/')) {
      skippedInternal += 1;
      continue;
    }
    const title = decodeEntities(extractTag(html, /<title>([^<]*)<\/title>/i));
    const description = decodeEntities(extractTag(html, /<meta\s+name=["']description["']\s+content=["']([^"']*)["']/i));
    const canonical = extractTag(html, /<link\s+rel=["']canonical["']\s+href=["']([^"']*)["']/i) || new URL(route, deployment.canonicalOrigin).toString();
    routes.push({ route, title, description, canonical, text: extractMainText(html) });
  }

  const siteSummary = [
    '# Final Finish Epoxy',
    '',
    'Final Finish Epoxy is an Edmonton concrete coating business. The website presents residential and commercial floor-coating services, real project photographs, finish inspiration, and educational planning resources.',
    '',
    '## Contact',
    '',
    '- Phone: (780) 991-1651',
    '- Email: finalfinishepoxy@gmail.com',
    `- Website: ${deployment.canonicalOrigin.toString()}`,
    '',
    '## Pages',
    '',
    ...routes.map((r) => `- ${r.title || r.route} — ${r.canonical} — ${r.description}`),
    '',
    'The resource library is educational planning copy. Scope, products, timing, warranties, credentials, and performance for a specific floor are confirmed in the quote, not as slogans on this file.',
    '',
  ].join('\n');

  const fullText = routes
    .map((r) => `## ${r.canonical}\n${r.title}\n\n${r.text}\n`)
    .join('\n---\n\n');

  await mkdir(distClientDir, { recursive: true });
  await writeFile(join(distClientDir, 'llms.txt'), siteSummary);
  await writeFile(join(distClientDir, 'llms-full.txt'), fullText);

  console.log(`Wrote llms.txt (${routes.length} indexable routes, ${skippedInternal} internal routes skipped) and llms-full.txt to ${distClientDir}.`);
}

await main();
