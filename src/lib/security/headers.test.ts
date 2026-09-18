import { describe, expect, test } from 'vitest';
import {
  applySecurityHeaders,
  BASE_SECURITY_HEADERS,
  CONTENT_SECURITY_POLICY,
  securityHeadersFor,
  STRICT_TRANSPORT_SECURITY_HEADER,
} from './headers';

describe('security header map', () => {
  test('sends the fixed policy set over plain http, without HSTS', () => {
    const headers = securityHeadersFor(false);
    expect(headers).toEqual(BASE_SECURITY_HEADERS);
    expect(headers[STRICT_TRANSPORT_SECURITY_HEADER]).toBeUndefined();
  });

  test('adds Strict-Transport-Security only over https', () => {
    const headers = securityHeadersFor(true);
    expect(headers[STRICT_TRANSPORT_SECURITY_HEADER]).toMatch(/^max-age=\d+/);
    for (const [name, value] of Object.entries(BASE_SECURITY_HEADERS)) {
      expect(headers[name]).toBe(value);
    }
  });

  test('locks the required CSP directives', () => {
    expect(CONTENT_SECURITY_POLICY).toContain("default-src 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("script-src 'self' 'unsafe-inline' blob:");
    expect(CONTENT_SECURITY_POLICY).toContain("style-src 'self' 'unsafe-inline'");
    expect(CONTENT_SECURITY_POLICY).toContain("img-src 'self' data: blob:");
    expect(CONTENT_SECURITY_POLICY).toContain("media-src 'self' blob:");
    expect(CONTENT_SECURITY_POLICY).toContain("connect-src 'self' blob:");
    expect(CONTENT_SECURITY_POLICY).toContain("font-src 'self' data:");
    expect(CONTENT_SECURITY_POLICY).toContain("frame-ancestors 'none'");
    expect(CONTENT_SECURITY_POLICY).toContain("base-uri 'self'");
    expect(CONTENT_SECURITY_POLICY).toContain("form-action 'self'");
  });

  test('locks the fixed per-response headers', () => {
    expect(BASE_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(BASE_SECURITY_HEADERS['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    expect(BASE_SECURITY_HEADERS['Permissions-Policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(BASE_SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });

  test('writes every header onto a live Headers instance', () => {
    const headers = new Headers();
    applySecurityHeaders(headers, true);
    expect(headers.get('X-Frame-Options')).toBe('DENY');
    expect(headers.get(STRICT_TRANSPORT_SECURITY_HEADER)).toMatch(/^max-age=\d+/);
  });

  test('never mutates the shared base map', () => {
    const headers = securityHeadersFor(true);
    headers['X-Frame-Options'] = 'SAMEORIGIN';
    expect(BASE_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
  });
});
