import { createHmac, timingSafeEqual } from 'node:crypto';

export type RequestGuardCode = 'INVALID_CONTENT_LENGTH' | 'PAYLOAD_TOO_LARGE' | 'REQUEST_TIMEOUT' | 'REQUEST_ABORTED';

export class RequestGuardError extends Error {
  readonly code: RequestGuardCode;

  constructor(code: RequestGuardCode) {
    super(code);
    this.name = 'RequestGuardError';
    this.code = code;
  }
}

export function inspectContentLength(value: string | null, maxBytes: number): { ok: true } | { ok: false; code: RequestGuardCode } {
  if (value === null) return { ok: true };
  if (!/^\d+$/.test(value)) return { ok: false, code: 'INVALID_CONTENT_LENGTH' };
  const bytes = Number(value);
  if (!Number.isSafeInteger(bytes)) return { ok: false, code: 'INVALID_CONTENT_LENGTH' };
  if (bytes > maxBytes) return { ok: false, code: 'PAYLOAD_TOO_LARGE' };
  return { ok: true };
}

export async function readBodyWithLimit(request: Request, maxBytes: number, { timeoutMs = 15_000 }: { timeoutMs?: number } = {}): Promise<Uint8Array> {
  const framing = inspectContentLength(request.headers.get('content-length'), maxBytes);
  if (!framing.ok) throw new RequestGuardError(framing.code);
  if (request.signal.aborted) throw new RequestGuardError('REQUEST_ABORTED');
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let interrupt!: (error: RequestGuardError) => void;
  const interrupted = new Promise<never>((_, reject) => { interrupt = reject; });
  const abort = () => interrupt(new RequestGuardError('REQUEST_ABORTED'));
  request.signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => interrupt(new RequestGuardError('REQUEST_TIMEOUT')), timeoutMs);
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), interrupted]);
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) throw new RequestGuardError('PAYLOAD_TOO_LARGE');
      chunks.push(value);
    }
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return body;
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
}

interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
}

export class SlidingWindowRateLimiter {
  private readonly attempts = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor({ maxRequests, windowMs }: RateLimiterOptions) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }

  allow(key: string, now = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    for (const [candidate, timestamps] of this.attempts) {
      const active = timestamps.filter((timestamp) => timestamp > cutoff);
      if (active.length === 0) this.attempts.delete(candidate);
      else if (active.length !== timestamps.length) this.attempts.set(candidate, active);
    }

    const timestamps = this.attempts.get(key) ?? [];
    if (timestamps.length >= this.maxRequests) return false;
    timestamps.push(now);
    this.attempts.set(key, timestamps);
    return true;
  }
}

export class ConcurrencyGate {
  private active = 0;

  constructor(private readonly limit: number) {}

  tryAcquire(): (() => void) | null {
    if (this.active >= this.limit) return null;
    this.active += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
    };
  }
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createVisualizerSession(secret: string, subject: string, issuedAt = Date.now(), nonce: string = crypto.randomUUID()): string {
  const payload = Buffer.from(JSON.stringify({ subject, issuedAt, nonce })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyVisualizerSession(token: string, secret: string, subject: string, now: number, maxAgeMs: number): boolean {
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return false;
  const expected = sign(payload, secret);
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  if (actualBytes.length !== expectedBytes.length || !timingSafeEqual(actualBytes, expectedBytes)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { subject?: unknown; issuedAt?: unknown };
    return parsed.subject === subject
      && typeof parsed.issuedAt === 'number'
      && Number.isFinite(parsed.issuedAt)
      && parsed.issuedAt <= now
      && now - parsed.issuedAt <= maxAgeMs;
  } catch {
    return false;
  }
}

export function isSameOriginBrowserRequest(request: Request): boolean {
  if (request.headers.get('sec-fetch-site') !== 'same-origin') return false;
  try {
    const requestOrigin = new URL(request.url).origin;
    const origin = request.headers.get('origin');
    if (origin && origin !== requestOrigin) return false;
    const referer = request.headers.get('referer');
    if (referer && new URL(referer).origin !== requestOrigin) return false;
    return true;
  } catch {
    return false;
  }
}
