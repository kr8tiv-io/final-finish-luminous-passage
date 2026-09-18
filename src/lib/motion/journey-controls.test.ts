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

  it('accepts the balanced preference alongside the two persisted v1 values', async () => {
    const { journeyControls } = await import('./journey-controls');

    journeyControls.setMotionPreference('balanced');
    expect(journeyControls.getSnapshot().motionPreference).toBe('balanced');
    journeyControls.setMotionPreference('nonsense' as never);
    expect(journeyControls.getSnapshot().motionPreference).toBe('balanced');
    journeyControls.setMotionPreference('auto');
    expect(journeyControls.getSnapshot().motionPreference).toBe('auto');
  });

  it('hydrates a persisted v1 preference through the migration, not around it', async () => {
    const store = new Map<string, string>([[
      'final-finish:journey-controls:v1',
      JSON.stringify({ selectedFinish: 'salt-pepper', motionPreference: 'enhanced' }),
    ]]);
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    });
    const { journeyControls } = await import('./journey-controls');

    journeyControls.hydrate();
    // 'enhanced' was never a valid v1 value, so it must land on 'auto' rather
    // than being written straight into the snapshot.
    expect(journeyControls.getSnapshot()).toMatchObject({
      selectedFinish: 'salt-pepper',
      motionPreference: 'auto',
    });
    vi.unstubAllGlobals();
  });

  it('migrates every persisted v1 preference forward and drops anything else', async () => {
    const { migrateMotionPreference } = await import('./journey-controls');

    expect(migrateMotionPreference('auto')).toBe('auto');
    expect(migrateMotionPreference('still')).toBe('still');
    expect(migrateMotionPreference('balanced')).toBe('balanced');
    expect(migrateMotionPreference('enhanced')).toBe('auto');
    expect(migrateMotionPreference(undefined)).toBe('auto');
    expect(migrateMotionPreference(null)).toBe('auto');
  });
});
