import { describe, expect, it } from 'vitest';
import {
  coverUvTransform,
  dissolveWeight,
  endpointBlend,
  journeyEnhancementReady,
  journeyMediaResidents,
  plateMediaChoice,
  pourFilmSource,
  shouldInvalidateForMediaReadiness,
  shouldRequestVideo,
  thresholdHdrSupported,
  veilPlateChoice,
  videoVisualReady,
  videoSeekTarget,
  advanceVeilPaintConfirmation,
  veilCanvasShouldHide,
  veilFrameRequired,
  veilVisible,
} from './journey-media';
import { FILM_VEIL_FRAGMENT_SHADER, RESIN_BLOOM_PIXELS, resinBloomSigma } from '../../components/motion/FilmVeil';

describe('Act 1 film rung', () => {
  it('reaches the 1080 pour only on a wide, full-tier viewport', () => {
    expect(pourFilmSource({ viewportWidth: 1440, tier: 'full' })).toBe('/videos/follow-floor/1080/epoxy-pour-pearl.mp4');
    expect(pourFilmSource({ viewportWidth: 1920, tier: 'full' })).toBe('/videos/follow-floor/1080/epoxy-pour-pearl.mp4');
    // One pixel below the rung, and on every tier that must not pay 5 MB for it.
    expect(pourFilmSource({ viewportWidth: 1439, tier: 'full' })).toBeNull();
    expect(pourFilmSource({ viewportWidth: 1440, tier: 'balanced' })).toBeNull();
    expect(pourFilmSource({ viewportWidth: 1440, tier: 'still' })).toBeNull();
    expect(pourFilmSource({ viewportWidth: Number.NaN, tier: 'full' })).toBeNull();
  });
});

describe('resin-wipe edge light', () => {
  it('keeps the bloom a fixed pixel width whatever the screen height is', () => {
    // The light is exp(-(d/sigma)^2); it is above a tenth of its peak while
    // |d| <= sigma * sqrt(ln 10), so the visible band is 2*sqrt(ln10)*sigma uv tall.
    const band = (height: number) =>
      2 * Math.sqrt(Math.LN10) * resinBloomSigma(RESIN_BLOOM_PIXELS, height) * height;

    expect(RESIN_BLOOM_PIXELS).toBeLessThanOrEqual(12);
    for (const height of [844, 900, 1024, 1440]) expect(band(height)).toBeCloseTo(RESIN_BLOOM_PIXELS, 6);
    // Falsifiable: a sigma that ignored the viewport would NOT hold that band.
    const fixedSigma = resinBloomSigma(RESIN_BLOOM_PIXELS, 900);
    expect(2 * Math.sqrt(Math.LN10) * fixedSigma * 1440).toBeGreaterThan(RESIN_BLOOM_PIXELS);
  });

  it('blooms mode 3 toward the paper it reveals, so the paper cannot be tinted', () => {
    expect(FILM_VEIL_FRAGMENT_SHADER).toMatch(/const vec3 VEIL_PAPER = vec3\(0\.98039216, 0\.97647059, 0\.96470588\);/);
    expect(FILM_VEIL_FRAGMENT_SHADER).toMatch(/bloomColor = VEIL_PAPER;/);
    // Every other mode keeps the shared bloom colour it shipped with.
    expect(FILM_VEIL_FRAGMENT_SHADER).toMatch(/vec3 bloomColor = VEIL_BLOOM;/);
    expect(FILM_VEIL_FRAGMENT_SHADER).toMatch(/composite = mix\(composite, bloomColor,/);
  });

  it('falls back to the analytic resin edge when the plate has not decoded', () => {
    expect(FILM_VEIL_FRAGMENT_SHADER).toMatch(/uniform sampler2D uResinPlate;/);
    expect(FILM_VEIL_FRAGMENT_SHADER).toMatch(/uniform float uResinPlateReady;/);
    // The mix is the fallback: at uResinPlateReady 0 the field is exactly the
    // shipped analytic one, so a failed plate load degrades the shape, not the wipe.
    expect(FILM_VEIL_FRAGMENT_SHADER)
      .toMatch(/float analyticField = vUv\.y \+ staticUndulation\(vec2\(vUv\.y, vUv\.x\)\) \* 2\.35;/);
    expect(FILM_VEIL_FRAGMENT_SHADER)
      .toMatch(/float resinField = mix\(analyticField, platedField, uResinPlateReady\);/);
  });
});

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
    expect(FILM_VEIL_FRAGMENT_SHADER).toContain('float resinFront');
    expect(FILM_VEIL_FRAGMENT_SHADER).toContain('float curlEdge');
    expect(FILM_VEIL_FRAGMENT_SHADER).toContain('texture2D(tFrom, vUv * uFromScale + uFromOffset)');
    expect(FILM_VEIL_FRAGMENT_SHADER).toContain('texture2D(tTo, vUv * uToScale + uToOffset)');
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

  it('samples whichever plate the document is presenting, never a second opinion', () => {
    const image = { complete: true, naturalWidth: 1_920, naturalHeight: 1_080 };
    const decodedFilm = { readyState: 2, videoWidth: 1_280, videoHeight: 720 };

    // The defect this rule replaces: finish-hall's film is on screen
    // (`data-video-ready`) while its poster is a different picture entirely, and the
    // old rule still handed the veil the poster for an incoming room.
    expect(veilPlateChoice({ image, video: { ...decodedFilm, presented: true } })).toBe('video');
    // Not yet promoted: the DOM is showing the poster, so the veil shows the poster.
    expect(veilPlateChoice({ image, video: { ...decodedFilm, presented: false } })).toBe('poster');
    // A room with no usable poster still gets its film rather than blank paper.
    expect(veilPlateChoice({ image: null, video: { ...decodedFilm, presented: false } })).toBe('video');
    // A film with nothing decoded is not a plate at all.
    expect(veilPlateChoice({
      image: null,
      video: { readyState: 1, videoWidth: 0, videoHeight: 0, presented: true },
    })).toBe('fallback');
    // Falsifiable: `presented` has to be the deciding input, or the first two
    // assertions would pass on any rule that simply preferred one plate.
    expect(veilPlateChoice({ image, video: { ...decodedFilm, presented: true } }))
      .not.toBe(veilPlateChoice({ image, video: { ...decodedFilm, presented: false } }));
  });

  it('crossfades the incoming plate around the midpoint instead of switching at it', () => {
    // The DOM handoff the director publishes: symmetric, monotonic, and exactly
    // half up at p = 0.5, so `handoff < 0.5` keeps the old active-room contract.
    expect(dissolveWeight(0.5, 0.5, 0.12)).toBe(0.5);
    expect(dissolveWeight(0.49, 0.5, 0.12)).toBeLessThan(0.5);
    expect(dissolveWeight(0.51, 0.5, 0.12)).toBeGreaterThan(0.5);
    expect(dissolveWeight(0.49, 0.5, 0.12)).toBeGreaterThan(0.35);
    expect(dissolveWeight(0.51, 0.5, 0.12)).toBeLessThan(0.65);
    expect(dissolveWeight(0.37, 0.5, 0.12)).toBe(0);
    expect(dissolveWeight(0.63, 0.5, 0.12)).toBe(1);
  });

  it('admits video requests only for the current and next plates while the document is active', () => {
    expect(shouldRequestVideo(false, 'garage', ['garage', 'vault'], true)).toBe(true);
    expect(shouldRequestVideo(false, 'foundation', ['garage', 'vault'], true)).toBe(false);
    expect(shouldRequestVideo(false, 'garage', ['garage', 'vault'], false)).toBe(false);
    expect(shouldRequestVideo(true, 'garage', ['garage', 'vault'], true)).toBe(false);
  });

  it('keeps only the active/next pair resident and locks the exact transition pair mid-boundary', () => {
    expect(journeyMediaResidents({
      activeChapter: 'garage', fromChapter: 'garage', toChapter: 'vault', transitionProgress: 0,
    })).toEqual(['garage', 'vault']);
    expect(journeyMediaResidents({
      activeChapter: 'vault', fromChapter: 'garage', toChapter: 'vault', transitionProgress: 0.7,
    })).toEqual(['garage', 'vault']);
    expect(journeyMediaResidents({
      activeChapter: 'consultation', fromChapter: 'consultation', toChapter: 'consultation', transitionProgress: 0,
    })).toEqual(['consultation']);
  });

  it('requires float color-buffer renderability only for the HDR threshold layer', () => {
    expect(thresholdHdrSupported({ webgl2: true, colorBufferFloat: true })).toBe(true);
    expect(thresholdHdrSupported({ webgl2: true, colorBufferFloat: false })).toBe(false);
    expect(thresholdHdrSupported({ webgl2: false, colorBufferFloat: true })).toBe(false);
  });

  it('requests each video once and invalidates geometry only on its first ready transition', () => {
    expect(shouldRequestVideo(false, 'garage', ['garage', 'vault'], true)).toBe(true);
    expect(shouldRequestVideo(true, 'garage', ['garage', 'vault'], true)).toBe(false);
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
    expect(journeyEnhancementReady({ ...ready, motionPreference: 'balanced' })).toBe(false);
  });
});
