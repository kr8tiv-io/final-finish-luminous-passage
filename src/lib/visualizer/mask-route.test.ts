import { describe, expect, test } from 'vitest';
import { POST } from '../../pages/api/visualizer/mask';

describe('visualizer mask endpoint security boundary', () => {
  test('keeps automatic detection closed before parsing or contacting a provider', async () => {
    const request = new Request('https://www.finalfinishepoxy.ca/api/visualizer/mask', {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: 'not multipart data',
    });
    const response = await POST!({ request, clientAddress: '203.0.113.40' } as Parameters<NonNullable<typeof POST>>[0]);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ code: 'AI_DETECTION_DISABLED' });
  });
});
