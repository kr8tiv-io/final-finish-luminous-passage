import type { buildQuoteEmail } from './email';

type Email = ReturnType<typeof buildQuoteEmail>;
const DEADLINE_MS = 20_000;

/** A transport timeout is an unknown delivery outcome, not proof of non-delivery. */
export async function withDeliveryDeadline<T>(
  start: () => Promise<T>, close: () => void, signal: AbortSignal, timeoutMs = DEADLINE_MS,
): Promise<T> {
  signal.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stop = () => {};
  let stopped = false;
  const interrupted = new Promise<never>((_, reject) => {
    stop = () => {
      if (stopped) return;
      stopped = true;
      try { close(); } catch { /* Cleanup cannot prevent deadline settlement. */ }
      reject(new Error('Delivery outcome is uncertain.'));
    };
    signal.addEventListener('abort', stop, { once: true });
    timer = setTimeout(stop, timeoutMs);
  });
  try { return await Promise.race([start(), interrupted]); }
  finally { clearTimeout(timer); signal.removeEventListener('abort', stop); }
}

export async function sendResendQuote(
  email: Email, config: { key: string; from: string; to: string },
  requestSignal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<void> {
  requestSignal.throwIfAborted();
  const abort = new AbortController();
  await withDeliveryDeadline(async () => {
    // The REST interface accepts a real AbortSignal; the installed SDK does not.
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: abort.signal,
      headers: { authorization: `Bearer ${config.key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: config.from, to: [config.to], subject: email.subject,
        text: email.text, html: email.html, reply_to: email.replyTo,
        attachments: email.attachments.map((file) => ({
          filename: file.filename, content: file.content.toString('base64'), content_type: file.contentType,
        })),
      }),
    });
    if (!response.ok) throw new Error('Email provider did not acknowledge delivery.');
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('id' in result) || typeof result.id !== 'string' || !result.id) {
      throw new Error('Email delivery was not acknowledged.');
    }
  }, () => abort.abort(), requestSignal);
}
