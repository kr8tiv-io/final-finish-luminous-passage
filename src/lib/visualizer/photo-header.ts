export const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTO_PIXELS = 48_000_000;

type PhotoSize = { width: number; height: number };
type ResolvedPhotoType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/heic' | 'image/heif';
const JPEG_FRAMES = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
const invalidHeader = (): never => { throw new Error('INVALID_IMAGE_HEADER'); };

function boundedSize(size: PhotoSize): PhotoSize {
  if (!Number.isInteger(size.width) || !Number.isInteger(size.height) || size.width <= 0 || size.height <= 0) invalidHeader();
  if (size.width * size.height > MAX_PHOTO_PIXELS) throw new Error('IMAGE_TOO_MANY_PIXELS');
  return size;
}

/** Header admission only, not a decoder or a replacement for native decoding.
 * Raw dimensions can precede EXIF rotation; use the resulting bitmap dimensions
 * for oriented photo geometry. Formats: W3C PNG IHDR, JPEG SOFn, RFC 9649 WebP.
 * https://www.w3.org/TR/png-3/#11IHDR
 * https://www.rfc-editor.org/rfc/rfc9649.html
 */
export function inspectPhotoHeader(bytes: Uint8Array, type: string): PhotoSize {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const match = (offset: number, values: readonly number[]) => values.every((value, index) => bytes[offset + index] === value);
  const fourCC = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  const uint24 = (offset: number) => bytes[offset] + bytes[offset + 1] * 256 + bytes[offset + 2] * 65536;

  if (type === 'image/png') {
    if (bytes.length < 33 || !match(0, [137, 80, 78, 71, 13, 10, 26, 10]) || view.getUint32(8) !== 13 || fourCC(12) !== 'IHDR') return invalidHeader();
    const size = boundedSize({ width: view.getUint32(16), height: view.getUint32(20) });
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const length = view.getUint32(offset);
      const kind = fourCC(offset + 4);
      if (offset + length + 12 > bytes.length) return invalidHeader();
      if (kind === 'acTL' || kind === 'fcTL' || kind === 'fdAT') throw new Error('ANIMATED_IMAGE_UNSUPPORTED');
      if (kind === 'IEND') return size;
      offset += length + 12;
    }
    return invalidHeader();
  }

  if (type === 'image/jpeg') {
    if (!match(0, [255, 216])) return invalidHeader();
    let offset = 2;
    while (offset < bytes.length) {
      if (bytes[offset++] !== 255) return invalidHeader();
      while (bytes[offset] === 255) offset += 1;
      const marker = bytes[offset++];
      if (marker === 0xd9 || marker === 0xda || marker === undefined || marker === 0) return invalidHeader();
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) return invalidHeader();
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return invalidHeader();
      if (JPEG_FRAMES.has(marker)) {
        if (length < 11 || length !== 8 + 3 * bytes[offset + 7]) return invalidHeader();
        return { width: view.getUint16(offset + 5), height: view.getUint16(offset + 3) };
      }
      offset += length;
    }
    return invalidHeader();
  }

  if (type === 'image/webp') {
    if (bytes.length < 20 || fourCC(0) !== 'RIFF' || fourCC(8) !== 'WEBP') return invalidHeader();
    const end = view.getUint32(4, true) + 8;
    if (end > bytes.length || end < 20) return invalidHeader();
    let offset = 12;
    let canvas: PhotoSize | null = null;
    let coded: PhotoSize | null = null;
    while (offset + 8 <= end) {
      const kind = fourCC(offset);
      const length = view.getUint32(offset + 4, true);
      const payload = offset + 8;
      if (payload + length > end) return invalidHeader();
      if (kind === 'VP8X') {
        if (length !== 10 || canvas) return invalidHeader();
        if (bytes[payload] & 2) throw new Error('ANIMATED_IMAGE_UNSUPPORTED');
        canvas = boundedSize({ width: uint24(payload + 4) + 1, height: uint24(payload + 7) + 1 });
      } else if (kind === 'VP8L') {
        if (length < 5 || bytes[payload] !== 0x2f) return invalidHeader();
        const dimensions = view.getUint32(payload + 1, true);
        if (coded) return invalidHeader();
        coded = boundedSize({ width: (dimensions & 0x3fff) + 1, height: ((dimensions >>> 14) & 0x3fff) + 1 });
      } else if (kind === 'VP8 ') {
        if (length < 10 || (bytes[payload] & 1) !== 0 || !match(payload + 3, [0x9d, 1, 0x2a])) return invalidHeader();
        if (coded) return invalidHeader();
        coded = boundedSize({ width: view.getUint16(payload + 6, true) & 0x3fff, height: view.getUint16(payload + 8, true) & 0x3fff });
      } else if (kind === 'ANIM' || kind === 'ANMF') {
        throw new Error('ANIMATED_IMAGE_UNSUPPORTED');
      }
      offset = payload + length + (length % 2);
    }
    if (canvas && coded && (canvas.width !== coded.width || canvas.height !== coded.height)) return invalidHeader();
    if (offset !== end) return invalidHeader();
    if (canvas || coded) return (canvas ?? coded)!;
  }
  return invalidHeader();
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException('Photo decoding cancelled.', 'AbortError');
}

export function resolvePhotoType(file: { type: string; name?: string }): ResolvedPhotoType | null {
  const declared = file.type.trim().toLowerCase();
  if (declared) {
    return ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(declared)
      ? declared as ResolvedPhotoType
      : null;
  }
  const extension = file.name?.toLowerCase().match(/\.([^.]+)$/)?.[1];
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png') return 'image/png';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'heif') return 'image/heif';
  return null;
}

export async function preflightPhoto(file: File, signal?: AbortSignal): Promise<PhotoSize> {
  assertNotAborted(signal);
  const type = resolvePhotoType(file);
  if (type === 'image/heic' || type === 'image/heif') throw new Error('HEIC_UNSUPPORTED');
  if (!type) throw new Error('UNSUPPORTED_IMAGE');
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_PHOTO_BYTES) throw new Error('IMAGE_TOO_LARGE');
  // At most 20 MiB of encoded bytes, before allocating decoded pixel storage.
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertNotAborted(signal);
  return boundedSize(inspectPhotoHeader(bytes, type));
}

export async function decodePhotoBitmap(file: File, signal?: AbortSignal): Promise<ImageBitmap> {
  await preflightPhoto(file, signal);
  assertNotAborted(signal);
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    // createImageBitmap itself is not abortable. Discard/close a stale result.
    assertNotAborted(signal);
    boundedSize(bitmap);
    return bitmap;
  } catch (error) {
    bitmap.close();
    throw error;
  }
}
