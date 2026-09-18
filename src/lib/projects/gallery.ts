/**
 * Publication approval is a three-state decision, not a boolean.
 *
 * - `approved`  — Denis has signed the pairing off; publishable everywhere.
 * - `pending`   — awaiting his answer; visible on staging behind a badge only.
 * - `rejected`  — he said no. Never rendered, in any environment, ever.
 */
export type PublicationApproval = 'approved' | 'pending' | 'rejected';

type PublishablePair = {
  publicationApproval: PublicationApproval;
};

export type PublicationContext = {
  /** Staging/dev review builds pass `true`; production passes `false`. */
  allowPending: boolean;
};

export function selectPublishablePairs<T extends PublishablePair>(
  pairs: readonly T[],
  { allowPending }: PublicationContext,
): readonly T[] {
  return pairs.filter((pair) => pair.publicationApproval === 'approved'
    || (allowPending && pair.publicationApproval === 'pending'));
}

/**
 * What the proof section renders. `comparisons` is the real before/after
 * gallery; `selected-photos` is the production fallback — a captioned grid of
 * single archive photographs. There is deliberately no empty state: an
 * unapproved archive is a reason to show fewer claims, not a blank section.
 */
export type GalleryRenderMode = 'comparisons' | 'selected-photos';

export type GalleryRenderDecision<T> = {
  mode: GalleryRenderMode;
  pairs: readonly T[];
  /** The staging-only "not approved for publication" badge. */
  reviewBadge: boolean;
};

export function resolveGalleryRender<T extends PublishablePair>(
  pairs: readonly T[],
  context: PublicationContext,
): GalleryRenderDecision<T> {
  const published = selectPublishablePairs(pairs, context);
  if (published.length === 0) return { mode: 'selected-photos', pairs: [], reviewBadge: false };
  return {
    mode: 'comparisons',
    pairs: published,
    reviewBadge: context.allowPending && published.some((pair) => pair.publicationApproval === 'pending'),
  };
}

export type ArcCardState = {
  active: boolean;
  rotateY: number;
  translateZ: number;
  opacity: number;
};

export function getArcCardState(index: number, activeIndex: number): ArcCardState {
  const distance = index - activeIndex;
  if (distance === 0) return { active: true, rotateY: 0, translateZ: 0, opacity: 1 };
  const direction = Math.sign(distance);
  return {
    active: false,
    rotateY: direction * 7,
    translateZ: -Math.min(48, Math.abs(distance) * 24),
    opacity: Math.max(.56, 1 - Math.abs(distance) * .16),
  };
}

export function getImageLoadingState(index: number, activeIndex: number, count: number): { full: boolean; loading: 'eager' | 'lazy' } {
  const full = Math.abs(index - activeIndex) <= 1 || count <= 2;
  return { full, loading: full ? 'eager' : 'lazy' };
}
