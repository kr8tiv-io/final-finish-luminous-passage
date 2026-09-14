import { describe, expect, it } from 'vitest';
import { createPhotoRevisionGate } from './photo-revision';

describe('photo revision gate', () => {
  it('aborts work for the previous photo and rejects its late result', () => {
    const gate = createPhotoRevisionGate();
    const first = gate.advance();
    const second = gate.advance();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(gate.isCurrent(first.photoRevision)).toBe(false);
    expect(gate.isCurrent(second.photoRevision)).toBe(true);
  });

  it('can cancel detection without advancing the active photo', () => {
    const gate = createPhotoRevisionGate();
    const active = gate.advance();
    const detection = gate.startTask(active.photoRevision);
    gate.cancelTask();

    expect(detection.aborted).toBe(true);
    expect(gate.isCurrent(active.photoRevision)).toBe(true);
  });

  it('distinguishes a replacement task on the same photo revision', () => {
    const gate = createPhotoRevisionGate();
    const active = gate.advance();
    const first = gate.startTask(active.photoRevision);
    const second = gate.startTask(active.photoRevision);

    expect(first.aborted).toBe(true);
    expect(gate.isActiveTask(first)).toBe(false);
    expect(gate.isActiveTask(second)).toBe(true);
  });
});
