import { describe, expect, test } from 'vitest';
import { ConcurrencyGate, createVisualizerSession, SlidingWindowRateLimiter } from '../security/request-guards';
import { createMaskRequestHandler } from './mask-handler';

const secret = 'visualizer-test-secret';
const clientAddress = '203.0.113.20';
const issuedAt = 10_000;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nGQAAAAASUVORK5CYII=', 'base64');

function maskRequest(overrides: { token?: string; declaredLength?: string; origin?: string; fetchSite?: string; subject?: string } = {}): Request {
  const form = new FormData();
  form.append('photo', new File([png], 'garage.png', { type: 'image/png' }));
  form.append('consent', 'true');
  const request = new Request('https://www.finalfinishepoxy.ca/api/visualizer/mask', { method: 'POST', body: form });
  request.headers.set('origin', overrides.origin ?? 'https://www.finalfinishepoxy.ca');
  request.headers.set('sec-fetch-site', overrides.fetchSite ?? 'same-origin');
  request.headers.set('x-visualizer-session', overrides.token ?? createVisualizerSession(secret, overrides.subject ?? clientAddress, issuedAt, 'nonce'));
  if (overrides.declaredLength) request.headers.set('content-length', overrides.declaredLength);
  return request;
}

function handler(overrides: Partial<Parameters<typeof createMaskRequestHandler>[0]> = {}) {
  return createMaskRequestHandler({
    sessionSecret: secret,
    sessionMaxAgeMs: 60_000,
    maxRequestBytes: 1_024,
    limiter: new SlidingWindowRateLimiter({ maxRequests: 5, windowMs: 60_000 }),
    concurrencyGate: new ConcurrencyGate(2),
    now: () => issuedAt + 1_000,
    processPhoto: async () => ({ requestId: 'mask-1', masks: [{ url: 'https://cdn.example/mask.png' }] }),
    ...overrides,
  });
}

describe('visualizer mask request handler', () => {
  test('requires a same-origin signed browser session before reading the upload', async () => {
    const response = await handler()(maskRequest({ token: 'invalid', origin: 'https://attacker.example', fetchSite: 'cross-site' }), clientAddress);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'VISUALIZER_SESSION_REQUIRED' });
  });

  test('rejects declared oversized multipart bodies before provider work', async () => {
    let calls = 0;
    const response = await handler({ processPhoto: async () => { calls += 1; return {}; } })(maskRequest({ declaredLength: '1025' }), clientAddress);
    expect(response.status).toBe(413);
    expect(calls).toBe(0);
  });

  test('rate limits repeated provider work by client IP', async () => {
    const handle = handler({ limiter: new SlidingWindowRateLimiter({ maxRequests: 1, windowMs: 60_000 }) });
    expect((await handle(maskRequest(), clientAddress)).status).toBe(200);
    const limited = await handle(maskRequest(), clientAddress);
    expect(limited.status).toBe(429);
    await expect(limited.json()).resolves.toEqual({ code: 'RATE_LIMITED' });
  });

  test('rejects excess concurrent provider work and releases the slot afterward', async () => {
    let releaseProvider!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    const provider = new Promise<Record<string, unknown>>((resolve) => {
      releaseProvider = () => resolve({ requestId: 'mask-1', masks: [] });
    });
    const handle = handler({
      concurrencyGate: new ConcurrencyGate(1),
      processPhoto: async () => { markStarted(); return provider; },
    });

    const first = handle(maskRequest(), clientAddress);
    await started;
    const busy = await handle(maskRequest({ subject: '203.0.113.21' }), '203.0.113.21');
    expect(busy.status).toBe(503);
    await expect(busy.json()).resolves.toEqual({ code: 'MASK_SERVICE_BUSY' });
    releaseProvider();
    expect((await first).status).toBe(200);
    expect((await handle(maskRequest({ subject: '203.0.113.21' }), '203.0.113.21')).status).toBe(200);
  });
});
