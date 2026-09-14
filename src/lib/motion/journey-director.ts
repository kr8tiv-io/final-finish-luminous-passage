export const JOURNEY_CHAPTER_IDS = [
  'portico',
  'foundation',
  'garage',
  'vault',
  'finish-hall',
  'commercial',
  'proof',
  'consultation',
] as const;

export const JOURNEY_COMPOSITOR_READY_EVENT = 'journey:compositor-ready';

export function removeJourneyEnhancement(source: {
  querySelector(selector: string): { removeAttribute(name: string): void } | null;
}): void {
  source.querySelector('.journey')?.removeAttribute('data-journey-enhanced');
}

export type JourneyChapterId = (typeof JOURNEY_CHAPTER_IDS)[number];

export interface JourneyChapterMetric {
  readonly id: JourneyChapterId;
  readonly start: number;
  readonly end: number;
}

export interface JourneyTransitionMetric {
  readonly from: JourneyChapterId;
  readonly to: JourneyChapterId;
  readonly start: number;
  readonly end: number;
  readonly fromWhiteStage?: boolean;
}

export interface JourneyWhiteStageMetric {
  readonly start: number;
  readonly end: number;
}

export interface JourneyMetrics {
  readonly top: number;
  readonly bottom: number;
  readonly chapters: readonly JourneyChapterMetric[];
  readonly transitions: readonly JourneyTransitionMetric[];
  readonly whiteStages?: readonly JourneyWhiteStageMetric[];
}

export interface JourneySnapshot {
  readonly revision: number;
  readonly activeChapter: JourneyChapterId;
  readonly activeIndex: number;
  readonly fromChapter: JourneyChapterId;
  readonly fromIndex: number;
  readonly toChapter: JourneyChapterId;
  readonly toIndex: number;
  readonly chapterProgress: number;
  readonly transitionProgress: number;
  readonly journeyProgress: number;
  readonly scrollY: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly visible: boolean;
  readonly documentVisible: boolean;
  readonly whiteStageActive: boolean;
  readonly scrollDirection: -1 | 0 | 1;
  readonly transitionFromWhite: boolean;
}

export interface JourneyDirector {
  readonly start: () => void;
  readonly stop: () => void;
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => JourneySnapshot;
  readonly getServerSnapshot: () => JourneySnapshot;
  readonly invalidateGeometry: () => void;
  readonly scrollToChapter: (id: JourneyChapterId, behavior?: ScrollBehavior) => void;
}

interface JourneyDirectorOptions {
  readonly journeySelector?: string;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const isChapterId = (value: string | undefined): value is JourneyChapterId =>
  Boolean(value && (JOURNEY_CHAPTER_IDS as readonly string[]).includes(value));

const EMPTY_SNAPSHOT: JourneySnapshot = Object.freeze({
  revision: 0,
  activeChapter: 'portico',
  activeIndex: 0,
  fromChapter: 'portico',
  fromIndex: 0,
  toChapter: 'foundation',
  toIndex: 1,
  chapterProgress: 0,
  transitionProgress: 0,
  journeyProgress: 0,
  scrollY: 0,
  viewportWidth: 0,
  viewportHeight: 0,
  visible: false,
  documentVisible: true,
  whiteStageActive: false,
  scrollDirection: 0,
  transitionFromWhite: false,
});

function chapterIndex(id: JourneyChapterId, metrics: JourneyMetrics): number {
  const local = metrics.chapters.findIndex((chapter) => chapter.id === id);
  return local >= 0 ? JOURNEY_CHAPTER_IDS.indexOf(id) : 0;
}

function closestChapter(metrics: JourneyMetrics, viewportCenter: number): JourneyChapterMetric {
  return metrics.chapters.reduce((closest, chapter) => {
    const center = (chapter.start + chapter.end) / 2;
    const closestCenter = (closest.start + closest.end) / 2;
    return Math.abs(center - viewportCenter) < Math.abs(closestCenter - viewportCenter) ? chapter : closest;
  }, metrics.chapters[0]);
}

export function sampleJourneySnapshot(
  metrics: JourneyMetrics,
  scrollY: number,
  viewportHeight: number,
  documentVisible: boolean,
  revision: number,
  viewportWidth = 0,
  previousScrollY = scrollY,
  previousScrollDirection: -1 | 0 | 1 = 0,
): JourneySnapshot {
  const chapters = [...metrics.chapters].sort((a, b) => a.start - b.start);
  if (chapters.length === 0) return Object.freeze({
    ...EMPTY_SNAPSHOT,
    revision,
    documentVisible,
    scrollY,
    viewportWidth,
    viewportHeight,
  });

  const viewportCenter = scrollY + viewportHeight / 2;
  const whiteStageActive = Boolean(metrics.whiteStages?.some(({ start, end }) => viewportCenter >= start && viewportCenter < end));
  const scrollDelta = scrollY - previousScrollY;
  const scrollDirection = scrollDelta === 0
    ? previousScrollDirection
    : Math.sign(scrollDelta) as -1 | 1;
  const visible = scrollY + viewportHeight > metrics.top && scrollY < metrics.bottom;
  const journeyRange = Math.max(1, metrics.bottom - metrics.top - viewportHeight);
  const journeyProgress = clamp01((scrollY - metrics.top) / journeyRange);
  const transition = metrics.transitions.find(({ start, end }) => viewportCenter >= start && viewportCenter <= end);

  let active = chapters.find(({ start, end }) => viewportCenter >= start && viewportCenter < end)
    ?? closestChapter({ ...metrics, chapters }, viewportCenter);
  let from = active;
  let to = chapters[Math.min(chapters.length - 1, chapters.indexOf(active) + 1)] ?? active;
  let transitionProgress = 0;
  let transitionFromWhite = false;

  if (viewportCenter >= chapters.at(-1)!.end) {
    active = chapters.at(-1)!;
    from = active;
    to = active;
  } else if (transition) {
    from = chapters.find((chapter) => chapter.id === transition.from) ?? active;
    to = chapters.find((chapter) => chapter.id === transition.to) ?? from;
    transitionProgress = clamp01((viewportCenter - transition.start) / Math.max(1, transition.end - transition.start));
    transitionFromWhite = Boolean(transition.fromWhiteStage);
    active = transitionProgress < 0.5 ? from : to;
  }

  const activeIndex = chapterIndex(active.id, metrics);
  const progressStart = Math.max(metrics.top, active.start - viewportHeight / 2);
  const progressEnd = active.end - viewportHeight / 2;
  return Object.freeze({
    revision,
    activeChapter: active.id,
    activeIndex,
    fromChapter: from.id,
    fromIndex: chapterIndex(from.id, metrics),
    toChapter: to.id,
    toIndex: chapterIndex(to.id, metrics),
    chapterProgress: clamp01((scrollY - progressStart) / Math.max(1, progressEnd - progressStart)),
    transitionProgress,
    journeyProgress,
    scrollY,
    viewportWidth,
    viewportHeight,
    visible,
    documentVisible,
    whiteStageActive,
    scrollDirection,
    transitionFromWhite,
  });
}

function snapshotChanged(previous: JourneySnapshot, next: JourneySnapshot): boolean {
  return previous.activeChapter !== next.activeChapter
    || previous.fromChapter !== next.fromChapter
    || previous.toChapter !== next.toChapter
    || previous.chapterProgress !== next.chapterProgress
    || previous.transitionProgress !== next.transitionProgress
    || previous.journeyProgress !== next.journeyProgress
    || previous.scrollY !== next.scrollY
    || previous.viewportWidth !== next.viewportWidth
    || previous.viewportHeight !== next.viewportHeight
    || previous.visible !== next.visible
    || previous.documentVisible !== next.documentVisible
    || previous.whiteStageActive !== next.whiteStageActive
    || previous.scrollDirection !== next.scrollDirection
    || previous.transitionFromWhite !== next.transitionFromWhite;
}

export function createJourneyDirector(options: JourneyDirectorOptions = {}): JourneyDirector {
  const journeySelector = options.journeySelector ?? '.journey';
  const listeners = new Set<() => void>();
  let snapshot = EMPTY_SNAPSHOT;
  let metrics: JourneyMetrics | null = null;
  let journey: HTMLElement | null = null;
  let started = false;
  let updateFrame = 0;
  let measureFrame = 0;
  let resizeObserver: ResizeObserver | null = null;

  const publish = () => {
    updateFrame = 0;
    if (!started || !metrics) return;
    const next = sampleJourneySnapshot(
      metrics,
      window.scrollY,
      window.innerHeight,
      document.visibilityState !== 'hidden',
      snapshot.revision + 1,
      window.innerWidth,
      snapshot.scrollY,
      snapshot.scrollDirection,
    );
    if (!snapshotChanged(snapshot, next)) return;
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const scheduleUpdate = () => {
    if (!started || updateFrame || document.visibilityState === 'hidden') return;
    updateFrame = window.requestAnimationFrame(publish);
  };

  const measure = () => {
    measureFrame = 0;
    if (!started || !journey) return;
    if (updateFrame) {
      window.cancelAnimationFrame(updateFrame);
      updateFrame = 0;
    }
    const scrollY = window.scrollY;
    const journeyRect = journey.getBoundingClientRect();
    const chapterNodes = [...journey.querySelectorAll<HTMLElement>('.journey-chapter[data-journey-chapter]')];
    const chapterById = new Map(chapterNodes.map((node) => [node.dataset.journeyChapter, node]));
    const chapters = JOURNEY_CHAPTER_IDS.flatMap((id) => {
      const node = chapterById.get(id);
      if (!node) return [];
      const rect = node.getBoundingClientRect();
      return [{ id, start: rect.top + scrollY, end: rect.bottom + scrollY }];
    });
    const transitions = [...journey.querySelectorAll<HTMLElement>('.journey-breath[data-hall-from][data-hall-to]')]
      .flatMap((node) => {
        const from = node.dataset.hallFrom;
        const to = node.dataset.hallTo;
        if (!isChapterId(from) || !isChapterId(to)) return [];
        const rect = node.getBoundingClientRect();
        const fromWhiteStage = node.hasAttribute('data-hall-from-white')
          || node.previousElementSibling?.hasAttribute('data-journey-white-stage') === true;
        return [{ from, to, start: rect.top + scrollY, end: rect.bottom + scrollY, fromWhiteStage }];
      });
    const whiteStages = [...journey.querySelectorAll<HTMLElement>('[data-journey-white-stage]')].map((node) => {
      const rect = node.getBoundingClientRect();
      return { start: rect.top + scrollY, end: rect.bottom + scrollY };
    });
    metrics = Object.freeze({
      top: journeyRect.top + scrollY,
      bottom: journeyRect.bottom + scrollY,
      chapters: Object.freeze(chapters),
      transitions: Object.freeze(transitions),
      whiteStages: Object.freeze(whiteStages),
    });
    publish();
  };

  const invalidateGeometry = () => {
    if (!started || measureFrame) return;
    measureFrame = window.requestAnimationFrame(measure);
  };

  const onScroll = () => scheduleUpdate();
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') {
      if (updateFrame) window.cancelAnimationFrame(updateFrame);
      updateFrame = 0;
      if (metrics) {
        const next = sampleJourneySnapshot(
          metrics,
          window.scrollY,
          window.innerHeight,
          false,
          snapshot.revision + 1,
          window.innerWidth,
          snapshot.scrollY,
          snapshot.scrollDirection,
        );
        if (snapshotChanged(snapshot, next)) {
          snapshot = next;
          listeners.forEach((listener) => listener());
        }
      }
      return;
    }
    invalidateGeometry();
  };

  const start = () => {
    if (started || typeof window === 'undefined' || typeof document === 'undefined') return;
    journey = document.querySelector<HTMLElement>(journeySelector);
    if (!journey) return;
    started = true;
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', invalidateGeometry, { passive: true });
    window.addEventListener('orientationchange', invalidateGeometry, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('load', invalidateGeometry, true);
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(invalidateGeometry);
      resizeObserver.observe(journey);
      journey.querySelectorAll('.journey-chapter, .journey-breath, [data-journey-white-stage]').forEach((node) => resizeObserver?.observe(node));
    }
    void document.fonts?.ready.then(invalidateGeometry);
    invalidateGeometry();
  };

  const stop = () => {
    if (!started || typeof window === 'undefined' || typeof document === 'undefined') return;
    started = false;
    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', invalidateGeometry);
    window.removeEventListener('orientationchange', invalidateGeometry);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('load', invalidateGeometry, true);
    resizeObserver?.disconnect();
    resizeObserver = null;
    if (updateFrame) window.cancelAnimationFrame(updateFrame);
    if (measureFrame) window.cancelAnimationFrame(measureFrame);
    updateFrame = 0;
    measureFrame = 0;
    metrics = null;
    journey = null;
  };

  return {
    start,
    stop,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
    getServerSnapshot: () => EMPTY_SNAPSHOT,
    invalidateGeometry,
    scrollToChapter: (id, behavior = 'smooth') => {
      if (typeof document === 'undefined') return;
      document.querySelector<HTMLElement>(`${journeySelector} [data-journey-chapter="${id}"]`)?.scrollIntoView({ behavior, block: 'start' });
    },
  };
}

export const journeyDirector = createJourneyDirector();
