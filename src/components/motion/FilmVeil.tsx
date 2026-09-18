import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { journeyControls } from '../../lib/motion/journey-controls';
import {
  JOURNEY_CHAPTER_IDS,
  JOURNEY_COMPOSITOR_READY_EVENT,
  journeyDirector,
  removeJourneyEnhancement,
  type JourneyChapterId,
} from '../../lib/motion/journey-director';
import {
  coverUvTransform,
  endpointBlend,
  journeyEnhancementReady,
  journeyMediaResidents,
  advanceVeilPaintConfirmation,
  veilCanvasShouldHide,
  veilFrameRequired,
  veilPlateChoice,
  veilVisible,
} from '../../lib/motion/journey-media';
import {
  resolveJourneyTransitionFrame,
  transitionLockAction,
} from '../../lib/motion/journey-transitions';
import { surfaceStore, type SurfaceViewRenderContext } from '../../lib/motion/surface-store';

/**
 * The boundary compositor — a view of the one layout-level canvas (Step 18a).
 *
 * WHAT MOVED, AND WHAT DID NOT. This file used to own a second `<canvas>` with its
 * own WebGL context, mounted as an R3F `<Canvas frameloop="demand">`. The context is
 * gone; everything the compositor actually is stayed:
 *
 *  - the five shader modes 0-4 and their uniforms, byte for byte;
 *  - `transitionLockAction`, so a boundary's plates are chosen once on entry;
 *  - `advanceVeilPaintConfirmation` — two completed passes for a render key before
 *    the director is told the veil owns the picture, still with no framebuffer read;
 *  - the "paint only inside 0 < p < 1" rule (`veilVisible`);
 *  - demand rendering: `surfaceStore.invalidate()` in place of R3F's `invalidate`.
 *
 * Two things are deliberately different, and both are consequences of sharing a
 * canvas with the floor and the menu:
 *
 *  1. NOTHING HERE WRITES `canvas.style.opacity`. It used to, to hide an unconfirmed
 *     frame. On a shared element that would hide the floor and the menu too. A view
 *     that wants to disappear writes transparent pixels instead: `uVisible` 0 makes
 *     the shader emit `vec4(0)` and the plates below show through untouched, which is
 *     what the old opacity flip was standing in for. `renderedBoundary` /
 *     `renderedProgress` / `renderedRevision` move with it, onto `.film-veil` — the
 *     element this compositor does own.
 *  2. `ThresholdTravel` is no longer mounted from here. It was an R3F component and
 *     there is no R3F context left to mount it into. It was reachable only at
 *     `import.meta.env.DEV` with `?study=threshold` (index.astro:26), never on a
 *     built page, and Step 20 decides whether that study survives at all. The
 *     component is untouched on disk.
 */

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const FILM_VEIL_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D tFrom;
uniform sampler2D tTo;
uniform float uProgress;
uniform float uVisible;
uniform float uMode;
uniform float uDirection;
uniform float uAspect;
uniform vec2 uEndpointBlend;
uniform vec2 uFromScale;
uniform vec2 uFromOffset;
uniform vec2 uToScale;
uniform vec2 uToOffset;
// The poured-resin alpha plate (Act 1's resin-wipe, mode 3 only). uResinPlateReady
// is 0 until the texture has decoded, and mode 3 then falls back to exactly the
// analytic edge it shipped with, so a slow or failed plate load is never a
// different transition, only a less shaped one.
uniform sampler2D uResinPlate;
uniform float uResinPlateReady;
uniform vec2 uResinPlateScale;
uniform vec2 uResinPlateOffset;
/** Gaussian sigma for mode 3's edge light, in uv, sized so the bloom is <= 12 CSS px. */
uniform float uResinBloom;
/* Mode 5 only. Named for the fold they shape: how much sheet is within reach of
   the crease, how much extra source that band swallows, and how far the incoming
   room parallaxes in. Read only inside the mode 5 branch. */
uniform float uFoldBand;
uniform float uFoldReach;
uniform float uFoldParallax;
varying vec2 vUv;

const vec3 VEIL_BLOOM = vec3(0.973, 0.969, 0.952);
/** Storyboard paper #FAF9F6. Blooming toward it cannot tint the paper it reveals. */
const vec3 VEIL_PAPER = vec3(0.98039216, 0.97647059, 0.96470588);

float easeInOut(float value) {
  float t = clamp(value, 0.0, 1.0);
  return t * t * (3.0 - 2.0 * t);
}

float staticUndulation(vec2 uv) {
  float broad = sin(uv.y * 6.2831853 + sin(uv.x * 3.1415927) * 0.7);
  float fine = sin(uv.y * 12.5663706 - uv.x * 4.7123890);
  return broad * 0.018 + fine * 0.007;
}

void main() {
  vec4 fromColor = texture2D(tFrom, vUv * uFromScale + uFromOffset);
  vec4 toColor = texture2D(tTo, vUv * uToScale + uToOffset);
  vec4 outputColor;
  if (uVisible <= 0.0) {
    outputColor = vec4(0.0);
  } else if (uEndpointBlend.y <= 0.0) {
    outputColor = vec4(fromColor.rgb, 0.0);
  } else if (uEndpointBlend.x <= 0.0) {
    outputColor = vec4(toColor.rgb, 0.0);
  } else {
    float progress = clamp(uProgress, 0.0, 1.0);
    float eased = easeInOut(progress);
    float organic = staticUndulation(vUv);
    float toWeight;
    float light = 0.0;
    vec3 bloomColor = VEIL_BLOOM;
    // Mode 5 is the only mode that darkens rather than only lifting toward paper:
    // a fold has a lit side and a side turned away from the light. Every other
    // mode leaves this at 0, so their composite is byte-identical to before.
    float shade = 0.0;

    if (uMode < 0.5) {
      toWeight = smoothstep(0.22, 0.78, progress + organic);
      // Mode 0 is the only bloom that lifts the WHOLE frame rather than travelling
      // with a front, so its envelope has to be the one that closes at the ends.
      // The exponent was 1.45, which still lifted every pixel by 8.3% at p = 0.92 and
      // then dropped it in one frame when the veil retired — an 8% step at the exact
      // moment the picture goes back to the DOM plate. Cubed, the peak at p = 0.5 is
      // unchanged at 0.62 and the lift at p = 0.92 is 0.95%.
      light = pow(sin(progress * 3.14159265), 3.0) * 0.62;
    } else if (uMode < 1.5) {
      vec2 centred = abs(vUv - 0.5) * vec2(min(uAspect, 1.65), 1.0);
      float apertureDistance = max(centred.x * 0.82, centred.y) + organic;
      float aperture = mix(-0.25, 1.05, eased);
      toWeight = 1.0 - smoothstep(aperture - 0.16, aperture + 0.16, apertureDistance);
      light = exp(-pow((apertureDistance - aperture) / 0.17, 2.0)) * sin(progress * 3.14159265) * 0.16;
    } else if (uMode < 2.5) {
      float axis = uDirection > 0.0 ? vUv.x : 1.0 - vUv.x;
      float fold = mix(-0.24, 1.24, eased);
      float foldedAxis = axis + organic;
      toWeight = 1.0 - smoothstep(fold - 0.15, fold + 0.15, foldedAxis);
      light = exp(-pow((foldedAxis - fold) / 0.16, 2.0)) * sin(progress * 3.14159265) * 0.13;
    } else if (uMode < 3.5) {
      float resinFront = mix(-0.18, 1.18, eased);
      float analyticField = vUv.y + staticUndulation(vec2(vUv.y, vUv.x)) * 2.35;
      // The front's shape is the plate's own matte: alpha 1 (inside the poured
      // resin) pulls the boundary forward by up to 0.11 uv, alpha 0 holds it back,
      // so the paper arrives behind an uneven poured-resin front rather than a sine.
      // The analytic undulation stays on at a third of its weight as fine detail.
      float plateAlpha = texture2D(uResinPlate, vUv * uResinPlateScale + uResinPlateOffset).a;
      float platedField = vUv.y + (0.5 - plateAlpha) * 0.22 + staticUndulation(vec2(vUv.y, vUv.x)) * 0.9;
      float resinField = mix(analyticField, platedField, uResinPlateReady);
      toWeight = 1.0 - smoothstep(resinFront - 0.14, resinFront + 0.14, resinField);
      // A lit meniscus rather than a glow. Sigma arrives as a fraction of the
      // viewport so the lit band is <= 12 CSS px on any screen, and the bloom
      // colour is the paper itself, so the revealed paper cannot be tinted by it.
      light = exp(-pow((resinField - resinFront) / uResinBloom, 2.0)) * sin(progress * 3.14159265) * 0.34;
      bloomColor = VEIL_PAPER;
    } else if (uMode < 4.5) {
      float curlAxis = uDirection > 0.0 ? vUv.x : 1.0 - vUv.x;
      float curlEdge = mix(-0.2, 1.2, eased);
      float curledField = curlAxis + sin(vUv.y * 3.14159265) * 0.075 + organic * 1.8;
      toWeight = 1.0 - smoothstep(curlEdge - 0.11, curlEdge + 0.11, curledField);
      light = exp(-pow((curledField - curlEdge) / 0.105, 2.0)) * sin(progress * 3.14159265) * 0.18;
    } else {
      // Mode 5 - fold-and-shoot-left (Act 4's two interior room changes).
      //
      // The outgoing room is a sheet of paper being folded under itself along a
      // vertical crease that travels right to left; the incoming room slides in
      // from the right behind it. Three rules shape the numbers:
      //
      //  1. EXACT ENDPOINTS. uFoldBand and uFoldReach scale with bend, which is
      //     sin(pi*p) and therefore 0 at both ends, so the sheet's UV map is the
      //     identity at p = 0. creaseTravel runs from past 1 to past 0 by the
      //     feather (the same trick modes 1-4 use) so nothing of the incoming room
      //     bleeds in at p = 0 and nothing of the outgoing survives at p = 1.
      //     The crease travels on raw progress, not on eased: MOTION-VOCABULARY
      //     gives this id ease "none", and a smoothstep would run the crease 50%
      //     faster through the middle of the fold than through its ends, which is
      //     both a wobble to the eye and the whole of an earlier 2.73% seam.
      //  2. THE FOLD CONSUMES THE ROOM, IT DOES NOT DRAG IT. Only the band of
      //     sheet within reach of the crease is warped; everything further left is
      //     flat, still pixels. A transition that translated the whole frame would
      //     move every pixel on every scroll step, which is a cut by any pixel
      //     measurement even though the eye reads it as a pan.
      //  3. NOTHING THAT MOVES MAY CARRY HIGH CONTRAST. The crease highlight is a
      //     wide, weak gaussian and the sheet shadow is a smooth ramp, so the
      //     per-frame delta of the moving features stays well under the seam
      //     spec's per-channel step while the stationary picture carries the frame.
      float axis = uDirection > 0.0 ? vUv.x : 1.0 - vUv.x;
      float bend = sin(progress * 3.14159265);
      float feather = 0.015 + 0.09 * bend;
      float creaseTravel = mix(1.0 + feather + 0.04, -feather - 0.04, progress);
      float crease = creaseTravel + sin(vUv.y * 3.14159265) * 0.018 * bend + organic * 0.9;
      float band = uFoldBand * bend;
      float reach = uFoldReach * bend;
      float bandStart = crease - band;
      // Named creaseDepth, not fold: mode 2's sibling block already uses "fold"
      // for a different quantity (an edge POSITION, not a depth into the sheet),
      // and one name meaning two things across the mode chain is how a reader ends
      // up debugging the wrong branch. The two are separately scoped and the driver
      // handles that correctly - this is a naming choice, not a workaround.
      float creaseDepth = clamp((axis - bandStart) / max(band, 0.0004), 0.0, 1.0);
      // Squared: the sheet foreshortens as it turns away, so the far end of the
      // band swallows source faster than the near end - a rotating plane.
      float folded = bandStart + (band + reach) * creaseDepth * creaseDepth;
      float fromAxis = clamp(mix(axis, folded, step(bandStart, axis)), 0.0, 1.0);
      // The incoming room is rigid and parallaxes in from the right, reaching the
      // identity exactly at p = 1 where the DOM parks it at the same offset.
      float toAxis = clamp(axis - (1.0 - progress) * uFoldParallax, 0.0, 1.0);
      float fromX = uDirection > 0.0 ? fromAxis : 1.0 - fromAxis;
      float toX = uDirection > 0.0 ? toAxis : 1.0 - toAxis;
      fromColor = texture2D(tFrom, vec2(fromX, vUv.y) * uFromScale + uFromOffset);
      toColor = texture2D(tTo, vec2(toX, vUv.y) * uToScale + uToOffset);
      toWeight = smoothstep(crease - feather, crease + feather, axis);
      // Two half planes: the one rotating away from the light falls into shadow,
      // and the folded sheet throws a soft contact shadow onto the room behind it.
      // The sheet's far half turns away from the light; the crease catches it. The
      // contact shadow the sheet throws onto the room behind is kept deliberately
      // light: Act 4 ends on the mancave, which is already a dark room, and a
      // heavier one turned the incoming half of that fold into mud.
      shade = bend * 0.44 * creaseDepth * (1.0 - toWeight)
        + bend * 0.18 * (1.0 - smoothstep(crease, crease + 0.13, axis)) * toWeight;
      light = exp(-pow((axis - crease) / 0.085, 2.0)) * bend * 0.3;
    }

    vec3 composite = mix(fromColor.rgb, toColor.rgb, clamp(toWeight, 0.0, 1.0));
    composite = mix(composite, bloomColor, clamp(light, 0.0, 0.72));
    composite *= 1.0 - clamp(shade, 0.0, 0.62);
    outputColor = vec4(composite, 1.0);
  }
  gl_FragColor = outputColor;
}
`;

/**
 * Mode 5's three shape constants, measured against the seam spec on the built app
 * rather than chosen by eye — see the mode-5 comment in the shader for the rule
 * each one serves. They are uniforms rather than literals so the fold can be
 * retuned from one place without editing GLSL.
 *
 * @motion fold-and-shoot-left
 */
export const FOLD_BAND = 0.115;
export const FOLD_REACH = 0.125;
export const FOLD_PARALLAX = 0.18;

type PlateDom = {
  readonly id: JourneyChapterId;
  readonly video: HTMLVideoElement | null;
  readonly image: HTMLImageElement | null;
  objectPosition: readonly [number, number];
};

type PlateBinding = PlateDom & {
  posterTexture: THREE.Texture | null;
  videoTexture: THREE.VideoTexture | null;
  posterReady: boolean;
  resident: boolean;
  readonly cleanups: Array<() => void>;
};

/**
 * What a boundary locks: which rooms take part, and which way the visitor entered.
 *
 * It does NOT lock a texture. The plate each room shows is re-read every frame from
 * the room's own `data-video-ready`, so the veil can never be sampling a poster while
 * the document has already promoted that room's film — the 17.1% mismatch measured at
 * `vault:finish-hall`. See `veilPlateChoice` in journey-media.ts.
 */
type LockedTransition = {
  readonly key: string;
  readonly from: { readonly binding: PlateBinding | null; readonly white: boolean };
  readonly to: { readonly binding: PlateBinding | null };
};

function parseObjectPosition(element: Element | null): readonly [number, number] {
  if (!element) return [0.55, 0.58];
  const values = getComputedStyle(element).objectPosition.split(/\s+/).map((value) => Number.parseFloat(value) / 100);
  return [Number.isFinite(values[0]) ? values[0] : 0.55, Number.isFinite(values[1]) ? values[1] : 0.58];
}

function readPlates(): PlateDom[] {
  return JOURNEY_CHAPTER_IDS.map((id) => {
    const chapter = document.querySelector<HTMLElement>(`.journey [data-journey-chapter="${id}"]`);
    const video = chapter?.querySelector<HTMLVideoElement>('.pour-film, .floor-film-video') ?? null;
    const image = chapter?.querySelector<HTMLImageElement>(
      '.floor-film-poster, .pour-poster, [data-chapter-frame] > img',
    ) ?? null;
    return { id, video, image, objectPosition: parseObjectPosition(video ?? image) };
  });
}

function textureDimensions(binding: PlateBinding | null, texture: THREE.Texture): readonly [number, number] {
  if (!binding) return [1, 1];
  if (texture === binding.videoTexture && binding.video) return [binding.video.videoWidth, binding.video.videoHeight];
  if (texture === binding.posterTexture) {
    const image = binding.posterTexture.image as { width?: number; height?: number } | undefined;
    return [image?.width ?? 1, image?.height ?? 1];
  }
  return [1, 1];
}

function viewportSize(): { readonly width: number; readonly height: number } {
  if (typeof window === 'undefined') return { width: 1, height: 1 };
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * The poured-resin front, extracted from the pour's own frame 235
 * (`ASSET-LEDGER.md`, wave 3). 2048 on a desktop, 1024 on a phone — the
 * storyboard's §6 rule for this plate, and the only rung difference.
 */
const RESIN_PLATE_SIZE = Object.freeze({ wide: 2048, phone: 1024 });
const RESIN_PLATE_ASPECT = Object.freeze({ width: 2048, height: 1152 });
const resinPlateUrl = (): string => {
  const phone = typeof window !== 'undefined' && window.matchMedia('(max-width: 680px)').matches;
  return `/images/brand/plates/resin-front-${phone ? RESIN_PLATE_SIZE.phone : RESIN_PLATE_SIZE.wide}.webp`;
};

/**
 * Sigma, in uv, for mode 3's edge light, so the lit band measures `pixels` CSS px.
 *
 * The light is `exp(-(d/sigma)^2)`; it is above a tenth of its peak while
 * `|d| <= sigma * sqrt(ln 10)`, so the visible band is `2 * sqrt(ln 10) * sigma`
 * tall. Inverting that for a 12 px band is the whole of this function, and it is
 * why the bloom does not grow with the screen.
 */
export const resinBloomSigma = (pixels: number, viewportHeight: number): number =>
  pixels / (2 * Math.sqrt(Math.LN10) * Math.max(1, viewportHeight));

export const RESIN_BLOOM_PIXELS = 12;

export default function FilmVeil({ host, motionEnabled }: {
  readonly host: HTMLElement;
  readonly motionEnabled: boolean;
}) {
  const controls = useSyncExternalStore(
    journeyControls.subscribe,
    journeyControls.getSnapshot,
    journeyControls.getServerSnapshot,
  );
  const snapshot = useSyncExternalStore(
    journeyDirector.subscribe,
    journeyDirector.getSnapshot,
    journeyDirector.getServerSnapshot,
  );
  const surface = useSyncExternalStore(
    surfaceStore.subscribe,
    surfaceStore.getSnapshot,
    surfaceStore.getServerSnapshot,
  );
  const [journeyVisible, setJourneyVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [plateReady, setPlateReady] = useState(false);
  const [size, setSize] = useState(viewportSize);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [transitionReady, setTransitionReady] = useState(false);

  const active = journeyVisible && documentVisible && motionEnabled && controls.motionPreference === 'auto';
  // The renderer is the shared one. Until it reports `webgl` there is no context to
  // draw into, and the DOM plate crossfade is the whole transition — exactly as on a
  // `balanced` device that never downloads this chunk.
  const rendererLive = surface.renderer === 'webgl';
  const invalidate = useCallback(() => surfaceStore.invalidate(), []);

  /**
   * Every plate the veil samples is tagged `NoColorSpace`, and the shader writes
   * its result out untouched (no `colorspace_fragment`).
   *
   * The reason is the handoff this step exists to make seamless. Tagging a
   * texture `SRGBColorSpace` asks the renderer to decode it on sample and the
   * shader chunk to re-encode on write — but that round trip only actually
   * happened for the poster textures here, not the video ones, so the veil
   * rendered the same room brighter or darker depending on which plate it had
   * picked. Measured against the DOM plate at the identical scroll position:
   * foundation:garage centre rgb(93,53,21) came out rgb(163,126,82) (+43% mean
   * luminance), vault:finish-hall -17%.
   *
   * Sampling and writing raw sRGB bytes makes the veil byte-identical to the
   * CSS plates it blends between. It trades linear-light mixing for a picture
   * that matches its own fallback, which is the right trade for a compositor
   * whose only job is to be indistinguishable from the layer underneath it.
   */
  const fallback = useMemo(() => {
    const texture = new THREE.DataTexture(new Uint8Array([250, 249, 246, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);

  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      tFrom: { value: fallback },
      tTo: { value: fallback },
      uProgress: { value: 0 },
      uVisible: { value: 0 },
      uMode: { value: 0 },
      uDirection: { value: 1 },
      uAspect: { value: 1 },
      uEndpointBlend: { value: new THREE.Vector2(1, 0) },
      uFromScale: { value: new THREE.Vector2(1, 1) },
      uFromOffset: { value: new THREE.Vector2(0, 0) },
      uToScale: { value: new THREE.Vector2(1, 1) },
      uToOffset: { value: new THREE.Vector2(0, 0) },
      uResinPlate: { value: fallback },
      uResinPlateReady: { value: 0 },
      uResinPlateScale: { value: new THREE.Vector2(1, 1) },
      uResinPlateOffset: { value: new THREE.Vector2(0, 0) },
      uResinBloom: { value: resinBloomSigma(RESIN_BLOOM_PIXELS, 900) },
      uFoldBand: { value: FOLD_BAND },
      uFoldReach: { value: FOLD_REACH },
      uFoldParallax: { value: FOLD_PARALLAX },
    },
    vertexShader: VERT,
    fragmentShader: FILM_VEIL_FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }), [fallback]);

  // The vertex shader writes clip space directly, so the camera carries no meaning
  // beyond giving `WebGLRenderer.render` something with matrices to dereference.
  const stage = useMemo(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { scene, camera, mesh };
  }, [material]);

  const bindings = useRef<PlateBinding[]>([]);
  const lockedTransition = useRef<LockedTransition | null>(null);
  const lastTextures = useRef<{ from: THREE.Texture; to: THREE.Texture }>({ from: fallback, to: fallback });
  const previousVeilVisible = useRef(false);
  const renderedBoundary = useRef<string | null>(null);
  const paintConfirmation = useRef({ renderKey: null as string | null, passes: 0 });

  const residentChapters = journeyMediaResidents(snapshot);
  const residentKey = residentChapters.join(':');
  const transitionFrame = resolveJourneyTransitionFrame(snapshot);

  /* ---- plate discovery and residency: unchanged from the standalone canvas ---- */
  useEffect(() => {
    const nextBindings = readPlates().map<PlateBinding>((plate) => ({
      ...plate,
      posterTexture: null,
      videoTexture: null,
      posterReady: false,
      resident: false,
      cleanups: [],
    }));
    bindings.current = nextBindings;
    setMediaRevision((revision) => revision + 1);

    return () => {
      nextBindings.forEach((binding) => {
        binding.resident = false;
        binding.cleanups.forEach((cleanup) => cleanup());
        binding.video?.pause();
        binding.posterTexture?.dispose();
        binding.videoTexture?.dispose();
      });
      bindings.current = [];
    };
  }, []);

  useEffect(() => {
    const loader = new THREE.TextureLoader();
    const residents = new Set(active ? residentChapters : []);
    bindings.current.forEach((binding) => {
      binding.resident = residents.has(binding.id);
      if (!binding.resident) {
        binding.cleanups.splice(0).forEach((cleanup) => cleanup());
        binding.video?.pause();
        binding.posterTexture?.dispose();
        binding.videoTexture?.dispose();
        binding.posterTexture = null;
        binding.videoTexture = null;
        binding.posterReady = false;
        return;
      }

      const posterUrl = binding.image?.currentSrc || binding.image?.src;
      if (posterUrl && !binding.posterTexture) {
        const texture = loader.load(posterUrl, (loaded) => {
          if (!binding.resident || binding.posterTexture !== loaded) {
            loaded.dispose();
            return;
          }
          loaded.colorSpace = THREE.NoColorSpace;
          loaded.minFilter = THREE.LinearFilter;
          loaded.magFilter = THREE.LinearFilter;
          loaded.generateMipmaps = false;
          binding.posterReady = true;
          setMediaRevision((revision) => revision + 1);
        });
        binding.posterTexture = texture;
      }
      if (binding.video && !binding.videoTexture) {
        binding.videoTexture = new THREE.VideoTexture(binding.video);
        binding.videoTexture.colorSpace = THREE.NoColorSpace;
        binding.videoTexture.minFilter = THREE.LinearFilter;
        binding.videoTexture.magFilter = THREE.LinearFilter;
        binding.videoTexture.generateMipmaps = false;
        const ready = () => setMediaRevision((revision) => revision + 1);
        // `data-video-ready` is what decides which plate this veil samples, and
        // `JourneyMotion` writes it from these same events, so the compositor has to
        // be woken by them too or it would keep the poster a frame or two too long.
        ['loadeddata', 'canplay', 'resize', 'seeked'].forEach((event) => {
          binding.video?.addEventListener(event, ready);
          binding.cleanups.push(() => binding.video?.removeEventListener(event, ready));
        });
      }
    });
    setMediaRevision((revision) => revision + 1);
  }, [active, residentKey]);

  useEffect(() => {
    if (!active) setPlateReady(false);
  }, [active]);

  /**
   * The resin plate: loaded once for the life of the compositor, disposed with it.
   *
   * It is not a room plate, so it has no residency and never enters `bindings` —
   * it is the shape of one transition, and `resin-wipe` is the only mode that
   * samples it. Until it decodes, `uResinPlateReady` stays 0 and mode 3 runs its
   * analytic edge, which is why a failed load degrades the shape and never the
   * transition.
   */
  useEffect(() => {
    if (!active) return undefined;
    let disposed = false;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(resinPlateUrl(), (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      loaded = texture;
      material.uniforms.uResinPlate.value = texture;
      material.uniforms.uResinPlateReady.value = 1;
      invalidate();
    });
    return () => {
      disposed = true;
      material.uniforms.uResinPlateReady.value = 0;
      material.uniforms.uResinPlate.value = fallback;
      loaded?.dispose();
    };
  }, [active, fallback, invalidate, material]);

  useEffect(() => {
    const plateUv = coverUvTransform(
      RESIN_PLATE_ASPECT.width,
      RESIN_PLATE_ASPECT.height,
      size.width,
      size.height,
    );
    material.uniforms.uResinPlateScale.value.set(...plateUv.scale);
    material.uniforms.uResinPlateOffset.value.set(...plateUv.offset);
    material.uniforms.uResinBloom.value = resinBloomSigma(RESIN_BLOOM_PIXELS, size.height);
  }, [material, size.height, size.width]);

  useEffect(() => {
    const onResize = () => {
      setSize(viewportSize());
      bindings.current.forEach((binding) => {
        binding.objectPosition = parseObjectPosition(binding.video ?? binding.image);
      });
      setMediaRevision((revision) => revision + 1);
    };
    window.addEventListener('resize', onResize);
    onResize();
    return () => window.removeEventListener('resize', onResize);
  }, []);

  /* ---- uniforms: lock the rooms on entry, resolve their plates every frame ---- */
  useLayoutEffect(() => {
    const bindingFor = (id: JourneyChapterId) => bindings.current[JOURNEY_CHAPTER_IDS.indexOf(id)] ?? null;
    const plateTexture = (binding: PlateBinding | null): THREE.Texture | null => {
      if (!binding) return null;
      const posterImage = binding.posterTexture?.image as { width?: number; height?: number } | undefined;
      const video = binding.video;
      const choice = veilPlateChoice({
        image: binding.posterReady ? {
          complete: true,
          naturalWidth: posterImage?.width ?? binding.image?.naturalWidth ?? 0,
          naturalHeight: posterImage?.height ?? binding.image?.naturalHeight ?? 0,
        } : null,
        video: video ? {
          readyState: video.readyState,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
          presented: video.hasAttribute('data-video-ready'),
        } : null,
      });
      if (choice === 'video') return binding.videoTexture;
      if (choice === 'poster') return binding.posterTexture;
      return null;
    };

    const activeTexture = plateTexture(bindingFor(snapshot.activeChapter));
    if (!plateReady && activeTexture) setPlateReady(true);

    const interior = active && transitionFrame.progress > 0 && transitionFrame.progress < 1;
    const key = transitionFrame.key;
    const lockAction = transitionLockAction(
      lockedTransition.current?.key ?? null,
      key,
      interior,
      snapshot.whiteStageActive,
    );
    if (lockAction === 'clear') {
      lockedTransition.current = null;
    } else if (lockAction === 'acquire') {
      const fromBinding = bindingFor(transitionFrame.from);
      const toBinding = transitionFrame.to ? bindingFor(transitionFrame.to) : null;
      const fromTexture = transitionFrame.fromWhite ? fallback : plateTexture(fromBinding);
      const toTexture = transitionFrame.to ? plateTexture(toBinding) : fallback;
      lockedTransition.current = (transitionFrame.fromWhite || fromBinding)
        && (transitionFrame.to === null || toBinding)
        && fromTexture && toTexture
        ? {
            key,
            from: { binding: transitionFrame.fromWhite ? null : fromBinding, white: transitionFrame.fromWhite },
            to: { binding: toBinding },
          }
        : null;
    }

    const locked = lockedTransition.current?.key === key ? lockedTransition.current : null;
    setTransitionReady(Boolean(locked));
    material.userData.renderKey = locked ? key : null;
    material.userData.boundaryKey = locked ? transitionFrame.boundaryKey : null;
    material.userData.snapshotRevision = snapshot.revision;
    material.userData.transitionProgress = transitionFrame.progress;
    if (locked) {
      // Re-resolved, not replayed: if the document promoted a room's film since the
      // lock was taken, the veil follows it in the same frame the DOM does. A null
      // resolution keeps the last good texture rather than dropping to paper.
      const fromTexture = (locked.from.white ? fallback : plateTexture(locked.from.binding)) ?? lastTextures.current.from;
      const toTexture = (locked.to.binding ? plateTexture(locked.to.binding) : fallback) ?? lastTextures.current.to;
      lastTextures.current = { from: fromTexture, to: toTexture };
      material.uniforms.tFrom.value = fromTexture;
      material.uniforms.tTo.value = toTexture;
      material.uniforms.uMode.value = transitionFrame.style.mode;
      material.uniforms.uDirection.value = transitionFrame.style.direction;
      material.uniforms.uAspect.value = size.width / Math.max(1, size.height);
      const fromDimensions = textureDimensions(locked.from.binding, fromTexture);
      const toDimensions = textureDimensions(locked.to.binding, toTexture);
      const fromUv = coverUvTransform(
        fromDimensions[0],
        fromDimensions[1],
        size.width,
        size.height,
        locked.from.binding?.objectPosition,
      );
      const toUv = coverUvTransform(
        toDimensions[0],
        toDimensions[1],
        size.width,
        size.height,
        locked.to.binding?.objectPosition,
      );
      material.uniforms.uFromScale.value.set(...fromUv.scale);
      material.uniforms.uFromOffset.value.set(...fromUv.offset);
      material.uniforms.uToScale.value.set(...toUv.scale);
      material.uniforms.uToOffset.value.set(...toUv.offset);
    }
    material.uniforms.uProgress.value = transitionFrame.progress;
    material.uniforms.uEndpointBlend.value.set(...endpointBlend(transitionFrame.progress));
  }, [active, fallback, material, mediaRevision, plateReady, size.height, size.width, snapshot, transitionFrame]);

  const veilIsVisible = veilVisible(
    transitionFrame.progress,
    active && rendererLive,
    snapshot.whiteStageActive,
    transitionReady,
  );
  const requestedRenderKey = veilIsVisible ? transitionFrame.key : null;

  useLayoutEffect(() => {
    const materialBoundary = typeof material.userData.renderKey === 'string'
      ? material.userData.renderKey
      : null;
    material.uniforms.uVisible.value = veilIsVisible && materialBoundary === requestedRenderKey ? 1 : 0;
    // A confirmed frame for a boundary that is no longer wanted has to be replaced,
    // not hidden: the shared canvas is cleared at the top of every frame, so asking
    // for one more frame IS the retirement.
    if (renderedBoundary.current !== null
      && veilCanvasShouldHide(renderedBoundary.current, requestedRenderKey, veilIsVisible)) {
      invalidate();
    }
    if (veilFrameRequired(previousVeilVisible.current, veilIsVisible)) invalidate();
    previousVeilVisible.current = veilIsVisible;
  }, [
    invalidate,
    material,
    mediaRevision,
    requestedRenderKey,
    size.height,
    size.width,
    transitionFrame.key,
    transitionFrame.progress,
    veilIsVisible,
  ]);

  /* ---- paint confirmation: the single owner of what the director is told ---- */
  useEffect(() => {
    stage.mesh.onAfterRender = () => {
      const paintedRenderKey = material.uniforms.uVisible.value > 0
        && typeof material.userData.renderKey === 'string'
        ? material.userData.renderKey
        : null;
      const paintedBoundary = typeof material.userData.boundaryKey === 'string'
        ? material.userData.boundaryKey
        : null;
      const paintedProgress = Number(material.userData.transitionProgress);
      if (!paintedRenderKey) {
        paintConfirmation.current = { renderKey: null, passes: 0 };
        renderedBoundary.current = null;
        journeyDirector.reportVeil(null, false);
        host.dataset.renderedBoundary = 'clear';
        host.dataset.renderedProgress = '0.0000';
        host.dataset.renderedRevision = String(material.userData.snapshotRevision ?? 0);
        return;
      }

      const confirmation = advanceVeilPaintConfirmation(paintConfirmation.current, paintedRenderKey);
      paintConfirmation.current = confirmation.state;
      if (!confirmation.confirmed) {
        journeyDirector.reportVeil(paintedBoundary, false);
        host.dataset.renderedBoundary = 'pending';
        invalidate();
        return;
      }

      renderedBoundary.current = paintedRenderKey;
      journeyDirector.reportVeil(paintedBoundary, true);
      host.dataset.renderedBoundary = String(material.userData.boundaryKey);
      host.dataset.renderedProgress = Number.isFinite(paintedProgress) ? paintedProgress.toFixed(4) : '0.0000';
      host.dataset.renderedRevision = String(material.userData.snapshotRevision ?? 0);
    };
    const mesh = stage.mesh;
    return () => {
      mesh.onAfterRender = () => undefined;
    };
  }, [host, invalidate, material, stage]);

  /* ---- the view: `.film-veil` is fixed inset 0, so its scissor is the viewport ---- */
  useEffect(() => {
    const render = ({ rect, gl }: SurfaceViewRenderContext) => {
      material.uniforms.uAspect.value = rect.width / Math.max(1, rect.height);
      gl.render(stage.scene, stage.camera);
    };
    // Priority 0: under the floor band, which is where `.surface-canvas-host`
    // (z-index 1) has always sat relative to `.film-veil` inside `.journey`'s own
    // stacking context. See the view table in surface-store.ts.
    return surfaceStore.registerView('film-veil', host, { render, priority: 0 });
  }, [host, material, stage]);

  useEffect(() => {
    const journey = document.querySelector('.journey');
    if (!journey) return;
    const intersection = new IntersectionObserver(
      ([entry]) => setJourneyVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.01 },
    );
    const onVisibility = () => setDocumentVisible(document.visibilityState !== 'hidden');
    intersection.observe(journey);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => {
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  const enhancementReady = journeyEnhancementReady({
    contextReady: rendererLive,
    plateReady,
    directorRevision: snapshot.revision,
    motionEnabled: active,
    motionPreference: controls.motionPreference,
  });

  useEffect(() => {
    if (rendererLive) return;
    // The shared context went away (loss, or an admission that never happened).
    // Hand the picture back to the DOM crossfade in the same breath.
    removeJourneyEnhancement(document);
    journeyDirector.reportVeil(null, false);
    renderedBoundary.current = null;
    paintConfirmation.current = { renderKey: null, passes: 0 };
  }, [rendererLive]);

  useEffect(() => {
    const journey = document.querySelector<HTMLElement>('.journey');
    journey?.toggleAttribute('data-journey-enhanced', enhancementReady);
    journeyDirector.invalidateGeometry();
    window.dispatchEvent(new Event(JOURNEY_COMPOSITOR_READY_EVENT));
    return () => journey?.removeAttribute('data-journey-enhanced');
  }, [enhancementReady]);

  useEffect(() => () => {
    journeyDirector.reportVeil(null, false);
    delete host.dataset.renderedBoundary;
    delete host.dataset.renderedProgress;
    delete host.dataset.renderedRevision;
  }, [host]);

  useEffect(() => () => {
    stage.mesh.geometry.dispose();
    material.dispose();
    fallback.dispose();
  }, [fallback, material, stage]);

  return null;
}
