export function reviewTarget(left: number, direction: number, stride: number, maximum: number): number {
  return Math.max(0, Math.min(maximum, left + Math.sign(direction) * Math.max(0, stride)));
}

/** A dated snapshot, never a claim that this page is a live Google feed. */
export function ratingIsCurrent(verifiedAt: string, maximumAgeDays: number, now = Date.now()): boolean {
  const age = now - Date.parse(verifiedAt);
  return Number.isFinite(age) && age >= 0 && age <= maximumAgeDays * 86_400_000;
}

export function reviewPosition(left: number, stride: number, count: number, maximum: number) {
  const bounded = Math.max(0, Math.min(maximum, left));
  return {
    index: Math.max(1, Math.min(count, Math.floor((bounded + 1) / Math.max(1, stride)) + 1)),
    progress: maximum > 0 ? bounded / maximum : 1,
    atStart: bounded < 2,
    atEnd: maximum - bounded < 2,
  };
}
