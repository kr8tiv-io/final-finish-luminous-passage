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
    for (const chapter of ['portico', 'foundation', 'garage', 'vault', 'finish-hall', 'commercial', 'proof', 'consultation']) {
      expect(homepage).toContain(`id="${chapter}"`);
    }
      expect(homepage).toContain('Reclaim your garage or basement.');
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
      '07 / Your finish',
      '08 / Commercial',
      '05 / See the difference',
      '10 / Talk to Denis',
    ]);
    expect(homepage).not.toContain('06 / ');
    expect(homepage).not.toContain('09 / ');
  });
  it('gives every reading panel the act number of the chapter it belongs to', () => {
    const readings = [...homepage.matchAll(/<ChapterReading id="([a-z-]+)" number="(\d{2})"/g)]
      .map(([, id, number]) => [id, number]);
    expect(readings).toEqual([
      ['foundation', '03'], ['garage', '04'], ['vault', '04'],
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
  it('uses one architectural-modern font family and native scroll', () => {
    expect(styles).toContain("@import '@fontsource-variable/manrope'");
    expect(styles).not.toContain("@import '@fontsource/instrument-serif");
    expect(styles).not.toContain('scroll-behavior: smooth');
  });
});
