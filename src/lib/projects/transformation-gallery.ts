export type DragOwner = 'comparison' | 'gallery' | 'page' | 'undecided';
export type ImageTransform = {
  scale?: number;
  translateX?: number;
  translateY?: number;
  rotate?: number;
};

const DRAG_INTENT_THRESHOLD = 8;
const FEATURE_HOLD = .2;

export function clampReveal(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

export function normalizeImageTransform(transform: ImageTransform = {}): Required<ImageTransform> {
  const rotate = Math.min(1.5, Math.max(-1.5, transform.rotate ?? 0));
  const rotationScale = 1 + Math.abs(rotate) * .025;
  const scale = Math.min(1.12, Math.max(rotationScale, transform.scale ?? 1));
  const translationLimit = Math.min(6, Math.max(0, ((scale - rotationScale) * 50) / scale));
  const round = (value: number) => Math.round(value * 100) / 100;
  return {
    scale: Math.round(scale * 1000) / 1000,
    translateX: round(Math.min(translationLimit, Math.max(-translationLimit, transform.translateX ?? 0))),
    translateY: round(Math.min(translationLimit, Math.max(-translationLimit, transform.translateY ?? 0))),
    rotate: round(rotate),
  };
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

export function getFeaturedPassageState(progress: number, count: number): { activeIndex: number; position: number } {
  if (count <= 1) return { activeIndex: 0, position: 0 };
  const lastIndex = count - 1;
  const scaled = Math.min(1, Math.max(0, progress)) * lastIndex;
  const index = Math.min(lastIndex, Math.floor(scaled));
  if (index === lastIndex) return { activeIndex: lastIndex, position: lastIndex };
  const local = scaled - index;
  let position = index;
  if (local >= 1 - FEATURE_HOLD) {
    position = index + 1;
  } else if (local > FEATURE_HOLD) {
    const travel = (local - FEATURE_HOLD) / (1 - FEATURE_HOLD * 2);
    position = index + travel * travel * (3 - 2 * travel);
  }
  return { activeIndex: Math.min(lastIndex, Math.max(0, Math.round(position))), position };
}

export function getFeaturedScrollTarget({
  passageTop,
  passageTravel,
  index,
  count,
}: {
  passageTop: number;
  passageTravel: number;
  index: number;
  count: number;
}): number {
  if (count <= 1) return passageTop;
  return passageTop + passageTravel * Math.min(1, Math.max(0, index / (count - 1)));
}

export function isFeaturedPassageAdmissible({
  viewportWidth,
  viewportHeight,
  contentHeight,
  still,
  reducedMotion,
}: {
  viewportWidth: number;
  viewportHeight: number;
  contentHeight: number;
  still: boolean;
  reducedMotion: boolean;
}): boolean {
  return !still
    && !reducedMotion
    && viewportWidth >= 960
    && viewportHeight >= 680
    && contentHeight <= viewportHeight - 128;
}

/**
 * The enhancement has one admission rule. Phones, short viewports, still
 * motion, and any measured card that cannot actually fit stay native.
 */
export function isRibbonEnhancementAdmissible({
  viewportWidth,
  viewportHeight,
  cardWidth,
  cardHeight,
  still,
  reducedMotion,
}: {
  viewportWidth: number;
  viewportHeight: number;
  cardWidth: number;
  cardHeight: number;
  still: boolean;
  reducedMotion: boolean;
}): boolean {
  return !still
    && !reducedMotion
    && viewportWidth >= 768
    && viewportHeight >= 620
    && cardWidth <= viewportWidth - 96
    && cardHeight <= viewportHeight - 140;
}
