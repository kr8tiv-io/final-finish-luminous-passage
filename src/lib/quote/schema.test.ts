import { describe, expect, it } from 'vitest';
import { quoteRequestSchema } from './schema';

describe('quote request schema', () => {
  it('accepts a complete Edmonton-area request', () => {
    const result = quoteRequestSchema.safeParse({
      location: 'Edmonton, AB',
      spaceType: 'garage',
      sizeBand: 'two-car',
      conditions: ['cracks', 'road-salt'],
      finishInterest: 'flake',
      timeline: '1-3-months',
      name: 'Alex Smith',
      email: 'alex@example.com',
      phone: '780-555-0199',
      contactPreference: 'phone',
      consent: true,
    });

    expect(result.success).toBe(true);
  });

  it('rejects a request without contact consent or a valid contact method', () => {
    const result = quoteRequestSchema.safeParse({
      location: 'Edmonton',
      spaceType: 'garage',
      sizeBand: 'unknown',
      conditions: [],
      finishInterest: 'not-sure',
      timeline: 'researching',
      name: 'A',
      email: 'not-an-email',
      phone: '',
      contactPreference: 'email',
      consent: false,
    });

    expect(result.success).toBe(false);
  });

  it('rejects bots that fill the hidden website field', () => {
    const result = quoteRequestSchema.safeParse({
      location: 'Edmonton, AB',
      spaceType: 'garage',
      sizeBand: 'two-car',
      conditions: [],
      finishInterest: 'flake',
      timeline: '1-3-months',
      name: 'Automated Submitter',
      email: 'bot@example.com',
      phone: '780-555-0199',
      contactPreference: 'email',
      consent: true,
      website: 'https://spam.example',
    });

    expect(result.success).toBe(false);
  });
});
