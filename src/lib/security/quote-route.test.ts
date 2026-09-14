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
