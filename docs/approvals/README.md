# Approvals folder — how this works

## Sending the pack to Denis

`2026-09-project-pairs.md` is written as plain Markdown with relative image
links so it previews correctly inside the repo (VS Code, GitHub, or any
Markdown viewer that can resolve `../../public/...` paths). To get it in
front of Denis, Matt can do either of:

1. **Export to PDF.** Open the file in a Markdown preview that renders local
   images (VS Code's built-in preview, or Obsidian/Typora), then "Print to
   PDF" or use the preview's export option. This is the simplest way to hand
   Denis one file he can mark up and send back.
2. **Share the folder.** Zip `docs/approvals/` (the markdown file plus the
   repo's `public/images/projects/generated/thumbnails/` folder it links
   into) or share read access to the working copy of the repo, so the
   relative image links resolve for Denis directly.

Either way, this is a **staging/curation artifact** — it is not published
anywhere, and none of the pairs in it are live to the public until Denis
approves them and Matt updates the gallery data.

## How approvals flow back into the gallery

The pack's own summary table (bottom of `2026-09-project-pairs.md`) lists
every row, its candidate asset ids, and its status (`candidate-known`,
`candidate-known-wired`, `candidate-auto`, or `single-photos-only`). That
table is written to be machine-parseable by a later script.

When Denis's checkmarks come back (Approve / Swap before-after / Do not
publish, plus any caption notes), the intended flow is:

1. Record Denis's decision per row (approve / swap / reject) and any caption
   text he supplied.
2. For each **approved** row, update the corresponding entry in
   `src/data/transformation-gallery.ts`:
   - If the pair is already wired (see the pack's "already wired live on
     staging" rows), flip its `publicationApproval` field from `'pending'`
     to `'approved'`.
   - If the pair is new (not yet in `transformations`/`sourceCandidates`),
     add a new `Transformation` entry using the row's before/after asset
     ids and generated-variant paths, with `publicationApproval:
     'approved'` and Denis's caption folded into `homeownerCaption` (never
     an invented one).
   - If Denis asked to **swap** before/after, swap which asset id is used
     for `before` vs `after` in that entry.
   - If Denis said **do not publish**, either omit the row entirely or set
     `publicationApproval: 'rejected'` (Step 9 of the plan adds a
     `rejected` status to `PublicationApproval` for exactly this case).
3. Leave `transformation-gallery.ts` itself untouched until that human
   approval step happens — this script and this README describe the flow,
   they do not edit that file.

Production only ever renders rows whose `publicationApproval` is
`'approved'`; staging shows `'pending'` rows with a visible badge; nothing
here changes that contract.
