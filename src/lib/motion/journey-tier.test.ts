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
  /* Step 33 — the resilience rules, each one named so a change to it fails by name. */
  ['a phone on 3g', { effectiveType: '3g', coarsePointer: true }, 'balanced'],
  ['a phone on 3g with plenty of memory', { effectiveType: '3g', coarsePointer: true, deviceMemory: 8 }, 'balanced'],
  ['a phone on 3g that also dropped to save-data still goes all the way to still', { effectiveType: '3g', coarsePointer: true, saveData: true }, 'still'],
  ['a phone on slow-2g outranks the 3g rule', { effectiveType: 'slow-2g', coarsePointer: true }, 'still'],
  ['a 1 GB phone', { deviceMemory: 1, coarsePointer: true }, 'balanced'],
  ['a 1 GB desktop with a mouse', { deviceMemory: 1 }, 'balanced'],
  ['a 2 GB desktop with a mouse', { deviceMemory: 2 }, 'balanced'],
  ['device memory reported as 0, which means "not disclosed", not "none"', { deviceMemory: 0 }, 'full'],
  ['an uppercase 2G from a connection shim', { effectiveType: '2G' }, 'still'],
  ['a padded  slow-2g  from a connection shim', { effectiveType: '  slow-2g  ' }, 'still'],
  ['an empty effectiveType string, which is no information at all', { effectiveType: '' }, 'full'],
  ['an effectiveType nobody has defined yet', { effectiveType: '5g' }, 'full'],
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

  /**
   * Step 33. `still` is the tier a 2G visitor gets, and the narrative has to survive
   * it — so the rule that produces it must fire on the connection alone, whatever else
   * the device can do. Stated as a sweep rather than a case, because the failure this
   * guards against is a later rule being inserted *above* the connection check.
   */
  it('sends every 2g-class connection to still, whatever the hardware says', () => {
    const hardware: ReadonlyArray<Partial<JourneyTierInputs>> = [
      {},
      { coarsePointer: true },
      { deviceMemory: 16 },
      { deviceMemory: 1 },
      { webgl2: false, floatBuffers: false },
      { preference: 'balanced' },
    ];
    for (const effectiveType of ['2g', 'slow-2g']) {
      for (const patch of hardware) {
        expect(resolveJourneyTier({ ...DESKTOP, ...patch, effectiveType }), `${effectiveType} + ${JSON.stringify(patch)}`)
          .toBe('still');
      }
    }
  });

  /**
   * Falsifiability for the sweep above: the same hardware on a fast connection must
   * NOT all resolve to `still`, or the sweep would pass on a resolver that returned
   * `still` unconditionally.
   */
  it('does not send that same hardware to still on a 4g connection', () => {
    expect(resolveJourneyTier({ ...DESKTOP, effectiveType: '4g' })).toBe('full');
    expect(resolveJourneyTier({ ...DESKTOP, effectiveType: '4g', coarsePointer: true })).toBe('balanced');
    expect(resolveJourneyTier({ ...DESKTOP, effectiveType: '4g', deviceMemory: 1 })).toBe('balanced');
  });

  it('treats a 3g coarse-pointer device as balanced, never as full', () => {
    // Both halves stated, because the rule only earns its place if the connection is
    // what decided it on at least one input the pointer rule would have missed.
    expect(resolveJourneyTier({ ...DESKTOP, effectiveType: '3g', coarsePointer: true })).toBe('balanced');
    expect(resolveJourneyTier({ ...DESKTOP, effectiveType: '3g', coarsePointer: false })).toBe('full');
  });
});
