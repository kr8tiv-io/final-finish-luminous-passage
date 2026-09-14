import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { normalizeQuotePhotos } from './photos';

describe('server-owned quote attachments', () => {
  it('decodes a JPEG and produces a bounded JPEG with a server-owned filename', async () => {
    const jpeg = await sharp({ create: { width: 12, height: 8, channels: 3, background: '#faf9f6' } }).jpeg().toBuffer();
    const photos = await normalizeQuotePhotos([{ name: '../../floor.html', type: 'image/jpeg', data: 'data:image/jpeg;base64,' + jpeg.toString('base64') }]);
    expect(photos[0].name).toBe('floor-1.jpg');
    const decoded = await sharp(Buffer.from(photos[0].data.split(',')[1], 'base64')).metadata();
    expect(decoded.format).toBe('jpeg');
  });
  it('rejects bytes that are not a JPEG despite the declared prefix', async () => {
    const png = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ffffff' } }).png().toBuffer();
    await expect(normalizeQuotePhotos([{ name: 'floor.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,' + png.toString('base64') }])).rejects.toThrow();
  });
  it('rejects excessive dimensions even when the compressed JPEG is tiny', async () => {
    const jpeg = await sharp({ create: { width: 3000, height: 10, channels: 3, background: '#ffffff' } }).jpeg().toBuffer();
    await expect(normalizeQuotePhotos([{ name: 'wide.jpg', type: 'image/jpeg', data: 'data:image/jpeg;base64,' + jpeg.toString('base64') }])).rejects.toThrow();
  });
});
