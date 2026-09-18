import { readFile } from 'node:fs/promises';

// The homepage's "5.0 · 30 reviews" claim (src/data/customer-proof.json) is only as true as
// the day it was checked against the live Google listing. This script fails a week before that
// claim's own stated shelf life (rating.refreshAfterDays after rating.verifiedAt) runs out, so
// there is time to re-check the listing and update the file before the claim goes stale in
// production. `FFE_TODAY` (an ISO date string) overrides "now", for tests only.

const DAY_MS = 24 * 60 * 60 * 1000;
const WARNING_WINDOW_DAYS = 7;

const raw = await readFile('src/data/customer-proof.json', 'utf8');
const { rating } = JSON.parse(raw);
const verifiedAt = new Date(rating.verifiedAt);
const expiresAt = new Date(verifiedAt.getTime() + rating.refreshAfterDays * DAY_MS);
const warnFrom = new Date(expiresAt.getTime() - WARNING_WINDOW_DAYS * DAY_MS);
const today = new Date(process.env.FFE_TODAY ?? Date.now());
const expiryDate = expiresAt.toISOString().slice(0, 10);

if (today.getTime() > warnFrom.getTime()) {
  console.error(
    `Review snapshot (verified ${rating.verifiedAt}) expires ${expiryDate} — within its `
    + `${WARNING_WINDOW_DAYS}-day refresh window. Re-verify the Google listing (`
    + `${rating.source}) and update src/data/customer-proof.json.`,
  );
  process.exit(1);
}

console.log(`Review snapshot (verified ${rating.verifiedAt}) is fresh; refresh due by ${expiryDate}.`);
