import sharp from 'sharp';
import type { QuoteRequest } from './schema';
import { isBoundedJpegDataUrl, JPEG_DATA_PREFIX, QUOTE_PHOTO_BYTES, QUOTE_PHOTO_COUNT } from './limits';

/** Server validation is mandatory even though the browser normalizes first.
 * Production isolation of native decoding remains a separate release gate. */
export async function normalizeQuotePhotos(photos: QuoteRequest['photos'] = []): Promise<NonNullable<QuoteRequest['photos']>> {
  if (photos.length > QUOTE_PHOTO_COUNT) throw new Error('Too many attachments.');
  const normalized: NonNullable<QuoteRequest['photos']> = [];
  for (const [index, photo] of photos.entries()) {
    if (photo.type !== 'image/jpeg' || !isBoundedJpegDataUrl(photo.data)) throw new Error('Invalid JPEG attachment.');
    const input = Buffer.from(photo.data.slice(JPEG_DATA_PREFIX.length), 'base64');
    const options = { failOn: 'warning' as const, limitInputPixels: 2560 * 2560, sequentialRead: true };
    const metadata = await sharp(input, options).metadata();
    if (metadata.format !== 'jpeg' || !metadata.width || !metadata.height || metadata.width > 2560 || metadata.height > 2560 || (metadata.pages ?? 1) !== 1) throw new Error('Unsupported attachment dimensions or format.');
    const output = await sharp(input, options).rotate()
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 72 }).timeout({ seconds: 5 }).toBuffer();
    if (output.length > QUOTE_PHOTO_BYTES) throw new Error('Attachment exceeds the normalized size limit.');
    normalized.push({ name: `floor-${index + 1}.jpg`, type: 'image/jpeg', data: JPEG_DATA_PREFIX + output.toString('base64') });
  }
  return normalized;
}
