function fnv(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseHex(hex) {
  const h = String(hex || "#888888").replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

const cache = new Map();

function makeFlakeCanvas(finish, size) {
  const id = (finish && finish.id) || "flake";
  const pixels = size === 1024 || size === 2048 ? size : 1024;
  const key = id + ":" + pixels;
  const cached = cache.get(key);
  if (cached) return cached;

  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const ctx = canvas.getContext("2d");
  const colors = ((finish && finish.colors) || ["#8a8076"]).map(parseHex);
  const pattern = (finish && finish.pattern) || "broadcast";
  const rand = mulberry32(fnv(key));
  const base = colors[0];
  ctx.fillStyle = "rgb(" + base[0] + "," + base[1] + "," + base[2] + ")";
  ctx.fillRect(0, 0, pixels, pixels);

  const chip =
    pattern === "large-flake" ? pixels * 0.014 : pattern === "fine" ? pixels * 0.0048 : pixels * 0.0082;
  const step = chip * (pattern === "large-flake" ? 0.72 : 0.66);
  const span = Math.ceil(pixels / step) + 1;

  function pick() {
    const weights = colors.map(function (_, i) {
      return i === 0 ? 1.4 : 1;
    });
    const sum = weights.reduce(function (a, b) {
      return a + b;
    }, 0);
    let x = rand() * sum;
    for (let i = 0; i < colors.length; i++) {
      x -= weights[i];
      if (x <= 0) return colors[i];
    }
    return colors[0];
  }

  function build() {
    const col = pick();
    const shade = 0.86 + rand() * 0.18;
    const rgb = col.map(function (c) {
      return Math.max(0, Math.min(255, Math.round(c * shade)));
    });
    const n = 4 + Math.floor(rand() * 3);
    const rot = rand() * Math.PI * 2;
    const rad = chip * (0.46 + rand() * 0.42);
    const pts = [];
    for (let k = 0; k < n; k++) {
      const a = rot + (k / n) * Math.PI * 2 + (rand() - 0.5) * 0.55;
      const rr = rad * (0.48 + rand() * 0.7);
      pts.push([Math.cos(a) * rr, Math.sin(a) * rr * (0.66 + rand() * 0.28)]);
    }
    return { rgb: rgb, pts: pts };
  }

  function draw(chipShape, ox, oy) {
    ctx.beginPath();
    for (let i = 0; i < chipShape.pts.length; i++) {
      const x = ox + chipShape.pts[i][0];
      const y = oy + chipShape.pts[i][1];
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    const c = chipShape.rgb;
    ctx.fillStyle = "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";
    ctx.fill();
  }

  function stamp(ox, oy, chipShape) {
    let reach = 2;
    for (let i = 0; i < chipShape.pts.length; i++) {
      reach = Math.max(reach, Math.abs(chipShape.pts[i][0]), Math.abs(chipShape.pts[i][1]));
    }
    const shifts = [[0, 0]];
    const left = ox - reach < 0;
    const right = ox + reach > pixels;
    const up = oy - reach < 0;
    const down = oy + reach > pixels;
    if (left) shifts.push([pixels, 0]);
    if (right) shifts.push([-pixels, 0]);
    if (up) shifts.push([0, pixels]);
    if (down) shifts.push([0, -pixels]);
    if (left && up) shifts.push([pixels, pixels]);
    if (right && down) shifts.push([-pixels, -pixels]);
    if (left && down) shifts.push([pixels, -pixels]);
    if (right && up) shifts.push([-pixels, pixels]);
    for (let i = 0; i < shifts.length; i++) draw(chipShape, ox + shifts[i][0], oy + shifts[i][1]);
  }

  for (let gy = 0; gy <= span; gy++) {
    for (let gx = 0; gx <= span; gx++) {
      const ox = (gx + (rand() - 0.5) * 0.8) * step;
      const oy = (gy + (rand() - 0.5) * 0.8) * step;
      stamp(ox, oy, build());
    }
  }

  cache.set(key, canvas);
  return canvas;
}

export { makeFlakeCanvas };
