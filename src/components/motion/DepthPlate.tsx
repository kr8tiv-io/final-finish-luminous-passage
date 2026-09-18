/**
 * `stair-dolly` — the Act 3 2.5D depth plate (Step 20, option B).
 *
 * MOTION-VOCABULARY.md: scene, scrub over 1.5 vh, damped λ 4, camera `z` 0 → −0.08,
 * `y` +0.02, pitch ≤ 2°. This component owns only the plate; the progress that
 * drives it arrives as a prop, so whoever mounts it (`StairLab` on the lab route,
 * `StairAscent` on the homepage later) keeps being the single owner of the scroll
 * coordinate. Nothing here reads scroll.
 *
 * ---------------------------------------------------------------------------
 * HOW IT DRAWS — a view of the one layout canvas (DEV-CONTRACT.md §"One canvas")
 * ---------------------------------------------------------------------------
 * The plate is a `surfaceStore.registerView(...)` view, exactly as `FilmVeil` is.
 * It builds its own `THREE.Scene` and `PerspectiveCamera` and draws them with the
 * renderer handed to it in the view context — it never mounts inside an R3F canvas
 * and never touches `SurfaceCanvas`. Priority 5 puts it above `film-veil` (0) and
 * below `surface-floor` (10), which is the z-order the storyboard asks for: the
 * floor band still paints over the set piece.
 *
 * It never writes `canvas.style`. When it has nothing to draw it unregisters, and
 * while the renderer is not `webgl` it shows the still instead, scrubbed
 * `scale(1 → 1.06)` — the `balanced` fallback the storyboard specifies for this act.
 *
 * ---------------------------------------------------------------------------
 * THE DISPLACEMENT — why the vertices are scaled along camera rays
 * ---------------------------------------------------------------------------
 * A depth plate must look *exactly* like the photograph at p = 0, or the dolly
 * starts from a picture nobody approved. Offsetting each vertex along z would not:
 * moving a vertex toward the camera magnifies it. So each vertex is scaled along
 * the ray from the base camera position instead —
 *
 *     p' = vec3(position.xy * uPlaneSize, -uNearZ) * k
 *
 * — which moves it in depth while leaving its projection from the base camera
 * untouched. At p = 0 the render is the plate, pixel for pixel, at any `k` field.
 *
 * `k` comes from the disparity map written by `scripts/build-stair-depth.mjs`
 * (65535 = nearest, small = far):  k = pow(1 / disparity, RELIEF).
 *
 * RELIEF is the one art-directed number here, and it is an exaggeration, stated as
 * such. The measured scene is nearly flat through the stair: the fitted geometry
 * puts the back parapet at 1.868x the distance of the bottom riser, so a truthful
 * plate (RELIEF = 1) separates them by only 1.87x in parallax. RELIEF = 1.4 raises
 * that to 1.868^1.4 = 2.40x, which is what makes the stair read as a stair under a
 * 6 % push rather than as a flat card. It changes no ordering and no structure, and
 * at p = 0 it changes nothing at all.
 *
 * The mesh is continuous, so a depth discontinuity stretches a triangle rather than
 * tearing a hole — nothing is inpainted. The one real hole risk is the frame edge
 * under `rise` and `pitch`, and OVERSCAN answers it: the plane is built 3.8 % larger
 * than the frustum at the base distance, so p = 0 shows a 96.3 % crop of the plate
 * and the camera has margin to move into. That margin is not centred — 80 % of it is
 * parked above the frame, because rise and pitch both push the picture *down* and
 * the top edge is the only one they can uncover. Measured: centred margin plus a
 * 1.2° pitch left a 12 px magenta band along the top at 1440 x 900 (1.33 % of the
 * frame); top-biased margin plus 0.35° leaves none.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { surfaceStore, type SurfaceViewRenderContext } from '../../lib/motion/surface-store';

export const STAIR_PLATE_ASPECT = 1672 / 941;
/** Base distance from the camera to the nearest surface of the plate, in world units. */
export const STAIR_NEAR_Z = 1;
export const STAIR_FOV = 40;
export const STAIR_OVERSCAN = 1.038;
/** How much of the overscan margin is parked above the frame, where the move needs it. */
export const STAIR_OVERSCAN_TOP_BIAS = 0.8;
export const STAIR_RELIEF = 1.4;
/** Guard: the written map bottoms out at 0.0602 (sky clamped to 108 tread units). */
export const STAIR_DISPARITY_FLOOR = 0.055;
/** `stair-dolly` end state. */
export const STAIR_DOLLY_Z = -0.08;
export const STAIR_DOLLY_RISE = 0.02;
/**
 * The vocabulary caps pitch at 2°; this plate uses 0.35°, and the reason is worth
 * recording. A pitch is a *uniform* translation of the picture — every pixel moves
 * by f·tan(θ) whatever its depth — so it buys no parallax and spends the overscan
 * budget: at this fov, 1.2° slid the whole frame 26 px down and opened a 12 px hole
 * along the top edge (measured). `rise` does the same job with parallax instead:
 * at the near plane 0.02 is 25 px of travel, at the parapet it is half a pixel.
 * So the rise carries "the camera is climbing" and the pitch only leans into it.
 */
export const STAIR_DOLLY_PITCH_DEGREES = 0.35;
export const STAIR_DAMP_LAMBDA = 4;

export interface StairPlateSources {
  readonly colour: string;
  readonly depth: string;
  readonly still: string;
  readonly segments: readonly [number, number];
}

export const STAIR_PLATE_DESKTOP: StairPlateSources = Object.freeze({
  colour: '/images/brand/stair/pearl-stair-v2-2048.webp',
  depth: '/images/brand/stair/pearl-stair-v2-depth-2048.png',
  still: '/images/brand/stair/pearl-stair-v2-2048.jpg',
  segments: [256, 288] as const,
});

export const STAIR_PLATE_PHONE: StairPlateSources = Object.freeze({
  colour: '/images/brand/stair/pearl-stair-v2-1024.webp',
  depth: '/images/brand/stair/pearl-stair-v2-depth-1024.png',
  still: '/images/brand/stair/pearl-stair-v2-1024.jpg',
  segments: [160, 180] as const,
});

const VERTEX_SHADER = /* glsl */`
  uniform sampler2D uDepth;
  uniform vec2 uPlaneSize;
  uniform vec2 uPlaneOffset;
  uniform float uNearZ;
  uniform float uRelief;
  uniform float uDisparityFloor;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // texture2D, not texture2DLod: three.js compiles a GLSL1 ShaderMaterial to
    // GLSL3 on a WebGL2 context and defines texture2D as texture, but has no macro
    // for the Lod form, which fails to compile with "no matching overloaded
    // function found". The depth texture carries no mipmaps (generateMipmaps is
    // false below), so there is no level to choose anyway.
    float disparity = max(texture2D(uDepth, uv).r, uDisparityFloor);
    float k = pow(1.0 / disparity, uRelief);
    vec3 ray = vec3(position.xy * uPlaneSize + uPlaneOffset, -uNearZ);
    gl_Position = projectionMatrix * viewMatrix * vec4(ray * k, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */`
  uniform sampler2D uMap;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    vec4 plate = texture2D(uMap, vUv);
    gl_FragColor = vec4(plate.rgb, uOpacity);
    #include <colorspace_fragment>
  }
`;

/**
 * The plate's world size and offset for a given viewport aspect: `cover`, overscan,
 * then the whole margin pushed to the top of the frame where the rise and the pitch
 * need it. Exported so the gates can map source pixels to capture pixels with the
 * same arithmetic the shader uses instead of eyeballing the bands.
 */
export function stairPlaneBox(aspect: number, overscan: number = STAIR_OVERSCAN) {
  const visibleHeight = 2 * STAIR_NEAR_Z * Math.tan((STAIR_FOV * Math.PI) / 360);
  const visibleWidth = visibleHeight * aspect;
  const height = Math.max(visibleWidth / STAIR_PLATE_ASPECT, visibleHeight) * overscan;
  // Moving the plate up shows lower plate rows, which parks the spare plate above
  // the frame — the only edge a rise-and-pitch move can uncover.
  const offsetY = (STAIR_OVERSCAN_TOP_BIAS * height * (overscan - 1)) / (2 * overscan);
  return { width: STAIR_PLATE_ASPECT * height, height, offsetX: 0, offsetY, visibleHeight, visibleWidth };
}

export function stairPlaneSize(aspect: number, overscan: number = STAIR_OVERSCAN): readonly [number, number] {
  const box = stairPlaneBox(aspect, overscan);
  return [box.width, box.height];
}

/** MathUtils.damp, written out so the constant is visible next to the vocabulary row. */
const damp = (current: number, target: number, lambda: number, delta: number) =>
  THREE.MathUtils.damp(current, target, lambda, delta);

export default function DepthPlate({
  progress,
  sources,
  id = 'stair-depth',
  priority = 5,
  overscan = STAIR_OVERSCAN,
  pitchDegrees = STAIR_DOLLY_PITCH_DEGREES,
}: {
  readonly progress: number;
  readonly sources?: StairPlateSources;
  readonly id?: string;
  readonly priority?: number;
  /**
   * Overscan and pitch are props purely so the Step 20 gates can run a control with
   * the guard removed and show that the hole counter moves. Production mounts take
   * the defaults; nothing on a real route should pass these.
   */
  readonly overscan?: number;
  readonly pitchDegrees?: number;
}) {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const surface = useSyncExternalStore(
    surfaceStore.subscribe,
    surfaceStore.getSnapshot,
    surfaceStore.getServerSnapshot,
  );
  const [compact, setCompact] = useState(false);
  const resolved = sources ?? (compact ? STAIR_PLATE_PHONE : STAIR_PLATE_DESKTOP);
  const target = useRef(0);
  const current = useRef(0);
  const lastFrameAt = useRef(0);
  const frames = useRef(0);

  useEffect(() => {
    if (sources) return undefined;
    const query = window.matchMedia('(max-width: 768px)');
    const apply = () => setCompact(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [sources]);

  const stage = useMemo(() => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(STAIR_FOV, 1, 0.05, 600);
    const geometry = new THREE.PlaneGeometry(1, 1, resolved.segments[0], resolved.segments[1]);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: null as THREE.Texture | null },
        uDepth: { value: null as THREE.Texture | null },
        uPlaneSize: { value: new THREE.Vector2(1, 1) },
        uPlaneOffset: { value: new THREE.Vector2(0, 0) },
        uNearZ: { value: STAIR_NEAR_Z },
        uRelief: { value: STAIR_RELIEF },
        uDisparityFloor: { value: STAIR_DISPARITY_FLOOR },
        uOpacity: { value: 1 },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      depthTest: false,
      depthWrite: false,
      transparent: false,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { scene, camera, geometry, material, mesh };
  }, [resolved.segments]);

  /* ---- textures ---- */
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    const loaded: THREE.Texture[] = [];
    let pending = 2;
    const settle = () => {
      pending -= 1;
      if (pending === 0 && !cancelled) {
        setReady(true);
        surfaceStore.invalidate();
      }
    };
    loader.load(resolved.colour, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.anisotropy = 4;
      stage.material.uniforms.uMap.value = texture;
      loaded.push(texture);
      settle();
    }, undefined, settle);
    loader.load(resolved.depth, (texture) => {
      // No mipmaps and no filtering games: a mip of a step function is a ramp, and a
      // ramp across a riser edge is the smear this plate exists to avoid.
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      stage.material.uniforms.uDepth.value = texture;
      loaded.push(texture);
      settle();
    }, undefined, settle);
    return () => {
      cancelled = true;
      loaded.forEach((texture) => texture.dispose());
      stage.material.uniforms.uMap.value = null;
      stage.material.uniforms.uDepth.value = null;
      setReady(false);
    };
  }, [resolved.colour, resolved.depth, stage]);

  useEffect(() => () => {
    stage.geometry.dispose();
    stage.material.dispose();
  }, [stage]);

  /* ---- the progress this plate is asked for ---- */
  useEffect(() => {
    target.current = Math.min(1, Math.max(0, progress));
    surfaceStore.invalidate();
  }, [progress]);

  /* ---- the view ---- */
  useEffect(() => {
    if (!host || !ready || surface.renderer !== 'webgl') return undefined;
    const render = ({ rect, gl }: SurfaceViewRenderContext) => {
      const now = performance.now();
      const delta = lastFrameAt.current === 0 ? 1 / 60 : Math.min(0.1, (now - lastFrameAt.current) / 1000);
      lastFrameAt.current = now;
      current.current = damp(current.current, target.current, STAIR_DAMP_LAMBDA, delta);
      if (Math.abs(current.current - target.current) < 0.0005) current.current = target.current;
      const p = current.current;

      const aspect = rect.width / Math.max(1, rect.height);
      if (stage.camera.aspect !== aspect) {
        stage.camera.aspect = aspect;
        stage.camera.updateProjectionMatrix();
      }
      const box = stairPlaneBox(aspect, overscan);
      stage.material.uniforms.uPlaneSize.value.set(box.width, box.height);
      stage.material.uniforms.uPlaneOffset.value.set(box.offsetX, box.offsetY);

      stage.camera.position.set(0, STAIR_DOLLY_RISE * p, STAIR_DOLLY_Z * p);
      stage.camera.rotation.set(THREE.MathUtils.degToRad(pitchDegrees) * p, 0, 0);
      stage.camera.updateMatrixWorld(true);
      gl.render(stage.scene, stage.camera);

      frames.current += 1;
      host.dataset.plateProgress = p.toFixed(4);
      host.dataset.plateFrames = String(frames.current);
      if (current.current !== target.current) surfaceStore.invalidate();
    };
    host.dataset.plateView = 'live';
    const unregister = surfaceStore.registerView(id, host, { render, priority });
    return () => {
      unregister();
      delete host.dataset.plateView;
    };
  }, [host, id, overscan, pitchDegrees, priority, ready, stage, surface.renderer]);

  const live = ready && surface.renderer === 'webgl';

  return (
    <div className="depth-plate" ref={setHost} data-depth-plate={id} aria-hidden="true">
      {!live && (
        <img
          className="depth-plate__still"
          src={resolved.still}
          alt=""
          decoding="async"
          style={{ transform: `scale(${(1 + 0.06 * Math.min(1, Math.max(0, progress))).toFixed(4)})` }}
        />
      )}
    </div>
  );
}
