import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

/** Soft displacement dissolve. Default --floor-warp: 0 (luma only). Cap 0.08 if re-enabled. */
const FRAG = /* glsl */ `
uniform sampler2D tBefore;
uniform sampler2D tAfter;
uniform float uProgress;
uniform float uWarp;
varying vec2 vUv;

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main() {
  float p = clamp(uProgress, 0.0, 1.0);
  float warpAmp = clamp(uWarp, 0.0, 1.0) * 0.08;

  vec4 baseA = texture2D(tBefore, vUv);
  vec4 baseB = texture2D(tAfter, vUv);
  float la = luma(baseA.rgb);
  float lb = luma(baseB.rgb);
  float lm = mix(la, lb, p);

  // Peak displacement mid-blend so endpoints stay signed stills at 100%.
  float mid = 1.0 - abs(p * 2.0 - 1.0);
  vec2 offset = vec2(lm - 0.5, la - lb) * warpAmp * mid;

  vec4 sa = texture2D(tBefore, clamp(vUv + offset, 0.0, 1.0));
  vec4 sb = texture2D(tAfter, clamp(vUv - offset, 0.0, 1.0));

  // Luma-weighted mix (not a flat wipe / not a hard luma threshold).
  float w = clamp(p + (lm - 0.5) * 0.35 * mid + (la - lb) * 0.12, 0.0, 1.0);
  gl_FragColor = mix(sa, sb, w);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function MixMesh({
  beforeUrl,
  afterUrl,
  host,
  active,
}: {
  beforeUrl: string;
  afterUrl: string;
  host: HTMLElement;
  active: boolean;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const texturesRef = useRef<THREE.Texture[]>([]);
  const last = useRef({ progress: -1, warp: -1 });

  const material = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const tBefore = loader.load(beforeUrl, () => invalidate());
    const tAfter = loader.load(afterUrl, () => invalidate());
    for (const t of [tBefore, tAfter]) {
      t.colorSpace = THREE.SRGBColorSpace;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = false;
    }
    texturesRef.current = [tBefore, tAfter];
    return new THREE.ShaderMaterial({
      uniforms: {
        tBefore: { value: tBefore },
        tAfter: { value: tAfter },
        uProgress: { value: 0 },
        uWarp: { value: 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
  }, [beforeUrl, afterUrl, invalidate]);

  useEffect(() => {
    return () => {
      material.dispose();
      for (const t of texturesRef.current) t.dispose();
      texturesRef.current = [];
    };
  }, [material]);

  useFrame(() => {
    if (!active) return;
    const style = getComputedStyle(host);
    const progress = Math.min(1, Math.max(0, parseFloat(style.getPropertyValue('--reveal')) / 100 || 0));
    const warpRaw = parseFloat(style.getPropertyValue('--floor-warp'));
    const warp = Number.isFinite(warpRaw) ? Math.min(1, Math.max(0, warpRaw)) : 0;
    if (progress === last.current.progress && warp === last.current.warp) return;
    last.current = { progress, warp };
    material.uniforms.uProgress.value = progress;
    material.uniforms.uWarp.value = warp;
    invalidate();
  });

  return (
    <mesh material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

export default function FloorMix({ beforeUrl, afterUrl }: { beforeUrl: string; afterUrl: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduceOrCoarse = window.matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches;
    if (reduceOrCoarse) {
      setAllowed(false);
      return;
    }
    setAllowed(true);

    const el = wrap.current?.closest('[data-project-comparison]') as HTMLElement | null;
    setHost(el);
    if (el) {
      el.dataset.floorMix = 'on';
      if (!el.style.getPropertyValue('--floor-warp')) {
        el.style.setProperty('--floor-warp', '0');
      }
    }

    const node = wrap.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        setActive(Boolean(entry?.isIntersecting));
      },
      { rootMargin: '20% 0px', threshold: 0.01 },
    );
    io.observe(node);
    return () => {
      io.disconnect();
      if (el) delete el.dataset.floorMix;
    };
  }, []);

  // Always keep host wrapper mounted so refs/IO work; skip WebGL on phones / reduced motion.
  return (
    <div ref={wrap} className="floor-mix" aria-hidden="true">
      {allowed && host ? (
        <Canvas
          orthographic
          camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
          dpr={[1, 1.5]}
          frameloop={active ? 'demand' : 'never'}
          gl={{
            alpha: false,
            antialias: false,
            powerPreference: 'high-performance',
          }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
          }}
        >
          <MixMesh beforeUrl={beforeUrl} afterUrl={afterUrl} host={host} active={active} />
        </Canvas>
      ) : null}
    </div>
  );
}