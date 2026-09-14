export type PublicationApproval = 'approved' | 'pending';

type PublishablePair = {
  publicationApproval: PublicationApproval;
};

export function selectPublishablePairs<T extends PublishablePair>(pairs: readonly T[], allowPending: boolean): readonly T[] {
  return allowPending ? pairs : pairs.filter((pair) => pair.publicationApproval === 'approved');
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
