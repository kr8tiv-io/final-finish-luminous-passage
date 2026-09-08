import { describe, expect, test } from 'vitest';
import { GET } from '../../pages/api/visualizer/session';

function context(request: Request, clientAddress = '203.0.113.30') {
  return { request, clientAddress } as Parameters<NonNullable<typeof GET>>[0];
}

describe('visualizer session endpoint', () => {
  test('issues a short-lived session to the same-origin visualizer', async () => {
    const request = new Request('https://www.finalfinishepoxy.ca/api/visualizer/session', {
      headers: { 'sec-fetch-site': 'same-origin', referer: 'https://www.finalfinishepoxy.ca/floor-visualizer' },
    });
    const response = await GET!(context(request));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    await expect(response.json()).resolves.toMatchObject({ token: expect.any(String), expiresInSeconds: expect.any(Number) });
  });

  test('does not issue sessions without same-origin browser context', async () => {
    const response = await GET!(context(new Request('https://www.finalfinishepoxy.ca/api/visualizer/session')));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ code: 'VISUALIZER_SESSION_REQUIRED' });
  });
});
