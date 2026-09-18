import { describe, expect, it, vi } from 'vitest';
import type { JourneySnapshot } from './journey-director';
import { SURFACE_GLOSS_LIFT } from './surface-materials';
import {
  chapterSurfaceTarget,
  createSurfaceStore,
  effectiveSurfaceState,
  HORIZON_CANDIDATE_SELECTOR,
  HORIZON_CLEAR_FADE,
  horizonHitBlocks,
  horizonProbePoints,
  horizonRowClear,
  horizonRowCrossing,
  rectIntersectsViewport,
  scissorBox,
  SURFACE_PRESENCE,
  surfaceAdmitted,
  surfaceChapterEdge,
  surfaceChapterPresence,
  surfaceChapterPresenceEdge,
  surfaceGlossLift,
  surfaceTargetsEqual,
  type HorizonHit,
  type SurfaceCapabilities,
  type SurfaceDriver,
} from './surface-store';

const hit = (tag: string, overrides: Partial<HorizonHit> = {}): HorizonHit =>
  ({ tag, text: false, avoid: false, ...overrides });

const CAPABLE: SurfaceCapabilities = Object.freeze({
  tier: null,
  webgl2: true,
  colorBufferFloat: true,
  reducedMotion: false,
  saveData: false,
  coarsePointer: false,
  motionPreference: 'auto',
});

function snapshot(overrides: Partial<JourneySnapshot> = {}): JourneySnapshot {
  return {
    revision: 1,
    activeChapter: 'portico',
    activeIndex: 0,
    fromChapter: 'portico',
    fromIndex: 0,
    toChapter: 'foundation',
    toIndex: 1,
    chapterProgress: 0,
    transitionProgress: 0,
    journeyProgress: 0,
    scrollY: 0,
    viewportWidth: 1440,
    viewportHeight: 900,
    visible: true,
    documentVisible: true,
    whiteStageActive: false,
    scrollDirection: 1,
    transitionFromWhite: false,
    readingChapter: null,
    whiteTarget: null,
    boundaryKey: null,
    mediaOwner: 'from',
    handoff: 0,
    ...overrides,
  };
}

function fakeDriver() {
  return {
    mixTo: vi.fn(),
    setMix: vi.fn(),
    setStates: vi.fn(),
    setHorizon: vi.fn(),
    setPresence: vi.fn(),
    setHorizonClear: vi.fn(),
    setCamera: vi.fn(),
    sweep: vi.fn(),
    settle: vi.fn(),
    invalidate: vi.fn(),
  } satisfies SurfaceDriver & Record<string, unknown>;
}

function fakeElement(rect: { left: number; top: number; width: number; height: number }): HTMLElement {
  return { getBoundingClientRect: () => rect } as unknown as HTMLElement;
}

describe('surfaceAdmitted', () => {
  it('admits a capable desktop while the tier attribute is absent', () => {
    expect(surfaceAdmitted(CAPABLE)).toBe(true);
  });

  it('never admits without WebGL2, whatever the tier says', () => {
    expect(surfaceAdmitted({ ...CAPABLE, webgl2: false })).toBe(false);
    expect(surfaceAdmitted({ ...CAPABLE, webgl2: false, tier: 'full' })).toBe(false);
  });

  it('lets the tier attribute override the probe once Step 28 writes it', () => {
    expect(surfaceAdmitted({ ...CAPABLE, tier: 'full', coarsePointer: true, colorBufferFloat: false })).toBe(true);
    expect(surfaceAdmitted({ ...CAPABLE, tier: 'balanced' })).toBe(false);
    expect(surfaceAdmitted({ ...CAPABLE, tier: 'still' })).toBe(false);
  });

  it('refuses every reason FilmVeilLoader refuses, plus a coarse pointer', () => {
    expect(surfaceAdmitted({ ...CAPABLE, colorBufferFloat: false })).toBe(false);
    expect(surfaceAdmitted({ ...CAPABLE, reducedMotion: true })).toBe(false);
    expect(surfaceAdmitted({ ...CAPABLE, saveData: true })).toBe(false);
    expect(surfaceAdmitted({ ...CAPABLE, coarsePointer: true })).toBe(false);
    expect(surfaceAdmitted({ ...CAPABLE, motionPreference: 'still' })).toBe(false);
  });
});

describe('scissorBox', () => {
  it('flips a viewport-relative CSS rect into a bottom-left WebGL box', () => {
    expect(scissorBox({ left: 0, top: 558, width: 1440, height: 342 }, 1440, 900)).toEqual({
      x: 0, y: 0, width: 1440, height: 342,
    });
    expect(scissorBox({ left: 100, top: 100, width: 200, height: 300 }, 1440, 900)).toEqual({
      x: 100, y: 500, width: 200, height: 300,
    });
  });

  it('clips a rect that runs past the canvas edges', () => {
    expect(scissorBox({ left: -50, top: -40, width: 200, height: 200 }, 1440, 900)).toEqual({
      x: 0, y: 740, width: 150, height: 160,
    });
    expect(scissorBox({ left: 1400, top: 850, width: 200, height: 200 }, 1440, 900)).toEqual({
      x: 1400, y: 0, width: 40, height: 50,
    });
  });

  it('returns an empty box for a rect fully off-canvas', () => {
    const box = scissorBox({ left: 2000, top: 2000, width: 100, height: 100 }, 1440, 900);
    expect(box.width).toBe(0);
    expect(box.height).toBe(0);
  });
});

describe('rectIntersectsViewport', () => {
  it('accepts a partially visible rect and rejects one that has scrolled away', () => {
    expect(rectIntersectsViewport({ left: 0, top: 558, width: 1440, height: 342 }, 1440, 900)).toBe(true);
    expect(rectIntersectsViewport({ left: 0, top: -400, width: 1440, height: 342 }, 1440, 900)).toBe(false);
    expect(rectIntersectsViewport({ left: 0, top: 900, width: 1440, height: 342 }, 1440, 900)).toBe(false);
    expect(rectIntersectsViewport({ left: 0, top: -100, width: 1440, height: 342 }, 1440, 900)).toBe(true);
  });

  it('rejects a collapsed rect', () => {
    expect(rectIntersectsViewport({ left: 0, top: 0, width: 0, height: 342 }, 1440, 900)).toBe(false);
    expect(rectIntersectsViewport({ left: 0, top: 0, width: 1440, height: 0 }, 1440, 900)).toBe(false);
  });
});

describe('chapterSurfaceTarget', () => {
  it('holds portico liquid through the pour and cures it in the last fifth', () => {
    expect(chapterSurfaceTarget(snapshot({ chapterProgress: 0 })))
      .toEqual({ a: 0, b: 2, mix: 0, horizon: false, presence: 0 });
    expect(chapterSurfaceTarget(snapshot({ chapterProgress: 0.79 })).mix).toBe(0);
    expect(chapterSurfaceTarget(snapshot({ chapterProgress: 0.9 })).mix).toBeCloseTo(0.5, 5);
    expect(chapterSurfaceTarget(snapshot({ chapterProgress: 1 })).mix).toBe(1);
  });

  it('runs foundation from ground concrete to cured pearl across its own progress', () => {
    const target = chapterSurfaceTarget(snapshot({ activeChapter: 'foundation', chapterProgress: 0.25 }));
    expect(target).toEqual({ a: 1, b: 2, mix: 0.25, horizon: false, presence: SURFACE_PRESENCE.sheen });
  });

  it('maps every remaining chapter to the storyboard state', () => {
    const states: ReadonlyArray<[JourneySnapshot['activeChapter'], number]> = [
      ['garage', 2], ['vault', 3], ['finish-hall', 5], ['commercial', 6], ['proof', 3], ['consultation', 7],
    ];
    for (const [activeChapter, expected] of states) {
      const target = chapterSurfaceTarget(snapshot({ activeChapter, chapterProgress: 0.5 }));
      expect(target.a).toBe(expected);
      expect(target.b).toBe(expected);
      expect(target.mix).toBe(0);
    }
  });

  it('blends the outgoing end state into the incoming start state on a boundary', () => {
    const target = chapterSurfaceTarget(snapshot({
      activeChapter: 'vault', fromChapter: 'garage', toChapter: 'vault', transitionProgress: 0.4,
    }));
    expect(target).toMatchObject({ a: 2, b: 3, mix: 0.4, horizon: false });

    const exit = chapterSurfaceTarget(snapshot({
      activeChapter: 'portico', fromChapter: 'portico', toChapter: 'foundation', transitionProgress: 0.7,
    }));
    // portico ends cured (2) and foundation opens on ground concrete (1).
    expect(exit).toMatchObject({ a: 2, b: 1, mix: 0.7, horizon: false });
  });

  it('ignores a settled boundary at either endpoint', () => {
    expect(chapterSurfaceTarget(snapshot({ transitionProgress: 0 })).mix).toBe(0);
    expect(chapterSurfaceTarget(snapshot({
      activeChapter: 'vault', fromChapter: 'garage', toChapter: 'vault', transitionProgress: 1,
    }))).toEqual({ a: 3, b: 3, mix: 0, horizon: false, presence: SURFACE_PRESENCE.sheen });
  });

  it('switches to horizon mode on a white stage without freezing the blend', () => {
    const target = chapterSurfaceTarget(snapshot({
      activeChapter: 'foundation', chapterProgress: 0.6, whiteStageActive: true,
    }));
    expect(target.horizon).toBe(true);
    expect(target.mix).toBeCloseTo(0.6, 5);
  });

  it('names the chapter edges the boundary rule reads', () => {
    expect(surfaceChapterEdge('portico', 'start')).toBe(0);
    expect(surfaceChapterEdge('portico', 'end')).toBe(2);
    expect(surfaceChapterEdge('foundation', 'start')).toBe(1);
    expect(surfaceChapterEdge('consultation', 'end')).toBe(7);
  });
});

describe('plane presence', () => {
  it('holds every media chapter at a sheen, never at full strength', () => {
    const media: ReadonlyArray<JourneySnapshot['activeChapter']> = [
      'foundation', 'garage', 'vault', 'finish-hall', 'commercial', 'consultation',
    ];
    for (const activeChapter of media) {
      expect(chapterSurfaceTarget(snapshot({ activeChapter, chapterProgress: 0.5 })).presence)
        .toBe(SURFACE_PRESENCE.sheen);
    }
    // Falsifiable: a rule that returned the sheen for everything would say nothing
    // about films. A chapter with nothing behind the band keeps the whole plane.
    expect(surfaceChapterPresence('proof', 0.5)).toBe(SURFACE_PRESENCE.full);
    expect(SURFACE_PRESENCE.sheen).toBeLessThan(SURFACE_PRESENCE.full);
  });

  it('is born with the pour: no plane over portico until the cure starts', () => {
    expect(chapterSurfaceTarget(snapshot({ chapterProgress: 0 })).presence).toBe(0);
    expect(chapterSurfaceTarget(snapshot({ chapterProgress: 0.8 })).presence).toBe(0);
    expect(chapterSurfaceTarget(snapshot({ chapterProgress: 0.9 })).presence)
      .toBeCloseTo(SURFACE_PRESENCE.sheen / 2, 5);
    expect(chapterSurfaceTarget(snapshot({ chapterProgress: 1 })).presence).toBe(SURFACE_PRESENCE.sheen);
    expect(surfaceChapterPresenceEdge('portico', 'start')).toBe(0);
    expect(surfaceChapterPresenceEdge('portico', 'end')).toBe(SURFACE_PRESENCE.sheen);
  });

  it('drops to a faint reflection on a white stage or a reading aside', () => {
    expect(chapterSurfaceTarget(snapshot({ activeChapter: 'garage', whiteStageActive: true })).presence)
      .toBe(SURFACE_PRESENCE.reflection);
    expect(chapterSurfaceTarget(snapshot({
      activeChapter: 'vault', fromChapter: 'garage', toChapter: 'vault',
      transitionProgress: 0.5, whiteStageActive: true,
    })).presence).toBe(SURFACE_PRESENCE.reflection);
  });

  it('lifts across a boundary and joins the chapters without a step', () => {
    const at = (transitionProgress: number) => chapterSurfaceTarget(snapshot({
      activeChapter: 'vault', fromChapter: 'garage', toChapter: 'vault', transitionProgress,
    })).presence;
    expect(at(0.5)).toBeCloseTo(SURFACE_PRESENCE.boundary, 5);
    expect(at(0.5)).toBeGreaterThan(SURFACE_PRESENCE.sheen);
    // Both ends meet the interior value of the chapter on that side, so scrolling in or
    // out of a boundary can never pop.
    expect(at(0.001)).toBeCloseTo(SURFACE_PRESENCE.sheen, 2);
    expect(at(0.999)).toBeCloseTo(SURFACE_PRESENCE.sheen, 2);
  });

  it('carries presence through the driver seam and the equality check', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);

    store.applyTarget({ a: 2, b: 2, mix: 0, horizon: false, presence: 0.32 });
    expect(store.getSnapshot().presence).toBe(0.32);
    // Scroll-linked: no tween, exactly like setMix.
    expect(driver.setPresence).toHaveBeenLastCalledWith(0.32, 0);

    // A presence-only move is a real change, not a no-op.
    driver.setPresence.mockClear();
    store.applyTarget({ a: 2, b: 2, mix: 0, horizon: false, presence: 0.6 });
    expect(driver.setPresence).toHaveBeenLastCalledWith(0.6, 0);
    expect(surfaceTargetsEqual(
      { a: 2, b: 2, mix: 0, horizon: false, presence: 0.6 },
      { a: 2, b: 2, mix: 0, horizon: false, presence: 0.32 },
    )).toBe(false);

    // Across a horizon flip it tweens instead, or the product of the two pops.
    driver.setPresence.mockClear();
    store.applyTarget({ a: 2, b: 2, mix: 0, horizon: true, presence: 0.06 });
    expect(driver.setPresence).toHaveBeenLastCalledWith(0.06, 0.6);
  });

  it('spends the gloss lift only where the plane is subordinate to a film', () => {
    // Nothing behind the band: an ordinary `over`, unchanged from Step 18a. This is the
    // case surface.spec's morphTo delta measures on /dev/surface.
    expect(surfaceGlossLift(SURFACE_PRESENCE.full)).toBe(0);
    // Over a film: fully on.
    expect(surfaceGlossLift(SURFACE_PRESENCE.sheen)).toBe(SURFACE_GLOSS_LIFT);
    expect(surfaceGlossLift(SURFACE_PRESENCE.reflection)).toBe(SURFACE_GLOSS_LIFT);
    // Mid-boundary the morph is the subject and the plane may assert itself again.
    const boundary = surfaceGlossLift(SURFACE_PRESENCE.boundary);
    expect(boundary).toBeGreaterThan(0);
    expect(boundary).toBeLessThan(SURFACE_GLOSS_LIFT);
  });

  it('treats an unspecified presence as the whole plane, for callers with no film', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    store.applyTarget({ a: 2, b: 2, mix: 0, horizon: true });
    expect(store.getSnapshot().presence).toBe(SURFACE_PRESENCE.full);
    expect(surfaceTargetsEqual(
      { a: 2, b: 2, mix: 0, horizon: true },
      { a: 2, b: 2, mix: 0, horizon: true, presence: SURFACE_PRESENCE.full },
    )).toBe(true);
  });
});

describe('target helpers', () => {
  it('resolves the effective state and compares targets by value', () => {
    expect(effectiveSurfaceState({ a: 1, b: 2, mix: 0.6 })).toBe(2);
    expect(surfaceTargetsEqual(
      { a: 1, b: 2, mix: 0.6, horizon: false },
      { a: 1, b: 2, mix: 0.6, horizon: false },
    )).toBe(true);
    expect(surfaceTargetsEqual(
      { a: 1, b: 2, mix: 0.6, horizon: false },
      { a: 1, b: 2, mix: 0.6, horizon: true },
    )).toBe(false);
  });
});

describe('view registry', () => {
  it('registers, orders by priority, and unregisters through the returned handle', () => {
    const store = createSurfaceStore();
    const render = vi.fn();
    const off = store.registerView('floor', fakeElement({ left: 0, top: 558, width: 1440, height: 342 }), {
      render, priority: 0,
    });
    store.registerView('veil', fakeElement({ left: 0, top: 0, width: 1440, height: 900 }), {
      render, priority: 10,
    });
    expect(store.listViews().map((view) => view.id)).toEqual(['floor', 'veil']);
    off();
    expect(store.listViews().map((view) => view.id)).toEqual(['veil']);
  });

  it('skips views whose element has scrolled out of the viewport', () => {
    const store = createSurfaceStore();
    store.registerView('onscreen', fakeElement({ left: 0, top: 558, width: 1440, height: 342 }), { render: vi.fn() });
    store.registerView('offscreen', fakeElement({ left: 0, top: 2000, width: 1440, height: 342 }), { render: vi.fn() });
    expect(store.visibleViews(1440, 900).map((entry) => entry.view.id)).toEqual(['onscreen']);
  });

  it('lends the plane to the menu and hands the horizon back on close', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    // A white stage is on screen: the journey has folded the plane down to its line.
    store.applyTarget({ a: 5, b: 5, mix: 0, horizon: true });
    const floor = fakeElement({ left: 0, top: 0, width: 1440, height: 900 });
    driver.setHorizon.mockClear();

    store.setMenuFloor(floor);
    expect(store.getSnapshot().menuOpen).toBe(true);
    expect(store.getMenuFloor()).toBe(floor);
    // The plane comes back up for the menu...
    expect(driver.setHorizon).toHaveBeenLastCalledWith(false, 0.6);

    // ...and the menu is the only writer while it holds it. A director publish here
    // is recorded, not applied, so a hovered finish survives a scroll nudge.
    driver.setStates.mockClear();
    driver.setMix.mockClear();
    driver.setHorizon.mockClear();
    store.morphTo(3);
    expect(store.getSnapshot().b).toBe(3);
    store.applyTarget({ a: 1, b: 2, mix: 0.25, horizon: false });
    expect(driver.setStates).not.toHaveBeenCalledWith(1, 2);
    expect(store.getSnapshot().b, 'the hovered finish outranks a director publish').toBe(3);
    expect(driver.setHorizon).not.toHaveBeenCalled();

    // Closing hands the plane back to the last thing the journey published, not to
    // whatever the last hover left on it.
    store.setMenuFloor(null);
    expect(store.getSnapshot().menuOpen).toBe(false);
    expect(store.getMenuFloor()).toBeNull();
    expect(store.getSnapshot().a).toBe(1);
    expect(store.getSnapshot().b).toBe(2);
    expect(store.getSnapshot().mix).toBe(0.25);
    expect(driver.setHorizon).toHaveBeenLastCalledWith(false, 0.6);
  });

  it('gives the plane back to what it was showing when no director publishes', () => {
    // A route with no `.journey`: nothing re-publishes a target after the menu
    // closes, so the store's own parked target is the only thing that can restore it.
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    store.applyTarget({ a: 2, b: 2, mix: 0, horizon: true });

    store.setMenuFloor(fakeElement({ left: 0, top: 0, width: 1440, height: 900 }));
    store.morphTo(5);
    expect(store.getSnapshot().b).toBe(5);

    store.setMenuFloor(null);
    expect(store.getSnapshot()).toMatchObject({ a: 2, b: 2, mix: 0, horizon: true });
  });

  it('counts frames only when the canvas says so', () => {
    const store = createSurfaceStore();
    expect(store.getFrames()).toBe(0);
    store.noteFrame();
    store.noteFrame();
    expect(store.getFrames()).toBe(2);
    store.resetFrames();
    expect(store.getFrames()).toBe(0);
  });
});

describe('store material state', () => {
  it('reverses the existing blend when the target is the other end of the pair', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    store.applyTarget({ a: 2, b: 3, mix: 0.5, horizon: false });
    driver.mixTo.mockClear();
    driver.setStates.mockClear();

    store.morphTo(3);
    expect(driver.setStates).not.toHaveBeenCalled();
    expect(driver.mixTo).toHaveBeenCalledWith(3 === 3 ? 1 : 0, 0.6, 'power2.inOut');
    expect(store.getSnapshot().mix).toBe(1);

    store.morphTo(2);
    expect(driver.mixTo).toHaveBeenLastCalledWith(0, 0.6, 'power2.inOut');
    expect(store.getSnapshot().mix).toBe(0);
  });

  it('re-pairs the slots from the current dominant state for a brand new target', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    store.applyTarget({ a: 2, b: 3, mix: 0.8, horizon: false });
    driver.setStates.mockClear();
    driver.setMix.mockClear();

    store.morphTo(5);
    expect(driver.setStates).toHaveBeenCalledWith(3, 5);
    expect(driver.setMix).toHaveBeenCalledWith(0);
    expect(driver.mixTo).toHaveBeenLastCalledWith(1, 0.6, 'power2.inOut');
    expect(store.getSnapshot()).toMatchObject({ a: 3, b: 5, mix: 1 });
  });

  it('ignores a state id outside 0-7', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    driver.mixTo.mockClear();
    store.morphTo(9 as never);
    expect(driver.mixTo).not.toHaveBeenCalled();
  });

  it('scrubs without starting a tween and only tweens the horizon when it flips', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    driver.mixTo.mockClear();
    driver.setHorizon.mockClear();

    store.applyTarget({ a: 1, b: 2, mix: 0.3, horizon: false });
    expect(driver.mixTo).not.toHaveBeenCalled();
    expect(driver.setMix).toHaveBeenLastCalledWith(0.3);
    expect(driver.setHorizon).not.toHaveBeenCalled();

    store.applyTarget({ a: 1, b: 2, mix: 0.6, horizon: true });
    expect(driver.setHorizon).toHaveBeenCalledWith(true, 0.6);
  });

  it('does nothing when the target has not moved', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    store.applyTarget({ a: 1, b: 2, mix: 0.3, horizon: false });
    driver.setMix.mockClear();
    store.applyTarget({ a: 1, b: 2, mix: 0.3, horizon: false });
    expect(driver.setMix).not.toHaveBeenCalled();
  });

  it('drives the director snapshot straight through the adapter', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    store.applyJourneySnapshot(snapshot({ activeChapter: 'finish-hall', chapterProgress: 0.5 }));
    expect(store.getSnapshot()).toMatchObject({ a: 5, b: 5, mix: 0 });
  });

  it('marks settled and hands the damp to the driver', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    store.applyTarget({ a: 1, b: 2, mix: 0.4, horizon: false });
    expect(store.getSnapshot().settled).toBe(false);
    store.settle();
    expect(driver.settle).toHaveBeenCalledWith(0.5);
    expect(store.getSnapshot().settled).toBe(true);
  });

  it('publishes to subscribers only when something actually changed', () => {
    const store = createSurfaceStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setRenderer('webgl');
    expect(listener).toHaveBeenCalledTimes(1);
    store.setRenderer('webgl');
    expect(listener).toHaveBeenCalledTimes(1);
    store.setCamera('kneeling');
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('refuses an unknown camera mode', () => {
    const store = createSurfaceStore();
    store.setCamera('flying' as never);
    expect(store.getSnapshot().camera).toBe('standing');
  });

  it('replays current state into a driver bound after the fact', () => {
    const store = createSurfaceStore();
    store.applyTarget({ a: 3, b: 5, mix: 0.25, horizon: true });
    const driver = fakeDriver();
    store.bindDriver(driver);
    expect(driver.setStates).toHaveBeenCalledWith(3, 5);
    expect(driver.setMix).toHaveBeenCalledWith(0.25);
    expect(driver.setPresence).toHaveBeenCalledWith(SURFACE_PRESENCE.full, 0);
    expect(driver.setHorizon).toHaveBeenCalledWith(true, 0);
    expect(driver.setCamera).toHaveBeenCalledWith('standing');
  });

  it('serves a frozen server snapshot for SSR', () => {
    const store = createSurfaceStore();
    store.applyTarget({ a: 3, b: 5, mix: 0.25, horizon: true });
    expect(store.getServerSnapshot()).toMatchObject({ a: 0, b: 0, mix: 0, horizon: false, renderer: 'none' });
  });

  it('carries the occlusion answer to the driver, and only when it changes', () => {
    const store = createSurfaceStore();
    const driver = fakeDriver();
    store.bindDriver(driver);
    // Bound state replays: a driver arriving mid-page must not draw a line that is off.
    expect(driver.setHorizonClear).toHaveBeenCalledWith(true, 0);
    expect(store.getSnapshot().horizonClear).toBe(true);

    store.setHorizonClear(false, HORIZON_CLEAR_FADE);
    expect(driver.setHorizonClear).toHaveBeenLastCalledWith(false, HORIZON_CLEAR_FADE);
    expect(store.getSnapshot().horizonClear).toBe(false);

    store.setHorizonClear(false, HORIZON_CLEAR_FADE);
    expect(driver.setHorizonClear).toHaveBeenCalledTimes(2);

    store.setHorizonClear(true, 0);
    expect(driver.setHorizonClear).toHaveBeenLastCalledWith(true, 0);
  });

  it('leaves the plane alone when the line is gated', () => {
    const store = createSurfaceStore();
    store.applyTarget({ a: 2, b: 2, mix: 0, horizon: true, presence: SURFACE_PRESENCE.reflection });
    const driver = fakeDriver();
    store.bindDriver(driver);
    const before = store.getSnapshot();
    store.setHorizonClear(false, HORIZON_CLEAR_FADE);
    const after = store.getSnapshot();
    expect(after.presence).toBe(before.presence);
    expect(after.horizon).toBe(before.horizon);
    expect(after.a).toBe(before.a);
    expect(after.b).toBe(before.b);
    // Nothing but the gate's own lever moved.
    expect(driver.setPresence).toHaveBeenCalledTimes(1);
    expect(driver.setHorizon).toHaveBeenCalledTimes(1);
  });
});

describe('horizon line occlusion rule', () => {
  it('blocks on an element that carries its own words', () => {
    expect(horizonHitBlocks(hit('P', { text: true }))).toBe(true);
    expect(horizonHitBlocks(hit('H2', { text: true }))).toBe(true);
    expect(horizonHitBlocks(hit('LI', { text: true }))).toBe(true);
    expect(horizonHitBlocks(hit('BLOCKQUOTE', { text: true }))).toBe(true);
    expect(horizonHitBlocks(hit('FIGCAPTION', { text: true }))).toBe(true);
    expect(horizonHitBlocks(hit('BUTTON', { text: true }))).toBe(true);
    expect(horizonHitBlocks(hit('LABEL', { text: true }))).toBe(true);
    expect(horizonHitBlocks(hit('SPAN', { text: true }))).toBe(true);
  });

  it('lets the line under a text-tagged element that holds no words of its own', () => {
    // The storyboard wants the line under the review cards — an <a> wrapping a photo
    // must not veto it across the whole card. The descendant that does hold the words
    // is in the same hit stack wherever the sample actually lands on it.
    expect(horizonHitBlocks(hit('A'))).toBe(false);
    expect(horizonHitBlocks(hit('SPAN'))).toBe(false);
    expect(horizonHitBlocks(hit('P'))).toBe(false);
  });

  it('never blocks on a layout container, however deep the stack', () => {
    expect(horizonHitBlocks(hit('DIV', { text: true }))).toBe(false);
    expect(horizonHitBlocks(hit('SECTION', { text: true }))).toBe(false);
    expect(horizonHitBlocks(hit('BODY', { text: true }))).toBe(false);
    expect(horizonHitBlocks(hit('HTML'))).toBe(false);
    expect(horizonHitBlocks(hit('CANVAS'))).toBe(false);
    expect(horizonHitBlocks(hit('IMG'))).toBe(false);
    expect(horizonHitBlocks(hit('VIDEO'))).toBe(false);
  });

  it('blocks on a form control whether or not it reports text', () => {
    // Their words live in a value or a placeholder, not in a child text node.
    expect(horizonHitBlocks(hit('INPUT'))).toBe(true);
    expect(horizonHitBlocks(hit('TEXTAREA'))).toBe(true);
    expect(horizonHitBlocks(hit('SELECT'))).toBe(true);
  });

  it('honours the data-horizon-avoid opt-out on any tag', () => {
    expect(horizonHitBlocks(hit('DIV', { avoid: true }))).toBe(true);
    expect(horizonHitBlocks(hit('svg', { avoid: true }))).toBe(true);
  });

  it('clears a row only when not one candidate blocks', () => {
    const clean = [hit('DIV'), hit('BODY'), hit('IMG'), hit('A')];
    expect(horizonRowClear(clean)).toBe(true);
    expect(horizonRowClear([])).toBe(true);
    // One blocker among many is enough: the line is one rule across the whole width.
    expect(horizonRowClear([...clean, hit('SPAN', { text: true })])).toBe(false);
  });

  it('offers every text-bearing tag, and the opt-out, to the first pass', () => {
    const parts = HORIZON_CANDIDATE_SELECTOR.split(',');
    for (const tag of ['p', 'h1', 'h6', 'li', 'blockquote', 'figcaption', 'a', 'span', 'button', 'label']) {
      expect(parts, `${tag} is queried`).toContain(tag);
    }
    for (const tag of ['input', 'textarea', 'select']) expect(parts).toContain(tag);
    expect(parts).toContain('[data-horizon-avoid]');
    // Containers are not queried at all — that is what keeps the first pass cheap.
    expect(parts).not.toContain('div');
    expect(parts).not.toContain('section');
  });

  it('crosses the row only for a box that is on the row and on screen', () => {
    const box = (left: number, right: number, top: number, bottom: number) => ({ left, right, top, bottom });
    expect(horizonRowCrossing(box(100, 400, 550, 570), 558, 1440)).toBe(true);
    // Touching either edge of the row still counts: the line is drawn in that pixel.
    expect(horizonRowCrossing(box(100, 400, 558, 600), 558, 1440)).toBe(true);
    expect(horizonRowCrossing(box(100, 400, 500, 558), 558, 1440)).toBe(true);
    // Above and below.
    expect(horizonRowCrossing(box(100, 400, 200, 557), 558, 1440)).toBe(false);
    expect(horizonRowCrossing(box(100, 400, 559, 900), 558, 1440)).toBe(false);
    // The two false positives this rule was first measured to have: a 1 px-wide
    // paragraph parked off the left edge, and a box collapsed to nothing.
    expect(horizonRowCrossing(box(-1, 0, 400, 700), 558, 1440)).toBe(false);
    expect(horizonRowCrossing(box(300, 300, 400, 700), 558, 1440)).toBe(false);
    expect(horizonRowCrossing(box(300, 900, 558, 558), 558, 1440)).toBe(false);
    // Parked off the right edge.
    expect(horizonRowCrossing(box(1440, 1800, 400, 700), 558, 1440)).toBe(false);
    // Half off screen is still on screen.
    expect(horizonRowCrossing(box(-200, 40, 400, 700), 558, 1440)).toBe(true);
  });

  it('aims the hit test inside the candidate, clamped to the viewport', () => {
    const points = horizonProbePoints({ left: 100, right: 400, top: 0, bottom: 10 }, 1440);
    expect(points).toEqual([101, 250, 399]);
    for (const x of points) {
      expect(x).toBeGreaterThanOrEqual(100);
      expect(x).toBeLessThanOrEqual(400);
    }
    // A candidate hanging off the left edge is probed from the part that shows.
    const clamped = horizonProbePoints({ left: -500, right: 60, top: 0, bottom: 10 }, 1440);
    expect(Math.min(...clamped)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...clamped)).toBeLessThanOrEqual(60);
    // ...and off the right edge likewise, never at `innerWidth` where nothing is hit.
    const right = horizonProbePoints({ left: 1400, right: 3000, top: 0, bottom: 10 }, 1440);
    expect(Math.max(...right)).toBeLessThanOrEqual(1439);
    // Degenerate boxes still get one usable point rather than an empty probe.
    expect(horizonProbePoints({ left: 300, right: 301, top: 0, bottom: 1 }, 1440)).toEqual([300]);
    expect(horizonProbePoints({ left: 300, right: 300, top: 0, bottom: 1 }, 1440)).toEqual([300]);
  });
});
