import { describe, expect, it } from 'vitest';
import {
  resolveJourneyTransition,
  resolveJourneyTransitionFrame,
  resolveJourneyWhiteTargetTransition,
  transitionBoundaryKey,
  transitionLockAction,
  transitionRenderKey,
} from './journey-transitions';

describe('authored journey transitions', () => {
  it('uses the original uneven resin edge at the actual pour-to-customer-review boundary', () => {
    expect(resolveJourneyWhiteTargetTransition('customer-reviews')).toEqual({ mode: 3, direction: 1, kind: 'resin-wipe' });
    expect(resolveJourneyTransition('portico', 'foundation')).toEqual({ mode: 0, direction: 1, kind: 'white-dissolve' });
  });

  it('routes the opening white target through the existing texture pair and keeps room exits separate', () => {
    expect(resolveJourneyTransitionFrame({
      fromChapter: 'portico',
      toChapter: 'foundation',
      transitionProgress: 0,
      transitionFromWhite: false,
      whiteTarget: { id: 'customer-reviews', from: 'portico', progress: 0.5 },
    })).toEqual({
      key: 'portico:customer-reviews:white-target',
      boundaryKey: 'customer-reviews:white-target',
      from: 'portico',
      to: null,
      progress: 0.5,
      fromWhite: false,
      style: { mode: 3, direction: 1, kind: 'resin-wipe' },
    });

    expect(resolveJourneyTransitionFrame({
      fromChapter: 'portico',
      toChapter: 'foundation',
      transitionProgress: 0.5,
      transitionFromWhite: true,
      whiteTarget: null,
    })).toMatchObject({
      key: 'portico:foundation:white',
      from: 'portico',
      to: 'foundation',
      progress: 0.5,
      fromWhite: true,
      style: { mode: 0, kind: 'white-dissolve' },
    });
  });

  it('curls the paper preparation interlude away without deforming either plate', () => {
    expect(resolveJourneyTransition('foundation', 'garage')).toEqual({ mode: 4, direction: 1, kind: 'preparation-curl' });
  });

  it('uses the architectural aperture at the garage-to-vault threshold', () => {
    expect(resolveJourneyTransition('garage', 'vault')).toEqual({ mode: 1, direction: 1, kind: 'aperture' });
  });

  it('alternates restrained lateral folds across the remaining authored boundaries', () => {
    expect(resolveJourneyTransition('vault', 'finish-hall')).toEqual({ mode: 2, direction: -1, kind: 'fold' });
    expect(resolveJourneyTransition('finish-hall', 'commercial')).toEqual({ mode: 2, direction: 1, kind: 'fold' });
    expect(resolveJourneyTransition('commercial', 'proof')).toEqual({ mode: 2, direction: -1, kind: 'fold' });
    expect(resolveJourneyTransition('proof', 'consultation')).toEqual({ mode: 2, direction: 1, kind: 'fold' });
  });

  it('keys a boundary independently of scroll direction', () => {
    expect(transitionBoundaryKey('garage', 'vault')).toBe('garage:vault');
    expect(transitionRenderKey('garage', 'vault', false)).toBe('garage:vault:media');
    expect(transitionRenderKey('garage', 'vault', true)).toBe('garage:vault:white');
  });

  it('retains one texture pair through reversals and clears it outside the breath or on white', () => {
    expect(transitionLockAction(null, 'garage:vault', true, false)).toBe('acquire');
    expect(transitionLockAction('garage:vault', 'garage:vault', true, false)).toBe('retain');
    expect(transitionLockAction('foundation:garage', 'garage:vault', true, false)).toBe('acquire');
    expect(transitionLockAction('garage:vault', 'garage:vault', false, false)).toBe('clear');
    expect(transitionLockAction('garage:vault', 'garage:vault', true, true)).toBe('clear');
  });
});
