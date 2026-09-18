# Copy deck — homepage, in Denis's voice

_2026-09-18. Every line of homepage copy for `EXPERIENCE-STORYBOARD.md`, act by act. Voice per `CLAUDE.md`: plain, confident, Oxford comma, no exclamation points, no AI cadence. Say what the floor is and what happens next. Vocabulary is epoxy, coating, flake, metallic, grind, and prep. Every factual line traces to `CONTEXT-SHEET.md` A8 or a named data file; anything else is marked. Step 29 reconciles this deck with `CLAIMS-LEDGER.md`._

**Tags**

- `[sourced: A8 — …]` a fact allowed by the live site, the Google listing, or the projects page, as recorded in A8.
- `[sourced: A6 — approved line]` a line Matt already approved.
- `[sourced: lock]` phone and email from `CLAUDE.md`.
- `[sourced: data — file]` rendered from a data file at build time; never hard-coded.
- `[no claim]` a voice line that asserts no fact. Allowed without a source.
- `[needs Denis]` cannot ship until Denis confirms it in writing.

**Two standing rules.** (1) Customer quotes are verbatim and may contain exclamation points; our own lines never do. Quotes with exclamation points are never the featured card. (2) Concept films and renders are always labelled as concept; real photographs are always labelled as the project archive.

---

## 0. Global chrome

| Key | Line | Tag |
|---|---|---|
| Header nav | Services · Commercial · Projects · Finishes · See your floor · Resources | `[no claim]` (existing) |
| Header CTA | Talk to Denis | `[no claim]` (existing) |
| Skip link | Skip to content | `[no claim]` |
| Menu toggle | Menu / Close | `[no claim]` |
| Menu stations (3D nav, 10) | 01 The pour · 02 The proof · 03 Beneath the surface · 04 Reclaim · 05 See the difference · 06 The archive · 07 Your finish · 08 Commercial · 09 Before you choose · 10 Talk to Denis | `[no claim]` |
| Menu footer line | Founded by Denis · Edmonton, Alberta | `[sourced: A8 — "Founded by Denis"; "Edmonton, Alberta"]` |
| Menu contact | (780) 991-1651 · finalfinishepoxy@gmail.com | `[sourced: lock]` |
| Motion control | Pause visual motion / Resume visual motion | `[no claim]` (existing) |
| Progress dots (≥ 1200 px), aria | Chapter {n} of 10: {station name} | `[no claim]` |
| Footer, line 1 | Final Finish Epoxy Coatings | `[sourced: A8 — site name]` |
| Footer, line 2 | Founded by Denis. Quality floor makeovers in Edmonton, Alberta. | `[sourced: A8 — allowed copy facts, verbatim phrase]` |
| Footer, line 3 | Garages, workshops, barns, warehouses, showrooms, industrial facilities, kitchens, and bathrooms. | `[sourced: A8 — spaces]` |
| Footer, contact | Call (780) 991-1651 · finalfinishepoxy@gmail.com | `[sourced: lock]` |
| Footer, hours | Monday to Friday, 8 to 5 | `[sourced: A8 — Google listing]` — ledger row says Step 32 decides whether to publish hours; keep behind that decision |
| Footer, links | Services · Commercial · Projects · Finishes · See your floor · Resources · Warranty · Privacy | `[no claim]` — "Warranty" links the existing anti-claim page; it states no term |
| Footer, review line | 5.0 on Google from {count} reviews · checked {date} | `[sourced: data — customer-proof.json rating]` |

---

## Act 1 — The pour

| Key | Line | Tag |
|---|---|---|
| Preloader, aria | Final Finish Epoxy Coatings | `[sourced: A8 — site name]` |
| Eyebrow | Edmonton garage & commercial floor coatings | `[sourced: A8 — services, Edmonton]` (existing) |
| Headline (H1) | A better floor changes the whole space. | `[sourced: A6 — approved line]` |
| Lead | Epoxy floor coatings for Edmonton garages, workshops, and commercial spaces. Thoughtful preparation. A finish chosen around you. | `[sourced: A8 — services, spaces]` (existing) |
| CTA primary | Request a quote | `[no claim]` |
| CTA secondary | Try your floor | `[no claim]` — links the visualizer |
| Phone link | Call Denis (780) 991-1651 | `[sourced: lock]` |
| Rating link | ★★★★★ 5.0 · {count} Google reviews · checked {date} | `[sourced: data — customer-proof.json]` |
| Ribbon (4 anchors, unnumbered) | The pour · The proof · See the difference · Your finish | `[no claim]` |
| Chapter index | 01 / The pour — Material concept film | `[no claim]` — concept label required by A6 |
| Film, aria | Concept film of pearl epoxy being poured and levelling. Not an installed project. | `[no claim]` |

## Silence one

| Key | Line | Tag |
|---|---|---|
| The one line | First it is liquid. Then it is the floor. | `[no claim]` |

---

## Act 2 — The proof

| Key | Line | Tag |
|---|---|---|
| Rating numeral | 5.0 / 5 | `[sourced: data — customer-proof.json rating.value]` |
| Rating caption | {count} reviews on Google · checked {date} | `[sourced: data — customer-proof.json rating.count, verifiedAt]` |
| Eyebrow | Final Finish, in their words | `[no claim]` (existing) |
| Headline | The word from our customers. | `[no claim]` (existing) |
| Intro | From the first conversation to the finished floor. What customers say about working with Denis and the team. | `[no claim]` — "the team" is supported by several reviews naming a team |
| Google link | Read every review on Google ↗ | `[no claim]` |
| Leave-a-review link | Leave a Google review ↗ · Opens Google Maps. Choose "Write a review." | `[no claim]` (existing) |
| Card "more" | Read more · Less | `[no claim]` |
| Card meta | {topic} · Google · verified {date} | `[sourced: data]` — per-review dates are **not** in `customer-proof.json`; show `verifiedAt` until Step 19's data pass adds them |
| Topic labels (Google chips) | Job quality · Epoxy flooring · Attention to detail | `[sourced: A8 — Google topic chips]` |
| Topic labels (derived from the excerpt itself) | Preparation · Communication · Commercial | `[no claim]` — a label summarising the quoted words, applied only where the excerpt says it |
| Reading aside, label | 02 · Why the reviews mention preparation | `[no claim]` |
| Reading aside, body | Several of these reviews talk about the concrete before they talk about the colour. That is the order the work happens in, and it is where the next part of this page goes. | `[no claim]` — points at Glenda Clarke and Joseph Ingram excerpts below |

**Featured order (front row, no exclamation points).** Verbatim from `src/data/customer-proof.json`, verified 2026-09-09; render from data, never paste.

| # | Name | Excerpt | Topic label |
|---|---|---|---|
| 1 | Glenda Clarke | "Denis took the time to do the job right, ensuring the surface was properly prepared before applying the epoxy." | Preparation |
| 2 | Fred Hoetmer | "The care and detail from Denis and his team is exceptional." | Attention to detail |
| 3 | Nate Whalen | "Super knowledgeable and absolutely nailed the custom coloring to match the paint." | Epoxy flooring |
| 4 | Joseph Ingram | "Awesome job prepping and repairing concrete before applying the epoxy. Clean and courteous workers" | Preparation |
| 5 | Antony Bubalo | "Professional, reliable, and the results speak for themselves — our floors look incredible." | Job quality |
| 6 | Kyle Fulton | "He is very good at communication and letting me know what was going on. Great outcome." | Communication |
| 7 | garry askin | "Very personable to work with, excellent job and incredible attention to detail" | Attention to detail |
| 8 | Sean Schaefer | "Extremely happy with the job. I went away for vacation for a week, came back and it was perfect." | Job quality |
| 9 | Marrabout 123 | "From start to finish, the experience was smooth and professional." | Job quality |
| 10 | Frank Santoro | "Communication was great, fair pricing and a fantastic finished product." | Communication |
| 11 | Andrew McCready | "I was very pleased with the price, process, and result." | Job quality |
| 12 | Paul Tran | "My general contractor hired Final Finish to epoxy the showroom in my dealership. They did a tremendous job." | Commercial (reused in Act 8) |
| 13–17 | sameer jadavji · Johnathon Medurecan · Jesse Aumiller · Christian Elkjer · Ernesto Giordano | verbatim; each contains an exclamation point | Back row only |

All tagged `[sourced: data — customer-proof.json, verified 2026-09-09]`. Reviewer mentions of price are the customer's words and are not a price claim; do not paraphrase them into one.

---

## Act 3 — Beneath the surface

| Key | Line | Tag |
|---|---|---|
| Eyebrow | Preparation, repair, precision | `[no claim]` (existing) |
| Headline | The finish begins below the surface. | `[no claim]` (existing) |
| Dramatic line (slab reveal) | The coat you see is the last one down. | `[sourced: A8 — process post: top coat is the final step]` |
| Lens caption | 01 / Surface study — Pearl grey — Illustrative material · not an installed project | `[no claim]` (existing; concept label) |
| Lens, real inset (if approved) | Grinding, on site. Final Finish project archive. | `[sourced: A8 — process post: grinding; photo `img_3185`]` `[needs Denis]` for publication |
| Slab labels (bottom → top) | Concrete · Crack repair · Base coat · Flake broadcast · Top coat · Anti-slip top coat (optional) | Concrete, crack repair, flake broadcast, top coat, anti-slip `[sourced: A8 — process post]`; **Base coat `[needs Denis]`** (the post names the broadcast, not the coat it lands in) |
| Slab labels, alternate if Denis declines "Base coat" | Concrete · Crack repair · Flake broadcast · Scrape · Top coat · Anti-slip top coat (optional) | `[sourced: A8 — process post]` — "scrape" is in the post |
| Diagram note | Illustrative cutaway. Layers are not to scale. | `[no claim]` |
| Chapter index | 03 / Beneath the surface — Architectural concept | `[no claim]` |
| Reading aside, label | 03 · What happens beneath the finish | `[no claim]` (existing) |
| Reading aside, body 1 | A good floor starts with the concrete underneath. Tell Denis about existing coatings, cracks, contamination, and moisture before anyone chooses a coating system. | `[no claim]` (existing, lightly edited) |
| Reading aside, body 2 | The order is set. Grinding opens the concrete. Cosmetic crack filling follows. Then the flake broadcast, the scrape, and the top coat, with an anti-slip top coat when the room needs it. | `[sourced: A8 — process post]` |
| Reading aside, body 3 | It is the part you may not see in the finished photograph, and it deserves as much attention as the colour. | `[no claim]` (existing, edited) |
| Reading aside, link | Explore concrete preparation ↗ | `[no claim]` → `/services/concrete-solutions` |

---

## Act 4 — Reclaim

| Key | Line | Tag |
|---|---|---|
| Eyebrow | More room for your life | `[no claim]` (existing) |
| Headline, line 1 | Reclaim your garage or basement. | `[sourced: A6 — approved line]` |
| Headline, line 2 | Make room for what you love. | `[sourced: A6 — approved line]` |
| Room 1 caption (garage) | The workshop. The gym. The car you look after. | `[no claim]` |
| Room 1 sub | Garage floors for vehicles, storage, equipment, and everyday use. | `[sourced: A8 — services: garage]` |
| Room 2 caption (basement) | The space was always there. | `[no claim]` (existing vault headline, kept as the room line) |
| Room 2 sub | A hobby room, a place to train, or simply a more useful basement. | `[no claim]` |
| Room 3 caption (glass mancave) | A lounge below the house. | `[no claim]` |
| Room 3 sub | Storage that became a room. | `[no claim]` |
| Concept label (each room) | Architectural concept · not an installed project | `[no claim]` — required by A6 |
| Chapter index | 04 / Reclaim — Architectural concept | `[no claim]` |
| Reading aside, label | 04 · Make room for what you love | `[sourced: A6]` |
| Reading aside, body 1 | A workshop for the weekend. A place to train. Space for a hobby that has outgrown the kitchen table. The floor is a sensible place to start making an underused room feel considered. | `[no claim]` (existing, edited) |
| Reading aside, body 2 | Tell us what the space has to hold: vehicles, storage, equipment, or everyday use. That narrows the finish before anyone settles on a colour. | `[no claim]` (existing, edited) |
| Reading aside, body 3 | A coating is one part of a room. It does not replace moisture remediation, ventilation, heating, or a full renovation. | `[no claim]` (existing; a deliberate non-claim) |
| Reading aside, link | Explore residential floors ↗ | `[no claim]` → `/services/residential-epoxy-flooring` |

---

## Act 5 — See the difference

| Key | Line | Tag |
|---|---|---|
| Eyebrow (word swap) | Concrete → Coated | `[no claim]` |
| Headline | See the difference. | `[sourced: Matt brief; existing]` |
| Lead | Drag the divider between the concrete and the finished floor. Same job, same room. | `[no claim]` — "same room" holds only for pairs Denis approves as same-angle; the approval pack asks exactly that |
| Source line | Edmonton project archive · {n} of {total} | `[sourced: A8 — projects page]` `[sourced: data — approved pair count]` |
| Divider, aria | Compare before and after. Drag, or use the arrow keys. | `[no claim]` |
| Labels on the photo | Before · After | `[no claim]` |
| Controls | First · Previous · Next · Last · Skip the comparisons | `[no claim]` |
| Pair caption template | {Room type}, {month year}. {Denis's one line about the work.} | `[needs Denis]` — room type, date confirmation, and caption all come from the approval pack; no invented caption ever ships |
| Staging badge (non-production only) | Project pairing review · not approved for publication | `[no claim]` (existing) |
| Zero-approved fallback caption | From the Final Finish project archive. | `[sourced: A8 — projects page]` |
| Chapter index | 05 / See the difference — Edmonton project archive | `[sourced: A8]` |
| Archive link | Explore the project archive ↗ | `[no claim]` → `/projects` |

---

## Act 6 — The archive

| Key | Line | Tag |
|---|---|---|
| Eyebrow | From the project archive | `[sourced: A8 — projects page]` |
| Headline | Every floor here is a real job. | `[sourced: A8 — 96 photographs from 23 jobs on the live projects page]` |
| Count line | {photoCount} photographs. {jobCount} floors. June 2025 to February 2026. | `[sourced: data — project-photo-pairs.json assetCount]`; job count 23 and date range `[sourced: A8]` — render, do not hard-code |
| Flyover, aria | A grid of {photoCount} photographs from the Final Finish project archive. | `[sourced: data]` |
| Tile alt (generic, until captions exist) | Final Finish project archive photograph {n} of {photoCount} | `[no claim]` |
| Resolved job caption template | {Room type}, {month year}. {Denis's one line.} | `[needs Denis]` |
| Resolved job fallback | Finished floor. Final Finish project archive. | `[sourced: A8]` |
| Unapproved note (staging only) | Dimmed photographs are awaiting Denis's approval. | `[no claim]` |
| Link | See all {jobCount} projects ↗ | `[sourced: A8]` → `/projects` |
| Chapter index | 06 / The archive — {photoCount} photographs | `[sourced: data]` |

## Silence two

Wordless. Only the chapter index appears at the very end: **07 / Your finish — Material concept film** `[no claim]`.

---

## Act 7 — Your finish

| Key | Line | Tag |
|---|---|---|
| Eyebrow chips | Flake · Metallic · Decorative | `[sourced: A8 — residential services: decorative epoxy, flake, metallic]` (replaces "Solid", which A8 does not name) |
| Headline (inside the resin mask) | Find your finish. | `[no claim]` (existing) |
| Reveal line | Thirty finishes. One is yours. | `[sourced: data — visualizer finish set, 30 inspiration finishes]` — label them "inspiration finishes" everywhere; this is not a stock or product claim |
| Sub | Quiet stone tones, an expressive flake blend, or a softer metallic surface. | `[no claim]` (existing, edited) |
| CTA primary | Try your floor | `[no claim]` → `/floor-visualizer` |
| CTA secondary | Explore finishes | `[no claim]` → `/finishes` |
| Concept label | Material concept film · not an installed project | `[no claim]` |
| Reading aside, label | 07 · A finish, not just a colour | `[no claim]` (existing) |
| Reading aside, body 1 | Compare favourites in the floor studio, side by side, on your own photo if you have one. | `[no claim]` — confirm the upload path is live in Step 25 before the words "on your own photo" ship |
| Reading aside, body 2 | Your screen is a starting point, not a physical sample. Confirm available materials, texture, and the right coating system with Denis before choosing. | `[no claim]` (existing) |
| Reading aside, link | Preview your own floor ↗ | `[no claim]` |

---

## Act 8 — Commercial

| Key | Line | Tag |
|---|---|---|
| Eyebrow | Commercial epoxy flooring | `[sourced: A8 — services]` (existing) |
| Headline | Built around your working day. | `[no claim]` (existing) |
| Body | Surface preparation, crack filling, and anti-slip finishes for warehouses, showrooms, and industrial facilities. | `[sourced: A8 — commercial services and spaces]` |
| Body 2 | The recommendation starts with how the space runs: traffic, cleaning, access, and the hours you can give up. | `[no claim]` |
| Review | "My general contractor hired Final Finish to epoxy the showroom in my dealership. They did a tremendous job." — Paul Tran, Google | `[sourced: data — customer-proof.json]` |
| CTA | Plan a commercial floor ↗ | `[no claim]` → `/services/commercial-epoxy-flooring` |
| Concept label | Architectural concept · not an installed project | `[no claim]` |
| Chapter index | 08 / Commercial — Architectural concept | `[no claim]` |
| Reading aside, label | 08 · Plan around the working day | `[no claim]` (existing) |
| Reading aside, body 1 | A shop floor, a showroom, a shared corridor. Tell us about equipment, operating conditions, and the areas that must stay open. | `[no claim]` (existing, edited) |
| Reading aside, body 2 | Preparation and return-to-use belong in the project conversation, not in a blanket promise. | `[no claim]` (existing; a deliberate non-claim) |

---

## Act 9 — Before you choose a colour

| Key | Line | Tag |
|---|---|---|
| Eyebrow | Planning an Edmonton floor coating | `[sourced: A8 — Edmonton]` (existing) |
| Headline | Before you choose a colour. | `[no claim]` (existing) |
| Lead | A useful floor starts with a useful conversation. Tell us what the space needs to do, what the concrete looks like now, and what you would like to change. | `[no claim]` (existing) |
| Q1 | What condition is your concrete in? | `[no claim]` |
| A1 | Cracks, old coatings, dust, oil, and moisture all change the preparation. Grinding and cosmetic crack filling come before any coating. Photos are enough to start. | `[sourced: A8 — process post: grinding, crack filling, estimate from photos]` |
| Q2 | How will you use the room? | `[no claim]` |
| A2 | Vehicles, a workshop, storage, a gym, or everyday traffic. Use decides texture, and an anti-slip top coat is an option when a room needs one. | `[sourced: A8 — process post: optional anti-slip top coat]` |
| Q3 | What helps Denis prepare your quote? | `[no claim]` |
| A3 | Where the space is, roughly how big it is, what is on the floor now, and a few photos. A free estimate can come from photos or an in-person visit. Installation is usually two days, and it varies with the concrete. | `[sourced: A8 — process post: free estimate from photos or in person; two-day installation (varies)]` — phrasing of the two-day line `[needs Denis]` before it ships |
| Q4 | Planning a shop or commercial floor? | `[no claim]` |
| A4 | Surface preparation, crack filling, and anti-slip finishes for warehouses, showrooms, and industrial facilities. Tell us the hours you can give up and what has to stay open. | `[sourced: A8 — commercial services and spaces]` |

---

## Act 10 — Talk to Denis

| Key | Line | Tag |
|---|---|---|
| Eyebrow | Your next step | `[no claim]` (existing) |
| Headline | Let's talk about your space. | `[no claim]` (existing) |
| Lead | Send photos for a free estimate, or book a visit. Either way, Denis looks at the concrete first. | `[sourced: A8 — process post: free estimate from photos or an in-person visit]`; "looks at the concrete first" `[no claim]` |
| CTA primary | Request a quote | `[no claim]` |
| CTA secondary | Preview a finish | `[no claim]` |
| Trust line | Call Denis · (780) 991-1651 · finalfinishepoxy@gmail.com | `[sourced: lock]` |
| Hours | Monday to Friday, 8 to 5 | `[sourced: A8 — Google listing]` — behind the Step 32 decision |
| Chapter index | 10 / Talk to Denis | `[no claim]` |
| Concept label | Architectural concept · not an installed project | `[no claim]` |
| **Form, stage 1 title** | Your space | `[no claim]` |
| Field | What is the space? — Garage · Basement · Workshop · Shop or showroom · Warehouse or industrial · Kitchen or bathroom · Something else | `[sourced: A8 — spaces]` |
| Field | Where is it? | `[no claim]` |
| Helper | Final Finish is based in Edmonton. Tell us where the space is and Denis will confirm. | `[sourced: A8 — Edmonton]` — service area beyond Edmonton `[needs Denis]`; never list towns |
| Field | Roughly how big is it? (optional) | `[no claim]` |
| **Form, stage 2 title** | The concrete | `[no claim]` |
| Field | What is on the floor now? — Bare concrete · An old coating or paint · Not sure | `[no claim]` |
| Field | Anything you already know about: cracks, moisture, oil, or damage? (optional) | `[no claim]` |
| Field | Add photos | `[no claim]` |
| Helper | Photos are enough for a free estimate. | `[sourced: A8 — process post]` |
| **Form, stage 3 title** | You | `[no claim]` |
| Fields | Name · Phone or email · Best time to reach you (optional) · Anything else (optional) | `[no claim]` |
| Finish handoff (if arriving from the visualizer) | Shortlisted finishes: {names}. Attached. | `[sourced: data — visualizer shortlist]` |
| Submit | Send to Denis | `[no claim]` |
| Success | Thanks. Denis will be in touch. If it is quicker, call (780) 991-1651. | `[sourced: lock]` |
| Error | That did not send. Call or email instead: (780) 991-1651 · finalfinishepoxy@gmail.com | `[sourced: lock]` |
| Privacy line | Used only to prepare your estimate. Privacy ↗ | `[no claim]` — links `/privacy` (Step 27) |
| Reading aside, label | 10 · A useful first conversation | `[no claim]` (existing) |
| Reading aside, body 1 | Tell Denis where the space is, how you use it, and what you would like to change. An approximate size and any concerns about the concrete help. | `[no claim]` (existing, edited) |
| Reading aside, body 2 | Preparation, repairs, finish choice, and access all shape the quote. Bring your questions and any shortlisted finishes. There is no need to have every detail worked out. | `[no claim]` (existing, edited) |

---

## Alt text and labels for real photographs

| Where | Line | Tag |
|---|---|---|
| Pair images | Before: {room type} with bare concrete, Final Finish project archive. / After: the same {room type} with the finished {finish} floor, Final Finish project archive. | `[needs Denis]` for room type and finish; template only |
| Lattice tiles | Final Finish project archive photograph {n} of {photoCount} | `[no claim]` |
| Existing story photos (`home-project-stories.json`) | Keep the existing alt strings verbatim; they describe only what is visible. | `[no claim]` |
| Concept films and renders | `alt=""`, `aria-hidden`, with the concept label in visible text nearby | `[no claim]` |

---

## Lines removed or moved from G2, and why

| G2 line | Disposition |
|---|---|
| "Room for the good stuff." / "The details pull it together." / "Good preparation shows." (`ProjectStory`, `home-project-stories.json`) | Folded into Act 3's aside and Act 6's resolved-job caption; the standalone story blocks go, the photo pairs move into Acts 5 and 6 pending approval. |
| Hero ribbon "01 The pour · 02 The proof · 03 Transformations · 04 Your finish" | Numbers dropped from the ribbon (they no longer match a ten-act sequence); the menu carries the numbering. |
| "03 / Your space", "03 / Another possibility", "04 / The material studio", "A route for business" (chapter indices) | Replaced by the ten-act indices above. |
| "Flake · Solid · Metallic" | "Solid" is not an A8 term; replaced with "Decorative". |
| "Make it yours" (finish CTA) | Replaced by "Try your floor" so the same CTA names the visualizer everywhere. |
| "The space was always there." (vault headline) | Kept, demoted to the basement room caption inside Act 4. |
| "Hear what customers say about working with Denis and the team." | Kept, tightened. |
| `consultation-court.*` second image | Dropped per Step 27; no copy attached. |

## Words that never appear on this page

Warranty terms, prices, polyaspartic or polyurea, years in business, insurance, any town other than Edmonton, the surname Tadic (until Denis confirms), "#1", "affordable", "transform", "elevate", "discover", and any competitor's name or number from the research docs in `Downloads`.
