import type { Point } from './homography';
import { decodePhotoBitmap, MAX_PHOTO_BYTES, MAX_PHOTO_PIXELS, resolvePhotoType } from './photo-header';
export { MAX_PHOTO_BYTES, MAX_PHOTO_PIXELS } from './photo-header';

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

type PhotoValidation = { ok: true } | {
  ok: false;
  code: 'HEIC_UNSUPPORTED' | 'UNSUPPORTED_IMAGE' | 'IMAGE_TOO_LARGE' | 'IMAGE_TOO_MANY_PIXELS' | 'INVALID_IMAGE_DIMENSIONS';
};

const HEIC_TYPES = new Set(['image/heic', 'image/heif']);
export const LOCAL_PREVIEW_MAX_EDGE = 2_048;

export function validateLocalPhoto(file: { type: string; size: number; name?: string }): PhotoValidation {
  const type = resolvePhotoType(file);
  if (type && HEIC_TYPES.has(type)) return { ok: false, code: 'HEIC_UNSUPPORTED' };
  if (!type) return { ok: false, code: 'UNSUPPORTED_IMAGE' };
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) return { ok: false, code: 'IMAGE_TOO_LARGE' };
  return { ok: true };
}

export function validateDecodedImage(size: Size): PhotoValidation {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    return { ok: false, code: 'INVALID_IMAGE_DIMENSIONS' };
  }
  if (size.width * size.height > MAX_PHOTO_PIXELS) return { ok: false, code: 'IMAGE_TOO_MANY_PIXELS' };
  return { ok: true };
}

export function fitWithin(size: Size, maxEdge: number): Size {
  const scale = Math.min(1, maxEdge / Math.max(size.width, size.height));
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

export function containRect(container: Size, image: Size): Rect {
  if (validateDecodedImage(container).ok === false || validateDecodedImage(image).ok === false) {
    throw new Error('Image and container dimensions must be positive.');
  }
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return { x: (container.width - width) / 2, y: (container.height - height) / 2, width, height };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function stagePointToImage(point: Point, imageRect: Rect): Point {
  return {
    x: clamp01((point.x - imageRect.x) / imageRect.width),
    y: clamp01((point.y - imageRect.y) / imageRect.height),
  };
}

export function imagePointToStagePercent(point: Point, imageRect: Rect, container: Size): Point {
  return {
    x: ((imageRect.x + clamp01(point.x) * imageRect.width) / container.width) * 100,
    y: ((imageRect.y + clamp01(point.y) * imageRect.height) / container.height) * 100,
  };
}

export function validateMaskGeometry(image: Size, mask: Size): { ok: true } | { ok: false; code: 'MASK_DIMENSIONS_INVALID' | 'MASK_ORIENTATION_MISMATCH' | 'MASK_ASPECT_MISMATCH' } {
  if (![image.width, image.height, mask.width, mask.height].every((value) => Number.isFinite(value) && value > 0)) {
    return { ok: false, code: 'MASK_DIMENSIONS_INVALID' };
  }
  const imageLandscape = image.width >= image.height;
  const maskLandscape = mask.width >= mask.height;
  if (imageLandscape !== maskLandscape) return { ok: false, code: 'MASK_ORIENTATION_MISMATCH' };
  const imageAspect = image.width / image.height;
  const maskAspect = mask.width / mask.height;
  if (Math.abs(imageAspect - maskAspect) / imageAspect > 0.03) return { ok: false, code: 'MASK_ASPECT_MISMATCH' };
  return { ok: true };
}

export async function decodePhotoSize(file: File, signal?: AbortSignal): Promise<Size> {
  const bitmap = await decodePhotoBitmap(file, signal);
  try {
    return { width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

function abortError(message: string): DOMException {
  return new DOMException(message, 'AbortError');
}

async function prepareJpegBlob(file: File, signal: AbortSignal): Promise<{ blob: Blob; size: Size }> {
  if (signal.aborted) throw abortError('Photo preparation aborted.');
  const bitmap = await decodePhotoBitmap(file, signal);
  try {
    if (signal.aborted) throw abortError('Photo preparation aborted.');
    const decoded = { width: bitmap.width, height: bitmap.height };
    const validation = validateDecodedImage(decoded);
    if (!validation.ok) throw new Error(validation.code);
    const size = fitWithin(decoded, LOCAL_PREVIEW_MAX_EDGE);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('PHOTO_CANVAS_UNAVAILABLE');
    context.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PHOTO_ENCODE_FAILED')), 'image/jpeg', 0.88);
    });
    if (signal.aborted) throw abortError('Photo preparation aborted.');
    return { blob, size };
  } finally {
    bitmap.close();
  }
}

export async function prepareLocalPreviewPhoto(file: File, signal: AbortSignal): Promise<{ blob: Blob; size: Size }> {
  return prepareJpegBlob(file, signal);
}

export async function prepareDetectionPhoto(file: File, signal: AbortSignal): Promise<{ file: File; size: Size }> {
  const prepared = await prepareJpegBlob(file, signal);
  return { file: new File([prepared.blob], 'visualizer-photo.jpg', { type: 'image/jpeg' }), size: prepared.size };
}
