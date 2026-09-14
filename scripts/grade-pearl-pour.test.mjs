import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const script = readFileSync(resolve(import.meta.dirname, 'grade-pearl-pour.mjs'), 'utf8');

describe('pearl pour grade contract', () => {
  it('keeps the source film cadence and six-frame GOP delivery contract', () => {
    expect(script).toContain("r_frame_rate !== '24/1'");
    expect(script).toContain('!== 241');
    expect(script).toContain("'-g', '6'");
    expect(script).toContain("'-keyint_min', '6'");
    expect(script).toContain("'-an'");
    expect(script).toContain("process.argv.includes('--replace')");
    expect(script).toContain('generated derivative pairs');
  });

  it('uses a restrained pearl/cool grade on the film stream only', () => {
    expect(script).toContain('colorchannelmixer=');
    expect(script).toContain('eq=saturation=0.52');
    expect(script).not.toContain('src/pages');
  });
});
