import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { sendResendQuote, withDeliveryDeadline } from '../../lib/quote/delivery';
import { z } from 'zod';
import { buildQuoteEmail, createQuoteReference } from '../../lib/quote/email';
import { quoteRequestSchema } from '../../lib/quote/schema';
import { normalizeQuotePhotos } from '../../lib/quote/photos';
import { ConcurrencyGate, isImplausiblyFastSubmission, isSameOriginBrowserRequest, readBodyWithLimit, RequestGuardError } from '../../lib/security/request-guards';

export const prerender = false;

function envPositiveNumber(name: string, fallback: number): number {
  const raw = import.meta.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const requestsByIp = new Map<string, number[]>();
// Overridable per-deployment without a code change; same defaults as before Step 10.
const WINDOW_MS = envPositiveNumber('QUOTE_RATE_WINDOW_MS', 15 * 60 * 1000);
const MAX_REQUESTS = envPositiveNumber('QUOTE_RATE_LIMIT', 3);
const deliveryGate = new ConcurrencyGate(2);
// Local safety only. Production requires a shared store and a verified proxy;
// this window resets on restart and must not be described as a cluster lock.
// (See docs/context/DEV-CONTRACT.md, "Quote rate limiting" — a shared limiter
// behind the host is a prerequisite for production, tracked there, not here.)

function exceedsRateLimit(ip: string): boolean {
  const now = Date.now();
  for (const [key, timestamps] of requestsByIp) {
    if (timestamps.every((timestamp) => now - timestamp >= WINDOW_MS)) requestsByIp.delete(key);
  }
  if (!requestsByIp.has(ip) && requestsByIp.size >= 2048) return true;
  const recent = (requestsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return true;
  recent.push(now);
  requestsByIp.set(ip, recent);
  return false;
}

async function deliverQuote(email: ReturnType<typeof buildQuoteEmail>, signal: AbortSignal): Promise<void> {
  const to = import.meta.env.QUOTE_RECIPIENT || 'finalfinishepoxy@gmail.com';
  const from = import.meta.env.QUOTE_SENDER || 'Final Finish Website <website@finalfinishepoxy.ca>';

  if (import.meta.env.SMTP_HOST && import.meta.env.SMTP_USER && import.meta.env.SMTP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      host: import.meta.env.SMTP_HOST,
      port: Number(import.meta.env.SMTP_PORT || 465),
      secure: String(import.meta.env.SMTP_SECURE ?? 'true') === 'true',
      connectionTimeout: 8_000, greetingTimeout: 8_000, socketTimeout: 12_000,
      auth: { user: import.meta.env.SMTP_USER, pass: import.meta.env.SMTP_PASSWORD },
    });
    await withDeliveryDeadline(() => transporter.sendMail({
      from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: email.replyTo,
      attachments: email.attachments,
    }), () => transporter.close(), signal);
    return;
  }

  if (import.meta.env.RESEND_API_KEY) {
    await sendResendQuote(email, { key: import.meta.env.RESEND_API_KEY, from, to }, signal);
    return;
  }

  throw new Error('No quote email provider is configured.');
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  if (!isSameOriginBrowserRequest(request)) {
    return Response.json({ code: 'SAME_ORIGIN_REQUIRED' }, { status: 403 });
  }
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return Response.json({ code: 'JSON_REQUIRED' }, { status: 415 });
  }
  // Admission happens before reading an upload, including malformed attempts.
  if (exceedsRateLimit(clientAddress || 'unknown')) return Response.json({ code: 'RATE_LIMITED' }, { status: 429 });
  let bytes: Uint8Array;
  try {
    bytes = await readBodyWithLimit(request, 3 * 1024 * 1024);
  } catch (error) {
    if (error instanceof RequestGuardError) {
      return Response.json({ code: error.code }, { status: error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400 });
    }
    return Response.json({ code: 'INVALID_JSON' }, { status: 400 });
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return Response.json({ code: 'INVALID_JSON' }, { status: 400 });
  }

  // Tolerant time trap: Step 27 adds a client-side `startedAt` (epoch ms, captured when the
  // quote form first renders) field to the browser form. Until that lands — and for any client
  // that omits the field afterward — its absence must never block a legitimate submission; only
  // a present value that arrives faster than a human could plausibly complete the form is
  // treated as automated. See isImplausiblyFastSubmission for the exact tolerance rule.
  const startedAt = body && typeof body === 'object' ? (body as Record<string, unknown>).startedAt : undefined;
  if (isImplausiblyFastSubmission(startedAt, Date.now())) {
    return Response.json({ code: 'SUBMITTED_TOO_FAST' }, { status: 400 });
  }

  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: 'INVALID_QUOTE', issues: z.flattenError(parsed.error).fieldErrors }, { status: 400 });

  const reference = createQuoteReference();
  const release = deliveryGate.tryAcquire();
  if (!release) return Response.json({ code: 'QUOTE_SERVICE_BUSY' }, { status: 503 });
  try {
    try {
      parsed.data.photos = await normalizeQuotePhotos(parsed.data.photos);
    } catch {
      return Response.json({ code: 'INVALID_PHOTOS' }, { status: 400 });
    }
    await deliverQuote(buildQuoteEmail(parsed.data, reference), request.signal);
    return Response.json({ reference });
  } catch (error) {
    console.error('Quote delivery failed', error instanceof Error ? error.message : 'Unknown delivery error');
    return Response.json({ code: 'EMAIL_FAILED' }, { status: 503 });
  } finally {
    release();
  }
};
