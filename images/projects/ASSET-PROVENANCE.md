# Project photo asset provenance

## Source

- Public source page: <https://www.finalfinishepoxy.ca/projects>
- Source host: `images.squarespace-cdn.com` (the CDN URLs publicly rendered by the page)
- Collection date: 2026-08-31
- 96 project-photo assets were collected. The page also exposed one favicon, which is intentionally excluded.

The files in `assets/source-project-photos/originals/` are the unparameterized CDN responses, stored byte-for-byte after download and tracked with Git LFS. They are archival-only and intentionally outside `public/`. The URL and source filename for every asset are recorded in `src/data/project-photo-pairs.json`.

## Derivatives and runtime fallback

Each original has an AVIF, WebP, and optimized JPEG fallback in `public/images/projects/generated/`, plus an aspect-preserving thumbnail WebP. AVIF derivatives are bounded to a maximum 2400px box at quality 62; WebP derivatives are bounded to 2400px at quality 76; JPEG fallbacks are bounded to 2000px at quality 80. Thumbnail dimensions are selected as aspect-preserving integers inside a maximum 640x480 box with no enlargement, so no thumbnail is cover-cropped. EXIF orientation is applied to derivatives only. No colour retouching, object removal, compositing, or proof manipulation was performed.

Variant generation writes every derivative to an ignored staging tree, validates the complete staged set (including decode, dimensions, ratios, count, and unexpected-file checks), then atomically promotes it while retaining a rollback path for pre-promotion errors. The existing public set is not deleted before staged validation succeeds. Once the staged tree is promoted, cleanup errors preserve the valid new output and retain the owned transaction marker for safe recovery or refusal. An owned transaction marker permits startup recovery of a valid backup after an interrupted promotion; malformed or foreign markers/backups refuse execution, and successful runs remove the marker and backup state.

Runtime `<picture>` policy: request AVIF first, WebP second, and use the optimized public JPEG at the manifest `jpeg` path last. Thumbnails are listing previews only. The LFS originals are never runtime fallbacks and are not part of the deployable `public/` payload.

## Pairing and approval

The manifest includes 12 deterministic candidate groups based on source filename/date clues requested in the brief. Filename order can suggest a sequence but cannot prove that two photographs share an angle or represent a before/after state. Every asset and group is therefore marked `approvalRequired: true`; crop, focal-point, and alignment fields are placeholders pending client review.

No project location, material, timeline, garage, or other unverified project facts have been inferred from the images.
