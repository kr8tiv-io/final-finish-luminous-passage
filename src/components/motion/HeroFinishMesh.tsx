import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { FINISH_SHADER_CHUNK } from '../../lib/visualizer/finish-shader';
import { PATTERN_CODE } from '../../lib/visualizer/finishes';
import { journeyControls, type MotionPreference } from '../../lib/motion/journey-controls';
import { JOURNEY_COMPOSITOR_READY_EVENT, journeyDirector } from '../../lib/motion/journey-director';
import {
  HERO_FINISH_DENSITY,
  HERO_FLOOR_POLYGON,
  HERO_IMAGE_TO_FINISH,
  HERO_IMAGE_URL,
  heroFinishForId,
  heroFinishReferenceLuma,
  heroFramePlacement,
  heroMaterialOpacity,
  type HeroFrameMetric,
} from '../../lib/motion/journey-hero';
import { coverUvTransform } from '../../lib/motion/journey-media';

export const HERO_FINISH_VERTEX_SHADER = /* glsl */ `
varying vec2 vHeroUv;
varying vec2 vFinishUv;
void main() {
  vHeroUv = uv;
  vFinishUv = uv;
  vec4 clipPosition = modelMatrix * vec4(position.xy, 0.0, 1.0);
  gl_Position = vec4(clipPosition.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uHeroImage;
uniform vec2 uImageScale;
uniform vec2 uImageOffset;
uniform vec2 uTexel;
uniform mat3 uImageToFinish;
uniform vec2 uFloorPolygon[15];
uniform float uOpacity;
uniform float uFinishReferenceLuma;
varying vec2 vHeroUv;
varying vec2 vFinishUv;
${FINISH_SHADER_CHUNK}

float segmentDistance(vec2 point, vec2 start, vec2 end) {
  vec2 edge = end - start;
  float amount = clamp(dot(point - start, edge) / max(dot(edge, edge), 0.000001), 0.0, 1.0);
  return length(point - (start + edge * amount));
}

float floorMask(vec2 point) {
  float inside = 0.0;
  float edgeDistance = 1.0;
  vec2 previous = uFloorPolygon[14];
  for (int index = 0; index < 15; index++) {
    vec2 current = uFloorPolygon[index];
    bool crosses = ((current.y > point.y) != (previous.y > point.y))
      && point.x < (previous.x - current.x) * (point.y - current.y)
        / (previous.y - current.y) + current.x;
    if (crosses) inside = 1.0 - inside;
    edgeDistance = min(edgeDistance, segmentDistance(point, previous, current));
    previous = current;
  }
  return inside * smoothstep(0.0, 0.006, edgeDistance);
}

void main() {
  vec2 sampledUv = vHeroUv * uImageScale + uImageOffset;
  vec2 imageUv = vec2(sampledUv.x, 1.0 - sampledUv.y);
  vec3 mapped = uImageToFinish * vec3(imageUv, 1.0);
  vec2 finishUv = mapped.xy / max(abs(mapped.z), 0.00001);
  vec3 source = texture2D(uHeroImage, sampledUv).rgb;
  float sourceLuma = dot(source, vec3(0.299, 0.587, 0.114));
  float lowLuma = sourceLuma;
  lowLuma += dot(texture2D(uHeroImage, sampledUv + vec2(uTexel.x * 7.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  lowLuma += dot(texture2D(uHeroImage, sampledUv - vec2(uTexel.x * 7.0, 0.0)).rgb, vec3(0.299, 0.587, 0.114));
  lowLuma += dot(texture2D(uHeroImage, sampledUv + vec2(0.0, uTexel.y * 7.0)).rgb, vec3(0.299, 0.587, 0.114));
  lowLuma += dot(texture2D(uHeroImage, sampledUv - vec2(0.0, uTexel.y * 7.0)).rgb, vec3(0.299, 0.587, 0.114));
  lowLuma *= 0.2;

  vec3 finish = finishSample(finishUv);
  vec3 replacement = finish * ((0.34 + lowLuma * 0.92) / max(0.2, uFinishReferenceLuma));
  replacement += vec3(clamp(sourceLuma - lowLuma, -0.05, 0.16) * 0.42);
  replacement = clamp(replacement, 0.0, 1.0);

  float alpha = floorMask(imageUv) * uOpacity;
  gl_FragColor = vec4(replacement, alpha);
  #include <colorspace_fragment>
}
`;

function matrix3(values: readonly number[]): THREE.Matrix3 {
  return new THREE.Matrix3().set(
    values[0], values[1], values[2],
    values[3], values[4], values[5],
    values[6], values[7], values[8],
  );
}

function readFrameMetric(): HeroFrameMetric | null {
  const frame = document.querySelector<HTMLElement>('.journey [data-journey-chapter="portico"] .hero-frame');
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  const fixed = getComputedStyle(frame).position === 'fixed';
  return {
    left: rect.left + (fixed ? 0 : window.scrollX),
    top: rect.top + (fixed ? 0 : window.scrollY),
    width: rect.width,
    height: rect.height,
    fixed,
  };
}

export default function HeroFinishMesh({ motionEnabled }: { motionEnabled: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  const snapshot = useSyncExternalStore(
    journeyDirector.subscribe,
    journeyDirector.getSnapshot,
    journeyDirector.getServerSnapshot,
  );
  const controls = useSyncExternalStore(
    journeyControls.subscribe,
    journeyControls.getSnapshot,
    journeyControls.getServerSnapshot,
  );
  const [frame, setFrame] = useState<HeroFrameMetric | null>(null);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [objectPosition, setObjectPosition] = useState<readonly [number, number]>([0.55, 0.58]);
  const finish = heroFinishForId(controls.selectedFinish);
  const effectivePreference: MotionPreference = motionEnabled ? controls.motionPreference : 'still';
  const opacity = heroMaterialOpacity(snapshot, effectivePreference);
  const placement = frame ? heroFramePlacement(frame, {
    scrollY: snapshot.scrollY,
    viewportWidth: snapshot.viewportWidth || 1,
    viewportHeight: snapshot.viewportHeight || 1,
  }) : null;

  const uniforms = useMemo(() => ({
    uHeroImage: { value: null as THREE.Texture | null },
    uImageScale: { value: new THREE.Vector2(1, 1) },
    uImageOffset: { value: new THREE.Vector2(0, 0) },
    uTexel: { value: new THREE.Vector2(1 / 1_680, 1 / 945) },
    uImageToFinish: { value: matrix3(HERO_IMAGE_TO_FINISH) },
    uFloorPolygon: { value: HERO_FLOOR_POLYGON.map(({ x, y }) => new THREE.Vector2(x, y)) },
    uOpacity: { value: 0 },
    uFinishReferenceLuma: { value: heroFinishReferenceLuma(finish) },
    uA: { value: new THREE.Color(finish.colors[0]) },
    uB: { value: new THREE.Color(finish.colors[1]) },
    uC: { value: new THREE.Color(finish.colors[2]) },
    uDensity: { value: HERO_FINISH_DENSITY / finish.scale },
    uPattern: { value: PATTERN_CODE[finish.pattern] },
    uReveal: { value: 1 },
    uLight: { value: new THREE.Vector2(0.62, 0.28) },
  }), []);
  const material = useMemo(() => new THREE.ShaderMaterial({
    uniforms,
    vertexShader: HERO_FINISH_VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  }), [uniforms]);

  useEffect(() => {
    let disposed = false;
    const loaded = new THREE.TextureLoader().load(HERO_IMAGE_URL, (next) => {
      if (disposed) {
        next.dispose();
        return;
      }
      next.colorSpace = THREE.SRGBColorSpace;
      next.minFilter = THREE.LinearFilter;
      next.magFilter = THREE.LinearFilter;
      next.generateMipmaps = false;
      setTexture(next);
      invalidate();
    });
    return () => {
      disposed = true;
      loaded.dispose();
    };
  }, [invalidate]);

  useEffect(() => {
    const heroFrame = document.querySelector<HTMLElement>('.journey [data-journey-chapter="portico"] .hero-frame');
    if (!heroFrame) return;
    const measure = () => {
      setFrame(readFrameMetric());
      const image = heroFrame.querySelector('img');
      const values = image ? getComputedStyle(image).objectPosition.split(/\s+/).map((value) => Number.parseFloat(value) / 100) : [];
      setObjectPosition([
        Number.isFinite(values[0]) ? values[0] : 0.55,
        Number.isFinite(values[1]) ? values[1] : 0.58,
      ]);
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    resize?.observe(heroFrame);
    window.addEventListener(JOURNEY_COMPOSITOR_READY_EVENT, measure);
    window.addEventListener('resize', measure, { passive: true });
    document.addEventListener('load', measure, true);
    measure();
    return () => {
      resize?.disconnect();
      window.removeEventListener(JOURNEY_COMPOSITOR_READY_EVENT, measure);
      window.removeEventListener('resize', measure);
      document.removeEventListener('load', measure, true);
    };
  }, []);

  useEffect(() => {
    if (!texture || !frame) return;
    uniforms.uHeroImage.value = texture;
    const uv = coverUvTransform(1_680, 945, frame.width, frame.height, objectPosition);
    uniforms.uImageScale.value.set(...uv.scale);
    uniforms.uImageOffset.value.set(...uv.offset);
    uniforms.uOpacity.value = opacity;
    uniforms.uA.value.set(finish.colors[0]);
    uniforms.uB.value.set(finish.colors[1]);
    uniforms.uC.value.set(finish.colors[2]);
    uniforms.uDensity.value = HERO_FINISH_DENSITY / finish.scale;
    uniforms.uPattern.value = PATTERN_CODE[finish.pattern];
    uniforms.uFinishReferenceLuma.value = heroFinishReferenceLuma(finish);
    invalidate();
  }, [finish, frame, invalidate, objectPosition, opacity, texture, uniforms]);

  useEffect(() => () => material.dispose(), [material]);

  if (!texture || !placement || !placement.visible || opacity <= 0) return null;
  return (
    <mesh
      position={[placement.position[0], placement.position[1], 0.1]}
      scale={[placement.scale[0], placement.scale[1], 1]}
      renderOrder={1}
    >
      <planeGeometry args={[2, 2]} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}
