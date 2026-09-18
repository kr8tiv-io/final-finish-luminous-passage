# Final Finish Epoxy — project brief

Rebuild of finalfinishepoxy.ca (Denis, Final Finish Epoxy Coatings, Edmonton): experiential, motion-led, "$100k agency" site that is fast and SEO/AI-search optimized. Base tree = `review/cinematic-readability-2026-09-14` ("G2"). Full history, decisions, and asset inventory: `docs/context/CONTEXT-SHEET.md`. Harvested elements from prior generations: `docs/context/HARVEST.md`. The 40-step build plan and context graph: `docs/context/graph.md` (rendered from `docs/context/graph.json` by `scripts/context-graph.mjs`).

## Locks — never invent, never change without sign-off

- Phone `(780) 991-1651`, email `finalfinishepoxy@gmail.com`. No invented warranty, address, hours, prices, cure times, or credentials.
- Every factual claim must trace to `docs/context/CLAIMS-LEDGER.md` and ultimately to the live site (`CONTEXT-SHEET.md` A8) or a written Denis confirmation. Competitor facts from the research docs in `Downloads` must never appear as a Final Finish claim.
- Keep the films and the scroll-drawn pour opening. No new or paid footage (B6) — only re-grading or 2.5D work on owned assets.
- Palette: warm white `#FAF9F6`, charcoal `#17222A`, cobalt `#164F83`, bronze accent. Typography: Manrope only, locked — no comp round, no paid fonts.

## Voice rules

Plain, confident, Oxford comma, no exclamation points, no AI cadence ("Discover the difference!", "Elevate your space!"). Say what the floor is and what happens next, not how amazing it is. **The "abrasive blasting" / "not sandblasting" wording rule belongs to a different client (Evolve Eco Blasting) and does NOT apply here** — this project's own vocabulary is epoxy, coating, flake, polyaspartic (as a neutral distinction only, see `CLAIMS-LEDGER.md`), grind, and prep.

## Stack and single-owner rules

Astro + React islands + GSAP + Three.js/R3F. Native scroll, no Lenis. One rule underlies every past regression here: **exactly one owner per piece of state.**

- `journey-director.ts` is the single director; it owns every cinematic scroll coordinate.
- `JourneyMotion.tsx` is the only writer of `data-media-active`.
- Canvas opacity is written only from `onAfterRender` — never from a second effect.
- One `<canvas>` element per page (a layout-level `SurfaceCanvas` with drei `<View>`s once Step 15 lands).
- No Lenis, no magnetic buttons, no custom cursor, no frosted/glassmorphism panels — Matt rejected all four explicitly.
- No second opacity/reveal system: if you are about to add a CSS var or React state that duplicates something the director or `JourneyMotion.tsx` already tracks, stop and route through the existing owner instead.

## Capability tiers

`full` / `balanced` / `still`, resolved once by `resolveJourneyTier(...)` from `webgl2`, `reducedMotion`, `saveData`, `effectiveType`, `coarsePointer`, `deviceMemory`, and user preference. Touch alone never drops below `balanced`. `still` must still tell the full narrative (fade/scrub fallback, never a blank state). The `FilmVeil` shader import is gated to `full` only.

## Commands

```bash
# Dev (staging env, fixed port)
SITE_ENV=staging PUBLIC_SITE_URL=http://127.0.0.1:4333 npm run dev -- --host 127.0.0.1 --port 4333

npm run check
npm test
npm run build:staging
```

Heavy Playwright runs go against the **built** app on port **4334**, not the dev server. Playwright is **serial only** — `workers: 1` — never parallel, and never two dev servers sharing one `node_modules` junction.

## Windows rules

- PowerShell and Node only. Git Bash cannot fork on this machine — do not attempt it.
- Git hooks are repo-local (`core.hooksPath`); never rely on the global `C:/Users/lucid/.git-hooks` hook, which fails with `fork` errors on this machine.
- Never `git add -A` from an orphan branch — it has previously scooped up `node_modules` and `.worktrees`.
- Do not commit `_seo_rewrite_resources.py`, `continue.md`, or `output/**`.
- Commit only the files your brief owns, on your own worktree branch, when the orchestrator's brief asks for it (every step brief does); never `git add -A`; never push. Identity: Matt-Aurora-Ventures <lucidbloks@gmail.com>, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Do not (carried from the G1 `continue.md` ledger)

- Do not remount `LuminousPassageScene` / `.passage-host` / the homepage `.glb` — these are dead G1 modules, not live code.
- Do not add a second car/room scene ad hoc — the garage/basement/mancave room set is deliberate (see `HARVEST.md`).
- Do not re-enable a per-room dark `ROOM_GRADE` — that was the miscolored-between-sections bug.
- Do not restore rejected copy lines wholesale without checking `CLAIMS-LEDGER.md` and the voice rules above.
- Do not commit `_seo_rewrite_resources.py` or any `tmp-sign-frames/`-style scratch directory.

## Tier map and file-ownership matrix (from the master plan, Part D)

| Role | Model / effort | Owns |
|---|---|---|
| Orchestrator | Fable 5.1 | Art direction, contracts, graph, briefs, merges, approvals |
| Auditor | Fable, max | Read-only review, blind pairwise setup, one bounded polish batch |
| Motion engineer A | Opus, xhigh | `FilmVeil.tsx`, `journey-media.ts`, `journey-transitions.ts`, `journey-director.ts`, `JourneyMotion.tsx` |
| Motion engineer B | Opus, xhigh | `TransformationGallery*`, `nav/*`, `SurfaceCanvas.tsx` (after step 15), `StairAscent.tsx` |
| Motion engineer C | Opus, high | Route transitions, social-proof motion, headline mask, mobile composition |
| UI / content builders | Sonnet, medium | Content, SEO, ledger, mechanical-adjacent build steps, tests |
| Mechanical | Haiku, low | Moves, encodes, upscales, manifests, captures |
| Verifiers | Opus, high | Re-run gates after auditor polish — never certify their own work |

File-ownership rule: `FilmVeil.tsx` → Motion A, serial across its steps; `TransformationGallery*` → Motion B, serial across its steps; `index.astro` → one step edits it first, later steps touch disjoint sections and the orchestrator merges. Full 40-step table, tiers, gates, and parallel sets: `docs/context/graph.md` / `graph.json`.

## Pointers

- `docs/context/CONTEXT-SHEET.md` — full project history, decoded references, live-site truth, competitors.
- `docs/context/HARVEST.md` — what was ported from prior generations and why.
- `docs/context/MOTION-VOCABULARY.md` — every motion id, its mechanic, and its reduced-motion equivalent.
- `docs/context/CLAIMS-LEDGER.md` — every factual claim and its source.
- `docs/context/graph.json` / `graph.md` — the machine-readable and rendered build graph.

## Astro documentation

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)
