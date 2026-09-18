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
varying vec2 vUv;

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
      float resinField = vUv.y + staticUndulation(vec2(vUv.y, vUv.x)) * 2.35;
      toWeight = 1.0 - smoothstep(resinFront - 0.14, resinFront + 0.14, resinField);
      light = exp(-pow((resinField - resinFront) / 0.12, 2.0)) * sin(progress * 3.14159265) * 0.2;
    } else {
      float curlAxis = uDirection > 0.0 ? vUv.x : 1.0 - vUv.x;
      float curlEdge = mix(-0.2, 1.2, eased);
      float curledField = curlAxis + sin(vUv.y * 3.14159265) * 0.075 + organic * 1.8;
      toWeight = 1.0 - smoothstep(curlEdge - 0.11, curlEdge + 0.11, curledField);
      light = exp(-pow((curledField - curlEdge) / 0.105, 2.0)) * sin(progress * 3.14159265) * 0.18;
    }

    vec3 composite = mix(fromColor.rgb, toColor.rgb, clamp(toWeight, 0.0, 1.0));
    composite = mix(composite, vec3(0.973, 0.969, 0.952), clamp(light, 0.0, 0.72));
    outputColor = vec4(composite, 1.0);
  }
  gl_FragColor = outputColor;
}
`;

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
