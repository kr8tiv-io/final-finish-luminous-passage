import * as THREE from 'three';

export const IMPORTED_LIGHT_INTENSITY_SCALE = 1 / 683;
const CALIBRATED_LIGHT_KEY = 'followFloorPhotometricCalibration';

export function calibrateImportedLights(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.Light) || object.userData[CALIBRATED_LIGHT_KEY]) return;
    object.intensity *= IMPORTED_LIGHT_INTENSITY_SCALE;
    object.userData[CALIBRATED_LIGHT_KEY] = true;
  });
}

export const THRESHOLD_DISPLAY_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const THRESHOLD_DISPLAY_FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uScene;
uniform float uOpacity;
varying vec2 vUv;
void main() {
  vec4 sceneColor = texture2D(uScene, vUv);
  gl_FragColor = vec4(sceneColor.rgb, uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createThresholdRenderTarget(): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
  });
}

export function startDeterministicClip(mixer: THREE.AnimationMixer, clip: THREE.AnimationClip): THREE.AnimationAction {
  const action = mixer.clipAction(clip);
  action.reset();
  action.play();
  action.paused = false;
  return action;
}
