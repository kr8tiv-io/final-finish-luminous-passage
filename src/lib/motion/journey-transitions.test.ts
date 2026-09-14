import { describe, expect, it } from 'vitest';
import {
  resolveJourneyTransition,
  transitionBoundaryKey,
  transitionLockAction,
  transitionRenderKey,
} from './journey-transitions';

describe('authored journey transitions', () => {
  it('uses a calm white dissolve only for the first threshold', () => {
    expect(resolveJourneyTransition('portico', 'foundation')).toEqual({ mode: 0, direction: 1, kind: 'white-dissolve' });
  });

  it('uses the architectural aperture at the garage-to-vault threshold', () => {
    expect(resolveJourneyTransition('garage', 'vault')).toEqual({ mode: 1, direction: 1, kind: 'aperture' });
  });

  it('alternates restrained lateral folds across the remaining authored boundaries', () => {
    expect(resolveJourneyTransition('foundation', 'garage')).toEqual({ mode: 2, direction: 1, kind: 'fold' });
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
