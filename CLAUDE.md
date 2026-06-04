# Scapia Market Intelligence — LLM Wiki Schema

You (Claude Code) are the sole writer of this wiki. The human curates sources, directs analysis, and asks questions. You do all the filing, cross-referencing, maintenance, and filter scoring.

**Scapia** is a Federal Bank co-branded travel credit card. It operates across two major business domains — **Fintech** (credit card product, earn rates, co-brand economics, RBI/NPCI regulation) and **Travel** (flights, stays, trains, buses, visas, experiences, store). This wiki tracks what the *market* is doing — not what individual users are doing. Every page that doesn't help a Scapia leader decide something (pricing, positioning, partnership, roadmap) shouldn't exist.

---

## Directory Layout

```
v1-LLM-wiki/
├── CLAUDE.md              ← this file (schema + workflow instructions)
├── wiki/
│   ├── index.md           ← master catalog of all wiki pages (you maintain this)
│   ├── log.md             ← append-only event log (you maintain this)
│   ├── scapia.md          ← Scapia reference baseline — positioning, products, strategy
│   ├── entities/          ← flat — one page per competitor
│   ├── partners/          ← one page per ecosystem partner (Federal Bank, networks, OTAs)
│   ├── regulatory/        ← one page per regulation or policy
│   ├── events/            ← one page per discrete market event
│   ├── market-signals/    ← macro trends, category growth, financial health
│   ├── concepts/          ← shared mechanics (FX markup, coin economics, MDR, credit-on-UPI)
│   ├── comparisons/       ← head-to-head comparisons, on demand only
│   └── sources/           ← one page per ingested source
└── raw/                   ← immutable source files; never modify these
    ├── competitive/
    ├── regulatory/
    ├── market/
    └── ambiguous/
```

**Rule:** Never write to `raw/`. Everything under `wiki/` is yours to create and update.

---

## Bifurcation Rules by raw/ Subfolder

The subfolder a source lands in determines its treatment at ingest time. Domain tagging happens in wiki page frontmatter — not in the raw/ folder structure.

**`raw/competitive/` → Entity / Partner / Customer treatment**
- Additive, multi-perspective
- Identify which competitor, partner, or customer signal the source speaks to
- Find or create the relevant wiki page (`entities/`, `partners/`, or `events/` with customer tag)
- Add content to the correct perspective section
- LLM determines whether this produces a competitor, partner, or customer page based on source content — not predetermined by subfolder

**`raw/regulatory/` → Regulatory treatment**
- One authoritative conclusion
- Find or create the relevant `wiki/regulatory/` page
- If two sources conflict on fact: Status = `Escalated`, flag for curator

**`raw/market/` → Market Signal treatment**
- Macro trend, category growth, financial health of a space
- Find or create the relevant `wiki/market-signals/` page
- Tag with domains and travel_categories from source content
- Always additive — a second source enriches an existing market signal page

**`raw/ambiguous/` → Split treatment**
- LLM reads source and determines which treatments apply
- Apply each relevant treatment independently
- Report the split explicitly to the human after ingest

---

## The Two Domains

**Fintech** — credit card product, earn rates, co-brand economics, RBI/NPCI policy, DPDP Act, interchange/MDR, co-brand card rules, credit-on-UPI mechanics.

**Travel** — seven sub-verticals: `flights` · `stays` · `trains` · `buses` · `visas` · `experiences` · `store`. A move by an OTA or airline affects Travel. A miles devaluation by Axis Atlas affects both Fintech (card earn rate comparison) and Travel (redemption value).

An entity page can carry both domains. Domain is metadata — not directory. The wiki is flat.

---

## Citation Discipline (All Page Types)

Applies to **every** page type — competitor, regulatory, partner, market-signal, event, customer, concept, comparison. Citation is a write-time discipline, not a query-time afterthought.

**Every sentence-level claim carries an inline footnote pointing to a file in `raw/`:**

```markdown
… no FX markup on international spend [^atlas-tnc-2026].

[^atlas-tnc-2026]: Axis Atlas T&C, accessed 2026-05-02 — raw/2026-05-02-axis-atlas-tnc.pdf
```

**If the LLM cannot point to a source in `raw/`:**
```
> ⚠ Unsourced — needs verification.
```

**If a new source contradicts an existing claim** (never silently overwrite):
```
> ⚠ Conflict: [Source A] states X. [Source B] states Y. Not resolved — flagged for curator.
```

**Web or general LLM knowledge is only allowed as explicitly marked background:**
```
> Background (no source in raw/): …
```

**User verbal context:** when the human shares something in chat ("Federal Bank told us informally that…"), capture it as a dated raw file `raw/YYYY-MM-DD-user-context-<descriptor>.md` and cite it like any other source.

**Source summary pages are first-class.** Every ingested source gets its own page in `wiki/sources/` — sources are searchable, cross-linked, and auditable, not just footnotes. See [Source summary pages](#source-summary-pages--wikisourcesslugmd).

**Hard rules:**
- A page cannot be filed with unsourced load-bearing facts. `⚠ Unsourced` is allowed only as a temporary marker — lint flags any open more than 2 ingests.
- The LLM never invents numbers, dates, names, or percentages. If it isn't in `raw/`, it doesn't go in the wiki as fact.
- Conflicts are surfaced, not resolved. The LLM is not the arbiter of which source is right.

---

## Page Types

Seven types. A page can carry multiple `page_types` — it appears in every filtered view whose type it carries.

| Type | What it captures |
|---|---|
| `competitor` | One page per competitor/entity — multi-perspective, additive |
| `regulatory` | One conclusion per regulation — RBI, NPCI, DGCA, DPDP, co-brand rules |
| `event` | Discrete market moments — funding, launch, price change, devaluation, hire |
| `partner` | Ecosystem partnerships — Federal Bank, Visa/MC/RuPay, OTA deals |
| `customer` | Voice of customer — App Store reviews, Reddit, Twitter, switching signals |
| `market-signal` | Macro trends, category growth, financial health of a space |
| `concept` | Shared mechanics — internal reference pages, never competitor-specific |

**Multi-tagging examples:**
```
Axis Atlas miles devaluation        → page_types: [event, competitor]
Reddit: users fleeing Axis Atlas    → page_types: [customer, competitor]
RBI reduces MDR on credit cards     → page_types: [regulatory, market-signal]
MakeMyTrip signs SBI Card deal      → page_types: [event, partner]
International travel up 40% YoY    → page_types: [market-signal]
Federal Bank raises Scapia limits   → page_types: [partner]
```

**Query answers are NOT wiki pages.** Past queries live in personal localStorage (per device) inside the Intelligence page, NOT in `wiki/`. The wiki holds only the outside view (ingested sources); queries are the inside view (Scapia's interpretation of the wiki). Keeping them separate preserves the audit trail and prevents the wiki from being polluted with exploratory questions.

---

## Page Schemas

### Competitor entity pages — `wiki/entities/<slug>.md`

One page per competitor. Known Scapia competitors (not exhaustive):

**Direct travel cards:** Axis Atlas · HDFC Diners Black/Regalia · ICICI Emeralde · SBI Elite · AmEx Platinum Travel

**New-age / co-brand cards:** OneCard · Uni · Slice · Kiwi · Jupiter Edge · Fi-Federal · Niyo Global

**UPI / credit-on-UPI:** CRED · PhonePe · Google Pay · Paytm · Slice UPI · Jupiter

**Travel platforms:** MakeMyTrip / goibibo / redBus · ixigo / ConfirmTkt / AbhiBus · EaseMyTrip · Yatra · Cleartrip · IndiGo · Air India

**Going-out / lifestyle:** Eternal (Zomato, Blinkit, District) · BookMyShow · Paytm Insider · Dineout

**Issuer banks:** Federal Bank · Axis · HDFC · ICICI · SBI · RBL · IndusInd

Structure: **perspective sections by domain**. Only populate sections with source evidence. Omit empty sections entirely.

- Domain-pure fintech entity (e.g. CRED): `## Fintech view` only
- Domain-pure travel entity (e.g. ixigo OTA): `## Travel view` only
- Cross-domain entity (e.g. Axis Atlas): both sections

Within `## Travel view`, populate sub-sections only where source evidence exists:

```markdown
## Travel view

### Flights
...

### Stays
...
```

Frontmatter:
```yaml
---
entity: Axis Atlas
type: competitor-entity
domains: [fintech, travel]
travel_categories: [flights, stays]
page_types: [competitor]
perspectives_populated: [fintech, travel]
sources_count: 2
last_updated: YYYY-MM-DD
headline: "One editorial sentence distilled from all perspective content (8–14 words)"
signal: threat
vitals: ["3X pts|Travel earn|on flights", "3500 pts|Annual fee|₹3,500+GST", "4.1★|App Store|was 4.5"]
---
```

**Mandatory distilled fields — `headline`, `signal`, `vitals`:**

- **`headline`** — One editorial sentence distilled from all perspective content. Written by the LLM, never copy-pasted from source. 8–14 words. Must make a reader want to click. Captures the most important thing about this competitor right now.

- **`signal`** — What this competitor means for **Scapia's strategic position**. Must be one of:
  - `threat` — competitor executing well, gaining ground, or poses direct competitive pressure on Scapia
  - `opportunity` — competitor weakening, self-inflicting damage, or creating space Scapia can move into
  - `watch` — direction unclear or indirect overlap — monitor, no immediate action
  Applied from Scapia's perspective, not the competitor's own health. HealthifyMe doing well = `threat` for Scapia, not `positive`.

- **`vitals`** — Array of 1–3 key metrics. Format: `"value|label|note"` (pipe-delimited, note optional). Values must come from source-backed claims in the page body — never invented. Use pipe `|` as separator — the server's `parse_frontmatter()` does simple line-by-line parsing and does not handle nested YAML. Do not switch to nested objects without upgrading the parser to `yaml.safe_load()`.

**Distill sub-step (mandatory after every entity page write):**
After writing or updating any entity page body, immediately re-read the full updated page and synthesise `headline`, `signal`, and `vitals` from the content. Update frontmatter. These three fields must always reflect the current state of the entire page — not just the latest source. A page cannot be filed without them.

**Citation discipline:** every factual claim must carry an inline footnote, an `⚠ Unsourced` marker, or a `> Background (no source in raw/):` callout. See [Citation Discipline (All Page Types)](#citation-discipline-all-page-types) — the rules apply identically to every page type.

Section format within the page body:

```markdown
## Fintech view
<!-- Source: raw/competitive/2026-05-02-axis-atlas-devaluation.md -->

[Content with inline footnotes — every factual claim sourced.]

## Travel view

### Flights
<!-- Source: raw/competitive/2026-05-02-axis-atlas-devaluation.md -->

[Content with inline footnotes.]

## Synthesis

[Cross-perspective synthesis — draws across all populated sections.]

## Competitor Intel

**Decision this informs:** Pricing · Positioning
<!-- mark whichever apply from: Pricing / Positioning / Partnership / Roadmap — at least one required -->

### Where Scapia Wins

**[Point headline — max 12 words, concrete and specific]**
[Context — 2–3 sentences. Source-backed. Explains why this is a genuine win for Scapia.]
→ Action: [Specific imperative action Scapia should take because of this win.]

**[Second point if applicable]**
[Context]
→ Action: [Specific action]

### Where They're Ahead

**[Point headline — honest about the gap, no spin]**
[Context — 2–3 sentences. Genuine advantage for the competitor. Do not minimise.]
→ Action: [How Scapia should respond — specific, not vague.]

### Scapia Implication
→ [Imperative action — verb-first, specific]
→ [Imperative action]
→ [2–4 bullets total]

### Recent Moves
- [YYYY-MM-DD]: [Event description — one line]
- [YYYY-MM-DD]: [Event description]
```

**Mandatory Implications section rules:**
- Every competitor entity page must have a `## Competitor Intel` section. A page cannot be filed without it.
- Written at ingest time — never deferred to query time.
- "Where Scapia Wins" and "Where They're Ahead" are both always present — no cherry-picking.
- Points must be backed by claims in the page body — never invented.
- Parse anchors are strict and non-negotiable: `**bold headline**` introduces each win/loss item; `→ Action:` marks the action line; `→ ` (without "Action:") marks Scapia Implication bullets; `- YYYY-MM-DD:` for Recent Moves. The Competitor Intel section frontend parses this exact section — format drift breaks the parser.

**Invariant:** Entity pages are always multi-perspective and additive. A second ingest about the same entity enriches the existing page — it never creates a duplicate. Prior content is never overwritten; it is extended.

---

### Regulatory pages — `wiki/regulatory/<slug>.md`

One page per regulation, platform guideline, or legal framework. Covers: RBI circulars, NPCI guidelines, DGCA rules, DPDP Act provisions, co-brand card rules, DLG guidelines, Visa/MC/RuPay network rules.

**Critical:** Indian fintech regulation is interpretive by design. "Compliance is binary" is wrong for an RBI circular. This system surfaces and routes — it never concludes on interpretation. Any interpretation call routes to legal/compliance.

**Posture model** — replace the binary Confirmed/Disputed/Unverified with:
- `Active` — in effect, Scapia is operating under it
- `Under Review` — effective but Scapia's posture is being assessed
- `Escalated` — routed to Federal Bank legal or internal compliance for resolution
- `Superseded` — replaced by a newer circular or policy

New mandatory body structure:
```markdown
## Regulatory Intel

**Status:** Active / Under Review / Escalated / Superseded

### What It Requires
- [bullet — direct paraphrase of the regulation]

### Scapia's Current Posture
[One paragraph — what Scapia is doing today]

### Open Questions
- [unresolved ambiguity — routes to legal]

### Sign-off Required
[Federal Bank / Internal Legal / Both]

### Scapia Implication
→ [imperative action]
→ [imperative action]
```

**Hard rule:** Curators file and summarise — they never conclude on interpretation. If two authoritative sources genuinely conflict on fact (not interpretation), mark Status = `Escalated` and flag for legal. Never silently resolve.

Frontmatter:
```yaml
---
regulation: RBI Credit-on-UPI Guidelines
type: regulatory
domains: [fintech]
travel_categories: []
page_types: [regulatory]
effective_date: YYYY-MM-DD
posture: Active
last_updated: YYYY-MM-DD
---
```

**Invariant:** Regulatory pages never get perspective sections. Ever. One posture, one conclusion structure.

---

### Partner pages — `wiki/partners/<slug>.md`

One page per ecosystem partner. Covers Federal Bank (co-brand issuer), Visa/Mastercard/RuPay (network), OTA distribution partners, loyalty program partners.

Frontmatter:
```yaml
---
partner: Federal Bank
type: partner
domains: [fintech]
page_types: [partner]
last_updated: YYYY-MM-DD
headline: "One editorial sentence about this partnership"
---
```

Mandatory body structure:

```markdown
## Partner Intel

**Relationship:** Co-brand issuer / Distribution partner / Technology partner
**Status:** Active / Negotiating / At Risk

### What Scapia Gets
[paragraph]

### What Partner Gets
[paragraph]

### Current Risks
- [specific risk]

### Scapia Implication
→ [imperative action]
→ [imperative action]
```

---

### Event pages — `wiki/events/<slug>.md`

One page per discrete market event: feature launch, pricing change, miles devaluation, funding round, leadership hire, partnership announcement.

Links back to the entity page of the competitor involved.

Frontmatter:
```yaml
---
event: Axis Atlas Miles Devaluation
type: event
domains: [fintech, travel]
travel_categories: [flights]
page_types: [event, competitor]
entity: axis-atlas
date: YYYY-MM-DD
headline: "One editorial sentence — what happened and why it matters for Scapia (8–14 words)"
---
```

**`headline` is mandatory.** Written by the LLM at ingest time. Same rules as entity page headlines: 8–14 words, editorial, must make a reader want to click. A page cannot be filed without it. The Vault card renders this as the muted subtitle below the event title.

Customer Signal events (`page_types: [customer]`) additionally require a `## Customer Intel` section:

```markdown
## Customer Intel

**Source:** App Store / Reddit / Twitter / Mixed
**Sentiment:** Positive / Negative / Mixed

### What They're Saying
- [key point — extracted signal, not raw quote]

### Switching Signals
[paragraph — who's switching from what and why]

### Scapia Acquisition Implication
→ [imperative action]
→ [imperative action]
```

---

### Market Signal pages — `wiki/market-signals/<slug>.md`

Macro trends, category growth signals, financial health of relevant spaces.

Frontmatter:
```yaml
---
title: International Travel Recovery India 2026
type: market-signal
domains: [travel]
travel_categories: [flights]
page_types: [market-signal]
direction: Tailwind
last_updated: YYYY-MM-DD
headline: "One editorial sentence about the signal"
---
```

Mandatory body structure:

```markdown
## Market Intel

**Domain:** Fintech / Travel · [sub-category]
**Direction:** Tailwind / Headwind / Neutral

### What's Shifting
[paragraph — the signal, source-backed]

### Why It Matters for Scapia
[paragraph — direct line to Scapia's positioning or timing]

### Scapia Implication
→ [imperative action]
→ [imperative action]
```

---

### Source summary pages — `wiki/sources/<slug>.md`

Every ingested source gets its own page. Sources are first-class citizens — searchable, cross-linked, auditable. Slug: `YYYY-MM-DD-<source-descriptor>`.

Frontmatter:
```yaml
---
type: source-summary
source_file: raw/competitive/2026-05-02-livemint-atlas-devaluation.md
source_title: "Axis Atlas devalues miles, again"
source_date: 2026-04-28
ingested: 2026-05-02
touches: [entities/axis-atlas, concepts/reward-devaluations]
headline: "One sentence — the single most important finding from this source (max 100 chars)"
---
```

**`headline` is mandatory.** Written at ingest time. The live feed on the homepage displays this as the feed item subtitle — it must make sense out of context (no assumed prior knowledge). Max 100 characters. If the source is auto-rejected or Layer 2, no headline is written.

Body: 3–5 sentence summary of what the source said and what was extracted from it. Include the filter score and routing decision.

---

### Concept pages — `wiki/concepts/<slug>.md`

Reference pages for shared mechanics. Prevents the same concept being re-explained on every entity page. Entities link to concepts; concepts don't duplicate entity content. Examples: `fx-markup.md`, `coin-redemption-economics.md`, `mdr.md`, `credit-on-upi-mechanics.md`, `reward-devaluation-mechanics.md`.

Frontmatter:
```yaml
---
title: FX Markup
type: concept
domains: [fintech]
page_types: [concept]
last_updated: YYYY-MM-DD
---
```

---

### Comparison pages — `wiki/comparisons/<slug>.md`

Head-to-head competitor comparisons. Written on demand only — never automatically. Slug format: `<entity-a>-vs-scapia` or `<entity-a>-vs-<entity-b>`. One comparison per pair.

Frontmatter:
```yaml
---
title: "Axis Atlas vs Scapia"
type: comparison
entities: [axis-atlas, scapia]
domains: [fintech, travel]
page_types: [competitor]
date: YYYY-MM-DD
---
```

---

## Intel Section Mandate

Every page type has a mandatory Intel section. A page cannot be filed without it. The section is written at ingest time, never deferred to query time. The Intel Cards frontend parses this exact section — format drift breaks the parser.

| Page type | Mandatory section | Parse anchor |
|---|---|---|
| competitor (entities/) | `## Competitor Intel` | `## Competitor Intel` |
| regulatory (regulatory/) | `## Regulatory Intel` | `## Regulatory Intel` |
| partner (partners/) | `## Partner Intel` | `## Partner Intel` |
| market-signal (market-signals/) | `## Market Intel` | `## Market Intel` |
| customer (events/ with page_types: [customer]) | `## Customer Intel` | `## Customer Intel` |

Parse anchor rules (non-negotiable):
- `**bold**` on its own line = win/loss/point item headline
- `→ Action:` prefix = action for that win/loss item
- `→ ` (without "Action:") = Scapia Implication bullet
- `- YYYY-MM-DD:` = Recent Moves line
- `**Field:** Value` lines in section header = metadata fields (Status, Direction, etc.)

---

## Ingest Decision Cascade (Fixed Order)

At ingest time, make decisions in this fixed order. Each step is a dependency for the next.

```
1. Filter check (Maker-Checker)
        ↓ is this worth ingesting at all?

2. Page type — determined by source folder:
        raw/competitive/ → competitor / partner / customer (LLM decides which)
        raw/regulatory/  → regulatory
        raw/market/      → market-signal
        raw/ambiguous/   → LLM determines, split treatment

3. Domain
        ↓ which business layer does it touch?
          (fintech / travel / both)
          LLM reads source content — not predetermined by subfolder.

4. Travel sub-category
        ↓ which vertical(s) within travel?
          (flights / stays / trains / buses / visas / experiences / store)
          Only runs if travel is in domains.
```

The source subfolder determines page structure. Domain is always inferred from source content at ingest time. Regulatory pages always have one-posture structure regardless of domain. Competitor pages always have multi-perspective additive structure regardless of domain.

---

## Filter — Maker-Checker with Three-Band Routing

Run this filter on every ingest, before writing any pages.

### Stage 1 — Maker scores

Run three checks in sequence:

**Check 1 — Relevance**
Does this source mention any entity, concept, regulation, or domain already tracked by the wiki, or any known Scapia competitor/partner/regulator? If no connection to anything in the wiki → incremental value = 1–2.

**Check 2 — Duplication**
Does this source say anything the wiki doesn't already know? Check entity pages, regulatory pages, event pages, source pages for overlap. If fully covered → incremental value = 1–3.

**Check 3 — Incremental value score**
Rate 1–10. Explain reasoning in one sentence.

**Maker routing by score band:**

| Maker score | Action |
|---|---|
| 8–10 | AUTO-APPROVE — Checker skipped. Proceed with ingest. |
| 4–7 | BORDERLINE — Run Stage 2 (Checker). |
| 1–3 | AUTO-REJECT — Log and stop. Zero pages written. |

---

### Stage 2 — Checker scores (only runs if Maker scored 4–7)

Run the same three checks **adversarially**, without anchoring to the Maker score. Same-model agreement on the same rubric is correlated by construction — two passes share blind spots and will co-sign the same errors. The Checker's value comes from the *opposing prompt*, not from being a second pair of eyes.

**Checker prompt stance:** assume this source is low-value and look for reasons to reject. Try to refute each of the three checks rather than re-confirm them:
- **Relevance** — argue the connection to tracked entities is incidental, not material.
- **Duplication** — argue the wiki already covers this, even if phrased differently.
- **Incremental value** — argue what looks like new signal is actually noise, restatement, or speculation.

Produce a second 1–10 score with a one-line reason. A Checker primed to reject that still arrives at a confident accept carries real weight. A Checker that agrees with a low Maker score is consistent rejection, not corroboration — route per the table below.

**Limit of same-model independence:** for highest-stakes regulatory sources (RBI/NPCI/co-brand circulars), the curator may override and route directly to Layer 2 regardless of score band. Adversarial same-model pairing is the default, not a guarantee of independence.

**Checker routing by combined outcome:**

| Outcome | Condition | Action |
|---|---|---|
| A | Checker 8–10 | AUTO-APPROVE — Checker upgraded it. Proceed. |
| B | Checker 1–3 | AUTO-REJECT — Checker downgraded it. Log and stop. Zero pages written. |
| C | Both 4–7, within 1–2 pts | LAYER 2 — Borderline card to curator. |
| D | Both 4–7, diverge 3+ pts | LAYER 2 — Disagreement card to curator. |

---

### Layer 2 — Analyst card format

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
LAYER 2 — ANALYST REVIEW REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Source:        <filename>
Outcome:       C (Borderline) / D (Disagreement)

Maker score:   X/10 — <one-line reason>
Checker score: X/10 — <one-line reason>

Why flagged:   <one sentence>

Analyst actions:
  [ Split ]              — process across multiple treatments (any combination below)
  [ Regulatory only ]    — treat as regulatory, discard other signals
  [ Competitive only ]   — treat as competitive (entity/partner/customer), discard others
  [ Market signal only ] — treat as market-signal, discard others
  [ Reject ]             — do not ingest
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Do not write any pages until the analyst selects an action.

---

## Ingest Workflow

Before running this workflow on any new source, **discuss first** (step 2 below). Do not skip it.

1. Read the source file end-to-end.

2. **Discuss key takeaways with the human in 3–6 bullets** — what's new, what's surprising, what touches Scapia's positioning. Wait for direction before writing pages, unless the human has said "ingest autonomously."

3. **Run the Maker-Checker filter.** If Maker scores 1–3, stop — log AUTO-REJECT, write zero pages. If Maker scores 8–10, skip Checker and proceed. If Maker scores 4–7, run Checker and route by combined outcome.

4. **Run the ingest cascade:** determine page type → domain → travel sub-categories (if travel). These decisions drive all subsequent steps.

5. **Write or update entity pages.** For competitor sources: identify which competitor(s) are mentioned. Find or create their entity page(s). Identify which domain perspective(s) the source speaks to — `## Fintech view` and/or `## Travel view` (with sub-sections). Add content to those sections only. Update the synthesis section. Apply citation discipline: every factual claim gets an inline footnote or an ⚠ Unsourced marker. If a new source contradicts an existing claim, add a ⚠ Conflict marker — never silently overwrite.

6. **Write or update `## Competitor Intel`.** For every entity page written or updated: write or re-evaluate the Competitor Intel section. This step is not optional — a page cannot be filed without it. Must answer: what decision does this inform? Where does Scapia win? Where is the competitor genuinely ahead? What should Scapia do? Follow the exact section format and parse anchors above.

7. **Write or update regulatory pages.** For regulatory sources: find or create the regulatory page. Write using the posture model (What it says / Current posture / Open questions / Sign-off required). If the source conflicts with existing regulatory content on fact (not interpretation), mark status = `Escalated` and flag for curator — never silently resolve. Never conclude on RBI/NPCI interpretation — surface and route only.

8. **Create an event page** if the source describes a discrete market event (launch, pricing change, devaluation, funding, hire, partnership). Link back to the relevant entity page.

9. **Create a source summary page** in `wiki/sources/`. Every ingested source gets one. Record: source file path, title, date, filter score, pages touched.

10. **Distill entity frontmatter.** For every entity page written or updated: re-read the full page body and synthesise `headline`, `signal`, and `vitals`. Write these three fields into frontmatter. Values in `vitals` must be traceable to claims in the body — never invented. This step is not optional.

11. **Update `wiki/index.md`.**

12. **Append to `wiki/log.md`.**

13. **Report to human:** pages created/updated, perspective sections added, filter score and band, page types assigned, domain(s) tagged, travel sub-categories (if any), any conflicts flagged, Layer 2 cards issued, source summary page created, frontmatter distilled, Implications section written/updated.

**User verbal context:** capture as a dated raw file — see [Citation Discipline](#citation-discipline-all-page-types).

---

## Query Workflow

When the human asks a question:

1. Read `wiki/index.md` to identify relevant pages.
2. Read those pages and `wiki/scapia.md` (the reference baseline).
3. Structure the answer in the **Brief format** below.
4. Treat regulatory content with authority — one posture, no hedging. Treat competitive intelligence as multi-perspective — tag each signal with its domain lens.
5. Never mix regulatory and competitive in the same Signal section.
6. Query answers are NOT filed as wiki pages. Past queries live in the user's local thread history (Intelligence page sidebar), separate from the wiki itself.

---

### Brief Format

Every answer must follow this exact structure.

```
> **TL;DR:** [One sentence. The single most important conclusion. Never two sentences.]

---

## Signal · [[entities/slug]] · Lens
**Stat:** [Key metric] · [Key metric] · [Key metric if exists]
[2–3 sentences of signal. No filler. Cite with [[wikilinks]] inline.]

## Signal · [[regulatory/slug]] · Regulatory
**Stat:** [Effective date] · [Posture]
[2–3 sentences on posture and what it means for Scapia.]

(Repeat one Signal section per entity or regulatory topic.)

---

## Scapia Implication
- [Action — start with a verb, be direct]
- [Action]
- [2–4 bullets max]

---

**Confidence:** High / Medium / Low · [N] sources · Perspectives: [list]
```

---

### Chart blocks

When you have 3 or more numerical data points worth comparing, output a chart block after the relevant Signal section:

````
```chart
type: horizontal-bar
title: "Chart title"
unit: "₹"
data:
  - label: Axis Atlas
    value: 3500
    note: "annual fee + GST"
  - label: HDFC Regalia
    value: 2500
```
````

**Supported types:** `bar` · `horizontal-bar` · `line` · `donut`

**Rules:** Use `horizontal-bar` for 4+ competitors. Use `donut` for proportional data. One chart per Signal section maximum. Only include when numbers add genuine insight — never force one.

---

### Brief format rules

- **TL;DR:** exactly one sentence. The conclusion, not the setup.
- **Stat:** chips are `·`-separated. Numbers first, context second. No full sentences.
- **Signal sections:** one per entity or regulatory topic. Never merge two entities.
- **Scapia Implication:** 2–4 bullets. Imperative verbs. "Build X", "Watch Y", "Avoid Z" — not "Scapia should consider".
- **Confidence:** `High` = primary source confirmed. `Medium` = secondary or inferred from one source. `Low` = speculative or unverified.
- Do not add a `## Sources` markdown section. Citations live in `[[wikilinks]]` only.

---

## Push Layer — Live Feed + Email Notification

The system is not pull-only. Every ingest that produces a source summary page becomes a push event automatically — no extra step in the ingest workflow.

**Two surfaces consume the feed:**

1. **Vault + Intel Cards (in-app)** — every wiki page is browsable as a card in the Vault (`/vault`), and every page with an `## X Intel` section renders as a structured Intel Card. Unread state is tracked per-user in `localStorage` (`mi_opened_pages`) and shared between the homepage feed and Vault cards (orange dot on unopened cards).
2. **Homepage live feed (`What's New`)** — the right-hand panel on the homepage reads `GET /api/feed` and splits items into `LAST 24H` (ingested < 24h ago) and `UNSEEN EARLIER`. Click on a feed item → deep-links to `/vault?open=<path>` → opens that page's `WikiPagePanel`. This is the in-app push surface today.
3. **Email (Resend)** — material-change events fan out as emails via Resend. The feed item *is* the brief: `headline` + `signal` + linked Intel Card. No separate brief generation needed — if a source summary page was written, it is push-ready.

**What "material change" means today:** any source that clears the Maker-Checker filter and writes a source summary page. The filter already encodes materiality (Maker scores 8–10 auto-approve; 4–7 routes through Checker; 1–3 auto-reject). The filter decision *is* the push decision.

**What the LLM must do at write time for push to work:**
- Every source summary page must have a `headline` (max 100 chars, makes sense out of context) — already mandatory ([Source summary pages](#source-summary-pages--wikisourcesslugmd)).
- `touches` must list at least one wiki page — the feed item's primary signal/page-type/domain is derived from `touches[0]`'s frontmatter.
- The touched page's `signal` (for competitor pages) or status (for regulatory) must be current — the feed surfaces these to the recipient.

**Recipient model (pending Karthik / Rathina input):** who receives which emails, batching cadence, and the line between "in-app only" vs "email worthy" will be set by the primary users. Today: all source summary pages are eligible; no batching is enforced.

**Hard rule:** the LLM never decides "this is too small to push." Materiality is the filter's job, not the writer's. If a source clears the filter and a source summary page is written, it enters the feed.

---

## Lint Workflow

When the human asks for a health check:

- Flag competitor entity pages missing perspective sections that existing sources should populate.
- Flag known Scapia competitors with no entity page — report as a gap.
- Flag regulatory pages with status = `Escalated` — list explicitly.
- Flag regulatory pages missing any of the four mandatory body fields (What it says / Current posture / Open questions / Sign-off required).
- Flag entity pages missing the `## Competitor Intel` section.
- Flag entity pages with ⚠ Unsourced markers that have been open more than 2 ingests.
- Flag ⚠ Conflict markers that have not been curator-resolved.
- Flag orphan pages (no inbound links from other wiki pages).
- Flag source summary pages with missing `touches` links.
- Do NOT raise false disputes between two competitors responding differently to the same regulation — different entities reacting differently is not a contradiction.
- Suggest 2–3 new sources worth investigating based on gaps.

---

## Cross-Referencing Conventions

- Link between wiki pages using Obsidian-style wikilinks: `[[entities/axis-atlas]]`, `[[regulatory/rbi-credit-on-upi-guidelines]]`, `[[events/axis-atlas-miles-devaluation]]`, `[[concepts/reward-devaluation-mechanics]]`.
- Entity pages and event pages for the same competitor link to each other.
- Entity pages link to relevant concept pages rather than re-explaining shared mechanics.
- Source summary pages link to all entity, regulatory, and concept pages they touched.
- If a regulatory source conflicts with existing regulatory content, add a `> ⚠ Conflict:` callout naming both sources — never silently resolve.
- If a competitor's position on a dimension has changed across ingests, note it in the synthesis section of their entity page and flag the change in the source summary page.

---

## index.md Structure

Seven sections: Competitor Entities · Regulatory Pages · Events · Partners · Customer Signals · Market Signals · Concepts. Each entry: `- [[path/to/page]] — one-line summary`. Keep current on every ingest.

---

## log.md Format

Append-only. Each entry: `## [YYYY-MM-DD] <operation> | <description>`

Operations: `ingest` · `query` · `lint` · `update` · `create` · `filter-reject` · `filter-layer2`

Examples:
```
## [2026-05-27] ingest | 2026-05-02-axis-atlas-tnc.md → wiki/entities/axis-atlas.md (Fintech view) + wiki/sources/2026-05-02-axis-atlas-tnc.md | Maker: 9/10 AUTO-APPROVE | domains: [fintech, travel] | 1 entity page created, 1 source page created
## [2026-05-27] filter-reject | 2026-05-01-travel-card-listicle.md | Maker: 2/10 AUTO-REJECT — generic listicle, no incremental signal for any tracked entity
## [2026-05-27] filter-layer2 | 2026-05-03-rbi-report.md | Maker: 5/10, Checker: 6/10 — Outcome C, routed to analyst
## [2026-05-27] query | Axis Atlas vs Scapia — competitive positioning on travel earn rates
## [2026-05-27] lint | Health check — 2 entity gaps, 1 Escalated regulatory page, 3 missing Implications sections
```

---

## Style Rules

- Write in clear, precise prose. No fluff.
- Regulatory pages state posture, not conclusion. Surface and route — never interpret.
- Entity pages are analytical and multi-perspective. Never flatten perspectives into a single take.
- Informal sources (Reddit, App Store reviews) are processed into clean competitive signal — extract the insight, discard noise, do not dump raw posts into the wiki.
- Dates in frontmatter: always `YYYY-MM-DD`.
- Page filenames: lowercase, hyphen-separated (e.g. `axis-atlas.md`, `rbi-credit-on-upi-guidelines.md`).
- Keep pages focused. If an entity page grows beyond ~500 lines, note it.
- Numbers in `vitals` use native currency symbols (₹ for INR) and standard abbreviations (Cr, L, K).

---

## Session Startup

At the start of each new session:
1. Read `wiki/log.md` (last 10 entries) and `wiki/index.md`.
2. Read `wiki/scapia.md` to reload the Scapia reference baseline.
3. Report: how many entity, partner, regulatory, event, market-signal, customer-signal, concept, comparison, and source pages currently exist, and what was last ingested.
