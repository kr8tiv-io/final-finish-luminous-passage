# A cinematic experience you can read

14 September 2026 · implementation review · not a production release

The scene moves; the message lands. This iteration keeps the existing films, palette and scroll-driven opening, with a separate, dependable reading layer.

## Source and preservation

Continue from `feature/follow-the-floor`, local HEAD `275710b9b3b2cc85b18f61ba75e8d2786b6dcb98`, including the existing staged, unstaged and untracked application work. The pre-implementation checkpoint is `output/checkpoints/2026-09-14T07-17-23-885Z`. The original Grok and Sunlit worktrees remain untouched.

The private audit branch is the remote preservation baseline. A separate review checkpoint can be prepared with `node scripts/publish-readable-checkpoint.mjs`; publishing is explicit with `--publish`. It checks the destination is private, verifies every resulting blob/tree, preserves the local index and remote-only audit documents, and never updates main. It refuses new unverified LFS objects.

## Implemented reading layer

- Manrope display, heading, body and caption tokens, with less compressed tracking and useful line heights.
- A first-paint service description and “A better floor changes the whole space.”
- Six server-rendered white editorial passages for preparation, garages, basements, finish choice, commercial planning and consultation.
- Readable service and guide templates; expanded residential, commercial and preparation buying guidance.
- A single consultation poster instead of the competing film/image handoff.
- Three review cards on large screens; native horizontal browsing, explicit controls and readable excerpts.
- Mobile navigation remains accessible without JavaScript.

The pearl-blue pour is a local colour grade of the original footage: identical frame count, duration and choreography. It is not a regenerated pour. The grade reduces competing warm/lilac colour, but **does not claim tracked removal of every dark fragment**. See [asset provenance and timing](pearl-pour-asset-manifest.md).

## Motion engineering

The journey director owns cinematic coordinates. Headings arrive when the actual copy reaches its reading position, not merely when the background changes. React-owned gallery DOM is excluded from external SplitText manipulation.

Still, reduced motion and Save-Data reject the cinematic canvas import. Current/adjacent media are retained; distant video and texture resources are released. The resin and preparation transition modes change a stable blend boundary rather than deforming real project photography.

The independent Astra/ultra reviewer inspected the final desktop/phone recordings and the corrected comparison interactions. Its bounded CSS polish was separately verified by Terra. Client approval of the visual direction remains open; passing timing and endpoint tests alone does not establish artistic quality. See the [verification ledger and current captures](readability/VERIFICATION.md).

## Evidence and editorial boundaries

Only three curated same-project comparison candidates are currently in the staging gallery. Camera differences remain visible; they are not claimed to be pixel-perfect registrations. Additional source candidates and missing client originals are recorded in the [project approval queue](project-pair-approval-queue.md). Every pairing remains pending publication approval. Production omits pending comparisons and provides the public project archive instead; the target of approximately fifteen distinct approved jobs remains open.

The stored Google snapshot is 5.0 from 30 reviews, checked September 8 in Edmonton (September 9 UTC). It is a dated snapshot, not a live feed. The current turn could not independently refresh the Maps listing. Seventeen excerpts are distinct from the aggregate count.

All fifty guides were inventoried, not blanket fact-checked. The arbitrary word-count band was removed, and sixteen genuinely redundant opening headings were removed without changing their qualified prose or publishing status. [The content review](readability-content-review.md) identifies overlapping tire-pickup topics and draft/published language contradictions still requiring editorial decisions.

## Verification procedure

Use Node 22.12 or newer, and the current worktree:

```powershell
$env:SITE_ENV = 'staging'
$env:PUBLIC_SITE_URL = 'http://127.0.0.1:4333'
npm run dev -- --host 127.0.0.1 --port 4333 --background
npm run check
npm test
npx playwright test --config playwright.readability.config.ts
npx playwright test tests/e2e/transformation-ribbon.spec.ts
npm run build:staging
```

Browser tests reuse port 4333. Do not restore the old `--force` test startup on 4322: Astro permits one tracked server per worktree, so that configuration stopped the user's preview.

The delivery capture suite targets the **built Node application** on 4334, separately from the development server. It records desktop and emulated-phone screenshots, a motion capture, transfer entries and runtime errors under `output/playwright/readability-delivery`.

## Explicit open gates

1. Client approval of the grade and actual transitions.
2. A production-quality stair ascent. The new local Blender geometry/camera study passes five contract tests, but remains flatter than the existing image; it was not promoted or rendered as a full movie.
3. Pairing/publication approval and additional genuine source photographs.
4. Current review verification and company-specific content approval.
5. Physical iPhone/Android, screen readers, background/data-saver device behaviour and field Core Web Vitals.
6. Protected Hostinger staging access, real sandbox email delivery and production abuse/proxy configuration.
7. Local asset-transaction recovery: the existing recovery fixture fails reproducibly with Windows `EPERM` at the directory rename in `scripts/generate-project-variants.mjs:86`. The asset suite passed 8/9 checks, including decoding all runtime variants and originals. No permission changes, regeneration of original photography, or production asset promotion were attempted to bypass this failure.

No paid generation, stock subscription, live-domain replacement or production deployment occurred. No new public backend endpoint is required for this presentation pass.
