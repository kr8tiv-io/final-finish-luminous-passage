import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodePhotoBitmap, inspectPhotoHeader, preflightPhoto } from './photo-header';
import { decodePhotoSize } from './image-geometry';

afterEach(() => vi.unstubAllGlobals());

function jpegHeader(width: number, height: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array([255, 216, 255, 192, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255, 1, 1, 17, 0]);
}

function webpHeader(kind: 'VP8X' | 'VP8L' | 'VP8 ', width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(kind === 'VP8L' ? 26 : 30);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode('WEBP' + kind), 8);
  view.setUint32(16, kind === 'VP8L' ? 5 : 10, true);
  if (kind === 'VP8X') {
    bytes.set([(width - 1) & 255, ((width - 1) >> 8) & 255, (width - 1) >> 16], 24);
    bytes.set([(height - 1) & 255, ((height - 1) >> 8) & 255, (height - 1) >> 16], 27);
  } else if (kind === 'VP8L') {
    bytes[20] = 0x2f;
    view.setUint32(21, (width - 1) | ((height - 1) << 14), true);
  } else {
    bytes.set([0x9d, 1, 0x2a], 23);
    view.setUint16(26, width, true);
    view.setUint16(28, height, true);
  }
  return bytes;
}

describe('bounded photo preflight before browser bitmap allocation', () => {
  it.each(['jpeg', 'png', 'webp'] as const)('reads actual encoded %s dimensions without decoding', async (format) => {
    const bytes = await sharp({ create: { width: 19, height: 11, channels: 3, background: '#faf9f6' } }).toFormat(format).toBuffer();
    expect(inspectPhotoHeader(bytes, `image/${format}`)).toEqual({ width: 19, height: 11 });
  });

  it.each(['VP8X', 'VP8L', 'VP8 '] as const)('reads %s canvas dimensions and rejects giant canvases', async (kind) => {
    expect(inspectPhotoHeader(webpHeader(kind, 4032, 3024), 'image/webp')).toEqual({ width: 4032, height: 3024 });
    await expect(preflightPhoto(new File([webpHeader(kind, 8001, 6000)], 'large.webp', { type: 'image/webp' }))).rejects.toThrow('IMAGE_TOO_MANY_PIXELS');
  });

  it('rejects an oversized compressed JPEG before existing preview decode calls createImageBitmap', async () => {
    const decode = vi.fn().mockResolvedValue({ width: 8001, height: 6000, close: vi.fn() });
    vi.stubGlobal('createImageBitmap', decode);
    await expect(decodePhotoSize(new File([jpegHeader(8001, 6000)], 'large.jpg', { type: 'image/jpeg' }))).rejects.toThrow('IMAGE_TOO_MANY_PIXELS');
    expect(decode).not.toHaveBeenCalled();
  });

  it('accepts exactly 48 MP and rejects an oversized PNG header before bitmap allocation', async () => {
    await expect(preflightPhoto(new File([jpegHeader(8000, 6000)], 'limit.jpg', { type: 'image/jpeg' }))).resolves.toEqual({ width: 8000, height: 6000 });
    const png = new Uint8Array(await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer());
    const view = new DataView(png.buffer);
    view.setUint32(16, 100_000);
    view.setUint32(20, 100_000);
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    await expect(decodePhotoBitmap(new File([png], 'giant.png', { type: 'image/png' }))).rejects.toThrow('IMAGE_TOO_MANY_PIXELS');
    expect(decode).not.toHaveBeenCalled();
  });

  it('does not trust a small WebP extended canvas around an oversized coded image', async () => {
    const canvas = webpHeader('VP8X', 16, 16);
    const coded = webpHeader('VP8 ', 8001, 6000);
    const bytes = new Uint8Array([...canvas, ...coded.slice(12)]);
    new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
    await expect(preflightPhoto(new File([bytes], 'mismatched.webp', { type: 'image/webp' }))).rejects.toThrow('IMAGE_TOO_MANY_PIXELS');
  });

  it('rejects animated containers in the still-photo workflow before bitmap allocation', async () => {
    const animatedWebp = webpHeader('VP8X', 16, 16);
    animatedWebp[20] = 2;
    await expect(preflightPhoto(new File([animatedWebp], 'animated.webp', { type: 'image/webp' }))).rejects.toThrow('ANIMATED_IMAGE_UNSUPPORTED');
    const png = new Uint8Array(await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer());
    const animation = new Uint8Array(20);
    new DataView(animation.buffer).setUint32(0, 8);
    animation.set(new TextEncoder().encode('acTL'), 4);
    const apng = new Uint8Array([...png.slice(0, 33), ...animation, ...png.slice(33)]);
    await expect(preflightPhoto(new File([apng], 'animated.png', { type: 'image/png' }))).rejects.toThrow('ANIMATED_IMAGE_UNSUPPORTED');
  });

  it('skips JPEG metadata by segment length and handles progressive frames', () => {
    const frame = jpegHeader(1200, 800);
    frame[3] = 0xc2;
    const bytes = new Uint8Array([255, 216, 255, 225, 0, 6, 255, 192, 0, 0, ...frame.slice(2)]);
    expect(inspectPhotoHeader(bytes, 'image/jpeg')).toEqual({ width: 1200, height: 800 });
  });

  it('rejects invalid, truncated, zero-sized or mislabeled headers before decode', async () => {
    for (const bytes of [new Uint8Array([255, 216, 255]), jpegHeader(0, 1), new Uint8Array([255, 216, 255, 225, 0, 1])]) {
      await expect(preflightPhoto(new File([bytes], 'bad.jpg', { type: 'image/jpeg' }))).rejects.toThrow();
    }
    expect(() => inspectPhotoHeader(jpegHeader(1, 1), 'image/png')).toThrow('INVALID_IMAGE_HEADER');
  });

  it('checks file bounds before reading bytes and respects cancellation before decode', async () => {
    const read = vi.fn();
    await expect(preflightPhoto({ type: 'image/jpeg', size: 20 * 1024 * 1024 + 1, arrayBuffer: read } as unknown as File)).rejects.toThrow('IMAGE_TOO_LARGE');
    expect(read).not.toHaveBeenCalled();
    const controller = new AbortController();
    controller.abort();
    await expect(decodePhotoBitmap(new File([jpegHeader(1, 1)], 'photo.jpg', { type: 'image/jpeg' }), controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('preserves browser-decoded orientation and closes a bitmap whose revision was cancelled', async () => {
    const file = new File([jpegHeader(19, 11)], 'rotated.jpg', { type: 'image/jpeg' });
    const close = vi.fn();
    const bitmap = { width: 11, height: 19, close };
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    await expect(decodePhotoBitmap(file)).resolves.toBe(bitmap);
    const controller = new AbortController();
    vi.stubGlobal('createImageBitmap', vi.fn().mockImplementation(async () => { controller.abort(); return bitmap; }));
    await expect(decodePhotoBitmap(file, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(close).toHaveBeenCalledOnce();
  });
});
