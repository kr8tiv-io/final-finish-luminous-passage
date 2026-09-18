import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const grade = readFileSync(resolve(import.meta.dirname, 'grade-stair-walk.mjs'), 'utf8');
const encode = readFileSync(resolve(import.meta.dirname, 'encode-journey-films.mjs'), 'utf8');
const depth = readFileSync(resolve(import.meta.dirname, 'build-stair-depth.mjs'), 'utf8');

describe('walkway pearl grade contract', () => {
  it('keeps the source film cadence and never touches timing or framing', () => {
    expect(grade).toContain('const SOURCE_FRAMES = 145');
    expect(grade).toContain("const SOURCE_RATE = '24/1'");
    expect(grade).toContain('Frame count drift');
    expect(grade).toContain('Frame rate drift');
    expect(grade).toContain('Frame size drift');
    expect(grade).toContain("'-an'");
    expect(grade).toContain("process.argv.includes('--replace')");
    expect(grade).toContain('generated files; the');
    // No scale, crop, setpts, fps or trim may enter the filter chain: those are the
    // four ways a regrade silently becomes a re-edit.
    for (const forbidden of ['scale=', 'crop=', 'setpts=', 'trim=', 'fps=']) {
      expect(grade.slice(grade.indexOf('const SMOOTH'), grade.indexOf('const FILTER'))).not.toContain(forbidden);
    }
  });

  it('starts from the approved pour recipe and records what it changed', () => {
    expect(grade).toContain('colorchannelmixer=rr=0.70:rg=0.16:rb=0.06:gr=0.08:gg=1.05:gb=0.15:br=0.12:bg=0.36:bb=0.88');
    expect(grade).toContain('eq=saturation=0.42:contrast=0.98:brightness=0.04:gamma=1.26');
    expect(grade).toContain('PARAMETER DELTAS vs `scripts/grade-pearl-pour.mjs`');
    expect(grade).not.toContain('src/pages');
  });

  it('measures the speckle, the warm patch and the poster rather than asserting them', () => {
    expect(grade).toContain('speckleVariance');
    expect(grade).toContain('colourOnlyControl');
    expect(grade).toContain('meanAbsoluteDifference');
    expect(grade).toContain('posterVsFreshFrameZero');
  });
});

describe('walkway-pearl ladder', () => {
  it('is a full 480/720/1080 film in the encode queue with no height override', () => {
    expect(encode).toContain("'walkway-pearl'");
    expect(encode).not.toMatch(/filmHeights\s*=\s*\{[^}]*'walkway-pearl'/);
    expect(encode).not.toMatch(/filmHeights\s*=\s*\{[^}]*walkway-pearl\s*:/);
  });
});

describe('stair depth map contract', () => {
  it('writes true 16-bit greyscale and proves it, rather than trusting the encoder', () => {
    expect(depth).toContain('ihdr[8] = 16;');
    expect(depth).toContain('ihdr[9] = 0;');
    expect(depth).toContain('did not round-trip');
    expect(depth).toContain('multiple of 257');
  });

  it('re-verifies the measured nosing rows against the still on every run', () => {
    expect(depth).toContain('NOSING_ROWS = Object.freeze([418, 383, 352, 324, 297, 273, 250, 229, 209, 192, 175, 160])');
    expect(depth).toContain('Nosing rows no longer match the still');
    expect(depth).toContain('controlWeakestGradient');
  });
});
