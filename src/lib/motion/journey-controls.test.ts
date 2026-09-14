import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('journey controls store', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('starts with the approved featured finish and a frozen stable snapshot', async () => {
    const { journeyControls } = await import('./journey-controls');
    const first = journeyControls.getSnapshot();

    expect(first).toEqual({ selectedFinish: 'alabaster-stone', motionPreference: 'auto', revision: 0 });
    expect(Object.isFrozen(first)).toBe(true);
    expect(journeyControls.getSnapshot()).toBe(first);
  });

  it('notifies only for valid changed finish and motion selections', async () => {
    const { journeyControls } = await import('./journey-controls');
    let calls = 0;
    const unsubscribe = journeyControls.subscribe(() => calls += 1);

    journeyControls.setSelectedFinish('blue-hour');
    journeyControls.setSelectedFinish('blue-hour');
    journeyControls.setMotionPreference('still');
    unsubscribe();

    expect(calls).toBe(2);
    expect(journeyControls.getSnapshot()).toMatchObject({ selectedFinish: 'blue-hour', motionPreference: 'still' });
  });
});
