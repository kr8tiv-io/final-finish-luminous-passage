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

## Security headers (Step 10)

The header set (CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`,
`X-Content-Type-Options`, and `Strict-Transport-Security` over https only) lives
in one place, `src/lib/security/headers.ts`, and reaches responses two
different ways depending on how the route is rendered:

- **On-demand (SSR) responses** — every route under `src/pages/api/**`, each of
  which sets `export const prerender = false` — get the headers live, per
  request, from `src/middleware.ts` (`astro:middleware`'s `onRequest`, applied
  to `next()`'s response). Astro 7 auto-loads `src/middleware.ts` from
  `${srcDir}middleware`; confirmed by reading
  `node_modules/astro/dist/core/middleware/vite-plugin.js` before adding the
  file, so `astro.config.mjs` needed no change for this.
- **Prerendered/static HTML** — every `*.astro` page in this project — never
  passes through that pipeline at request time. Confirmed by reading
  `node_modules/@astrojs/node/dist/standalone.js`: the standalone server's
  request handler runs a static-file handler first
  (`staticHandler(req, res, () => appHandler(req, res))`), and `send()`s a
  matching file straight off disk from `dist/client` before an incoming
  request ever reaches the Astro app (and therefore never reaches
  `astro:middleware`). `scripts/build-prerender-headers.mjs` runs after every
  `npm run build` (wired as the `postbuild` npm script, so `build:staging` /
  `build:production` pick it up automatically) and writes the same header map
  to `dist/prerender-headers.json` for the host/reverse-proxy layer to apply.

**Open item, not resolved by Step 10:** nothing in this repo currently reads
`dist/prerender-headers.json` and applies it. The two real options, for
whichever lands first:
1. The eventual VPS Docker + Caddy path (Part B9) — add a Caddy
   `header` block from that file's contents.
2. `@astrojs/node`'s own `staticHeaders: true` adapter option, which — when
   Astro's `security.csp` config is also enabled — writes
   `dist/_headers.json` (see `node_modules/@astrojs/node/dist/shared.js`,
   `STATIC_HEADERS_FILE`) in its own `{ pathname, headers: [{key,value}] }[]`
   shape, and its standalone/preview server reads that file back and applies
   it to matching static routes with no reverse proxy at all. This only ever
   carries the `Content-Security-Policy` header, not the other four, and
   turning it on means an `astro.config.mjs` change (`security.csp` +
   `node({ ..., staticHeaders: true })`) — out of scope for Step 10's file
   ownership, so this is a recommendation for whichever later step owns
   `astro.config.mjs`, not something wired up here.

Until one of those lands, the built homepage and every other static page
serve without these headers when run standalone
(`node dist/server/entry.mjs`) — verify by re-reading this section before
treating a "0 CSP violation" browser check on the homepage as evidence the
policy is live in production; it currently only proves the policy string
itself does not break the page when enforced (see the Step 10 verification
probe), not that it is being enforced yet.

## Quote rate limiting (Step 10)

`src/pages/api/quote.ts` reads its rate-limit window and cap from
`QUOTE_RATE_WINDOW_MS` / `QUOTE_RATE_LIMIT` (falling back to the original
15-minute / 3-request defaults when unset or invalid), but the limiter itself
is still the same process-local `Map` it always was — it resets on every
restart, is per-process (not shared across worker processes or horizontally
scaled instances), and trusts `clientAddress` as-is. **A shared limiter
(Redis/Upstash, or an equivalent store reachable from every instance) behind
a host that terminates and validates the real client IP is a prerequisite
before production traffic**, not an optional hardening pass. Turnstile (or
an equivalent challenge) remains optional on top of that, not a replacement
for it.

## One canvas, three views (Step 18a)

The site mounts exactly one WebGL context. `SurfaceCanvas` (`BaseLayout.astro`)
owns it; everything else that wants to draw registers a **view** with
`surfaceStore.registerView(id, element, { render, priority })`. Each rendered frame
the canvas clears once, walks the registry, skips views whose element does not
intersect the viewport, scissors to the element's rect and calls that view's
`render` with the shared renderer.

| priority | view | element | registered by |
|---|---|---|---|
| 0 | `film-veil` | `.film-veil` | `FilmVeil.tsx` on the `full` tier |
| 10 | `surface-floor` | `[data-surface-fallback]` | `SurfaceFloor.tsx` |
| 20 | `nav-floor` | `[data-nav-menu-floor]` | `SurfaceFloor.tsx` while the menu is open |

`priority` is not a free choice. It reproduces the z-order these layers had as
separate canvases: `.journey` is `isolation: isolate` at `z-index: auto` and
`.surface-canvas-host` is `z-index: 1`, so the floor band has always painted
**over** `.film-veil`. Giving the veil the higher priority was measured as a 16.9%
luminance step in the bottom third of the frame every time a boundary handed the
picture back to the DOM.

**Canvas opacity has no JS writer any more.** The previous rule — "canvas opacity is
written only from `onAfterRender`" — assumed the compositor owned its own canvas.
It does not, and a view that hid the shared element would hide every other view with
it. The rule that replaces it:

> A view that wants to disappear writes transparent pixels or unregisters. It never
> touches `canvas.style`. `.film-veil` sets `uVisible` to 0 (the shader emits
> `vec4(0)` and the DOM plates below show through untouched); `nav-floor`
> unregisters on close. The `<canvas>` element's opacity belongs to CSS alone.

`onAfterRender` keeps its other job unchanged: it is still the single owner of the
two-pass paint confirmation and of `journeyDirector.reportVeil(...)`, and it still
confirms without a framebuffer read. The compositor's frame state moved with it, off
the shared canvas and onto the element it does own — `.film-veil[data-rendered-boundary]`,
`[data-rendered-progress]`, `[data-rendered-revision]`. Anything asking what the
veil painted reads those, not a canvas.

**Registering from another React root.** `FilmVeil` is an island inside `.journey`
and `SurfaceCanvas` is an island in `BaseLayout`; they share no react-three-fiber
context. That is why the renderer is handed to `render` in the view context instead
of being captured from `useThree` — a view needs no R3F context of its own, only a
DOM rectangle and a draw call.

**Which plate the compositor samples.** `veilPlateChoice` mirrors
`video[data-video-ready]`, which `JourneyMotion.tsx` is the only writer of. The
veil never decides a second time from scroll direction or `currentTime`: it samples
whatever the document is presenting, so it cannot render a room's poster while the
page has already promoted that room's film. It also re-reads this every frame rather
than freezing a texture when the boundary locks — the lock holds which rooms take
part and which way the visitor entered, not which plate each one shows.

**The menu's floor is the same material.** `FloorMenuScene.tsx` no longer owns a
scene, a `MeshPhysicalMaterial`, a shader chunk or an environment map. It maps a
hovered destination's finish onto a `SURFACE_MATERIALS` id and calls
`surfaceStore.morphTo`; `SurfaceFloor` renders the same plane through a closer
lens into the menu's rectangle. While that view is live the overlay's own
`.nav-menu__veil` steps aside (`surface.css`) because the view clears its scissor
box to opaque paper itself. Both the CSS gradient floor and that paper plate return
the moment the view unregisters or `html[data-surface]` leaves `webgl`, which is
what keeps a lost context, a `balanced` phone and a reduced-motion visitor looking
at an intact menu.

**Retired here, on purpose:** `ThresholdTravel` is no longer mounted. It is an R3F
component and `FilmVeil` no longer has an R3F context to mount it into. It was
reachable only under `import.meta.env.DEV` with `?study=threshold`
(`index.astro:26`), never on a built page; the opt-in is still recorded as
`.film-veil[data-threshold-study-requested]` and the component is untouched on
disk. Step 20 decides whether that study survives at all.
