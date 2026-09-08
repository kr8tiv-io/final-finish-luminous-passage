import { describe, expect, it } from 'vitest';
import { validateVisualizerUpload } from './upload';

describe('visualizer upload validation', () => {
  it('accepts a consented, supported room photo within the limit', () => {
    expect(validateVisualizerUpload({ type: 'image/jpeg', size: 2_000_000 }, true)).toEqual({ ok: true });
  });

  it('rejects AI processing without explicit consent', () => {
    expect(validateVisualizerUpload({ type: 'image/jpeg', size: 2_000_000 }, false)).toEqual({ ok: false, code: 'AI_CONSENT_REQUIRED' });
  });

  it('rejects executable or oversized payloads', () => {
    expect(validateVisualizerUpload({ type: 'image/svg+xml', size: 500 }, true)).toEqual({ ok: false, code: 'UNSUPPORTED_IMAGE' });
    expect(validateVisualizerUpload({ type: 'image/png', size: 20 * 1024 * 1024 + 1 }, true)).toEqual({ ok: false, code: 'IMAGE_TOO_LARGE' });
  });
});
