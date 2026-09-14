const PIN_HOLD = 0.38;
const PIN_SHARE = 0.72;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function easeInOutCubic(t: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Map a pinned room plus the following breath onto a 0–1 film mix. */
export function dissolveProgress(pinProgress: number, breathProgress: number): number {
  const pin = clamp01(pinProgress);
  const breath = clamp01(breathProgress);
  const pinTail = pin <= PIN_HOLD ? 0 : (pin - PIN_HOLD) / (1 - PIN_HOLD);
  return easeInOutCubic(pinTail * PIN_SHARE + breath * (1 - PIN_SHARE));
}
