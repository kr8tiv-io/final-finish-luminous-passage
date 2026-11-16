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
  float size = (0.085 + n * 0.085) * sizeMul;
  float angularDistance = max(abs(chipPoint.x) + abs(chipPoint.y) * 0.28, abs(chipPoint.y));
  float edgeWidth = max(fwidth(angularDistance) * 0.8, 0.004);
  float chip = (1.0 - smoothstep(size * 0.72 - edgeWidth, size + edgeWidth, angularDistance)) * step(0.20, n);
  vec3 col = n < 0.34 ? uA : n < 0.64 ? uB : uC;
  col += vec3(pow(n2, 15.0) * 0.28);
  vec3 base = mix(uA, uB, 0.16 + noise(uv * 8.0) * 0.08);
  return mix(base, col, chip);
}
vec3 marble(vec2 uv) {
  vec2 p = uv * vec2(3.4, 2.3);
  p += vec2(fbm(p * 1.5), fbm(p * 1.5 + 5.1)) * 0.9;
  float vein = abs(sin(p.x * 2.6 + fbm(p * 3.2) * 5.0));
  vein = pow(1.0 - vein, 9.0);
  float flow = fbm(uv * 4.2);
  vec3 col = mix(uA, uB, flow);
  col = mix(col, uC, vein);
  col += uC * vein * 0.45;
  return col;
}
vec3 ocean(vec2 uv) {
  float w1 = fbm(uv * 3.1);
  float w2 = fbm(uv * 6.0 + 3.4);
  float wave = sin(uv.x * 8.0 + uv.y * 2.4 + w1 * 7.0);
  vec3 col = mix(uA, uB, 0.35 + 0.5 * w1);
  col = mix(col, uC, smoothstep(0.2, 0.9, wave * 0.5 + 0.5) * 0.55);
  col += uC * pow(max(wave, 0.0), 10.0) * 0.45;
  col += vec3(pow(w2, 8.0) * 0.2);
  return col;
}
vec3 lava(vec2 uv) {
  float n = fbm(uv * 3.2);
  float vein = pow(fbm(uv * 6.4 + n), 2.8);
  vec3 col = mix(uA, uB, n);
  col = mix(col, uC, smoothstep(0.4, 0.82, vein));
  col += uC * pow(vein, 5.0) * 0.9;
  return col;
}
vec3 galaxy(vec2 uv) {
  float n = fbm(uv * 2.8);
  float neb = fbm(uv * 5.6 + 9.0);
  vec3 col = mix(uA, uB, n);
  col = mix(col, uC, pow(neb, 2.0) * 0.7);
  float star = hash21(floor(uv * 110.0));
  col += vec3(pow(star, 16.0));
  return col;
}
vec3 pearl(vec2 uv) {
  float n = fbm(uv * 2.4);
  vec3 col = mix(uA, uB, n);
  float shift = 0.5 + 0.5 * sin(n * 14.0 + uLight.x * 9.0);
  col = mix(col, uC, shift * 0.4);
  col += vec3(0.2, 0.18, 0.22) * pow(max(0.0, 1.0 - distance(uv, uLight)), 6.0);
  return col;
}
vec3 copperVein(vec2 uv) {
  float n = fbm(uv * 3.0);
  vec2 p = uv * vec2(2.8, 2.0) + n;
  float vein = pow(1.0 - abs(sin(p.x * 3.4 + fbm(p * 2.6) * 4.0)), 10.0);
  vec3 col = mix(uA, uB, n * 0.35);
  col = mix(col, uC, vein);
  col += uC * vein * 0.55;
  return col;
}
vec3 finishSample(vec2 uv) {
  if (uPattern > 8.5) return copperVein(uv);
  if (uPattern > 7.5) return pearl(uv);
  if (uPattern > 6.5) return galaxy(uv);
  if (uPattern > 5.5) return lava(uv);
  if (uPattern > 4.5) return ocean(uv);
  if (uPattern > 3.5) return marble(uv);
  if (uPattern > 2.5) {
    float n = fbm(uv * 18.0);
    return mix(uA, mix(uB, uC, uv.y), 0.22 + n * 0.12);
  }
  if (uPattern > 1.5) return flakeField(uv, uDensity * 1.6, 0.72);
  if (uPattern > 0.5) return flakeField(uv, uDensity * 0.55, 1.35);
  return flakeField(uv, uDensity, 1.0);
}
`;export{a as n,o as t};