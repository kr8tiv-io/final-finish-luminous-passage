import type { MotionPreference } from './journey-controls';
import type { JourneyChapterId, JourneySnapshot } from './journey-director';

export interface UvTransform {
  readonly scale: readonly [number, number];
  readonly offset: readonly [number, number];
}

export function coverUvTransform(
  mediaWidth: number,
  mediaHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  objectPosition: readonly [number, number] = [0.5, 0.5],
): UvTransform {
  if (mediaWidth <= 0 || mediaHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { scale: [1, 1], offset: [0, 0] };
  }
  const mediaAspect = mediaWidth / mediaHeight;
  const viewportAspect = viewportWidth / viewportHeight;
  const scale: [number, number] = mediaAspect > viewportAspect
    ? [viewportAspect / mediaAspect, 1]
    : [1, mediaAspect / viewportAspect];
  return {
    scale,
    offset: [
      (1 - scale[0]) * objectPosition[0],
      (1 - scale[1]) * (1 - objectPosition[1]),
    ],
  };
}

export function endpointBlend(progress: number): readonly [number, number] {
  const to = Math.min(1, Math.max(0, progress));
  return [1 - to, to];
}

/**
 * Smoothstep crossfade weight. The director uses it for the DOM plate handoff,
 * so the incoming plate is already half up at the midpoint of a boundary
 * instead of appearing in one frame.
 */
export function dissolveWeight(progress: number, threshold: number, feather = 0.12): number {
  const low = threshold - feather;
  const high = threshold + feather;
  const value = Math.min(1, Math.max(0, (progress - low) / Math.max(Number.EPSILON, high - low)));
  return value * value * (3 - 2 * value);
}

interface PosterLike {
  readonly complete: boolean;
  readonly naturalWidth: number;
  readonly naturalHeight: number;
}

interface VideoLike {
  readonly readyState: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
}

interface PresentedVideoLike extends VideoLike {
  /**
   * `video[data-video-ready]`. `JourneyMotion.tsx` is the only writer of it and of
   * the inline `opacity` that goes with it, so it is the document's own statement
   * of whether this chapter's film — rather than its poster — is the picture on
   * screen. Read it; never re-derive it.
   */
  readonly presented: boolean;
}

export function plateMediaChoice({ image, video }: {
  readonly image: PosterLike | null;
  readonly video: VideoLike | null;
}): 'video' | 'poster' | 'fallback' {
  if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return 'video';
  if (image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) return 'poster';
  return 'fallback';
}

const decoded = (video: VideoLike | null): boolean =>
  Boolean(video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0);

const drawable = (image: PosterLike | null): boolean =>
  Boolean(image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);

/**
 * Which plate the compositor must sample for one room — and the whole of the
 * answer is "whichever one the DOM is showing".
 *
 * REPLACES `transitionPlateChoice(plate, outgoing)`, which decided this a second
 * time, from the veil's own side, using the scroll direction and the incoming
 * film's `currentTime`. Its four behaviours and what happens to each:
 *  1. outgoing room prefers its film  — kept, because a staged film is `presented`.
 *  2. otherwise the poster            — kept, as the second branch.
 *  3. incoming film only below t=0.12 — dropped. `JourneyMotion` holds the incoming
 *     film on frame 0 for the whole interior and marks it `data-video-ready`, so the
 *     clock was a proxy for a fact the document already publishes.
 *  4. refuse a seeking film           — dropped on purpose. A seeking `<video>` keeps
 *     presenting its last decoded frame, so falling back to a poster during a seek
 *     made the veil differ from the plate underneath it, which is the one thing it
 *     may never do.
 *
 * The defect this fixes, measured at p = 0.92 on the built app at 1440x900:
 * `vault:finish-hall` showed its film in the DOM (mean luminance 140.6) while the
 * veil sampled `luminous-finish-hall.avif` (116.1) — a different picture, not a
 * frame-0 extract — because the poster branch was tested before the incoming-film
 * branch. The veil rendered 17.1% darker than the plate it hands the room back to.
 *
 * The last branch is the poster-less room: a film with no usable poster is still a
 * better answer than blank paper, whether or not it is on stage yet.
 */
export function veilPlateChoice({ image, video }: {
  readonly image: PosterLike | null;
  readonly video: PresentedVideoLike | null;
}): 'video' | 'poster' | 'fallback' {
  if (video?.presented && decoded(video)) return 'video';
  if (drawable(image)) return 'poster';
  if (decoded(video)) return 'video';
  return 'fallback';
}

/**
 * Which rung of the pearl pour Act 1 plays.
 *
 * The markup carries the 480/720 ladder as its no-JS answer (`<source media>` is
 * resolved once, at load, and knows nothing about the capability tier). This is
 * the tier-aware half of the same decision, applied by `JourneyMotion` at the
 * moment it promotes the film — before which `preload="none"` has fetched nothing,
 * so naming a rung here never costs a second download.
 *
 *   >= 1440 px on `full`  -> 1080 (5.0 MB; the only rung wide enough for a 1440
 *                            plate to be sampled by the compositor at 1:1)
 *   >= 681 px             -> 720
 *   phones                -> 480
 *
 * The 1080 rung is gated to `full` on purpose: `balanced` is a device that failed
 * the WebGL2/float-buffer admission or is on a coarse pointer, and `still` never
 * decodes a film at all (`journey.css` hides it). Neither should pay 5 MB for a
 * picture the page is about to hand back to a poster.
 *
 * Returns `null` when the markup ladder is already the right answer.
 */
export function pourFilmSource({ viewportWidth, tier }: {
  readonly viewportWidth: number;
  readonly tier: 'full' | 'balanced' | 'still';
}): string | null {
  if (tier !== 'full' || !Number.isFinite(viewportWidth) || viewportWidth < 1440) return null;
  return '/videos/follow-floor/1080/epoxy-pour-pearl.mp4';
}

export function thresholdHdrSupported(capabilities: {
  readonly webgl2: boolean;
  readonly colorBufferFloat: boolean;
}): boolean {
  return capabilities.webgl2 && capabilities.colorBufferFloat;
}

export function shouldRequestVideo(
  previouslyRequested: boolean,
  chapter: string,
  residentChapters: readonly string[],
  documentActive: boolean,
): boolean {
  return documentActive && residentChapters.includes(chapter) && !previouslyRequested;
}

export function journeyMediaResidents(snapshot: Pick<
  JourneySnapshot,
  'activeChapter' | 'fromChapter' | 'toChapter' | 'transitionProgress'
>): readonly JourneyChapterId[] {
  const interior = snapshot.transitionProgress > 0 && snapshot.transitionProgress < 1;
  return [...new Set<JourneyChapterId>(interior
    ? [snapshot.fromChapter, snapshot.toChapter]
    : [snapshot.activeChapter, snapshot.toChapter])];
}

export function shouldInvalidateForMediaReadiness(previous: boolean, next: boolean): boolean {
  return !previous && next;
}

export function videoSeekTarget({ currentTime, desiredTime, seeking, tolerance = 0.12 }: {
  readonly currentTime: number;
  readonly desiredTime: number;
  readonly seeking: boolean;
  readonly tolerance?: number;
}): number | null {
  if (seeking || !Number.isFinite(currentTime) || !Number.isFinite(desiredTime)) return null;
  return Math.abs(currentTime - desiredTime) > tolerance ? desiredTime : null;
}

export function videoVisualReady({ decodedVisualReady, presentationEnabled, visible }: {
  readonly decodedVisualReady: boolean;
  readonly presentationEnabled: boolean;
  readonly visible: boolean;
}): boolean {
  return decodedVisualReady && presentationEnabled && visible;
}

export function veilVisible(
  transitionProgress: number,
  active: boolean,
  whiteStageActive = false,
  platesReady = true,
): boolean {
  return active && platesReady && !whiteStageActive && transitionProgress > 0 && transitionProgress < 1;
}

/** Keep an old framebuffer hidden until the requested boundary has actually painted. */
export function veilCanvasShouldHide(
  renderedBoundary: string | null,
  requestedBoundary: string | null,
  currentlyVisible: boolean,
): boolean {
  return !currentlyVisible || renderedBoundary !== requestedBoundary;
}

export interface VeilPaintConfirmation {
  readonly renderKey: string | null;
  readonly passes: number;
}

export function advanceVeilPaintConfirmation(
  previous: VeilPaintConfirmation,
  renderKey: string,
): { readonly state: VeilPaintConfirmation; readonly confirmed: boolean } {
  const passes = previous.renderKey === renderKey ? Math.min(2, previous.passes + 1) : 1;
  const state = Object.freeze({ renderKey, passes });
  return { state, confirmed: passes >= 2 };
}

/** Demand rendering needs one transparent clear after the last opaque veil frame. */
export function veilFrameRequired(previouslyVisible: boolean, currentlyVisible: boolean): boolean {
  return previouslyVisible || currentlyVisible;
}

/** Use this boolean as the CSS-mode effect dependency, never a scroll revision. */
export function journeyEnhancementReady(state: {
  readonly contextReady: boolean;
  readonly plateReady: boolean;
  readonly directorRevision: number;
  readonly motionEnabled: boolean;
  readonly motionPreference: MotionPreference;
}): boolean {
  return state.contextReady && state.plateReady && state.directorRevision > 0
    && state.motionEnabled && state.motionPreference === 'auto';
}
