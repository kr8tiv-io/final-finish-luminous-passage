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

/**
 * The one admission rule for the sticky featured passage. There is no second
 * rule anywhere in the gallery: phones, short viewports, still motion, reduced
 * motion, and any measured card that cannot actually fit stay on native flow.
 */
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

/** A direct jump (First/Previous/Next/Last) that has not yet been overtaken by scroll. */
export type FeaturedNavigation = { index: number; scrollY: number } | null;

export type FeaturedPresentation = {
  activeIndex: number;
  position: number;
  /**
   * `true` when the card is pinned to a whole-number position, so its panel
   * transform is exactly 0% and the card sits fully inside the frame. Only a
   * free scroll through the passage leaves it `false`.
   */
  settled: boolean;
};

/**
 * One rule decides which card the featured window shows, in both layouts.
 *
 * Precedence, highest first:
 *  1. a pointer/keyboard interaction — snapped, so a card being touched can
 *     never be halfway out of the viewport;
 *  2. a direct navigation, held until the director reports a different scroll
 *     coordinate (in native flow there is no scroll coordinate, so it holds);
 *  3. the scroll-derived passage state;
 *  4. the first card.
 *
 * Holding (2) against the director's own coordinate is what makes First/Last
 * deterministic: the jump lands the card immediately, and the scroll state
 * takes over on the very next published frame with the same answer, because
 * `getFeaturedScrollTarget` targets exactly that card's whole-number position.
 */
export function resolveFeaturedPresentation({
  passageEnabled,
  scrollState,
  scrollY,
  navigation,
  interactionIndex,
  count,
}: {
  passageEnabled: boolean;
  scrollState: { activeIndex: number; position: number };
  scrollY: number;
  navigation: FeaturedNavigation;
  interactionIndex: number | null;
  count: number;
}): FeaturedPresentation {
  const lastIndex = Math.max(0, count - 1);
  const clamp = (index: number) => Math.min(lastIndex, Math.max(0, Math.round(index)));
  if (interactionIndex !== null) {
    const index = clamp(interactionIndex);
    return { activeIndex: index, position: index, settled: true };
  }
  if (navigation && (!passageEnabled || navigation.scrollY === scrollY)) {
    const index = clamp(navigation.index);
    return { activeIndex: index, position: index, settled: true };
  }
  if (!passageEnabled) return { activeIndex: 0, position: 0, settled: true };
  return {
    activeIndex: clamp(scrollState.activeIndex),
    position: scrollState.position,
    settled: scrollState.position === Math.round(scrollState.position),
  };
}
