import { Canvas, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
  transitionPlateChoice,
  veilCanvasShouldHide,
  veilFrameRequired,
  veilVisible,
} from '../../lib/motion/journey-media';
import { thresholdStudyEnabled } from '../../lib/motion/journey-threshold';
import {
  resolveJourneyTransitionFrame,
  transitionLockAction,
} from '../../lib/motion/journey-transitions';
import ThresholdTravel from './ThresholdTravel';

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
      light = pow(sin(progress * 3.14159265), 1.45) * 0.62;
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
  #include <colorspace_fragment>
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

type LockedTransition = {
  readonly key: string;
  readonly from: { readonly binding: PlateBinding | null; readonly texture: THREE.Texture };
  readonly to: { readonly binding: PlateBinding | null; readonly texture: THREE.Texture };
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

function MixMesh({ active, onFirstPlateReady }: { active: boolean; onFirstPlateReady: () => void }) {
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const snapshot = useSyncExternalStore(
    journeyDirector.subscribe,
    journeyDirector.getSnapshot,
    journeyDirector.getServerSnapshot,
  );
  const fallback = useMemo(() => {
    const texture = new THREE.DataTexture(new Uint8Array([250, 249, 246, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);
  const bindings = useRef<PlateBinding[]>([]);
  const lockedTransition = useRef<LockedTransition | null>(null);
  const previousVeilVisible = useRef(false);
  const renderedBoundary = useRef<string | null>(null);
  const paintConfirmation = useRef({ renderKey: null as string | null, passes: 0 });
  const firstReadySent = useRef(false);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [transitionReady, setTransitionReady] = useState(false);
  const residentChapters = journeyMediaResidents(snapshot);
  const residentKey = residentChapters.join(':');
  const transitionFrame = resolveJourneyTransitionFrame(snapshot);
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
          loaded.colorSpace = THREE.SRGBColorSpace;
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
        binding.videoTexture.colorSpace = THREE.SRGBColorSpace;
        binding.videoTexture.minFilter = THREE.LinearFilter;
        binding.videoTexture.magFilter = THREE.LinearFilter;
        binding.videoTexture.generateMipmaps = false;
        const ready = () => setMediaRevision((revision) => revision + 1);
        ['loadeddata', 'canplay', 'resize', 'seeked'].forEach((event) => {
          binding.video?.addEventListener(event, ready);
          binding.cleanups.push(() => binding.video?.removeEventListener(event, ready));
        });
      }
    });
    setMediaRevision((revision) => revision + 1);
  }, [active, residentKey]);

  useEffect(() => {
    if (!active) firstReadySent.current = false;
  }, [active]);

  useEffect(() => {
    bindings.current.forEach((binding) => {
      binding.objectPosition = parseObjectPosition(binding.video ?? binding.image);
    });
    setMediaRevision((revision) => revision + 1);
  }, [size.height, size.width]);

  useLayoutEffect(() => {
    const bindingFor = (id: JourneyChapterId) => bindings.current[JOURNEY_CHAPTER_IDS.indexOf(id)] ?? null;
    const textureFor = (binding: PlateBinding | null, outgoing: boolean) => {
      if (!binding) return null;
      const posterImage = binding.posterTexture?.image as { width?: number; height?: number } | undefined;
      const choice = transitionPlateChoice({
        image: binding.posterReady ? {
          complete: true,
          naturalWidth: posterImage?.width ?? binding.image?.naturalWidth ?? 0,
          naturalHeight: posterImage?.height ?? binding.image?.naturalHeight ?? 0,
        } : null,
        video: binding.video,
      }, outgoing);
      if (choice === 'video') return binding.videoTexture;
      if (choice === 'poster') return binding.posterTexture;
      return null;
    };
    const activeBinding = bindingFor(snapshot.activeChapter);
    const activeTexture = textureFor(activeBinding, true);
    if (!firstReadySent.current && activeTexture) {
      firstReadySent.current = true;
      onFirstPlateReady();
    }

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
      const movingForward = snapshot.scrollDirection >= 0;
      const fromTexture = transitionFrame.fromWhite ? fallback : textureFor(fromBinding, movingForward);
      const toTexture = transitionFrame.to ? textureFor(toBinding, !movingForward) : fallback;
      lockedTransition.current = (transitionFrame.fromWhite || fromBinding)
        && (transitionFrame.to === null || toBinding)
        && fromTexture && toTexture
        ? {
            key,
            from: { binding: transitionFrame.fromWhite ? null : fromBinding, texture: fromTexture },
            to: { binding: toBinding, texture: toTexture },
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
      material.uniforms.tFrom.value = locked.from.texture;
      material.uniforms.tTo.value = locked.to.texture;
      material.uniforms.uMode.value = transitionFrame.style.mode;
      material.uniforms.uDirection.value = transitionFrame.style.direction;
      material.uniforms.uAspect.value = size.width / Math.max(1, size.height);
      const fromDimensions = textureDimensions(locked.from.binding, locked.from.texture);
      const toDimensions = textureDimensions(locked.to.binding, locked.to.texture);
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

  }, [active, fallback, invalidate, material, mediaRevision, onFirstPlateReady, size.height, size.width, snapshot]);

  const veilIsVisible = veilVisible(
    transitionFrame.progress,
    active,
    snapshot.whiteStageActive,
    transitionReady,
  );

  const requestedRenderKey = veilIsVisible
    ? transitionFrame.key
    : null;

  useLayoutEffect(() => {
    const materialBoundary = typeof material.userData.renderKey === 'string'
      ? material.userData.renderKey
      : null;
    const frameCanShow = veilIsVisible && materialBoundary === requestedRenderKey;
    material.uniforms.uVisible.value = frameCanShow ? 1 : 0;
    if (veilCanvasShouldHide(renderedBoundary.current, requestedRenderKey, veilIsVisible)) {
      gl.domElement.style.opacity = '0';
    }
    if (veilFrameRequired(previousVeilVisible.current, veilIsVisible)) invalidate();
    previousVeilVisible.current = veilIsVisible;
    if (!veilIsVisible) renderedBoundary.current = null;
  }, [
    gl,
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

  useEffect(() => () => {
    gl.domElement.style.removeProperty('opacity');
    delete gl.domElement.dataset.renderedBoundary;
    delete gl.domElement.dataset.renderedProgress;
    delete gl.domElement.dataset.renderedRevision;
  }, [gl]);

  useEffect(() => () => {
    material.dispose();
    fallback.dispose();
  }, [fallback, material]);

  return (
    <mesh
      onAfterRender={() => {
        const paintedRenderKey = material.uniforms.uVisible.value > 0
          && typeof material.userData.renderKey === 'string'
          ? material.userData.renderKey
          : null;
        const paintedProgress = Number(material.userData.transitionProgress);
        if (!paintedRenderKey) {
          paintConfirmation.current = { renderKey: null, passes: 0 };
          renderedBoundary.current = null;
          gl.domElement.dataset.renderedBoundary = 'clear';
          gl.domElement.dataset.renderedProgress = '0.0000';
          gl.domElement.dataset.renderedRevision = String(material.userData.snapshotRevision ?? 0);
          gl.domElement.style.opacity = '1';
          return;
        }

        const confirmation = advanceVeilPaintConfirmation(paintConfirmation.current, paintedRenderKey);
        paintConfirmation.current = confirmation.state;
        if (!confirmation.confirmed) {
          gl.domElement.dataset.renderedBoundary = 'pending';
          gl.domElement.style.opacity = '0';
          invalidate();
          return;
        }

        renderedBoundary.current = paintedRenderKey;
        gl.domElement.dataset.renderedBoundary = String(material.userData.boundaryKey);
        gl.domElement.dataset.renderedProgress = Number.isFinite(paintedProgress)
          ? paintedProgress.toFixed(4)
          : '0.0000';
        gl.domElement.dataset.renderedRevision = String(material.userData.snapshotRevision ?? 0);
        gl.domElement.style.opacity = '1';
      }}
    >
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

export default function FilmVeil({ motionEnabled, thresholdHdrEnabled, enableThresholdStudy }: {
  readonly motionEnabled: boolean;
  readonly thresholdHdrEnabled: boolean;
  readonly enableThresholdStudy: boolean;
}) {
  const controls = useSyncExternalStore(
    journeyControls.subscribe,
    journeyControls.getSnapshot,
    journeyControls.getServerSnapshot,
  );
  const journeySnapshot = useSyncExternalStore(
    journeyDirector.subscribe,
    journeyDirector.getSnapshot,
    journeyDirector.getServerSnapshot,
  );
  const [journeyVisible, setJourneyVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(true);
  const [contextReady, setContextReady] = useState(false);
  const [plateReady, setPlateReady] = useState(false);
  const [canvasElement, setCanvasElement] = useState<HTMLCanvasElement | null>(null);
  const active = journeyVisible && documentVisible && motionEnabled && controls.motionPreference === 'auto';
  const onFirstPlateReady = useCallback(() => setPlateReady(true), []);
  const onThresholdReady = useCallback(() => undefined, []);
  const shouldMountThreshold = thresholdStudyEnabled(journeySnapshot, {
    optIn: enableThresholdStudy,
    hdrSupported: thresholdHdrEnabled,
    motionEnabled: active,
  });
  const enhancementReady = journeyEnhancementReady({
    contextReady,
    plateReady,
    directorRevision: journeySnapshot.revision,
    motionEnabled: active,
    motionPreference: controls.motionPreference,
  });

  useEffect(() => {
    if (!active) setPlateReady(false);
  }, [active]);

  useEffect(() => {
    const journey = document.querySelector('.journey');
    if (!journey) return;
    const intersection = new IntersectionObserver(([entry]) => setJourneyVisible(Boolean(entry?.isIntersecting)), { threshold: 0.01 });
    const onVisibility = () => setDocumentVisible(document.visibilityState !== 'hidden');
    intersection.observe(journey);
    document.addEventListener('visibilitychange', onVisibility);
    onVisibility();
    return () => {
      intersection.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!canvasElement) return;
    const onContextLost = () => {
      setContextReady(false);
      removeJourneyEnhancement(document);
    };
    canvasElement.addEventListener('webglcontextlost', onContextLost);
    return () => canvasElement.removeEventListener('webglcontextlost', onContextLost);
  }, [canvasElement]);

  useEffect(() => {
    const journey = document.querySelector<HTMLElement>('.journey');
    journey?.toggleAttribute('data-journey-enhanced', enhancementReady);
    journeyDirector.invalidateGeometry();
    window.dispatchEvent(new Event(JOURNEY_COMPOSITOR_READY_EVENT));
    return () => journey?.removeAttribute('data-journey-enhanced');
  }, [enhancementReady]);

  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
      dpr={[1, 1.5]}
      frameloop="demand"
      gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.AgXToneMapping;
        gl.toneMappingExposure = 1;
        setCanvasElement(gl.domElement);
        setContextReady(true);
      }}
    >
      {motionEnabled ? <MixMesh active={active} onFirstPlateReady={onFirstPlateReady} /> : null}
      {shouldMountThreshold ? (
        <Suspense fallback={null}>
          <ThresholdTravel motionEnabled={active} onReady={onThresholdReady} />
        </Suspense>
      ) : null}
    </Canvas>
  );
}
