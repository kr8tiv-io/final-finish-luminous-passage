import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { journeyDirector } from '../../lib/motion/journey-director';
import { thresholdFrame } from '../../lib/motion/journey-threshold';
import {
  THRESHOLD_DISPLAY_FRAGMENT_SHADER,
  THRESHOLD_DISPLAY_VERTEX_SHADER,
  calibrateImportedLights,
  createThresholdRenderTarget,
  startDeterministicClip,
} from '../../lib/motion/journey-threshold-three';

const SCENE_URL = '/scenes/follow-floor-threshold/scene.glb';
const CAMERA_NODE = 'FFT_Experience_Camera';
const CAMERA_CLIP = 'FFT_Garage_To_Vault';

function disposeSceneResources(scene: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value instanceof THREE.Texture) textures.add(value);
      });
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

export default function ThresholdTravel({ motionEnabled, onReady }: {
  readonly motionEnabled: boolean;
  readonly onReady: () => void;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const size = useThree((state) => state.size);
  const gl = useThree((state) => state.gl);
  const snapshot = useSyncExternalStore(
    journeyDirector.subscribe,
    journeyDirector.getSnapshot,
    journeyDirector.getServerSnapshot,
  );
  const gltf = useGLTF(SCENE_URL);
  const scene = useMemo(() => {
    const clone = gltf.scene.clone(true);
    calibrateImportedLights(clone);
    return clone;
  }, [gltf.scene]);
  const camera = useMemo(() => {
    const found = scene.getObjectByName(CAMERA_NODE);
    if (!(found instanceof THREE.PerspectiveCamera)) throw new Error(`Threshold GLB is missing ${CAMERA_NODE}.`);
    return found;
  }, [scene]);
  const clip = useMemo(() => {
    const found = gltf.animations.find((animation) => animation.name === CAMERA_CLIP);
    if (!found) throw new Error(`Threshold GLB is missing ${CAMERA_CLIP}.`);
    return found;
  }, [gltf.animations]);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const target = useMemo(() => createThresholdRenderTarget(), []);
  const displayMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uScene: { value: target.texture },
      uOpacity: { value: 0 },
    },
    vertexShader: THRESHOLD_DISPLAY_VERTEX_SHADER,
    fragmentShader: THRESHOLD_DISPLAY_FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: true,
  }), [target.texture]);
  const desiredProgress = useRef(0);
  const frame = thresholdFrame(snapshot, motionEnabled);
  const frameVisible = useRef(false);

  useEffect(() => {
    const action = startDeterministicClip(mixer, clip);
    mixer.setTime(0);
    onReady();
    invalidate();
    return () => {
      action.stop();
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
      disposeSceneResources(scene);
      useGLTF.clear(SCENE_URL);
    };
  }, [clip, invalidate, mixer, onReady, scene]);

  useEffect(() => {
    desiredProgress.current = frame.progress;
    frameVisible.current = frame.visible;
    displayMaterial.uniforms.uOpacity.value = frame.opacity;
    if (frame.visible) invalidate();
  }, [displayMaterial, frame.opacity, frame.progress, frame.visible, invalidate]);

  useEffect(() => {
    const dpr = Math.min(1.5, gl.getPixelRatio());
    target.setSize(Math.max(1, Math.round(size.width * dpr)), Math.max(1, Math.round(size.height * dpr)));
    camera.aspect = size.width / Math.max(1, size.height);
    camera.updateProjectionMatrix();
    if (frame.visible) invalidate();
  }, [camera, frame.visible, gl, invalidate, size.height, size.width, target]);

  useFrame(({ gl: renderer }) => {
    if (!frameVisible.current) return;
    mixer.setTime(desiredProgress.current * clip.duration);
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const previousTarget = renderer.getRenderTarget();
    const previousColor = renderer.getClearColor(new THREE.Color());
    const previousAlpha = renderer.getClearAlpha();
    try {
      renderer.setRenderTarget(target);
      renderer.setClearColor(0xf4f1e9, 1);
      renderer.clear(true, true, false);
      renderer.render(scene, camera);
    } finally {
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(previousColor, previousAlpha);
    }
  }, -10);

  useEffect(() => () => {
    displayMaterial.dispose();
    target.dispose();
  }, [displayMaterial, target]);

  return (
    <mesh visible={frame.visible} position={[0, 0, 0.2]} renderOrder={3}>
      <planeGeometry args={[2, 2]} />
      <primitive object={displayMaterial} attach="material" />
    </mesh>
  );
}
