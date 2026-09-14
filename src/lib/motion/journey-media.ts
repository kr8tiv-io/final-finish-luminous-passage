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

interface TransitionVideoLike extends VideoLike {
  readonly currentTime: number;
  readonly seeking: boolean;
}

export function plateMediaChoice({ image, video }: {
  readonly image: PosterLike | null;
  readonly video: VideoLike | null;
}): 'video' | 'poster' | 'fallback' {
  if (video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) return 'video';
  if (image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) return 'poster';
  return 'fallback';
}

export function transitionPlateChoice({ image, video }: {
  readonly image: PosterLike | null;
  readonly video: TransitionVideoLike | null;
}, outgoing: boolean): 'video' | 'poster' | 'fallback' {
  const videoReady = Boolean(
    video && video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && !video.seeking,
  );
  if (outgoing && videoReady) return 'video';
  if (image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) return 'poster';
  if (!outgoing && videoReady && video!.currentTime <= 0.12) return 'video';
  return 'fallback';
}

export function shouldUseFilmVeil(capabilities: {
  readonly webgl2: boolean;
  readonly reducedMotion: boolean;
  readonly saveData: boolean;
  readonly deviceMemory: number | null;
}): boolean {
  return capabilities.webgl2 && !capabilities.reducedMotion && !capabilities.saveData;
}

export function thresholdHdrSupported(capabilities: {
  readonly webgl2: boolean;
  readonly colorBufferFloat: boolean;
}): boolean {
  return capabilities.webgl2 && capabilities.colorBufferFloat;
}

export function shouldRequestVideo(previouslyRequested: boolean): boolean {
  return !previouslyRequested;
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

/** The journey begins on its pouring plate; scroll controls time, not plate opacity. */
export function openingPourOpacity(): 1 {
  return 1;
}

/** Use this boolean as the CSS-mode effect dependency, never a scroll revision. */
export function journeyEnhancementReady(state: {
  readonly contextReady: boolean;
  readonly plateReady: boolean;
  readonly directorRevision: number;
  readonly motionEnabled: boolean;
  readonly motionPreference: 'auto' | 'still';
}): boolean {
  return state.contextReady && state.plateReady && state.directorRevision > 0
    && state.motionEnabled && state.motionPreference === 'auto';
}
