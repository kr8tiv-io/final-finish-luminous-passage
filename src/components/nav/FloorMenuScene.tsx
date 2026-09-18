import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import type { FloorFinishKey } from './nav-destinations';

/**
 * The live floor behind the menu: one large plane in perspective with a
 * clearcoated epoxy material. Hovering a destination blends the floor toward
 * that destination's finish; a slow specular sweep travels across it while the
 * menu is open.
 *
 * Each finish is a shader weight rather than a swapped material, so a fast
 * hover from one link to another crossfades instead of cutting, and the whole
 * program is compiled once (`gl.compile`) when the menu opens.
 *
 * The environment is generated on a 2D canvas and run through PMREM rather than
 * drei's `<Environment preset>`: presets are fetched from a CDN at runtime and
 * this menu must not wait on the network.
 */

const FINISH_UNIFORM: Record<Exclude<FloorFinishKey, 'paper'>, string> = {
  pearl: 'uWeightPearl',
  'warm-grey-flake': 'uWeightGrey',
  'cobalt-metallic': 'uWeightCobalt',
  'salt-pepper-flake': 'uWeightSalt',
};

const FLOOR_CHUNK = /* glsl */ `
uniform float uWeightPearl;
uniform float uWeightGrey;
uniform float uWeightCobalt;
uniform float uWeightSalt;
uniform float uWeightFade;
uniform float uSweep;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uCobalt;
varying vec3 vFloorWorld;

float ffeHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float ffeNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = ffeHash(i);
  float b = ffeHash(i + vec2(1.0, 0.0));
  float c = ffeHash(i + vec2(0.0, 1.0));
  float d = ffeHash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float ffeFbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * ffeNoise(p);
    p *= 2.07;
    a *= 0.5;
  }
  return v;
}

// Broadcast-flake chips on a jittered grid — the same construction as the
// visualizer's flakeField (src/lib/visualizer/finish-shader.ts), parameterised
// by palette arguments instead of globals so several finishes can coexist.
vec3 ffeFlakes(vec2 uv, float density, float sizeMul, vec3 base, vec3 chipA, vec3 chipB) {
  vec2 gid = floor(uv * density);
  float n = ffeHash(gid);
  float n2 = ffeHash(gid + 19.7);
  vec2 jitter = vec2(ffeHash(gid + 7.1), ffeHash(gid + 31.3)) - 0.5;
  vec2 chipPoint = fract(uv * density) - 0.5 - jitter * 0.42;
  float angle = n2 * 6.2831853;
  chipPoint = mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) * chipPoint;
  chipPoint.y *= 1.25 + ffeHash(gid + 51.7) * 0.7;
  float size = (0.085 + n * 0.085) * sizeMul;
  float reach = max(abs(chipPoint.x) + abs(chipPoint.y) * 0.28, abs(chipPoint.y));
  float edge = max(fwidth(reach) * 0.85, 0.004);
  float chip = (1.0 - smoothstep(size * 0.72 - edge, size + edge, reach)) * step(0.20, n);
  vec3 col = mix(chipA, chipB, step(0.5, n2));
  col += vec3(pow(n2, 15.0) * 0.26);
  return mix(base, col, chip);
}

// Every finish is mixed toward paper before it leaves its function. A floor that
// carries display type has to stay a light field: at full weight the cobalt read
// as a real metallic pour and took the lower half of the list down with it.
vec3 ffeBaseFloor(vec2 uv) {
  float n = ffeFbm(uv * 0.55);
  vec3 quiet = mix(uPaper, mix(uPaper, uInk, 0.38), 0.35 + n * 0.65);
  // A sparse chip glint so the idle floor reads as coated, not as blank paper.
  vec3 chips = ffeFlakes(uv, 10.0, 0.55, quiet, mix(uPaper, vec3(1.0), 0.6), mix(uPaper, uInk, 0.34));
  return mix(quiet, chips, 0.45);
}

vec3 ffePearl(vec2 uv) {
  float n = ffeFbm(uv * 0.42);
  vec3 col = mix(uPaper, vec3(1.0), 0.4 + n * 0.5);
  float shift = 0.5 + 0.5 * sin(n * 13.0 + uv.x * 0.35);
  col = mix(col, mix(uPaper, uCobalt, 0.14), shift * 0.26);
  return col;
}

vec3 ffeWarmGrey(vec2 uv) {
  vec3 base = mix(uPaper, uInk, 0.34);
  return ffeFlakes(uv, 8.5, 0.95, base, mix(uPaper, uInk, 0.04), mix(uPaper, uInk, 0.58));
}

vec3 ffeSaltPepper(vec2 uv) {
  vec3 base = mix(uPaper, uInk, 0.13);
  return ffeFlakes(uv, 14.0, 0.7, base, vec3(0.99), mix(uPaper, uInk, 0.82));
}

vec3 ffeCobaltMetallic(vec2 uv) {
  float n = ffeFbm(uv * 0.5);
  vec2 p = uv * 0.34 + n;
  float vein = pow(1.0 - abs(sin(p.x * 1.9 + ffeFbm(p * 1.4) * 4.0)), 8.0);
  vec3 col = mix(uCobalt, mix(uCobalt, uInk, 0.55), n);
  return mix(col, mix(uPaper, uCobalt, 0.3), vein * 0.9);
}

/**
 * The one rule this floor cannot break: display type and 11px station labels sit
 * on it. Nothing is allowed below a fraction of the paper's own luminance, so a
 * finish reads as a shift in the floor and never as a dark plate under the words.
 *
 * The lift goes toward white rather than toward paper: paper is a warm neutral,
 * and lifting a cobalt floor toward it turns the hover grey instead of blue.
 */
vec3 ffeKeepLegible(vec3 colour, float floorOfLuminance) {
  const vec3 W = vec3(0.2126, 0.7152, 0.0722);
  float paperLum = dot(uPaper, W);
  float lum = dot(colour, W);
  float minLum = paperLum * floorOfLuminance;
  float lift = clamp((minLum - lum) / max(1e-4, 1.0 - lum), 0.0, 1.0);
  return mix(colour, vec3(1.0), lift);
}
`;

const FLOOR_MAP_FRAGMENT = /* glsl */ `
float floorSweep = 0.0;
{
  vec2 fuv = vFloorWorld.xz * 0.34;
  vec3 quiet = ffeBaseFloor(fuv);
  float wSum = clamp(uWeightPearl + uWeightGrey + uWeightCobalt + uWeightSalt, 0.0, 1.0);
  vec3 finish = vec3(0.0);
  if (uWeightPearl > 0.002) finish += ffePearl(fuv) * uWeightPearl;
  if (uWeightGrey > 0.002) finish += ffeWarmGrey(fuv) * uWeightGrey;
  if (uWeightCobalt > 0.002) finish += ffeCobaltMetallic(fuv) * uWeightCobalt;
  if (uWeightSalt > 0.002) finish += ffeSaltPepper(fuv) * uWeightSalt;
  finish /= max(1e-4, uWeightPearl + uWeightGrey + uWeightCobalt + uWeightSalt);
  vec3 blended = mix(quiet, finish, wSum * 0.92);

  // A long specular band crossing the slab, the way a shop light reads on a
  // freshly coated floor.
  float band = sin(vFloorWorld.x * 0.15 + vFloorWorld.z * 0.05 - uSweep * 6.2831853);
  floorSweep = pow(max(band, 0.0), 18.0) * 0.9;
  blended += vec3(floorSweep * 0.2);

  // The floor holds the lower half of the frame and dissolves into the paper
  // field over the middle — no hard horizon line, and the top of the list always
  // sits on clean paper.
  float depth = smoothstep(1.9, -3.6, vFloorWorld.z);
  float sides = smoothstep(7.0, 15.0, abs(vFloorWorld.x));
  blended = mix(blended, uPaper, clamp(depth + sides * 0.6, 0.0, 1.0));
  blended = mix(blended, uPaper, uWeightFade * 0.94);
  floorSweep *= (1.0 - uWeightFade) * (1.0 - depth);
  diffuseColor.rgb = ffeKeepLegible(blended, 0.46);
}
`;

function GradientEnvironment() {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) return;
    const sky = context.createLinearGradient(0, 0, 0, 128);
    sky.addColorStop(0, '#f0ece3');
    sky.addColorStop(0.4, '#e7e2d8');
    sky.addColorStop(0.52, '#ded8cb');
    sky.addColorStop(0.78, '#5c6870');
    sky.addColorStop(1, '#2b3a44');
    context.fillStyle = sky;
    context.fillRect(0, 0, 256, 128);
    const bar = context.createLinearGradient(40, 0, 216, 0);
    bar.addColorStop(0, 'rgba(255,255,255,0)');
    bar.addColorStop(0.5, 'rgba(255,255,255,0.85)');
    bar.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = bar;
    context.fillRect(0, 10, 256, 22);

    const equirect = new THREE.CanvasTexture(canvas);
    equirect.mapping = THREE.EquirectangularReflectionMapping;
    equirect.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(gl);
    const target = pmrem.fromEquirectangular(equirect);
    scene.environment = target.texture;
    pmrem.dispose();
    equirect.dispose();
    invalidate();

    return () => {
      scene.environment = null;
      target.dispose();
    };
  }, [gl, invalidate, scene]);

  return null;
}

export default function FloorMenuScene({ finish }: { finish: FloorFinishKey | null }) {
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const camera = useThree((state) => state.camera);
  const invalidate = useThree((state) => state.invalidate);

  const uniforms = useMemo(
    () => ({
      uWeightPearl: { value: 0 },
      uWeightGrey: { value: 0 },
      uWeightCobalt: { value: 0 },
      uWeightSalt: { value: 0 },
      uWeightFade: { value: 0 },
      uSweep: { value: 0 },
      uPaper: { value: new THREE.Color('#faf9f6') },
      uInk: { value: new THREE.Color('#17222a') },
      uCobalt: { value: new THREE.Color('#164f83') },
    }),
    [],
  );

  const material = useMemo(() => {
    const physical = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#faf9f6'),
      roughness: 0.12,
      metalness: 0,
      clearcoat: 1,
      clearcoatRoughness: 0.055,
      envMapIntensity: 0.55,
    });
    physical.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vFloorWorld;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFloorWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${FLOOR_CHUNK}`)
        .replace('#include <map_fragment>', FLOOR_MAP_FRAGMENT)
        .replace(
          '#include <roughnessmap_fragment>',
          '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.03, floorSweep);',
        );
    };
    physical.customProgramCacheKey = () => 'ffe-nav-floor';
    return physical;
  }, [uniforms]);

  useLayoutEffect(() => {
    camera.position.set(0, 1.55, 3.1);
    camera.rotation.set(THREE.MathUtils.degToRad(-28), 0, 0);
    camera.updateProjectionMatrix();
  }, [camera]);

  // Compile before the first hover so the first finish blend does not stall on
  // shader linking.
  useEffect(() => {
    gl.compile(scene, camera);
    invalidate();
  }, [camera, gl, invalidate, scene]);

  useEffect(() => () => material.dispose(), [material]);

  // React unmounting the <Canvas> frees the renderer, but the GPU context can
  // outlive it until the next collection; on a menu that opens and closes
  // repeatedly that is a growing pile of live contexts. Release it explicitly.
  useEffect(() => () => {
    gl.dispose();
    gl.forceContextLoss();
  }, [gl]);

  // GSAP owns time; the renderer stays on demand. The sweep is a 7-second
  // traverse, so it is redrawn every other frame — half the GPU work for motion
  // no one can tell apart, and it leaves the main thread free for the menu's own
  // transition.
  useEffect(() => {
    let tick = 0;
    const sweep = gsap.to(uniforms.uSweep, {
      value: 1,
      duration: 7.2,
      ease: 'none',
      repeat: -1,
      onUpdate: () => {
        tick += 1;
        if (tick % 2 === 0) invalidate();
      },
    });
    return () => {
      sweep.kill();
      uniforms.uSweep.value = 0;
    };
  }, [invalidate, uniforms]);

  const weightTo = useMemo(() => {
    const keys = [
      uniforms.uWeightPearl,
      uniforms.uWeightGrey,
      uniforms.uWeightCobalt,
      uniforms.uWeightSalt,
      uniforms.uWeightFade,
    ];
    return keys.map((target) =>
      gsap.quickTo(target, 'value', { duration: 0.45, ease: 'power2.out', easeReverse: true, onUpdate: invalidate }),
    );
  }, [invalidate, uniforms]);

  // quickTo parks a paused tween on the global timeline. The menu mounts and
  // unmounts this scene on every open, so without this they pile up, each one
  // holding a dead uniform and a dead renderer's invalidate.
  useEffect(() => () => {
    weightTo.forEach((setter) => (setter as unknown as { tween?: gsap.core.Tween }).tween?.kill());
  }, [weightTo]);

  useEffect(() => {
    const names = ['uWeightPearl', 'uWeightGrey', 'uWeightCobalt', 'uWeightSalt', 'uWeightFade'] as const;
    const wanted = finish === 'paper' ? 'uWeightFade' : finish ? FINISH_UNIFORM[finish] : null;
    names.forEach((name, index) => weightTo[index]?.(name === wanted ? 1 : 0));
  }, [finish, weightTo]);

  return (
    <>
      <GradientEnvironment />
      <ambientLight intensity={0.3} />
      <directionalLight position={[4, 7, 3]} intensity={0.75} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -18]} material={material}>
        <planeGeometry args={[96, 96, 1, 1]} />
      </mesh>
    </>
  );
}
