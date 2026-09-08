import {
  type ConcurrencyGate,
  isSameOriginBrowserRequest,
  readBodyWithLimit,
  RequestGuardError,
  type SlidingWindowRateLimiter,
  verifyVisualizerSession,
} from '../security/request-guards';
import { validateVisualizerUpload } from './upload';

interface MaskHandlerOptions {
  sessionSecret: string;
  sessionMaxAgeMs: number;
  maxRequestBytes: number;
  limiter: SlidingWindowRateLimiter;
  concurrencyGate: ConcurrencyGate;
  now?: () => number;
  processPhoto: (photo: File) => Promise<Record<string, unknown>>;
}

export class MaskHandlerError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
    this.name = 'MaskHandlerError';
  }
}

export function createMaskRequestHandler(options: MaskHandlerOptions) {
  const now = options.now ?? Date.now;

  return async (request: Request, clientAddress: string): Promise<Response> => {
    const token = request.headers.get('x-visualizer-session') ?? '';
    if (!isSameOriginBrowserRequest(request)
      || !verifyVisualizerSession(token, options.sessionSecret, clientAddress, now(), options.sessionMaxAgeMs)) {
      return Response.json({ code: 'VISUALIZER_SESSION_REQUIRED' }, { status: 403 });
    }
    if (!options.limiter.allow(clientAddress, now())) {
      return Response.json({ code: 'RATE_LIMITED' }, { status: 429 });
    }

    const release = options.concurrencyGate.tryAcquire();
    if (!release) return Response.json({ code: 'MASK_SERVICE_BUSY' }, { status: 503 });

    try {
      const bytes = await readBodyWithLimit(request, options.maxRequestBytes);
      const contentType = request.headers.get('content-type');
      if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) {
        return Response.json({ code: 'INVALID_FORM_DATA' }, { status: 400 });
      }

      let form: FormData;
      try {
        const bufferedBody = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
        form = await new Response(bufferedBody, { headers: { 'content-type': contentType } }).formData();
      } catch {
        return Response.json({ code: 'INVALID_FORM_DATA' }, { status: 400 });
      }

      const photo = form.get('photo');
      const consent = form.get('consent') === 'true';
      if (!(photo instanceof File)) return Response.json({ code: 'PHOTO_REQUIRED' }, { status: 400 });
      const validation = validateVisualizerUpload(photo, consent);
      if (!validation.ok) return Response.json({ code: validation.code }, { status: 400 });

      try {
        return Response.json(await options.processPhoto(photo), { status: 200 });
      } catch (error) {
        if (error instanceof MaskHandlerError) {
          return Response.json({ code: error.code }, { status: error.status });
        }
        console.error('Floor masking failed', error instanceof Error ? error.message : 'Unknown masking error');
        return Response.json({ code: 'MASK_PROVIDER_FAILED' }, { status: 502 });
      }
    } catch (error) {
      if (error instanceof RequestGuardError) {
        return Response.json({ code: error.code }, { status: error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400 });
      }
      return Response.json({ code: 'INVALID_FORM_DATA' }, { status: 400 });
    } finally {
      release();
    }
  };
}
