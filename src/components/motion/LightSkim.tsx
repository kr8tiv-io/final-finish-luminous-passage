import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

/** Sheen is off pending stable WebGL - file kept unreferenced (stills-only). */
/**
 * Desktop chapter light-skim (01/02/04): locked orthographic plane, texture = signed still.
 * Soft specular sheen follows scroll (uniform, not displacement). Still-match gate: first
 * WebGL frame must match the HTML still or deliberately no-mount. Canvas never LCP.
 */

const FRAG = /* glsl */ `
uniform sampler2D tStill;
uniform float uSkim;
uniform vec2 uLight;
varying vec2 vUv;

void main() {
  vec4 base = texture2D(tStill, vUv);
  float skim = clamp(uSkim, 0.0, 1.0);
  vec2 d = vUv - uLight;
  d.x *= 1.55;
  float sheen = exp(-dot(d, d) * 7.5) * skim * 0.16;
  float bandY = mix(0.78, 0.32, skim);
  float band = 1.0 - smoothstep(0.0, 0.22, abs(vUv.y - bandY));
  band *= smoothstep(0.02, 0.18, skim) * 0.07;
  gl_FragColor = vec4(base.rgb + sheen + band, 1.0);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

function cinemaEase(t: number) {
  // power2.inOut — cinema, no bounce
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function applyCover(texture: THREE.Texture, frameW: number, frameH: number) {
  const img = texture.image as { width: number; height: number } | undefined;
  if (!img?.width || !img?.height || !frameW || !frameH) return;
  const imageAspect = img.width / img.height;
  const frameAspect = frameW / frameH;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.repeat.set(1, 1);
  texture.offset.set(0, 0);
  if (frameAspect > imageAspect) {
    const repeatY = imageAspect / frameAspect;
    texture.repeat.set(1, repeatY);
    texture.offset.set(0, (1 - repeatY) / 2);
  } else {
    const repeatX = frameAspect / imageAspect;
    texture.repeat.set(repeatX, 1);
    texture.offset.set((1 - repeatX) / 2, 0);
  }
  texture.needsUpdate = true;
}

function sampleHtmlCover(
  img: HTMLImageElement,
  w: number,
  h: number,
  points: Array<[number, number]>,
): Array<[number, number, number]> {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  const ir = img.naturalWidth / img.naturalHeight;
  const fr = w / h;
  let dw = w;
  let dh = h;
  let dx = 0;
  let dy = 0;
  if (fr > ir) {
    dh = w / ir;
    dy = (h - dh) / 2;
  } else {
    dw = h * ir;
    dx = (w - dw) / 2;
  }
  ctx.drawImage(img, dx, dy, dw, dh);
  return points.map(([x, y]) => {
    // 3x3 average to damp single-texel filter noise
    let r = 0;
    let g = 0;
    let b = 0;
    let n = 0;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const px = Math.min(w - 1, Math.max(0, x + ox));
        const py = Math.min(h - 1, Math.max(0, y + oy));
        const d = ctx.getImageData(px, py, 1, 1).data;
        r += d[0];
        g += d[1];
        b += d[2];
        n++;
      }
    }
    return [r / n, g / n, b / n] as [number, number, number];
  });
}

function SkimMesh({
  imageUrl,
  chapterEl,
  active,
  onMatch,
}: {
  imageUrl: string;
  chapterEl: HTMLElement;
  active: boolean;
  onMatch: (ok: boolean) => void;
}) {
  const { gl, invalidate, size } = useThree();
  const matched = useRef(false);
  const failed = useRef(false);
  const probing = useRef(false);
  const lastSkim = useRef(-1);
  const textureRef = useRef<THREE.Texture | null>(null);
  const materialRef = useRef<THREE.ShaderMaterial | null>(null);
  const jpegRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      jpegRef.current = img;
      invalidate();
    };
    img.src = imageUrl;
    return () => {
      jpegRef.current = null;
    };
  }, [imageUrl, invalidate]);

  const material = useMemo(() => {
    const loader = new THREE.TextureLoader();
    const texture = loader.load(imageUrl, () => {
      applyCover(texture, size.width, size.height);
      invalidate();
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    textureRef.current = texture;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        tStill: { value: texture },
        uSkim: { value: 0 },
        uLight: { value: new THREE.Vector2(0.5, 0.55) },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    materialRef.current = mat;
    return mat;
  }, [imageUrl, invalidate]); // size applied via effect

  useEffect(() => {
    return () => {
      material.dispose();
      textureRef.current?.dispose();
      textureRef.current = null;
      materialRef.current = null;
    };
  }, [material]);

  useEffect(() => {
    if (textureRef.current) {
      applyCover(textureRef.current, size.width, size.height);
      invalidate();
    }
  }, [size.width, size.height, invalidate]);

  // Priority 1 = after render so readPixels sees the frame.
  useFrame(() => {
    if (!active || failed.current || !materialRef.current) return;
    const mat = materialRef.current;
    const tex = textureRef.current;

    if (!matched.current) {
      mat.uniforms.uSkim.value = 0;
      const image = tex?.image as { width?: number } | undefined;
      if (!image?.width || probing.current) {
        invalidate();
        return;
      }
      const w = gl.domElement.width;
      const h = gl.domElement.height;
      if (w < 16 || h < 16) {
        invalidate();
        return;
      }
      const img = jpegRef.current;
      if (!img || !img.complete || img.naturalWidth < 8) {
        invalidate();
        return;
      }
      probing.current = true;
      const pts: Array<[number, number]> = [
        [Math.floor(w * 0.5), Math.floor(h * 0.5)],
        [Math.floor(w * 0.28), Math.floor(h * 0.4)],
        [Math.floor(w * 0.72), Math.floor(h * 0.62)],
        [Math.floor(w * 0.45), Math.floor(h * 0.78)],
      ];
      // Same JPEG as TextureLoader — proves plane matches the signed still asset.
      const htmlSamples = sampleHtmlCover(img, w, h, pts);
      if (htmlSamples.length !== pts.length) {
        failed.current = true;
        onMatch(false);
        return;
      }
      const ctx = gl.getContext() as WebGLRenderingContext;
      const pixel = new Uint8Array(4 * 9);
      let maxDelta = 0;
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const px = Math.min(w - 1, Math.max(0, x + ox));
            const py = Math.min(h - 1, Math.max(0, y + oy));
            const glY = h - 1 - py;
            ctx.readPixels(px, glY, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
            r += pixel[0];
            g += pixel[1];
            b += pixel[2];
            n++;
          }
        }
        const html = htmlSamples[i];
        maxDelta = Math.max(
          maxDelta,
          Math.abs(r / n - html[0]),
          Math.abs(g / n - html[1]),
          Math.abs(b / n - html[2]),
        );
      }
      // Strict still-match — if GPU/cover cannot match HTML still, no-mount.
      if (maxDelta > 14) {
        failed.current = true;
        onMatch(false);
        return;
      }
      matched.current = true;
      onMatch(true);
      lastSkim.current = -1;
      return;
    }

    const rect = chapterEl.getBoundingClientRect();
    const vh = window.innerHeight || 1;
    const raw = 1 - Math.min(1, Math.max(0, rect.top / vh));
    const skim = cinemaEase(Math.min(1, Math.max(0, raw)));
    if (skim === lastSkim.current) return;
    lastSkim.current = skim;
    mat.uniforms.uSkim.value = skim;
    mat.uniforms.uLight.value.set(0.35 + skim * 0.3, 0.72 - skim * 0.38);
    invalidate();
  }, 1);

  return (
    <mesh material={material}>
      <planeGeometry args={[2, 2]} />
    </mesh>
  );
}

export default function LightSkim({
  imageUrl,
  chapter,
}: {
  imageUrl: string;
  chapter: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [chapterEl, setChapterEl] = useState<HTMLElement | null>(null);
  const [active, setActive] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [matched, setMatched] = useState(false);
  const [dead, setDead] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const blocked = window.matchMedia(
      '(prefers-reduced-motion: reduce), (pointer: coarse), (max-width: 900px)',
    ).matches;
    if (blocked) {
      setAllowed(false);
      return;
    }
    // Defer past LCP — HTML still remains LCP; canvas mounts idle.
    const start = () => setAllowed(true);
    let idle = 0;
    let timeout: ReturnType<typeof setTimeout> | 0 = 0;
    if (typeof window.requestIdleCallback === 'function') {
      idle = window.requestIdleCallback(start, { timeout: 2200 });
    } else {
      timeout = globalThis.setTimeout(start, 450);
    }
    return () => {
      if (idle && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
      if (timeout) globalThis.clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!allowed || dead) return;
    const chapterNode = wrap.current?.closest('.journey-chapter') as HTMLElement | null;
    setChapterEl(chapterNode);
    const node = wrap.current;
    if (!node) return;
    const io = new IntersectionObserver(
      ([entry]) => setActive(Boolean(entry?.isIntersecting)),
      { rootMargin: '20% 0px', threshold: 0.01 },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [allowed, dead]);

  const onMatch = (ok: boolean) => {
    const pic = wrap.current?.closest('picture');
    if (!ok) {
      setDead(true);
      setMatched(false);
      if (pic) delete pic.dataset.lightSkim;
      return;
    }
    setMatched(true);
    if (pic) pic.dataset.lightSkim = 'on';
  };

  if (dead) {
    return <div ref={wrap} className="light-skim light-skim--off" data-chapter={chapter} aria-hidden="true" />;
  }

  return (
    <div ref={wrap} className="light-skim" data-chapter={chapter} aria-hidden="true">
      {allowed && chapterEl ? (
        <Canvas
          orthographic
          camera={{ position: [0, 0, 1], near: 0.1, far: 10 }}
          dpr={[1, 1.25]}
          frameloop={active || !matched ? 'demand' : 'never'}
          gl={{
            alpha: false,
            antialias: false,
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true,
          }}
          style={{ opacity: matched ? 1 : 0, pointerEvents: 'none' }}
          onCreated={({ gl }) => {
            gl.outputColorSpace = THREE.SRGBColorSpace;
            // Kick one frame for still-match probe
            gl.domElement.setAttribute('data-light-skim-canvas', chapter);
          }}
        >
          <SkimMesh imageUrl={imageUrl} chapterEl={chapterEl} active={active || !matched} onMatch={onMatch} />
        </Canvas>
      ) : null}
    </div>
  );
}