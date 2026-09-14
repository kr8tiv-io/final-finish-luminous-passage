export type DragOwner = 'comparison' | 'gallery' | 'page' | 'undecided';

const DRAG_INTENT_THRESHOLD = 8;

export function clampReveal(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function resolveDragOwner({
  startsInComparison,
  deltaX,
  deltaY,
}: {
  startsInComparison: boolean;
  deltaX: number;
  deltaY: number;
}): DragOwner {
  if (!startsInComparison) return 'gallery';
  if (Math.hypot(deltaX, deltaY) < DRAG_INTENT_THRESHOLD) return 'undecided';
  return Math.abs(deltaX) > Math.abs(deltaY) ? 'comparison' : 'page';
}

export function getGalleryScrollTarget({
  cardLeft,
  viewportLeft,
  scrollLeft,
  scrollPaddingStart,
  maximumScrollLeft,
}: {
  cardLeft: number;
  viewportLeft: number;
  scrollLeft: number;
  scrollPaddingStart: number;
  maximumScrollLeft: number;
}): number {
  const target = scrollLeft + cardLeft - viewportLeft - scrollPaddingStart;
  return Math.min(maximumScrollLeft, Math.max(0, target));
}

export function isScrollDrivenGalleryAdmissible({
  viewportWidth,
  viewportHeight,
  horizontalTravel,
  shellHeight,
  still,
  reducedMotion,
}: {
  viewportWidth: number;
  viewportHeight: number;
  horizontalTravel: number;
  shellHeight?: number;
  still: boolean;
  reducedMotion: boolean;
}): boolean {
  return !still && !reducedMotion && viewportWidth >= 768 && viewportHeight >= 620 && horizontalTravel > 1
    && (shellHeight === undefined || shellHeight <= viewportHeight - 80);
}

export function getGalleryProgressForIndex(index: number, count: number): number {
  if (count <= 1) return 0;
  return Math.min(1, Math.max(0, index / (count - 1)));
}

export function getVerticalScrollPosition({ start, end, progress }: { start: number; end: number; progress: number }): number {
  return start + (end - start) * Math.min(1, Math.max(0, progress));
}

export function getGalleryProgressForTarget(target: number, maximumTravel: number): number {
  if (maximumTravel <= 0) return 0;
  return Math.min(1, Math.max(0, target / maximumTravel));
}

export function getNearestGalleryIndex(progress: number, targetProgresses: readonly number[]): number {
  if (targetProgresses.length === 0) return 0;
  return targetProgresses.reduce((closest, target, index) => (
    Math.abs(target - progress) < Math.abs(targetProgresses[closest] - progress) ? index : closest
  ), 0);
}
