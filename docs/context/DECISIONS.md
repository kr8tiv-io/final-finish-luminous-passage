# Decisions

Standing decisions that outlive the step that made them. A decision belongs here when
a later step could plausibly undo it by accident: a default that looks arbitrary, a
thing deliberately not built, a rule split across two files. Implementation detail
stays in the file that implements it; `DEV-CONTRACT.md` keeps the ports, the env and
the harness.

Each entry names the decision, what was rejected, and what would have to change for
the decision to be revisited.

---

## 1. Analytics: aggregate only, and only if the VPS path is taken

**Decided (Step 33):** the site ships no analytics, no tag manager, no pixel, no
session recorder, and no error-reporting endpoint. If measurement is wanted later, the
only sanctioned shape is a self-hosted, aggregate-only counter — Plausible or Umami,
the community/self-hosted edition, on the project's own VPS — and only on the VPS
path.

The two deployment paths are not equivalent here, which is why this decision is
conditional rather than a flat yes or no:

| Path | Analytics | Why |
| --- | --- | --- |
| Hostinger Node app (`@astrojs/node` standalone, the current staging target) | **None.** | There is nowhere to host the collector, and putting the script on a third-party endpoint is exactly the thing being refused. |
| VPS, Docker + Caddy (Part B9 of the master plan) | **Plausible or Umami, self-hosted, same origin.** | Same origin means the collector is behind the site's own CSP and the site's own `Content-Security-Policy` in `src/lib/security/headers.ts` needs no third-party `connect-src` or `script-src` entry to allow it. |

Aggregate only means: page views, referrer, country, device class, and the two or
three events Denis would actually act on (quote form submitted, phone number tapped).
It does not mean cookies, cross-site identifiers, fingerprinting, user-level event
streams, heatmaps, or session replay, and nothing may be stitched into a per-visitor
timeline.

**No third-party script may load before consent, and nothing currently needs
consent.** The site sets no cookie a visitor has not asked for. That is what lets it
ship with no consent banner at all, which is a better outcome than a banner — so the
bar for adding a script that would require one is: it has to be worth a modal on every
first visit, forever. GA4, Meta's pixel, Hotjar, Clarity and LogRocket were each
considered against that bar and none clears it.

**Errors follow the same rule.** `MotionErrorBoundary` reports a failed island with
one `console.error` and nothing else. It has no endpoint to send to, deliberately: a
client-side error reporter is a third-party script with a permanent outbound channel,
and the failures this project actually has are reproducible from the gates in
`tests/e2e/` rather than from a production stack trace.

**Revisit when:** the VPS path lands and Denis asks a question the server's own access
log cannot answer. Until then the access log is the analytics.

---

## 2. The quote API's rate limiter: the edge owns it, the process backs it up

**Decided (Steps 10 and 33):** `src/pages/api/quote.ts` keeps its in-process sliding
window, and it is explicitly **not** the production limiter. The production limiter is
a per-IP token bucket at the edge — Caddy's `rate_limit` on the VPS path — and the
in-process one is the backstop that still refuses a flood if a request reaches the app
with the edge misconfigured, bypassed, or not yet deployed.

Why two, rather than moving the limit to one place:

- The in-process `Map` resets on every restart, is per-process, and would be per
  container behind any horizontal scaling. On its own it is not a limit, it is a speed
  bump.
- `clientAddress` is whatever the adapter reports. Behind a reverse proxy that is the
  proxy unless the proxy is trusted and the header chain is validated, so the app
  cannot be the component that decides what "one client" means. The edge can: it is
  the thing terminating the connection.
- Deleting the in-process one would leave the app with no limit at all in exactly the
  window where mistakes happen — first deploy, a changed vhost, a direct hit on the
  Node port.

**Knobs the code already exposes** (read at module scope through `import.meta.env`, so
they are build/runtime env vars, not a config file):

| Knob | Where | Default | What it does |
| --- | --- | --- | --- |
| `QUOTE_RATE_WINDOW_MS` | `src/pages/api/quote.ts` | `900000` (15 min) | Sliding window length. Invalid or non-positive values fall back to the default rather than disabling the limit. |
| `QUOTE_RATE_LIMIT` | `src/pages/api/quote.ts` | `3` | Requests allowed per IP per window. Checked **before** the request body is read, so a flood of oversized posts costs the admission check and nothing more. |
| `QUOTE_RECIPIENT` / `QUOTE_SENDER` | `src/pages/api/quote.ts` | the business address | Delivery envelope; unrelated to limiting, listed so the quote route's full env surface is in one table. |
| `SMTP_*` / `RESEND_API_KEY` | `src/pages/api/quote.ts` | unset | Delivery transport. With neither set the route still validates and still rate-limits. |

**The other two admission gates on that route,** both of which are cheaper than the
limiter and run around it:

- **Same-origin browser check** (`isSameOriginBrowserRequest`, `request-guards.ts`) —
  a non-browser POST is refused with `SAME_ORIGIN_REQUIRED` before anything else.
- **The time trap** (`isImplausiblyFastSubmission`, `request-guards.ts`) — the form
  sends `startedAt`, an epoch millisecond captured when the quote form first rendered,
  and a submission that arrives less than `minElapsedMs` (3000) after it is refused
  with `SUBMITTED_TOO_FAST`. It is deliberately **tolerant**: a missing or malformed
  `startedAt` is never a reason to refuse, because a real visitor with a script blocker
  or an older cached page must still be able to ask for a quote. It is a trap for the
  naive bot, not an authentication.

A body-size ceiling (`readBodyWithLimit`, 3 MB) and a delivery `ConcurrencyGate` sit
behind those; neither is a rate limit and neither should be described as one.

**Turnstile stays optional.** Cloudflare Turnstile (or an equivalent challenge) is a
reasonable addition *on top of* an edge limiter and is never a replacement for one — a
challenge that can be solved once and replayed does not bound request rate. It is also
a third-party script, so decision 1 applies to it: it would be the first thing on this
site that loads code from someone else's origin, and that is a trade to make
deliberately when the spam actually arrives, not pre-emptively.

**Shape of the Caddy side, for whoever builds it:** a `rate_limit` matcher on
`POST /api/quote` keyed on the real client IP, burst equal to the in-process
`QUOTE_RATE_LIMIT` or lower, plus the `header` block that applies
`dist/prerender-headers.json` (see `DEV-CONTRACT.md`, "Security headers") so static
pages finally get the header set the API routes already get from `src/middleware.ts`.
The two are the same Caddyfile change and should land together.

**Revisit when:** the VPS path lands (build both halves), or if the Hostinger Node-app
path becomes permanent, in which case the in-process limiter becomes the only limiter
and its window and cap should be tightened to match.

---

## 3. Capability tiers: the rules, in the order they are asked

**Decided (Steps 28 and 33):** `resolveJourneyTier` in `src/lib/motion/journey-tier.ts`
is the only place a tier is decided, it is pure, and it is asked once per document.
`JourneyMotion` publishes the answer on `html[data-journey-tier]`; every other consumer
reads that attribute rather than re-deciding.

| Tier | Rules that produce it |
| --- | --- |
| `still` | explicit `still` preference · `prefers-reduced-motion: reduce` · `navigator.connection.saveData` · `effectiveType` of `slow-2g` or `2g` |
| `balanced` | explicit `balanced` preference · no WebGL2, or WebGL2 without `EXT_color_buffer_float` · `deviceMemory` at or below 2 GB · `effectiveType` of `3g` on a coarse pointer · a coarse pointer on its own |
| `full` | everything else |

Read in order: the `still` rules are asked first and win outright, so a 2G phone is
`still` however capable its GPU is. `effectiveType` is lower-cased and trimmed before
it is matched, because the value can arrive from an emulation shim as well as from the
browser.

The three that are easiest to get wrong later:

- **Touch alone never drops below `balanced`.** An iPad on fibre still tells the whole
  story with scrubbing films; it just never downloads the compositor.
- **`still` is not a degraded page.** Every act, every headline, every poster is
  present and the narrative reads end to end; what `still` does not do is request a
  single video byte. A `still` page that is missing content is a bug, not a tier.
- **`deviceMemory: 0` means "not disclosed", not "none"** — the rule requires a
  positive value, so an undisclosed figure resolves on the other inputs.

The compositor chunk (`FilmVeil.tsx`, three.js + R3F, ~224 KB gz) is gated to `full`
and to `full` only. That gate lives in `FilmVeilLoader.tsx` and is the reason the
resolver has to be cheap and synchronous: it runs before the import decision.

**Revisit when:** a fourth tier is proposed. The answer is almost certainly a rule in
one of the existing three rather than a new one — three tiers is already the limit of
what the gates can hold honestly.
