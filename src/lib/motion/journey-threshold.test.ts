import { describe, expect, it } from 'vitest';
import {
  THRESHOLD_TRANSITION,
  resolveThresholdStudyOptIn,
  thresholdApproaching,
  thresholdFrame,
  thresholdStudyEnabled,
} from './journey-threshold';

describe('garage to vault threshold travel', () => {
  const snapshot = {
    fromChapter: 'garage',
    toChapter: 'vault',
    transitionProgress: 0.4,
    visible: true,
    documentVisible: true,
  } as const;

  it('binds exactly one authored native-flow breath to the camera clip', () => {
    expect(THRESHOLD_TRANSITION).toEqual({ from: 'garage', to: 'vault' });
    expect(thresholdFrame(snapshot, true)).toEqual({ visible: true, progress: 0.4, opacity: 1 });
  });

  it('clamps progress and suspends outside the transition, hidden tab, or still mode', () => {
    expect(thresholdFrame({ ...snapshot, transitionProgress: 2 }, true).progress).toBe(1);
    expect(thresholdFrame({ ...snapshot, fromChapter: 'foundation' }, true).visible).toBe(false);
    expect(thresholdFrame({ ...snapshot, documentVisible: false }, true).visible).toBe(false);
    expect(thresholdFrame(snapshot, false).visible).toBe(false);
    expect(thresholdFrame({ ...snapshot, transitionProgress: 0.03 }, true).opacity).toBeGreaterThan(0);
    expect(thresholdFrame({ ...snapshot, transitionProgress: 0.03 }, true).opacity).toBeLessThan(0.5);
    expect(thresholdFrame({ ...snapshot, transitionProgress: 0.97 }, true).opacity).toBeLessThan(0.5);
  });

  it('keeps the GLB off the critical path until the garage-to-vault approach', () => {
    expect(thresholdApproaching({ ...snapshot, activeChapter: 'foundation' }, true)).toBe(false);
    expect(thresholdApproaching({ ...snapshot, activeChapter: 'garage' }, true)).toBe(true);
    expect(thresholdApproaching({ ...snapshot, activeChapter: 'vault' }, true)).toBe(true);
    expect(thresholdApproaching({ ...snapshot, activeChapter: 'garage' }, false)).toBe(false);
  });

  it('keeps the rejected spatial study default-off and requires every explicit runtime gate', () => {
    const approaching = { ...snapshot, activeChapter: 'garage' } as const;
    expect(resolveThresholdStudyOptIn()).toBe(false);
    expect(resolveThresholdStudyOptIn(false)).toBe(false);
    expect(resolveThresholdStudyOptIn(true)).toBe(true);
    expect(thresholdStudyEnabled(approaching, { optIn: false, hdrSupported: true, motionEnabled: true })).toBe(false);
    expect(thresholdStudyEnabled(approaching, { optIn: true, hdrSupported: true, motionEnabled: true })).toBe(true);
    expect(thresholdStudyEnabled(approaching, { optIn: true, hdrSupported: false, motionEnabled: true })).toBe(false);
    expect(thresholdStudyEnabled(approaching, { optIn: true, hdrSupported: true, motionEnabled: false })).toBe(false);
  });
});
