# Claims ledger

_Completed by Steps 29 and 30, 2026-09-18. Supersedes the 2026-09-18 stub._

Every factual claim rendered on a non-homepage page, the page it appears on, and the source that permits it. A claim with no source is either **removed** or marked **pending Denis**, and a pending claim is **not rendered**.

The only sources that count:

| Tag | Meaning |
|---|---|
| **A8 — live site** | Stated on finalfinishepoxy.ca, recorded in `CONTEXT-SHEET.md` §A8. Source URL given per row. |
| **A8 — process post** | The blog post "Our Epoxy Flooring Process" at `https://www.finalfinishepoxy.ca/blog` — the **only** place process facts exist. |
| **A8 — Google** | The Google Business listing, `cid=7470239776211762202`, verified 2026-09-18. |
| **lock** | `CLAUDE.md` non-negotiables: the phone number and the email address. |
| **data** | Rendered from a data file at build time, never typed into a page. |
| **no claim** | A voice line asserting no fact. Needs no source. Not listed below unless it was mistaken for a claim. |
| **pending Denis** | Cannot ship until Denis confirms in writing. Not currently rendered. |

The homepage is governed by `COPY-DECK.md` and is out of this ledger's scope. `src/content/resources/**` (the 50 guides) is Step 31's, and each guide carries its own inline sources.

---

## Claims by page

### `/about` — `src/pages/about.astro`

| Claim as rendered | Source | Status |
|---|---|---|
| "Final Finish Epoxy Coatings was founded by Denis" | A8 — live site, `https://www.finalfinishepoxy.ca/about` ("Founded by Denis") | **sourced** |
| "We do quality floor makeovers in Edmonton, Alberta" | A8 — live site, verbatim allowed phrase | **sourced** |
| "A free estimate comes from photos of the floor or from a visit" | A8 — process post | **sourced** |
| "Final Finish is a service-area business based in Edmonton" | A8 — Google (listed as a service-area business, no street address) | **sourced** |
| The five-step order of work (estimate, grinding, cosmetic crack filling, flake broadcast and scrape, top coat with optional anti-slip) | A8 — process post | **sourced** |
| "Installation usually runs two days, and it varies with the concrete" | A8 — process post ("two-day installation (varies)") | **sourced** |
| `Person` schema `name: 'Denis'`, `telephone`, `email`, `addressLocality: Edmonton` | lock + A8 — live site | **sourced** |
| ~~Surname "Tadic"~~ | A8 lists the surname as unverified: G2 used it, the live site does not | **REMOVED — pending Denis.** See the pending list below. |
| ~~"Google reviews keep repeating the same facts: Denis works the floor himself, the crew shows up when they said they would"~~ | Nothing. It paraphrased reviews into three assertions about how the business operates | **REMOVED.** Reviews are rendered verbatim from data on the homepage; they are not evidence for a paraphrase. |
| ~~"Hand the room back on the quoted timing"~~ | Nothing. A delivery promise | **REMOVED.** |
| ~~"Cove and topcoat"~~ | Nothing. "Cove" appears nowhere in A8 | **REMOVED.** |

### `/process` — `src/pages/process.astro`

| Claim as rendered | Source | Status |
|---|---|---|
| Free estimate from photos or an in-person visit | A8 — process post | **sourced** |
| Grinding opens the surface of the concrete | A8 — process post | **sourced** |
| Cosmetic crack filling | A8 — process post | **sourced** |
| Flake broadcast | A8 — process post | **sourced** |
| The scrape | A8 — process post | **sourced** |
| Top coat; anti-slip top coat where a room needs it | A8 — process post (anti-slip is optional there) | **sourced** |
| "Installation usually runs two days, and it varies with the concrete" | A8 — process post | **sourced** |
| "This page will not tell you when you can park on it, or what it costs" | A8 — prices and cure times not claimable; the page states the absence rather than filling it | **sourced (anti-claim)** |
| ~~"Primer where the slab needs it"~~ | Nothing. A primer coat is not in the process post | **REMOVED.** |
| ~~"Cove and topcoat"~~, ~~"Drive-on windows"~~, ~~"Timing is quoted up front"~~ | Nothing | **REMOVED.** Three separate invented process facts. |
| ~~"Google reviewers keep pointing at this step because it is the job"~~ | Nothing | **REMOVED.** |

### `/services` — `src/pages/services/index.astro`

| Claim as rendered | Source | Status |
|---|---|---|
| Four services: garage, residential, commercial, concrete | A8 — live site service list | **sourced** |
| Residential = garage, decorative epoxy, flake, metallic | A8 — live site | **sourced** |
| Commercial = surface preparation, crack filling, anti-slip | A8 — live site | **sourced** |
| Concrete = repair, levelling/restoration, diamond grinding | A8 — live site | **sourced** |
| Spaces named (garage, barn, workshop, basement, kitchen, bathroom, warehouse, showroom, industrial facility) | A8 — live site space list | **sourced** |
| The five-step order of work | A8 — process post | **sourced** |
| "Two days, varies with the concrete" (FAQ and `FAQPage` schema) | A8 — process post | **sourced** |
| "A free estimate can start from photos, or from a visit" (FAQ and schema) | A8 — process post | **sourced** |
| "Based in Edmonton, Alberta, and works as a service-area business" (FAQ and schema) | A8 — Google | **sourced** |
| "Return-to-use timing is written into your quote… this site does not guess it" | A8 — cure times not claimable; stated as an absence | **sourced (anti-claim)** |
| "Prices are not published on this site" | A8 — prices not claimable; stated as an absence | **sourced (anti-claim)** |
| ~~"Edmonton and the capital region including Sherwood Park, St. Albert, Leduc, Fort Saskatchewan, Spruce Grove, and Beaumont"~~ — in the visible FAQ **and** in the `FAQPage` schema | Nothing. A8: "towns beyond Edmonton" is not claimable | **REMOVED** from both. This was the clearest live conflict in the tree. |
| ~~"Polyaspartic and epoxy are different systems… confirm what Final Finish will actually install"~~ | The framing was careful, but `COPY-DECK.md`'s "words that never appear" list is applied site-wide in Step 29, and the word is A8-not-claimable | **REMOVED** from service copy. The neutral guide still exists at `/resources/polyaspartic-flooring-neutral-guide` and is reachable from `/resources`; Step 31 owns it. |

### `/services/garage-floor-coating-edmonton` — new in Step 30

| Claim as rendered | Source | Status |
|---|---|---|
| Final Finish coats garage floors in Edmonton | A8 — live site (garage is a named residential service and a named space) | **sourced** |
| Grinding, cosmetic crack filling, flake broadcast, scrape, top coat, optional anti-slip | A8 — process post | **sourced** |
| "Installation normally runs two days, and it varies with the concrete" | A8 — process post | **sourced** |
| "A free estimate can start from photos or from a visit" | A8 — process post | **sourced** |
| `Service` schema: name, provider, `areaServed: Edmonton`, telephone, email | lock + A8 | **sourced** |
| "A coating is bonded into a slab that has been opened by grinding first" | A8 — process post (grinding precedes coating); the mechanism is a general description of what grinding is for, not a performance claim | **sourced** |
| "No price, no return-to-use time, no coverage term on this page" | A8 — all three not claimable; stated as absences | **sourced (anti-claim)** |
| "Fresh concrete has to cure before anything goes on it" | General, and deliberately carries **no number**. A8 forbids inventing a cure time, not the existence of curing | **sourced (no figure)** |

### `/services/residential-epoxy-flooring`

| Claim as rendered | Source | Status |
|---|---|---|
| Barns, workshops, basements, kitchens, bathrooms | A8 — live site space list | **sourced** |
| Three finish families: decorative epoxy, flake, metallic | A8 — live site residential service list | **sourced** |
| Grinding, cosmetic crack filling | A8 — process post | **sourced** |
| "Two days, varies with the slab" | A8 — process post | **sourced** |
| "A coating is not slip-proof" / "does not replace moisture work, ventilation, or heating" | Anti-claims; nothing is asserted | **sourced (anti-claim)** |
| ~~"Turn worn concrete into a brighter, more considered part of the home"~~ | Voice only, but the page has been rewritten; noted so the change is not silent | rewritten |

### `/services/commercial-epoxy-flooring`

| Claim as rendered | Source | Status |
|---|---|---|
| Surface preparation, crack filling, anti-slip finishes | A8 — live site commercial service list | **sourced** |
| Warehouses, showrooms, industrial facilities | A8 — live site space list | **sourced** |
| Grinding, cosmetic crack filling | A8 — process post | **sourced** |
| "No price, no return-to-service window, no coverage term" | A8 — not claimable; stated as absences | **sourced (anti-claim)** |
| "Site safety, occupancy limits, and accessibility stay with the workplace and building parties" | A statement of what Final Finish does not take on | **sourced (anti-claim)** |

### `/services/concrete-solutions`

| Claim as rendered | Source | Status |
|---|---|---|
| Diamond grinding | A8 — live site concrete service list | **sourced** |
| Concrete repair | A8 — live site | **sourced** |
| Levelling and restoration | A8 — live site | **sourced** |
| Cosmetic crack filling as part of a coating job | A8 — process post | **sourced** |
| "The whole installation usually runs two days, and it varies with the concrete" | A8 — process post | **sourced** |
| "A coating does not stop movement, water, or make unsound concrete sound" | Anti-claim | **sourced (anti-claim)** |
| "A broad moisture-barrier label is not that record" | Anti-claim; no product performance is asserted | **sourced (anti-claim)** |

### `/service-area` — new in Step 30, replaces seven pages

| Claim as rendered | Source | Status |
|---|---|---|
| "Final Finish is based in Edmonton" | A8 — live site, "Edmonton, Alberta" | **sourced** |
| "Denis runs it as a service-area business" | A8 — Google (service-area business) | **sourced** |
| "Founded by Denis… quality floor makeovers in Edmonton, Alberta" | A8 — live site, verbatim allowed phrase | **sourced** |
| "There is no showroom to visit" | A8 — Google lists no street address; the live site publishes none | **sourced** |
| "We do go out of town for some jobs" | Stated without naming a single town, and paired with "ask" | **sourced (deliberately unspecific)** |
| "This page does not carry a list of towns" | The anti-claim itself | **sourced (anti-claim)** |
| "A free estimate can start from photos or from a visit" | A8 — process post | **sourced** |
| ~~Seven `/areas/<town>` pages naming Sherwood Park, St. Albert, Leduc, Fort Saskatchewan, Spruce Grove, and Beaumont as served~~ | Nothing | **REMOVED.** All seven pages deleted, `src/data/areas.ts` deleted, all seven URLs 301 to `/service-area` in `src/middleware.ts`. |

### `/contact`

| Claim as rendered | Source | Status |
|---|---|---|
| "Send photos for a free estimate, or book a visit" | A8 — process post | **sourced** |
| Phone `(780) 991-1651`, email `finalfinishepoxy@gmail.com` | lock | **sourced** |
| "Photos are enough to begin" | A8 — process post | **sourced** |

### `/warranty`

| Claim as rendered | Source | Status |
|---|---|---|
| The page states that no year count and no lifetime promise appear on this site | A8 — warranty terms not claimable. The page is a deliberate anti-claim and is the **only** place the word is allowed | **sourced (anti-claim)** |
| "Workmanship coverage is stated on the quote for that job" | A statement about where terms live, not a term | **sourced (anti-claim)** |
| Phone `(780) 991-1651` | lock | **sourced** |

**Standing rule:** never add a duration, a percentage, or the word "lifetime" to this page without a written term from Denis. `scripts/validate-copy-claims.mjs` exempts this page from the warranty grep and would not catch a number added here as a warranty claim — but it **would** catch it under `years-with-a-number`, which has no exemption for this file.

### `/finishes`

| Claim as rendered | Source | Status |
|---|---|---|
| "Three finish families. 30 ways to begin." and all per-family counts | data — `src/lib/visualizer/finishes.ts`, rendered from `finishPresets.length`, never typed in | **sourced (data)** |
| Finish family label "Decorative" in place of "Solid" | A8 — live site names "decorative epoxy"; "solid" is not an A8 word. `COPY-DECK.md` made the same substitution on the homepage. The data key stays `solid` because it belongs to the visualizer | **sourced** |
| "These are visual directions, not products on a shelf" | Anti-claim: the finishes are labelled inspiration, not stock | **sourced (anti-claim)** |
| ~~"sealed under a glass polyaspartic"~~ (the Nero Marquina finish description in `src/lib/visualizer/finishes.ts`) | Nothing. A8: polyaspartic is not claimable as something Final Finish installs, and this rendered on `/finishes` and in the visualizer as a description of a finish on offer | **REMOVED** — now "sealed under a glass-clear top coat". One string changed; nothing else in that file was touched. |

### `/projects`

| Claim as rendered | Source | Status |
|---|---|---|
| "Every image here is a Final Finish job" | A8 — the live projects page carries 96 photographs from 23 jobs | **sourced** |
| "None of the afters is generated" | True of the asset pipeline; `src/data/project-photo-pairs.json` records provenance per asset | **sourced (data)** |
| Six neutral pair labels ("Edmonton garage floor, one" … "Edmonton shop floor") | A8 — projects page (Edmonton jobs). Each label describes only the room type visible in the frame | **sourced** |
| Captions describing what is visible in both frames | Visual description only | **no claim** |
| ~~"Salt-worn slab, then coated"~~ | Reads a cause off a photograph | **REMOVED.** |
| ~~"Two-day garage coating"~~ | The two-day fact is A8, but attaching it to one unverified photograph asserts that *this* job took two days | **REMOVED** as a label. The fact remains on `/process` and the service pages as a statement about how the work runs. |
| ~~"Diamond-grind bay"~~ | Reads a method off a photograph | **REMOVED.** |
| Pair approval state | `docs/project-pair-approval-queue.md` — 0 of 6 approved | **pending Denis** for captions and room types; the page renders the unapproved state honestly and shows a review note outside production. |

### `/resources`

| Claim as rendered | Source | Status |
|---|---|---|
| The guide count in the hero and kicker | data — `resourcesForDeployment(...)` length, rendered not typed | **sourced (data)** |
| "They do not replace a written scope or the product documentation for your floor" | Anti-claim | **sourced (anti-claim)** |
| ~~"Fifty practical guides" / "Fifty launch resources"~~ | Would go stale the moment a guide is drafted or unpublished, since production filters drafts | **REMOVED**, replaced by the rendered count. |
| The 50 guide titles and descriptions | Step 31 owns `src/content/resources/**`; each guide carries its own inline sources, and `scripts/validate-content.mjs` enforces that every frontmatter source URL is cited in the body | **out of scope — Step 31** |

### `/floor-visualizer`

| Claim as rendered | Source | Status |
|---|---|---|
| The finish count | data — `finishPresets.length` | **sourced (data)** |
| "Your photo stays on this device unless you choose to send it" | Verified in code, not assumed: `automaticDetectionEnabled()` in `src/lib/visualizer/detection-gate.ts` returns `false`, and `FloorVisualizer` requires both `detectionEnabled` and explicit `aiConsent` before any upload. `floor-visualizer.astro` passes no `detectionEnabled` prop, so it defaults to `false` | **sourced (code)** |

**Standing rule:** if Step 25 ever opens the detection gate, this line has to change in the same commit. It is true only while the gate is shut.

### Site chrome — `src/components/SiteFooter.astro`

| Claim as rendered | Source | Status |
|---|---|---|
| "Founded by Denis. Quality floor makeovers in Edmonton, Alberta." | A8 — live site, verbatim allowed phrase (and `COPY-DECK.md` footer line 2) | **sourced** |
| "Garages, workshops, barns, warehouses, showrooms, industrial facilities, kitchens, and bathrooms." | A8 — live site space list (and `COPY-DECK.md` footer line 3) | **sourced** |
| Phone, email | lock | **sourced** |
| "© … Final Finish Epoxy. Edmonton, Alberta." | A8 — live site | **sourced** |
| ~~Seven town links in the footer nav~~ | Nothing | **REMOVED.** Replaced by one `/service-area` link. |
| ~~"Edmonton and the greater capital region, Alberta"~~ | Nothing. "Capital region" is a coverage claim in different words | **REMOVED.** |
| Hours (Mon–Fri 8–5) | A8 — Google. `COPY-DECK.md` holds this behind Step 32's decision on publishing hours | **not rendered — deferred to Step 32** |

### `public/llms.txt`

| Claim as rendered | Source | Status |
|---|---|---|
| "Founded by Denis… quality floor makeovers in Edmonton, Alberta. It is a service-area business with no published street address." | A8 — live site and Google | **sourced** |
| ~~Seven `/areas/<town>` URLs~~ | Those URLs no longer exist and the towns were unclaimable | **REMOVED**, replaced by `/service-area`, the garage page, and `/about`. |

---

## Pending Denis — not rendered anywhere

These are the only open claim questions left in the pages this ledger covers. None of them is on the site today.

1. **The surname "Tadic".** A8 flags it as unverified: G2 used it, the live site does not. Step 29 dropped it from `src/pages/about.astro` — the `Person` schema `name`, the page title, the meta description, and the visible eyebrow and lead all now say "Denis" alone. A grep of the whole tree confirms zero occurrences outside code comments. **Ask Denis: is the surname correct, and do you want it on the site?** If yes, it goes back in exactly two places: the schema `name` and the hero eyebrow.
2. **Whether Final Finish travels outside Edmonton, and where.** `/service-area` currently says "ask". **Ask Denis: which communities have you actually worked in, and which will you travel to?** With a written answer, the page can name them; without one, no town goes back on the site.
3. **Publishing the Google hours (Mon–Fri 8–5).** Sourced but not rendered. Step 32 decides.
4. **Project pair captions and room types.** `docs/project-pair-approval-queue.md`, 0 of 6 approved. No caption ships until Denis confirms the pairing and the room type.
5. **A written warranty term, if one exists.** Until then `/warranty` stays an anti-claim.

---

## Standing tripwires

Never present as a Final Finish claim, in any file:

- Competitor names or numbers from the three research docs in `Downloads`: Whitcrete, Fusion Floors, B.Protek, PE Coatings, Sealing Innovation, Garage Living, Floor X2, "15-year"/"20-year" warranties, "4.9 stars 90+ reviews", "10,000+ floors", any other company's phone number.
- "#1 in Alberta", "affordable prices", years in business, insurance, credentials.
- Any phone number other than `(780) 991-1651`.
- Polyaspartic or polyurea as something Final Finish installs.
- Any town other than Edmonton, unless item 2 above is answered in writing.

`scripts/validate-copy-claims.mjs` greps `src/**` for every one of these on each run. Run it after any copy change:

```powershell
npm run build:staging    # the rendered checks read dist/client
node scripts/validate-copy-claims.mjs
```

It reports four numbers: unallowed forbidden-term hits, exclamation points in our own rendered copy, the worst page's average sentence length and the longest single sentence, and the maximum shingle similarity between any two service or area pages (raw and with town names normalized). `output/step-29/falsifiability-probe.mjs` injects five deliberate violations and confirms the gate catches each one.

---

## Known conflict this step could not fix

`src/layouts/BaseLayout.astro` lines 85–93 list **six towns beyond Edmonton in the site-wide `HomeAndConstructionBusiness` `areaServed` array**. This is the same unclaimable coverage assertion Steps 29 and 30 removed from the visible copy, still present in structured data on every page. Step 29's brief explicitly barred editing `src/layouts/**` because a concurrent agent holds that file for Step 32's structured-data work.

**Owner: Step 32.** Reduce `areaServed` to Edmonton alone, or to a `GeoCircle` centred on Edmonton, so it matches `/service-area`. Note that `tests/e2e/seo.spec.ts` asserts only that `areaServed` *contains* Edmonton, so it will stay green either way — this will not fail a gate on its own. The deferral is recorded in `scripts/validate-copy-claims.mjs` (`DEFERRALS`) and printed on every run so it cannot be forgotten.
