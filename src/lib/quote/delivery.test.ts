import { describe, expect, test, vi } from 'vitest';
import { sendResendQuote, withDeliveryDeadline } from './delivery';

const email = { subject: 'Fixture', text: 'A floor enquiry', html: '<p>Fixture</p>', replyTo: undefined, attachments: [{ filename: 'floor-1.jpg', content: Buffer.from('fixture'), contentType: 'image/jpeg' as const }] };
describe('bounded mail transport', () => {
  test('maps attachments to the REST API and requires an acknowledged ID', async () => {
    const fetcher = vi.fn(async () => Response.json({ id: 'sandbox-only' }));
    await sendResendQuote(email, { key: 'test-only', from: 'sandbox@example.test', to: 'sink@example.test' }, new AbortController().signal, fetcher);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(String(options.body));
    expect(body.attachments[0].content).toBe(Buffer.from('fixture').toString('base64'));
    expect(body.attachments[0].content_type).toBe('image/jpeg');
    expect(body.to).toEqual(['sink@example.test']);
    expect(options.signal).toBeInstanceOf(AbortSignal);
    await expect(sendResendQuote(email, { key: 'test-only', from: 'a', to: 'b' }, new AbortController().signal, async () => Response.json({}))).rejects.toThrow('not acknowledged');
  });
  test('does not begin a delivery for an already cancelled request', async () => {
    const abort = new AbortController(); abort.abort();
    const fetcher = vi.fn();
    await expect(sendResendQuote(email, { key: 'test-only', from: 'a', to: 'b' }, abort.signal, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  test('closes a hanging transport at the absolute deadline', async () => {
    const close = vi.fn();
    await expect(withDeliveryDeadline(() => new Promise<void>(() => {}), close, new AbortController().signal, 15)).rejects.toThrow('Delivery outcome is uncertain');
    expect(close).toHaveBeenCalledOnce();
  });
  test('still settles the deadline if a transport close throws', async () => {
    await expect(withDeliveryDeadline(
      () => new Promise<void>(() => {}),
      () => { throw new Error('Close failed'); },
      new AbortController().signal, 10,
    )).rejects.toThrow('Delivery outcome is uncertain');
  });
});
