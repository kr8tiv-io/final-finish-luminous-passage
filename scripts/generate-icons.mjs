import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

// Source: the committed raster brand mark (674x521, transparent background). This is the same
// asset SiteHeader.astro renders at 67x52 — see src/components/SiteHeader.astro. Generating the
// manifest/PWA icon set from it (rather than favicon.svg, which is a monochrome glyph meant only
// for the browser tab) keeps every installed-app surface showing the real two-colour mark.
const source = resolve('public/images/brand/final-finish-epoxy-mark.png');
const output = resolve('public/icons');
await mkdir(output, { recursive: true });

// Warm white (#FAF9F6) is the site's page background (see BaseLayout.astro's <meta
// name="theme-color">), so a "contain" fit onto that colour is invisible as a padding box on the
// standard icons and gives the maskable icon its required full-bleed safe-zone background.
const PAGE_BACKGROUND = '#faf9f6';

async function squareIcon(size, { background = PAGE_BACKGROUND, padding = 0.14 } = {}) {
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(source).resize({ width: inner, height: inner, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: mark, gravity: 'centre' }])
    .png();
}

await Promise.all([
  // Standard manifest icons (any-purpose): safe to show cropped to a circle or squircle.
  squareIcon(192).then((img) => img.toFile(resolve(output, 'icon-192.png'))),
  squareIcon(512).then((img) => img.toFile(resolve(output, 'icon-512.png'))),
  // Maskable: Android applies its own mask shape, so the artwork must sit inside the ~80% safe
  // zone (a 40% padding radius from centre) with the background filling all the way to the edge.
  squareIcon(512, { padding: 0.22 }).then((img) => img.toFile(resolve(output, 'icon-512-maskable.png'))),
  // iOS home-screen icon: iOS applies its own rounded-square mask and does not composite
  // transparency, so this one gets an opaque background baked in at the platform's own size.
  squareIcon(180).then((img) => img.toFile(resolve(output, 'apple-touch-icon.png'))),
  // Classic favicon sizes for browsers/bookmarks that do not use favicon.svg.
  squareIcon(32, { padding: 0.08 }).then((img) => img.toFile(resolve(output, 'favicon-32.png'))),
  squareIcon(16, { padding: 0.04 }).then((img) => img.toFile(resolve(output, 'favicon-16.png'))),
]);

console.log(`Generated icon set in ${output}: icon-192.png, icon-512.png, icon-512-maskable.png, apple-touch-icon.png, favicon-32.png, favicon-16.png.`);
