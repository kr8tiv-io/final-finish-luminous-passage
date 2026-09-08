import { describe, expect, it } from 'vitest';
import {
  choosePassageQuality,
  chapterPresence,
  cinematicProgress,
  pourTimeFromProgress,
  DOM_TO_WALK,
  keyframesForWalkChapter,
  oculusStartFrame,
  ROOM_GRADE,
  roomWalkProgress,
  sampleCameraRoute,
  sampleHallTransition,
  sampleWalkChapter,
  toThreeCoordinates,
  WALK_CHAPTERS,
} from './passage';

describe('choosePassageQuality', () => {
  it('keeps the still frame when motion or network preferences ask for restraint', () => {
    expect(choosePassageQuality({ webgl2: true, reducedMotion: true, saveData: false, coarsePointer: false, deviceMemory: 8 })).toBe('still');
    expect(choosePassageQuality({ webgl2: true, reducedMotion: false, saveData: true, coarsePointer: false, deviceMemory: 8 })).toBe('still');
    expect(choosePassageQuality({ webgl2: false, reducedMotion: false, saveData: false, coarsePointer: false, deviceMemory: 8 })).toBe('still');
  });

  it('keeps coarse-pointer devices on the still path', () => {
    expect(choosePassageQuality({ webgl2: true, reducedMotion: false, saveData: false, coarsePointer: true, deviceMemory: 8 })).toBe('still');
    expect(choosePassageQuality({ webgl2: true, reducedMotion: false, saveData: false, coarsePointer: false, deviceMemory: 4 })).toBe('low');
  });

  it('reserves the full passage for capable devices', () => {
    expect(choosePassageQuality({ webgl2: true, reducedMotion: false, saveData: false, coarsePointer: false, deviceMemory: 8 })).toBe('high');
  });
});

describe('sampleCameraRoute', () => {
  const route = [
    { time: 0, position: [0, 1, 2] as const, target: [0, 5, 2] as const },
    { time: 10, position: [2, 5, 4] as const, target: [0, 9, 4] as const },
  ];

  it('clamps and interpolates the authored route by normalized scroll progress', () => {
    expect(sampleCameraRoute(route, -1, 10).position).toEqual([0, 1, 2]);
    expect(sampleCameraRoute(route, 0.5, 10).position).toEqual([1, 3, 3]);
    expect(sampleCameraRoute(route, 2, 10).target).toEqual([0, 9, 4]);
  });

  it('maps Blender Z-up positions into Three.js Y-up space', () => {
    expect(toThreeCoordinates([1, 2, 3])).toEqual([1, 3, -2]);
  });
});

describe('walk chapter order', () => {
  const route = [
    { time: 0, position: [0, 1.2, 1] as const, target: [0, 6, 1] as const, chapter: 'daylit-portico' },
    { time: 4.2, position: [0, 4, 1.65] as const, target: [0, 8.6, 1.69] as const, chapter: 'daylit-portico' },
    { time: 8, position: [0, 8, 1] as const, target: [0, 12, 1] as const, chapter: 'foundation-chamber' },
    { time: 12.5, position: [0, 12, 1] as const, target: [0, 16.7, 1] as const, chapter: 'foundation-chamber' },
    { time: 17, position: [0, 16, 1] as const, target: [0, 20, 1] as const, chapter: 'luminous-finish-hall' },
    { time: 21, position: [0, 20, 1] as const, target: [0, 24, 1] as const, chapter: 'luminous-finish-hall' },
    { time: 25, position: [0, 25, 1] as const, target: [0, 29, 1] as const, chapter: 'proof-arcade' },
    { time: 34, position: [0, 33, 1] as const, target: [0, 37, 1] as const, chapter: 'consultation-court' },
  ];

  it('starts the Three camera on the poster/keyframe pose, not the workshop hall', () => {
    expect(WALK_CHAPTERS[0]).toBe('oculus');
    expect(oculusStartFrame(route).position).toEqual([0, 4.0, 1.65]);
    expect(oculusStartFrame(route).target).toEqual([0, 23.5, 1.75]);
    expect(oculusStartFrame(route).chapter).toBe('oculus-poster');
    expect(keyframesForWalkChapter(route, 'workshop')[0].chapter).toBe('luminous-finish-hall');
  });

  it('keeps grind and same-arch on their own rooms', () => {
    expect(keyframesForWalkChapter(route, 'threshold')[0].chapter).toBe('foundation-chamber');
    expect(keyframesForWalkChapter(route, 'grind')[0].chapter).toBe('consultation-court');
    expect(keyframesForWalkChapter(route, 'same-arch')[0].chapter).toBe('proof-arcade');
  });

  it('holds the poster, then walks the portico forward', () => {
    expect(sampleWalkChapter(route, 'oculus', 0).position).toEqual([0, 4.0, 1.65]);
    expect(sampleWalkChapter(route, 'oculus', 0.08).position).toEqual([0, 4.0, 1.65]);
    expect(sampleWalkChapter(route, 'oculus', 1).position[1]).toBeGreaterThan(4);
    expect(sampleWalkChapter(route, 'oculus', 1).target[1]).toBeLessThan(20);
    expect(sampleWalkChapter(route, 'workshop', 0).position).toEqual([0, 16, 1]);
  });

  it('walks the authored gap between rooms', () => {
    const start = sampleHallTransition(route, 'threshold', 'workshop', 0);
    const end = sampleHallTransition(route, 'threshold', 'workshop', 1);
    expect(end.position[1]).toBeGreaterThanOrEqual(start.position[1]);
  });
});

describe('room pacing', () => {
  it('holds the first beat of a pin, then eases the walk', () => {
    expect(roomWalkProgress(0)).toBe(0);
    expect(roomWalkProgress(0.1)).toBe(0);
    expect(roomWalkProgress(0.6)).toBeGreaterThan(0.2);
    expect(roomWalkProgress(1)).toBe(1);
    expect(chapterPresence(0)).toBe(0);
    expect(chapterPresence(0.3)).toBe(1);
    expect(chapterPresence(0.95)).toBeLessThan(0.2);
    expect(chapterPresence(1)).toBe(0);
  });
});

describe('cinematicProgress', () => {
  it('eases the portico out and the threshold in', () => {
    expect(cinematicProgress(0, 'oculus')).toBe(0);
    expect(cinematicProgress(1, 'oculus')).toBe(1);
    expect(cinematicProgress(0.5, 'oculus')).toBeGreaterThan(0.5);
    expect(cinematicProgress(0.5, 'threshold')).toBeLessThan(0.5);
    expect(cinematicProgress(0.5, 'workshop')).toBe(0.5);
  });
});

describe('pourTimeFromProgress', () => {
  it('maps pinned-hero scroll onto the pour film clock', () => {
    expect(pourTimeFromProgress(0, 10)).toBe(0);
    expect(pourTimeFromProgress(0.5, 10)).toBe(5);
    expect(pourTimeFromProgress(1, 10)).toBe(10);
    expect(pourTimeFromProgress(-1, 10)).toBe(0);
    expect(pourTimeFromProgress(2, 10)).toBe(10);
    expect(pourTimeFromProgress(0.4, Number.NaN)).toBe(0);
    expect(pourTimeFromProgress(0.4, 0)).toBe(0);
  });
});

describe('room grade and walk map', () => {
  it('maps every homepage room onto a walk chapter with a grade', () => {
    expect(Object.keys(DOM_TO_WALK).sort()).toEqual(Object.keys(ROOM_GRADE).sort());
    expect(DOM_TO_WALK.portico).toBe('oculus');
    expect(DOM_TO_WALK.foundation).toBe('threshold');
    expect(DOM_TO_WALK['finish-hall']).toBe('workshop');
    expect(DOM_TO_WALK.proof).toBe('same-arch');
    expect(DOM_TO_WALK.consultation).toBe('grind');
    expect(ROOM_GRADE['finish-hall'].ink).toBe('#17222a');
  });
});
