import { describe, expect, test } from 'vitest';
import { POST } from '../../pages/api/quote';

function context(request: Request, clientAddress: string) {
  return { request, clientAddress } as Parameters<NonNullable<typeof POST>>[0];
}

function chunkedRequest(chunks: string[], headers: HeadersInit = {}): Request {
  const encoder = new TextEncoder();
  return new Request('https://www.finalfinishepoxy.ca/api/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin', origin: 'https://www.finalfinishepoxy.ca', ...headers },
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

function jsonRequest(body: unknown, headers: HeadersInit = {}): Request {
  return chunkedRequest([JSON.stringify(body)], headers);
}

const validQuoteBody = {
  location: 'Edmonton, AB',
  spaceType: 'garage',
  sizeBand: 'two-car',
  conditions: [],
  finishInterest: 'flake',
  timeline: '1-3-months',
  name: 'Test Customer',
  email: 'test@example.com',
  phone: '',
  contactPreference: 'email',
  consent: true,
};

describe('quote request framing', () => {
  test('rejects a rate-limited sender before consuming another request body', async () => {
    const ip = '203.0.113.99';
    for (let index = 0; index < 3; index++) await POST!(context(chunkedRequest(['{}']), ip));
    const request = chunkedRequest(['{}']);
    const response = await POST!(context(request, ip));
    expect(response.status).toBe(429);
    expect(request.bodyUsed).toBe(false);
  });
  test('rejects cross-origin submissions before reading or delivering a quote', async () => {
    const response = await POST!(context(chunkedRequest(['{}'], { 'sec-fetch-site': 'cross-site', origin: 'https://unrelated.example' }), '203.0.113.12'));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'SAME_ORIGIN_REQUIRED' });
  });
  test('rejects text/plain JSON used to bypass cross-origin preflight', async () => {
    const response = await POST!(context(chunkedRequest(['{}'], { 'content-type': 'text/plain' }), '203.0.113.13'));
    expect(response.status).toBe(415);
  });
  test('rejects Content-Length above the 3 MiB quote photo budget', async () => {
    const response = await POST!(context(chunkedRequest(['{}'], { 'content-length': String(3 * 1024 * 1024 + 1) }), '203.0.113.10'));
    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({ code: 'PAYLOAD_TOO_LARGE' });
  });

  test('rejects malformed Content-Length before parsing JSON', async () => {
    const response = await POST!(context(chunkedRequest(['{}'], { 'content-length': '12oops' }), '203.0.113.11'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: 'INVALID_CONTENT_LENGTH' });
  });
});

describe('quote submission time trap', () => {
  test('rejects a submission whose client-recorded startedAt is implausibly recent', async () => {
    const response = await POST!(context(jsonRequest({ ...validQuoteBody, startedAt: Date.now() }), '203.0.113.20'));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ code: 'SUBMITTED_TOO_FAST' });
  });

  test('accepts a submission whose startedAt shows plausible human elapsed time', async () => {
    const response = await POST!(context(jsonRequest({ ...validQuoteBody, startedAt: Date.now() - 10_000 }), '203.0.113.21'));
    // No SMTP/Resend provider is configured in the test environment, so a request that clears
    // every guard still fails at delivery — proving it reached delivery is exactly what shows
    // the time trap did not block it.
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'EMAIL_FAILED' });
  });

  test('accepts a submission that omits startedAt entirely (pre-Step-27 client)', async () => {
    const response = await POST!(context(jsonRequest(validQuoteBody), '203.0.113.22'));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'EMAIL_FAILED' });
  });
});

describe('same-origin acceptance', () => {
  test('a well-formed same-origin submission clears every guard and reaches delivery', async () => {
    const response = await POST!(context(jsonRequest(validQuoteBody), '203.0.113.23'));
    expect(response.status).not.toBe(403);
    expect(response.status).not.toBe(415);
    expect(response.status).not.toBe(429);
    const payload = await response.json();
    expect(payload.code).not.toBe('SAME_ORIGIN_REQUIRED');
    expect(payload.code).not.toBe('INVALID_QUOTE');
    // Reaches the delivery attempt itself, which fails closed with no provider configured.
    expect(response.status).toBe(503);
    expect(payload).toEqual({ code: 'EMAIL_FAILED' });
  });
});
