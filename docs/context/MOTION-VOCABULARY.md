# Motion vocabulary — schema stub

This file is a **stub**: schema and rows only. Step 14 of the master plan (`C:\Users\lucid\.claude\plans\i-was-working-on-calm-gizmo.md`, Part C, Phase 2) completes it with full durations, eases, reduced-motion equivalents, and reference citations for every planned id, and `scripts/context-graph.mjs` will validate that every motion-touching step cites at least one id here once this file is complete (until then it only warns).

## Schema

| Column | Meaning |
|---|---|
| `id` | Stable identifier used in code, briefs, and `docs/context/graph.json` `vocab` arrays. |
| `kind` | One of `text`, `scene`, `hover`, `layout`. |
| `status` | `existing` (already implemented in the G2 codebase, verified below) or `planned` (named in the master plan, not yet built). |
| `duration` | Seconds, or `scrub` for scroll-linked motion with no fixed duration. |
| `ease` | GSAP ease string, or `n/a` for scrub-driven motion with no ease curve. |
| `reduced-motion equivalent` | What happens under `prefers-reduced-motion: reduce` / `still` tier — never "nothing," per A4's non-negotiables (the narrative must still read). |
| `reference` | Which `CONTEXT-SHEET.md` A4b reference (if any) this id borrows its mechanic from. |
| `owner file` | The file that will own/does own this id's implementation. |

## Rows — existing ids (filled from code, verified 2026-09-18)

| id | kind | status | duration | ease | reduced-motion equivalent | reference | owner file |
|---|---|---|---|---|---|---|---|
| `line-rise` | text | existing | 0.6s (desktop), 0.6s (compact) | `power3.out` | Static, settled position (`phase: 'settled'`, no animation dispatch); see `headlineMotionMode` | none (native to G2) | `src/lib/motion/headline-motion.ts` |
| `lateral-curtain` | text | existing | 0.6s | `power3.out` | Static, settled position | none (native to G2) | `src/lib/motion/headline-motion.ts` |
| `depth-settle` | text | existing | 0.6s | `power3.out` | Static, settled position | none (native to G2) | `src/lib/motion/headline-motion.ts` |
| `epoxy-mask` | text | existing | 0.6s | `power3.out` (clip-path tween) | Static, settled clip-path (`EPOXY_MASK_TO`) | none (native to G2) | `src/lib/motion/headline-motion.ts` |
| `white-dissolve` | scene | existing | scrub | n/a (`easeInOut` smoothstep inside the shader, not a GSAP ease) | Boundary shows resolved end-state media directly, no shader blend pass | Igloo Inc (render-target blend concept) | `src/components/motion/FilmVeil.tsx` (mode 0), `src/lib/motion/journey-transitions.ts` |
| `aperture` | scene | existing | scrub | n/a (shader-internal `smoothstep`) | Same as above | Igloo Inc | `src/components/motion/FilmVeil.tsx` (mode 1) |
| `fold` | scene | existing | scrub | n/a (shader-internal `smoothstep`) | Same as above | Creative Ocean (fold concept, distinct from the planned `fold-and-shoot-left`) | `src/components/motion/FilmVeil.tsx` (mode 2) |
| `resin-wipe` | scene | existing | scrub | n/a (shader-internal `smoothstep`) | Same as above | Creative Ocean `qBbBLyB` | `src/components/motion/FilmVeil.tsx` (mode 3), used for the `customer-reviews` white-target transition |
| `preparation-curl` | scene | existing | scrub | n/a (shader-internal `smoothstep`) | Same as above | isladjan `abdyPBw` (layered/curl concept) | `src/components/motion/FilmVeil.tsx` (mode 4) |

Notes on the existing rows, from reading the code directly:

- All four `headline-motion.ts` styles share `ease: 'power3.out'` and a `duration` of `0.6` for both desktop and compact specs; they differ in `from`/`to` transform values and `stagger` (0.03–0.06s depending on style and viewport). `headlineMotionMode()` is the reduced-motion/settled gate: when `presentationEnabled` is false it returns `'static'`, which callers must render as the settled end-state with no animation dispatch.
- The five `FilmVeil.tsx` shader modes (0–4) are scroll-scrubbed by `transitionProgress`, not GSAP-tweened; there is no discrete "duration" — progress comes directly from `journey-director.ts`'s scroll-derived snapshot. The shader's own `easeInOut()` (a smoothstep) is the only "ease" involved. Reduced motion / `still` tier does not run this shader at all (Step 8's tier resolver gates the veil import to the `full` tier) — the DOM crossfade (`--handoff`/`dissolveWeight`) is the fallback transition in `balanced`, and `still` uses a plain end-state swap.
- `src/scripts/intent-motion.ts` implements a hover "glint" effect (a moving reflection inside a stationary link, `quickTo` on `x`/`y`/`opacity`, `duration: 0.36`, `ease: 'power3.out'`) and `src/scripts/header-ribbon.ts` implements a moving nav highlight (`duration: 0.48`, `ease: 'power3.out'`). Both are **not** listed as one of the planned `hover`-kind ids below by name yet — Step 14 must decide whether `glint`/`nav-echo` formalize these existing behaviors or supersede them, and update this table's `status` accordingly. Left as `planned`/TODO here per the task's schema rule (existing code found, but not yet assigned to a named vocabulary id by an approved step).

## Rows — planned ids (TODO, completed in Step 14)

| id | kind | status | duration | ease | reduced-motion equivalent | reference | owner file |
|---|---|---|---|---|---|---|---|
| `char-fold` | text | planned | TODO | TODO | TODO | TODO (A4b: gsap.com) | TODO |
| `word-swap` | text | planned | TODO | TODO | TODO | TODO (A4b: gsap.com) | TODO |
| `char-float` | text | planned | TODO | TODO | TODO | TODO (A4b: Young Multi) | TODO |
| `swallow` | scene | planned | TODO | TODO | TODO | TODO (A4: "one scene swallows the other") | TODO |
| `fold-and-shoot-left` | scene | planned | TODO | TODO | TODO | TODO (A4: "fold the whole screen into itself and shoot left") | TODO |
| `horizontal-pull` | scene | planned | TODO | TODO | TODO | TODO (A4: horizontal pulls) | TODO |
| `resin-swirl-plate` | scene | planned | TODO | TODO | TODO | TODO (A4b: Young Multi ink/smoke video plate, recolored) | TODO |
| `layered-scrub` | scene | planned | TODO | TODO | TODO | TODO (A4b: isladjan `abdyPBw`) | TODO |
| `glint` | hover | planned | TODO | TODO | TODO | TODO | TODO — note: `src/scripts/intent-motion.ts` already implements a similar effect; Step 14 must reconcile |
| `nav-echo` | hover | planned | TODO | TODO | TODO | TODO | TODO — note: `src/scripts/header-ribbon.ts` already implements a similar effect; Step 14 must reconcile |
| `image-lens` | hover | planned | TODO | TODO | TODO | TODO | TODO |
| `underline-travel` | hover | planned | TODO | TODO | TODO | TODO (A4b: gsap.com `easeReverse:true` on hover-out) | TODO |
| `perspective-cylinder` | layout | planned | TODO | TODO | TODO | TODO (A4b: jh3y `PovoorJ`) | TODO |
| `page-wipe` | layout | planned | TODO | TODO | TODO | TODO (Step 12: `<ClientRouter />` page transition) | TODO |

## Completion gate (Step 14)

Step 14 is done when every row above has no `TODO` cell, `scripts/context-graph.mjs` no longer emits its "MOTION-VOCABULARY incomplete" warning, and every later motion step (15, 17–28) cites at least one `id` from this table in its brief and in `docs/context/graph.json`'s per-step `vocab` array.
