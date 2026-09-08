import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { CHAPTER_ORDER } from '../../lib/motion/passage';

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D tFrom;
uniform sampler2D tTo;
uniform float uProgress;
uniform float uTime;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p *= 2.07;
    a *= 0.5;
  }
  return v;
}

void main() {
  float p = clamp(uProgress, 0.0, 1.0);
  vec4 from = texture2D(tFrom, vUv);
  vec4 to = texture2D(tTo, vUv);
  float luma = dot(from.rgb, vec3(0.299, 0.587, 0.114));
  float n = fbm(vUv * 3.2 + vec2(uTime * 0.02, p * 0.35));
  float edge = smoothstep(p - 0.18, p + 0.22, n * 0.55 + luma * 0.25);
  vec3 color = mix(from.rgb, to.rgb, edge);
  float alpha = sin(p * 3.14159265) * 0.92;
  gl_FragColor = vec4(color, alpha);
}
`;

type Plate = {
  video: HTMLVideoElement | null;
  image: HTMLImageElement | null;
};

function readPlates(): Plate[] {
  return CHAPTER_ORDER.map((key) => {
    const chapter = document.querySelector<HTMLElement>(`[data-journey-chapter="${key}"]`);
    if (!chapter) return { video: null, image: null };
    const video = chapter.querySelector<HTMLVideoElement>('.pour-film, .floor-film-video');
    const image =
      chapter.querySelector<HTMLImageElement>('.floor-film-poster, .pour-poster') ??
      chapter.querySelector<HTMLImageElement>('picture img, img');
    return { video, image };
  });
}

function bindPlate(plate: Plate, fallback: THREE.Texture, invalidate: () => void): THREE.Texture {
  if (plate.video) {
    const texture = new THREE.VideoTexture(plate.video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }
  if (plate.image?.currentSrc || plate.image?.src) {
    const texture = new THREE.TextureLoader().load(plate.image.currentSrc || plate.image.src, () => invalidate());
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return texture;
  }
  return fallback;
}

function MixMesh({ active }: { active: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  const fallback = useMemo(() => {
    const texture = new THREE.Texture();
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
  const texturesRef = useRef<THREE.Texture[]>([]);
  const last = useRef({ progress: -1, from: -1, to: -1 });

  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      uniforms: {
        tFrom: { value: fallback },
        tTo: { value: fallback },
        uProgress: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
  }, [fallback]);

  useEffect(() => {
    const plates = readPlates();
    const textures = plates.map((plate) => bindPlate(plate, fallback, invalidate));
    texturesRef.current = textures;
    material.uniforms.tFrom.value = textures[0] ?? fallback;
    material.uniforms.tTo.value = textures[1] ?? textures[0] ?? fallback;
    invalidate();
    return () => {
      for (const texture of textures) {
        if (texture !== fallback) texture.dispose();
      }
      texturesRef.current = [];
    };
  }, [fallback, invalidate, material]);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    if (!active) return;
    const journey = document.querySelector<HTMLElement>('.journey');
    if (!journey) return;
    const style = getComputedStyle(journey);
    const progress = Math.min(1, Math.max(0, parseFloat(style.getPropertyValue('--dissolve')) || 0));
    const from = Math.min(texturesRef.current.length - 1, Math.max(0, Number.parseInt(style.getPropertyValue('--dissolve-from'), 10) || 0));
    const to = Math.min(texturesRef.current.length - 1, Math.max(0, Number.parseInt(style.getPropertyValue('--dissolve-to'), 10) || 0));
    const fromTex = texturesRef.current[from] ?? fallback;
    const toTex = texturesRef.current[to] ?? fromTex;
    if (material.uniforms.tFrom.value !== fromTex) material.uniforms.tFrom.value = fromTex;
    if (material.uniforms.tTo.value !== toTex) material.uniforms.tTo.value = toTex;
    material.uniforms.uProgress.value = progress;
    material.uniforms.uTime.value = clock.elapsedTime;
    if (progress !== last.current.progress || from !== last.current.from || to !== last.current.to || progress > 0.02) {
      last.current = { progress, from, to };
      invalidate();
    }
  });

  return (
    <mesh material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

function CraftDrift({ active }: { active: boolean }) {
  const group = useRef<THREE.Group>(null);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const loader = new SVGLoader();
    let disposed = false;
    const meshes: THREE.Mesh[] = [];
    loader.load('/images/brand/craft-marks.svg', (data) => {
      if (disposed || !group.current) return;
      const ink = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--cobalt').trim() || '#164f83');
      data.paths.slice(0, 6).forEach((path, index) => {
        const shapes = SVGLoader.createShapes(path);
        shapes.forEach((shape) => {
          const geometry = new THREE.ShapeGeometry(shape);
          geometry.center();
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshBasicMaterial({
              color: ink,
              transparent: true,
              opacity: 0.22,
              side: THREE.DoubleSide,
              depthWrite: false,
            }),
          );
          mesh.scale.setScalar(0.0028);
          mesh.position.set((index % 3) * 1.15 - 1.15, Math.floor(index / 3) * 0.7 - 0.2, 0);
          meshes.push(mesh);
          group.current?.add(mesh);
        });
      });
      invalidate();
    });
    return () => {
      disposed = true;
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    };
  }, [invalidate]);

  useFrame(({ clock }) => {
    if (!active || !group.current) return;
    const journey = document.querySelector<HTMLElement>('.journey');
    const progress = Math.min(1, Math.max(0, parseFloat(getComputedStyle(journey ?? document.documentElement).getPropertyValue('--dissolve')) || 0));
    const t = clock.elapsedTime;
    group.current.rotation.z = Math.sin(t * 0.07) * 0.08;
    group.current.position.y = Math.sin(t * 0.11) * 0.04;
    group.current.visible = progress > 0.04 && progress < 0.96;
    group.current.children.forEach((child, index) => {
      child.rotation.z = t * 0.04 * (index % 2 === 0 ? 1 : -1);
      const material = (child as THREE.Mesh).material as THREE.MeshBasicMaterial;
      material.opacity = 0.08 + Math.sin(progress * Math.PI) * 0.18;
    });
    if (progress > 0.02) invalidate();
  });

  return <group ref={group} />;
}

export default function FilmVeil() {
  const [active, setActive] = useState(true);

  useEffect(() => {
    const journey = document.querySelector('.journey');
    if (!journey) return;
    const io = new IntersectionObserver(([entry]) => setActive(Boolean(entry?.isIntersecting)), { threshold: 0.01 });
    io.observe(journey);
    return () => io.disconnect();
  }, []);

  return (
    <Canvas
      orthographic
      camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
      dpr={[1, 1.5]}
      frameloop={active ? 'always' : 'never'}
      gl={{
        alpha: true,
        antialias: false,
        powerPreference: 'high-performance',
      }}
      onCreated={({ gl }) => {
        gl.setClearColor(0x000000, 0);
        gl.outputColorSpace = THREE.SRGBColorSpace;
      }}
    >
      <MixMesh active={active} />
      <CraftDrift active={active} />
    </Canvas>
  );
}
