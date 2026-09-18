import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  JOURNEY_CHAPTER_IDS,
  createJourneyDirector,
  removeJourneyEnhancement,
  sampleJourneySnapshot,
  type JourneyMetrics,
} from './journey-director';

const metrics: JourneyMetrics = {
  top: 0,
  bottom: 6_000,
  chapters: [
    { id: 'portico', start: 0, end: 1_000 },
    { id: 'foundation', start: 1_500, end: 2_500 },
    { id: 'garage', start: 3_000, end: 4_000 },
  ],
  transitions: [
    { from: 'portico', to: 'foundation', start: 1_000, end: 1_500 },
    { from: 'foundation', to: 'garage', start: 2_500, end: 3_000 },
  ],
  readings: [
    { id: 'portico', start: 120, end: 620 },
    { id: 'foundation', start: 1_820, end: 2_180 },
    { id: 'garage', start: 3_320, end: 3_680 },
  ],
};

describe('native journey snapshots', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('publishes the stable eight-room manifest in semantic order', () => {
    expect(JOURNEY_CHAPTER_IDS).toEqual([
      'portico',
      'foundation',
      'garage',
      'vault',
      'finish-hall',
      'commercial',
      'proof',
      'consultation',
    ]);
  });

  it('restores the static journey when an optional motion island fails', () => {
    let removed = '';
    removeJourneyEnhancement({
      querySelector: () => ({ removeAttribute: (name: string) => { removed = name; } }),
    });
    expect(removed).toBe('data-journey-enhanced');
  });

  it('keeps dissolve endpoints exact at both edges of a native-flow breath', () => {
    const atStart = sampleJourneySnapshot(metrics, 500, 1_000, true, 1);
    const atEnd = sampleJourneySnapshot(metrics, 1_000, 1_000, true, 2);

    expect(atStart.fromChapter).toBe('portico');
    expect(atStart.toChapter).toBe('foundation');
    expect(atStart.transitionProgress).toBe(0);
    expect(atEnd.activeChapter).toBe('foundation');
    expect(atEnd.transitionProgress).toBe(1);
  });

  it('does not complete the incoming heading before its copy surface actually arrives', () => {
    const duringBreath = sampleJourneySnapshot(metrics, 1_120, 1_000, true, 1);
    const atCopyArrival = sampleJourneySnapshot(metrics, 1_160, 1_000, true, 2);

    expect(duringBreath.activeChapter).toBe('foundation');
    expect(duringBreath.readingChapter).toBeNull();
    expect(atCopyArrival.readingChapter).toBe('foundation');
  });

  it('reports the actually visible heading after an immediate deep-link jump', () => {
    const deepLinked = sampleJourneySnapshot(metrics, 2_700, 1_000, true, 1);

    expect(deepLinked.readingChapter).toBe('garage');
  });

  it('turns the fixed media stage off while the viewport centre is inside a white interlude', () => {
    const staged: JourneyMetrics = {
      ...metrics,
      whiteStages: [{ start: 1_000, end: 1_500 }],
    };

    expect(sampleJourneySnapshot(staged, 499, 1_000, true, 1).whiteStageActive).toBe(false);
    expect(sampleJourneySnapshot(staged, 500, 1_000, true, 2).whiteStageActive).toBe(true);
    expect(sampleJourneySnapshot(staged, 999, 1_000, true, 3).whiteStageActive).toBe(true);
    expect(sampleJourneySnapshot(staged, 1_000, 1_000, true, 4).whiteStageActive).toBe(false);
  });

  it('publishes a dedicated opening-to-review boundary without borrowing the later room transition', () => {
    const staged: JourneyMetrics = {
      ...metrics,
      whiteStages: [{ start: 1_000, end: 1_500 }],
      whiteTargets: [{ id: 'customer-reviews', from: 'portico', start: 700, end: 1_000 }],
    };

    const start = sampleJourneySnapshot(staged, 200, 1_000, true, 1, 1_440, 199);
    const middle = sampleJourneySnapshot(staged, 350, 1_000, true, 2, 1_440, 200);
    const reversed = sampleJourneySnapshot(staged, 350, 1_000, true, 3, 1_440, 351);
    const review = sampleJourneySnapshot(staged, 500, 1_000, true, 4, 1_440, 350);

    expect(start.whiteTarget).toEqual({ id: 'customer-reviews', from: 'portico', progress: 0 });
    expect(middle.whiteTarget).toEqual({ id: 'customer-reviews', from: 'portico', progress: 0.5 });
    expect(reversed.whiteTarget).toEqual(middle.whiteTarget);
    expect(reversed.scrollDirection).toBe(-1);
    expect(review.whiteTarget).toEqual({ id: 'customer-reviews', from: 'portico', progress: 1 });
    expect(review.whiteStageActive).toBe(true);
    expect(review.transitionProgress).toBe(0);
  });

  it('reports scroll direction without changing a sampled boundary when the visitor reverses', () => {
    expect(sampleJourneySnapshot(metrics, 600, 1_000, true, 2, 1_440, 500).scrollDirection).toBe(1);
    expect(sampleJourneySnapshot(metrics, 600, 1_000, true, 3, 1_440, 700).scrollDirection).toBe(-1);
    expect(sampleJourneySnapshot(metrics, 600, 1_000, true, 4, 1_440, 600).scrollDirection).toBe(0);
  });

  it('keeps a white-interlude exit attached to its breath at both endpoints and in reverse', () => {
    const staged: JourneyMetrics = {
      ...metrics,
      transitions: [{ ...metrics.transitions[0], fromWhiteStage: true }],
    };

    const start = sampleJourneySnapshot(staged, 500, 1_000, true, 1, 1_440, 499);
    const end = sampleJourneySnapshot(staged, 1_000, 1_000, true, 2, 1_440, 1_001);
    expect(start.transitionProgress).toBe(0);
    expect(start.transitionFromWhite).toBe(true);
    expect(end.transitionProgress).toBe(1);
    expect(end.transitionFromWhite).toBe(true);
    expect(end.scrollDirection).toBe(-1);
    expect(start.whiteTarget).toBeNull();
    expect(end.whiteTarget).toBeNull();
  });

  it('starts hero travel at zero before the visitor performs native scroll', () => {
    const snapshot = sampleJourneySnapshot(metrics, 0, 1_000, true, 1, 1_440);
    expect(snapshot.chapterProgress).toBe(0);
    expect(snapshot.scrollY).toBe(0);
    expect(snapshot.viewportWidth).toBe(1_440);
    expect(snapshot.viewportHeight).toBe(1_000);
  });

  it('maps viewport-centre chapter travel from zero to one in both scroll directions', () => {
    const viewportHeight = 1_000;
    const cinematic: JourneyMetrics = {
      top: 0,
      bottom: 3_200,
      chapters: [
        { id: 'portico', start: 0, end: 1_120 },
        { id: 'foundation', start: 1_320, end: 2_320 },
      ],
      transitions: [
        { from: 'portico', to: 'foundation', start: 1_120, end: 1_320 },
      ],
    };

    expect(sampleJourneySnapshot(cinematic, 0, viewportHeight, true, 1).chapterProgress).toBe(0);
    expect(sampleJourneySnapshot(cinematic, 620, viewportHeight, true, 2).chapterProgress).toBe(1);
    expect(sampleJourneySnapshot(cinematic, 820, viewportHeight, true, 3).chapterProgress).toBe(0);
    expect(sampleJourneySnapshot(cinematic, 1_320, viewportHeight, true, 4).chapterProgress).toBe(0.5);
    expect(sampleJourneySnapshot(cinematic, 1_820, viewportHeight, true, 5).chapterProgress).toBe(1);
    expect(sampleJourneySnapshot(cinematic, 820, viewportHeight, true, 6).chapterProgress).toBe(0);
  });

  it('freezes each emitted value and reports viewport/document suspension state', () => {
    const onscreen = sampleJourneySnapshot(metrics, 100, 1_000, true, 3);
    const offscreen = sampleJourneySnapshot(metrics, 7_000, 1_000, false, 4);

    expect(Object.isFrozen(onscreen)).toBe(true);
    expect(onscreen.visible).toBe(true);
    expect(onscreen.documentVisible).toBe(true);
    expect(offscreen.visible).toBe(false);
    expect(offscreen.documentVisible).toBe(false);
  });

  it('selects the correct rooms after large forward and reverse native-scroll jumps', () => {
    const final = sampleJourneySnapshot(metrics, 9_000, 1_000, true, 5);
    const reversed = sampleJourneySnapshot(metrics, 2_050, 1_000, true, 6);

    expect(final.activeChapter).toBe('garage');
    expect(final.fromChapter).toBe('garage');
    expect(final.toChapter).toBe('garage');
    expect(final.journeyProgress).toBe(1);
    expect(reversed.fromChapter).toBe('foundation');
    expect(reversed.toChapter).toBe('garage');
    expect(reversed.transitionProgress).toBeCloseTo(0.1);
  });

  it('keeps a viewport center inside a tall chapter instead of switching to a nearby short one', () => {
    const uneven: JourneyMetrics = {
      top: 0,
      bottom: 2_200,
      chapters: [
        { id: 'portico', start: 0, end: 2_000 },
        { id: 'foundation', start: 2_000, end: 2_200 },
      ],
      transitions: [],
    };

    expect(sampleJourneySnapshot(uneven, 1_300, 1_000, true, 1).activeChapter).toBe('portico');
  });

  it('handles missing and out-of-order measured chapters without throwing or misidentifying the final room', () => {
    const empty = sampleJourneySnapshot({ top: 0, bottom: 0, chapters: [], transitions: [] }, 0, 1_000, true, 1);
    const unordered: JourneyMetrics = {
      top: 0,
      bottom: 2_000,
      chapters: [
        { id: 'foundation', start: 1_000, end: 2_000 },
        { id: 'portico', start: 0, end: 900 },
      ],
      transitions: [],
    };

    expect(empty.activeChapter).toBe('portico');
    expect(sampleJourneySnapshot(unordered, 3_000, 1_000, true, 2).activeChapter).toBe('foundation');
  });

  it('crossfades the plates through the midpoint instead of cutting the media at it', () => {
    const at = (scrollY: number) => sampleJourneySnapshot(metrics, scrollY, 1_000, true, 1);
    // The portico:foundation breath spans 1_000..1_500 of viewport centre,
    // so centre = scrollY + 500 puts p at (scrollY - 500) / 500.
    const start = at(500);
    const early = at(700);
    const before = at(745);
    const mid = at(750);
    const after = at(755);
    const end = at(1_000);

    expect(start.transitionProgress).toBe(0);
    expect(start.handoff).toBe(0);
    expect(start.mediaOwner).toBe('from');
    expect(start.boundaryKey).toBe('portico:foundation');

    expect(early.handoff).toBeGreaterThan(0);
    expect(early.handoff).toBeLessThan(0.5);
    expect(early.mediaOwner).toBe('from');

    // The seam the veil used to cut at: both sides are already half blended.
    expect(before.handoff).toBeGreaterThan(0.35);
    expect(before.handoff).toBeLessThan(0.5);
    expect(before.mediaOwner).toBe('from');
    expect(mid.handoff).toBe(0.5);
    expect(mid.mediaOwner).toBe('to');
    expect(after.handoff).toBeGreaterThan(0.5);
    expect(after.handoff).toBeLessThan(0.65);
    expect(after.mediaOwner).toBe('to');

    expect(end.transitionProgress).toBe(1);
    expect(end.handoff).toBe(1);
    expect(end.mediaOwner).toBe('to');
  });

  it('keeps the active room in step with the crossfade weight in both directions', () => {
    const forward = sampleJourneySnapshot(metrics, 740, 1_000, true, 1, 1_440, 739);
    const reverse = sampleJourneySnapshot(metrics, 760, 1_000, true, 2, 1_440, 780);

    expect(forward.activeChapter).toBe(forward.fromChapter);
    expect(forward.handoff).toBeLessThan(0.5);
    expect(reverse.activeChapter).toBe(reverse.toChapter);
    expect(reverse.handoff).toBeGreaterThan(0.5);
    expect(reverse.scrollDirection).toBe(-1);
  });

  it('hands the media to the veil only for the boundary it actually confirmed', () => {
    const confirmed = sampleJourneySnapshot(metrics, 700, 1_000, true, 1, 1_440, 699, 1, 'portico:foundation');
    const otherBoundary = sampleJourneySnapshot(metrics, 700, 1_000, true, 2, 1_440, 699, 1, 'foundation:garage');
    const unconfirmed = sampleJourneySnapshot(metrics, 700, 1_000, true, 3, 1_440, 699, 1, null);

    expect(confirmed.mediaOwner).toBe('veil');
    expect(confirmed.handoff).toBe(unconfirmed.handoff);
    expect(otherBoundary.mediaOwner).toBe('from');
    expect(unconfirmed.mediaOwner).toBe('from');
  });

  it('never leaves the veil owning the media outside a boundary interior', () => {
    const atStart = sampleJourneySnapshot(metrics, 500, 1_000, true, 1, 1_440, 499, 1, 'portico:foundation');
    const atEnd = sampleJourneySnapshot(metrics, 1_000, 1_000, true, 2, 1_440, 999, 1, 'portico:foundation');
    const insideChapter = sampleJourneySnapshot(metrics, 200, 1_000, true, 3, 1_440, 199, 1, 'portico:foundation');

    expect(atStart.mediaOwner).toBe('from');
    expect(atEnd.mediaOwner).toBe('to');
    expect(insideChapter.mediaOwner).toBe('from');
    expect(insideChapter.boundaryKey).toBeNull();
  });

  it('gives the review wipe its own boundary key and no incoming plate to fade up', () => {
    const staged: JourneyMetrics = {
      ...metrics,
      whiteStages: [{ start: 1_000, end: 1_500 }],
      whiteTargets: [{ id: 'customer-reviews', from: 'portico', start: 700, end: 1_000 }],
    };

    const wiping = sampleJourneySnapshot(staged, 350, 1_000, true, 1, 1_440, 349, 1, null);
    const veiled = sampleJourneySnapshot(staged, 350, 1_000, true, 2, 1_440, 349, 1, 'customer-reviews:white-target');

    expect(wiping.boundaryKey).toBe('customer-reviews:white-target');
    expect(wiping.handoff).toBe(0);
    expect(wiping.mediaOwner).toBe('from');
    expect(veiled.mediaOwner).toBe('veil');
  });

  it('republishes the media owner when the compositor reports a confirmed paint', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    // Document coordinates, reported the way the browser does: relative to the viewport.
    const rect = (top: number, bottom: number) => {
      const offset = fakeWindow.scrollY;
      return { top: top - offset, bottom: bottom - offset, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top - offset, toJSON() {} };
    };
    const chapterNode = (id: string, top: number, bottom: number) => ({
      dataset: { journeyChapter: id },
      getBoundingClientRect: () => rect(top, bottom),
      querySelector: () => null,
    });
    const breath = {
      dataset: { hallFrom: 'portico', hallTo: 'foundation' },
      hasAttribute: () => false,
      previousElementSibling: null,
      getBoundingClientRect: () => rect(1_000, 1_500),
    };
    const journey = {
      getBoundingClientRect: () => rect(0, 6_000),
      querySelectorAll: (selector: string) => {
        if (selector.includes('data-journey-chapter')) {
          return [chapterNode('portico', 0, 1_000), chapterNode('foundation', 1_500, 2_500)];
        }
        if (selector.includes('journey-breath')) return [breath];
        return [];
      },
    };
    const fakeWindow = {
      scrollY: 700,
      innerWidth: 1_440,
      innerHeight: 1_000,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      requestAnimationFrame: (callback: FrameRequestCallback) => { const id = nextFrame++; frames.set(id, callback); return id; },
      cancelAnimationFrame: (id: number) => frames.delete(id),
    };
    const fakeDocument = {
      visibilityState: 'visible',
      fonts: { ready: new Promise<void>(() => undefined) },
      querySelector: () => journey,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('ResizeObserver', undefined);

    const director = createJourneyDirector();
    director.start();
    const measure = [...frames.values()][0];
    frames.clear();
    measure(0);

    expect(director.getSnapshot().boundaryKey).toBe('portico:foundation');
    expect(director.getSnapshot().mediaOwner).toBe('from');

    let notified = 0;
    const unsubscribe = director.subscribe(() => { notified += 1; });

    director.reportVeil('portico:foundation', true);
    expect(director.getSnapshot().mediaOwner).toBe('from');
    [...frames.values()][0]?.(16);
    frames.clear();
    expect(notified).toBe(1);
    expect(director.getSnapshot().mediaOwner).toBe('veil');

    // A repeated confirmation is not a new fact and must not wake the store.
    director.reportVeil('portico:foundation', true);
    expect(frames.size).toBe(0);
    expect(notified).toBe(1);

    // Losing the paint hands the picture straight back to the DOM crossfade.
    director.reportVeil('portico:foundation', false);
    [...frames.values()][0]?.(32);
    frames.clear();
    expect(notified).toBe(2);
    expect(director.getSnapshot().mediaOwner).toBe('from');

    unsubscribe();
    director.stop();
  });

  it('coalesces native scroll updates without rereading layout and tears down every listener', () => {
    const eventHandlers = new Map<string, Set<() => void>>();
    const docHandlers = new Map<string, Set<() => void>>();
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 1;
    let layoutReads = 0;
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top, x: 0, y: top, toJSON() {} });
    const chapter = {
      dataset: { journeyChapter: 'portico' },
      getBoundingClientRect: () => { layoutReads += 1; return rect(0, 1_000); },
      querySelector: () => null,
    };
    const journey = {
      getBoundingClientRect: () => { layoutReads += 1; return rect(0, 6_000); },
      querySelectorAll: (selector: string) => selector.includes('data-journey-chapter') ? [chapter] : [],
    };
    const add = (map: Map<string, Set<() => void>>, type: string, handler: () => void) => {
      const handlers = map.get(type) ?? new Set();
      handlers.add(handler);
      map.set(type, handlers);
    };
    const remove = (map: Map<string, Set<() => void>>, type: string, handler: () => void) => map.get(type)?.delete(handler);
    const fakeWindow = {
      scrollY: 0,
      innerWidth: 1_440,
      innerHeight: 1_000,
      addEventListener: (type: string, handler: () => void) => add(eventHandlers, type, handler),
      removeEventListener: (type: string, handler: () => void) => remove(eventHandlers, type, handler),
      requestAnimationFrame: (callback: FrameRequestCallback) => { const id = nextFrame++; frames.set(id, callback); return id; },
      cancelAnimationFrame: (id: number) => frames.delete(id),
    };
    const fakeDocument = {
      visibilityState: 'visible',
      fonts: { ready: new Promise<void>(() => undefined) },
      querySelector: () => journey,
      addEventListener: (type: string, handler: () => void) => add(docHandlers, type, handler),
      removeEventListener: (type: string, handler: () => void) => remove(docHandlers, type, handler),
    };
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('ResizeObserver', undefined);
    const director = createJourneyDirector();
    director.start();
    expect(frames.size).toBe(1);
    const measure = [...frames.values()][0];
    frames.clear();
    measure(0);
    const initial = director.getSnapshot();
    const readsAfterMeasure = layoutReads;

    fakeWindow.scrollY = 700;
    eventHandlers.get('scroll')?.forEach((handler) => handler());
    eventHandlers.get('scroll')?.forEach((handler) => handler());
    expect(frames.size).toBe(1);
    const update = [...frames.values()][0];
    frames.clear();
    update(16);
    expect(layoutReads).toBe(readsAfterMeasure);
    expect(director.getSnapshot()).not.toBe(initial);

    const unchanged = director.getSnapshot();
    eventHandlers.get('scroll')?.forEach((handler) => handler());
    const unchangedUpdate = [...frames.values()][0];
    frames.clear();
    unchangedUpdate(32);
    expect(director.getSnapshot()).toBe(unchanged);

    director.stop();
    expect([...eventHandlers.values()].every((handlers) => handlers.size === 0)).toBe(true);
    expect([...docHandlers.values()].every((handlers) => handlers.size === 0)).toBe(true);
    expect(frames.size).toBe(0);
  });
});
