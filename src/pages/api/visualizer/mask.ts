import { fal } from '@fal-ai/client';
import type { APIRoute } from 'astro';
import sharp from 'sharp';
import { ConcurrencyGate, SlidingWindowRateLimiter } from '../../../lib/security/request-guards';
import { createMaskRequestHandler, MaskHandlerError } from '../../../lib/visualizer/mask-handler';
import { getVisualizerSessionSecret, VISUALIZER_SESSION_MAX_AGE_MS } from '../../../lib/visualizer/session';

export const prerender = false;

const handleMaskRequest = createMaskRequestHandler({
  sessionSecret: getVisualizerSessionSecret(),
  sessionMaxAgeMs: VISUALIZER_SESSION_MAX_AGE_MS,
  maxRequestBytes: 20 * 1024 * 1024 + 256 * 1024,
  limiter: new SlidingWindowRateLimiter({ maxRequests: 5, windowMs: 15 * 60 * 1_000 }),
  concurrencyGate: new ConcurrencyGate(2),
  processPhoto: async (photo) => {
    if (!import.meta.env.FAL_KEY) throw new MaskHandlerError(503, 'AI_PROVIDER_UNAVAILABLE');

    const source = Buffer.from(await photo.arrayBuffer());
    const normalized = await sharp(source, { failOn: 'error' })
      .rotate()
      .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    const imageUrl = `data:image/jpeg;base64,${normalized.toString('base64')}`;

    fal.config({ credentials: import.meta.env.FAL_KEY });
    const result = await fal.subscribe('fal-ai/sam-3/image', {
      input: {
        image_url: imageUrl,
        prompt: 'concrete floor or garage floor',
        return_multiple_masks: true,
        max_masks: 3,
        sync_mode: true,
      },
      logs: false,
    });

    return { requestId: result.requestId, ...result.data };
  },
});

export const POST: APIRoute = ({ request, clientAddress }) => handleMaskRequest(request, clientAddress || 'unknown');
