/**
 * "Grind. Repair. Build." in three dimensions (2026-09-22, Matt: "more lifelike ...
 * without losing any of the features", "use open source glb models for the layer
 * animation if it helps").
 *
 * The same seven layers, the same order, the same scroll behaviour as the drawing it
 * sits over (preparation-layers.ts): one scrubbed clock per layer with a different lag,
 * so the stack moves as one body when you scroll slowly and opens up when you scroll
 * fast. What changes is the material: a concrete slab with real texture on every face,
 * the grinder's arcs coming up on its top, a crack that draws itself and is filled, an
 * amber primer you can see through, a satin charcoal base coat, eleven hundred flake
 * chips that fall and settle onto it, and a clear coat that is actually glass
 * (MeshPhysicalMaterial transmission), all lit by a room environment with soft shadows.
 * Point at a plate and it lifts clear of the stack; its caption answers.
 *
 * Geometry is built here in code — no downloaded models — and the surfaces are the
 * site's own rendered textures (scripts/build-textures.mjs). The SVG drawing stays as
 * the server-rendered picture and the fallback: this canvas mounts only on the `full`
 * tier with a fine pointer and WebGL, and hides the drawing once its first frame is up.
 *
 * @motion layered-scrub
 */
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

type LayerId = 'slab' | 'grind' | 'repair' | 'primer' | 'base' | 'flakes' | 'topcoat';

/** The drawing's clocks (preparation-layers.ts): order, lag, start offset, span. */
const LAYERS: readonly { id: LayerId; scrub: number }[] = [
  { id: 'slab', scrub: 1 },
  { id: 'grind', scrub: 1.6 },
  { id: 'repair', scrub: 2 },
  { id: 'primer', scrub: 2.4 },
  { id: 'base', scrub: 2.8 },
  { id: 'flakes', scrub: 3.2 },
  { id: 'topcoat', scrub: 3.6 },
];
const STEP = 0.07;
const SPAN = 2.8;
const DURATION = 1.25;

/* World units. The stack is exploded at rest, as the drawing is. */
const W = 4.2;
const D = 2.4;
const SLAB_H = 0.62;
const PRIMER_Y = 1.02;
const PRIMER_H = 0.06;
const BASE_Y = 1.42;
const BASE_H = 0.14;
const TOP_Y = 1.98;
const TOP_H = 0.12;
const CHIPS = 1100;
/** Where each layer arrives from (lower left, as in the drawing), in world units. */
const ENTRY = { x: -0.7, y: -0.95 };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - (1 - t) ** 3;

type Clock = Record<LayerId, { t: number }>;

function useTexture(name: string, repeat: [number, number], invalidate: () => void) {
  return useMemo(() => {
    const texture = new THREE.TextureLoader().load(`/images/brand/texture/${name}.webp`, invalidate);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
    texture.anisotropy = 8;
    return texture;
  }, [name, repeat[0], repeat[1], invalidate]);
}

/** A soft round shadow for under the slab (no second render pass). */
function useShadowTexture() {
  return useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    gradient.addColorStop(0, 'rgba(23,34,42,0.55)');
    gradient.addColorStop(0.55, 'rgba(23,34,42,0.18)');
    gradient.addColorStop(1, 'rgba(23,34,42,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);
}

function Stack({ clock, focus, onFocus, onReady }: {
  clock: Clock;
  focus: LayerId | null;
  onFocus: (id: LayerId | null) => void;
  onReady: () => void;
}) {
  const { gl, scene, invalidate } = useThree();
  const root = useRef<THREE.Group>(null);
  const groups = useRef<Partial<Record<LayerId, THREE.Group>>>({});
  const chips = useRef<THREE.InstancedMesh>(null);
  const lift = useRef<Record<LayerId, number>>({ slab: 0, grind: 0, repair: 0, primer: 0, base: 0, flakes: 0, topcoat: 0 });
  const dim = useRef<Record<LayerId, number>>({ slab: 1, grind: 1, repair: 1, primer: 1, base: 1, flakes: 1, topcoat: 1 });
  const readyOnce = useRef(false);

  // The room the materials reflect.
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    gl.localClippingEnabled = true;
    invalidate();
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene, invalidate]);

  const slabTop = useTexture('prep-slab', [1, D / W], invalidate);
  const slabFront = useTexture('prep-slab', [1, SLAB_H / W], invalidate);
  const slabSide = useTexture('prep-slab', [D / W, SLAB_H / W], invalidate);
  const ground = useTexture('prep-ground', [1, D / W], invalidate);
  const crack = useTexture('prep-crack-decal', [1, 1], invalidate);
  const shadowTexture = useShadowTexture();

  const geometry = useMemo(() => ({
    slab: new RoundedBoxGeometry(W, SLAB_H, D, 3, 0.035),
    primer: new RoundedBoxGeometry(W, PRIMER_H, D, 2, 0.02),
    base: new RoundedBoxGeometry(W, BASE_H, D, 2, 0.028),
    top: new RoundedBoxGeometry(W, TOP_H, D, 3, 0.035),
    overlay: new THREE.PlaneGeometry(W - 0.07, D - 0.07).rotateX(-Math.PI / 2),
    crack: new THREE.PlaneGeometry(W * 0.86, D * 0.86).rotateX(-Math.PI / 2),
    // Sized to fade out inside the frame: at W x 1.9 its tail ran past the canvas and
    // stopped at the canvas edge as a faint grey box (laptop capture, 2026-09-22).
    shadow: new THREE.PlaneGeometry(W * 1.35, D * 1.6).rotateX(-Math.PI / 2),
    chip: (() => {
      const shape = new THREE.Shape();
      const sides = 6;
      for (let i = 0; i < sides; i += 1) {
        const angle = (i / sides) * Math.PI * 2;
        const radius = 0.75 + ((i * 37) % 11) / 40;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius * 0.8;
        if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
      }
      return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    })(),
  }), []);

  const material = useMemo(() => {
    const concrete = (map: THREE.Texture, shade: string) => new THREE.MeshStandardMaterial({ map, color: shade, roughness: 0.9, metalness: 0, transparent: true });
    return {
      // BoxGeometry face order: +x, -x, +y, -y, +z, -z.
      slab: [
        concrete(slabSide, '#aaa59c'),
        concrete(slabSide, '#aaa59c'),
        concrete(slabTop, '#ffffff'),
        new THREE.MeshStandardMaterial({ color: '#6f6a62', roughness: 1, transparent: true }),
        concrete(slabFront, '#c4bfb6'),
        concrete(slabFront, '#c4bfb6'),
      ],
      ground: new THREE.MeshStandardMaterial({ map: ground, roughness: 0.82, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 }),
      crack: new THREE.MeshStandardMaterial({
        map: crack,
        roughness: 0.75,
        transparent: true,
        alphaTest: 0.04,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        clippingPlanes: [new THREE.Plane(new THREE.Vector3(-1, 0, 0), -W)],
      }),
      primer: Object.assign(new THREE.MeshPhysicalMaterial({ color: '#c99d5c', roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.1, transparent: true, depthWrite: false }), { userData: { baseOpacity: 0.78 } }),
      base: new THREE.MeshStandardMaterial({ color: '#4a5257', roughness: 0.4, metalness: 0.04, transparent: true }),
      chip: new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.02, side: THREE.DoubleSide, transparent: true }),
      // The clear coat: a sheet of glassy resin you can see the broadcast through
      // (plain alpha, which reads clearer than transmission at this grazing angle and
      // costs no second render pass), its bevels and top catching the room's light.
      top: Object.assign(new THREE.MeshPhysicalMaterial({
        color: '#eef6fa',
        roughness: 0.04,
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        specularIntensity: 0.9,
        envMapIntensity: 1.1,
        transparent: true,
        depthWrite: false,
      }), { userData: { baseOpacity: 0.26 } }),
      shadow: new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }),
    };
  }, [slabTop, slabFront, slabSide, ground, crack, shadowTexture]);

  // The broadcast: each chip's rest place, size, colour, and when it falls.
  const chipData = useMemo(() => {
    const tones = ['#2b3135', '#4d565b', '#7d858a', '#b8bcb9', '#f2f0ea', '#9f8b72'].map((c) => new THREE.Color(c));
    const weights = [0.18, 0.2, 0.2, 0.16, 0.18, 0.08];
    let seed = 0x5eed10c;
    const random = () => {
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return Array.from({ length: CHIPS }, () => {
      let r = random();
      let tone = tones[0];
      for (let i = 0; i < tones.length; i += 1) { r -= weights[i]; if (r <= 0) { tone = tones[i]; break; } }
      return {
        x: (random() - 0.5) * (W - 0.12),
        z: (random() - 0.5) * (D - 0.12),
        size: 0.018 + random() ** 2.2 * 0.05,
        turn: random() * Math.PI * 2,
        tilt: (random() - 0.5) * 0.3,
        fall: 0.45 + random() * 0.9,
        drift: (random() - 0.5) * 0.4,
        delay: random() * 0.55,
        tone,
      };
    });
  }, []);

  useEffect(() => {
    const mesh = chips.current;
    if (!mesh) return;
    chipData.forEach((chip, i) => mesh.setColorAt(i, chip.tone));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [chipData]);

  const matrix = useMemo(() => new THREE.Matrix4(), []);
  const quaternion = useMemo(() => new THREE.Quaternion(), []);
  const euler = useMemo(() => new THREE.Euler(), []);
  const position = useMemo(() => new THREE.Vector3(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const crackPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), []);
  const materialsOf = useMemo(() => new Map<LayerId, THREE.Material[]>(), []);

  const progressOf = (id: LayerId) => {
    const index = LAYERS.findIndex((layer) => layer.id === id);
    return clamp01((clock[id].t - index * STEP) / DURATION);
  };

  useFrame((_, delta) => {
    let moving = false;
    const damp = 1 - Math.exp(-delta * 9);

    LAYERS.forEach(({ id }) => {
      const group = groups.current[id];
      if (!group) return;
      const p = easeOut(progressOf(id));
      const targetLift = focus === id ? 0.16 : 0;
      const targetDim = focus === null || focus === id ? 1 : 0.32;
      lift.current[id] += (targetLift - lift.current[id]) * damp;
      dim.current[id] += (targetDim - dim.current[id]) * damp;
      if (Math.abs(targetLift - lift.current[id]) > 0.001 || Math.abs(targetDim - dim.current[id]) > 0.002) moving = true;
      group.position.set(ENTRY.x * (1 - p), ENTRY.y * (1 - p) + lift.current[id], 0);
      let mats = materialsOf.get(id);
      if (!mats) {
        mats = [];
        group.traverse((object) => {
          const m = (object as THREE.Mesh).material;
          if (!m) return;
          (Array.isArray(m) ? m : [m]).forEach((each) => { if (each !== material.shadow) mats!.push(each); });
        });
        materialsOf.set(id, mats);
      }
      const opacity = Math.min(1, p * 1.4) * dim.current[id];
      mats.forEach((m) => { m.opacity = ((m.userData.baseOpacity as number | undefined) ?? 1) * opacity; });
    });

    // The grinder's arcs come up on the slab; the crack draws itself across it.
    material.ground.opacity *= easeOut(progressOf('grind'));
    const reveal = -W / 2 + W * easeOut(clamp01((progressOf('repair') - 0.15) / 0.85));
    if (root.current) {
      crackPlane.set(new THREE.Vector3(-1, 0, 0), reveal).applyMatrix4(root.current.matrixWorld);
      material.crack.clippingPlanes = [crackPlane];
    }

    // The broadcast: chips fall into the wet base, each on its own beat.
    const mesh = chips.current;
    if (mesh) {
      const pf = progressOf('flakes');
      const restY = BASE_Y + BASE_H + 0.004;
      chipData.forEach((chip, i) => {
        const local = clamp01((pf - chip.delay) / 0.42);
        const e = easeOut(local);
        const s = chip.size * Math.min(1, local * 5);
        position.set(chip.x + chip.drift * (1 - e), restY + chip.fall * (1 - e), chip.z);
        euler.set(chip.tilt * (1 - e), chip.turn + (1 - e) * 3, 0);
        quaternion.setFromEuler(euler);
        scale.set(s, s, s);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(i, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    // The whole stack turns a little toward you as it assembles.
    if (root.current) {
      const whole = progressOf('slab');
      root.current.rotation.y = -0.62 + whole * 0.34;
    }

    if (moving) invalidate();
    if (!readyOnce.current) {
      readyOnce.current = true;
      onReady();
    }
  });

  const hover = (id: LayerId) => ({
    onPointerOver: (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onFocus(id); },
  });

  return (
    <group ref={root} position={[0, -1.1, 0]} scale={0.9}>
      <mesh geometry={geometry.shadow} material={material.shadow} position={[0.2, -0.004, 0.25]} />

      <group ref={(g) => { if (g) groups.current.slab = g; }} {...hover('slab')}>
        <mesh geometry={geometry.slab} material={material.slab} position={[0, SLAB_H / 2, 0]} castShadow receiveShadow />
      </group>
      <group ref={(g) => { if (g) groups.current.grind = g; }} {...hover('grind')}>
        <mesh geometry={geometry.overlay} material={material.ground} position={[0, SLAB_H + 0.002, 0]} receiveShadow />
      </group>
      <group ref={(g) => { if (g) groups.current.repair = g; }} {...hover('repair')}>
        <mesh geometry={geometry.crack} material={material.crack} position={[0, SLAB_H + 0.004, 0]} receiveShadow />
      </group>
      <group ref={(g) => { if (g) groups.current.primer = g; }} {...hover('primer')}>
        <mesh geometry={geometry.primer} material={material.primer} position={[0, PRIMER_Y + PRIMER_H / 2, 0]} castShadow receiveShadow />
      </group>
      <group ref={(g) => { if (g) groups.current.base = g; }} {...hover('base')}>
        <mesh geometry={geometry.base} material={material.base} position={[0, BASE_Y + BASE_H / 2, 0]} castShadow receiveShadow />
      </group>
      <group ref={(g) => { if (g) groups.current.flakes = g; }} {...hover('flakes')}>
        <instancedMesh ref={chips} args={[geometry.chip, material.chip, CHIPS]} castShadow receiveShadow />
      </group>
      <group ref={(g) => { if (g) groups.current.topcoat = g; }} {...hover('topcoat')}>
        <mesh geometry={geometry.top} material={material.top} position={[0, TOP_Y + TOP_H / 2, 0]} castShadow />
      </group>
    </group>
  );
}

/** Mount gate: only where it will run well and add something. */
function admitted() {
  if (typeof window === 'undefined') return false;
  const html = document.documentElement;
  if (html.dataset.journeyTier === 'still' || html.dataset.journeyTier === 'balanced') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (!window.matchMedia('(pointer: fine)').matches) return false;
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

export default function PrepLayers3D() {
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [focus, setFocus] = useState<LayerId | null>(null);
  const invalidateRef = useRef<() => void>(() => {});
  const clock = useMemo<Clock>(() => ({
    slab: { t: 0 }, grind: { t: 0 }, repair: { t: 0 }, primer: { t: 0 }, base: { t: 0 }, flakes: { t: 0 }, topcoat: { t: 0 },
  }), []);

  useEffect(() => { setLive(admitted()); }, []);

  // One scrubbed clock per layer, each with its own lag — the drawing's timelines.
  useEffect(() => {
    if (!live) return undefined;
    const stage = host.current?.closest<HTMLElement>('[data-prep-stage]');
    if (!stage) return undefined;
    const tweens = LAYERS.map(({ id, scrub }) => gsap.to(clock[id], {
      t: SPAN,
      ease: 'none',
      onUpdate: () => invalidateRef.current(),
      scrollTrigger: { trigger: stage, start: 'top 80%', end: 'bottom 20%', scrub },
    }));
    return () => tweens.forEach((tween) => { tween.scrollTrigger?.kill(); tween.kill(); });
  }, [live, clock]);

  // Captions and plates answer each other.
  useEffect(() => {
    if (!live) return undefined;
    const section = host.current?.closest<HTMLElement>('[data-prep-layers]');
    if (!section) return undefined;
    const captions = [...section.querySelectorAll<HTMLElement>('[data-prep-caption]')];
    captions.forEach((caption) => caption.classList.toggle('is-focus', caption.dataset.prepCaption === focus));
    invalidateRef.current();
    return undefined;
  }, [live, focus]);

  useEffect(() => {
    if (!live) return undefined;
    const section = host.current?.closest<HTMLElement>('[data-prep-layers]');
    if (!section) return undefined;
    const list = section.querySelector<HTMLElement>('.prep-captions');
    const over = (event: PointerEvent) => {
      const id = (event.target as Element).closest<HTMLElement>('[data-prep-caption]')?.dataset.prepCaption as LayerId | undefined;
      if (id) setFocus(id);
    };
    const leave = () => setFocus(null);
    list?.addEventListener('pointerover', over);
    list?.addEventListener('pointerleave', leave);
    return () => {
      list?.removeEventListener('pointerover', over);
      list?.removeEventListener('pointerleave', leave);
      section.removeAttribute('data-prep-3d');
    };
  }, [live]);

  // The host box always renders: it is what Astro's client:visible watches (an empty
  // island has nothing to intersect, and would never hydrate).
  return (
    <div ref={host} className="prep-3d" aria-hidden="true" onPointerLeave={() => setFocus(null)}>
      {live && <Canvas
        frameloop="demand"
        dpr={[1, 1.75]}
        shadows="soft"
        camera={{ position: [6.2, 3.1, 8.6], fov: 24, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl, camera, invalidate }) => {
          invalidateRef.current = invalidate;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.08;
          camera.lookAt(0, -0.05, 0);
        }}
        onPointerMissed={() => setFocus(null)}
      >
        <hemisphereLight args={['#ffffff', '#d8d2c6', 0.55]} />
        <directionalLight
          position={[-4.5, 8, 5.5]}
          intensity={1.55}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-radius={5}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-left={-5}
          shadow-camera-right={5}
          shadow-camera-top={5}
          shadow-camera-bottom={-5}
        />
        <Stack
          clock={clock}
          focus={focus}
          onFocus={setFocus}
          onReady={() => host.current?.closest<HTMLElement>('[data-prep-layers]')?.setAttribute('data-prep-3d', 'ready')}
        />
      </Canvas>}
    </div>
  );
}
