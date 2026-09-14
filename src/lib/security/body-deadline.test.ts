import { describe, expect, it } from 'vitest';
import { readBodyWithLimit } from './request-guards';

function pendingRequest(signal?: AbortSignal) {
  return new Request('https://www.finalfinishepoxy.ca/api/quote', {
    method: 'POST', body: new ReadableStream<Uint8Array>(), signal, duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}
describe('bounded upload reading', () => {
  it('rejects a slow body without waiting forever', async () => {
    await expect(readBodyWithLimit(pendingRequest(), 1024, { timeoutMs: 20 })).rejects.toMatchObject({ code: 'REQUEST_TIMEOUT' });
  });
  it('rejects a cancelled request', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readBodyWithLimit(pendingRequest(controller.signal), 1024, { timeoutMs: 20 })).rejects.toMatchObject({ code: 'REQUEST_ABORTED' });
  });
});
