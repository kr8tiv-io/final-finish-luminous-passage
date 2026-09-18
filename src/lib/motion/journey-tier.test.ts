import { describe, expect, it } from 'vitest';
import { resolveJourneyTier, type JourneyTier, type JourneyTierInputs } from './journey-tier';

/** A capable desktop: every named case below states only what differs from it. */
const DESKTOP: JourneyTierInputs = {
  webgl2: true,
  floatBuffers: true,
  reducedMotion: false,
  saveData: false,
  effectiveType: '4g',
  coarsePointer: false,
  deviceMemory: 8,
  preference: 'auto',
};

const CASES: ReadonlyArray<readonly [string, Partial<JourneyTierInputs>, JourneyTier]> = [
  ['capable desktop with a mouse', {}, 'full'],
  ['desktop reporting no device memory at all', { deviceMemory: null }, 'full'],
  ['desktop on an unknown connection', { effectiveType: null }, 'full'],
  ['desktop on 3g, which is slow but not 2g-class', { effectiveType: '3g' }, 'full'],
  ['iPhone-like: WebGL2 and float buffers but a coarse pointer', { coarsePointer: true }, 'balanced'],
  ['tablet with touch and no float colour buffers', { coarsePointer: true, floatBuffers: false }, 'balanced'],
  ['desktop browser without WebGL2', { webgl2: false, floatBuffers: false }, 'balanced'],
  ['WebGL2 without EXT_color_buffer_float', { floatBuffers: false }, 'balanced'],
  ['low-memory device at the 2 GB threshold', { deviceMemory: 2 }, 'balanced'],
  ['device just above the memory threshold', { deviceMemory: 3 }, 'full'],
  ['visitor who asked for balanced on capable hardware', { preference: 'balanced' }, 'balanced'],
  ['visitor who asked for still', { preference: 'still' }, 'still'],
  ['still preference outranks capable hardware and touch', { preference: 'still', coarsePointer: true }, 'still'],
  ['system reduced motion', { reducedMotion: true }, 'still'],
  ['reduced motion outranks a balanced preference', { reducedMotion: true, preference: 'balanced' }, 'still'],
  ['Save-Data on a fast phone', { saveData: true, coarsePointer: true }, 'still'],
  ['Save-Data on capable desktop hardware', { saveData: true }, 'still'],
  ['slow-2g connection', { effectiveType: 'slow-2g' }, 'still'],
  ['2g connection', { effectiveType: '2g' }, 'still'],
  ['weak hardware on a 2g connection still resolves to still, not balanced', { webgl2: false, floatBuffers: false, effectiveType: '2g' }, 'still'],
];

describe('journey capability tier', () => {
  it.each(CASES.map(([name, patch, expected]) => ({ name, patch, expected })))(
    'resolves $name to $expected',
    ({ patch, expected }) => {
      expect(resolveJourneyTier({ ...DESKTOP, ...patch })).toBe(expected);
    },
  );

  it('is pure: the same inputs always resolve to the same tier', () => {
    const inputs = { ...DESKTOP, coarsePointer: true };
    expect(resolveJourneyTier(inputs)).toBe(resolveJourneyTier({ ...inputs }));
  });

  it('defaults to balanced when nothing is known, never to full', () => {
    expect(resolveJourneyTier()).toBe('balanced');
    expect(resolveJourneyTier({})).toBe('balanced');
  });

  it('never drops below balanced for touch alone', () => {
    const touchOnly = [
      { ...DESKTOP, coarsePointer: true },
      { ...DESKTOP, coarsePointer: true, deviceMemory: 4 },
      { ...DESKTOP, coarsePointer: true, floatBuffers: false },
    ];
    touchOnly.forEach((inputs) => expect(resolveJourneyTier(inputs)).toBe('balanced'));
  });
});
