/**
 * READING ZONES — one declaration of where a media chapter's words live, and of the
 * paper that goes behind them.
 *
 * Every homepage chapter that carries film or a poster behind its copy has a reading
 * zone. Before this module the zone was implicit and scattered: the band was a stop list
 * in `readable-experience.css`, the hero's wash was a second stop list, and Step 17 added
 * a third one in a bespoke `(min-width: 681px) and (max-width: 1100px)` block because the
 * hero's ribbon row ran past the end of the horizontal wash at 768 and the phone number
 * in it measured 1.73:1. Three places to edit, no way to check that the words were still
 * inside the paper.
 *
 * ── THE BOX ──────────────────────────────────────────────────────────────────────────
 * Four numbers, all fractions of the viewport, describing where the words are:
 *
 *   left, width     of the viewport WIDTH. The copy column.
 *   bottom, height  of the viewport HEIGHT, measured from the CHAPTER's bottom border
 *                   edge upward. `bottom` is the gap under the last line, `height` the
 *                   band the words occupy.
 *
 * The bottom edge of the chapter is the anchor because every media chapter parks its copy
 * on its own floor (`align-content: end` and a bottom padding), and the hero is centred in
 * a box of known height — so this measure does not move as the visitor scrolls, which a
 * viewport-top measure would. The box is what `output/step-16/measure-zones.mjs --check`
 * asserts against, using the same definition of "the reading zone's text" that
 * `scripts/measure-contrast.mjs` uses: the chapter's `.chapter-content` if it has one,
 * the whole chapter if it does not (the three reclaim rooms).
 *
 * ── THE WASH ─────────────────────────────────────────────────────────────────────────
 * Two extents and one alpha, because the composition genuinely has two shapes:
 *
 *   band    fraction of the viewport HEIGHT, from the chapter's floor up, washed across
 *           the full width and feathered out over `ZONE_FEATHER` above that. 0 = none.
 *   column  fraction of the viewport WIDTH, from the left edge, washed for the act's full
 *           height and feathered out over `ZONE_EDGE` past it. 0 = none.
 *   wash    peak alpha of `--paper` in both. 1 is the settled reading state.
 *
 * A chapter whose copy sits on its floor needs only the band. The hero needs the column,
 * because the pour has to hold the right of the frame — and at 768 it needs both, which
 * is exactly the L-shape Step 17 hand-wrote. `band` is always a little taller than the
 * box's top so the wash contains the words rather than ending at them; no rule anywhere
 * puts paper behind a glyph and nowhere else, because that is the halo CLAUDE.md rejects.
 *
 * ── WHERE THE NUMBERS GO ─────────────────────────────────────────────────────────────
 * `readingZonesCss()` renders them into `src/styles/reading-zones.css` as custom
 * properties on the chapter element, and nothing else. The rules that CONSUME them — the
 * two gradient layers, and the two elements that paint them — are authored once in
 * `src/styles/journey.css` under "READING ZONES". One owner for the numbers, one owner
 * for the composition. `scripts/build-reading-zones.mjs` writes the file and
 * `reading-zones.test.ts` fails when the committed file is not what this module emits, so
 * a hand edit to the CSS cannot survive a test run.
 *
 * @see docs/context/EXPERIENCE-STORYBOARD.md §2 (copy bottom-left in media chapters, the
 *      phone plan per act, Act 10's "paper wash only behind the words") and §8 directive
 *      8 (390 px is a jury device, every gate is measured there too).
 */

/** The eight chapters that paint film or a poster behind their own copy. */
export type ReadingZoneChapter =
  | 'portico' | 'foundation' | 'garage' | 'vault' | 'mancave'
  | 'finish-hall' | 'commercial' | 'consultation';

/** The three bands the rest of the homepage CSS already breaks at. */
export type ReadingZoneBreakpoint = 'phone' | 'tablet' | 'desktop';

export interface ReadingZone {
  /** Fraction of the viewport width at which the copy column starts. */
  readonly left: number;
  /** Fraction of the viewport width the copy column occupies. */
  readonly width: number;
  /** Fraction of the viewport height between the chapter's floor and the last line. */
  readonly bottom: number;
  /** Fraction of the viewport height the words occupy. */
  readonly height: number;
  /** Full-width paper, in viewport heights above the chapter's floor. 0 = no band. */
  readonly band: number;
  /** Full-height paper, in viewport widths from the left edge. 0 = no column. */
  readonly column: number;
  /** Peak alpha of the paper wash, 0–1. */
  readonly wash: number;
}

export const ZONE_BREAKPOINTS: readonly ReadingZoneBreakpoint[] = ['phone', 'tablet', 'desktop'];

/**
 * The media queries the generated file uses — the SAME edges `journey.css` and
 * `readable-experience.css` already break at, so a zone never lands half-way through
 * another rule's layout change. 390, 768 and 1440, the three jury widths, fall one in
 * each band.
 */
export const ZONE_MEDIA: Readonly<Record<ReadingZoneBreakpoint, string>> = {
  phone: '(max-width: 680px)',
  tablet: '(min-width: 681px) and (max-width: 1100px)',
  desktop: '(min-width: 1101px)',
};

/**
 * How far the wash dissolves past its own edge: `ZONE_FEATHER` in viewport heights above
 * the band, `ZONE_EDGE` in viewport widths past the column. Constants, not per-zone
 * numbers — the feather is a property of the material (paper over a moving frame), not of
 * an act, and the previous hand-written stop lists all feathered over roughly these
 * distances anyway.
 */
export const ZONE_FEATHER = 0.5;
export const ZONE_EDGE = 0.17;

/**
 * THE ZONES.
 *
 * Every box below was measured on the built page by `output/step-16/measure-zones.mjs`
 * with each chapter scrolled to its reading position, then rounded outward so the
 * declaration contains the copy it describes. Re-run that probe with `--check` after
 * changing a number; it fails when a chapter's words leave the box.
 */
export const READING_ZONES: ReadonlyMap<ReadingZoneChapter, Readonly<Record<ReadingZoneBreakpoint, ReadingZone>>> =
  new Map([
    /*
     * Act 1 — the pour. The one chapter whose copy is centred in its box rather than
     * parked on its floor, and the one shaped by a column: the pour must hold the right
     * of the frame at every height.
     *
     * 768 is where that alone failed. The ribbon row reaches 93 % of the width while the
     * column is down to nothing by 63 %, so the row needs the band as well — the L. At
     * 390 there is no column at all: the film is a 48 svh plate at the top and everything
     * below it is paper, so the band carries the whole act.
     */
    ['portico', {
      phone: { left: 0, width: 1, bottom: 0.17, height: 0.88, band: 1.05, column: 0, wash: 1 },
      tablet: { left: 0, width: 0.95, bottom: 0.22, height: 0.58, band: 0.47, column: 0.62, wash: 1 },
      desktop: { left: 0, width: 0.53, bottom: 0.15, height: 0.8, band: 0, column: 0.58, wash: 1 },
    }],
    /* Act 3 — beneath the surface. Eyebrow and headline on the floor of the act. */
    ['foundation', {
      phone: { left: 0, width: 0.86, bottom: 0.06, height: 0.2, band: 0.3, column: 0, wash: 1 },
      tablet: { left: 0, width: 0.52, bottom: 0.05, height: 0.18, band: 0.3, column: 0, wash: 1 },
      desktop: { left: 0, width: 0.5, bottom: 0.06, height: 0.26, band: 0.34, column: 0, wash: 1 },
    }],
    /*
     * Act 4 — reclaim. These three rooms have no `.chapter-content`: their copy is the
     * room caption on the right (`reclaim-bay.css`, Step 22) and the act label, which
     * runs gutter to gutter — so the box is nearly the full width and the band is the
     * only sensible wash. Act 4's persistent headline lives in the bay's own sticky
     * layer, a sibling of all three rooms, and is not part of a room's zone.
     */
    ['garage', {
      phone: { left: 0, width: 0.96, bottom: 0.01, height: 0.26, band: 0.31, column: 0, wash: 1 },
      tablet: { left: 0, width: 0.97, bottom: 0.01, height: 0.23, band: 0.3, column: 0, wash: 1 },
      desktop: { left: 0, width: 0.98, bottom: 0.01, height: 0.31, band: 0.36, column: 0, wash: 1 },
    }],
    ['vault', {
      phone: { left: 0, width: 0.96, bottom: 0.01, height: 0.26, band: 0.31, column: 0, wash: 1 },
      tablet: { left: 0, width: 0.97, bottom: 0.01, height: 0.23, band: 0.3, column: 0, wash: 1 },
      desktop: { left: 0, width: 0.98, bottom: 0.01, height: 0.31, band: 0.36, column: 0, wash: 1 },
    }],
    ['mancave', {
      phone: { left: 0, width: 0.96, bottom: 0.01, height: 0.26, band: 0.31, column: 0, wash: 1 },
      tablet: { left: 0, width: 0.97, bottom: 0.01, height: 0.23, band: 0.3, column: 0, wash: 1 },
      desktop: { left: 0, width: 0.98, bottom: 0.01, height: 0.31, band: 0.36, column: 0, wash: 1 },
    }],
    /* Act 7 — your finish. Eyebrow, headline, two CTAs: the tallest floor zone. */
    ['finish-hall', {
      phone: { left: 0, width: 0.8, bottom: 0.08, height: 0.23, band: 0.35, column: 0, wash: 1 },
      tablet: { left: 0, width: 0.44, bottom: 0.06, height: 0.2, band: 0.3, column: 0, wash: 1 },
      desktop: { left: 0, width: 0.42, bottom: 0.07, height: 0.27, band: 0.38, column: 0, wash: 1 },
    }],
    /* Act 8 — commercial. */
    ['commercial', {
      phone: { left: 0, width: 0.79, bottom: 0.06, height: 0.2, band: 0.3, column: 0, wash: 1 },
      tablet: { left: 0, width: 0.56, bottom: 0.05, height: 0.18, band: 0.3, column: 0, wash: 1 },
      desktop: { left: 0, width: 0.45, bottom: 0.06, height: 0.26, band: 0.34, column: 0, wash: 1 },
    }],
    /*
     * Act 10 — talk to Denis. Storyboard §2: "paper wash only behind the words". The
     * words here are an eyebrow, a headline, two CTAs, a phone number and an email, so
     * the band is the tallest on the page; the poster keeps the rest of the frame.
     */
    ['consultation', {
      phone: { left: 0, width: 0.92, bottom: 0.09, height: 0.39, band: 0.52, column: 0, wash: 1 },
      tablet: { left: 0, width: 0.54, bottom: 0.07, height: 0.34, band: 0.45, column: 0, wash: 1 },
      desktop: { left: 0, width: 0.52, bottom: 0.08, height: 0.46, band: 0.58, column: 0, wash: 1 },
    }],
  ]);

/** The zone for one chapter at one breakpoint. Throws rather than guessing. */
export function readingZoneFor(chapter: string, breakpoint: ReadingZoneBreakpoint): ReadingZone {
  const entry = READING_ZONES.get(chapter as ReadingZoneChapter);
  if (!entry) throw new Error(`reading-zones: no zone declared for chapter "${chapter}"`);
  return entry[breakpoint];
}

/** The band a viewport width falls in — the same edges as `ZONE_MEDIA`. */
export function readingZoneBreakpoint(viewportWidth: number): ReadingZoneBreakpoint {
  if (viewportWidth <= 680) return 'phone';
  if (viewportWidth <= 1100) return 'tablet';
  return 'desktop';
}

/** The top of the box, in viewport heights above the chapter's floor. */
export function readingZoneTop(zone: ReadingZone): number {
  return zone.bottom + zone.height;
}

/**
 * A zone is nonsense if the box has no area, leaves the viewport, asks for more paper
 * than paper, or declares a wash that cannot reach the words.
 *
 * The last check is deliberately weak in one direction. The box is the BOUNDING
 * rectangle of the copy, and Act 1 at 768 is genuinely L-shaped — a narrow eyebrow,
 * headline and lead in the upper left, a ribbon that runs to the far edge along the
 * bottom — so the box's top-right corner is empty and correctly has no paper behind it.
 * Asserting that every corner of the bounding box is washed would reject exactly the
 * composition the storyboard asks for. What can be asserted without guessing is that a
 * zone which relies on one shape alone covers the box in that shape's own direction;
 * whether an L reaches the words is settled by measurement, not by arithmetic —
 * `scripts/measure-contrast.mjs` is that gate.
 */
export function assertReadingZone(chapter: string, breakpoint: ReadingZoneBreakpoint, zone: ReadingZone): void {
  const where = `${chapter}/${breakpoint}`;
  const fail = (message: string): never => { throw new Error(`reading-zones: ${where} ${message}`); };
  if (!(zone.left >= 0 && zone.left < 1)) fail('left must be in [0,1)');
  if (!(zone.width > 0 && zone.left + zone.width <= 1)) fail('left+width must be in (0,1]');
  if (!(zone.bottom >= 0 && zone.bottom < 1)) fail('bottom must be in [0,1)');
  if (!(zone.height > 0)) fail('height must be positive');
  if (!(zone.band >= 0 && zone.column >= 0)) fail('band and column must not be negative');
  if (zone.band === 0 && zone.column === 0) fail('has no wash at all');
  if (!(zone.wash > 0 && zone.wash <= 1)) fail('wash must be in (0,1]');
  if (zone.column === 0 && zone.band < readingZoneTop(zone)) {
    fail(`band ${zone.band} stops below the box top ${readingZoneTop(zone).toFixed(2)} and there is no column behind it`);
  }
  if (zone.band === 0 && zone.column < zone.left + zone.width) {
    fail(`column ${zone.column} stops short of the box right edge ${(zone.left + zone.width).toFixed(2)} and there is no band under it`);
  }
}

const trim = (value: number): string => {
  const text = value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
  if (text === '' || text === '-0') return '0';
  return text.startsWith('0.') ? text.slice(1) : text;
};

/**
 * Which gradient layers this zone paints. The layer list is emitted per zone rather than
 * derived in CSS because a `linear-gradient` whose extent is 0 is not nothing — it is a
 * hard edge at the left margin — and `background-image` has no way to drop a layer.
 */
function layersFor(zone: ReadingZone): string {
  const layers: string[] = [];
  if (zone.band > 0) layers.push('var(--zone-band-wash)');
  if (zone.column > 0) layers.push('var(--zone-column-wash)');
  return layers.join(', ');
}

function declaration(zone: ReadingZone): string {
  return [
    `--zone-left: ${trim(zone.left)}`,
    `--zone-width: ${trim(zone.width)}`,
    `--zone-bottom: ${trim(zone.bottom)}`,
    `--zone-height: ${trim(zone.height)}`,
    `--zone-band: ${trim(zone.band)}`,
    `--zone-column: ${trim(zone.column)}`,
    `--zone-wash: ${trim(zone.wash)}`,
    `--zone-layers: ${layersFor(zone)}`,
  ].join('; ');
}

export const GENERATED_HEADER = [
  '/* GENERATED FILE — do not edit.',
  ' *',
  ' * Written by `scripts/build-reading-zones.mjs` from `src/lib/motion/reading-zones.ts`,',
  ' * the only place a reading zone is declared. `reading-zones.test.ts` fails when this',
  ' * file and that module disagree, so a hand edit here cannot survive a test run.',
  ' *',
  ' * The rules that USE these properties are authored in `src/styles/journey.css` under',
  ' * "READING ZONES". This file carries numbers and nothing else.',
  ' */',
].join('\n');

/** The whole generated stylesheet, byte for byte. */
export function readingZonesCss(): string {
  const lines: string[] = [GENERATED_HEADER, ''];
  lines.push(':root {');
  lines.push(`  --zone-feather: ${trim(ZONE_FEATHER)};`);
  lines.push(`  --zone-edge: ${trim(ZONE_EDGE)};`);
  lines.push('}');
  lines.push('');
  for (const breakpoint of ZONE_BREAKPOINTS) {
    lines.push(`@media ${ZONE_MEDIA[breakpoint]} {`);
    for (const [chapter, byBreakpoint] of READING_ZONES) {
      const zone = byBreakpoint[breakpoint];
      assertReadingZone(chapter, breakpoint, zone);
      lines.push(`  .journey [data-journey-chapter='${chapter}'] { ${declaration(zone)}; }`);
    }
    lines.push('}');
    lines.push('');
  }
  return lines.join('\n');
}
