import { describe, expect, it } from 'vitest';
import { buildQuoteEmail, createQuoteReference } from './email';
import type { QuoteRequest } from './schema';

const request: QuoteRequest = {
  location: 'Edmonton, AB',
  spaceType: 'garage' as const,
  sizeBand: 'two-car' as const,
  conditions: ['cracks', 'road-salt'],
  finishInterest: 'flake' as const,
  timeline: '1-3-months' as const,
  name: 'Alex <script>alert(1)</script>',
  email: 'alex@example.com',
  phone: '780-555-0199',
  contactPreference: 'phone' as const,
  consent: true as const,
  notes: 'Please check the drain & steps.',
};

describe('quote email', () => {
  it('creates an opaque, readable reference', () => {
    expect(createQuoteReference('2026-08-31T12:00:00.000Z', 'abcdef12')).toBe('FFE-260831-ABCDEF');
  });

  it('escapes visitor text while retaining all useful project details', () => {
    const email = buildQuoteEmail(request, 'FFE-260831-ABCDEF');
    expect(email.subject).toContain('FFE-260831-ABCDEF');
    expect(email.text).toContain('Edmonton, AB');
    expect(email.text).toContain('cracks, road salt');
    expect(email.text).toContain('Photos: none');
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.replyTo).toBe('alex@example.com');
  });
});
