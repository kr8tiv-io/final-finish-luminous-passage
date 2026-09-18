# Dev contract — ports, env, harness

Local-only reference for running this repo during the awwwards rebuild. Not a
deployment doc (see Part B9 of the master plan for the Hostinger staging
path); this covers only `127.0.0.1` dev/build loops.

## Ports

| Port | What | Started by |
| --- | --- | --- |
| 4333 | Astro dev server (`astro dev`), hot-reloading, source-mapped | `.claude/launch.json` config `ffe-dev`, or `npm run dev -- --host 127.0.0.1 --port 4333`, or `playwright.config.ts` / `playwright.readability.config.ts` webServer |
| 4334 | Built Node app (`node dist/server/entry.mjs`, `@astrojs/node` standalone adapter), no HMR, the only source of real delivery numbers | `.claude/launch.json` config `ffe-built`, or `scripts/capture-journey.mjs --built`, or `scripts/measure-delivery.mjs` (always), or `playwright.delivery.config.ts` |

**Never force-restart a dev server on 4322.** 4322 is not a port this repo
uses — if something is listening there it belongs to a different project or
an earlier stray process; do not touch it, and do not add it to this repo's
launch or Playwright configs.

Do not run two dev servers against the same `node_modules` junction/worktree
at once (Astro's file watcher and Vite's dep-optimizer cache collide). If
`npm run dev` is already up on 4333, attach to it — don't start a second one
on another port "to be safe."

## Environment variables

| Var | Dev (4333) | Built (4334) | Why |
| --- | --- | --- | --- |
| `SITE_ENV` | `staging` | `staging` | Gates `scripts/validate-deployment-env.mjs` and any staging-only copy/noindex behaviour. `npm run check` fails closed without it. |
| `PUBLIC_SITE_URL` | `http://127.0.0.1:4333` | `http://127.0.0.1:4334` | Must match the port actually being served on, or absolute URLs baked into the page (OG images, canonical links, sitemap) point at the wrong origin. |
| `HOST` | n/a (Astro's own `--host` flag) | `127.0.0.1` | `@astrojs/node`'s `standalone` mode reads `process.env.HOST` directly (`node_modules/@astrojs/node/dist/standalone.js:16`) and falls back to the adapter's configured host only if unset. Confirmed by reading that file — no code change needed for the built app to honour it. |
| `PORT` | n/a | `4334` | Same file, line 15: `process.env.PORT` wins over the adapter's configured `port` option. |

`astro.config.mjs` configures the node adapter as `adapter: node({ mode: 'standalone' })` (line 47-48) — standalone mode is the one that starts its own HTTP server and reads `HOST`/`PORT`, unlike `mode: 'middleware'`.

## Which Playwright config for what

| Config | Target | Use for |
| --- | --- | --- |
| `playwright.config.ts` | 4333 dev, auto-starts it (`reuseExistingServer: true`) | Functional e2e during active development — `tests/e2e/*.spec.ts` except the two below. Two projects: `chromium`, `mobile-safari`. |
| `playwright.readability.config.ts` | 4333 dev | `readable-experience.spec.ts` only, one Chromium project. |
| `playwright.delivery.config.ts` | 4334 built, does **not** auto-start it — you must have the built app running first | `readability-capture.spec.ts` — the only config that measures real delivery bytes, because dev-mode Vite serves unbundled/unminified modules that do not represent production transfer size. Two projects: `built-desktop` (1440x900), `built-phone` (iPhone 15 Pro emulation). |
| `playwright.finishing-review.config.ts` | 4333 dev | `finishing-review.spec.ts`, frozen-state visual review captures (`review-desktop`, `review-phone`). |
| `playwright.gate.config.ts` | check before using — not read for this contract; treat as a narrower CI gate subset until confirmed | (existing config, unchanged by this task) |

**Serial Playwright rule:** every config here sets `workers: 1`. Do not raise
worker count locally — `docs/readability/VERIFICATION.md` records a real
regression (`npm run check` / dev-server navigation stalls, colliding output
directories) from a coordinator overriding this limit while other browsers
were active. Run one Playwright invocation at a time against a given server.

## `scripts/capture-journey.mjs`

Screenshots + a 60s scroll video per viewport (390x844 mobile, 768x1024
tablet, 1440x900 desktop) at every homepage chapter/section id
(`[data-journey-chapter]`, `[data-journey-white-stage]`, `#customer-reviews`,
`#proof`, `#consultation`), plus console error/warning counts, failed
requests, and the `html[data-journey-tier]` / `[data-journey-motion]`
attributes.

```
node scripts/capture-journey.mjs --label baseline
node scripts/capture-journey.mjs --label baseline --url http://127.0.0.1:4333
node scripts/capture-journey.mjs --label baseline --built
```

- Default behaviour: probes `--url` (or `http://127.0.0.1:4333`) via
  `/api/health`; if it answers, attaches to it. If not, falls back to the
  built app on 4334, starting `node dist/server/entry.mjs` (with
  `SITE_ENV=staging PUBLIC_SITE_URL=http://127.0.0.1:4334`) if nothing is
  already listening there.
- `--built` skips the dev-server probe and goes straight to the built app
  (attaching if already up, starting it otherwise).
- **Never kills a server it did not start** — it tracks whether it spawned
  the child process and only calls `.kill()` on that process.
- Idempotent: re-running with the same `--label` overwrites that label's
  files under `output/captures/<label>/`; it does not accumulate stale runs.

Output: `output/captures/<label>/<viewport>/<index>-<chapter-id>.png`,
`output/captures/<label>/<viewport>/scroll-video.webm`, and
`output/captures/<label>/summary.json` (per-viewport chapter list, console
error/warning counts, failed requests, tier, motion, page height).

## `scripts/measure-delivery.mjs`

Always targets the **built** app on 4334 (starts it if nothing is listening,
same non-destructive ownership rule as above). Measures, per viewport
(1440x900 desktop, 390x844 phone):

- arrival transfer bytes (all responses until `networkidle` after first paint)
- full-route transfer bytes after a scripted scroll through every chapter
- LCP element selector + time, CLS sum (`hadRecentInput === false`), an INP
  proxy (max `PerformanceObserver('event')` duration), long tasks > 50 ms
  (count + longest), the largest 10 resources by bytes, and total font bytes

via `page.addInitScript` registering buffered `PerformanceObserver`s before
navigation, matching the pattern in `tests/e2e/readability-capture.spec.ts`
(arrival/route resource snapshots) — this script does not modify that spec
or `playwright.delivery.config.ts`, only reuses their approach.

```
node scripts/measure-delivery.mjs --label baseline
```

Output: `output/delivery/<label>.json`, printed as a pass/fail table against
the Step 34 thresholds:

| Metric | Threshold |
| --- | --- |
| Phone arrival | ≤ 0.8 MB |
| Desktop arrival | ≤ 5 MB |
| Route transfer | ≤ 12 MB / 18 MB |
| LCP | ≤ 2.5 s |
| CLS | < .02 |
| INP (proxy) | ≤ 200 ms |
| Longest long task | ≤ 200 ms |

**Assumption flagged for review:** the master plan's Step 34 table lists the
route budget as "≤ 12/18 MB" without stating which figure is desktop and
which is phone. This script assumes **desktop ≤ 18 MB / phone ≤ 12 MB** (the
larger figure to the viewport that loads the 1080p pour/finish-hall
encodes across the whole scroll route). Revisit this mapping when Step 34
runs for real against the frozen build — this is the one figure in the
script that is inferred rather than quoted directly from the plan.

## Where outputs land

```
output/
  captures/<label>/<viewport>/*.png
  captures/<label>/<viewport>/scroll-video.webm
  captures/<label>/summary.json
  delivery/<label>.json
```

`output/**` should stay out of the Vite/Astro dev watcher (per the plan's
risk list) — it is scratch/evidence, not source.
