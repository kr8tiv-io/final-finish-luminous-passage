import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertReadingZone,
  READING_ZONES,
  readingZoneBreakpoint,
  readingZoneFor,
  readingZonesCss,
  readingZoneTop,
  ZONE_BREAKPOINTS,
  ZONE_EDGE,
  ZONE_FEATHER,
  ZONE_MEDIA,
  type ReadingZone,
} from './reading-zones';

const GENERATED = path.join(process.cwd(), 'src', 'styles', 'reading-zones.css');
const zone = (overrides: Partial<ReadingZone> = {}): ReadingZone => ({
  left: 0, width: 0.5, bottom: 0.05, height: 0.2, band: 0.3, column: 0, wash: 1, ...overrides,
});

describe('reading zones', () => {
  it('has a zone for every chapter at every breakpoint', () => {
    expect(READING_ZONES.size).toBe(8);
    for (const [chapter, byBreakpoint] of READING_ZONES) {
      for (const breakpoint of ZONE_BREAKPOINTS) {
        expect(byBreakpoint[breakpoint], `${chapter}/${breakpoint}`).toBeTruthy();
        expect(() => assertReadingZone(chapter, breakpoint, byBreakpoint[breakpoint])).not.toThrow();
      }
    }
  });

  /**
   * The whole point of a zone is that the paper reaches the words. A zone with one wash
   * shape has to cover the box in that shape's own direction; an L (Act 1 at 768) is
   * settled by `scripts/measure-contrast.mjs`, not by arithmetic, and the test below
   * proves the arithmetic can still fail so this is not a check that cannot fail.
   */
  it('rejects a wash that cannot reach the words', () => {
    expect(() => assertReadingZone('x', 'phone', zone({ band: 0.1, height: 0.5 }))).toThrow(/stops below the box top/);
    expect(() => assertReadingZone('x', 'phone', zone({ band: 0, column: 0.2, width: 0.9 }))).toThrow(/stops short of the box right edge/);
    expect(() => assertReadingZone('x', 'phone', zone({ band: 0, column: 0 }))).toThrow(/no wash at all/);
    expect(() => assertReadingZone('x', 'phone', zone({ wash: 1.4 }))).toThrow(/wash must be/);
    expect(() => assertReadingZone('x', 'phone', zone({ left: 0.7, width: 0.5 }))).toThrow(/left\+width/);
    expect(() => assertReadingZone('x', 'phone', zone({ height: 0 }))).toThrow(/height must be positive/);
    // …and the real zones pass the same check, so it is not vacuous in either direction.
    expect(() => assertReadingZone('x', 'phone', zone())).not.toThrow();
  });

  it('puts every jury width in the band its media query claims', () => {
    expect(readingZoneBreakpoint(390)).toBe('phone');
    expect(readingZoneBreakpoint(680)).toBe('phone');
    expect(readingZoneBreakpoint(681)).toBe('tablet');
    expect(readingZoneBreakpoint(768)).toBe('tablet');
    expect(readingZoneBreakpoint(1100)).toBe('tablet');
    expect(readingZoneBreakpoint(1101)).toBe('desktop');
    expect(readingZoneBreakpoint(1440)).toBe('desktop');
    // The function and the emitted media queries must name the same edges.
    expect(ZONE_MEDIA.phone).toContain('680px');
    expect(ZONE_MEDIA.tablet).toContain('681px');
    expect(ZONE_MEDIA.tablet).toContain('1100px');
    expect(ZONE_MEDIA.desktop).toContain('1101px');
  });

  it('throws on a chapter that has no zone rather than inventing one', () => {
    expect(() => readingZoneFor('proof', 'desktop')).toThrow(/no zone declared/);
    expect(readingZoneFor('portico', 'desktop').column).toBeGreaterThan(0);
  });

  /**
   * Act 1 is the only act with a column, and at 768 it is the only act with both shapes
   * — the L that replaced Step 17's hand-written media query. If this stops being true
   * the hero's ribbon row is back on bare film at a jury width.
   */
  it('gives Act 1 a column everywhere but the phone, and both shapes at 768', () => {
    expect(readingZoneFor('portico', 'phone').column).toBe(0);
    expect(readingZoneFor('portico', 'phone').band).toBeGreaterThan(readingZoneTop(readingZoneFor('portico', 'phone')) - 0.001);
    const tablet = readingZoneFor('portico', 'tablet');
    expect(tablet.column).toBeGreaterThan(0);
    expect(tablet.band).toBeGreaterThan(0);
    expect(readingZoneFor('portico', 'desktop').band).toBe(0);
    for (const [chapter, byBreakpoint] of READING_ZONES) {
      if (chapter === 'portico') continue;
      for (const breakpoint of ZONE_BREAKPOINTS) {
        expect(byBreakpoint[breakpoint].column, `${chapter}/${breakpoint}`).toBe(0);
      }
    }
  });

  it('emits one layer per declared wash shape and no empty gradient', () => {
    const css = readingZonesCss();
    for (const [chapter, byBreakpoint] of READING_ZONES) {
      for (const breakpoint of ZONE_BREAKPOINTS) {
        const target = byBreakpoint[breakpoint];
        const rule = css
          .split(`@media ${ZONE_MEDIA[breakpoint]} {`)[1]
          ?.split('\n}')[0]
          ?.split('\n')
          .find((line) => line.includes(`'${chapter}'`));
        expect(rule, `${chapter}/${breakpoint}`).toBeTruthy();
        expect(rule).toContain(`--zone-band: ${String(target.band).replace(/^0\./, '.')}`);
        const layers = rule!.slice(rule!.indexOf('--zone-layers:'));
        expect(layers.includes('--zone-band-wash'), `${chapter}/${breakpoint} band layer`).toBe(target.band > 0);
        expect(layers.includes('--zone-column-wash'), `${chapter}/${breakpoint} column layer`).toBe(target.column > 0);
      }
    }
    expect(css).toContain(`--zone-feather: ${String(ZONE_FEATHER).replace(/^0\./, '.')}`);
    expect(css).toContain(`--zone-edge: ${String(ZONE_EDGE).replace(/^0\./, '.')}`);
  });

  /**
   * The generated stylesheet is the ONLY copy of these numbers the browser sees, so it
   * has to be the one this module produces. A hand edit to the CSS, or a change here
   * without `node scripts/build-reading-zones.mjs`, fails right here.
   */
  it('matches the committed src/styles/reading-zones.css byte for byte', () => {
    const committed = readFileSync(GENERATED, 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(`${readingZonesCss()}\n`);
  });
});
