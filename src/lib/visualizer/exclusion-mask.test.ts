import { describe, expect, it } from 'vitest';
import {
  appendExclusionPoint,
  beginExclusionStroke,
  clearExclusionMask,
  createExclusionMask,
  undoExclusionStroke,
} from './exclusion-mask';

describe('local exclusion mask draft', () => {
  it('keeps erase and restore strokes owned by one photo revision', () => {
    const initial = createExclusionMask('photo-1');
    const erased = beginExclusionStroke(initial, 'photo-1', 'erase', { x: 0.4, y: 0.6 }, 0.025);
    const extended = appendExclusionPoint(erased, 'photo-1', { x: 0.44, y: 0.63 });
    const restored = beginExclusionStroke(extended, 'photo-1', 'restore', { x: 0.42, y: 0.61 }, 0.012);
    expect(restored.strokes.map((stroke) => stroke.mode)).toEqual(['erase', 'restore']);
    expect(restored.strokes[0].points).toHaveLength(2);
    expect(appendExclusionPoint(restored, 'photo-2', { x: 0.8, y: 0.8 })).toBe(restored);
  });

  it('starts clean when a new photo revision owns the next stroke', () => {
    const prior = beginExclusionStroke(createExclusionMask('photo-1'), 'photo-1', 'erase', { x: 0.2, y: 0.2 }, 0.02);
    const next = beginExclusionStroke(prior, 'photo-2', 'erase', { x: 0.7, y: 0.7 }, 0.02);
    expect(next.photoRevision).toBe('photo-2');
    expect(next.strokes).toHaveLength(1);
  });

  it('supports local undo and clear without changing revision ownership', () => {
    const initial = createExclusionMask('photo-3');
    const first = beginExclusionStroke(initial, 'photo-3', 'erase', { x: 0.2, y: 0.2 }, 0.02);
    const second = beginExclusionStroke(first, 'photo-3', 'restore', { x: 0.3, y: 0.3 }, 0.02);
    expect(undoExclusionStroke(second).strokes).toHaveLength(1);
    expect(clearExclusionMask(second)).toEqual({ photoRevision: 'photo-3', strokes: [] });
  });
});
