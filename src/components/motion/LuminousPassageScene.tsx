import { useEffect, useMemo, useRef, useState } from 'react';
import { useGLTF, useProgress } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import {
  oculusStartFrame,
  sampleHallTransition,
  sampleWalkChapter,
  toThreeCoordinates,
  type PassageKeyframe,
  type PassageQuality,
  type WalkChapter,
} from '../../lib/motion/passage';

interface PassageManifest {
  cameraHandoff: {
    durationSeconds: number;
    verticalFovDegrees: number;
    keyframes: PassageKeyframe[];
  };
}

const LOW_CHUNKS = [
  '/3d/luminous-passage-entry.glb',
  '/3d/luminous-passage-gallery.glb',
  '/3d/luminous-passage-court.glb',
] as const;

const HIGH_CHUNKS = [
  ...LOW_CHUNKS,
  '/3d/luminous-passage-finish-alcove.glb',
  '/3d/luminous-passage-material-library.glb',
] as const;

const LIGHTS: Record<WalkChapter, { hemi: number; sun: number; cool: number; sunColor: string; coolColor: string; fov: number }> = {
  oculus: { hemi: 2.8, sun: 5.6, cool: 1.5, sunColor: '#fff6e4', coolColor: '#9ad0ee', fov: 38.7 },
  threshold: { hemi: 1.5, sun: 2.8, cool: 0.5, sunColor: '#e8d2b0', coolColor: '#6d7c88', fov: 30 },
  workshop: { hemi: 2.4, sun: 6.4, cool: 2.1, sunColor: '#ffe7c2', coolColor: '#7ec4ea', fov: 44 },
  'same-arch': { hemi: 2.2, sun: 3.6, cool: 1.2, sunColor: '#fff3dc', coolColor: '#8bb8d0', fov: 34 },
  grind: { hemi: 2.0, sun: 3.2, cool: 1.8, sunColor: '#fffaf0', coolColor: '#c9d8e0', fov: 36 },
};

const ROOM_FOG: Record<WalkChapter, string> = {
  oculus: '#f7f3e9',
  threshold: '#e4ddd2',
  workshop: '#10283a',
  'same-arch': '#fbfaf5',
  grind: '#ded8cc',
};

function readWalkState(): {
  chapter: WalkChapter;
  progress: number;
  live: boolean;
  mode: 'room' | 'hall';
  from: WalkChapter;
  to: WalkChapter;
  blend: number;
} {
  const host = document.querySelector<HTMLElement>('.passage-host');
  const chapter = (host?.dataset.passageChapter as WalkChapter | undefined) ?? 'oculus';
  const progress = Number(host?.dataset.passageProgress ?? 0);
  const blend = Number(host?.dataset.passageBlend ?? 0);
  return {
    chapter,
    progress: Number.isFinite(progress) ? progress : 0,
    live: host?.dataset.passageLive === 'true',
    mode: host?.dataset.passageMode === 'hall' ? 'hall' : 'room',
    from: (host?.dataset.passageFrom as WalkChapter | undefined) ?? chapter,
    to: (host?.dataset.passageTo as WalkChapter | undefined) ?? chapter,
    blend: Number.isFinite(blend) ? blend : 0,
  };
}

function enhanceFloors(root: THREE.Object3D) {
  root.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const name = mesh.name.toLowerCase();
    const isFloor = /floor|slab|epoxy|ground|deck/.test(name);
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach((material, index) => {
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      if (!isFloor && material.roughness > 0.45) return;
      const physical = new THREE.MeshPhysicalMaterial({
        color: material.color,
        map: material.map,
        normalMap: material.normalMap,
        roughnessMap: material.roughnessMap,
        metalnessMap: material.metalnessMap,
        bumpMap: material.bumpMap,
        aoMap: material.aoMap,
        aoMapIntensity: material.aoMapIntensity,
        emissive: material.emissive,
        emissiveMap: material.emissiveMap,
        emissiveIntensity: material.emissiveIntensity,
        metalness: material.metalness,
        roughness: isFloor ? 0.09 : Math.min(material.roughness, 0.55),
        envMap: material.envMap,
        envMapIntensity: isFloor ? 1.8 : 1.05,
        transparent: material.transparent,
        opacity: material.opacity,
        side: material.side,
        vertexColors: material.vertexColors,
        clearcoat: isFloor ? 1 : 0.45,
        clearcoatRoughness: isFloor ? 0.045 : 0.22,
      });
      if (Array.isArray(mesh.material)) mesh.material[index] = physical;
      else mesh.material = physical;
    });
  });
}

function PassageModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    enhanceFloors(clone);
    return clone;
  }, [scene]);
  return <primitive object={model} />;
}

function ChapterLights({ quality }: { quality: Exclude<PassageQuality, 'still'> }) {
  const hemi = useRef<THREE.HemisphereLight>(null);
  const sun = useRef<THREE.DirectionalLight>(null);
  const cool = useRef<THREE.DirectionalLight>(null);
  const sunColor = useMemo(() => new THREE.Color('#fff5dd'), []);
  const coolColor = useMemo(() => new THREE.Color('#8cc9e8'), []);

  useFrame((_, delta) => {
    const { chapter } = readWalkState();
    const next = LIGHTS[chapter] ?? LIGHTS.oculus;
    const scale = quality === 'high' ? 1 : 0.82;
    const settle = 1 - Math.exp(-delta * 1.45);
    if (hemi.current) hemi.current.intensity += (next.hemi * scale - hemi.current.intensity) * settle;
    if (sun.current) {
      sun.current.intensity += (next.sun * scale - sun.current.intensity) * settle;
      sun.current.color.lerp(sunColor.set(next.sunColor), settle);
    }
    if (cool.current) {
      cool.current.intensity += (next.cool * scale - cool.current.intensity) * settle;
      cool.current.color.lerp(coolColor.set(next.coolColor), settle);
    }
  });

  return (
    <>
      <hemisphereLight ref={hemi} args={['#fffdf5', '#557084', 2.4]} />
      <directionalLight ref={sun} position={[8, 14, 3]} intensity={5.2} color="#fff5dd" />
      <directionalLight ref={cool} position={[-6, 5, -16]} intensity={1.5} color="#8cc9e8" />
    </>
  );
}

function RoomAtmosphere() {
  const { scene } = useThree();
  const color = useMemo(() => new THREE.Color('#f7f3e9'), []);
  const target = useMemo(() => new THREE.Color('#f7f3e9'), []);

  useFrame((_, delta) => {
    const { chapter } = readWalkState();
    target.set(ROOM_FOG[chapter] ?? ROOM_FOG.oculus);
    const settle = 1 - Math.exp(-delta * 1.35);
    color.lerp(target, settle);
    if (scene.background instanceof THREE.Color) scene.background.copy(color);
    else scene.background = color.clone();
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(color);
      const near = chapter === 'workshop' ? 18 : 22;
      const far = chapter === 'workshop' ? 78 : 96;
      scene.fog.near += (near - scene.fog.near) * settle;
      scene.fog.far += (far - scene.fog.far) * settle;
    }
  });

  return null;
}

function Dust({ enabled }: { enabled: boolean }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const count = 420;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      arr[i * 3] = (Math.random() - 0.5) * 10;
      arr[i * 3 + 1] = Math.random() * 5.5;
      arr[i * 3 + 2] = -Math.random() * 52;
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (!points.current) return;
    points.current.rotation.y = state.clock.elapsedTime * 0.018;
    points.current.position.y = Math.sin(state.clock.elapsedTime * 0.22) * 0.12;
  });

  if (!enabled) return null;
  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial color="#fff4dc" size={0.038} transparent opacity={0.42} depthWrite={false} sizeAttenuation />
    </points>
  );
}

function CameraJourney({ manifest }: { manifest: PassageManifest }) {
  const { camera, invalidate, setFrameloop } = useThree();
  const target = useMemo(() => new THREE.Vector3(), []);
  const desiredPosition = useMemo(() => new THREE.Vector3(), []);
  const desiredTarget = useMemo(() => new THREE.Vector3(), []);
  const firstLive = useRef(true);

  useEffect(() => {
    const apply = () => {
      const { live } = readWalkState();
      setFrameloop(live ? 'always' : 'never');
      if (live) invalidate();
    };
    apply();
    const host = document.querySelector('.passage-host');
    if (!host) return;
    const observer = new MutationObserver(apply);
    observer.observe(host, {
      attributes: true,
      attributeFilter: ['data-passage-live', 'data-passage-chapter', 'data-passage-progress', 'data-passage-mode', 'data-passage-blend', 'data-passage-from', 'data-passage-to'],
    });
    return () => observer.disconnect();
  }, [invalidate, setFrameloop]);

  useFrame((_, delta) => {
    const { chapter, progress, live, mode, from, to, blend } = readWalkState();
    if (!live) {
      firstLive.current = true;
      setFrameloop('never');
      return;
    }
    const frame = mode === 'hall'
      ? sampleHallTransition(manifest.cameraHandoff.keyframes, from, to, blend)
      : sampleWalkChapter(manifest.cameraHandoff.keyframes, chapter, progress);
    desiredPosition.fromArray(toThreeCoordinates(frame.position));
    desiredTarget.fromArray(toThreeCoordinates(frame.target));
    const gait = mode === 'hall' ? blend : Math.max(0, (progress - 0.1) / 0.9);
    desiredPosition.y += Math.sin(gait * Math.PI * 8) * 0.045;
    desiredPosition.x += Math.sin(gait * Math.PI * 3.2) * 0.06;
    const specX = Number.parseFloat(document.documentElement.style.getPropertyValue('--spec-x') || '50') / 100 - 0.5;
    const specY = Number.parseFloat(document.documentElement.style.getPropertyValue('--spec-y') || '50') / 100 - 0.5;
    desiredPosition.x += (Number.isFinite(specX) ? specX : 0) * 0.22;
    desiredPosition.y += (Number.isFinite(specY) ? specY : 0) * -0.1;
    if (firstLive.current) {
      camera.position.copy(desiredPosition);
      target.copy(desiredTarget);
      camera.lookAt(target);
      firstLive.current = false;
      return;
    }
    const move = 1 - Math.exp(-delta * 4.4);
    const look = 1 - Math.exp(-delta * 1.35);
    camera.position.lerp(desiredPosition, move);
    target.lerp(desiredTarget, look);
    camera.lookAt(target);
    const perspective = camera as THREE.PerspectiveCamera;
    const fov = LIGHTS[chapter]?.fov ?? 38;
    if (typeof perspective.fov === 'number') {
      perspective.fov += (fov - perspective.fov) * (1 - Math.exp(-delta * 2.2));
      perspective.updateProjectionMatrix();
    }
  });

  return null;
}

function ProofPanels({ enabled }: { enabled: boolean }) {
  const material = useMemo(() => {
    if (!enabled) return null;
    const loader = new THREE.TextureLoader();
    const before = loader.load('/images/projects/generated/jpeg/img_3300.jpg');
    const after = loader.load('/images/projects/generated/jpeg/img_3313.jpg');
    before.colorSpace = THREE.SRGBColorSpace;
    after.colorSpace = THREE.SRGBColorSpace;
    return new THREE.ShaderMaterial({
      uniforms: {
        tBefore: { value: before },
        tAfter: { value: after },
        uWipe: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `uniform sampler2D tBefore; uniform sampler2D tAfter; uniform float uWipe; varying vec2 vUv; void main(){ vec4 a=texture2D(tBefore,vUv); vec4 b=texture2D(tAfter,vUv); gl_FragColor=mix(a,b,smoothstep(uWipe-0.04,uWipe+0.04,vUv.x)); }`,
    });
  }, [enabled]);

  useFrame(() => {
    if (!material) return;
    const host = document.querySelector<HTMLElement>('[data-project-comparison]');
    const reveal = Number.parseFloat(host?.style.getPropertyValue('--reveal') || '50') / 100;
    material.uniforms.uWipe.value = Number.isFinite(reveal) ? reveal : 0.5;
  });

  if (!enabled || !material) return null;
  return (
    <mesh position={[2.4, 1.6, -27]} rotation={[0, -0.4, 0]}>
      <planeGeometry args={[2.8, 3.6]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function ReadyGate({ onReady }: { onReady: () => void }) {
  const { active, loaded, total } = useProgress();
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    if (total > 0 && loaded >= total && !active) {
      called.current = true;
      onReady();
    }
  }, [active, loaded, onReady, total]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (called.current) return;
      called.current = true;
      onReady();
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [onReady]);

  return null;
}

function PassageWorld({
  manifest,
  quality,
  onReady,
}: {
  manifest: PassageManifest;
  quality: Exclude<PassageQuality, 'still'>;
  onReady: () => void;
}) {
  const chunks = quality === 'high' ? HIGH_CHUNKS : LOW_CHUNKS;

  useEffect(() => {
    chunks.forEach((url) => useGLTF.preload(url));
  }, [chunks]);

  return (
    <>
      <color attach="background" args={['#f7f3e9']} />
      <fog attach="fog" args={['#f7f3e9', 22, 92]} />
      <ChapterLights quality={quality} />
      <RoomAtmosphere />
      {chunks.map((url) => (
        <PassageModel key={url} url={url} />
      ))}
      <Dust enabled={quality === 'high'} />
      <ProofPanels enabled={quality === 'high'} />
      <CameraJourney manifest={manifest} />
      <ReadyGate onReady={onReady} />
    </>
  );
}

export default function LuminousPassageScene({
  quality,
  onReady,
}: {
  quality: Exclude<PassageQuality, 'still'>;
  onReady: () => void;
}) {
  const passageManifest = usePassageManifest();
  if (!passageManifest) return null;

  const firstFrame = oculusStartFrame(passageManifest.cameraHandoff.keyframes);
  const startPosition = toThreeCoordinates(firstFrame.position);
  const startTarget = toThreeCoordinates(firstFrame.target);
  return (
    <Canvas
      frameloop="never"
      camera={{
        position: startPosition,
        fov: passageManifest.cameraHandoff.verticalFovDegrees,
        near: 0.08,
        far: 100,
      }}
      dpr={quality === 'high' ? [1, 1.35] : [1, 1.1]}
      gl={{ antialias: quality === 'high', alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl, camera }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.08;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        camera.lookAt(startTarget[0], startTarget[1], startTarget[2]);
      }}
    >
      <PassageWorld manifest={passageManifest} quality={quality} onReady={onReady} />
    </Canvas>
  );
}

function usePassageManifest(): PassageManifest | null {
  const [manifest, setManifest] = useState<PassageManifest | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/3d/luminous-passage.manifest.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('Passage manifest unavailable.');
        return response.json() as Promise<PassageManifest>;
      })
      .then(setManifest)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return manifest;
}

LOW_CHUNKS.forEach((url) => useGLTF.preload(url));
