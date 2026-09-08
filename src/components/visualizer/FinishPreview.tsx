import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import gsap from 'gsap';
import { PATTERN_CODE, type FinishPreset } from '../../lib/visualizer/finishes';
import { ensureVisualizerGsap } from '../../lib/visualizer/motion';

type Point = readonly [number, number];

const FLAKE_CHUNK = /* glsl */ `
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform float uDensity;
uniform float uPattern;
uniform float uReveal;
uniform vec2 uLight;
varying vec2 vFinishUv;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.07;
    a *= 0.5;
  }
  return v;
}
vec3 flakeField(vec2 uv, float density, float sizeMul) {
  vec2 gid = floor(uv * density);
  vec2 f = fract(uv * density) - 0.5;
  float n = hash21(gid);
  float n2 = hash21(gid + 19.7);
  float size = (0.16 + n * 0.38) * sizeMul;
  float chip = smoothstep(size, size * 0.35, length(f * vec2(1.0, 1.2 + n2 * 0.4)));
  vec3 col = n < 0.34 ? uA : n < 0.64 ? uB : uC;
  col += vec3(pow(n2, 11.0) * 0.65);
  return mix(mix(uA, uB, 0.2) * 0.82, col, chip);
}
vec3 marble(vec2 uv) {
  vec2 p = uv * vec2(3.4, 2.3);
  p += vec2(fbm(p * 1.5), fbm(p * 1.5 + 5.1)) * 0.9;
  float vein = abs(sin(p.x * 2.6 + fbm(p * 3.2) * 5.0));
  vein = pow(1.0 - vein, 9.0);
  float flow = fbm(uv * 4.2);
  vec3 col = mix(uA, uB, flow);
  col = mix(col, uC, vein);
  col += uC * vein * 0.45;
  return col;
}
vec3 ocean(vec2 uv) {
  float w1 = fbm(uv * 3.1);
  float w2 = fbm(uv * 6.0 + 3.4);
  float wave = sin(uv.x * 8.0 + uv.y * 2.4 + w1 * 7.0);
  vec3 col = mix(uA, uB, 0.35 + 0.5 * w1);
  col = mix(col, uC, smoothstep(0.2, 0.9, wave * 0.5 + 0.5) * 0.55);
  col += uC * pow(max(wave, 0.0), 10.0) * 0.45;
  col += vec3(pow(w2, 8.0) * 0.2);
  return col;
}
vec3 lava(vec2 uv) {
  float n = fbm(uv * 3.2);
  float vein = pow(fbm(uv * 6.4 + n), 2.8);
  vec3 col = mix(uA, uB, n);
  col = mix(col, uC, smoothstep(0.4, 0.82, vein));
  col += uC * pow(vein, 5.0) * 0.9;
  return col;
}
vec3 galaxy(vec2 uv) {
  float n = fbm(uv * 2.8);
  float neb = fbm(uv * 5.6 + 9.0);
  vec3 col = mix(uA, uB, n);
  col = mix(col, uC, pow(neb, 2.0) * 0.7);
  float star = hash21(floor(uv * 110.0));
  col += vec3(pow(star, 16.0));
  return col;
}
vec3 pearl(vec2 uv) {
  float n = fbm(uv * 2.4);
  vec3 col = mix(uA, uB, n);
  float shift = 0.5 + 0.5 * sin(n * 14.0 + uLight.x * 9.0);
  col = mix(col, uC, shift * 0.4);
  col += vec3(0.2, 0.18, 0.22) * pow(max(0.0, 1.0 - distance(uv, uLight)), 6.0);
  return col;
}
vec3 copperVein(vec2 uv) {
  float n = fbm(uv * 3.0);
  vec2 p = uv * vec2(2.8, 2.0) + n;
  float vein = pow(1.0 - abs(sin(p.x * 3.4 + fbm(p * 2.6) * 4.0)), 10.0);
  vec3 col = mix(uA, uB, n * 0.35);
  col = mix(col, uC, vein);
  col += uC * vein * 0.55;
  return col;
}
vec3 finishSample(vec2 uv) {
  if (uPattern > 8.5) return copperVein(uv);
  if (uPattern > 7.5) return pearl(uv);
  if (uPattern > 6.5) return galaxy(uv);
  if (uPattern > 5.5) return lava(uv);
  if (uPattern > 4.5) return ocean(uv);
  if (uPattern > 3.5) return marble(uv);
  if (uPattern > 2.5) {
    float n = fbm(uv * 18.0);
    return mix(uA, mix(uB, uC, uv.y), 0.22 + n * 0.12);
  }
  if (uPattern > 1.5) return flakeField(uv, uDensity * 1.6, 0.72);
  if (uPattern > 0.5) return flakeField(uv, uDensity * 0.55, 1.35);
  return flakeField(uv, uDensity, 1.0);
}
`;

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
      `#include <common>\n${FLAKE_CHUNK}`,
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
  const uniforms = useMemo(() => ({
    uA: { value: new THREE.Color(finish.colors[0]) },
    uB: { value: new THREE.Color(finish.colors[1]) },
    uC: { value: new THREE.Color(finish.colors[2]) },
    uDensity: { value: 18 / Math.max(0.4, finish.scale) },
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
      gsap.to(uniforms.uLight.value, { x: detail.x, y: 1 - detail.y, duration: 0.55, ease: 'power3.out' });
    };
    host.addEventListener('finish-light', onLight);
    return () => host.removeEventListener('finish-light', onLight);
  }, [uniforms]);

  return { material, uniforms };
}

function FloorSlab({ finish, compare }: { finish: FinishPreset; compare: number }) {
  const { material, uniforms } = useFinishMaterial(finish);
  const mesh = useRef<THREE.Mesh>(null);
  const { invalidate } = useThree();

  useEffect(() => {
    ensureVisualizerGsap();
    const a = new THREE.Color(finish.colors[0]);
    const b = new THREE.Color(finish.colors[1]);
    const c = new THREE.Color(finish.colors[2]);
    const tl = gsap.timeline({ onUpdate: invalidate });
    tl.fromTo(uniforms.uReveal, { value: 0.12 }, { value: 1, duration: 0.9, ease: 'alcove' }, 0);
    tl.to(uniforms.uDensity, { value: 18 / Math.max(0.4, finish.scale), duration: 0.8, ease: 'power2.out' }, 0);
    tl.to(uniforms.uPattern, { value: PATTERN_CODE[finish.pattern], duration: 0.45 }, 0);
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

  useFrame((_, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.z += delta * 0.015;
    material.opacity = compare / 100;
    material.transparent = compare < 100;
  });

  return (
    <mesh ref={mesh} rotation={[-Math.PI / 2.08, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <planeGeometry args={[6.4, 6.4, 1, 1]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function PhotoQuad({
  finish,
  points,
  compare,
}: {
  finish: FinishPreset;
  points: readonly Point[];
  compare: number;
}) {
  const { material, uniforms } = useFinishMaterial(finish);
  const { invalidate } = useThree();
  const geometry = useMemo(() => new THREE.BufferGeometry(), []);

  useEffect(() => {
    const verts: number[] = [];
    const uvs: number[] = [0, 1, 1, 1, 1, 0, 0, 0];
    const corners = [points[0], points[1], points[2], points[3]];
    corners.forEach(([x, y]) => {
      verts.push(x / 100, 1 - y / 100, 0);
    });
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    invalidate();
  }, [geometry, invalidate, points]);

  useEffect(() => {
    ensureVisualizerGsap();
    const a = new THREE.Color(finish.colors[0]);
    const b = new THREE.Color(finish.colors[1]);
    const c = new THREE.Color(finish.colors[2]);
    const tl = gsap.timeline({ onUpdate: invalidate });
    tl.fromTo(uniforms.uReveal, { value: 0.08 }, { value: 1, duration: 0.95, ease: 'alcove' });
    tl.to(uniforms.uPattern, { value: PATTERN_CODE[finish.pattern], duration: 0.4 }, 0);
    tl.to(uniforms.uDensity, { value: 22 / Math.max(0.4, finish.scale), duration: 0.7 }, 0);
    tl.to(uniforms.uA.value, { r: a.r, g: a.g, b: a.b, duration: 0.75 }, 0);
    tl.to(uniforms.uB.value, { r: b.r, g: b.g, b: b.b, duration: 0.75 }, 0);
    tl.to(uniforms.uC.value, { r: c.r, g: c.g, b: c.b, duration: 0.75 }, 0);
    tl.to(material, { roughness: finish.roughness, metalness: finish.family === 'metallic' ? 0.72 : 0.05, duration: 0.8 }, 0);
    return () => {
      tl.kill();
    };
  }, [finish, invalidate, material, uniforms]);

  useFrame(() => {
    material.opacity = compare / 100;
    material.transparent = true;
    material.depthWrite = false;
  });

  return (
    <mesh geometry={geometry}>
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
      gsap.to(key.current.position, { x: (detail.x - 0.5) * 8, z: 4 - detail.y * 3, duration: 0.7, ease: 'power3.out', onUpdate: invalidate });
    };
    host.addEventListener('finish-light', onLight);
    return () => host.removeEventListener('finish-light', onLight);
  }, [invalidate]);

  useEffect(() => {
    if (!key.current) return;
    gsap.to(key.current, { intensity: finish.family === 'metallic' ? 5.4 : 3.2, duration: 0.8, onUpdate: invalidate });
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
    gsap.fromTo(camera.position, { x: 0, y: 3.6, z: 7.2 }, { x: 0.15, y: 2.35, z: 4.6, duration: 1.6, ease: 'alcove', onUpdate: () => {
      camera.lookAt(0, 0, 0);
      invalidate();
    } });
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

function LockPhotoCamera() {
  const { camera } = useThree();
  useFrame(() => {
    const ortho = camera as THREE.OrthographicCamera;
    ortho.left = 0;
    ortho.right = 1;
    ortho.top = 1;
    ortho.bottom = 0;
    ortho.near = 0.1;
    ortho.far = 10;
    ortho.position.set(0, 0, 1);
    ortho.lookAt(0.5, 0.5, 0);
    ortho.updateProjectionMatrix();
  });
  return null;
}

function PhotoWorld({
  finish,
  points,
  compare,
}: {
  finish: FinishPreset;
  points: readonly Point[];
  compare: number;
}) {
  return (
    <>
      <LockPhotoCamera />
      <Lights finish={finish} />
      <PhotoQuad finish={finish} points={points} compare={compare} />
    </>
  );
}

function Ticker() {
  const { invalidate } = useThree();
  useEffect(() => {
    const tick = () => invalidate();
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [invalidate]);
  return null;
}

export default function FinishPreview({
  finish,
  points,
  compare,
  photo,
}: {
  finish: FinishPreset;
  points: readonly Point[];
  compare: number;
  photo: boolean;
}) {
  ensureVisualizerGsap();
  return (
    <Canvas
      className="finish-preview-canvas"
      frameloop="demand"
      dpr={[1, 1.35]}
      camera={photo
        ? { position: [0, 0, 1], near: 0.1, far: 10 }
        : { position: [0.15, 2.35, 4.6], fov: 32, near: 0.1, far: 40 }}
      orthographic={photo}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      onCreated={({ camera, gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        if (photo) {
          const ortho = camera as THREE.OrthographicCamera;
          ortho.left = 0;
          ortho.right = 1;
          ortho.top = 1;
          ortho.bottom = 0;
          ortho.position.set(0, 0, 1);
          ortho.lookAt(0.5, 0.5, 0);
          ortho.updateProjectionMatrix();
        } else {
          camera.lookAt(0, 0, 0);
        }
      }}
    >
      <Ticker />
      {photo ? <PhotoWorld finish={finish} points={points} compare={compare} /> : <AlcoveWorld finish={finish} compare={compare} />}
    </Canvas>
  );
}
