import { describe, expect, it } from 'vitest';
import { automaticDetectionEnabled } from './detection-gate';

describe('automatic detection release gate', () => {
  it('is disabled until server isolation, privacy and spending controls have actually shipped', () => {
    expect(automaticDetectionEnabled()).toBe(false);
  });
});
