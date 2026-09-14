import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import gsap from 'gsap';
import { PATTERN_CODE, type FinishPreset } from '../../lib/visualizer/finishes';
import { FINISH_SHADER_CHUNK, tryCreateImageToFinishHomography } from '../../lib/visualizer/finish-shader';
import type { Quad } from '../../lib/visualizer/homography';
import { ensureVisualizerGsap } from '../../lib/visualizer/motion';
import type { ExclusionMaskDraft } from '../../lib/visualizer/exclusion-mask';
import type { Size } from '../../lib/visualizer/image-geometry';

type Point = readonly [number, number];

function patchFinishMaterial(material: THREE.MeshPhysicalMaterial, uniforms: {
  uA: { value: THREE.Color };
  uB: { value: THREE.Color };
  uC: { value: THREE.Color };
  uDensity: { value: number };
  uPattern: { value: number };
  uReveal: { value: number };
  uLight: { value: THREE.Vector2 };
}) {
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
      `#include <common>\n${FINISH_SHADER_CHUNK}\nvarying vec2 vFinishUv;`,
    ).replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      vec3 finishCol = finishSample(vFinishUv);
      float sheenDot = pow(max(0.0, 1.0 - distance(vFinishUv, uLight)), 8.0);
      diffuseColor.rgb = mix(diffuseColor.rgb, finishCol, uReveal);
      diffuseColor.rgb += finishCol * sheenDot * 0.38 * uReveal;
      `,
    );
  };
  material.customProgramCacheKey = () => 'ffe-finish-preview';
}

function useFinishMaterial(finish: FinishPreset) {
  const { invalidate } = useThree();
  const uniforms = useMemo(() => ({
    uA: { value: new THREE.Color(finish.colors[0]) },
    uB: { value: new THREE.Color(finish.colors[1]) },
    uC: { value: new THREE.Color(finish.colors[2]) },
    uDensity: { value: 72 / Math.max(0.4, finish.scale) },
    uPattern: { value: PATTERN_CODE[finish.pattern] },
    uReveal: { value: 1 },
    uLight: { value: new THREE.Vector2(0.32, 0.28) },
  }), []);

  const material = useMemo(() => {
    const next = new THREE.MeshPhysicalMaterial({
      color: '#d8d1c3',
      roughness: finish.roughness,
      metalness: finish.family === 'metallic' ? 0.72 : 0.04,
      clearcoat: 1,
      clearcoatRoughness: finish.family === 'metallic' ? 0.06 : 0.1,
      envMapIntensity: finish.family === 'metallic' ? 2.1 : 1.2,
    });
    patchFinishMaterial(next, uniforms);
    return next;
  }, [uniforms]);

  useEffect(() => () => material.dispose(), [material]);

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

function FloorSlab({ finish, compare }: { finish: FinishPreset; compare: number }) {
  const { material, uniforms } = useFinishMaterial(finish);
  const { invalidate } = useThree();

  useEffect(() => {
    ensureVisualizerGsap();
    const a = new THREE.Color(finish.colors[0]);
    const b = new THREE.Color(finish.colors[1]);
    const c = new THREE.Color(finish.colors[2]);
    uniforms.uPattern.value = PATTERN_CODE[finish.pattern];
    const tl = gsap.timeline({ onUpdate: invalidate });
    tl.fromTo(uniforms.uReveal, { value: 0.12 }, { value: 1, duration: 0.9, ease: 'alcove' }, 0);
    tl.to(uniforms.uDensity, { value: 72 / Math.max(0.4, finish.scale), duration: 0.8, ease: 'power2.out' }, 0);
    tl.to(material, {
      roughness: finish.roughness,
      metalness: finish.family === 'metallic' ? 0.72 : 0.04,
      clearcoat: 1,
      duration: 0.85,
      ease: 'power3.inOut',
    }, 0);
    tl.to(uniforms.uA.value, { r: a.r, g: a.g, b: a.b, duration: 0.8 }, 0);
    tl.to(uniforms.uB.value, { r: b.r, g: b.g, b: b.b, duration: 0.8 }, 0);
    tl.to(uniforms.uC.value, { r: c.r, g: c.g, b: c.b, duration: 0.8 }, 0);
    return () => {
      tl.kill();
    };
  }, [finish, invalidate, material, uniforms]);

  useEffect(() => {
    material.opacity = compare / 100;
    material.transparent = compare < 100;
    invalidate();
  }, [compare, invalidate, material]);

  return (
    <mesh rotation={[-Math.PI / 2.08, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[6.4, 6.4, 1, 1]} />
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
      <hemisphereLight args={['#fff7ea', '#5b6a73', 1.4]} />
      <directionalLight ref={key} position={[3.4, 6.2, 4]} intensity={3.2} color="#fff3dc" />
      <directionalLight ref={fill} position={[-4, 2.5, -3]} intensity={1.1} color="#9ec7e0" />
    </>
  );
}

function AlcoveWorld({ finish, compare }: { finish: FinishPreset; compare: number }) {
  const { camera, invalidate } = useThree();

  useEffect(() => {
    const tween = gsap.fromTo(camera.position, { x: 0, y: 3.6, z: 7.2 }, { x: 0.15, y: 2.35, z: 4.6, duration: 1.6, ease: 'alcove', onUpdate: () => {
      camera.lookAt(0, 0, 0);
      invalidate();
    } });
    return () => { tween.kill(); };
  }, [camera, invalidate]);

  return (
    <>
      <color attach="background" args={['#d9d3c7']} />
      <fog attach="fog" args={['#d9d3c7', 8, 16]} />
      <Lights finish={finish} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[18, 18]} />
        <meshStandardMaterial color="#c9c2b6" roughness={1} />
      </mesh>
      <FloorSlab finish={finish} compare={compare} />
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
      <PerspectiveCamera makeDefault={!photo} position={[0.15, 2.35, 4.6]} fov={32} near={0.1} far={40} onUpdate={(camera) => camera.lookAt(0, 0, 0)} />
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
  onReady: () => void;
  onUnavailable: () => void;
}) {
  ensureVisualizerGsap();
  return (
    <Canvas
      className="finish-preview-canvas"
      frameloop="demand"
      dpr={[1, 1.35]}
      camera={{ position: [0.15, 2.35, 4.6], fov: 32, near: 0.1, far: 40 }}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ camera, gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        camera.lookAt(0, 0, 0);
      }}
    >
      <RendererLifecycle onReady={onReady} onUnavailable={onUnavailable} />
      <CameraMode photo={photo} />
      {photo && photoUrl && photoRevision
        ? <PhotoWorld finish={finish} points={points} compare={compare} maskUrl={maskUrl} photoUrl={photoUrl} photoSize={photoSize} photoRevision={photoRevision} exclusionMask={exclusionMask} />
        : <AlcoveWorld finish={finish} compare={compare} />}
    </Canvas>
  );
}
