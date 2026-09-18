import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The type scale, checked as arithmetic rather than as a string.
 *
 * `readable-experience.css` states each size as a `clamp(min, preferred, max)`
 * and each optical token as a clamp over the *same* viewport band, so the two
 * things worth proving here are (a) the scale is monotonic at both ends — a
 * caption that outgrew body, or a chapter that outgrew hero, is a broken
 * hierarchy no screenshot review reliably catches — and (b) the tracking and
 * leading formulas actually meet their clamp bounds at the band edges, which is
 * what makes them continuous with font-size instead of stepping.
 *
 * This is a falsifiable check: `resolve()` below computes real px values, so
 * inverting any two tokens in the stylesheet fails it. The end-to-end
 * counterpart (`tests/e2e/typography.spec.ts`) asserts the *computed* values a
 * browser produces from these same declarations.
 */
const css = readFileSync(new URL('./readable-experience.css', import.meta.url), 'utf8');

const ROOT_FONT_SIZE = 16;

/** The `:root { … }` block, which is where every token is declared. */
const rootBlock = (() => {
  const start = css.indexOf(':root {');
  expect(start).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf('\n}', start));
})();

const token = (name: string): string => {
  const match = rootBlock.match(new RegExp(`--${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`token --${name} is not declared in :root`);
  return match[1].trim();
};

const UNITS: Record<string, (value: number, viewport: number) => number> = {
  rem: (value) => value * ROOT_FONT_SIZE,
  px: (value) => value,
  vw: (value, viewport) => (value * viewport) / 100,
};

/**
 * Evaluates a `rem`/`px`/`vw` sum (as CSS resolves it) to px at a viewport
 * width. Signs are read per term so a leading negative (`-3.36px`) and a binary
 * subtraction (`0.873px - 0.257vw`) both resolve — the tracking tokens use both.
 */
const TERM = /([+-]?)\s*(\d*\.?\d+)(rem|px|vw)/g;
const evaluate = (expression: string, viewport: number): number => {
  const terms = [...expression.matchAll(TERM)];
  if (terms.length === 0) throw new Error(`cannot evaluate "${expression}"`);
  // Anything the tokeniser did not consume would otherwise be dropped in
  // silence, turning a typo in the stylesheet into a passing test.
  const leftover = expression.replace(TERM, '').trim();
  if (leftover) throw new Error(`unrecognised part of "${expression}": "${leftover}"`);
  return terms.reduce((sum, [, sign, value, unit]) => {
    const magnitude = UNITS[unit](Number.parseFloat(value), viewport);
    return sign === '-' ? sum - magnitude : sum + magnitude;
  }, 0);
};

/** Resolves a token — clamped or plain — to px at a viewport width. */
const resolve = (name: string, viewport: number): number => {
  const raw = token(name);
  const clamped = raw.match(/^clamp\((.+)\)$/);
  if (!clamped) return evaluate(raw, viewport);
  const [min, preferred, max] = clamped[1].split(',').map((part) => part.trim());
  return Math.min(
    Math.max(evaluate(min, viewport), evaluate(preferred, viewport)),
    evaluate(max, viewport),
  );
};

const PHONE = 390;
const DESKTOP = 1440;

describe('type scale', () => {
  it('declares the caption step at exactly 14 px and never lets it move', () => {
    expect(token('type-caption')).toBe('.875rem');
    for (const viewport of [320, PHONE, 768, DESKTOP, 2560]) {
      expect(resolve('type-caption', viewport)).toBe(14);
    }
  });

  it('rises monotonically caption → body → lead → chapter → hero at every width', () => {
    const steps = ['type-caption', 'type-body', 'type-lead', 'type-chapter', 'type-hero'];
    for (const viewport of [320, PHONE, 768, 1100, DESKTOP, 1920, 2560]) {
      const sizes = steps.map((step) => resolve(step, viewport));
      for (let i = 1; i < sizes.length; i += 1) {
        expect(
          sizes[i],
          `--${steps[i]} (${sizes[i]}px) must exceed --${steps[i - 1]} (${sizes[i - 1]}px) at ${viewport}px`,
        ).toBeGreaterThan(sizes[i - 1]);
      }
    }
  });

  it('holds hero 44–112 px and chapter 36–80 px across the whole viewport range', () => {
    expect(resolve('type-hero', 320)).toBe(44);
    expect(resolve('type-hero', 2560)).toBe(112);
    expect(resolve('type-chapter', 320)).toBe(36);
    expect(resolve('type-chapter', 2560)).toBe(80);
    // 17–18 px desktop / 16 px phone.
    expect(resolve('type-body', PHONE)).toBe(16);
    expect(resolve('type-body', DESKTOP)).toBeGreaterThanOrEqual(17);
    expect(resolve('type-body', DESKTOP)).toBeLessThanOrEqual(18);
  });

  it('tightens display tracking as the type grows, and never inverts', () => {
    for (const step of ['hero', 'chapter'] as const) {
      const widths = [320, PHONE, 768, 1100, DESKTOP, 1920, 2560];
      const tracking = widths.map((viewport) => resolve(`tracking-${step}`, viewport));
      for (let i = 1; i < tracking.length; i += 1) {
        expect(
          tracking[i],
          `--tracking-${step} must not loosen from ${widths[i - 1]}px to ${widths[i]}px`,
        ).toBeLessThanOrEqual(tracking[i - 1] + 1e-9);
      }
      // Every value is negative: display type closes up, it never opens.
      expect(Math.max(...tracking)).toBeLessThan(0);
    }
  });

  it('lands the tracking and leading formulas on −0.030em / 0.96 at the top of the hero range', () => {
    // 1647px is where `6.8vw` reaches the 112px ceiling — the top of the band.
    const top = 1647;
    const size = resolve('type-hero', top);
    expect(size).toBeCloseTo(112, 0);
    expect(resolve('tracking-hero', top) / size).toBeCloseTo(-0.03, 3);
    expect(resolve('leading-hero', top) / size).toBeCloseTo(0.96, 2);

    // 647px is where it reaches the 44px floor — the bottom of the same band.
    const bottom = 647;
    const small = resolve('type-hero', bottom);
    expect(small).toBeCloseTo(44, 0);
    expect(resolve('tracking-hero', bottom) / small).toBeCloseTo(-0.018, 3);
    expect(resolve('leading-hero', bottom) / small).toBeCloseTo(1.0, 2);
  });

  it('keeps chapter leading between 1.02 and 1.08 of its own size', () => {
    for (const viewport of [PHONE, 768, 1100, DESKTOP, 2560]) {
      const ratio = resolve('leading-chapter', viewport) / resolve('type-chapter', viewport);
      expect(ratio).toBeGreaterThanOrEqual(1.015);
      expect(ratio).toBeLessThanOrEqual(1.085);
    }
  });

  it('states the caption, weight, measure and rhythm tokens the scale promises', () => {
    expect(token('tracking-caption')).toBe('.08em');
    expect(token('weight-body')).toBe('400');
    expect(token('weight-ui')).toBe('600');
    expect(token('weight-chapter')).toBe('550');
    const hero = Number(token('weight-hero'));
    expect(hero).toBeGreaterThanOrEqual(500);
    expect(hero).toBeLessThanOrEqual(550);
    const measure = Number.parseFloat(token('measure-body'));
    expect(token('measure-body').endsWith('ch')).toBe(true);
    expect(measure).toBeGreaterThanOrEqual(60);
    expect(measure).toBeLessThanOrEqual(68);
    expect(token('rhythm-paragraph')).toMatch(/rem$/);
  });

  it('gives the phone hero its weight back without leaving the 500–550 band', () => {
    const phoneBlock = css.slice(css.indexOf('@media (max-width: 680px)'));
    const bumped = phoneBlock.match(/--weight-hero:\s*(\d+)/);
    expect(bumped, 'the 680px block must restate --weight-hero').not.toBeNull();
    const weight = Number(bumped![1]);
    expect(weight).toBeGreaterThan(Number(token('weight-hero')));
    expect(weight).toBeLessThanOrEqual(550);
  });
});
