import { describe, expect, it } from 'vitest';
import { validateLocalPhoto } from './image-geometry';
import { preflightPhoto, resolvePhotoType } from './photo-header';

function stillWebp(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(30);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('RIFF'), 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set(new TextEncoder().encode('WEBPVP8 '), 8);
  view.setUint32(16, 10, true);
  bytes.set([0, 0, 0, 0x9d, 1, 0x2a], 20);
  view.setUint16(26, width, true);
  view.setUint16(28, height, true);
  return bytes;
}

describe('missing browser file MIME resolution', () => {
  it('admits an empty-MIME WebP name only through binary signature validation', async () => {
    const file = new File([stillWebp(2400, 1800)], 'img_3199.webp', { type: '' });
    expect(resolvePhotoType(file)).toBe('image/webp');
    expect(validateLocalPhoto(file)).toEqual({ ok: true });
    await expect(preflightPhoto(file)).resolves.toEqual({ width: 2400, height: 1800 });
  });

  it('rejects spoofed extensions when the inferred type disagrees with the binary signature', async () => {
    const spoofed = new File([new Uint8Array([255, 216, 255, 217])], 'not-really.webp', { type: '' });
    await expect(preflightPhoto(spoofed)).rejects.toThrow('INVALID_IMAGE_HEADER');
  });

  it('never overrides a nonempty unsupported declared MIME from the filename', async () => {
    const file = new File([stillWebp(16, 16)], 'looks-safe.webp', { type: 'application/octet-stream' });
    expect(resolvePhotoType(file)).toBeNull();
    expect(validateLocalPhoto(file)).toEqual({ ok: false, code: 'UNSUPPORTED_IMAGE' });
    await expect(preflightPhoto(file)).rejects.toThrow('UNSUPPORTED_IMAGE');
  });
});
