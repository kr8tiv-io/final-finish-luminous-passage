import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  SURFACE_FRAGMENT_CLEARCOAT,
  SURFACE_FRAGMENT_COLOR,
  SURFACE_FRAGMENT_COMMON,
  SURFACE_FRAGMENT_METALNESS,
  SURFACE_FRAGMENT_ROUGHNESS,
  SURFACE_HORIZON_COLOR,
  SURFACE_HORIZON_FRAGMENT,
  SURFACE_HORIZON_VERTEX,
  SURFACE_MATERIALS,
  SURFACE_MORPH_DURATION,
  SURFACE_MORPH_EASE,
  SURFACE_VERTEX_BODY,
  SURFACE_VERTEX_COMMON,
  type SurfaceStateId,
} from '../../lib/motion/surface-materials';
import {
  scissorBox,
  surfaceStore,
  type SurfaceCameraMode,
  type SurfaceDriver,
  type SurfaceViewRenderContext,
} from '../../lib/motion/surface-store';

/** Camera rig heights and pitch — storyboard §2: standing 1.6 m, kneeling 0.9 m. */
const CAMERA_RIG: Readonly<Record<SurfaceCameraMode, { readonly height: number; readonly pitchDeg: number }>> =
  Object.freeze({
    standing: { height: 1.6, pitchDeg: 31 },
    kneeling: { height: 0.9, pitchDeg: 28.5 },
  });

const CAMERA_FOV = 38;
const PLANE_SIZE = 60;
/** uv repeats across the 60 m plane: one repeat ≈ 2.5 m of real floor. */
const SURFACE_TILING = 24;
/** Flake cells per uv unit, sampled 4x finer again — roughly 2.5 cm chips. */
const FLAKE_DENSITY = 26;
/** Horizon line drawn 1 CSS pixel tall at the top edge of the band. */
const HORIZON_LINE_CSS_PX = 1;
/**
 * In floor mode the line is only a whisper of continuity — the plane itself is the
 * subject. A stronger line here draws a rule straight through the hero copy and reads
 * as a compositing artefact. The storyboard asks for the full line in the silences
 * (S1, S2, Act 2, Act 9), which is horizon mode, where it goes to 1.
 */
const HORIZON_FLOOR_OPACITY = 0.1;

function rigFades(mode: SurfaceCameraMode): { near: number; far: number } {
  const { height, pitchDeg } = CAMERA_RIG[mode];
  const halfFov = (CAMERA_FOV / 2) * (Math.PI / 180);
  const pitch = pitchDeg * (Math.PI / 180);
  // View depth of the floor at the bottom and top edges of the frustum.
  const near = height / Math.tan(pitch + halfFov);
  const far = height / Math.tan(Math.max(0.04, pitch - halfFov));
  return { near, far };
}

/**
 * Environment map with no network fetch: a small equirectangular gradient (dim ground,
 * a bright warm band at eye level, paper sky) pushed through PMREM. The bright band is
 * what a clearcoat floor actually reflects, so the sheen reads as a room rather than a
 * flat tint.
 */
function buildEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const width = 64;
  const height = 32;
  const data = new Uint8Array(width * height * 4);
  const ground = [0x28, 0x2d, 0x31];
  const band = [0xff, 0xfd, 0xf7];
  const sky = [0xf2, 0xf3, 0xf5];
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      // Key lobe slightly left of centre so the specular sweep has somewhere to come from.
      const key = Math.exp(-(((u - 0.31) / 0.16) ** 2));
      const horizon = Math.exp(-(((v - 0.52) / 0.06) ** 2));
      const upward = Math.max(0, (v - 0.55) / 0.45);
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const base = ground[channel] * (1 - Math.min(1, v / 0.5));
        const upper = sky[channel] * upward;
        const lit = band[channel] * horizon * (0.45 + 0.55 * key);
        data[offset + channel] = Math.min(255, Math.round(base + upper + lit));
      }
      data[offset + 3] = 255;
    }
  }
  const source = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;
  source.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const environment = pmrem.fromEquirectangular(source).texture;
  pmrem.dispose();
  source.dispose();
  return environment;
}

function neutralPhotoTexture(): THREE.DataTexture {
  // Act 6 replaces this slot with the archive atlas; until then state 4 is neutral grey.
  const texture = new THREE.DataTexture(new Uint8Array([154, 154, 151, 255]), 1, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Walks the view registry once per rendered frame.
 *
 * `priority: 1` takes the render away from react-three-fiber so every draw goes through
 * the scissor path below; with `frameloop="demand"` this callback only runs when
 * something called `invalidate()`, which is what keeps an idle page at zero frames.
 */
function SurfaceViewRenderer() {
  const gl = useThree((state) => state.gl);
  const size = useThree((state) => state.size);
  const frame = useRef(0);

  useFrame(() => {
    const width = size.width;
    const height = size.height;
    frame.current += 1;
    gl.setScissorTest(false);
    gl.setViewport(0, 0, width, height);
    gl.clear(true, true, true);
    for (const { view, rect } of surfaceStore.visibleViews(width, height)) {
      const box = scissorBox(rect, width, height);
      if (box.width <= 0 || box.height <= 0) continue;
      gl.setViewport(box.x, box.y, box.width, box.height);
      gl.setScissor(box.x, box.y, box.width, box.height);
      gl.setScissorTest(true);
      view.render({ rect, box, frame: frame.current });
    }
    gl.setScissorTest(false);
    surfaceStore.noteFrame();
  }, 1);

  return null;
}

function SurfaceFloorScene({ viewElement }: { readonly viewElement: HTMLElement }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);
  const floorRef = useRef<THREE.Mesh>(null);

  const flakePalette = SURFACE_MATERIALS[3].colors;

  const uniforms = useMemo(() => ({
    uMaterialA: { value: 0 },
    uMaterialB: { value: 0 },
    uMix: { value: 0 },
    uSweep: { value: 0 },
    uPlaneOpacity: { value: 1 },
    uTiling: { value: SURFACE_TILING },
    uNearFade: { value: rigFades('standing').near },
    uFarFade: { value: rigFades('standing').far },
    uPhoto: { value: neutralPhotoTexture() },
    uPhotoReady: { value: 0 },
    uViewport: { value: new THREE.Vector2(0, 1) },
    // Inherited from FINISH_SHADER_CHUNK — the flake palette state 3 samples.
    uA: { value: new THREE.Color(flakePalette[0]) },
    uB: { value: new THREE.Color(flakePalette[1]) },
    uC: { value: new THREE.Color(flakePalette[2]) },
    uDensity: { value: FLAKE_DENSITY },
    uPattern: { value: 0 },
    uReveal: { value: 1 },
    uLight: { value: new THREE.Vector2(0.31, 0.42) },
  }), [flakePalette]);

  const horizonUniforms = useMemo(() => ({
    uHorizonColor: { value: new THREE.Color(SURFACE_HORIZON_COLOR) },
    uHorizonOpacity: { value: HORIZON_FLOOR_OPACITY },
    uHorizonWidth: { value: 0.004 },
  }), []);

  const material = useMemo(() => {
    const next = new THREE.MeshPhysicalMaterial({
      color: '#ffffff',
      roughness: 0.2,
      metalness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.08,
      envMapIntensity: 1,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });
    next.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${SURFACE_VERTEX_COMMON}`)
        .replace('#include <uv_vertex>', `#include <uv_vertex>\n${SURFACE_VERTEX_BODY}`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${SURFACE_FRAGMENT_COMMON}`)
        .replace('#include <color_fragment>', `#include <color_fragment>\n${SURFACE_FRAGMENT_COLOR}`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\n${SURFACE_FRAGMENT_ROUGHNESS}`)
        .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>\n${SURFACE_FRAGMENT_METALNESS}`)
        .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>\n${SURFACE_FRAGMENT_CLEARCOAT}`);
    };
    // Distinct from the visualizer's 'ffe-finish-preview' key so the two patched
    // MeshPhysicalMaterials never share a compiled program.
    next.customProgramCacheKey = () => 'ffe-surface-floor';
    return next;
  }, [uniforms]);

  const horizonMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: horizonUniforms,
    vertexShader: SURFACE_HORIZON_VERTEX,
    fragmentShader: SURFACE_HORIZON_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }), [horizonUniforms]);

  const camera = useMemo(() => {
    const next = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.05, 240);
    next.rotation.order = 'YXZ';
    return next;
  }, []);

  const applyCamera = useMemo(() => (mode: SurfaceCameraMode) => {
    const rig = CAMERA_RIG[mode];
    camera.position.set(0, rig.height, 0);
    camera.rotation.set(-rig.pitchDeg * (Math.PI / 180), 0, 0);
    camera.updateMatrixWorld();
    const fades = rigFades(mode);
    uniforms.uNearFade.value = fades.near;
    uniforms.uFarFade.value = fades.far;
  }, [camera, uniforms]);

  useEffect(() => {
    applyCamera(surfaceStore.getSnapshot().camera);
  }, [applyCamera]);

  // Environment map — built once from the live renderer, disposed with the component.
  useEffect(() => {
    const environment = buildEnvironment(gl);
    material.envMap = environment;
    material.needsUpdate = true;
    invalidate();
    return () => {
      material.envMap = null;
      environment.dispose();
    };
  }, [gl, invalidate, material]);

  useEffect(() => () => {
    material.dispose();
    horizonMaterial.dispose();
    (uniforms.uPhoto.value as THREE.DataTexture).dispose();
  }, [horizonMaterial, material, uniforms]);

  /* ---- the driver: the only writer of the floor's GPU uniforms ---- */
  useEffect(() => {
    const buildQuickMix = () => gsap.quickTo(uniforms.uMix, 'value', {
      duration: SURFACE_MORPH_DURATION,
      ease: SURFACE_MORPH_EASE,
      onUpdate: invalidate,
    });
    let quickMix = buildQuickMix();

    const driver: SurfaceDriver = {
      mixTo: (value, duration, ease) => {
        if (duration === SURFACE_MORPH_DURATION && ease === SURFACE_MORPH_EASE) {
          // quickTo reuses one tween instance, so an interrupted morph reverses on the
          // same ease from wherever it already is rather than restarting — `easeReverse`.
          quickMix(value);
          return;
        }
        gsap.to(uniforms.uMix, { value, duration, ease, overwrite: true, onUpdate: invalidate });
        quickMix = buildQuickMix();
      },
      setStates: (a, b) => {
        uniforms.uMaterialA.value = a;
        uniforms.uMaterialB.value = b;
      },
      setMix: (value) => {
        // The director owns scroll-linked progress; a discrete morph never outranks it.
        gsap.killTweensOf(uniforms.uMix);
        uniforms.uMix.value = value;
        quickMix = buildQuickMix();
      },
      setHorizon: (horizon, duration) => {
        const planeTarget = horizon ? 0 : 1;
        const lineTarget = horizon ? 1 : HORIZON_FLOOR_OPACITY;
        if (duration <= 0) {
          uniforms.uPlaneOpacity.value = planeTarget;
          horizonUniforms.uHorizonOpacity.value = lineTarget;
          invalidate();
          return;
        }
        gsap.to(uniforms.uPlaneOpacity, {
          value: planeTarget, duration, ease: SURFACE_MORPH_EASE, overwrite: true, onUpdate: invalidate,
        });
        gsap.to(horizonUniforms.uHorizonOpacity, {
          value: lineTarget, duration, ease: SURFACE_MORPH_EASE, overwrite: true, onUpdate: invalidate,
        });
      },
      setCamera: applyCamera,
      sweep: (duration) => {
        // The sweep advances only for the life of this tween; when it ends nothing
        // calls invalidate() again, so an idle page renders zero frames.
        gsap.to(uniforms.uSweep, {
          value: Math.floor(uniforms.uSweep.value) + 1,
          duration,
          ease: 'none',
          overwrite: true,
          onUpdate: invalidate,
        });
      },
      settle: (duration) => {
        const horizon = surfaceStore.getSnapshot().horizon;
        gsap.to(uniforms.uSweep, {
          // Park the highlight off the plane rather than freezing it mid-floor.
          value: Math.round(uniforms.uSweep.value),
          duration,
          ease: 'power2.out',
          overwrite: true,
          onUpdate: invalidate,
        });
        gsap.to(uniforms.uPlaneOpacity, {
          value: horizon ? 0 : 1, duration, ease: 'power2.out', overwrite: true, onUpdate: invalidate,
        });
        gsap.to(horizonUniforms.uHorizonOpacity, {
          value: horizon ? 1 : HORIZON_FLOOR_OPACITY,
          duration,
          ease: 'power2.out',
          overwrite: true,
          onUpdate: invalidate,
        });
      },
      invalidate,
    };

    surfaceStore.bindDriver(driver);
    return () => {
      surfaceStore.bindDriver(null);
      gsap.killTweensOf(uniforms.uMix);
      gsap.killTweensOf(uniforms.uSweep);
      gsap.killTweensOf(uniforms.uPlaneOpacity);
      gsap.killTweensOf(horizonUniforms.uHorizonOpacity);
    };
  }, [applyCamera, horizonUniforms, invalidate, uniforms]);

  /* ---- view registration: this floor owns the band's rectangle ---- */
  useEffect(() => {
    const render = ({ rect, box }: SurfaceViewRenderContext) => {
      const aspect = rect.width / Math.max(1, rect.height);
      if (camera.aspect !== aspect) {
        camera.aspect = aspect;
        camera.updateProjectionMatrix();
      }
      horizonUniforms.uHorizonWidth.value = HORIZON_LINE_CSS_PX / Math.max(1, rect.height);
      // gl_FragCoord is framebuffer-relative, so the shader needs the band's own
      // device-pixel rectangle to know how far up the band a fragment sits.
      const dpr = gl.getPixelRatio();
      uniforms.uViewport.value.set(box.y * dpr, Math.max(1, box.height * dpr));
      gl.render(scene, camera);
    };
    return surfaceStore.registerView('surface-floor', viewElement, { render, priority: 0 });
  }, [camera, gl, horizonUniforms, scene, uniforms, viewElement]);

  return (
    <>
      {/* Kept low on purpose: the material's own albedo has to survive the lighting,
          or every state washes out to the same near-white over the paper ground. */}
      <hemisphereLight args={['#fffaf0', '#2f3a42', 0.5]} />
      <directionalLight position={[-3.2, 4.8, 2.4]} intensity={1.15} color="#fff6e6" />
      <directionalLight position={[4.5, 2.2, -6]} intensity={0.4} color="#b9d4e6" />
      <mesh
        ref={floorRef}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, -PLANE_SIZE / 2 + 4]}
        frustumCulled={false}
      >
        <planeGeometry args={[PLANE_SIZE, PLANE_SIZE, 1, 1]} />
        <primitive object={material} attach="material" />
      </mesh>
      <mesh renderOrder={10} frustumCulled={false}>
        <planeGeometry args={[2, 2]} />
        <primitive object={horizonMaterial} attach="material" />
      </mesh>
    </>
  );
}

export function surfaceStateName(id: SurfaceStateId): string {
  return SURFACE_MATERIALS[id].name;
}

/**
 * The renderer half of the plane, behind `lazy()` so three.js and react-three-fiber
 * only reach clients `SurfaceCanvas` has admitted.
 *
 * `restoreKey` re-mounts the scene (materials, environment map, view registration)
 * after `webglcontextrestored` without disturbing the `<canvas>` element itself, which
 * has to survive the loss for the restore event to have a target.
 */
export default function SurfaceStage({ viewElement, restoreKey, onCanvas }: {
  readonly viewElement: HTMLElement;
  readonly restoreKey: number;
  readonly onCanvas: (canvas: HTMLCanvasElement) => void;
}) {
  const onCreated = useCallback(({ gl }: { gl: THREE.WebGLRenderer }) => {
    gl.setClearColor(0x000000, 0);
    gl.outputColorSpace = THREE.SRGBColorSpace;
    gl.toneMapping = THREE.AgXToneMapping;
    gl.toneMappingExposure = 1;
    // Every clear is issued by SurfaceViewRenderer so the scissor rules stay in one place.
    gl.autoClear = false;
    gl.domElement.dataset.surfaceCanvas = 'floor';
    onCanvas(gl.domElement);
  }, [onCanvas]);

  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      onCreated={onCreated}
    >
      <SurfaceViewRenderer />
      <SurfaceFloorScene key={restoreKey} viewElement={viewElement} />
    </Canvas>
  );
}
