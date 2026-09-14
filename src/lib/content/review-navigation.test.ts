import { describe, expect, it } from 'vitest';
import { reviewPosition, reviewTarget, ratingIsCurrent } from './review-navigation';

describe('review navigation', () => {
  it('clamps next and previous targets without wrapping away from reading', () => {
    expect(reviewTarget(0, -1, 370, 5100)).toBe(0);
    expect(reviewTarget(0, 1, 370, 5100)).toBe(370);
    expect(reviewTarget(5000, 1, 370, 5100)).toBe(5100);
  });
  it('announces the first visible card and reaches an exact progress endpoint', () => {
    expect(reviewPosition(0, 370, 17, 5100)).toEqual({index:1,progress:0,atStart:true,atEnd:false});
    expect(reviewPosition(5100, 370, 17, 5100)).toEqual({index:14,progress:1,atStart:false,atEnd:true});
    expect(reviewPosition(0, 0, 1, 0)).toEqual({index:1,progress:1,atStart:true,atEnd:true});
  });
  it('never presents an expired or future-dated review count as current', () => {
    expect(ratingIsCurrent('2026-09-09T02:08:00Z',30,Date.parse('2026-09-09T04:00:00Z'))).toBe(true);
    expect(ratingIsCurrent('2026-09-09T02:08:00Z',30,Date.parse('2026-11-01T04:00:00Z'))).toBe(false);
    expect(ratingIsCurrent('invalid',30,Date.now())).toBe(false);
    expect(ratingIsCurrent('2026-12-09T02:08:00Z',30,Date.parse('2026-09-09T04:00:00Z'))).toBe(false);
  });
  it('recognizes fractional card snaps within one CSS pixel', () => {
    expect(reviewPosition(383.49,383.52,17,5400).index).toBe(2);
  });
});
