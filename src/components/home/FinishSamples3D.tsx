/**
 * The three finish families as samples you can almost pick up (2026-09-22, Matt: "under
 * Find your finish could we add another similar model, like the first but different,
 * with the same scroll driven action").
 *
 * Three thick sample slabs — a flake (Midnight Aggregate), a solid (Graphite Showroom),
 * a metallic (Pearl Calacatta, pearlescent) — each on its own scrubbed clock with its own
 * lag, exactly the mechanic of the preparation stack above it: they arrive as a stacked
 * deck from below and fan out into a row as you keep scrolling. A key light swings
 * across them with the scroll, so each finish shows how it takes light: the chips
 * glint, the solid holds one long highlight, the metallic shifts its pearl. Point at a
 * sample and it lifts toward you; its caption answers.
 *
 * Built in code, textured with the site's own rendered close-ups; the three names and
 * descriptions are the inspiration library's (src/lib/visualizer/finishes.ts). Mounts
 * only on the `full` tier with a fine pointer and WebGL2; otherwise the flat swatches
 * under it are the picture.
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

export type SampleId = 'flake' | 'solid' | 'metallic';
const SAMPLES: readonly { id: SampleId; scrub: number }[] = [
  { id: 'flake', scrub: 1 },
  { id: 'solid', scrub: 1.8 },
  { id: 'metallic', scrub: 2.6 },
];
const SPAN = 2.2;
const W = 1.9;
const H = 0.16;
const D = 1.28;
const SHADOW_Y = -0.34;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

type Clock = Record<SampleId, { t: number }> & { light: { t: number } };

function loadTexture(name: string, repeat: [number, number], onLoad: () => void) {
  const texture = new THREE.TextureLoader().load(`/images/brand/texture/${name}.webp`, onLoad);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.anisotropy = 8;
  return texture;
}

function Samples({ clock, focus, onFocus, onReady }: {
  clock: Clock;
  focus: SampleId | null;
  onFocus: (id: SampleId | null) => void;
  onReady: () => void;
}) {
  const { gl, scene, invalidate } = useThree();
  const tiles = useRef<Partial<Record<SampleId, THREE.Group>>>({});
  const light = useRef<THREE.DirectionalLight>(null);
  const lift = useRef<Record<SampleId, number>>({ flake: 0, solid: 0, metallic: 0 });
  const dim = useRef<Record<SampleId, number>>({ flake: 1, solid: 1, metallic: 1 });
  const readyOnce = useRef(false);

  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    invalidate();
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene, invalidate]);

  const geometry = useMemo(() => new RoundedBoxGeometry(W, H, D, 4, 0.05), []);
  // One soft shadow under each sample, travelling with it. A single wide plane under the
  // row ran past the canvas and its faint tail stopped at the canvas edge: a grey box
  // (caught on the laptop capture, 2026-09-22). Each blob fades out inside the frame.
  const shadowGeometry = useMemo(() => new THREE.PlaneGeometry(W * 1.25, D * 1.45).rotateX(-Math.PI / 2), []);
  const shadowTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    // A circle that fades to nothing inside the texture's own bounds, so the blob has no
    // edge to show.
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(256, 256, 6, 256, 256, 250);
    g.addColorStop(0, 'rgba(23,34,42,0.3)');
    g.addColorStop(0.5, 'rgba(23,34,42,0.1)');
    g.addColorStop(1, 'rgba(23,34,42,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  const materials = useMemo(() => {
    const flakeTop = loadTexture('midnight-aggregate', [1, D / W], invalidate);
    const marbleTop = loadTexture('pearl-calacatta', [1, D / W], invalidate);
    const edge = (color: string, roughness = 0.5) => new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat: 0.6, transparent: true });
    // Face order (BoxGeometry): +x, -x, +y (the finish), -y, +z, -z.
    const withTop = (top: THREE.Material, side: THREE.Material) => [side, side, top, side, side, side];
    return {
      flake: withTop(
        new THREE.MeshPhysicalMaterial({ map: flakeTop, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1, transparent: true }),
        edge('#1d2529', 0.42),
      ),
      solid: withTop(
        new THREE.MeshPhysicalMaterial({ color: '#2b3336', roughness: 0.26, metalness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.25, transparent: true }),
        edge('#232a2d', 0.3),
      ),
      metallic: withTop(
        new THREE.MeshPhysicalMaterial({ map: marbleTop, roughness: 0.16, metalness: 0.22, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.45, iridescenceIOR: 1.35, envMapIntensity: 1.35, transparent: true }),
        edge('#dcdcd6', 0.28),
      ),
      shadows: Object.fromEntries(SAMPLES.map(({ id }) => [
        id,
        new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false, opacity: 0 }),
      ])) as Record<SampleId, THREE.MeshBasicMaterial>,
    };
  }, [invalidate, shadowTexture]);
  const blobs = useRef<Partial<Record<SampleId, THREE.Mesh>>>({});

  useFrame((_, delta) => {
    let moving = false;
    const damp = 1 - Math.exp(-delta * 9);
    SAMPLES.forEach(({ id }, index) => {
      const group = tiles.current[id];
      if (!group) return;
      const t = clock[id].t;
      const arrive = easeOut(clamp01(t / 1));
      const fan = easeInOut(clamp01((t - 0.95) / 1.05));
      const targetLift = focus === id ? 0.22 : 0;
      const targetDim = focus === null || focus === id ? 1 : 0.35;
      lift.current[id] += (targetLift - lift.current[id]) * damp;
      dim.current[id] += (targetDim - dim.current[id]) * damp;
      if (Math.abs(targetLift - lift.current[id]) > 0.001 || Math.abs(targetDim - dim.current[id]) > 0.002) moving = true;

      // Stacked deck (arrival) -> fanned row.
      const deckY = index * (H + 0.05);
      const rowX = (index - 1) * 2.2;
      const x = -1.3 * (1 - arrive) + rowX * fan;
      const y = -1.5 * (1 - arrive) + deckY * (1 - fan) + Math.abs(index - 1) * 0.04 * fan + lift.current[id];
      const z = -0.3 * Math.abs(index - 1) * fan;
      group.position.set(x, y, z);
      // Fanning out, each sample tips its face up toward you, like samples held out on
      // a table; hovered, it tips further.
      group.rotation.set(
        0.06 + 0.62 * fan + lift.current[id] * 1.1,
        (1 - index) * 0.2 * fan + (1 - arrive) * 0.5,
        (index - 1) * -0.04 * fan,
      );
      const opacity = Math.min(1, arrive * 1.5) * dim.current[id];
      (materials[id] as THREE.Material[]).forEach((m) => { m.opacity = opacity; });

      // Its shadow: only the bottom of the deck casts one until the row fans out; a
      // lifted sample's shadow spreads and pales.
      const blob = blobs.current[id];
      if (blob) {
        blob.position.set(x, SHADOW_Y, z + 0.15);
        blob.scale.setScalar(1 + lift.current[id] * 1.2);
        materials.shadows[id].opacity = arrive * (index === 0 ? 1 : fan) * (1 - lift.current[id] * 1.8) * dim.current[id];
      }
    });

    // The key light swings across the samples with the scroll.
    if (light.current) {
      const a = -1.1 + clock.light.t * 1.6;
      light.current.position.set(Math.sin(a) * 6, 5.5, Math.cos(a) * 5);
    }

    if (moving) invalidate();
    if (!readyOnce.current) { readyOnce.current = true; onReady(); }
  });

  const hover = (id: SampleId) => ({
    onPointerOver: (event: ThreeEvent<PointerEvent>) => { event.stopPropagation(); onFocus(id); },
  });

  return (
    <group position={[0, -0.35, 0]}>
      <directionalLight ref={light} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} shadow-radius={5} shadow-bias={-0.0004} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={4} shadow-camera-bottom={-4} />
      {SAMPLES.map(({ id }) => (
        <mesh key={`shadow-${id}`} ref={(m) => { if (m) blobs.current[id] = m; }} geometry={shadowGeometry} material={materials.shadows[id]} position={[0, SHADOW_Y, 0]} />
      ))}
      {SAMPLES.map(({ id }) => (
        <group key={id} ref={(g) => { if (g) tiles.current[id] = g; }} {...hover(id)}>
          <mesh geometry={geometry} material={materials[id]} castShadow receiveShadow />
        </group>
      ))}
    </group>
  );
}

function admitted() {
  if (typeof window === 'undefined') return false;
  const tier = document.documentElement.dataset.journeyTier;
  if (tier === 'still' || tier === 'balanced') return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (!window.matchMedia('(pointer: fine)').matches) return false;
  try {
    return Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    return false;
  }
}

export default function FinishSamples3D() {
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  const [focus, setFocus] = useState<SampleId | null>(null);
  const invalidateRef = useRef<() => void>(() => {});
  const clock = useMemo<Clock>(() => ({ flake: { t: 0 }, solid: { t: 0 }, metallic: { t: 0 }, light: { t: 0 } }), []);

  useEffect(() => { setLive(admitted()); }, []);

  useEffect(() => {
    if (!live) return undefined;
    const stage = host.current?.closest<HTMLElement>('[data-samples-stage]');
    if (!stage) return undefined;
    const tweens = [
      ...SAMPLES.map(({ id, scrub }) => gsap.to(clock[id], {
        t: SPAN,
        ease: 'none',
        onUpdate: () => invalidateRef.current(),
        // The fan finishes by the time the stage is centred, not as it leaves: on a short
        // laptop screen the old end ('bottom 30%') played the fan under the header.
        scrollTrigger: { trigger: stage, start: 'top 90%', end: 'center 55%', scrub },
      })),
      gsap.to(clock.light, {
        t: 1,
        ease: 'none',
        onUpdate: () => invalidateRef.current(),
        scrollTrigger: { trigger: stage, start: 'top bottom', end: 'bottom top', scrub: 0.8 },
      }),
    ];
    return () => tweens.forEach((tween) => { tween.scrollTrigger?.kill(); tween.kill(); });
  }, [live, clock]);

  // Samples and captions answer each other.
  useEffect(() => {
    if (!live) return undefined;
    const section = host.current?.closest<HTMLElement>('[data-samples]');
    section?.querySelectorAll<HTMLElement>('[data-sample-caption]').forEach((caption) => {
      caption.classList.toggle('is-focus', caption.dataset.sampleCaption === focus);
    });
    invalidateRef.current();
    return undefined;
  }, [live, focus]);

  useEffect(() => {
    if (!live) return undefined;
    const section = host.current?.closest<HTMLElement>('[data-samples]');
    const list = section?.querySelector<HTMLElement>('.samples-captions');
    const over = (event: PointerEvent) => {
      const id = (event.target as Element).closest<HTMLElement>('[data-sample-caption]')?.dataset.sampleCaption as SampleId | undefined;
      if (id) setFocus(id);
    };
    const leave = () => setFocus(null);
    list?.addEventListener('pointerover', over);
    list?.addEventListener('pointerleave', leave);
    return () => {
      list?.removeEventListener('pointerover', over);
      list?.removeEventListener('pointerleave', leave);
      section?.removeAttribute('data-samples-3d');
    };
  }, [live]);

  // The host box always renders: it is what Astro's `client:visible` watches.
  return (
    <div ref={host} className="samples-3d" aria-hidden="true" onPointerLeave={() => setFocus(null)}>
      {live && <Canvas
        frameloop="demand"
        dpr={[1, 1.75]}
        shadows="soft"
        camera={{ position: [0, 2.6, 7.1], fov: 30, near: 0.1, far: 60 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
        onCreated={({ gl, camera, invalidate }) => {
          invalidateRef.current = invalidate;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.05;
          camera.lookAt(0, 0.05, 0);
        }}
        onPointerMissed={() => setFocus(null)}
      >
        <hemisphereLight args={['#ffffff', '#d8d2c6', 0.5]} />
        <Samples
          clock={clock}
          focus={focus}
          onFocus={setFocus}
          onReady={() => host.current?.closest<HTMLElement>('[data-samples]')?.setAttribute('data-samples-3d', 'ready')}
        />
      </Canvas>}
    </div>
  );
}
