import { describe, expect, it } from 'vitest';
import { quoteRequestSchema } from './schema';
import { buildQuoteEmail } from './email';

const draft = {
  location: 'Edmonton', spaceType: 'garage', sizeBand: 'unknown', conditions: [],
  finishInterest: 'flake', timeline: 'researching', name: 'Jamie Test',
  email: 'jamie@example.com', phone: '780-555-0100', contactPreference: 'email', consent: true,
};

describe('consultation brief', () => {
  it('accepts basement and only the chosen contact channel', () => {
    expect(quoteRequestSchema.safeParse({ ...draft, spaceType: 'basement', phone: '' }).success).toBe(true);
    expect(quoteRequestSchema.safeParse({ ...draft, email: '', phone: '780-555-0100', contactPreference: 'phone' }).success).toBe(true);
  });
  it('still requires the selected channel to be usable', () => {
    expect(quoteRequestSchema.safeParse({ ...draft, phone: '', contactPreference: 'text' }).success).toBe(false);
  });
  it('validates a selected catalogue ID and includes its name', () => {
    expect(quoteRequestSchema.safeParse({ ...draft, visualizerFinishId: 'invented-finish' }).success).toBe(false);
    const parsed = quoteRequestSchema.parse({ ...draft, visualizerFinishId: 'blue-hour' });
    expect(buildQuoteEmail(parsed, 'TEST').text).toContain('Cobalt Terrazzo');
    expect(buildQuoteEmail(parsed, 'TEST').text).toContain('blue-hour');
  });
  it('rejects malformed or oversized base64 attachments', () => {
    const photo = { name: 'floor.jpg', type: 'image/jpeg', data: 'data:image/jpeg;garbage' };
    expect(quoteRequestSchema.safeParse({ ...draft, photos: [photo] }).success).toBe(false);
    expect(quoteRequestSchema.safeParse({ ...draft, photos: [{ ...photo, data: 'data:image/jpeg;base64,' + 'AAAA'.repeat(90000) }] }).success).toBe(false);
  });
});
