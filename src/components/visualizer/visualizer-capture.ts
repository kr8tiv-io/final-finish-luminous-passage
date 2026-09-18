/**
 * Local capture helpers. Both the magnifier lens and "Save this floor" read the same
 * stage layers and composite them on a 2D canvas in this browser — no server, no upload.
 */

export interface StageRegion {
  /** Source rectangle in stage CSS pixels. */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Destination size in device pixels. */
  dw: number;
  dh: number;
}

export type FinishColors = readonly [string, string, string];

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/** `object-fit: contain` in numbers, so the photo lands where the browser painted it. */
function containedRect(natural: { width: number; height: number }, box: { width: number; height: number }) {
  if (!natural.width || !natural.height) return { x: 0, y: 0, width: box.width, height: box.height };
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height };
}

/**
 * The still fallback for browsers with no live renderer: a deterministic chip field in
 * the finish's own three colours. It is an approximation of the finish, never a claim.
 */
export function paintChipField(
  context: CanvasRenderingContext2D,
  colors: FinishColors,
  width: number,
  height: number,
): void {
  const random = seeded(0x10ca_11ed);
  const base = context.createLinearGradient(0, 0, width, height);
  base.addColorStop(0, colors[0]);
  base.addColorStop(0.62, colors[1]);
  base.addColorStop(1, colors[0]);
  context.fillStyle = base;
  context.fillRect(0, 0, width, height);
  const chips = Math.round((width * height) / 900);
  for (let index = 0; index < chips; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const size = (2 + random() * 7) * (0.5 + (y / height));
    const pick = random();
    context.globalAlpha = 0.28 + random() * 0.5;
    context.fillStyle = pick < 0.34 ? colors[2] : pick < 0.72 ? colors[1] : colors[0];
    context.beginPath();
    context.ellipse(x, y, size, size * (0.45 + random() * 0.5), random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

/**
 * Composites the stage's own painted layers — the local photo, then the live preview
 * canvas — into `context`, cropped to `region` and scaled to the destination size.
 * Returns false when no live layer could be drawn, so callers can fall back.
 */
export function drawStageRegion(
  context: CanvasRenderingContext2D,
  stage: HTMLElement,
  region: StageRegion,
  colors: FinishColors,
): boolean {
  const stageRect = stage.getBoundingClientRect();
  const scale = region.dw / Math.max(1, region.sw);
  context.save();
  context.fillStyle = '#17222a';
  context.fillRect(0, 0, region.dw, region.dh);

  let painted = false;
  // `data-capture-skip` keeps the lens from drawing itself.
  const layers = [...stage.querySelectorAll<HTMLImageElement | HTMLCanvasElement>(
    'img:not([data-capture-skip]), canvas:not([data-capture-skip])',
  )];
  for (const layer of layers) {
    const rect = layer.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;
    const left = rect.left - stageRect.left;
    const top = rect.top - stageRect.top;
    let box = { x: left, y: top, width: rect.width, height: rect.height };
    if (layer instanceof HTMLImageElement) {
      if (!layer.complete || !layer.naturalWidth) continue;
      const fitted = containedRect({ width: layer.naturalWidth, height: layer.naturalHeight }, { width: rect.width, height: rect.height });
      box = { x: left + fitted.x, y: top + fitted.y, width: fitted.width, height: fitted.height };
    } else if (!layer.width || !layer.height) {
      continue;
    }
    try {
      context.drawImage(
        layer,
        (box.x - region.sx) * scale,
        (box.y - region.sy) * scale,
        box.width * scale,
        box.height * scale,
      );
      painted = true;
    } catch {
      // A layer that cannot be read (tainted or lost context) is simply skipped.
    }
  }

  if (!painted) {
    paintChipField(context, colors, region.dw, region.dh);
  }
  context.restore();
  return painted;
}

export interface FloorCaptureOptions {
  finishName: string;
  family: string;
  colors: FinishColors;
  /** Output width in pixels. */
  width?: number;
}

/** Renders the current floor plus its finish name to a PNG blob, entirely on this device. */
export async function captureFloorPng(stage: HTMLElement, options: FloorCaptureOptions): Promise<Blob | null> {
  const rect = stage.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return null;
  const width = Math.round(options.width ?? 1_400);
  const imageHeight = Math.round(width * (rect.height / rect.width));
  const plate = Math.max(88, Math.round(width * 0.085));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = imageHeight + plate;
  const context = canvas.getContext('2d');
  if (!context) return null;

  drawStageRegion(
    context,
    stage,
    { sx: 0, sy: 0, sw: rect.width, sh: rect.height, dw: width, dh: imageHeight },
    options.colors,
  );

  context.fillStyle = '#17222a';
  context.fillRect(0, imageHeight, width, plate);
  context.fillStyle = '#faf9f6';
  context.textBaseline = 'middle';
  const gutter = Math.round(width * 0.028);
  context.font = `500 ${Math.round(plate * 0.38)}px Manrope, system-ui, sans-serif`;
  context.fillText(options.finishName, gutter, imageHeight + plate * 0.38);
  context.fillStyle = 'rgba(250,249,246,.72)';
  context.font = `600 ${Math.round(plate * 0.21)}px Manrope, system-ui, sans-serif`;
  context.fillText(
    `${options.family.toUpperCase()} INSPIRATION FINISH · FINAL FINISH EPOXY · NOT A PHYSICAL SAMPLE`,
    gutter,
    imageHeight + plate * 0.74,
  );

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

/** Triggers a local download of a blob and releases the object URL afterwards. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
