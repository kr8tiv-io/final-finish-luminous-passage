import { describe, expect, test } from 'vitest';
import {
  ConcurrencyGate,
  SlidingWindowRateLimiter,
  createVisualizerSession,
  inspectContentLength,
  isSameOriginBrowserRequest,
  readBodyWithLimit,
  verifyVisualizerSession,
} from './request-guards';

function streamingRequest(chunks: string[], headers: HeadersInit = {}): Request {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Request('https://www.finalfinishepoxy.ca/api/test', {
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('request body guards', () => {
  test('accepts a missing Content-Length only when the streamed body remains within the cap', async () => {
    expect(inspectContentLength(null, 8)).toEqual({ ok: true });
    await expect(readBodyWithLimit(streamingRequest(['1234', '5678']), 8)).resolves.toEqual(new TextEncoder().encode('12345678'));
  });

  test('rejects malformed Content-Length framing', () => {
    expect(inspectContentLength('12oops', 64)).toEqual({ ok: false, code: 'INVALID_CONTENT_LENGTH' });
    expect(inspectContentLength('-1', 64)).toEqual({ ok: false, code: 'INVALID_CONTENT_LENGTH' });
    expect(inspectContentLength('1, 2', 64)).toEqual({ ok: false, code: 'INVALID_CONTENT_LENGTH' });
  });

  test('rejects a declared oversized body before reading it', async () => {
    const request = streamingRequest(['small'], { 'content-length': '65' });
    await expect(readBodyWithLimit(request, 64)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(request.bodyUsed).toBe(false);
  });

  test('cancels a headerless stream as soon as actual bytes exceed the cap', async () => {
    const request = streamingRequest(['1234', '5678', '9']);
    await expect(readBodyWithLimit(request, 8)).rejects.toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });
});

describe('abuse controls', () => {
  test('limits each key within a sliding window and resets after expiry', () => {
    const limiter = new SlidingWindowRateLimiter({ maxRequests: 2, windowMs: 1_000 });
    expect(limiter.allow('203.0.113.7', 0)).toBe(true);
    expect(limiter.allow('203.0.113.7', 100)).toBe(true);
    expect(limiter.allow('203.0.113.7', 200)).toBe(false);
    expect(limiter.allow('203.0.113.7', 1_101)).toBe(true);
  });

  test('releases concurrency slots even after saturation', () => {
    const gate = new ConcurrencyGate(2);
    const releaseFirst = gate.tryAcquire();
    const releaseSecond = gate.tryAcquire();
    expect(releaseFirst).toBeTypeOf('function');
    expect(releaseSecond).toBeTypeOf('function');
    expect(gate.tryAcquire()).toBeNull();
    releaseFirst?.();
    expect(gate.tryAcquire()).toBeTypeOf('function');
  });
});

describe('visualizer browser sessions', () => {
  const secret = 'test-secret-with-enough-entropy';

  test('accepts a fresh signed session only for the bound client', () => {
    const token = createVisualizerSession(secret, '203.0.113.7', 1_000, 'fixed-nonce');
    expect(verifyVisualizerSession(token, secret, '203.0.113.7', 2_000, 10_000)).toBe(true);
    expect(verifyVisualizerSession(token, secret, '198.51.100.4', 2_000, 10_000)).toBe(false);
  });

  test('rejects expired and tampered sessions', () => {
    const token = createVisualizerSession(secret, '203.0.113.7', 1_000, 'fixed-nonce');
    expect(verifyVisualizerSession(token, secret, '203.0.113.7', 11_001, 10_000)).toBe(false);
    expect(verifyVisualizerSession(`${token}x`, secret, '203.0.113.7', 2_000, 10_000)).toBe(false);
  });

  test('requires same-origin browser request context', () => {
    expect(isSameOriginBrowserRequest(new Request('https://www.finalfinishepoxy.ca/api/visualizer/session', {
      headers: { origin: 'https://www.finalfinishepoxy.ca', 'sec-fetch-site': 'same-origin' },
    }))).toBe(true);
    expect(isSameOriginBrowserRequest(new Request('https://www.finalfinishepoxy.ca/api/visualizer/session', {
      headers: { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' },
    }))).toBe(false);
    expect(isSameOriginBrowserRequest(new Request('https://www.finalfinishepoxy.ca/api/visualizer/session'))).toBe(false);
  });

  test('rejects malformed browser context headers without throwing', () => {
    const request = new Request('https://www.finalfinishepoxy.ca/api/visualizer/session', {
      headers: { 'sec-fetch-site': 'same-origin', referer: 'not a URL' },
    });
    expect(() => isSameOriginBrowserRequest(request)).not.toThrow();
    expect(isSameOriginBrowserRequest(request)).toBe(false);
  });
});
