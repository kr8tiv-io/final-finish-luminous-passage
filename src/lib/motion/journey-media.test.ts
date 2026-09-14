import { describe, expect, it } from 'vitest';
import {
  coverUvTransform,
  dissolveWeight,
  endpointBlend,
  journeyEnhancementReady,
  openingPourOpacity,
  plateMediaChoice,
  shouldInvalidateForMediaReadiness,
  shouldRequestVideo,
  shouldUseFilmVeil,
  thresholdHdrSupported,
  transitionPlateChoice,
  videoVisualReady,
  videoSeekTarget,
  advanceVeilPaintConfirmation,
  veilCanvasShouldHide,
  veilFrameRequired,
  veilVisible,
} from './journey-media';
import { FILM_VEIL_FRAGMENT_SHADER } from '../../components/motion/FilmVeil';

describe('cinematic plate sampling', () => {
  it('crops wide and tall media like object-fit cover', () => {
    expect(coverUvTransform(1_920, 1_080, 1_000, 1_000)).toEqual({
      scale: [0.5625, 1],
      offset: [0.21875, 0],
    });
    expect(coverUvTransform(1_000, 1_000, 1_920, 1_080)).toEqual({
      scale: [1, 0.5625],
      offset: [0, 0.21875],
    });
    expect(coverUvTransform(1_000, 1_000, 1_920, 1_080, [0.55, 0.58])).toEqual({
      scale: [1, 0.5625],
      offset: [0, 0.18375000000000002],
    });
  });

  it('preserves exact source pixels at zero and destination pixels at one', () => {
    expect(endpointBlend(-1)).toEqual([1, 0]);
    expect(endpointBlend(0)).toEqual([1, 0]);
    expect(endpointBlend(0.25)).toEqual([0.75, 0.25]);
    expect(endpointBlend(1)).toEqual([0, 1]);
    expect(endpointBlend(2)).toEqual([0, 1]);
  });

  it('uses a fixed spatial field with an opaque interior instead of moving grain or luma', () => {
    const weights = [0, 0.25, 0.5, 0.75, 1].map((progress) => dissolveWeight(progress, 0.5));
    expect(weights).toEqual([...weights].sort((a, b) => a - b));
    expect(weights[0]).toBe(0);
    expect(weights.at(-1)).toBe(1);
    expect(FILM_VEIL_FRAGMENT_SHADER).not.toContain('uTime');
    expect(FILM_VEIL_FRAGMENT_SHADER).not.toContain('fbm(');
    expect(FILM_VEIL_FRAGMENT_SHADER).not.toContain('sourceLuma');
    expect(FILM_VEIL_FRAGMENT_SHADER).toContain('vec4(composite, 1.0)');
    expect(FILM_VEIL_FRAGMENT_SHADER).toContain('vec4(fromColor.rgb, 0.0)');
    expect(FILM_VEIL_FRAGMENT_SHADER).toContain('vec4(toColor.rgb, 0.0)');
    expect(FILM_VEIL_FRAGMENT_SHADER).toContain('mix(-0.25, 1.05, eased)');
    expect(FILM_VEIL_FRAGMENT_SHADER).toContain('mix(-0.24, 1.24, eased)');
  });

  it('keeps the poster selected until a video has decoded dimensions and current frame data', () => {
    const image = { complete: true, naturalWidth: 1_920, naturalHeight: 1_080 };
    const video = { readyState: 1, videoWidth: 0, videoHeight: 0 };

    expect(plateMediaChoice({ image, video })).toBe('poster');
    video.readyState = 2;
    video.videoWidth = 1_920;
    video.videoHeight = 1_080;
    expect(plateMediaChoice({ image, video })).toBe('video');
  });

  it('locks the outgoing decoded frame but starts an incoming transition from its poster', () => {
    const image = { complete: true, naturalWidth: 1_920, naturalHeight: 1_080 };
    const video = { readyState: 2, videoWidth: 1_920, videoHeight: 1_080, currentTime: 3, seeking: false };

    expect(transitionPlateChoice({ image, video }, true)).toBe('video');
    expect(transitionPlateChoice({ image, video }, false)).toBe('poster');
    expect(transitionPlateChoice({ image: null, video: { ...video, currentTime: 0.05 } }, false)).toBe('video');
    expect(transitionPlateChoice({ image: null, video }, false)).toBe('fallback');
  });

  it('allows native-phone motion when coarse pointer is the only constraint', () => {
    expect(shouldUseFilmVeil({ webgl2: true, reducedMotion: false, saveData: false, deviceMemory: 8 })).toBe(true);
    expect(shouldUseFilmVeil({ webgl2: true, reducedMotion: true, saveData: false, deviceMemory: 8 })).toBe(false);
    expect(shouldUseFilmVeil({ webgl2: true, reducedMotion: false, saveData: true, deviceMemory: 8 })).toBe(false);
  });

  it('requires float color-buffer renderability only for the HDR threshold layer', () => {
    expect(thresholdHdrSupported({ webgl2: true, colorBufferFloat: true })).toBe(true);
    expect(thresholdHdrSupported({ webgl2: true, colorBufferFloat: false })).toBe(false);
    expect(thresholdHdrSupported({ webgl2: false, colorBufferFloat: true })).toBe(false);
  });

  it('requests each video once and invalidates geometry only on its first ready transition', () => {
    expect(shouldRequestVideo(false)).toBe(true);
    expect(shouldRequestVideo(true)).toBe(false);
    expect(shouldInvalidateForMediaReadiness(false, false)).toBe(false);
    expect(shouldInvalidateForMediaReadiness(false, true)).toBe(true);
    expect(shouldInvalidateForMediaReadiness(true, true)).toBe(false);
  });

  it('renders the veil only for an active interior breath frame', () => {
    expect(veilVisible(0, true)).toBe(false);
    expect(veilVisible(0.5, true)).toBe(true);
    expect(veilVisible(1, true)).toBe(false);
    expect(veilVisible(0.5, false)).toBe(false);
    expect(veilVisible(0.5, true, true, true)).toBe(false);
    expect(veilVisible(0.5, true, false, false)).toBe(false);
  });

  it('requests one clearing frame when an opaque demand-rendered veil becomes hidden', () => {
    expect(veilFrameRequired(true, false)).toBe(true);
    expect(veilFrameRequired(false, true)).toBe(true);
    expect(veilFrameRequired(true, true)).toBe(true);
    expect(veilFrameRequired(false, false)).toBe(false);
  });

  it('hides a previously rendered boundary until the requested boundary has painted', () => {
    expect(veilCanvasShouldHide('foundation:garage', 'portico:foundation', true)).toBe(true);
    expect(veilCanvasShouldHide(null, 'portico:foundation', true)).toBe(true);
    expect(veilCanvasShouldHide('portico:foundation', 'portico:foundation', true)).toBe(false);
    expect(veilCanvasShouldHide('portico:foundation', null, false)).toBe(true);
  });

  it('confirms a replacement framebuffer only after two consecutive paints', () => {
    const first = advanceVeilPaintConfirmation({ renderKey: null, passes: 0 }, 'portico:foundation:white');
    expect(first.confirmed).toBe(false);
    const second = advanceVeilPaintConfirmation(first.state, 'portico:foundation:white');
    expect(second.confirmed).toBe(true);
    const replaced = advanceVeilPaintConfirmation(second.state, 'foundation:garage:media');
    expect(replaced.confirmed).toBe(false);
    expect(advanceVeilPaintConfirmation(replaced.state, 'foundation:garage:media').confirmed).toBe(true);
  });

  it('coalesces video seeks until the previous frame request settles', () => {
    expect(videoSeekTarget({ currentTime: 1, desiredTime: 4, seeking: false })).toBe(4);
    expect(videoSeekTarget({ currentTime: 1, desiredTime: 4, seeking: true })).toBeNull();
    expect(videoSeekTarget({ currentTime: 3.94, desiredTime: 4, seeking: false })).toBeNull();
    expect(videoSeekTarget({ currentTime: 1, desiredTime: Number.NaN, seeking: false })).toBeNull();
  });

  it('keeps the last decoded frame visible while an ordinary seek is pending', () => {
    expect(videoVisualReady({ decodedVisualReady: true, presentationEnabled: true, visible: true })).toBe(true);
    expect(videoVisualReady({ decodedVisualReady: true, presentationEnabled: true, visible: false })).toBe(false);
    expect(videoVisualReady({ decodedVisualReady: false, presentationEnabled: true, visible: true })).toBe(false);
    expect(videoVisualReady({ decodedVisualReady: true, presentationEnabled: false, visible: true })).toBe(false);
  });

  it('keeps the enhancement effect dependency stable across ordinary scroll revisions', () => {
    const ready = { contextReady: true, plateReady: true, directorRevision: 1, motionEnabled: true, motionPreference: 'auto' as const };
    expect(journeyEnhancementReady(ready)).toBe(true);
    expect(journeyEnhancementReady({ ...ready, directorRevision: 27 })).toBe(journeyEnhancementReady(ready));
    expect(journeyEnhancementReady({ ...ready, directorRevision: 0 })).toBe(false);
    expect(journeyEnhancementReady({ ...ready, contextReady: false })).toBe(false);
    expect(journeyEnhancementReady({ ...ready, plateReady: false })).toBe(false);
    expect(journeyEnhancementReady({ ...ready, motionEnabled: false })).toBe(false);
    expect(journeyEnhancementReady({ ...ready, motionPreference: 'still' })).toBe(false);
  });

  it('opens directly on the pouring plate without an image-to-film fade', () => {
    expect(openingPourOpacity()).toBe(1);
  });
});
