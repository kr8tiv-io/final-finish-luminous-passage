import { describe, expect, it } from 'vitest';
import { getArcCardState, getImageLoadingState, selectPublishablePairs } from './gallery';

describe('gallery publication and ribbon helpers', () => {
  const pairs = [
    { id: 'approved', publicationApproval: 'approved' as const },
    { id: 'review', publicationApproval: 'pending' as const },
  ];

  it('keeps pending pairings out of production while allowing an explicitly labelled local review', () => {
    expect(selectPublishablePairs(pairs, false).map((pair) => pair.id)).toEqual(['approved']);
    expect(selectPublishablePairs(pairs, true).map((pair) => pair.id)).toEqual(['approved', 'review']);
  });

  it('keeps the nearest ribbon card front-facing and gives adjacent cards restrained depth', () => {
    expect(getArcCardState(1, 1)).toMatchObject({ active: true, rotateY: 0, translateZ: 0, opacity: 1 });
    expect(getArcCardState(0, 1)).toMatchObject({ active: false, rotateY: -7, translateZ: -24 });
    expect(getArcCardState(2, 1)).toMatchObject({ active: false, rotateY: 7, translateZ: -24 });
  });

  it('only asks for full images near the selected pair and retains a thumbnail fallback elsewhere', () => {
    expect(getImageLoadingState(0, 1, 3)).toEqual({ full: true, loading: 'eager' });
    expect(getImageLoadingState(1, 1, 3)).toEqual({ full: true, loading: 'eager' });
    expect(getImageLoadingState(3, 1, 4)).toEqual({ full: false, loading: 'lazy' });
  });
});
