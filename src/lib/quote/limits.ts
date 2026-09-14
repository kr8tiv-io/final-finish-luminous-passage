export const QUOTE_BODY_BYTES = 3 * 1024 * 1024;
export const QUOTE_PHOTO_BYTES = 256 * 1024;
export const QUOTE_PHOTO_COUNT = 6;
export const JPEG_DATA_PREFIX = 'data:image/jpeg;base64,';

export function isBoundedJpegDataUrl(value: string): boolean {
  if (!value.startsWith(JPEG_DATA_PREFIX) || value.length > JPEG_DATA_PREFIX.length + Math.ceil(QUOTE_PHOTO_BYTES / 3) * 4) return false;
  const base64 = value.slice(JPEG_DATA_PREFIX.length);
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return false;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return base64.length / 4 * 3 - padding <= QUOTE_PHOTO_BYTES;
}
