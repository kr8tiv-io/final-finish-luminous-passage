import type { APIRoute } from 'astro';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { z } from 'zod';
import { buildQuoteEmail, createQuoteReference } from '../../lib/quote/email';
import { quoteRequestSchema } from '../../lib/quote/schema';
import { readBodyWithLimit, RequestGuardError } from '../../lib/security/request-guards';

export const prerender = false;

const requestsByIp = new Map<string, number[]>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_REQUESTS = 3;
// In-memory window is enough for a single Hostinger Node process. It resets on
// restart and does not span multiple instances. Do not treat it as a cluster lock.

function exceedsRateLimit(ip: string): boolean {
  const now = Date.now();
  const recent = (requestsByIp.get(ip) ?? []).filter((timestamp) => now - timestamp < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS) return true;
  recent.push(now);
  requestsByIp.set(ip, recent);
  return false;
}

async function deliverQuote(email: ReturnType<typeof buildQuoteEmail>): Promise<void> {
  const to = import.meta.env.QUOTE_RECIPIENT || 'finalfinishepoxy@gmail.com';
  const from = import.meta.env.QUOTE_SENDER || 'Final Finish Website <website@finalfinishepoxy.ca>';

  if (import.meta.env.SMTP_HOST && import.meta.env.SMTP_USER && import.meta.env.SMTP_PASSWORD) {
    const transporter = nodemailer.createTransport({
      host: import.meta.env.SMTP_HOST,
      port: Number(import.meta.env.SMTP_PORT || 465),
      secure: String(import.meta.env.SMTP_SECURE ?? 'true') === 'true',
      auth: { user: import.meta.env.SMTP_USER, pass: import.meta.env.SMTP_PASSWORD },
    });
    await transporter.sendMail({
      from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: email.replyTo,
      attachments: email.attachments,
    });
    return;
  }

  if (import.meta.env.RESEND_API_KEY) {
    const resend = new Resend(import.meta.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
      replyTo: email.replyTo,
      attachments: email.attachments.map((file) => ({
        filename: file.filename,
        content: file.content,
        contentType: file.contentType,
      })),
    });
    if (error) throw new Error(error.message);
    return;
  }

  throw new Error('No quote email provider is configured.');
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let bytes: Uint8Array;
  try {
    bytes = await readBodyWithLimit(request, 3 * 1024 * 1024);
  } catch (error) {
    if (error instanceof RequestGuardError) {
      return Response.json({ code: error.code }, { status: error.code === 'PAYLOAD_TOO_LARGE' ? 413 : 400 });
    }
    return Response.json({ code: 'INVALID_JSON' }, { status: 400 });
  }
  if (exceedsRateLimit(clientAddress || 'unknown')) return Response.json({ code: 'RATE_LIMITED' }, { status: 429 });

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return Response.json({ code: 'INVALID_JSON' }, { status: 400 });
  }
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) return Response.json({ code: 'INVALID_QUOTE', issues: z.flattenError(parsed.error).fieldErrors }, { status: 400 });

  const reference = createQuoteReference();
  try {
    await deliverQuote(buildQuoteEmail(parsed.data, reference));
    return Response.json({ reference });
  } catch (error) {
    console.error('Quote delivery failed', error instanceof Error ? error.message : 'Unknown delivery error');
    return Response.json({ code: 'EMAIL_FAILED' }, { status: 503 });
  }
};
