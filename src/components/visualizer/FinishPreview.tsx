import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { PATTERN_CODE, type FinishPreset } from '../../lib/visualizer/finishes';
import { FINISH_SHADER_CHUNK, tryCreateImageToFinishHomography } from '../../lib/visualizer/finish-shader';
import type { Quad } from '../../lib/visualizer/homography';
import { ensureVisualizerGsap } from '../../lib/visualizer/motion';
import type { ExclusionMaskDraft } from '../../lib/visualizer/exclusion-mask';
import type { Size } from '../../lib/visualizer/image-geometry';
import {
  ALCOVE_FINISH_CHUNK,
  ENTRY_METALLIC,
  ENTRY_SETTLE_DURATION,
  ENTRY_SETTLE_EASE,
  PILLAR_HEIGHT,
  createArchGeometry,
  createContactTexture,
  createPillarGeometry,
  createRoomEnvironment,
  createSparkleTexture,
  createWallGeometry,
  finishSurfaceTraits,
} from './alcove-world';

type Point = readonly [number, number];

/** Where the alcove camera rests, and what it looks at, once the entrance has played. */
const ALCOVE_HOME = new THREE.Vector3(0.1, 3.55, 10.6);
const ALCOVE_TARGET = new THREE.Vector3(0, 0.5, -0.9);
const ALCOVE_START = new THREE.Vector3(0, 5.1, 14.4);
const PILLAR_X_FRONT = 3.2;
const PILLAR_Z_FRONT = 2;
const PILLAR_X_BACK = 2.5;
const PILLAR_Z_BACK = -3.1;
/** Flake density is tuned against the slab's own size; both move together. */
const FLOOR_DENSITY = 157;

type FinishUniforms = {
  uA: { value: THREE.Color };
  uB: { value: THREE.Color };
  uC: { value: THREE.Color };
  uDensity: { value: number };
  uPattern: { value: number };
  uReveal: { value: number };
  uLight: { value: THREE.Vector2 };
  uSparkleTex: { value: THREE.Texture };
  uSparkleShift: { value: THREE.Vector2 };
  uSparkleAmount: { value: number };
  uSwirlAmount: { value: number };
  uEntry: { value: number };
  uEntryA: { value: THREE.Color };
  uEntryB: { value: THREE.Color };
  uEntryC: { value: THREE.Color };
};

function patchFinishMaterial(material: THREE.MeshPhysicalMaterial, uniforms: FinishUniforms) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>\nvarying vec2 vFinishUv;`,
    ).replace(
      '#include <uv_vertex>',
      `#include <uv_vertex>\nvFinishUv = uv;`,
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      `#include <common>\n${FINISH_SHADER_CHUNK}\n${ALCOVE_FINISH_CHUNK}\nvarying vec2 vFinishUv;`,
    ).replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 finishCol = finishSample(vFinishUv);
      if (uEntry > 0.0005) finishCol = mix(finishCol, ffeEntrySample(vFinishUv), uEntry);
      float sheenDot = pow(max(0.0, 1.0 - distance(vFinishUv, uLight)), 8.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, finishCol, uReveal);
      diffuseColor.rgb += finishCol * sheenDot * 0.38 * uReveal;
      `,
    ).replace(
      '#include <opaque_fragment>',
      `
      float ffeFacing = pow(1.0 - saturate(dot(normalize(vViewPosition), normal)), 2.0);
      outgoingLight += vec3(ffeSparkle(gl_FragCoord.xy)) * mix(vec3(1.0), finishCol, 0.3) * (0.4 + 0.75 * ffeFacing) * uReveal;
      outgoingLight += ffeSwirl(vFinishUv, finishCol) * uReveal;
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => 'ffe-finish-preview';
}

function useFinishMaterial(finish: FinishPreset, sparkleShift: THREE.Vector2) {
  const { invalidate } = useThree();
  const sparkleTexture = useMemo(() => createSparkleTexture(), []);
  const uniforms = useMemo<FinishUniforms>(() => {
    const traits = finishSurfaceTraits(finish);
    return {
      uA: { value: new THREE.Color(finish.colors[0]) },
      uB: { value: new THREE.Color(finish.colors[1]) },
      uC: { value: new THREE.Color(finish.colors[2]) },
      uDensity: { value: FLOOR_DENSITY / Math.max(0.4, finish.scale) },
      uPattern: { value: PATTERN_CODE[finish.pattern] },
      uReveal: { value: 1 },
      uLight: { value: new THREE.Vector2(0.32, 0.28) },
      uSparkleTex: { value: sparkleTexture as THREE.Texture },
      uSparkleShift: { value: sparkleShift },
      uSparkleAmount: { value: traits.sparkle },
      uSwirlAmount: { value: traits.swirl },
      uEntry: { value: 0 },
      uEntryA: { value: new THREE.Color(ENTRY_METALLIC[0]) },
      uEntryB: { value: new THREE.Color(ENTRY_METALLIC[1]) },
      uEntryC: { value: new THREE.Color(ENTRY_METALLIC[2]) },
    };
  }, [sparkleShift, sparkleTexture]);

  const material = useMemo(() => {
    const traits = finishSurfaceTraits(finish);
    const next = new THREE.MeshPhysicalMaterial({
      color: '#d8d1c3',
      roughness: finish.roughness,
      metalness: traits.metalness,
      clearcoat: traits.clearcoat,
      clearcoatRoughness: traits.clearcoatRoughness,
      envMapIntensity: traits.envMapIntensity,
    });
    patchFinishMaterial(next, uniforms);
    return next;
  }, [uniforms]);

  useEffect(() => () => {
    material.dispose();
    sparkleTexture.dispose();
  }, [material, sparkleTexture]);

  useEffect(() => {
    const host = document.querySelector<HTMLElement>('[data-finish-stage]');
    if (!host) return;
    const onLight = (event: Event) => {
      const detail = (event as CustomEvent<{ x: number; y: number }>).detail;
      if (!detail) return;
      gsap.to(uniforms.uLight.value, { x: detail.x, y: 1 - detail.y, duration: 0.55, ease: 'power3.out', overwrite: true, onUpdate: invalidate });
    };
    host.addEventListener('finish-light', onLight);
    return () => {
      host.removeEventListener('finish-light', onLight);
      gsap.killTweensOf(uniforms.uLight.value);
    };
  }, [invalidate, uniforms]);

  return { material, uniforms };
}

/**
 * Holds a paused timeline until the renderer actually draws a frame. Mounting can be
 * seconds ahead of the first pixel on a slow device, and an entrance started at mount
 * is simply gone by then — GSAP catches up to wall-clock time in one tick.
 */
function useFirstFrameTimeline() {
  const pending = useRef<gsap.core.Timeline | null>(null);
  useFrame(() => {
    const timeline = pending.current;
    if (!timeline) return;
    pending.current = null;
    timeline.play(0);
  });
  return pending;
}

function FloorSlab({
  finish,
  compare,
  sparkleShift,
  entryFromFinishHall,
  staggered,
}: {
  finish: FinishPreset;
  compare: number;
  sparkleShift: THREE.Vector2;
  entryFromFinishHall: boolean;
  staggered: boolean;
}) {
  const { material, uniforms } = useFinishMaterial(finish, sparkleShift);
  const { invalidate } = useThree();
  const firstPaint = useRef(true);
  const pending = useFirstFrameTimeline();

  useEffect(() => {
    ensureVisualizerGsap();
    const traits = finishSurfaceTraits(finish);
    const a = new THREE.Color(finish.colors[0]);
    const b = new THREE.Color(finish.colors[1]);
    const c = new THREE.Color(finish.colors[2]);
    const opening = firstPaint.current;
    const entering = opening && entryFromFinishHall;
    const delay = opening && staggered ? 0.34 : 0;
    firstPaint.current = false;
    uniforms.uPattern.value = PATTERN_CODE[finish.pattern];
    uniforms.uSparkleAmount.value = traits.sparkle;
    uniforms.uSwirlAmount.value = traits.swirl;
    const tl = gsap.timeline({ delay, paused: opening, onUpdate: invalidate });
    // Arriving from Act 7 the floor is already on screen, so it does not fade up: it is
    // handed over at full strength and only its material changes. Fading in over the
    // entry crossfade would cancel it out, leaving the base colour showing through.
    if (entering) uniforms.uReveal.value = 1;
    else tl.fromTo(uniforms.uReveal, { value: 0.12 }, { value: 1, duration: 0.9, ease: 'alcove' }, 0);
    tl.to(uniforms.uDensity, { value: FLOOR_DENSITY / Math.max(0.4, finish.scale), duration: 0.8, ease: 'power2.out' }, 0);
    tl.to(material, {
      roughness: finish.roughness,
      metalness: traits.metalness,
      clearcoat: traits.clearcoat,
      clearcoatRoughness: traits.clearcoatRoughness,
      envMapIntensity: traits.envMapIntensity,
      duration: 0.85,
      ease: 'power3.inOut',
    }, 0);
    tl.to(uniforms.uA.value, { r: a.r, g: a.g, b: a.b, duration: 0.8 }, 0);
    tl.to(uniforms.uB.value, { r: b.r, g: b.g, b: b.b, duration: 0.8 }, 0);
    tl.to(uniforms.uC.value, { r: c.r, g: c.g, b: c.b, duration: 0.8 }, 0);
    if (entering) {
      // Arriving from Act 7: the floor is still the homepage's metallic state and
      // settles into the chosen finish. `settle` — 0.9 s, power2.out.
      uniforms.uEntry.value = 1;
      material.metalness = 0.55;
      material.roughness = 0.18;
      tl.to(uniforms.uEntry, { value: 0, duration: ENTRY_SETTLE_DURATION, ease: ENTRY_SETTLE_EASE }, 0);
    }
    if (opening) {
      pending.current = tl;
      invalidate();
    }
    return () => {
      tl.kill();
      if (pending.current === tl) pending.current = null;
    };
  }, [entryFromFinishHall, finish, invalidate, material, pending, staggered, uniforms]);

  useEffect(() => {
    material.opacity = compare / 100;
    material.transparent = compare < 100;
    invalidate();
  }, [compare, invalidate, material]);

  return (
    <mesh rotation={[-Math.PI / 2.04, 0, 0]} position={[0, 0.26, -0.4]} receiveShadow>
      <planeGeometry args={[14, 12.6, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function PhotoQuad({
  finish,
  points,
  compare,
  maskUrl,
  photoUrl,
  photoSize,
  photoRevision,
  exclusionMask,
}: {
  finish: FinishPreset;
  points: readonly Point[];
  compare: number;
  maskUrl: string | null;
  photoUrl: string;
  photoSize: Size;
  photoRevision: string;
  exclusionMask: ExclusionMaskDraft | null;
}) {
  const { invalidate } = useThree();
  const fallbackMask = useMemo(() => {
    const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);
  const fallbackSource = useMemo(() => {
    const texture = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, []);
  const exclusionLayer = useMemo(() => {
    const scale = Math.min(1, 1_024 / Math.max(photoSize.width, photoSize.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(photoSize.width * scale));
    canvas.height = Math.max(1, Math.round(photoSize.height * scale));
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.NoColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return { canvas, texture };
  }, [photoRevision, photoSize.height, photoSize.width]);
  const uniforms = useMemo(() => ({
    uA: { value: new THREE.Color(finish.colors[0]) },
    uB: { value: new THREE.Color(finish.colors[1]) },
    uC: { value: new THREE.Color(finish.colors[2]) },
    uDensity: { value: 96 / Math.max(0.4, finish.scale) },
    uPattern: { value: PATTERN_CODE[finish.pattern] },
    uReveal: { value: 1 },
    uLight: { value: new THREE.Vector2(0.32, 0.28) },
    uImageToFinish: { value: new THREE.Matrix3() },
    uCompare: { value: compare / 100 },
    uMask: { value: fallbackMask as THREE.Texture },
    uUseMask: { value: 0 },
    uGeometryValid: { value: 1 },
    uSourcePhoto: { value: fallbackSource as THREE.Texture },
    uUseSourcePhoto: { value: 0 },
    uExclusionMask: { value: exclusionLayer.texture as THREE.Texture },
  }), [exclusionLayer.texture, fallbackMask, fallbackSource]);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec2 vImageUv;
      void main() {
        vImageUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vImageUv;
      uniform mat3 uImageToFinish;
      uniform float uCompare;
      uniform sampler2D uMask;
      uniform float uUseMask;
      uniform float uGeometryValid;
      uniform sampler2D uSourcePhoto;
      uniform float uUseSourcePhoto;
      uniform sampler2D uExclusionMask;
      ${FINISH_SHADER_CHUNK}
      void main() {
        vec2 imageUv = vec2(vImageUv.x, 1.0 - vImageUv.y);
        vec3 projected = uImageToFinish * vec3(imageUv, 1.0);
        if (abs(projected.z) < 0.00001) discard;
        vec2 finishUv = projected.xy / projected.z;
        float inside = step(0.0, finishUv.x) * step(finishUv.x, 1.0)
          * step(0.0, finishUv.y) * step(finishUv.y, 1.0);
        vec3 finishCol = finishSample(finishUv);
        vec2 sourceUv = vImageUv;
        vec3 sourceCenter = texture2D(uSourcePhoto, sourceUv).rgb;
        vec2 lowOffset = vec2(0.028, 0.038);
        vec3 sourceLow = sourceCenter * 0.20;
        sourceLow += texture2D(uSourcePhoto, sourceUv + vec2(lowOffset.x, 0.0)).rgb * 0.10;
        sourceLow += texture2D(uSourcePhoto, sourceUv - vec2(lowOffset.x, 0.0)).rgb * 0.10;
        sourceLow += texture2D(uSourcePhoto, sourceUv + vec2(0.0, lowOffset.y)).rgb * 0.10;
        sourceLow += texture2D(uSourcePhoto, sourceUv - vec2(0.0, lowOffset.y)).rgb * 0.10;
        sourceLow += texture2D(uSourcePhoto, sourceUv + lowOffset).rgb * 0.10;
        sourceLow += texture2D(uSourcePhoto, sourceUv - lowOffset).rgb * 0.10;
        sourceLow += texture2D(uSourcePhoto, sourceUv + vec2(lowOffset.x, -lowOffset.y)).rgb * 0.10;
        sourceLow += texture2D(uSourcePhoto, sourceUv + vec2(-lowOffset.x, lowOffset.y)).rgb * 0.10;
        float sourceLuma = dot(sourceLow, vec3(0.2126, 0.7152, 0.0722));
        float illumination = mix(1.0, clamp(0.72 + sourceLuma * 0.56, 0.72, 1.28), uUseSourcePhoto);
        vec3 reflectedHighlight = max(sourceCenter - sourceLow, vec3(0.0)) * 0.18 * uUseSourcePhoto;
        float sheen = pow(max(0.0, 1.0 - distance(finishUv, uLight)), 8.0);
        vec4 maskSample = texture2D(uMask, vec2(imageUv.x, 1.0 - imageUv.y));
        float maskValue = mix(1.0, dot(maskSample.rgb, vec3(0.299, 0.587, 0.114)), uUseMask);
        float exclusionValue = texture2D(uExclusionMask, sourceUv).r;
        vec3 finishLit = finishCol * illumination + reflectedHighlight + finishCol * sheen * 0.12;
        gl_FragColor = vec4(finishLit, inside * uCompare * uReveal * maskValue * exclusionValue * uGeometryValid);
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }), [uniforms]);

  useEffect(() => {
    const quad = points.map(([x, y]) => ({ x, y })) as unknown as Quad;
    const matrix = tryCreateImageToFinishHomography(quad);
    if (matrix) {
      uniforms.uImageToFinish.value.set(...matrix);
      uniforms.uGeometryValid.value = 1;
    } else {
      uniforms.uGeometryValid.value = 0;
    }
    invalidate();
  }, [invalidate, points, uniforms]);

  useEffect(() => {
    ensureVisualizerGsap();
    const a = new THREE.Color(finish.colors[0]);
    const b = new THREE.Color(finish.colors[1]);
    const c = new THREE.Color(finish.colors[2]);
    uniforms.uPattern.value = PATTERN_CODE[finish.pattern];
    const tl = gsap.timeline({ onUpdate: invalidate });
    tl.fromTo(uniforms.uReveal, { value: 0.08 }, { value: 1, duration: 0.95, ease: 'alcove' });
    tl.to(uniforms.uDensity, { value: 96 / Math.max(0.4, finish.scale), duration: 0.7 }, 0);
    tl.to(uniforms.uA.value, { r: a.r, g: a.g, b: a.b, duration: 0.75 }, 0);
    tl.to(uniforms.uB.value, { r: b.r, g: b.g, b: b.b, duration: 0.75 }, 0);
    tl.to(uniforms.uC.value, { r: c.r, g: c.g, b: c.b, duration: 0.75 }, 0);
    return () => {
      tl.kill();
    };
  }, [finish, invalidate, uniforms]);

  useEffect(() => {
    uniforms.uCompare.value = compare / 100;
    invalidate();
  }, [compare, invalidate, uniforms]);

  useEffect(() => {
    let loaded: THREE.Texture | null = null;
    let disposed = false;
    uniforms.uUseMask.value = 0;
    uniforms.uMask.value = fallbackMask;
    if (maskUrl) {
      loaded = new THREE.TextureLoader().load(maskUrl, (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.NoColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        uniforms.uMask.value = texture;
        uniforms.uUseMask.value = 1;
        invalidate();
      }, undefined, () => {
        if (disposed) return;
        uniforms.uUseMask.value = 0;
        invalidate();
      });
    }
    invalidate();
    return () => {
      disposed = true;
      loaded?.dispose();
    };
  }, [fallbackMask, invalidate, maskUrl, uniforms]);

  useEffect(() => {
    let loaded: THREE.Texture | null = null;
    let disposed = false;
    uniforms.uUseSourcePhoto.value = 0;
    uniforms.uSourcePhoto.value = fallbackSource;
    loaded = new THREE.TextureLoader().load(photoUrl, (texture) => {
      if (disposed) {
        texture.dispose();
        return;
      }
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      uniforms.uSourcePhoto.value = texture;
      uniforms.uUseSourcePhoto.value = 1;
      invalidate();
    }, undefined, () => {
      if (disposed) return;
      uniforms.uUseSourcePhoto.value = 0;
      invalidate();
    });
    return () => {
      disposed = true;
      loaded?.dispose();
    };
  }, [fallbackSource, invalidate, photoUrl, uniforms]);

  useEffect(() => {
    const { canvas, texture } = exclusionLayer;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const strokes = exclusionMask?.photoRevision === photoRevision ? exclusionMask.strokes : [];
    for (const stroke of strokes) {
      const radius = stroke.radius * Math.min(canvas.width, canvas.height);
      context.strokeStyle = stroke.mode === 'erase' ? '#000000' : '#ffffff';
      context.fillStyle = context.strokeStyle;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      context.lineWidth = radius * 2;
      context.beginPath();
      const first = stroke.points[0];
      if (!first) continue;
      context.moveTo(first.x * canvas.width, first.y * canvas.height);
      for (const point of stroke.points.slice(1)) context.lineTo(point.x * canvas.width, point.y * canvas.height);
      context.stroke();
      context.beginPath();
      context.arc(first.x * canvas.width, first.y * canvas.height, radius, 0, Math.PI * 2);
      context.fill();
    }
    texture.needsUpdate = true;
    invalidate();
  }, [exclusionLayer, exclusionMask, invalidate, photoRevision]);

  useEffect(() => () => {
    material.dispose();
    fallbackMask.dispose();
    fallbackSource.dispose();
    exclusionLayer.texture.dispose();
  }, [exclusionLayer.texture, fallbackMask, fallbackSource, material]);

  return (
    <mesh position={[0.5, 0.5, 0]}>
      <planeGeometry args={[1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function Lights({ finish }: { finish: FinishPreset }) {
  const key = useRef<THREE.DirectionalLight>(null);
  const fill = useRef<THREE.DirectionalLight>(null);
  const { invalidate } = useThree();

  useEffect(() => {
    const host = document.querySelector<HTMLElement>('[data-finish-stage]');
    if (!host) return;
    const onLight = (event: Event) => {
      const detail = (event as CustomEvent<{ x: number; y: number }>).detail;
      if (!detail || !key.current) return;
      gsap.to(key.current.position, { x: (detail.x - 0.5) * 8, z: 4 - detail.y * 3, duration: 0.7, ease: 'power3.out', overwrite: true, onUpdate: invalidate });
    };
    host.addEventListener('finish-light', onLight);
    return () => {
      host.removeEventListener('finish-light', onLight);
      if (key.current) gsap.killTweensOf(key.current.position);
    };
  }, [invalidate]);

  useEffect(() => {
    if (!key.current) return;
    const tween = gsap.to(key.current, { intensity: finish.family === 'metallic' ? 5.4 : 3.2, duration: 0.8, onUpdate: invalidate });
    return () => { tween.kill(); };
  }, [finish, invalidate]);

  return (
    <>
      {/* The procedural environment now carries the ambient term, so the hemisphere fill is lower than it was. */}
      <hemisphereLight args={['#fff7ea', '#5b6a73', 0.45]} />
      <directionalLight ref={key} position={[3.4, 6.2, 4]} intensity={3.2} color="#fff3dc" />
      <directionalLight ref={fill} position={[-4, 2.5, -3]} intensity={1.1} color="#9ec7e0" />
    </>
  );
}

/** A code-built room environment through PMREM: reflections without a downloaded HDR. */
function AlcoveEnvironment() {
  const { gl, scene, invalidate } = useThree();
  useEffect(() => {
    let environment: { texture: THREE.Texture; dispose: () => void } | null = null;
    try {
      environment = createRoomEnvironment(gl);
      scene.environment = environment.texture;
      invalidate();
    } catch {
      // A renderer that cannot build a PMREM simply keeps the light rig.
      environment = null;
    }
    return () => {
      scene.environment = null;
      environment?.dispose();
    };
  }, [gl, invalidate, scene]);
  return null;
}

/**
 * The ornate shell: four fluted columns, three wall panels, an arch over the mouth, and
 * a contact gradient at every base. Vertex AO is baked into the geometry — no extra pass.
 */
function AlcoveArchitecture({ staggered }: { staggered: boolean }) {
  const { invalidate } = useThree();
  const group = useRef<THREE.Group>(null);
  const pending = useFirstFrameTimeline();
  const pillarGeometry = useMemo(() => createPillarGeometry(), []);
  const archGeometry = useMemo(() => createArchGeometry(PILLAR_X_BACK + 0.12), []);
  const backWall = useMemo(() => createWallGeometry(13, 6.4), []);
  const sideWall = useMemo(() => createWallGeometry(13.5, 6.4), []);
  const contact = useMemo(() => createContactTexture(), []);
  const stone = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#a8a190', roughness: 0.82, metalness: 0.03, vertexColors: true, envMapIntensity: 0.5,
  }), []);
  const plaster = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#968f7f', roughness: 0.96, metalness: 0, vertexColors: true, side: THREE.FrontSide, envMapIntensity: 0.38,
  }), []);

  useEffect(() => () => {
    pillarGeometry.dispose();
    archGeometry.dispose();
    backWall.dispose();
    sideWall.dispose();
    contact?.dispose();
    stone.dispose();
    plaster.dispose();
  }, [archGeometry, backWall, contact, pillarGeometry, plaster, sideWall, stone]);

  useEffect(() => {
    if (!staggered || !group.current) return;
    ensureVisualizerGsap();
    stone.transparent = true;
    plaster.transparent = true;
    const tl = gsap.timeline({
      paused: true,
      onUpdate: invalidate,
      onComplete: () => {
        stone.transparent = false;
        plaster.transparent = false;
        invalidate();
      },
    });
    tl.fromTo(group.current.position, { y: -0.55 }, { y: 0, duration: 0.8, ease: 'power3.out' }, 0);
    tl.fromTo([plaster, stone], { opacity: 0 }, { opacity: 1, duration: 0.7, stagger: 0.12, ease: 'power2.out' }, 0);
    pending.current = tl;
    invalidate();
    return () => {
      tl.kill();
      if (pending.current === tl) pending.current = null;
      stone.transparent = false;
      plaster.transparent = false;
    };
  }, [invalidate, pending, plaster, staggered, stone]);

  const pillars: Array<[number, number]> = [
    [-PILLAR_X_FRONT, PILLAR_Z_FRONT], [PILLAR_X_FRONT, PILLAR_Z_FRONT],
    [-PILLAR_X_BACK, PILLAR_Z_BACK], [PILLAR_X_BACK, PILLAR_Z_BACK],
  ];

  return (
    <group ref={group}>
      <mesh geometry={backWall} material={plaster} position={[0, 3.3, -5.9]} />
      <mesh geometry={sideWall} material={plaster} position={[-5.4, 3.3, -0.4]} rotation={[0, Math.PI / 2, 0]} />
      <mesh geometry={sideWall} material={plaster} position={[5.4, 3.3, -0.4]} rotation={[0, -Math.PI / 2, 0]} />
      {/* A flattened arch over the back pair: the alcove's mouth, not a half-round hoop. */}
      <mesh
        geometry={archGeometry}
        material={stone}
        position={[0, PILLAR_HEIGHT - 0.38, PILLAR_Z_BACK]}
      />
      {pillars.map(([x, z]) => (
        <group key={`${x}:${z}`} position={[x, 0, z]}>
          <mesh geometry={pillarGeometry} material={stone} />
          {contact ? (
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.014, 0]}>
              <planeGeometry args={[2.4, 2.4]} />
              <meshBasicMaterial map={contact} transparent depthWrite={false} opacity={0.92} />
            </mesh>
          ) : null}
        </group>
      ))}
    </group>
  );
}

/**
 * Drag to orbit the alcove. The sparkle field is offset from the camera angle and from
 * nothing else, so a still camera leaves a still floor.
 */
function AlcoveOrbit({ sparkleShift }: { sparkleShift: THREE.Vector2 }) {
  const { camera, gl, invalidate } = useThree();

  useEffect(() => {
    const element = gl.domElement;
    const stage = element.closest<HTMLElement>('[data-finish-stage]');
    const baseOffset = ALCOVE_HOME.clone().sub(ALCOVE_TARGET);
    const offset = new THREE.Vector3();
    let azimuth = 0;
    let elevation = 0;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let startAzimuth = 0;
    let startElevation = 0;
    let dragging = false;

    const apply = () => {
      offset.copy(baseOffset).applyAxisAngle(new THREE.Vector3(0, 1, 0), azimuth);
      offset.y = baseOffset.y + elevation * 2.4;
      camera.position.copy(ALCOVE_TARGET).add(offset);
      camera.lookAt(ALCOVE_TARGET);
      sparkleShift.set(azimuth * 0.85, elevation * 1.15);
      invalidate();
    };

    const down = (event: PointerEvent) => {
      if (event.button !== 0 && event.pointerType === 'mouse') return;
      pointerId = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startAzimuth = azimuth;
      startElevation = elevation;
      dragging = false;
    };
    const move = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      if (stage?.dataset.lens === 'on') return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) < 8) return;
      if (!dragging) {
        dragging = true;
        gsap.killTweensOf(camera.position);
        element.setPointerCapture(event.pointerId);
      }
      azimuth = Math.min(0.34, Math.max(-0.34, startAzimuth - dx * 0.0022));
      elevation = Math.min(0.12, Math.max(-0.1, startElevation + dy * 0.0011));
      apply();
    };
    const up = (event: PointerEvent) => {
      if (pointerId !== event.pointerId) return;
      if (dragging && element.hasPointerCapture(event.pointerId)) element.releasePointerCapture(event.pointerId);
      pointerId = null;
      dragging = false;
    };

    element.addEventListener('pointerdown', down);
    element.addEventListener('pointermove', move);
    element.addEventListener('pointerup', up);
    element.addEventListener('pointercancel', up);
    return () => {
      element.removeEventListener('pointerdown', down);
      element.removeEventListener('pointermove', move);
      element.removeEventListener('pointerup', up);
      element.removeEventListener('pointercancel', up);
      sparkleShift.set(0, 0);
    };
  }, [camera, gl, invalidate, sparkleShift]);

  return null;
}

function AlcoveWorld({
  finish,
  compare,
  entryFromFinishHall,
}: {
  finish: FinishPreset;
  compare: number;
  entryFromFinishHall: boolean;
}) {
  const { camera, invalidate } = useThree();
  const sparkleShift = useMemo(() => new THREE.Vector2(), []);
  const staggered = useMemo(
    () => typeof window !== 'undefined' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  useEffect(() => {
    if (!staggered) {
      camera.position.copy(ALCOVE_HOME);
      camera.lookAt(ALCOVE_TARGET);
      invalidate();
      return;
    }
    const tween = gsap.fromTo(
      camera.position,
      { x: ALCOVE_START.x, y: ALCOVE_START.y, z: ALCOVE_START.z },
      {
        x: ALCOVE_HOME.x,
        y: ALCOVE_HOME.y,
        z: ALCOVE_HOME.z,
        duration: 1.6,
        ease: 'alcove',
        onUpdate: () => {
          camera.lookAt(ALCOVE_TARGET);
          invalidate();
        },
      },
    );
    return () => { tween.kill(); };
  }, [camera, invalidate, staggered]);

  return (
    <>
      <color attach="background" args={['#d9d3c7']} />
      <fog attach="fog" args={['#d9d3c7', 20, 38]} />
      <AlcoveEnvironment />
      <Lights finish={finish} />
      <AlcoveArchitecture staggered={staggered} />
      <AlcoveOrbit sparkleShift={sparkleShift} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[26, 26]} />
        <meshStandardMaterial color="#a39b8d" roughness={1} envMapIntensity={0.4} />
      </mesh>
      <FloorSlab
        finish={finish}
        compare={compare}
        sparkleShift={sparkleShift}
        entryFromFinishHall={entryFromFinishHall}
        staggered={staggered}
      />
    </>
  );
}

function PhotoWorld({
  finish,
  points,
  compare,
  maskUrl,
  photoUrl,
  photoSize,
  photoRevision,
  exclusionMask,
}: {
  finish: FinishPreset;
  points: readonly Point[];
  compare: number;
  maskUrl: string | null;
  photoUrl: string;
  photoSize: Size;
  photoRevision: string;
  exclusionMask: ExclusionMaskDraft | null;
}) {
  return <PhotoQuad key={photoRevision} finish={finish} points={points} compare={compare} maskUrl={maskUrl} photoUrl={photoUrl} photoSize={photoSize} photoRevision={photoRevision} exclusionMask={exclusionMask} />;
}

function CameraMode({ photo }: { photo: boolean }) {
  const { invalidate } = useThree();
  useEffect(() => {
    invalidate();
  }, [invalidate, photo]);
  return (
    <>
      <PerspectiveCamera
        makeDefault={!photo}
        position={[ALCOVE_HOME.x, ALCOVE_HOME.y, ALCOVE_HOME.z]}
        fov={32}
        near={0.1}
        far={48}
        onUpdate={(camera) => camera.lookAt(ALCOVE_TARGET)}
      />
      <OrthographicCamera manual makeDefault={photo} position={[0.5, 0.5, 1]} left={-0.5} right={0.5} top={0.5} bottom={-0.5} near={0.1} far={10} onUpdate={(camera) => camera.lookAt(0.5, 0.5, 0)} />
    </>
  );
}

function RendererLifecycle({ onReady, onUnavailable }: { onReady: () => void; onUnavailable: () => void }) {
  const { gl } = useThree();

  useEffect(() => {
    const canvas = gl.domElement;
    const handleContextLost = (event: Event) => {
      event.preventDefault();
      onUnavailable();
    };
    canvas.addEventListener('webglcontextlost', handleContextLost);
    onReady();
    return () => canvas.removeEventListener('webglcontextlost', handleContextLost);
  }, [gl, onReady, onUnavailable]);

  return null;
}

export default function FinishPreview({
  finish,
  points,
  compare,
  photo,
  maskUrl = null,
  photoUrl,
  photoSize,
  photoRevision,
  exclusionMask,
  entryFromFinishHall = false,
  onReady,
  onUnavailable,
}: {
  finish: FinishPreset;
  points: readonly Point[];
  compare: number;
  photo: boolean;
  maskUrl?: string | null;
  photoUrl: string | null;
  photoSize: Size;
  photoRevision: string | null;
  exclusionMask: ExclusionMaskDraft | null;
  entryFromFinishHall?: boolean;
  onReady: () => void;
  onUnavailable: () => void;
}) {
  ensureVisualizerGsap();
  return (
    <Canvas
      className="finish-preview-canvas"
      frameloop="demand"
      dpr={[1, 1.35]}
      camera={{ position: [ALCOVE_HOME.x, ALCOVE_HOME.y, ALCOVE_HOME.z], fov: 32, near: 0.1, far: 48 }}
      // The lens and "Save this floor" read this canvas back on demand.
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      onCreated={({ camera, gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        camera.lookAt(ALCOVE_TARGET);
      }}
    >
      <RendererLifecycle onReady={onReady} onUnavailable={onUnavailable} />
      <CameraMode photo={photo} />
      {photo && photoUrl && photoRevision
        ? <PhotoWorld finish={finish} points={points} compare={compare} maskUrl={maskUrl} photoUrl={photoUrl} photoSize={photoSize} photoRevision={photoRevision} exclusionMask={exclusionMask} />
        : <AlcoveWorld finish={finish} compare={compare} entryFromFinishHall={entryFromFinishHall} />}
    </Canvas>
  );
}
