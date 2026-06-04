# Market Intelligence System — Complete Knowledge Transfer
**From the Calibre Prototype to Scapia v1**
*Everything learned, built, decided, and iterated. Use this as the single reference when building v1.*

---

## 1. The Problem This System Solves

Competitive and regulatory intelligence at a fast-moving org is always distributed — across people, Slack messages, Notion docs, individual memories. The failure mode is structural, not behavioural:

- Intelligence doesn't persist beyond the person who holds it
- It isn't shared uniformly — nobody has the full picture
- It degrades silently — yesterday's insight becomes today's stale assumption
- It requires active effort to retrieve every single time

Every attempt to fix this — Confluence, Notion, Slack channels — fails the same way. They require humans to do the maintenance. Humans get busy. The wiki goes stale. The org reverts to asking around.

**The structural fix:** The LLM removes the maintenance burden. Humans still have to feed it — but the bookkeeping, cross-referencing, contradiction flagging, and synthesis are entirely LLM-owned.

---

## 2. Core Architecture — The LLM-Wiki Pattern

### Why it's different from standard RAG
Standard RAG retrieves chunks at query time and re-derives an answer from scratch every time. Nothing accumulates. This system works differently:

- LLM reads each source at ingest, extracts the signal, and integrates it into a persistent wiki
- Knowledge is compiled once and kept current
- The 50th source enriches an existing structure — it doesn't add to a pile
- Answers compound over time instead of being re-derived from scratch

### The Three Layers

```
raw/          ← Immutable. LLM reads, never writes. The audit trail.
wiki/         ← Entirely LLM-owned. Pages created, updated, cross-referenced by LLM.
CLAUDE.md     ← The schema. Controls exactly what the LLM does and how.
```

**Critical invariant:** Raw is never touched. If a source file is malformed, flag it — never fix it in place. The audit trail must stay intact.

### The Three Operations

**Ingest** — Source enters, LLM reads it, runs the filter, integrates signal into relevant pages. Contradictions flagged immediately, never silently resolved. After every entity page write, runs a **distill sub-step** (see Section 4).

**Query** — Leader asks a question, LLM reads relevant wiki pages, returns a sourced answer. Answers worth keeping are offered as synthesis pages — never filed automatically.

**Lint** — Periodic health check. Scans for contradictions, stale claims, orphan pages, missing cross-references, gaps. Detects and flags — never silently fixes.

**Distill** — Sub-step of every entity page ingest. After the body is written or updated, re-read the full page and synthesise `headline`, `signal`, and `vitals` into frontmatter. These three fields power the wiki browser card surface. Not a separate operation — always runs as part of ingest. Never skipped.

---

## 3. The Two Types of Intelligence — The Bifurcation Rule

This is the most important architectural decision. Treating regulatory and competitive intelligence the same way is a design mistake.

### Regulatory — Reductive (converge to one answer)
- Compliance is binary — multiple interpretations produce compliance risk, not richer understanding
- The system produces one conclusion: what the regulation requires and what Scapia must do
- If two sources genuinely conflict: mark `Disputed`, route to legal — never silently pick a side
- **For Scapia v1:** This model is wrong for Indian fintech — see Gap 2 below

### Competitive — Additive (preserve all lenses)
- Multiple perspectives on the same competitor are not contradictions — they're each seeing something real
- Engineering view + Commercial view + Product view on the same entity page, never flattened
- Second source never creates a new entity page — it enriches the existing one
- Prior content never overwritten — extended

**The distinction most CI tools miss:** Uniform access doesn't mean uniform conclusion. On regulatory: same answer for everyone. On competitive: same access for everyone, views additive.

---

## 4. The Calibre Prototype — Schema Design

### Directory Structure

```
ai-wiki/
├── CLAUDE.md              ← The schema and control layer
├── wiki/
│   ├── index.md           ← Master catalog, maintained by LLM on every ingest
│   ├── log.md             ← Append-only event log
│   ├── entities/          ← One page per competitor
│   ├── regulatory/        ← One page per regulation or platform policy
│   ├── events/            ← One per discrete market event
│   └── synthesis/         ← Cross-cutting analyses, written on demand only
└── raw/
    ├── competitive/
    ├── regulatory/
    └── ambiguous/
```

### Page Types Built in the Prototype

**Entity pages** (`wiki/entities/<slug>.md`)
- One page per competitor
- Three perspective sections: **Product view** · **Engineering view** · **Commercial view**
- Only populate sections with source evidence — omit empty sections entirely
- Synthesis section at the bottom draws across all populated perspectives
- A second ingest never creates a duplicate — always enriches the existing page

Frontmatter:
```yaml
---
entity: MyFitnessPal
type: competitor-entity
perspectives_populated: [commercial, engineering]
sources_count: 2
last_updated: YYYY-MM-DD
headline: "Barcode paywall doubled the price and triggered mass exodus — switching is still ongoing"
signal: opportunity
vitals: ["$80/yr|Annual price|+60% Mar 2023", "4.2★|App Store|was 4.7", "200M+|MAU"]
---
```

**Three mandatory distilled fields** (written by LLM at ingest time, powers the wiki browser card):

- **`headline`** — One editorial sentence distilled from all perspective content. 8–14 words. Must make a reader want to click. Written by LLM from the page body — never copy-pasted from a source.
- **`signal`** — What this competitor means for **Calibre's strategic position**. Vocabulary: `threat` (competitor executing well, direct competitive pressure on Calibre) · `opportunity` (competitor weakening, creating space for Calibre) · `watch` (unclear direction, no immediate action). Applied from Calibre's perspective — not the competitor's own health.
- **`vitals`** — Array of 1–3 key metrics. Pipe-delimited format: `"value|label|note"` where `note` is optional (delta, comparison, date). Values must come from source-backed claims in the page body — never invented. Uses pipe `|` as separator so the server's simple line-by-line frontmatter parser handles it without needing a full YAML library.

**Why Calibre-lens signal, not competitor-health signal:** An early version used `positive/negative/watch` from the competitor's own perspective (MFP struggling = `negative`, Cronometer doing well = `positive`). This was confusing — a `positive` badge on HealthifyMe felt like good news when it was actually a direct threat to Calibre's photo-tracking feature. Switching to `threat/opportunity/watch` from Calibre's perspective makes the badge answer the only question that matters: *what should Calibre do about this competitor?*

**Server parser constraint:** The backend `parse_frontmatter()` in `server.py` does line-by-line key:value parsing with simple `[a, b, c]` list support. It does NOT handle nested YAML objects. This is why vitals use a flat pipe-delimited string format rather than a proper YAML array of objects. Do not change the vitals format to nested YAML without first upgrading `parse_frontmatter` to use `yaml.safe_load()`.

**Regulatory pages** (`wiki/regulatory/<slug>.md`)
- One page per regulation or platform policy
- Fixed structure: What changed · Effective date · Compliance action · Source · Status
- One conclusion only — no perspective sections, ever
- Status vocabulary in prototype: `Confirmed / Disputed / Unverified`
- **For Scapia v1:** Replace entirely — see Gap 2

Frontmatter:
```yaml
---
regulation: Apple App Store Health App Guidelines
type: regulatory
effective_date: YYYY-MM-DD
compliance_status: Confirmed
last_updated: YYYY-MM-DD
---
```

**Event pages** (`wiki/events/<slug>.md`)
- One per discrete market event: feature launch, pricing change, funding round, leadership hire
- Links to the entity page of the competitor involved
- Created during ingest if the source describes a discrete event

**Synthesis pages** (`wiki/synthesis/<slug>.md`)
- Written on demand only — never automatically
- Cross-cutting analyses and competitive landscape summaries
- Only filed when explicitly offered and accepted by the human

### The Bifurcation Rule Applied at Ingest

```
raw/regulatory/   → Regulatory page treatment (one authoritative conclusion)
raw/competitive/  → Entity page treatment (multi-perspective, additive)
raw/ambiguous/    → Split treatment (both applied, split reported to human)
```

### The log.md Convention
Append-only. Every entry: `## [YYYY-MM-DD] <operation> | <description>`
Operations: `ingest | query | lint | update | create | filter-reject | filter-layer2`

---

## 5. The Filter — Maker-Checker with Three-Band Routing

### Why It Exists
Org-wide contribution means volume. Volume without a filter means noise reaching the wiki and degrading intelligence. The filter ensures the wiki only receives what is genuinely new and genuinely useful.

### Stage 1 — Maker (automated)

Three sequential checks:
1. **Relevance** — does this connect to anything already in the wiki or any known entity?
2. **Duplication** — does this say anything the wiki doesn't already know?
3. **Incremental value score** — rate 1–10 with one-line reason

**Routing by score band:**

| Score | Action |
|-------|--------|
| 8–10 | AUTO-APPROVE — Checker skipped entirely |
| 4–7 | BORDERLINE — Run Stage 2 (Checker) |
| 1–3 | AUTO-REJECT — Checker skipped entirely, zero pages written |

### Stage 2 — Checker (runs only if Maker scored 4–7)
- Same three checks, independently — no visibility into Maker's score
- Independence is what makes agreement meaningful; divergence is a genuine signal

**Checker outcomes:**

| Outcome | Condition | Action |
|---------|-----------|--------|
| A | Checker 8–10 | AUTO-APPROVE — Checker upgraded borderline call |
| B | Checker 1–3 | AUTO-REJECT — Checker downgraded |
| C | Both 4–7, within 1–2 pts | LAYER 2 — Borderline card to curator |
| D | Both 4–7, diverge 3+ pts | LAYER 2 — Disagreement card to curator |

### Layer 2 — Analyst Card
Presented only for Outcomes C and D. Card format:
```
LAYER 2 — ANALYST REVIEW REQUIRED
Source: <filename>
Outcome: C (Borderline) / D (Disagreement)
Maker score: X/10 — reason
Checker score: X/10 — reason
Why flagged: one sentence

Actions: [ Split ] [ Regulatory only ] [ Competitive only ] [ Reject ]
```

### What Maker-Checker Actually Solves
- **Score:** LLM-as-Judge with explicit rubric — auditable, improves with better prompting
- **Confidence signal:** Disagreement between Maker and Checker signals genuine uncertainty naturally
- **Ground truth:** Curator approvals and rejections over time become a labelled evaluation dataset

### Key Gap in the Filter (Gap 5 — not in the 4 you specified but worth noting)
The filter currently scores relevance, duplication, and incremental value — but **not source credibility**. A confidently-written Reddit rumour and an RBI filing score on the same axes.

**For v1:** Add a fourth dimension — credibility — as a hard modifier:
- T1 Primary: RBI/NPCI filings, T&Cs, primary regulatory documents — full trust
- T2 Reported: Livemint, ET, credible press with named sources — high trust
- T3 Aggregated: industry reports, analyst notes — medium trust
- T4 Anecdotal: Reddit, Twitter, Glassdoor — low trust, never load-bearing fact

Add a first-class `Interesting / Unverified` state — T4 sources with high incremental value land here, not in the wiki as fact, flagged for curator to verify before promoting.

---

## 6. The Query Workflow — The Brief Format

### Why the Brief Format
The output of a query is not a ChatGPT answer. It is an executive brief — designed to be scanned before a meeting, not read. The format enforces this structurally.

### The Exact Brief Format (what the LLM outputs)

```
> **TL;DR:** [One sentence. The single most important conclusion. Never two sentences.]

---

## Signal · [[entities/slug]] · Lens
**Stat:** [Key metric] · [Key metric] · [Key metric]
[2–3 sentences of signal. Cite with [[wikilinks]] inline.]

## Signal · [[regulatory/slug]] · Regulatory
**Stat:** [Effective date] · [Compliance status]
[2–3 sentences on what changed and what it means.]

---

## Calibre Implication
- [Imperative verb. Direct action.]
- [Imperative verb. Direct action.]
- [2–4 bullets max]

---

**Confidence:** High / Medium / Low · [N] sources · Perspectives: [list]
```

### Chart Blocks
When 3+ numerical data points exist worth comparing, embed a chart immediately after the relevant Signal:

````
```chart
type: horizontal-bar
title: "Chart title"
unit: "$"
data:
  - label: Competitor Name
    value: 79.99
    note: "optional context"
```
````

**Supported chart types:** `bar` · `horizontal-bar` · `line` · `donut`

**Rules:**
- Use `horizontal-bar` for 4+ competitors (labels fit better)
- Use `donut` for proportional data (market share)
- One chart per Signal section maximum
- Only include when numbers add genuine insight — never force one

### Brief Format Rules
- **TL;DR:** exactly one sentence. The conclusion, not the setup
- **Stat chips:** numbers first, context second, `·`-separated, no full sentences
- **Signal sections:** one per entity or regulatory topic — never merge two entities
- **Calibre Implication:** 2–4 bullets, imperative verbs ("Build X" "Watch Y" "Avoid Z")
- **Confidence:** High = primary/confirmed source. Medium = secondary or inferred. Low = speculative
- **No `## Sources` section** — citations live in wikilinks only, UI surfaces them automatically

---

## 7. The Frontend — React App Architecture

### Stack
- **Frontend:** React + Vite + TailwindCSS
- **Backend:** Python server (`server.py`) on port 8080
- **API proxy:** Vite proxies `/api` → `localhost:8080`
- **Charts:** Recharts
- **Markdown:** ReactMarkdown v9 + remark-gfm

### Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/intelligence` | IntelligencePage | Query interface — ask questions, get Brief format answers |
| `/intel-cards` | IntelCardsPage | Intel Cards — competitor + regulatory cards, filterable |
| `/wiki` | WikiBrowserPage | Wiki browser — 5 tabs, card grid, slide-in panel |
| `/curator` | CuratorPage | Ingest queue management |
| `/submit` | SubmitPage | Source submission |

### Key Components

**`AnswerCard.jsx`** — The core Brief format renderer
- `extractFrontmatter(text)` — parses YAML frontmatter into `{ meta, body }`
- `processAnswer(text)` — strips frontmatter, Sources section, Query line; splits at `## Calibre Implication` into `mainBody` + `calibreBody`
- `makeComponents(onCitationClick, theme)` — factory function generating ReactMarkdown component maps for light (main body) and dark (Calibre card) themes
- `blockquote` renderer: detects TL;DR → renders as orange callout card
- `h2` renderer: detects `Signal ·` prefix → renders SIGNAL badge + entity pill + lens label
- `p` renderer: detects `**Stat:**` → renders as chip row
- `code` renderer: detects `language-chart` → renders ChartBlock; detects `!includes('\n')` (inline) → WikiPill or styled inline code
- `StatChips` — splits `·`-delimited stat text into chip components
- `ConfidenceRow` — renders High/Medium/Low badge + metric chips
- WikiPill colors: entities=orange, regulatory/events=green, synthesis=purple
- Perspective pill colors: Commercial=orange, Engineering=purple, Product=blue

**`ChartBlock.jsx`** — Recharts chart renderer
- `parseSpec(raw)` — parses YAML-like spec string into `{ type, title, unit, data[] }`
- Four chart types: `BarChartBlock`, `HorizontalBarBlock`, `LineChartBlock`, `DonutBlock`
- All use `#ce3e00` orange as primary color
- Custom tooltip with Lexend Deca font

**`IntelCard.jsx`** — Competitor and Regulatory Intel Cards
- `CompetitorCard` — Where Calibre Wins (green, expandable) · Where They're Ahead (red, expandable) · Calibre Implication (dark black card) · Recent Moves
- `RegulatoryCard` — What It Says · Current Posture · Open Questions (amber) · Sign-off Required (red)
- Expandable sections: click to reveal Context + Action for each win/loss point

**`WikiBrowserPage.jsx` — EntityCard** (redesigned)

The original EntityCard showed a 140px illustration zone with coloured initials avatar + perspective badges, then entity name + sources count below. No numbers, no signal, no context. It was visual but content-free — every card looked the same.

The redesigned EntityCard surfaces the three distilled frontmatter fields (`headline`, `signal`, `vitals`) directly on the card face:

```
┌─ 4px signal border ──────────────────────────────────┐
│ [avatar] COMPETITOR                    ● THREAT       │
│                                                       │
│ HealthifyMe (Healthify)                               │  ← 24px bold
│ Photo-based logging since 2019 and $45M to enter...  │  ← 11.5px italic #AAA
│                                                       │
│ ┌──────────┐  ┌──────────┐  ┌──────────┐            │  ← dark chips #111
│ │  40M     │  │  $45M    │  │  2019    │            │
│ │ Users    │  │ Oct 2024 │  │HealthSna │            │
│ │ GLOBAL   │  │ SERIES D │  │ PHOTO LOG│            │
│ └──────────┘  └──────────┘  └──────────┘            │
│                                                       │
│ [Product]                              1 source       │
└───────────────────────────────────────────────────────┘
```

Key implementation details:
- **Signal left border:** `borderLeft: '4px solid {signalColor}'` always on. Other three borders toggle to signal colour on hover (preserving the left colour). Prevents the hover handler from overriding the signal strip.
- **Signal colours:** `threat` = `#DC2626` red · `opportunity` = `#16A34A` green · `watch` = `#D97706` amber
- **Vital chip dark cards:** `#111111` background, consistent with the existing Calibre Implication dark card — not a new design element.
- **`parseVitals(raw)`** — splits each pipe-delimited string: `"$80/yr|Annual price|+60% Mar 2023"` → `{ value: "$80/yr", label: "Annual price", note: "+60% Mar 2023" }`. Handles missing note gracefully.
- **Grid:** `repeat(3, 1fr)` fixed — not `auto-fill`. Applies to the Entities, Regulatory, and Events tabs. Forces exactly 3 columns so cards always have enough width for chip content without truncation at any typical desktop viewport. Synthesis and Lenses tabs retain `auto-fill minmax(220px, 1fr)` since their cards have simpler content.
- **Fallback:** If `signal`, `headline`, or `vitals` are absent (e.g. a page ingested before the distill step ran), the card degrades gracefully — no badge, no italic text, no chips. Renders with just name + perspectives + sources.

**`WikiBrowserPage.jsx` — RegulatoryCard** (redesigned)

The original RegulatoryCard used the same illustration-zone layout as EntityCard. The redesigned card follows the same structural language — left border, dark chips, badge — using only existing frontmatter fields (`compliance_status`, `effective_date`). No schema changes needed.

```
┌─ 4px status border ──────────────────────────────────┐
│ REGULATORY                          ● Confirmed       │
│                                                       │
│ Apple App Store Health App Guidelines                 │  ← 18px bold
│                                                       │
│ ┌──────────────────────┐  ┌──────────────────────┐   │  ← dark chips #111
│ │  2024-03-15           │  │  Confirmed           │   │
│ │  EFFECTIVE DATE       │  │  (in status color)   │   │
│ └──────────────────────┘  └──────────────────────┘   │
│                                                       │
│ Last updated: 2026-05-21                              │
└───────────────────────────────────────────────────────┘
```

Key implementation details:
- **Status colour config** — maps `compliance_status` to colors matching the entity signal palette: `Confirmed` = green `#16A34A` · `Disputed` = red `#DC2626` · `Unverified` = amber `#D97706`
- **Left border** = status colour, always on (same pattern as EntityCard's signal border)
- **Status badge** = status colour text on matching light background (same as signal badge on EntityCard)
- **Status chip value** = rendered in status colour, not white — the status word itself is the most meaningful data on a regulatory card
- **No schema changes needed** — `regulation` name, `effective_date`, and `compliance_status` already exist in regulatory page frontmatter

**`WikiBrowserPage.jsx` — EventCard** (redesigned)

The redesigned EventCard uses the competitor's entity colour as its visual identity anchor, creating a direct visual connection between event and parent entity:

```
┌─ 4px entity-color border ────────────────────────────┐
│ [MFP] EVENT                                          │
│                                                       │
│ MyFitnessPal Premium Price Increase                  │  ← 18px bold
│                                                       │
│ ┌──────────────────────┐  ┌──────────────────────┐   │  ← dark chips #111
│ │  2023-03-01           │  │  MyFitnessPal        │   │
│ │  DATE                 │  │  (in entity color)   │   │
│ └──────────────────────┘  └──────────────────────┘   │
│                                                       │
│ See also: MyFitnessPal                                │
└───────────────────────────────────────────────────────┘
```

Key implementation details:
- **Entity colour** — derived from `entityColor(entitySlug)` — the same function used for entity pills throughout the app. An MFP event has the same colour as the MFP entity card border
- **Left border** = `entityColor(entitySlug)` — connects the event to its parent competitor at a glance without reading a word
- **Entity initials avatar** = 28×28 circle in entity colour (matching EntityCard avatar style)
- **Entity name chip value** = rendered in entity colour — identifies which competitor immediately
- **`entityName` derived from slug** inline: `entitySlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())` — no additional frontmatter fields needed
- **No schema changes needed** — `event`, `date`, and `entity` fields already exist in event page frontmatter

**`WikiBrowserPage.jsx` — Lenses tab**

The LensFilteredView already used `EntityCard` before this redesign (line 410 in the original file). The only change was the grid: `auto-fill minmax(220px, 1fr)` → `repeat(3, 1fr)`, ensuring Lenses-filtered entity cards render at the same width as the main Entities tab. The click-through path (Lenses → filter by lens → EntityCard) naturally inherits the new card design with no additional work.

**`WikiPagePanel.jsx`** — Resizable slide-in detail panel
- Drag handle on left edge: hover turns orange, drag left/right to resize
- Default width: 560px · Max width: 900px
- `MIN_WIDTH = 560`, `MAX_WIDTH = 900` constants at top of file
- `onMouseDown` / `mousemove` / `mouseup` handlers via `useEffect`

**`Sidebar.jsx`** — Dark left nav
- Logo, search, "+ New Query" button
- Past queries list from `/api/pages` synthesis endpoint
- Nav items: Intelligence · Intel Cards · Wiki Browser · Curator Queue · Submit

### Important React/Rendering Notes
- **ReactMarkdown v9:** The `inline` prop is NOT passed to the `code` renderer. Detect inline via `!txt.includes('\n')` instead
- **Wikilinks in headings:** `[[wikilinks]]` in heading text were causing `<pre>` inside `<h2>` (invalid HTML, browser splits into 3 elements). Fixed by the inline detection — inline wikilinks render as WikiPill, not pre blocks
- **Theme factory:** `makeComponents(onCitationClick, 'light'|'dark')` prevents code duplication between main body and Calibre dark card
- **Scroll behaviour:** `topRef` at top of message list; `bottomRef` at bottom. Only scroll to bottom when `loading === true`. Scroll to top when loading a past synthesis page

### The Prototype Color System
- Primary orange: `#ce3e00`
- Background: `#f1f6fa`
- Card background: `#FFFFFF`
- Card border: `#E8E8E8`
- Dark card (Calibre Implication): `#111111`
- Entity pill: bg `#FFF3EC`, text `#ce3e00`, border `#FDBA74`
- Regulatory/event pill: bg `#DCFCE7`, text `#16A34A`, border `#86EFAC`
- Synthesis pill: bg `#F5F3FF`, text `#7C3AED`, border `#DDD6FE`

---

## 8. Intel Cards — Adapted from Klue's Battlecard Framework

### What Klue Does
- Automated crawlers monitor competitor touchpoints, surface changes as a feed
- Human curator reviews and approves signals before they enter battlecards
- Fixed template per competitor — living document updated as signals come in
- Push via Slack/Salesforce/CRM when a card updates
- Not query-driven — browse and push model

### What We Borrowed
**COMP-ACT Framework:**
- **Comparison** — the fact, us vs them
- **Action** — what to do with this intel (specific, not vague)

**Three content must-haves (from Klue's guide):**
1. **Context** — never in isolation, always against Scapia
2. **Charge** — every fact must carry positive or negative sentiment, never neutral
3. **Specificity + Proof** — no vague claims, always backed by evidence or example

**Card types worth borrowing:** Where We Win · Where They're Ahead · Feature Comparison

**Card types that don't apply to Scapia:** Objection Handling · Quick Dismiss · Trap Setting Questions (all sales-oriented, not strategic)

### What We Built — Intel Card Templates

**Competitor Intel Card** (one per competitor)
```
Header: Name · "Competitor" badge · Stats chips (3 key metrics)
─────────────────────────────────────────────────────
WHERE CALIBRE WINS (green)
  Point (headline, 13 words max)
  [expandable] Context — why this matters to the user
  [expandable] Action → specific what-to-do

WHERE THEY'RE AHEAD (red)
  Point (headline, 13 words max)
  [expandable] Context — why this is a real gap
  [expandable] Action → how to address or reframe

CALIBRE IMPLICATION (dark black card)
  → Imperative bullet
  → Imperative bullet
  → Imperative bullet

RECENT MOVES (dated events)
```

**Regulatory Intel Card** (one per regulation)
```
Header: Regulation name · "Regulatory" badge · Status chip · Effective date
─────────────────────────────────────────────────────
WHAT IT SAYS (blue)
  Bullet list of requirements

CURRENT POSTURE
  One paragraph — what Scapia is doing today

OPEN QUESTIONS (amber)
  Flagged questions requiring resolution

SIGN-OFF REQUIRED (red)
  Who needs to approve: Federal Bank / Internal Legal / Both
```

### Proposed Card Types for Scapia v1

| Type | Decisions It Informs |
|------|---------------------|
| Competitor | Positioning, product roadmap |
| Regulatory | Compliance, legal sign-off |
| Partner & Ecosystem | Partnership strategy, distribution |
| Category Signal | Macro positioning, timing |
| Customer *(new, missing from prototype)* | Product features, acquisition messaging |

**Customer cards** — the missing dimension. Track: what cardholders say on Reddit/Twitter/App Store reviews, switching signals, sentiment trends on specific features. Klue does this with G2/Capterra. For Scapia: Reddit threads, App Store reviews, Twitter complaints about Axis Atlas, HDFC, CRED.

---

## 8b. Intel Cards — Closed Loop Architecture (Updated)

### The Problem with the Original Intel Cards

`IntelCardsPage.jsx` originally imported from a hardcoded `intelCards.js` file. The Intel Card content was completely independent of the wiki. If a new source updated an entity's wiki page (new pricing, new feature, new signal), the Intel Card remained unchanged. The two surfaces could drift arbitrarily. This was "Klue clone" behaviour — maintaining intel in two separate stores.

### The Closed Loop

The redesigned architecture has one source of truth — the entity wiki page — and all surfaces render from it:

```
raw source
    ↓ ingest (step 5 in CLAUDE.md workflow)
entity wiki page
├── Commercial / Engineering / Product views  ← perspective knowledge
├── Synthesis                                 ← cross-perspective summary
└── ## Implications for Calibre               ← decision layer
         ↑ written at ingest time, mandatory
         ↓ parsed live by IntelCardsPage
         ↓ rendered as Intel Card
         ↓ also visible in wiki page slide-in
         ↓ always pulled into Query answers
```

### The `## Implications for Calibre` Section

Mandatory section on every entity page. Written at ingest time (step 5 of the ingest workflow in CLAUDE.md). Never deferred to query time. Structure:

```markdown
## Implications for Calibre

**Decision this informs:** Pricing · Positioning

### Where Calibre Wins

**[Point headline — max 12 words]**
[Context — 2-3 sentences, source-backed]
→ Action: [Specific imperative action]

### Where They're Ahead

**[Point headline]**
[Context — honest about the gap]
→ Action: [How Calibre responds]

### Calibre Implication
→ [Imperative action — verb-first]
→ [Imperative action]

### Recent Moves
- [Date]: [Event description]
```

**Parse anchors are strict and non-negotiable:**
- `**bold**` on its own line = new win/loss item point
- `→ Action:` prefix = the action for that item
- `→ ` prefix (without "Action:") = Calibre Implication bullet
- `- Date: Event` = Recent Moves line

The frontend `parseImplications()` function splits on these exact anchors. Format drift breaks the parser. CLAUDE.md mandates this format for all future ingests.

### Frontend Architecture

**`IntelCardsPage.jsx`** — now a live wiki reader, not a hardcoded import:
1. Fetches `/api/pages` → gets entity slug list
2. For each entity: fetches `/api/page?path=entities/<slug>` → gets full markdown content
3. Calls `parseImplications(content)` → extracts the `## Implications for Calibre` section
4. Calls `parseVitals(meta.vitals)` → extracts vitals from frontmatter (same data as wiki browser card)
5. Passes parsed data to `IntelCard` component
6. Falls back gracefully if a page has no Implications section yet

**`IntelCard.jsx` — competitor card header** updated:
- `vitals` array (from frontmatter) replaces hardcoded `stats` strings
- Each vital rendered as dark chip: bold `value` + smaller `note` + uppercase `label` — consistent with wiki browser card design
- `decision` field shown under competitor name ("Informs: Pricing · Positioning")
- Falls back to plain `stats` strings if no vitals available

### What This Means Operationally

When a new source is ingested about a competitor:
- LLM updates the entity wiki page (perspective section + synthesis)
- LLM writes/updates the `## Implications for Calibre` section (mandatory, step 5)
- LLM distills `headline`, `signal`, `vitals` into frontmatter (mandatory, step 8)
- On next page load, Intel Card shows the updated content automatically
- Wiki browser card chips show the updated vitals automatically
- No manual Intel Card maintenance, no data drift

### The Four-Surface Map (Complete)

| Surface | What it renders | Data source | Update trigger |
|---|---|---|---|
| **Vitals (wiki browser card)** | `signal` border · `headline` · `vitals` chips | `page.meta` (frontmatter) | Every ingest via distill sub-step |
| **Intel Card** | `## Implications for Calibre` section | `page.content` (body) | Every ingest that updates the implications section |
| **Wiki Page (slide-in)** | Full page — all sections including Implications | `page.content` (body) | Every ingest |
| **Query answer** | Brief format — always pulls Calibre Implication | All wiki pages read at query time | Every ingest |

One write. Four renders. Zero duplication.

---

## 9. Key Insights from Anil's CLAUDE.md

Anil had already built a version of this system for Scapia before this prototype. His schema has several patterns we should carry directly into v1:

### Source Summary Pages as First-Class Citizens
Every ingested source gets its own `wiki/sources/<slug>.md` page — not just a footnote. Sources are pages in the wiki, searchable, cross-linked.

```yaml
---
type: source-summary
source_file: raw/2026-05-02-livemint-atlas-devaluation.md
source_title: "Axis Atlas devalues miles, again"
source_date: 2026-04-28
ingested: 2026-05-02
touches: [entities/axis-atlas, concepts/reward-devaluations, scapia]
---
```

### Scapia.md — The Reference Baseline
A dedicated `wiki/scapia.md` page defining Scapia's own positioning, products, and strategy. This is what every other page is measured against. "How does this affect Scapia's positioning?" has no answer without a fixed reference point for Scapia itself.

### Concept Pages
`wiki/concepts/` — topical pages for shared mechanics: FX markup, rewards economics, credit-on-UPI mechanics, MDR. Prevents the same concept being re-explained on every entity page. Entities link to concepts; concepts don't duplicate entity content.

### Comparison Pages
`wiki/comparisons/` — dedicated head-to-head comparisons (Axis Atlas vs Scapia, OneCard vs Scapia). More specific than synthesis pages. One comparison per pair, offered and filed on demand.

### Discuss Before Filing
Anil's ingest flow includes a human discussion step before pages are written:
1. Read source end-to-end
2. **Discuss key takeaways with user in 3–6 bullets** — what's new, what's surprising, what touches Scapia
3. Wait for direction unless user said "ingest autonomously"
4. Then create/update pages

This step catches misreadings and adds context the LLM can't know. Don't skip it.

### User Verbal Context as a Source
When a user tells the system something in chat (e.g. "Federal Bank told us informally that..."), capture it as a dated raw file: `raw/2026-05-25-user-context-federal-bank.md`. Cite it like any other source. This is how conversational knowledge gets compounded.

### Graduation Criteria
At ~50 sources / ~200 pages, `index.md` may stop being sufficient as the navigation layer. At that point consider `qmd` or similar local search tooling. Don't add infra before then.

### Source Credibility Hierarchy (Anil's exact framing)
> "Marketing pages lie. T&C pages are truth. Glassdoor reviews are noise. Regulator filings are signal."

---

## 10. The Four Gaps and How v1 Fixes Them

### GAP 1 — The Scapia Decision-Lens Is Missing

**The Problem:**
- Entity pages in the prototype are competitor-centric — they describe what a competitor is doing, not what Scapia should do about it
- The "For Calibre" implication card only exists at query time (synthesis output) — not at ingest time when the entity page is written
- A page that doesn't help Anil decide something — pricing, positioning, partnership, roadmap — shouldn't exist

**What We Partially Have:**
The query-time implication layer exists — every synthesis output ends with a "For Calibre" dark card with imperative bullets. This is real and works. But it's downstream: the implication is generated at query time, not baked into the underlying entity page.

**How v1 Fixes It:**
- `## Implications for Scapia` becomes a mandatory section on every entity page at ingest time
- The section must answer: what decision does this inform? (pricing / positioning / partnership / roadmap)
- A page cannot be filed without this section — enforced in the schema
- Both layers coexist: entity-level implication at ingest + synthesised implication at query time

---

### GAP 2 — "Compliance Is Binary" Is Wrong for an Indian Fintech

**The Problem:**
- The prototype treats regulatory intelligence as binary: Confirmed / Disputed / Unverified
- RBI circulars, co-brand rules, DLG guidelines are ambiguous, evolving, and interpretation-dependent by design — that's why banks staff legal teams
- "Disputed" means two sources conflict. RBI ambiguity is not a source conflict — it's genuine interpretive uncertainty the model has no vocabulary for
- A curator cannot and should not resolve RBI interpretation — that belongs to legal/compliance
- For a Federal Bank-partnered regulated entity, a confidently-wrong regulatory answer is the most expensive failure the system can produce

**How v1 Fixes It:**

Replace the binary verdict model with a posture model:

New status vocabulary: `Active · Under Review · Escalated · Superseded`

New mandatory fields on every regulatory page:
```
What it says:       [direct quote or paraphrase of the circular]
Current posture:    [what Scapia is doing today based on this]
Open questions:     [what is still ambiguous or unresolved]
Sign-off required:  [Federal Bank / Internal Legal / Both]
Status:             Active / Under Review / Escalated / Superseded
```

New hard rule in the schema: **curators file and summarise, they never conclude on interpretation.** Any interpretation call routes to legal/compliance automatically. The system's job on regulatory is to surface and route — not to resolve.

---

### GAP 4 — Citation and Hallucination Discipline Is Missing

**The Problem:**
- Citations only exist at query time — the AnswerCard shows source pills at the bottom
- At ingest time, when the LLM writes an entity page, there is zero enforcement
- The LLM can synthesise a claim that no source supports and write it as fact
- That unsourced claim sits in the wiki, gets picked up by future queries, cited as real intelligence
- There is no "unsourced" state — a claim either exists or it doesn't
- Conflicts between sources are silently overwritten

**How v1 Fixes It (directly from Anil's schema):**

Every sentence-level claim must carry an inline footnote at write time:
```
… no FX markup on international spend [^atlas-tnc-2026].

[^atlas-tnc-2026]: Axis Atlas T&C, accessed 2026-05-02 — raw/2026-05-02-axis-atlas-tnc.pdf
```

If the LLM cannot point to a source in `raw/`:
```
> ⚠ Unsourced — needs verification.
```

If a new source contradicts an existing claim:
```
> ⚠ Conflict: [Source A] states X. [Source B] states Y. Not resolved — flagged for curator.
```

Web / general LLM knowledge is only allowed as explicitly marked background:
```
> Background (no source in raw/): …
```

Every ingested source gets its own `wiki/sources/<slug>.md` — sources are first-class pages, not just footnotes.

**The core shift: citation discipline moves from the output layer to the write layer.**

---

### GAP 6 — The System Is Pull-Only

**The Problem:**
- The entire system is pull-only — a user has to remember to open it and ask a question
- The crawler generates change events but files them silently — no one is notified
- A system that requires the user to initiate every interaction gets opened once and forgotten
- For a CEO, the highest-value moment is not "I wonder what's happening" — it's "something just changed and here's why it matters to Scapia"

**How v1 Fixes It:**

Material-change detection → Scapia-implication → notify pipeline:
- When a significant change is detected (competitor pricing move, RBI circular, reward devaluation), the system generates a brief in the existing Brief format and pushes it
- The alert is not "Axis Atlas devalued miles" — it is "Axis Atlas devalued miles 30%, here's why that matters to Scapia's positioning right now"
- Push to the app first (not Slack) — see design decision below

**Design decision: App-first, not everywhere-distribution**
Klue distributes to Slack, Salesforce, CRM. Scapia v1 should not. Reasons:
- Scapia's users are 2–3 strategic decision-makers, not a 50-person sales floor
- Slack notifications become noise fast — people mute them
- Intelligence without context lands poorly in a chat message
- The structured Intel Card experience cannot be replicated in a notification
- One well-crafted push alert links back to the app — it doesn't try to replace it

**What to design after Karthik and Rathina inputs:**
- The push layer's exact trigger threshold (what counts as "material change")
- The homepage structure — what surfaces first when you open the app
- Whether the Intel Cards or the query interface is the primary landing surface
- Cadence: real-time alerts vs daily digest vs weekly brief

---

## 11. Additional Gaps (briefly — not in the 4 you specified)

**Gap 3 — No MVP, no phasing:**
The prototype document listed: browser extension, org-wide contributor funnel, automated crawler, Maker-Checker pipeline, eval framework, vector DB, hybrid search, graph traversal. That is a multi-quarter build. Phase 1 = harden what already works (ingest + Scapia framing + query). Everything else earns its way in.

**Gap 5 — Filter doesn't score credibility:**
See the credibility tier system described in Section 5 above (T1–T4).

**Gap 7 — The input model contradicts the thesis:**
The prototype argues maintenance fails because humans get busy — then puts the entire sourcing burden on humans. The honest framing: the LLM compounds and maintains; humans still have to feed it. The incentive model answers itself once the push layer works — a PM who receives a useful alert will start feeding the system.

**Gap 8 — Maker-Checker independence is overstated:**
If Maker and Checker are the same model on the same rubric, agreement signals consistency, not truth. They share blind spots. For v1: use an adversarial Checker prompt or a different temperature/model variant to get genuine independence.

---

## 12. The Three-Role User Model

| Role | Who | What they do | Time |
|------|-----|--------------|------|
| Contributor | Whole org (Phase 2) | Submit signals encountered in daily work | 45 seconds per submission |
| Curator | One designated reviewer | Review, approve, resolve contradictions, direct gaps | 30–60 mins/week |
| Querier | Leaders (Anil, Karthik, Rathina) | Ask questions, act on answers | As needed |

**For Phase 1:** Skip org-wide contribution. Curator + crawler. One disciplined curator feeding the system is infinitely more sustainable than ten PMs who contribute twice and stop. Org-wide contribution is Phase 2 — after the output is valuable enough that people want to contribute because they see what comes back.

---

## 13. Scapia's Competitive Landscape — What to Track in v1

### Direct Travel Cards
Axis Atlas · HDFC Diners Black/Regalia · ICICI Emeralde · SBI Elite · AmEx Platinum Travel

### New-Age / Co-brand Cards
OneCard · Uni · Slice · Kiwi · Jupiter Edge · Fi-Federal · Niyo Global

### UPI / Credit-on-UPI
CRED · PhonePe · Google Pay · Paytm · Slice UPI · Jupiter

### Travel Platforms
MakeMyTrip / goibibo / redBus (HDFC SmartBUY partner) · ixigo / ConfirmTkt / AbhiBus · EaseMyTrip · Yatra · Cleartrip · IndiGo · Air India

### Going-Out / Lifestyle (Scapia's planned product line)
Eternal (Zomato, Blinkit, District) · BookMyShow · Paytm Insider · Dineout

### Issuer Banks & Partners
Federal Bank · Axis · HDFC · ICICI · SBI · RBL · IndusInd

### Regulators & Ecosystem
RBI (credit-on-UPI circulars, co-brand card rules) · NPCI · Visa · Mastercard · RuPay · DPDP Act · DLG guidelines

---

## 14. What to Build in Phase 1 vs Defer

### Phase 1 — Harden What Works
- Core schema (CLAUDE.md) — updated for Scapia with all gap fixes applied
- `scapia.md` reference baseline
- Entity pages with mandatory `## Implications for Scapia` section
- Regulatory pages with posture model (Active / Under Review / Escalated / Superseded)
- Source summary pages (`wiki/sources/`) — every source gets its own page
- Concept pages (`wiki/concepts/`) — shared vocabulary across entities
- Comparison pages (`wiki/comparisons/`) — head-to-head on demand
- Citation discipline (inline footnotes, ⚠ Unsourced, ⚠ Conflict) — enforced at write time
- Credibility tier in the filter (T1–T4)
- Intel Cards — Competitor + Regulatory templates (Partner, Category Signal, Customer as Phase 1b)
- Discuss-before-filing step in ingest workflow
- Curator + crawler feeding the system

### Defer to Phase 2
- Org-wide contribution + browser extension
- Slack / CRM distribution
- Vector DB + hybrid search
- Graph traversal at query time
- Automated push alert pipeline (design after Karthik + Rathina inputs)
- Homepage redesign (design after Karthik + Rathina inputs)
- Evaluation framework for filter quality
- Split lint (structural daily + semantic weekly)

---

## 15. Key Design Decisions Made in This Session

1. **LLM as bookkeeper, not sourcer** — the LLM maintains the wiki; humans still feed it. Don't promise otherwise.

2. **Three-layer immutability** — raw never edited, wiki entirely LLM-owned, schema is the control layer.

3. **Query interface stays unified** — don't bifurcate queries into regulatory/competitive/customer. Leaders don't think in categories when they need intelligence. The Brief format handles bifurcation in the output.

4. **Intel Cards are a browse layer, not the query layer** — cards are pre-structured, always-current snapshots. The query interface is for cross-cutting questions that cards can't answer.

5. **App-first distribution** — no Slack integration in Phase 1. A focused app that people open for a reason beats noise in Slack that people mute.

6. **Customer landscape is a missing fourth Intel Card type** — not regulatory, not competitive, not partner. Track what cardholders actually say (Reddit, App Store reviews, switching signals). Build this.

7. **Discuss before filing** — the ingest workflow always includes a human conversation step before pages are written. Don't skip it even under pressure.

8. **Wait on UI design until Karthik + Rathina** — homepage structure, wiki browser layout, push layer design, what surfaces first — all depend on what those users actually want to see. Don't guess.

9. **Intelligence is not a Klue clone** — Klue surfaces what competitors are doing. This system answers what Scapia should do about it. The mandatory Scapia implication section is what makes it an asset rather than a feed.

10. **The incentive model answers itself** — don't solve org-wide contribution before the output is valuable enough that people want to contribute. Build the output first.

11. **Wiki browser cards must scream numbers, not describe pages** — the original entity cards were visually present but content-free. Every card looked the same. The redesign puts the signal border, the number chips, and the editorial headline on the card face. A user should be able to scan 10 cards in 5 seconds and know which competitors matter today.

12. **Distilled surface fields live in frontmatter, not in a separate data layer** — `headline`, `signal`, `vitals` are frontmatter fields on the entity page, not a separate database or config file. The wiki page is the single source of truth. The card renders from `page.meta`. This keeps the loop closed: ingest updates the page body → distill updates the frontmatter → API passes it through → card reflects it.

13. **Signal vocabulary must be from Calibre's lens, not the competitor's health** — `positive/negative` from the competitor's own perspective is ambiguous and misleading. HealthifyMe "positive" feels like good news; it is not. `threat/opportunity/watch` from Calibre's strategic perspective is unambiguous and immediately actionable. Every badge on every card answers the same question: what does this mean for Calibre?

14. **The server's frontmatter parser is a constraint to respect, not a bug to fix** — `parse_frontmatter()` in `server.py` does simple line-by-line key:value parsing. Vitals use pipe-delimited strings specifically because of this constraint. Before upgrading to nested YAML, upgrade the parser to `yaml.safe_load()` first — otherwise the format change silently breaks the data flow.

15. **Intel Cards must read from the wiki, not from a hardcoded file** — the original `intelCards.js` was a separate editorial document. It drifted from the wiki the moment any page was updated. The fix: `IntelCardsPage.jsx` fetches entity pages live via the API and parses the `## Implications for Calibre` section. The Intel Card is now a renderer, not a store. When the wiki updates, the card updates automatically. This is the same closed-loop principle as vitals: write once at ingest, render everywhere.

16. **Extend the card design language to Regulatory and Events — don't maintain two visual systems** — once the EntityCard redesign was locked, the Regulatory and Events cards were immediately updated to match: left border, dark chips, badge, 3-column grid. Using the same structural pattern across all three card types makes the wiki browser feel like one coherent product. The key insight: Regulatory cards borrow the signal-colour system for compliance_status; Event cards borrow the entity-colour system to create a visual link back to the parent competitor. Neither tab required schema changes — all the data already existed in frontmatter.

---

## 17. Wiki Browser Entity Card Redesign — Full Story

### The Problem with the Original Cards

The original `EntityCard` in `WikiBrowserPage.jsx` showed a 140px illustration zone (coloured initials avatar + perspective badges) and a small body with just the entity name and sources count. Every card looked the same. Opening the entities tab told you nothing about any competitor without clicking into each one individually. The cards were navigation elements, not intelligence surfaces.

### The Workflow Decision

Two possible approaches for surfacing numbers on cards:

**Option A — Body section** (`## Vitals` in the markdown body): Human-readable, but requires a custom parser on the frontend and is fragile to format drift.

**Option B — Frontmatter extension** (chosen): Add structured fields to the YAML frontmatter. The server already parses all frontmatter and passes it through as `page.meta`. The frontend reads `page.meta.headline`, `page.meta.signal`, `page.meta.vitals` with zero new parsing infrastructure.

Frontmatter is the right layer because it creates a clean contract: **frontmatter = what the card surface needs, body = what the slide-in panel shows.** These are already two separate UI states.

### The Three Distilled Fields

| Field | Type | Written by | Purpose on card |
|---|---|---|---|
| `headline` | string, 8–14 words | LLM at ingest (distill sub-step) | Editorial insight that earns the click — italic, muted, secondary to numbers |
| `signal` | `threat` / `opportunity` / `watch` | LLM at ingest (distill sub-step) | Calibre-lens verdict — coloured left border + badge |
| `vitals` | pipe-delimited list | LLM at ingest (distill sub-step) | 1–3 key numbers — dark chips, large value, small note and label |

**Vitals pipe format:** `"value|label|note"` — e.g. `"$80/yr|Annual price|+60% Mar 2023"`. Pipe chosen because the server's simple list parser splits by comma, making commas unsafe inside list items. Pipe never naturally appears in a metric value or label.

### The Signal Vocabulary Decision

Early version: `positive / negative / watch` from the competitor's own perspective.

**Problem:** HealthifyMe is `positive` (they're executing well and funded for US expansion). But from Calibre's perspective this is bad news — they're a direct threat to Calibre's core photo-tracking feature. A `positive` badge felt like good news. It was not.

The root issue: **the user's question when scanning entity cards is not "how is this competitor doing?" — it is "what does this mean for Calibre?"**

Final vocabulary: `threat / opportunity / watch` from Calibre's strategic lens.
- `threat` — competitor executing well, poses direct competitive pressure → red `#DC2626`
- `opportunity` — competitor weakening, space opening for Calibre → green `#16A34A`
- `watch` — unclear direction, monitor → amber `#D97706`

This maps cleanly to the signal border colour on the card: you scan the grid and red/green/amber tells you the strategic picture before you read a word.

### The Distill Sub-Step

After every entity page write (create or update), the LLM re-reads the full updated page and synthesises `headline`, `signal`, `vitals` from the body content. Updates frontmatter. This is mandatory — baked into the ingest workflow in CLAUDE.md.

**Key property:** The three fields always reflect the *current state of the entire page*, not just the latest source. If a second ingest adds a Commercial view that changes the overall picture, the distill step re-synthesises all three fields from the combined content.

**Backfill:** For existing pages at the time this pattern was introduced, a one-time manual distill pass wrote the fields from existing body content. Going forward, ingest handles it automatically.

### Grid Layout

Entity cards use `repeat(3, 1fr)` — fixed 3 columns. Not `auto-fill`. This guarantees enough card width for 3 vitals chips without truncation at any typical desktop viewport. Other wiki browser tabs (Regulatory, Events, Synthesis, Lenses) retain `auto-fill minmax(220px, 1fr)` since their cards have simpler content.

### Extension to Regulatory and Events Tabs

Once the EntityCard redesign was shipped, the design language was immediately extended to the other two data tabs — Regulatory and Events. The approach for each:

**Regulatory cards:** The `compliance_status` field already carried exactly the signal-colour semantics needed. `Confirmed` = green, `Disputed` = red, `Unverified` = amber — the same palette as `threat/opportunity/watch` on entity cards. The left border, badge, and dark chips all map directly from status. Zero schema changes required.

**Event cards:** Events don't have a signal field, but they have an `entity` field — the competitor they belong to. The entity's colour (from `entityColor(entitySlug)`) serves as the visual identity anchor. An MFP event is the same orange as the MFP entity card border. The entity name chip renders in that colour. The visual connection between event and competitor is immediate.

**Lenses tab:** No card changes needed. The LensFilteredView already used `EntityCard`. The only change was the grid width (`repeat(3, 1fr)`) to match the Entities tab. Lenses → filter → EntityCard naturally inherits the new design.

**Grid alignment:** All three content tabs (Entities, Regulatory, Events) now use `repeat(3, 1fr)`. This was also the fix for chip truncation on the Entities tab — a narrower `auto-fill` grid produced cards too small for the chip values to render without ellipsis.

### Calibre Prototype State After This Session

All 5 entity pages (`myfitnesspal`, `cronometer`, `loseit`, `healthifyme`, `fitbod`) have been backfilled with:
- `headline` — sourced from body content, editorial synthesis
- `signal` — Calibre-lens verdict
- `vitals` — real numbers from source-backed claims in the page body

All four wiki browser tabs (Entities, Regulatory, Events, Lenses) now use the same card design language: left status/signal/entity-colour border, dark chips, badge, 3-column grid. The wiki browser reads as a unified intelligence surface, not four separate list views.

---

## 18. UI Decisions from the Calibre Prototype Session

These decisions were made iteratively during the prototype build and are not derivable from the code alone. Carry them into Scapia v1 without re-litigating them.

---

### Intel Cards — Collapsible Right Sidebar

**Why:** The original horizontal competitor selector bar sat above the card and consumed ~80px of vertical space, forcing the card content below the fold. Noise level was high — a row of pills always visible even when irrelevant.

**Decision:** Replace horizontal selector with a collapsible right sidebar. Saves vertical space, reduces visual noise, keeps the selector accessible without it dominating the layout.

**Implementation details:**
- Sidebar width: `148px` open · `42px` collapsed (collapsed width must be ≥ 35px to avoid clipping the toggle button — button is `left: 7px` + `width: 28px = 35px`)
- Toggle button: circular (`borderRadius: '50%'`), `28×28px`, background `#ce3e00`, `position: absolute`, `top: 12px left: 7px`, icon `›` / `‹` at `1rem`
- Hover: darkens to `#b83600`, triggers fixed-position tooltip
- Transition: `width 0.18s ease` on the sidebar container

**Overflow clipping problem and fix:** The sidebar uses `overflow: hidden` for the width animation. CSS `::after` tooltips on the toggle button get clipped by this. Fix: render the tooltip as a React fixed-position `div` at the page root, not as a CSS pseudo-element. Use `getBoundingClientRect()` on `mouseEnter` to position it. Set `pointerEvents: 'none'` so it doesn't interfere with mouse events.

```jsx
// Tooltip rendered at page root level — outside overflow:hidden sidebar
{tooltipVisible && (
  <div style={{
    position: 'fixed', left: tooltipPos.x, top: tooltipPos.y,
    transform: 'translate(-100%, -140%)',
    backgroundColor: '#ce3e00', color: '#fff',
    padding: '4px 10px', borderRadius: '5px',
    fontSize: '0.68rem', fontWeight: 500,
    whiteSpace: 'nowrap', zIndex: 9999, pointerEvents: 'none',
  }}>
    {sidebarOpen ? 'Hide competitor list' : 'Show competitor list'}
  </div>
)}
```

**Competitor grouping:** Pills are grouped by signal (`threat → watch → opportunity`). Groups are separated by a `2px solid #111` divider. This lets a user immediately see which competitors are threats vs opportunities without reading individual labels.

**VerticalPill component:**
- Active: `backgroundColor: '#111'`, text white
- Inactive: `backgroundColor: 'transparent'`, text `#111`
- Hover (inactive only): `#F3F4F6` via `onMouseEnter`/`onMouseLeave` — not CSS `:hover` since the element is inside `overflow: hidden`
- 3px signal-colour absolute left border (same palette as entity card signal border)
- `borderRadius: 0` — pills have no rounding, consistent with the dark chip language

**Scrollbar:** Hidden in the sidebar competitor list using `.no-scrollbar` utility class. Scroll still works — just no visible track.

---

### WikiPagePanel — Wikilink Pills and In-Panel Navigation

**Why:** ReactMarkdown renders `[[wikilink]]` syntax as raw text. Without custom handling, internal wiki references are invisible to the user — they read as `[[entities/myfitnesspal]]` literally.

**Decision:** Parse `[[path]]` patterns within ReactMarkdown output and render them as clickable beige pills. Clicking a pill navigates within the panel itself (not a new browser tab, not a page transition) — the panel becomes a mini wiki browser with back-navigation.

**WikiPill design:**
```
bg: #F5EDD6 · text: #7C5C1E · border: #E0C97A · borderRadius: 999px
padding: 1px 9px · fontSize: 0.85em · fontWeight: 600
```
Display name derived from path: `path.split('/').pop().replace(/-/g, ' ')` — so `entities/myfitnesspal` renders as `myfitnesspal`.

**Implementation:**
- `WIKI_REGEX = /\[\[([^\]]+)\]\]/g` — matches wikilink syntax
- `renderTextWithWikilinks(text, onOpen)` — splits a text string on wikilink matches, returns mixed string/ReactElement array
- `processChildren(children, onOpen)` — walks React children tree recursively, applies `renderTextWithWikilinks` to string nodes
- Custom ReactMarkdown `components` prop wires `processChildren` into: `p`, `li`, `td`, `th`, `h1`, `h2`, `h3`, `strong`
- `navStack` state array + `openPath` state: clicking a pill pushes current path to stack, opens link. Back button pops stack.
- Back button only visible when `navStack.length > 0`
- External `path` prop change resets both `openPath` and `navStack`

**Important:** `WIKI_REGEX` must be re-instantiated per call with `new RegExp(WIKI_REGEX.source, 'g')` inside `renderTextWithWikilinks` — reusing a stateful regex instance causes `lastIndex` carry-over bugs.

---

### Intel Card Header — Vitals Placement

**Why:** Original layout had vitals chips below the entity name, making the header tall and pushing the win/loss grid down. The name and vitals are logically complementary — name answers "who", vitals answer "how big/strong".

**Decision:** Move vitals to the right side of the header, aligned to top-right. Title enlarged. This matches the visual language of a scorecard — identity on the left, numbers on the right.

**Header layout:**
```
┌─────────────────────────────────────────────────────────┐
│  [Entity Name — 2rem 800wt]  [SIGNAL badge]             │  ← left
│  Informs: Pricing · Positioning                         │
│                                          [vital] [vital] │  ← right, flex-shrink: 0
└─────────────────────────────────────────────────────────┘
```

- Title: `fontSize: '2rem'`, `fontWeight: '800'`, `letterSpacing: '-0.03em'`
- Signal badge inline with title (same row, `flexWrap: 'wrap'` for narrow viewports)
- Vitals container: `flexShrink: 0`, `justifyContent: 'flex-end'`, `flexWrap: 'wrap'`
- Each vital chip: `backgroundColor: '#111'`, `borderRadius: 0`, `padding: '7px 12px'`
  - `value` — `1rem` bold white
  - `note` — `0.62rem` `#9CA3AF`
  - `label` — `0.56rem` uppercase `#6B7280`

---

### Wiki Browser — Regulatory and Event Card Type Labels

**Why:** The EntityCard had no explicit type label (competitor was implied by context). After redesigning Regulatory and Event cards to use the same structural language as EntityCard, the tabs look visually similar. A type label in the top-left disambiguates at a glance without adding weight.

**Decision:** Add a small grey uppercase type label at the top of Regulatory and Event cards, mirroring each other exactly.

```jsx
<div className="mb-3">
  <span style={{
    fontSize: '10px', fontWeight: 700, color: '#BBBBBB',
    letterSpacing: '0.07em', textTransform: 'uppercase',
  }}>
    Regulatory  {/* or: Event */}
  </span>
</div>
```

**Regulatory card chip sizing:** Both chips (`Effective Date` + `Compliance`) use `flex-1` so they stretch to fill the full card row width — matching the Event card chip layout exactly. Sizes: value `15px` bold · label `9px` uppercase · padding `11px 12px`. The compliance chip value renders in its status colour (not white) — the status word is the most meaningful data on a regulatory card.

**Regulatory card — removed redundant badge:** The original design showed compliance status both as a coloured pill badge (top-right) and as a chip value. This was redundant. The badge was removed; the chip (with coloured value text) is the only compliance indicator. This matches the Event card pattern, which never had a badge.

---

## 19. Scapia v1 — Locked Structural Decisions

All decisions in this section were explicitly discussed and locked before starting the v1 build. Do not re-litigate them in a new session. Read this section before touching CLAUDE.md or any frontend file.

---

### Why the structure changes from Calibre

Calibre competed in one domain — fitness apps. A flat entity list with three generic perspective sections (Product / Engineering / Commercial) worked fine.

Scapia operates across **two major domains** (Fintech + Travel) with Travel further split into **7 sub-verticals** (Flights · Stays · Trains · Buses · Visas · Experiences · Store). A move by Axis Atlas (devaluing miles) is simultaneously a Fintech signal (card earn rate comparison) and a Travel signal (redemption value). A flat wiki with no domain awareness would make these signals invisible to the filter and unsortable in the frontend.

The structural additions are **metadata decisions made at ingest** — they add frontmatter fields and classification steps. They do not change how pages are written, how knowledge accumulates, how queries work, or how the system beats RAG. The core LLM-wiki mechanism is untouched.

---

### Decision 1 — Single wiki. No split.

**Rejected:** Separate `fintech-wiki/` and `travel-wiki/` with a master wiki.

**Reason:** Axis Atlas is one competitor. It operates in both Fintech (credit card, earn rates) and Travel (miles, flights redemption). Splitting wikis means Axis Atlas lives in two places — the moment a miles devaluation is ingested, two pages need updating. This recreates the exact drift problem the system was built to eliminate.

**Locked:** One wiki. One `wiki/entities/axis-atlas.md`. Cross-domain signals are a feature of single entity pages, not a problem to separate.

---

### Decision 2 — Flat entity folder. Domain as frontmatter, not directory.

**Rejected:** `wiki/entities/fintech/axis-atlas.md` and `wiki/entities/travel/` subfolders.

**Reason:** MakeMyTrip covers Flights + Stays + Buses. Axis Atlas covers Fintech + Flights. Directory splits would either force entities into one folder (losing multi-domain visibility) or duplicate them (drift). 

**Locked:** `wiki/entities/` stays flat. Domain is a frontmatter tag. The Vault UI folder tree is a **filter view over frontmatter tags**, not a directory mirror.

---

### Decision 3 — Perspective sections renamed for Scapia

**Calibre:** `## Product view` · `## Engineering view` · `## Commercial view`

**Scapia:** `## Fintech view` · `## Travel view`

Within `## Travel view`, populate sub-sections only where source evidence exists:
```markdown
## Travel view

### Flights
...

### Stays
...
```

Entities that are domain-pure don't get the irrelevant section:
- CRED (fintech only) → `## Fintech view` only, no Travel view
- ixigo OTA (travel only) → `## Travel view` only, no Fintech view
- Axis Atlas (both) → both sections

---

### Decision 4 — New frontmatter fields on all pages

Every page gets two new fields in frontmatter:

```yaml
domains: [fintech]                          # one or more of: fintech, travel
travel_categories: [flights, stays]         # only if travel is in domains
page_types: [competitor, event]             # one or more — see Decision 5
```

**`domains`** — which business layer does this page's intelligence affect.
- `fintech` — card product, earn rates, co-brand economics, RBI regulation, NPCI
- `travel` — any of the 7 sub-verticals
- `[fintech, travel]` — both (e.g. Axis Atlas, RBI credit-on-UPI circular)

**`travel_categories`** — which travel sub-verticals. Only populated if `travel` is in `domains`. Values: `flights` · `stays` · `trains` · `buses` · `visas` · `experiences` · `store`

**`page_types`** — see Decision 5. Supports multi-value — a page can carry multiple types and appears in all corresponding filter views in the Vault.

---

### Decision 5 — Seven page types

Replaces Calibre's four types (Entity · Regulatory · Event · Synthesis) with seven:

| Type | What it captures | Scapia examples |
|---|---|---|
| `competitor` | One page per competitor/entity — multi-perspective, additive | Axis Atlas, OneCard, MakeMyTrip, CRED |
| `regulatory` | One conclusion per regulation — RBI, NPCI, DGCA, co-brand rules | RBI co-brand circular, credit-on-UPI rules |
| `event` | Discrete market moments — funding, launch, price change, hire | Axis Atlas miles devaluation, ixigo Series E |
| `partner` | Ecosystem partnerships — Federal Bank, Visa/MC/RuPay, OTA deals | Federal Bank raises credit limits, MMT signs SBI deal |
| `customer` | Voice of customer — App Store reviews, Reddit, Twitter, switching signals | "Mass exodus from Axis Atlas" Reddit thread |
| `market-signal` | Macro trends, category growth, financial health of a space | International travel up 40% YoY, Tier 2 credit card penetration |
| `concept` | Shared mechanics — reference pages, internal use | FX markup, coin redemption economics, MDR, credit-on-UPI |

**Multi-tagging rule:** A page can carry multiple `page_types` values. It appears in every filtered view whose type it carries. Examples:
```
Axis Atlas miles devaluation         → page_types: [event, competitor]
Reddit: users fleeing Axis Atlas     → page_types: [customer, competitor]
RBI reduces MDR on credit cards      → page_types: [regulatory, market-signal]
MakeMyTrip signs SBI Card deal       → page_types: [event, partner]
International travel up 40% YoY     → page_types: [market-signal]
Federal Bank raises Scapia limits    → page_types: [partner]
```

**Synthesis pages** are not a browse type — they remain on-demand only, surfaced in the Intelligence page (past queries), not in the Vault filter tree.

---

### Decision 6 — Ingest decision order (fixed cascade)

At ingest time, the LLM makes decisions in this fixed order. Each step is a dependency for the next.

```
1. Filter check (Maker-Checker)
        ↓ is this worth ingesting at all?

2. Page type
        ↓ what KIND of intelligence is this?
          (competitor / regulatory / event / partner / customer / market-signal / concept)
          Determines page structure — must come before tagging.

3. Domain
        ↓ which business layer does it touch?
          (fintech / travel / both)

4. Travel sub-category
        ↓ which vertical(s) within travel?
          (flights / stays / trains / buses / visas / experiences / store)
          Only runs if travel is in domains — hard dependency on step 3.
```

Page type is decided first because it determines **how the page is structured**, not just where it is tagged. Regulatory pages always have one-conclusion structure regardless of domain. Competitor pages always have multi-perspective structure regardless of domain. Structure must be decided before tagging.

---

### Decision 7 — Implications section renamed for Scapia

Every competitor entity page requires:

```markdown
## Implications for Scapia
```

Not "Calibre". Every Calibre reference in the Implications section template gets replaced with Scapia. The Intel Cards frontend parser reads `## Implications for Scapia` as its anchor — this must match exactly.

---

### Decision 8 — Updated directory structure for Scapia

```
scapia-wiki/
├── CLAUDE.md              ← Scapia schema (rewritten from Calibre CLAUDE.md)
├── wiki/
│   ├── index.md           ← master catalog
│   ├── log.md             ← append-only event log
│   ├── scapia.md          ← Scapia reference baseline (fintech + travel positioning)
│   ├── entities/          ← flat — one page per competitor/partner/entity
│   ├── regulatory/        ← one page per regulation or policy
│   ├── events/            ← one page per discrete market event
│   ├── concepts/          ← shared mechanics (FX markup, coin economics, MDR)
│   ├── comparisons/       ← head-to-head, on demand only
│   └── synthesis/         ← cross-cutting analyses, on demand only
└── raw/
    ├── competitive/
    ├── regulatory/
    └── ambiguous/
```

No `fintech/` or `travel/` subdirectories anywhere. The domain structure lives entirely in frontmatter.

---

### Decision 9 — Frontend page structure

**Home page:** 4 CTA cards. Entry point for all three leader users (Anil, Karthik, Rathina).

| CTA | Page | Purpose |
|---|---|---|
| **Intelligence** | `/intelligence` | Ask questions, get Brief format answers |
| **Vault** | `/vault` | Browse the full wiki — folder-tree filter |
| **Battlecards** | `/battlecards` | Pre-structured Intel Cards (competitor + regulatory) |
| **Sources** | `/sources` | Ingest queue + raw source log |

Plus **Curator** page (`/curator`) — operational tool, not on home page, accessed via sidebar nav.

Total: 5 pages + home.

---

### Decision 10 — Vault sidebar browse order

**UI browse order:** Domain → Sub-category → Page Type

This matches the leader's mental model: "I want to look at Travel → Flights → show me the Entities there." Not the other way around.

```
VAULT
├── All
├── Fintech
│     ├── All
│     ├── Competitors
│     ├── Regulatory
│     ├── Events
│     ├── Partners
│     ├── Customers
│     ├── Market Signals
│     └── Concepts
└── Travel
      ├── All
      ├── Flights
      │     ├── All
      │     ├── Competitors
      │     ├── Regulatory
      │     ├── Events
      │     └── Market Signals
      ├── Stays
      ├── Trains
      ├── Buses
      ├── Visas
      ├── Experiences
      └── Store
```

Each leaf node is a filtered view over `domains` + `travel_categories` + `page_types` frontmatter fields. No actual directories. Multi-tagged pages appear under every node whose tags they carry.

**Ingest order ≠ Browse order:** The ingest cascade (Page Type → Domain → Sub-category) is ordered by structural dependency. The Vault browse order (Domain → Sub-category → Page Type) is ordered by user mental model. Both are correct in their own context.

---

### Decision 11 — Battlecards domain filter

The Battlecards page (renamed from Intel Cards) gets a domain filter tab row:

`All · Fintech · Travel`

Within Travel, a sub-filter for category:
`All · Flights · Stays · Trains · Buses · Visas · Experiences · Store`

Same entity pages, same `## Implications for Scapia` parser — just filtered views.

---

### What did NOT change from Calibre

- Core LLM-wiki mechanism: knowledge compiled at ingest, never re-derived at query time ✅
- Second source enriches existing page, never creates a duplicate ✅
- Maker-Checker filter ✅
- Distill sub-step (headline / signal / vitals in frontmatter) ✅
- Brief format output ✅
- Citation discipline (inline footnotes, ⚠ Unsourced, ⚠ Conflict) ✅
- Discuss-before-filing step ✅
- Source summary pages (`wiki/sources/`) ✅
- Scapia.md reference baseline ✅
- Comparison pages on demand ✅

The structural additions are 2–3 extra frontmatter fields and a slightly wider classification menu at ingest. The system still beats RAG for the same reasons it always did.
