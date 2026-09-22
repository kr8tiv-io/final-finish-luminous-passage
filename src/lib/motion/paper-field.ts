/**
 * The paper field: slow light tracers running down the page's grid lines
 * (2026-09-22, Matt: "some kind of light tracers, slow WebGL light tracers going down
 * some of those lines in the background, just for a little bit of added depth").
 *
 * One raw WebGL context on a fixed canvas that sits between the paper and the page
 * (`design-system.css`: body paper -> `.paper-grid` -> this -> content). Paper sections
 * are transparent, so the tracers show on paper and nowhere else: every film and
 * photograph is opaque and simply covers them.
 *
 * The grid is the CSS one (`--gutter`, `--grid-cols`), measured, so a tracer always runs
 * exactly on a drawn line. A few tracers live at a time; each is a bright hair-thin core
 * with a soft glow, a sharp head and a long tail fading up the line behind it, fading in
 * and out along its run. Drawn at 30 fps, paused while the tab is hidden, never started
 * for reduced motion, Save-Data, or the `still` tier. The canvas is `transition:persist`ed
 * with the layout, so this runs once for the whole visit.
 *
 * @motion light-tracer
 */
type Teardown = () => void;

interface Tracer {
  line: number;
  y: number;
  speed: number;
  length: number;
  peak: number;
}

const MAX_TRACERS = 8;
const FRAME_MS = 1000 / 30;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

// Everything in CSS pixels, y down. uT[i] = (line x px, head y px, tail px, intensity).
const FRAG = `
precision mediump float;
uniform vec2 uRes;
uniform float uDpr;
uniform vec4 uT[${MAX_TRACERS}];
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  float a = 0.0;
  float core = 0.0;
  for (int i = 0; i < ${MAX_TRACERS}; i++) {
    vec4 t = uT[i];
    if (t.w <= 0.0) continue;
    float dx = p.x - t.x;
    float dy = t.y - p.y;
    float tail = dy >= 0.0 ? exp(-dy / t.z) : exp(dy / 3.0);
    float c = exp(-(dx * dx) / 0.32) * tail * t.w;
    float g = exp(-(dx * dx) / 7.0) * tail * t.w * 0.24;
    // The head: a small bright point where the light is now.
    float h = exp(-(dx * dx + dy * dy) / 14.0) * t.w * 0.9;
    core += c + h;
    a += c + g + h * 0.6;
  }
  a = clamp(a, 0.0, 1.0);
  vec3 glow = vec3(0.42, 0.62, 0.8);
  vec3 hot = vec3(0.93, 0.97, 1.0);
  vec3 col = mix(glow, hot, clamp(core, 0.0, 1.0));
  gl_FragColor = vec4(col * a, a);
}
`;

let started = false;

export function initPaperField(): Teardown | undefined {
  if (started || typeof window === 'undefined') return undefined;
  const canvas = document.querySelector<HTMLCanvasElement>('canvas.paper-field');
  if (!canvas) return undefined;
  started = true;

  const html = document.documentElement;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData);
  const allowed = () => !reduced.matches && !saveData && html.dataset.journeyTier !== 'still';

  let gl: WebGLRenderingContext | null = null;
  let program: WebGLProgram | null = null;
  let uRes: WebGLUniformLocation | null = null;
  let uDpr: WebGLUniformLocation | null = null;
  let uT: WebGLUniformLocation | null = null;
  let frame = 0;
  let last = 0;
  let acc = 0;
  let spawnIn = 600;
  let width = 0;
  let height = 0;
  let dpr = 1;
  let gutter = 24;
  let cols = 6;
  let running = false;
  let drewEmpty = false;
  const tracers: Tracer[] = [];
  const data = new Float32Array(MAX_TRACERS * 4);

  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText = 'position:fixed;left:0;top:0;height:0;width:var(--gutter);visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);

  const measure = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    width = canvas.clientWidth || window.innerWidth;
    height = canvas.clientHeight || window.innerHeight;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    gutter = probe.offsetWidth || 24;
    cols = Number.parseFloat(getComputedStyle(html).getPropertyValue('--grid-cols')) || 6;
    gl?.viewport(0, 0, canvas.width, canvas.height);
  };

  const compile = (type: number, source: string) => {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    return shader;
  };

  const setup = () => {
    gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
    if (!gl) return false;
    program = gl.createProgram()!;
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    uRes = gl.getUniformLocation(program, 'uRes');
    uDpr = gl.getUniformLocation(program, 'uDpr');
    uT = gl.getUniformLocation(program, 'uT');
    gl.clearColor(0, 0, 0, 0);
    return true;
  };

  const spawn = () => {
    const taken = new Set(tracers.map((t) => t.line));
    const free: number[] = [];
    for (let line = 0; line <= cols; line += 1) if (!taken.has(line)) free.push(line);
    if (!free.length) return;
    const line = free[Math.floor(Math.random() * free.length)];
    const length = 70 + Math.random() * 110;
    tracers.push({
      line,
      y: -Math.random() * height * 0.35,
      speed: 34 + Math.random() * 46,
      length,
      peak: 0.4 + Math.random() * 0.35,
    });
  };

  const draw = () => {
    if (!gl) return;
    data.fill(0);
    const colW = (width - 2 * gutter) / cols;
    tracers.forEach((t, i) => {
      if (i >= MAX_TRACERS) return;
      const run = height + t.length;
      const u = Math.min(1, Math.max(0, (t.y + t.length * 0.2) / run));
      // Fade in over the first fifth of the run, out over the last fifth.
      const fade = Math.min(1, u / 0.2, (1 - u) / 0.2);
      data[i * 4] = gutter + t.line * colW + 0.5;
      data[i * 4 + 1] = t.y;
      data[i * 4 + 2] = t.length;
      data[i * 4 + 3] = Math.max(0, fade) * t.peak;
    });
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uDpr, dpr);
    gl.uniform4fv(uT, data);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const tick = (now: number) => {
    frame = window.requestAnimationFrame(tick);
    const dt = last ? Math.min(100, now - last) : 16;
    last = now;
    acc += dt;
    if (acc < FRAME_MS) return;
    const step = acc / 1000;
    acc = 0;
    spawnIn -= step * 1000;
    if (spawnIn <= 0 && tracers.length < Math.min(MAX_TRACERS, 5)) {
      spawn();
      spawnIn = 1400 + Math.random() * 2600;
    }
    for (let i = tracers.length - 1; i >= 0; i -= 1) {
      const t = tracers[i];
      t.y += t.speed * step;
      if (t.y - t.length > height) tracers.splice(i, 1);
    }
    if (!tracers.length) {
      if (!drewEmpty && gl) { gl.clear(gl.COLOR_BUFFER_BIT); drewEmpty = true; }
      return;
    }
    drewEmpty = false;
    draw();
  };

  const start = () => {
    if (running || !gl || !allowed() || document.hidden) return;
    running = true;
    last = 0;
    canvas.setAttribute('data-live', '');
    frame = window.requestAnimationFrame(tick);
  };
  const stop = () => {
    running = false;
    window.cancelAnimationFrame(frame);
    canvas.removeAttribute('data-live');
  };
  const reconsider = () => { if (allowed() && !document.hidden) start(); else stop(); };

  if (!setup()) {
    probe.remove();
    return undefined;
  }
  measure();
  // Two tracers are already on their way when the page first appears.
  spawn();
  spawn();
  tracers.forEach((t) => { t.y = Math.random() * height * 0.6; });

  const onResize = () => { measure(); if (running) draw(); };
  const onLost = (event: Event) => { event.preventDefault(); stop(); };
  const onRestored = () => { if (setup()) { measure(); reconsider(); } };
  const tierObserver = new MutationObserver(reconsider);
  tierObserver.observe(html, { attributeFilter: ['data-journey-tier'] });
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', reconsider);
  reduced.addEventListener('change', reconsider);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  reconsider();

  return () => {
    stop();
    tierObserver.disconnect();
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', reconsider);
    reduced.removeEventListener('change', reconsider);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    probe.remove();
    started = false;
  };
}
