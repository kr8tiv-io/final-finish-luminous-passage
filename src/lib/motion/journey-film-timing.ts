import type { JourneyChapterId } from './journey-director';

export const FOUNDATION_STAIR_TIMING = Object.freeze({
  start: 0.14,
  end: 0.84,
});

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smoothstep = (value: number) => value * value * (3 - 2 * value);

/**
 * Maps chapter scroll to the chapter film clock. The foundation passage keeps
 * coherent bookend frames around the authored walk, while all existing films
 * retain their direct scroll-to-time contract.
 *
 * Act 1's pour is one of the direct ones: `currentTime` is a monotonic function of
 * `chapterProgress`, and nothing in this step reshapes it.
 * @motion film-scrub
 */
export const journeyFilmProgress = (chapter: JourneyChapterId, chapterProgress: number) => {
  const progress = Number.isFinite(chapterProgress) ? clamp01(chapterProgress) : 0;
  if (chapter !== 'foundation') return progress;

  const windowProgress = clamp01(
    (progress - FOUNDATION_STAIR_TIMING.start)
      / (FOUNDATION_STAIR_TIMING.end - FOUNDATION_STAIR_TIMING.start),
  );
  return smoothstep(windowProgress);
};

export const journeyFilmTime = (
  chapter: JourneyChapterId,
  chapterProgress: number,
  duration: number,
) => {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return journeyFilmProgress(chapter, chapterProgress) * duration;
};
