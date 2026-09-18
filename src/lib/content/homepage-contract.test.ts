import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homepage = readFileSync(new URL('../../pages/index.astro', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');

describe('Follow the Floor semantic fallback', () => {
  it('opens on the pouring film without an artificial hero floor selector', () => {
    expect(homepage).not.toContain('luminous-passage-keyframe');
    expect(homepage).not.toContain('<JourneyControls');
    expect(homepage).toContain('class="pour-poster"');
    expect(homepage).toContain('fetchpriority="high"');
  });
  it('keeps useful, named destinations without JavaScript', () => {
    for (const chapter of ['portico', 'foundation', 'garage', 'vault', 'mancave', 'finish-hall', 'commercial', 'proof', 'consultation']) {
      expect(homepage).toContain(`id="${chapter}"`);
    }
      expect(homepage).toContain('Reclaim your garage or basement.');
  });
  /**
   * `COPY-DECK.md` Act 4. The headline persists across the bay, the second line
   * arrives in the vault third, and each of the three rooms carries its own
   * caption and sub. Every string here is the deck's, verbatim.
   */
  it('carries the Act 4 headline, second line, and all three room captions', () => {
    for (const line of [
      'Reclaim your garage or basement.',
      'Make room for what you love.',
      'The workshop. The gym. The car you look after.',
      'Garage floors for vehicles, storage, equipment, and everyday use.',
      'The space was always there.',
      'A hobby room, a place to train, or simply a more useful basement.',
      'A lounge below the house.',
      'Storage that became a room.',
    ]) {
      expect(homepage, `Act 4 copy deck line: ${line}`).toContain(line);
    }
    // A6 requires the concept label on every room, not only on the first.
    expect(homepage.match(/Architectural concept · not an installed project/g)).toHaveLength(3);
  });
  /**
   * The storyboard's ten acts (§2). `customer-reviews` (02), the archive
   * lattice (06), and `floor-planning` (09) render no act label yet, so they
   * are absent here by design — 06 in particular must NOT appear as a
   * placeholder before Step 23b builds the lattice.
   */
  it('labels every act that carries a chapter index with its storyboard number', () => {
    const labels = [...homepage.matchAll(/<p class="chapter-index"[^>]*>(\d{2}) \/ ([^<]+?)\s*(?:<span>|<\/p>)/g)]
      .map(([, number, name]) => `${number} / ${name}`);
    expect(labels).toEqual([
      '01 / The pour',
      '03 / Beneath the surface',
      '04 / Reclaim · garage',
      '04 / Reclaim · basement',
      '04 / Reclaim · lounge',
      '05 / See the difference',
      '07 / Your finish',
      '08 / Commercial',
      '10 / Talk to Denis',
    ]);
    expect(homepage).not.toContain('06 / ');
    expect(homepage).not.toContain('09 / ');
  });
  it('gives every reading panel the act number of the chapter it belongs to', () => {
    const readings = [...homepage.matchAll(/<ChapterReading id="([a-z-]+)" number="(\d{2})"/g)]
      .map(([, id, number]) => [id, number]);
    // Act 4's reading aside is ONE panel, hung off the last room, and it lands
    // after the bay rather than between its rooms. `COPY-DECK.md` authors a single
    // Act 4 aside (label + three bodies + one link), and a white stage between two
    // rooms would switch the media stage off in the middle of the horizontal
    // train. The two G2 asides it replaces (`garage` "Make room for what you
    // love", `vault` "A more useful basement") are carried over: bodies 1 and 2
    // are the garage aside's paragraphs and body 3 is the vault aside's coating
    // non-claim. The vault aside's opening line moved into the deck's own room-2
    // sub, which is now the basement room's caption.
    expect(readings).toEqual([
      ['foundation', '03'], ['mancave', '04'],
      ['finish-hall', '07'], ['commercial', '08'], ['consultation', '10'],
    ]);
  });
  it('carries no unused chapter-link table beside the hero ribbon', () => {
    expect(homepage).not.toContain('chapterLinks');
  });
  it('does not manufacture a Google total from selected testimonials', () => {
    expect(homepage).not.toContain('String(reviews.length)');
    expect(homepage).not.toContain('aggregateRating');
    expect(homepage).not.toContain('[...reviews, ...reviews]');
  });
  /**
   * Step 13 replaced `@import '@fontsource-variable/manrope'` with a self-hosted
   * @font-face over `public/fonts/manrope-latin-var.woff2`. The family is
   * unchanged and still the only one — what changed is that the URL is now
   * stable enough for `BaseLayout.astro` to preload by name, which a
   * Vite-hashed import could never be.
   */
  it('uses one architectural-modern font family and native scroll', () => {
    expect(styles).toContain("font-family: 'Manrope Variable'");
    expect(styles).toContain("src: url('/fonts/manrope-latin-var.woff2') format('woff2')");
    expect(styles).toContain('font-display: swap');
    expect(styles).not.toContain("@import '@fontsource-variable/manrope'");
    expect(styles).not.toContain("@import '@fontsource/instrument-serif");
    expect(styles).not.toContain('scroll-behavior: smooth');
  });
  it('holds the layout with a metric-matched fallback rather than an unstyled swap', () => {
    expect(styles).toContain("font-family: 'Manrope Fallback'");
    for (const descriptor of ['size-adjust:', 'ascent-override:', 'descent-override:', 'line-gap-override:']) {
      expect(styles).toContain(descriptor);
    }
    // The stack has to reach the adjusted face before any system font, or the
    // overrides never apply and the swap reflows every paragraph.
    expect(styles).toContain("--sans: 'Manrope Variable', 'Manrope Fallback',");
  });
});
