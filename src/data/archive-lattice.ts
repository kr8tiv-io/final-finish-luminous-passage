import pairs from './project-photo-pairs.json';

/**
 * Act 6 — the archive lattice's tile table.
 *
 * SERVER-ONLY BY CONSTRUCTION. This module imports the 96-record
 * `project-photo-pairs.json` manifest, so it is imported from `index.astro`'s
 * frontmatter and nowhere else; the island receives the compact shape below as
 * props and the manifest never reaches a client bundle.
 *
 * The order is `sourcePageOrder` ascending — the order
 * `finalfinishepoxy.ca/projects` lists the photographs, and the same order
 * `public/images/projects/atlas/archive-atlas.json` cuts its 12 × 8 atlas in
 * (`ASSET-LEDGER.md`, "Wave 3 — archive atlas"). The DOM lattice and the
 * (optional, `full`-tier) atlas flyover therefore address the same tile by the
 * same index without either one owning a second ordering.
 */

export interface ArchiveTile {
  readonly id: string;
  /** `/images/projects/generated/thumbnails/<id>.webp`, ≤ 640 × 480. */
  readonly thumbnail: string;
  /** Still awaiting Denis's publication approval — renders dimmed, uncaptioned. */
  readonly approvalRequired: boolean;
}

export interface ArchiveResolveImage {
  readonly id: string;
  readonly avif: string;
  readonly webp: string;
  readonly jpeg: string;
  readonly thumbnail: string;
  readonly width: number;
  readonly height: number;
}

interface ManifestAsset {
  readonly id: string;
  readonly sourcePageOrder: number;
  readonly width: number;
  readonly height: number;
  readonly approvalRequired?: boolean;
  readonly variants: {
    readonly avif: string;
    readonly webp: string;
    readonly jpeg: string;
    readonly thumbnail: string;
  };
}

const assets = [...(pairs.assets as readonly ManifestAsset[])]
  .sort((left, right) => left.sourcePageOrder - right.sourcePageOrder);

export const ARCHIVE_TILES: readonly ArchiveTile[] = Object.freeze(assets.map((asset) => Object.freeze({
  id: asset.id,
  thumbnail: asset.variants.thumbnail,
  approvalRequired: asset.approvalRequired ?? pairs.approvalRequired === true,
})));

/** 12 × 8 = 96 uniques, wrapping on both axes. `EXPERIENCE-STORYBOARD.md` §8.5. */
export const ARCHIVE_COLUMNS = 12;
export const ARCHIVE_ROWS = 8;

/** Phone keeps columns 0–5 of the same block: 6 × 8 = 48 tiles (storyboard §2, Act 6). */
export const ARCHIVE_PHONE_COLUMNS = 6;

export const ARCHIVE_PHOTO_COUNT = ARCHIVE_TILES.length;

/**
 * `[sourced: A8]` — the live projects page carries 96 photographs in 23 gallery
 * rows, June 2025 to February 2026 (`CONTEXT-SHEET.md` A8, `CLAIMS-LEDGER.md`
 * "Every image here is a Final Finish job"). The photograph count is rendered
 * from the manifest; only the job count and the date range are constants, and
 * both are ledger-sourced rather than invented.
 */
export const ARCHIVE_JOB_COUNT = 23;
export const ARCHIVE_DATE_RANGE = 'June 2025 to February 2026';

/**
 * Where the cylinder's front slot lands (`unwrap-to-lattice`) and which tile
 * grows to full bleed (`tile-resolve`).
 *
 * Both sit in columns 0–5 so they survive the phone trim, and both are far
 * enough apart that the act does not open and close on the same photograph.
 * The resolve target is `img_3597` — the storyboard's own Act 6 candidate
 * ("`generated/avif/img_3597.avif`", §5) — which is `sourcePageOrder` 74, i.e.
 * column 2, row 6 of the block.
 */
export const ARCHIVE_LEAD_INDEX = 51;
export const ARCHIVE_RESOLVE_ID = 'img_3597';

export function archiveResolveIndex(): number {
  const index = ARCHIVE_TILES.findIndex((tile) => tile.id === ARCHIVE_RESOLVE_ID);
  return index >= 0 ? index : 0;
}

export function archiveResolveImage(): ArchiveResolveImage {
  const index = archiveResolveIndex();
  const asset = assets[index];
  return Object.freeze({
    id: asset.id,
    avif: asset.variants.avif,
    webp: asset.variants.webp,
    jpeg: asset.variants.jpeg,
    thumbnail: asset.variants.thumbnail,
    width: asset.width,
    height: asset.height,
  });
}

/** How many tiles are still waiting on Denis — drives the staging-only note. */
export const ARCHIVE_PENDING_COUNT = ARCHIVE_TILES
  .filter((tile) => tile.approvalRequired).length;
