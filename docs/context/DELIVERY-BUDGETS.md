# Delivery budgets — windows, definitions, and what the numbers mean (Step 34)

The thresholds live in **`budgets.json`** at the repo root — one file, read by
both `scripts/measure-delivery.mjs` (which gates its own run) and
`scripts/check-budgets.mjs` (which re-checks a written report without a
browser). Nothing else in the repo carries a copy of a threshold.

```
npm run build:staging
npm run measure:delivery -- --label step34 --port 4391   # exits non-zero on a gated fail
npm run check:budgets -- --label step34                  # same verdict from the JSON alone
```

`--port` defaults to 4334 (the built-app port in `DEV-CONTRACT.md`). Pass
another port when the orchestrator's preview already owns 4334. The probe
starts `node dist/server/entry.mjs` itself and **only ever stops a process it
started**.

---

## The windows

Every number in the report is tied to one of four marks. They are recorded in
`results[].marks` of the JSON so a number can always be re-derived.

| Mark | When | What it bounds |
| --- | --- | --- |
| `loadEventEndMs` | the document's `load` event | **the arrival window** (gated) |
| `settleMs` | first of: network idle, or 1500 ms after load | the hydration observation window (reported) |
| `scrollStartMs` | just before the scripted chapter walk | end of the CLS arrival window |
| `interactionStartMs` | just before the interaction probe | end of the route window |

### Arrival = navigation start → the `load` event

**Arrival bytes** = the navigation document's `transferSize` plus the
`transferSize` of every resource whose `responseEnd` is at or before
`loadEventEnd`.

This is the definition the budget was written against: the document, its
render-blocking CSS, its fonts, its pour **poster**, and its deferred
(critical) module scripts. It deliberately excludes the pour **film**, which
the design promotes on scroll intent.

**Why not `networkidle`.** The pre-Step-34 probe closed the arrival window at
Playwright's `networkidle` (0 in-flight requests for 500 ms). That is not a
document milestone — it is whenever the last byte of whatever the page happens
to be streaming lands. This page promotes the pour film during hydration, a few
hundred milliseconds after load, so whether a multi-megabyte download finished
inside the window decided the number. Four consecutive runs of the same build
on the same machine:

| | run 1 | run 2 | run 3 | run 4 |
| --- | --- | --- | --- | --- |
| desktop arrival, `networkidle` | 7,547,593 | 7,547,593 | 930,289 | — |
| phone arrival, `networkidle` | 856,729 | 1,057,911 | 2,503,461 | — |
| desktop arrival, **load event** | 935,250 | — | 930,289 | 930,289 |
| phone arrival, **load event** | 856,729 | 856,729 | 856,729 | 856,729 |

A gate cannot sit on the first two rows. It can sit on the last two.

**Nothing is hidden by the narrower window.** The same report carries
`bytes.settled`, `bytes.hydration` (bytes between load and the settle mark),
`bytes.hydrationMedia`, `bytes.wholeRun`, and a full `mediaTimeline` giving
every film's start, end, size, and whether it began before the load event.
`bytes.arrivalMedia` is asserted separately: any video byte inside the arrival
window prints a NOTE, because that would be a promotion-policy regression.

### Route = navigation start → `interactionStartMs`

Everything fetched up to and including the scripted walk through every
`[data-journey-chapter]`, `[data-journey-white-stage]`, `#customer-reviews`,
`#proof` and `#consultation`. This window contains the room films and is
inherently variable run to run, because a `<video>` streams in ranges: measured
desktop route bytes have moved between 15.6 MB and 19.2 MB on one build. Treat
a route number within ~10% of its budget as unresolved rather than as a pass.

### Interaction

The probe scrolls back to the top, waits until the main thread has produced no
new long task for 1000 ms (capped at 8 s), suppresses anchor navigation with a
capture-phase listener, and then dispatches real interactions: a click on the
hero primary CTA, a click on `[data-menu-toggle]`, `Escape`, `Tab`, and a
second `[data-menu-toggle]` click.

---

## Gated metrics

| Metric | Budget | Window | Note |
| --- | --- | --- | --- |
| `arrivalBytes` desktop | ≤ 5,242,880 B | arrival | exactly 5 MiB; compared in bytes |
| `arrivalBytes` phone | ≤ 838,861 B | arrival | 0.8 MiB = 838,860.8 B, rounded up to a whole byte |
| `routeBytes` desktop / phone | ≤ 18,874,368 / 12,582,912 B | route | 18/12 MiB; the plan's "12/18 MB" without a viewport mapping — larger figure to desktop, which loads the 1080 rung |
| `lcpMs` | ≤ 2500 ms | whole run | largest-contentful-paint, last candidate |
| `clsArrival` | **< 0.02** | arrival CLS window | strictly less than; see below |
| `inpMs` | ≤ 200 ms | interaction | max `event` duration with a real `interactionId` |
| `longTaskMaxMs` | ≤ 200 ms | whole run | longest `longtask` > 50 ms; `longestByPhase` splits it |

**Byte budgets are integers and are never rounded before comparison.** A 5 MiB
arrival budget missed by 2,381 bytes is a FAIL that prints `+2381 B`. There is a
unit test for exactly that case.

## Reported, never gated

`clsScroll`, `clsSession`, `clsNaiveSum`, `bytes.hydration*`, `fonts.bytes`
(Step 13 owns it), `videos[].preload` (Step 17 owns it), `mediaTimeline`,
`longTasks.topLoafFrames`, `inp.interactions`, `marks.timingsContended`.

---

## CLS: what was wrong, and what is actually shifting

### The measurement was wrong

The old probe did `cls += entry.value` for every `layout-shift` entry with
`hadRecentInput === false`, over the **whole session**, and read the total
**after** a scripted `scrollIntoView` walk through every chapter. Two defects:

1. **No session windows.** CLS is the largest *session window*, not the session
   sum: entries group while consecutive entries are ≤ 1000 ms apart and the
   window is ≤ 5000 ms long, and the metric is the biggest group's sum.
   `reduceClsSessionWindows()` in `scripts/measure-delivery.mjs` implements this.
2. **It counted the harness's own scrolling.** Teleporting the viewport through
   nine chapters provokes shifts no visitor provokes in that burst.

Corrected, on this build: **arrival CLS is 0.0000 on both viewports.** The
number the old probe would have printed (`clsNaiveSum`) is 1.2485 desktop /
0.1148 phone, and every contributing entry is in the scroll phase.

### The whole numbers were also real

The exactly-1.0 value is not a rounding artefact — it is arithmetically what a
**maximal** shift produces. A `layout-shift` value is `impactFraction ×
distanceFraction`, each capped at 1, so 1.0 requires an element whose before-
and-after rects cover the entire viewport *and* which moved by the viewport's
largest dimension. Two of those, summed with no windowing, is 2.0.

The probe now records `sources` for every entry, and it named the element:

```
value 1.000  phase scroll  scrollY 15800
  source: svg[data-resin-svg]
    previousRect { x:0, y:0, w:0,    h:0   }
    currentRect  { x:0, y:0, w:1440, h:900 }
```

`svg[data-resin-svg]` is the reveal SVG in
`src/components/home/ResinReveal.astro:48`, sized at runtime by
`src/scripts/resin-reveal.ts:74`. It has **no reserved box** until that script
runs, so when the viewport reaches the section the SVG materialises from 0×0 to
the full 1440×900 frame in one frame: impact 1 × distance 1 = exactly 1.0. On a
run where it landed at 1440×192 instead, the same element produced 0.213333.
Desktop's second maximal shift (the difference between the reported 2.0 desktop
and 1.0 phone) is the same class of event on the `full`-tier layers that
`balanced` never mounts.

**So both halves are true:** the gate was measuring the wrong thing *and* there
is a genuine full-viewport shift to fix. The fix belongs to whoever owns
`ResinReveal` — give the SVG an intrinsic box (`viewBox` + `width`/`height`
attributes, or an `aspect-ratio` on its wrapper) so it occupies its space before
`resin-reveal.ts` touches it. A smaller, real offender on phone is
`div.material-lens-glass` (`src/pages/index.astro:98`) appearing 0×0 → 128×98;
it has `aspect-ratio: 1` but wraps a `loading="lazy"` image.

---

## Arrival attribution

Phone, 390×844 @ DPR 3, arrival = 856,729 B against a budget of 838,861 B —
**over by 17,868 B**. Top resources:

| # | Resource | Bytes | KB |
| --- | --- | ---: | ---: |
| — | navigation document (`/`) | 119,351 | 116.6 |
| 1 | `/_astro/client.CknJBpND.js` | 177,442 | 173.3 |
| 2 | `/images/brand/follow-floor/720/epoxy-pour-pearl-poster.jpg` | 95,440 | 93.2 |
| 3 | `/_astro/SplitText.dqL6rzwe.js` | 89,299 | 87.2 |
| 4 | `/_astro/gsap.DWxn8li7.js` | 69,887 | 68.2 |
| 5 | `/_astro/gsap-kit.BvXTED5q.js` | 56,943 | 55.6 |
| 6 | `/_astro/index.ipcvsWjH.css` (render-blocking) | 42,358 | 41.4 |
| 7 | `/_astro/SiteFooter.DJKBf7eT.css` (render-blocking) | 37,998 | 37.1 |
| 8 | `/fonts/manrope-latin-var.woff2` | 25,136 | 24.5 |

The **720** poster, not the 480 one, is the correct `srcset` answer for a 390 px
viewport at DPR 3 (`sizes="100vw"` → 1170 device pixels → the 1280w candidate).
Capping the poster at 2× — it is a background plate behind the headline, not a
detail photograph — selects the 854w file (49.5 KB) and saves ~46 KB, which on
its own clears the 17,868 B overshoot. That is the cheapest lever; the next
cheapest are `SplitText` (87 KB, an enhancement the `still` tier never uses) and
the two render-blocking stylesheets (80 KB together).

Desktop arrival is 930,289 B against 5,242,880 B — a wide pass.

### The pour film is promoted at hydration, not on scroll intent

`bytes.arrivalMedia` is 0 on both viewports (no video byte lands before the load
event), but the `mediaTimeline` shows the film starting immediately afterwards:

| Viewport | File | Bytes | Started | Load event |
| --- | --- | ---: | ---: | ---: |
| desktop | `/videos/follow-floor/1080/epoxy-pour-pearl.mp4` | 5,135,114 | 921 ms | 766 ms |
| phone | `/videos/follow-floor/480/epoxy-pour-pearl.mp4` | up to 1,646,432 | 920 ms | 921 ms |

`JourneyMotion.tsx` calls `promoteVideo` from its first `renderSnapshot()`, and
`journeyMediaResidents()` returns the active chapter at scroll 0, so the hero
film is promoted (`preload="auto"` + `.load()`) the moment the island hydrates —
not on scroll intent. The report confirms it from the DOM too:
`videos[0].preload === 'auto'` while all three `floor-film-video` elements are
still `none`.

**Recommendation (not applied — `JourneyMotion.tsx` is Motion A's file):** gate
the hero film's promotion behind a first scroll-intent signal (a non-zero scroll
delta, a `pointerdown`/`wheel`/`touchstart`, or an idle callback after
`loadEventEnd`), keeping the poster as the arrival picture. This does not change
the gated arrival number — which already excludes it — but it takes 5.1 MB
(desktop) / up to 1.6 MB (phone) off the connection during the first two seconds,
and it is what `bytes.hydration` (6,617,304 B desktop) currently measures.

---

## Long tasks

`longtask` entries give a duration and a container, never a script. The probe
also observes **`long-animation-frame`** (LoAF), which names the script URL,
function, invoker and forced style-and-layout time per frame, and pairs each
long task with the LoAF frame it overlaps most (`pairLongTaskWithFrame`).

Top three, desktop (longest by phase: arrival 901 / scroll 322 / interaction 835 ms):

1. **901 ms, arrival, at 1811 ms.** LoAF scripts: `scheduler.K28Ou6Jl.js` fn `D`
   via `MessagePort.onmessage` (23 ms) then
   **`react-three-fiber.esm.NnKpznKy.js` fn `pd` via `FrameRequestCallback`
   (273 ms)**, blocking 247 ms, forced style-and-layout **0 ms**. This is the
   React concurrent-scheduler flush handing off to react-three-fiber's first
   render — WebGL program build plus the initial R3F frame. It is **not**
   SplitText, **not** the resin filter, and not layout thrash.
2. **835 ms, interaction, at 17469 ms.** `SiteHeader.astro…DWx30e8H.js` via
   `BUTTON.onclick`, 22 ms forced layout — the nav menu toggle bringing up the
   WebGL floor menu.
3. **707 ms, interaction, at 18305 ms.** No LoAF frame pairs with it; it runs
   immediately after (2) and is the continuation of the same menu-open work.

Phone (arrival 408 / scroll 122 / interaction 65 ms):

1. **408 ms, arrival, at 83 ms** — `ClientRouter.astro…CYDbzu1r.js` as a module
   script, of which **406 ms is forced style-and-layout**. A synchronous layout
   read during module evaluation, before anything has hydrated. Cheapest win on
   the phone timeline.
2. **331 ms, arrival, at 1094 ms** — `scheduler` fn `D` (144 ms forced layout)
   plus `journey-director.js` fn `m` via `FrameRequestCallback`: hydration and
   the director's first geometry measurement.

## INP

The old probe reported 0 because nothing ever interacted; `durationThreshold`
also has a 16 ms floor, so `event` entries alone cannot prove an interaction
happened. The probe now records `performance.interactionCount` and **fails the
run as broken** (`inp.probeBroken`) if interactions were dispatched and the
count is still 0 — a comfortable 0 can no longer pass as a measurement.

- **Desktop 1192 ms** — input delay 1 ms, processing 31 ms, **presentation
  1160 ms**, at 17359 ms, i.e. the `[data-menu-toggle]` click that owns long
  task (2). The interaction handler is cheap; the next paint is not, because the
  floor menu's WebGL view renders into the menu rectangle.
- **Phone 64 ms** — input delay 2 ms, processing 48 ms, presentation 14 ms. Pass.

## Steps 13 and 17 — verified only, not touched

- **Fonts:** exactly one font file is fetched on both viewports,
  `/fonts/manrope-latin-var.woff2`, **25,136 B (24.5 KB)**. One subset variable
  face, as Step 13 left it. No second family, no static weights.
- **Video preload:** the markup default is `preload="none"` on every
  `.pour-film` / `.floor-film-video`. At the settle mark the three
  `floor-film-video` elements are still `none`; `.pour-film` reads `auto`
  because `JourneyMotion` promoted it (see above). No element uses any value
  other than `none`/`auto`, and nothing autoplays.

## Reading a contended run

`marks.timingsContended` is set when the localhost `load` event fires later than
5 s. That is other processes on the machine, not the page. Byte budgets stay
valid; LCP, long-task and INP numbers from such a run are not comparable. One
run during a parallel build on this machine put the desktop load event at
20,853 ms and inflated every millisecond metric accordingly.

## CI

`.github/workflows/quality.yml` has a `delivery-budgets` job that builds
staging, runs the probe against the built app, re-checks the written report with
`check-budgets`, and uploads `output/delivery/ci.json` as an artifact.
**It has never run.** The agents' GitHub token lacks the `workflow` scope, so
workflow files can be committed as text but not pushed; a human with a
`workflow`-scoped token has to push it first. The file header says so too.
