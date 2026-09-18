import { describe, expect, it } from 'vitest';
import { getArcCardState, getImageLoadingState, resolveGalleryRender, selectPublishablePairs } from './gallery';

describe('gallery publication and ribbon helpers', () => {
  const pairs = [
    { id: 'approved', publicationApproval: 'approved' as const },
    { id: 'review', publicationApproval: 'pending' as const },
    { id: 'refused', publicationApproval: 'rejected' as const },
  ];

  it('keeps pending pairings out of production while allowing an explicitly labelled local review', () => {
    expect(selectPublishablePairs(pairs, { allowPending: false }).map((pair) => pair.id)).toEqual(['approved']);
    expect(selectPublishablePairs(pairs, { allowPending: true }).map((pair) => pair.id)).toEqual(['approved', 'review']);
  });

  it('never publishes a rejected pairing, in any environment', () => {
    const rejectedOnly = [{ id: 'refused', publicationApproval: 'rejected' as const }];
    expect(selectPublishablePairs(rejectedOnly, { allowPending: false })).toEqual([]);
    expect(selectPublishablePairs(rejectedOnly, { allowPending: true })).toEqual([]);
    expect(selectPublishablePairs(pairs, { allowPending: true }).map((pair) => pair.id)).not.toContain('refused');
  });

  it('falls back to selected single photos in production when nothing is approved, never to an empty section', () => {
    const staged = [
      { id: 'a', publicationApproval: 'pending' as const },
      { id: 'b', publicationApproval: 'pending' as const },
      { id: 'c', publicationApproval: 'pending' as const },
    ];
    expect(resolveGalleryRender(staged, { allowPending: false })).toEqual({ mode: 'selected-photos', pairs: [], reviewBadge: false });
    expect(resolveGalleryRender(staged, { allowPending: true })).toEqual({ mode: 'comparisons', pairs: staged, reviewBadge: true });
    expect(resolveGalleryRender([{ id: 'refused', publicationApproval: 'rejected' as const }], { allowPending: true }).mode).toBe('selected-photos');
    expect(resolveGalleryRender([], { allowPending: true }).mode).toBe('selected-photos');
  });

  it('drops the review badge once every published pairing is approved', () => {
    const live = [{ id: 'a', publicationApproval: 'approved' as const }];
    expect(resolveGalleryRender(live, { allowPending: true })).toEqual({ mode: 'comparisons', pairs: live, reviewBadge: false });
    expect(resolveGalleryRender(live, { allowPending: false })).toEqual({ mode: 'comparisons', pairs: live, reviewBadge: false });
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
