import type { Size } from './image-geometry';

export type MaskDetectionResult =
  | { status: 'detected'; photoRevision: string; mask: { dataUrl: string; width: number; height: number } }
  | { status: 'uncertain' | 'no-floor'; photoRevision: string };

export type InspectMask = (url: string, signal?: AbortSignal) => Promise<Size>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function positiveDimension(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function providerMaskUrl(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (!isRecord(value)) return null;
  if (typeof value.url === 'string' && value.url.length > 0) return value.url;
  if (isRecord(value.image) && typeof value.image.url === 'string' && value.image.url.length > 0) return value.image.url;
  return null;
}

export async function adaptMaskResponse(
  payload: unknown,
  requestedRevision: string,
  inspectMask: InspectMask = inspectMaskSource,
  signal?: AbortSignal,
): Promise<MaskDetectionResult> {
  if (!isRecord(payload)) throw new Error('MASK_RESPONSE_INVALID');
  if (payload.status === 'uncertain' || payload.status === 'no-floor') {
    if (typeof payload.photoRevision !== 'string') throw new Error('MASK_RESPONSE_INVALID');
    return { status: payload.status, photoRevision: payload.photoRevision };
  }
  if (payload.status === 'detected') {
    if (typeof payload.photoRevision !== 'string' || !isRecord(payload.mask)
      || typeof payload.mask.dataUrl !== 'string'
      || !positiveDimension(payload.mask.width) || !positiveDimension(payload.mask.height)) {
      throw new Error('MASK_RESPONSE_INVALID');
    }
    return {
      status: 'detected',
      photoRevision: payload.photoRevision,
      mask: { dataUrl: payload.mask.dataUrl, width: payload.mask.width, height: payload.mask.height },
    };
  }

  if (Array.isArray(payload.masks)) {
    const url = providerMaskUrl(payload.masks[0]);
    if (!url) return { status: 'no-floor', photoRevision: requestedRevision };
    const size = await inspectMask(url, signal);
    return { status: 'detected', photoRevision: requestedRevision, mask: { dataUrl: url, ...size } };
  }
  throw new Error('MASK_RESPONSE_INVALID');
}

export function inspectMaskSource(url: string, signal?: AbortSignal): Promise<Size> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      image.src = '';
      cleanup();
      reject(new DOMException('Mask inspection aborted.', 'AbortError'));
    };
    image.onload = () => {
      const size = { width: image.naturalWidth, height: image.naturalHeight };
      cleanup();
      resolve(size);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('MASK_IMAGE_UNAVAILABLE'));
    };
    if (signal?.aborted) return onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    image.decoding = 'async';
    image.src = url;
  });
}
