import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const homepage = readFileSync(new URL('../../pages/index.astro', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../../styles/global.css', import.meta.url), 'utf8');
const footer = readFileSync(new URL('../../components/SiteFooter.astro', import.meta.url), 'utf8');
const ring = readFileSync(new URL('../../components/home/ReviewRing.astro', import.meta.url), 'utf8');
const track = readFileSync(new URL('../../components/home/ProcessTrack.astro', import.meta.url), 'utf8');

/**
 * The homepage's contract after the 2026-09-22 "acts and paper" rebuild.
 *
 * What this file used to assert, and what replaced it (named so nothing is dropped
 * silently):
 *   - ten storyboard act labels (`chapter-index` "01 / The pour" ...) — retired with
 *     the labels themselves on Matt's review; now asserted ABSENT.
 *   - three reclaim rooms incl. `#mancave` — Matt: "remove the second car scene
 *     entirely"; now two rooms, garage then basement, and no mancave.
 *   - a concept label on every room — replaced by ONE site-wide disclosure in the
 *     footer; the per-room label is asserted absent.
 *   - `data-hall-*` breaths and `data-journey-white-stage` director hooks — the
 *     director is retired on this page; order is asserted on section ids instead.
 *   - `ChapterReading` panels with act numbers — replaced by one `*-details` reading
 *     section after each act.
 */
describe('the homepage, acts and paper', () => {
  it('opens on the pouring film, with its poster as the eager, high-priority image', () => {
    expect(homepage).not.toContain('luminous-passage-keyframe');
    expect(homepage).not.toContain('<JourneyControls');
    expect(homepage).toContain('class="act-poster"');
    expect(homepage).toContain('fetchpriority="high"');
    expect(homepage).toContain('data-film="portico"');
  });

  it('keeps useful, named destinations without JavaScript', () => {
    for (const id of ['portico', 'foundation', 'reclaim', 'garage', 'vault', 'proof', 'archive', 'finish-hall', 'commercial', 'consultation']) {
      expect(homepage, `#${id}`).toContain(`id="${id}"`);
    }
    // Two destinations are rendered by the components that own them.
    expect(ring).toContain('id="customer-reviews"');
    expect(track).toContain('id="process"');
    expect(homepage).toContain('<ReviewRing');
    expect(homepage).toContain('<ProcessTrack');
    expect(homepage).not.toContain('id="mancave"');
    expect(homepage).not.toContain('epoxy-mancave');
  });

  it('carries the reclaim act once: one headline, two rooms, their captions', () => {
    expect(homepage.match(/Reclaim your <em>garage or basement\.<\/em>/g)).toHaveLength(1);
    for (const line of [
      'The workshop. The gym. The car you look after.',
      'Garage floors for vehicles, storage, equipment, and everyday use.',
      'A lounge below the house.',
      'Storage that became a room.',
      'The space was always there.',
      'Make room for what you love',
    ]) {
      expect(homepage, `reclaim copy: ${line}`).toContain(line);
    }
  });

  it('labels no act, and discloses concept pictures once, in the footer', () => {
    expect(homepage).not.toContain('class="chapter-index"');
    expect(homepage).not.toContain('not an installed project');
    expect(homepage).not.toContain('Material concept film');
    expect(footer).toContain('concept visualizations');
    expect(footer).toContain('real Final Finish work');
  });

  it('puts the archive between the comparisons and the finish act, with no typed count', () => {
    const proof = homepage.indexOf('id="proof"');
    const archive = homepage.indexOf('id="archive"');
    const finish = homepage.indexOf('id="finish-hall"');
    expect(proof).toBeGreaterThan(-1);
    expect(archive).toBeGreaterThan(proof);
    expect(finish).toBeGreaterThan(archive);
    expect(homepage).toContain('data-archive-section');
    expect(homepage).toContain('photoCount={ARCHIVE_PHOTO_COUNT}');
    expect(homepage).not.toContain('96 photographs');
  });

  it('follows every film act with its own reading section', () => {
    for (const act of ['foundation', 'reclaim', 'finish-hall', 'commercial', 'consultation']) {
      const at = homepage.indexOf(`id="${act}"`);
      const details = homepage.indexOf(`id="${act}-details"`);
      expect(at, act).toBeGreaterThan(-1);
      expect(details, `${act}-details`).toBeGreaterThan(at);
    }
  });

  it('sends the finish act to the visualizer with its handoff', () => {
    expect(homepage).toContain('href="/floor-visualizer?from=finish-hall"');
  });

  it('does not manufacture a Google total from selected testimonials', () => {
    expect(homepage).not.toContain('String(reviews.length)');
    expect(homepage).not.toContain('aggregateRating');
    expect(homepage).not.toContain('[...reviews, ...reviews]');
  });

  /**
   * Step 13's self-hosted Manrope is still the text face; 2026-09-22 added one display
   * face (Cormorant Garamond, OFL) for headlines. Both keep a metric-matched fallback.
   */
  it('uses the text face and the display face, both self-hosted, both swapping', () => {
    expect(styles).toContain("font-family: 'Manrope Variable'");
    expect(styles).toContain("src: url('/fonts/manrope-latin-var.woff2') format('woff2')");
    expect(styles).toContain("font-family: 'Cormorant Garamond'");
    expect(styles).toContain("url('/fonts/cormorant-garamond-latin-500.woff2')");
    expect(styles).toContain('font-display: swap');
    expect(styles).not.toContain("@import '@fontsource-variable/manrope'");
    expect(styles).not.toContain('scroll-behavior: smooth');
  });

  it('holds the layout with metric-matched fallbacks rather than an unstyled swap', () => {
    expect(styles).toContain("font-family: 'Manrope Fallback'");
    expect(styles).toContain("font-family: 'Cormorant Fallback'");
    for (const descriptor of ['size-adjust:', 'ascent-override:', 'descent-override:', 'line-gap-override:']) {
      expect(styles).toContain(descriptor);
    }
    expect(styles).toContain("--sans: 'Manrope Variable', 'Manrope Fallback',");
    expect(styles).toContain("--display: 'Cormorant Garamond', 'Cormorant Fallback',");
  });
});
