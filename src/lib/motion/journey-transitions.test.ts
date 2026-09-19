import { readFileSync } from 'node:fs';
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

  it('folds and shoots left at both of the Reclaim bay’s interior room changes', () => {
    const fold = { mode: 5, direction: 1, kind: 'fold-and-shoot-left' };
    expect(resolveJourneyTransition('garage', 'vault')).toEqual(fold);
    expect(resolveJourneyTransition('vault', 'mancave')).toEqual(fold);
    // Falsifiable: mode 5 belongs to the bay's interior, not to every boundary.
    expect(resolveJourneyTransition('finish-hall', 'commercial').mode).not.toBe(5);
  });

  /**
   * Step 11b: `proof` is act 05, so it sits between Reclaim and Your finish.
   * Step 22 made `mancave` the act's last room, so the exit hangs off it.
   * Step 23b put act 06 (`archive`) after the gallery, which split the single
   * `proof:finish-hall` breath into two. All three of these are placeholders
   * wearing an existing veil mode until Step 23 (`shrink-to-card`), Step 23b's
   * own DOM `unwrap-to-lattice`, and Step 24 (`resin-layer-mask`) carry them.
   */
  it('closes the aperture from the lounge into the gallery and opens on paper again', () => {
    expect(resolveJourneyTransition('mancave', 'proof')).toEqual({ mode: 1, direction: -1, kind: 'aperture' });
    expect(resolveJourneyTransition('proof', 'archive')).toEqual({ mode: 0, direction: 1, kind: 'white-dissolve' });
    expect(resolveJourneyTransition('archive', 'finish-hall')).toEqual({ mode: 0, direction: 1, kind: 'white-dissolve' });
    // Falsifiable: the boundary the archive replaced is gone from the table, not
    // merely shadowed — a retired key would still resolve through the default.
    expect(resolveJourneyTransition('proof', 'finish-hall')).toEqual({ mode: 2, direction: 1, kind: 'fold' });
  });

  it('keeps the restrained lateral folds on the last two authored boundaries', () => {
    expect(resolveJourneyTransition('finish-hall', 'commercial')).toEqual({ mode: 2, direction: 1, kind: 'fold' });
    expect(resolveJourneyTransition('commercial', 'consultation')).toEqual({ mode: 2, direction: 1, kind: 'fold' });
  });

  /**
   * The table's keys, in the order they are authored, are the contract
   * `boundaries.spec` checks against the rendered breaths — a stale key is a
   * boundary the page no longer has, and `resolveJourneyTransition` cannot show
   * that on its own because a retired key can share the default style. So read
   * the literal, the same way the e2e spec does.
   */
  it('authors exactly the nine storyboard adjacencies, in page order', () => {
    const source = readFileSync(new URL('./journey-transitions.ts', import.meta.url), 'utf8');
    const keys = [...source.matchAll(/^ {2}'([a-z-]+:[a-z-]+)': Object\.freeze/gm)].map(([, key]) => key);
    expect(keys).toEqual([
      'portico:foundation',
      'foundation:garage',
      'garage:vault',
      'vault:mancave',
      'mancave:proof',
      'proof:archive',
      'archive:finish-hall',
      'finish-hall:commercial',
      'commercial:consultation',
    ]);
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
