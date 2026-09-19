#!/usr/bin/env node
/**
 * build-reading-zones.mjs — render `src/styles/reading-zones.css` from the one module
 * that declares a reading zone, `src/lib/motion/reading-zones.ts`.
 *
 * The generated file carries the per-chapter custom properties and nothing else; the
 * rules that consume them are authored in `src/styles/journey.css`. Run it after editing
 * a zone:
 *
 *   node scripts/build-reading-zones.mjs
 *
 * `src/lib/motion/reading-zones.test.ts` asserts the committed file equals this output,
 * so a forgotten run, or a hand edit to the CSS, fails `npm test` rather than shipping.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readingZonesCss } from '../src/lib/motion/reading-zones.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'src', 'styles', 'reading-zones.css');
const next = `${readingZonesCss()}\n`;
let previous = null;
try {
  previous = readFileSync(target, 'utf8');
} catch {
  previous = null;
}
if (previous === next) {
  console.log(`reading-zones: ${path.relative(root, target)} already current.`);
} else {
  writeFileSync(target, next);
  console.log(`reading-zones: wrote ${path.relative(root, target)} (${next.length} bytes).`);
}
