import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  THRESHOLD_DISPLAY_FRAGMENT_SHADER,
  THRESHOLD_DISPLAY_VERTEX_SHADER,
  IMPORTED_LIGHT_INTENSITY_SCALE,
  calibrateImportedLights,
  createThresholdRenderTarget,
  startDeterministicClip,
} from './journey-threshold-three';

describe('threshold Three.js playback contract', () => {
  it('lets mixer.setTime deterministically sample the authored camera track', () => {
    const root = new THREE.Group();
    const camera = new THREE.PerspectiveCamera();
    camera.name = 'FFT_Experience_Camera';
    root.add(camera);
    const track = new THREE.NumberKeyframeTrack('FFT_Experience_Camera.position[x]', [0, 1], [0, 5]);
    const clip = new THREE.AnimationClip('FFT_Garage_To_Vault', 1, [track]);
    const mixer = new THREE.AnimationMixer(root);
    const action = startDeterministicClip(mixer, clip);

    mixer.setTime(0.5);
    expect(action.paused).toBe(false);
    expect(camera.position.x).toBeCloseTo(2.5);
  });

  it('renders the offscreen target directly in clip space', () => {
    expect(THRESHOLD_DISPLAY_VERTEX_SHADER).toContain('gl_Position = vec4(position.xy, 0.0, 1.0)');
    expect(THRESHOLD_DISPLAY_VERTEX_SHADER).not.toContain('projectionMatrix');
  });

  it('keeps bright PBR range until the display pass tone maps it', () => {
    const target = createThresholdRenderTarget();
    expect(target.texture.type).toBe(THREE.HalfFloatType);
    expect(THRESHOLD_DISPLAY_FRAGMENT_SHADER).toContain('#include <tonemapping_fragment>');
    expect(THRESHOLD_DISPLAY_FRAGMENT_SHADER.indexOf('#include <tonemapping_fragment>')).toBeLessThan(
      THRESHOLD_DISPLAY_FRAGMENT_SHADER.indexOf('#include <colorspace_fragment>'),
    );
    target.dispose();
  });

  it('undoes Blender glTF photometric export scaling exactly once without changing emissions', () => {
    const root = new THREE.Group();
    const sun = new THREE.DirectionalLight(0xffffff, 1_639.2);
    const point = new THREE.PointLight(0xffffff, 22_827.59);
    const material = new THREE.MeshStandardMaterial({ emissive: 0x8f7252, emissiveIntensity: 0.08 });
    root.add(sun, point, new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));

    calibrateImportedLights(root);
    calibrateImportedLights(root);

    expect(IMPORTED_LIGHT_INTENSITY_SCALE).toBeCloseTo(1 / 683);
    expect(sun.intensity).toBeCloseTo(2.4, 4);
    expect(point.intensity).toBeCloseTo(22_827.59 / 683, 4);
    expect(material.emissiveIntensity).toBe(0.08);
    material.dispose();
  });
});
