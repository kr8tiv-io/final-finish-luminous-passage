import{n as e,r as t,t as n}from"./homography.CUg6OOu8.js";var r=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];function i(i){let a=t(i);if(!a.ok)throw Error(`Invalid floor quad: ${a.reason}`);return e(n(r,i))}function a(e){try{return i(e)}catch{return null}}var o=`
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uC;
uniform float uDensity;
uniform float uPattern;
uniform float uReveal;
uniform vec2 uLight;

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.07;
    a *= 0.5;
  }
  return v;
}
vec3 flakeField(vec2 uv, float density, float sizeMul) {
  vec2 gid = floor(uv * density);
  float n = hash21(gid);
  float n2 = hash21(gid + 19.7);
  vec2 jitter = vec2(hash21(gid + 7.1), hash21(gid + 31.3)) - 0.5;
  vec2 chipPoint = fract(uv * density) - 0.5 - jitter * 0.42;
  float angle = n2 * 6.2831853;
  mat2 chipRotation = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
  chipPoint = chipRotation * chipPoint;
  chipPoint.y *= 1.25 + hash21(gid + 51.7) * 0.7;
  float size = (0.03 + n * 0.018) * sizeMul;
  float angularDistance = max(abs(chipPoint.x) + abs(chipPoint.y) * 0.28, abs(chipPoint.y));
  float edgeWidth = max(fwidth(angularDistance) * 0.8, 0.004);
  float chip = (1.0 - smoothstep(size * 0.72 - edgeWidth, size + edgeWidth, angularDistance)) * step(0.20, n);
  vec3 col = n < 0.34 ? uA : n < 0.64 ? uB : uC;
  col += vec3(pow(n2, 15.0) * 0.02);
  vec3 base = mix(uA, uB, 0.16 + noise(uv * 8.0) * 0.08);
  return mix(base, col, chip);
}
vec3 finishSample(vec2 uv) {
  // 2 fine stone-look, 1 large broadcast, 0 standard broadcast.
  if (uPattern > 1.5) return flakeField(uv, uDensity * 1.6, 0.72);
  if (uPattern > 0.5) return flakeField(uv, uDensity * 0.55, 1.35);
  return flakeField(uv, uDensity, 1.0);
}
`;export{a as n,o as t};