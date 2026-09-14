import { describe, expect, it, vi } from 'vitest';
import { adaptMaskResponse } from './mask-client';

describe('visualizer mask client adapter', () => {
  it('preserves the owned detected response contract', async () => {
    await expect(adaptMaskResponse({
      status: 'detected',
      photoRevision: 'photo-2',
      mask: { dataUrl: 'data:image/png;base64,abc', width: 600, height: 400 },
    }, 'photo-2', vi.fn())).resolves.toEqual({
      status: 'detected',
      photoRevision: 'photo-2',
      mask: { dataUrl: 'data:image/png;base64,abc', width: 600, height: 400 },
    });
  });

  it('treats an empty provider mask array as no floor instead of success', async () => {
    await expect(adaptMaskResponse({ masks: [] }, 'photo-3', vi.fn())).resolves.toEqual({
      status: 'no-floor',
      photoRevision: 'photo-3',
    });
  });

  it('adapts the temporary provider URL and reads its intrinsic dimensions', async () => {
    const inspect = vi.fn().mockResolvedValue({ width: 300, height: 200 });
    await expect(adaptMaskResponse({ masks: [{ image: { url: 'https://cdn.example/mask.png' } }] }, 'photo-4', inspect)).resolves.toEqual({
      status: 'detected',
      photoRevision: 'photo-4',
      mask: { dataUrl: 'https://cdn.example/mask.png', width: 300, height: 200 },
    });
    expect(inspect).toHaveBeenCalledWith('https://cdn.example/mask.png', undefined);
  });

  it('does not relabel an owned stale response with the current revision', async () => {
    await expect(adaptMaskResponse({ status: 'no-floor', photoRevision: 'photo-1' }, 'photo-5', vi.fn())).resolves.toEqual({
      status: 'no-floor',
      photoRevision: 'photo-1',
    });
  });
});
