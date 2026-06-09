# Scapia Market Intelligence — Knowledge Transfer

> A complete handover document. Read this if you're picking up the project — either to maintain it, extend it, or hand it to someone else. Written as a single narrative an engineer can read end-to-end.

---

## Table of Contents

1. [The one-paragraph summary](#1-the-one-paragraph-summary)
2. [The problem this solves](#2-the-problem-this-solves)
3. [System at a glance](#3-system-at-a-glance)
4. [Core concepts (read this before the code)](#4-core-concepts-read-this-before-the-code)
5. [Architecture — what runs where](#5-architecture--what-runs-where)
6. [User roles](#6-user-roles)
7. [Every frontend surface — what it does and how it works](#7-every-frontend-surface--what-it-does-and-how-it-works)
8. [The agent layer — how the wiki actually gets written](#8-the-agent-layer--how-the-wiki-actually-gets-written)
9. [The wiki schema — page types and contracts](#9-the-wiki-schema--page-types-and-contracts)
10. [Build history — what we decided and why](#10-build-history--what-we-decided-and-why)
11. [Operational runbook](#11-operational-runbook)
12. [File and code map](#12-file-and-code-map)
13. [Deployment](#13-deployment)
14. [Known issues, deferred items, and gotchas](#14-known-issues-deferred-items-and-gotchas)
15. [Glossary](#15-glossary)

---

## 1. The one-paragraph summary

Scapia Market Intelligence is an LLM-maintained wiki for tracking competitors, regulators, market signals, and partners relevant to **Scapia** — a Federal Bank co-branded travel credit card. Curators feed the system raw sources (Reddit threads, news, filings, internal notes); a Maker-Checker LLM filter scores them; approved sources are written to structured wiki pages by Claude following a strict schema in `CLAUDE.md`. Leaders ask plain-English questions and get back a Brief-format research note grounded in the wiki, citing specific sources inline. The pitch isn't "another note-taking app" — it's that the wiki is **maintained by an LLM, not by humans**, so it stays current without anyone remembering to update it.

---

## 2. The problem this solves

Distilled from `MARKET-INTELLIGENCE-SYSTEM.md`:

Competitive and regulatory intelligence at a fast-moving fintech is **distributed** — across people, Slack threads, half-read PDFs, and one person's memory. When a leader needs it, they ask around or do a quick search. That's not a discipline problem; it's structural. Distributed intelligence has four properties that make it dangerous at scale:

1. **It doesn't persist** beyond the person who holds it.
2. **It isn't shared uniformly** — different people see different fragments.
3. **It degrades silently** — yesterday's insight becomes today's stale assumption.
4. **It requires active effort to retrieve every time.**

The typical attempts to fix this — a Confluence wiki, a Notion doc, a Slack channel pinned with links — all fail the same way: they require humans to do the maintenance. Humans get busy. The maintenance stops. The wiki goes stale within weeks.

This system inverts that: **the LLM does the maintenance.** A human submits a source in 45 seconds; Claude reads it, scores it, integrates it into the relevant wiki pages, updates cross-references, surfaces contradictions. The leader's experience is consistent: ask, get a sourced answer.

---

## 3. System at a glance

Three layers, top to bottom:

```
┌──────────────────────────────────────────────────────────┐
│  INTELLIGENCE (read surface)                              │
│  Leaders ask questions → Claude reads the wiki →          │
│  returns a Brief-format answer with inline citations.     │
│  Past queries live in personal localStorage thread        │
│  history, NOT in the wiki.                                │
└──────────────────────────────────────────────────────────┘
                            ▲
                            │ wiki context (read-only)
                            │
┌──────────────────────────────────────────────────────────┐
│  WIKI (the structured knowledge base — markdown files)    │
│  Outside-world view, written by Claude only.              │
│  • entities/        competitors                           │
│  • regulatory/      circulars, posture, sign-offs         │
│  • events/          discrete market moments               │
│  • partners/        ecosystem partners (Federal Bank…)    │
│  • market-signals/  macro trends                          │
│  • customer/        voice-of-customer (events tagged)     │
│  • concepts/        shared mechanics (FX markup, etc.)    │
│  • comparisons/     head-to-head, on demand               │
│  • sources/         one summary page per ingested source  │
└──────────────────────────────────────────────────────────┘
                            ▲
                            │ filter → ingest workflow → write
                            │
┌──────────────────────────────────────────────────────────┐
│  RAW SOURCES (immutable audit trail — never modified)     │
│  • raw/competitive/  Reddit, news, analyst notes          │
│  • raw/regulatory/   RBI circulars, MeitY notifications   │
│  • raw/market/       industry reports, traffic data       │
│  • raw/ambiguous/    sources spanning multiple treatments │
└──────────────────────────────────────────────────────────┘
                            ▲
                            │ curator submits via Submit form
                            │
                       (the curator)
```

The wiki is the **single source of truth**. Raw sources are the **audit trail**. Queries are the **inside view** (Scapia's strategic interpretation), which deliberately lives outside the wiki so the wiki stays a clean outside-world view.

---

## 4. Core concepts (read this before the code)

### 4.1 The wiki-vs-queries separation

**This is the most important architectural decision in the system.** The wiki is built only from ingested raw sources — it's the outside-world view. Query answers (the Scapia interpretation layer) are stored separately in browser `localStorage`, NOT written back to the wiki.

Why this matters: it prevents the wiki from becoming polluted with exploratory questions and half-formed takes. The wiki stays a clean corpus the agent reasons over; queries stay personal analytical work product. A new query against the wiki always sees the same neutral ground truth.

This separation is enforced in code — `source_type: "synthesis"` on `/api/submit` is explicitly rejected with HTTP 410 Gone. There is no path to write a query answer back into the wiki.

### 4.2 The LLM-as-sole-writer pattern

Per `CLAUDE.md`: **a human never writes a wiki page directly.** The LLM (Claude) is the only writer. Humans curate sources, direct analysis, ask questions. Claude does all the filing, cross-referencing, frontmatter distillation, and schema enforcement.

This is what makes the wiki maintainable. The schema rules in `CLAUDE.md` are followed by the LLM, not by tired humans. The hard contract (mandatory `## Competitor Intel` sections, parse anchors, inline footnotes) is enforced because Claude follows the spec.

### 4.3 The two-stage filter (Maker-Checker)

Every submitted source runs through a filter before pages are written:

- **Maker** scores the source 1–10 on three criteria: relevance, duplication, incremental value
- If Maker scores **8–10** → AUTO-APPROVE → pages are written immediately
- If Maker scores **1–3** → AUTO-REJECT → no pages, raw file kept for audit
- If Maker scores **4–7** → run the **Checker** (adversarial — assumes the source is low-value, tries to refute it)
- Checker outcomes:
  - 8–10 → AUTO-APPROVE (the Checker upgraded the borderline call)
  - 1–3 → AUTO-REJECT (the Checker downgraded it)
  - Both 4–7 within 1–2 pts → Layer 2 (curator reviews)
  - Both 4–7 diverging 3+ pts → Layer 2 (curator reviews)

The Checker is **adversarially prompted** (not just "score independently") — the prompt explicitly tells it to assume low value and try to refute relevance/duplication/incremental-value. This is honest about the limits of same-model agreement (two passes of the same model share blind spots). The adversarial prompting is what makes Checker agreement meaningful.

### 4.4 Page-type schema is a hard contract

`CLAUDE.md` defines mandatory sections for each page type — competitor pages MUST have `## Competitor Intel` with specific sub-headings (`### Where Scapia Wins`, `### Where They're Ahead`, `### Scapia Implication`, `### Recent Moves`). The backend `write_page` enforces this — a write is rejected if anchors are missing.

Why this matters: the Intel Cards UI parses these exact anchors. Schema drift = broken parser. Enforcement at write-time means drift can't happen silently.

### 4.5 Citation discipline (the audit story)

Every factual claim in any wiki page must carry an inline footnote (`[^slug]`) pointing to a file in `raw/`. If the LLM can't source a claim, it must mark it `⚠ Unsourced — needs verification` rather than write it as fact. Conflicting sources get a `⚠ Conflict:` callout naming both sources, never a silent overwrite.

This applies to **every** page type, not just competitor pages. It's the audit story: any claim can be traced back to a raw file in `raw/`.

### 4.6 Wikilinks as the citation primitive

All cross-references between pages use Obsidian-style `[[wikilinks]]`: `[[entities/axis-atlas]]`, `[[regulatory/rbi-cobranding-guidelines-2025]]`, `[[events/cred-pass-fee-may2026]]`.

Rendered as sharp monospace-styled pills with a 5px category dot:
- **ink** dot → entities, partners, events, comparisons
- **orange** dot → regulatory, market-signals
- **muted** dot → concepts, sources

Clicking a pill opens the linked wiki page in a side panel (in-app) or navigates to the Vault (from Intel Cards). One shared component (`WikiPill.jsx`) is used everywhere for consistency.

---

## 5. Architecture — what runs where

### 5.1 Today (local dev)

```
┌──────────────────────────────────┐         ┌──────────────────────────────┐
│  React + Vite (port 5173)         │ ←HTTP→ │  Python http.server          │
│  - 9 page components              │         │  (port 8080)                 │
│  - 8 shared components            │         │  - parses raw/ + wiki/       │
│  - localStorage for read state    │         │  - calls Anthropic via      │
│    + query thread history         │         │    Odyssey gateway          │
└──────────────────────────────────┘         │  - runs Maker-Checker filter│
                                              │  - runs ingest LLM workflow │
                                              └─────────┬────────────────────┘
                                                        │
                                                        ▼
                                              ┌──────────────────────────────┐
                                              │  Filesystem                  │
                                              │  - wiki/   (markdown pages)  │
                                              │  - raw/    (raw sources)     │
                                              │  - state.json (queue + log)  │
                                              └──────────────────────────────┘
                                                        │
                                                        ▼
                                              ┌──────────────────────────────┐
                                              │  Anthropic API via Odyssey   │
                                              │  api.odyssey.scapia.in       │
                                              │  Models:                     │
                                              │    claude-sonnet-4-6 (writes)│
                                              │    claude-haiku-4-5 (filter) │
                                              └──────────────────────────────┘
```

- **Frontend** is a single Vite app at `frontend-react/`, dev server on 5173, builds to `dist/` for production
- **Backend** is `server.py` — a single-file Python `http.server` (no FastAPI yet — that's a future deployment concern, see `DEPLOYMENT-ARCHITECTURE.md`)
- **Storage** is filesystem — markdown files for the wiki, JSON for transient state (queue, health counts, rejection log)
- **LLM** calls go through **Odyssey**, Scapia's internal Anthropic-compatible gateway. Credentials in `.env` at the project root (auto-loaded by `server.py`)

### 5.2 Tomorrow (deployment plan)

See `DEPLOYMENT-ARCHITECTURE.md` and its PDF. Summary:

- Frontend → Vercel
- Backend → Render (or Docker on any Scapia-managed infra — see the Docker discussion in the chat history)
- Wiki + raw → Supabase (Postgres + Storage bucket), mirrored from git
- Agent → Anthropic Python SDK + Claude Agent SDK, with `CLAUDE.md` bundled as system prompt
- Email digest → Resend
- Two roles: leader (read-only) + curator (full access), curator section gated by password
- 16-section plan locked across 25 decisions

The deployment doc is the build plan; this knowledge transfer doc is the current state.

---

## 6. User roles

### 6.1 Curator

The operator. Submits raw sources, reviews Layer 2 cards, watches the queue. Sees every surface in the app. In v1 local dev, no auth — anyone running `npm run dev` is implicitly the curator. In the deployment plan, the curator section is gated by a shared password env var.

**Daily flow:**
1. Spots a relevant signal (Reddit thread, news article, internal note)
2. Goes to Submit, pastes content, sets source type + domain
3. If AUTO-APPROVE → backend writes pages inline (~30–60s) → done
4. If LAYER 2 → goes to Curator page, reviews the borderline card, picks an action (Approve / Reject / Split / Regulatory only)

Expected time per submission: under 60 seconds. The curator doesn't do research or curation — Claude does. The curator just feeds the system.

### 6.2 Leader

The consumer. Asks questions, reads briefs, browses the wiki. Does not submit, does not see the curator surfaces.

**Daily flow:**
1. Opens the homepage
2. Either types a question into the Intelligence input OR clicks a recent query from the preview
3. Gets back a Brief-format answer (~15–30s for new queries)
4. Optionally follows up with a threaded question
5. Optionally browses Vault or Intel Cards for context

Expected time per query: 30 seconds to read the Bottom Line, 60 seconds for the full Brief. Pre-meeting glance.

---

## 7. Every frontend surface — what it does and how it works

The frontend has **9 routes**, each backed by a page component in `frontend-react/src/pages/`. They form 3 functional clusters: **leader surfaces** (home, intelligence, vault, intel cards, sources), **curator surfaces** (curator, submit), and **shared utilities** (wiki browser, battlecards — partially deprecated).

### 7.1 HomePage (`/`)

The landing page. Dark-themed, split into three vertical bands.

**Layout:**
- **Header (black band):** Scapia wordmark, Command Center label, Live indicator
- **Main lit stage (left 70%):** Intelligence hero card, Recent Queries preview (merged into the same card with no gap), Vault + Intel Cards 2-column nav row, OPS pills (Sources + Curator)
- **Feed panel (right 30%):** "What's New" with `LAST 24H` and `UNSEEN EARLIER` sections
- **Footer (black band):** System Pulse stats (Entities Tracked, Sources Indexed, Pending Review, Open Flags)

**Key interactions:**
- **Intelligence input** — typing a question + Enter navigates to `/intelligence?q=<query>`, which auto-submits the question
- **Recent Queries preview rows** — click a row → navigates to `/intelligence?thread=<id>` → opens that thread directly
- **Vault / Intel Cards cards** — navigate to those pages
- **Sources / Curator OPS pills** — navigate to those pages
- **Feed item click** — navigates to `/vault?open=<path>` which auto-opens that wiki page in the WikiPagePanel

**Read state:** the homepage feed shares unread state with VaultPage via `localStorage` key `mi_opened_pages` — orange dots on unread items, same dot logic in both places.

**State sources:**
- `GET /api/feed` → feed items (sources/*.md ingested at timestamps)
- `GET /api/pages` → counts for System Pulse stats
- `localStorage 'mi_query_threads'` → Recent Queries preview list

### 7.2 IntelligencePage (`/intelligence`)

The query surface. Where leaders ask questions and get back Briefs.

**Layout:**
- **Left sidebar (black):** scapia VAULT label, +New Query button, search filter, thread list (most recent first, with delete on hover)
- **Main area (light):** turn-by-turn conversation view (question bubble → AnswerCard, repeats for follow-ups)
- **Input bar (bottom):** typed query + send button
- **Optional right sidebar:** WikiPagePanel when a citation is clicked

**Key interactions:**
- **Submit a question** — POSTs `/api/query` with the question + last 3 turns of thread history; backend assembles wiki context, calls Claude, returns markdown answer
- **Click a thread in sidebar** — loads its turns into the main view
- **Click a wikilink pill in any answer** — opens that wiki page in the right WikiPagePanel
- **× on a thread row** — deletes it from localStorage
- **+New Query** — resets to a fresh empty state (new thread will be created on first submission)

**Thread storage:**
- `localStorage 'mi_query_threads'` — array of `{id, turns: [{question, answer, ts}], createdAt, updatedAt}`
- Max 50 threads, sorted by `updatedAt` desc
- A pending question gets a turn with `answer: null` immediately on submit, so the QueryBubble + loader render before the API returns — replaced with the real answer when it arrives

**Loading state:**
- The `ThinkingBubble` component renders a mini Brief masthead with a climbing timer (0:00, 0:01, …), four timed stages (ASSEMBLING CONTEXT → READING WIKI → SYNTHESIZING SIGNALS → COMPOSING BRIEF), and a tinted footer with `EST. 15–30S`
- Stage transitions are presumptive (backend doesn't emit progress) — driven by elapsed time
- Final stage holds indefinitely on an indeterminate progress strip until the answer returns

**Brief format the agent emits:**
```
> **Bottom Line:** [One sentence. Must directly answer the question. Time-horizon required.]
> As of DD/MM/YY · High|Medium|Low confidence

## Signal · [[folder/slug]] · Lens: Fintech | Travel | Regulatory
**Stat:** [value (vs Scapia)] · [value (vs Scapia)] · [value (vs Scapia)]
[2–3 sentences with inline [[wikilinks]]]
[Optional: ⚠ Counter-signal: <one sentence>]

(Repeat per entity/regulatory topic)

[Optional ```chart``` block — REQUIRED for 3+ comparable numerical values]

## Scapia Implication
- [Verb-first action — owner: <team>, window: <days>, target: <measurable outcome>]
- [2–4 bullets]

**Confidence:** [Level] — [because clause]
**Perspectives:** [list]
[Optional: **Blind spot:** <one sentence>]
```

The AnswerCard parses this exact structure into a styled card (masthead, Bottom Line band, Signal sections with stat strips, dark Implication block, tinted footer with Confidence/Perspectives/Blind Spot).

### 7.3 VaultPage (`/vault`)

The browse surface. Every wiki page rendered as a card, filterable.

**Layout:**
- **Left sidebar (black):** All / Fintech / Travel filters with sub-categories
- **Main area:** filterable card grid, type tabs (All / Competitors / Partners / Regulatory / Events / Market Signals / Concepts / Comparisons)
- **Optional right panel:** WikiPagePanel when a card is clicked

**Key interactions:**
- **Card click** — opens WikiPagePanel side panel with that page's content
- **Type tab** — filters the grid by page type
- **Filter input** — text search across visible cards
- **URL deep-link `?open=<path>`** — auto-opens that page on mount (used by homepage feed clicks)

**Card components:**
- **Competitor card** — entity name + signal chip (OPPORTUNITY / WATCH / ACTIVE THREAT) + domains + headline + date
- **Regulatory card** — name + posture chip (ACTIVE / Under Review / Escalated / Superseded) + effective date + domains
- **Event card** — event name + date + linked entity
- **Partner card** — partner name + relationship type
- **Market Signal card** — title + direction (Tailwind / Headwind / Neutral)

Cards share the same visual language: left coloured rail (semantic color by signal/posture), uppercase type label, headline, status chip, date.

**Read state:** clicking a card adds it to `localStorage 'mi_opened_pages'`. Unopened cards show a small orange dot in the top-right.

### 7.4 IntelCardsPage (`/intel-cards` aka `/battlecards`)

The structured-intelligence surface. Every wiki page that has an Intel section renders as a card with the agent's reasoning made visible.

**Layout:**
- **Left sidebar:** 5 tabs with counts — Competitor, Regulatory, Partner, Market Signal, Customer Signal
- **Main area:** the selected card type renders
- **Competitor cards:** carousel-style (one large card, sidebar lists others)
- **Other cards:** grid layout

**Per page-type, the Intel Card renders:**
- **CompetitorCard** — name, signal chip, Informs (Pricing/Positioning/Partnership/Roadmap), 3 vitals, two-column Where Scapia Wins / Where They're Ahead, dark Scapia Implication block, Recent Moves carousel
- **RegulatoryCard** — name, posture chip, effective date, What It Requires bullets, Current Posture box, Open Questions list, Sign-off Required callout
- **PartnerCard** — name, relationship type, status chip, What Scapia Gets / What Partner Gets paragraphs, Current Risks list, Scapia Implication dark block
- **MarketSignalCard** — title, direction chip (▲ Tailwind / ▼ Headwind / → Neutral), What's Shifting, Why It Matters for Scapia, Scapia Implication
- **CustomerSignalCard** — name, source + sentiment chips, What They're Saying bullets, Switching Signals box, Scapia Acquisition Implication

**How content is sourced:** `IntelCardsPage` fetches every wiki page via `fetchPage(path)`, then parses the markdown body for the `## X Intel` section using regex functions in `frontend-react/src/utils/intelParsers.js`. The parsed section is rendered through the appropriate component in `frontend-react/src/components/IntelCard.jsx`.

**Wikilinks in card prose** render as the same pills used everywhere — sharp mono with 5px category dot, hover orange, click navigates to `/vault?open=<path>`.

### 7.5 SourcesPage (`/sources`)

The feed view. Like the homepage What's New panel but full-screen.

Reads from `GET /api/feed` (same source as homepage). Lists every source summary page with timestamps, source type chips, headlines.

### 7.6 CuratorPage (`/curator`)

The operator workbench. Shows the queue, rejection log, and ingest history.

**Sections:**
- **Queue** — pending decisions (Layer 2 cards that need analyst review). Each card shows filter scores, maker reason, and 4 action buttons: Approve, Reject, Split, Regulatory only
- **Recent Rejections** — log of auto-rejected and analyst-rejected sources
- **Recent Ingests** — log of pages written (from `wiki/log.md`)

**Important UI note:** the curator queue UI currently labels every item as "LAYER 2 — ANALYST REVIEW REQUIRED" regardless of band. This is a cosmetic bug — AUTO-APPROVE items shouldn't reach the queue at all (the backend now bypasses the queue for AUTO-APPROVE per the fix in `server.py:_handle_submit`).

**Actions wire to:**
- `POST /api/queue/approve` — runs the ingest LLM call, writes pages, removes from queue
- `POST /api/queue/reject` — logs rejection, **deletes the raw file** (per the recent fix), removes from queue

### 7.7 SubmitPage (`/submit`)

The ingestion form. Where curators hand-feed sources.

**Fields:**
- **Source Title** — display name
- **Source URL or Paste Content** — the raw markdown / text / URL
- **Source Date** — when the source itself was published
- **Source Type** — Competitor / Regulatory / Market / Ambiguous (maps to `raw/<type>/`)
- **Domain pills** — Fintech / Travel (multi-select)
- **Entities This Touches** — typeahead chips
- **Curator Notes** — optional context for the LLM

**On submit:**
1. POST to `/api/submit`
2. Backend saves raw file to `raw/<source_type>/<slug>.md`
3. Backend runs Maker (and Checker if borderline)
4. **If AUTO-APPROVE:** backend immediately calls the LLM ingest workflow inline — writes pages, source summary, log entry. Returns the list of `wiki_paths` written.
5. **If BORDERLINE:** queues for analyst review, returns the queue item info.
6. **If AUTO-REJECT:** logs rejection, no raw file kept.

The form redirects to `/curator` on completion regardless of outcome. There's currently no inline "auto-approved" success modal — that's been discussed as a UX improvement (small modal saying "Auto-Approved" appears for 5s over the queue page).

### 7.8 WikiBrowserPage (`/wiki`)

Legacy older browse surface. Functionally similar to VaultPage but with a slightly different visual style. Vault is the primary surface; WikiBrowser is the older route still wired up.

### 7.9 Shared components

In `frontend-react/src/components/`:

| Component | Used in | Purpose |
|---|---|---|
| `AnswerCard.jsx` | IntelligencePage | Parses and renders the Brief-format LLM answer with masthead, Bottom Line, Signal sections, stat strips, dark Implication block, footer |
| `ChartBlock.jsx` | AnswerCard | Renders ```chart``` fenced blocks (bar / horizontal-bar / line / donut) using recharts |
| `InputBar.jsx` | IntelligencePage | Query text input + send button |
| `IntelCard.jsx` | IntelCardsPage | 5 card components — CompetitorCard, RegulatoryCard, PartnerCard, MarketSignalCard, CustomerSignalCard |
| `MessageBubble.jsx` | IntelligencePage | Query bubble (the orange chat bubble showing the user's question) |
| `Sidebar.jsx` | App shell | Global left sidebar with nav + recent query threads (when on the appropriate pages) |
| `WikiPagePanel.jsx` | Vault, IntelligencePage | Right-side slide-out panel that loads and renders any wiki page on demand |
| `WikiPill.jsx` | Everywhere (Answer, Vault, IntelCard) | Shared wikilink pill component — sharp 1px border, 5px category dot, hover-orange, default click navigates to `/vault?open=<path>` or accepts override `onClick` |

---

## 8. The agent layer — how the wiki actually gets written

This is the load-bearing piece. The agent runs the workflow defined in `CLAUDE.md` to write/update pages.

### 8.1 What "the agent" is in this codebase

Currently (local dev): the agent is a **single LLM call per ingest step** orchestrated by `server.py`. Specifically:

- `run_filter(content, source_type, filename)` — calls Maker (Haiku) then optionally Checker (Haiku) with separate prompts (`MAKER_PROMPT`, `CHECKER_PROMPT`)
- `_run_ingest_for_item(item)` — calls a single Sonnet model with `INGEST_PROMPT` to write the page(s); the model returns a JSON array of page objects, the backend writes each one

This is NOT yet a true agent loop with tool calls. The deployment plan (see `DEPLOYMENT-ARCHITECTURE.md`) is to migrate this to Anthropic's Claude Agent SDK with 7 tools (`read_raw`, `read_page`, `write_page`, `list_pages`, `upload_raw`, `append_log`, `mark_layer2`). For now, the model emits a complete JSON page spec and the backend interprets it.

### 8.2 The Maker-Checker filter (the gate before pages get written)

**Maker prompt** (`server.py:MAKER_PROMPT`): scores the source 1–10 on relevance, duplication, incremental value. Returns `{score, reason, band, entities, domains, page_types}`.

**Checker prompt** (`server.py:CHECKER_PROMPT`): runs only when Maker scores 4–7. Adversarially prompted — assumes the source is low-value, tries to refute relevance/duplication/incremental-value. Returns its own `{score, reason, band}`.

**Band routing (per CLAUDE.md):**
- Maker 8–10 → AUTO-APPROVE (Checker skipped, pages written immediately)
- Maker 1–3 → AUTO-REJECT (Checker skipped, no pages, raw file not kept)
- Maker 4–7 → Checker runs:
  - Checker 8–10 → AUTO-APPROVE
  - Checker 1–3 → AUTO-REJECT
  - Both 4–7 within 1–2 pts → Layer 2 (curator reviews)
  - Both 4–7 diverging 3+ pts → Layer 2 (curator reviews)

The filter is what makes org-wide submission safe — it stops noise (duplicates, low-signal listicles, generic content) before pages get written.

### 8.3 The ingest workflow (when filter approves)

In `server.py:_run_ingest_for_item`:

1. Read the raw file from `raw/<source_type>/<filename>`
2. Build the wiki context summary (`wiki_summary_for_filter()` — gives the LLM a list of existing entities/regulatory/events with their signals/postures)
3. Construct `INGEST_PROMPT` with: wiki summary, filename, source type, entities (from filter), domains, page types, raw content (first 8K chars), today's date
4. Call Claude Sonnet with `max_tokens=8192`
5. Parse the JSON response — model returns either a single page object or an array of page objects (multi-entity sources)
6. For each page:
   - Split frontmatter from body
   - **If `action === "update"` and the wiki path exists:** merge frontmatter (new fields win, existing fields preserved, sources_count auto-increments), insert new body BEFORE the existing `## Synthesis` / `## Competitor Intel` anchor so the apparatus sections stay at the bottom of the page. This is the **frontmatter-merge fix** — earlier versions appended raw content (including a second frontmatter block) inline, which rendered as garbage.
   - **If new:** write the file as-is
   - Update `wiki/index.md` — replace any existing entry for the same target, or insert under the matching section heading
7. Write a source summary page to `wiki/sources/<date>-<slug>.md` deterministically (the LLM doesn't always remember; the backend writes it from data it already has)
8. Append to `wiki/log.md`
9. Refresh `state.json` health counts
10. Return the list of `wiki_paths` written

### 8.4 The query workflow

In `server.py:_handle_query`:

1. Accept `{query, thread_history}` from frontend
2. Truncate thread history to last 3 turns
3. Build wiki context (`wiki_context_for_query()` — concatenates every wiki page's markdown into a single string, ~15-25K tokens for current corpus)
4. Construct `QUERY_PROMPT` with: wiki context, thread context (if any), the question, today's date in two formats
5. Call Claude Sonnet with `max_tokens=2048`
6. Append `query` operation line to `wiki/log.md`
7. Return `{answer}` to frontend

The QUERY_PROMPT enforces the Brief format we discussed: Bottom Line must directly answer, time-horizon required, Stat chips must contrast vs Scapia, Confidence requires because-clause, Implications must be executable (owner/window/target), optional Counter-signal only when wiki contains contradicting source, optional Blind Spot, charts mandatory for 3+ comparable numbers.

### 8.5 CLAUDE.md — the schema spec

The 844-line `CLAUDE.md` at the repo root is the operational spec the LLM follows. It defines:

- The two domains (Fintech + Travel) and their sub-categories
- Citation discipline rules (every claim has an inline footnote pointing to raw/)
- Bifurcation rules — which raw/ folder routes to which page treatment
- 9 page-type schemas (entity, regulatory, event, partner, market-signal, customer, concept, comparison, source) with mandatory frontmatter fields, body section structures, parse anchors
- The Maker-Checker filter spec (Stage 1 + Stage 2 thresholds)
- Layer 2 analyst card format
- Ingest workflow (12 numbered steps)
- Query workflow + Brief format
- Lint workflow + cross-referencing conventions
- Style rules (clear prose, no fluff, regulatory posture model, dates in YYYY-MM-DD)

The deployment plan is to bundle `CLAUDE.md` as the agent's system prompt verbatim — the same file that drives Claude Code locally drives the hosted agent. Zero schema drift between local and prod.

---

## 9. The wiki schema — page types and contracts

### 9.1 The 9 page types

| Type | Folder | Purpose | Multi-perspective? |
|---|---|---|---|
| **competitor-entity** | `entities/` | One page per competitor (Axis Atlas, CRED, OneCard, HDFC Diners Black, …) | Yes — Fintech view + Travel view subsections |
| **regulatory** | `regulatory/` | One page per regulation (RBI circulars, DPDP Rules, NPCI guidelines) | No — single posture, single conclusion |
| **event** | `events/` | One page per discrete market moment (devaluation, launch, partnership) | No |
| **partner** | `partners/` | Federal Bank, networks (Visa/RuPay), OTA partners | No — single perspective |
| **market-signal** | `market-signals/` | Macro trends, category growth, financial health | No |
| **customer** | `events/` (with `page_types: [customer]`) | Voice-of-customer events — App Store, Reddit, switching signals | No |
| **concept** | `concepts/` | Reference pages for shared mechanics (FX markup, coin economics) | No |
| **comparison** | `comparisons/` | Head-to-head, on demand only | No |
| **source** | `sources/` | One summary per ingested raw source | No |

### 9.2 Mandatory Intel sections (the hard contract)

Every page type has a mandatory `## X Intel` section. A page **cannot be filed without it.** The Intel Cards frontend parses these exact anchors.

| Page type | Mandatory section |
|---|---|
| competitor (entities/) | `## Competitor Intel` |
| regulatory (regulatory/) | `## Regulatory Intel` |
| partner (partners/) | `## Partner Intel` |
| market-signal (market-signals/) | `## Market Intel` |
| customer (events/ with page_types: [customer]) | `## Customer Intel` |

Parse anchors are non-negotiable:
- `**bold**` on its own line = win/loss/point item headline
- `→ Action:` prefix = action for that win/loss item
- `→ ` (no "Action:") = Scapia Implication bullet
- `- YYYY-MM-DD:` = Recent Moves line
- `**Field:** Value` lines = metadata fields (Status, Direction, etc.)

### 9.3 Mandatory frontmatter — entity pages

```yaml
---
entity: <Name>
type: competitor-entity
domains: [fintech, travel]
travel_categories: [flights, stays]   # only if travel
page_types: [competitor]               # multi-tag allowed
perspectives_populated: [fintech, travel]
sources_count: 2
last_updated: YYYY-MM-DD
headline: "<8-14 word editorial sentence, vs-Scapia framing>"
signal: threat | opportunity | watch
vitals: ["<value>|<label>|<vs-Scapia note>", "...", "..."]
---
```

The **distill sub-step** is mandatory: after writing/updating any entity page body, the LLM re-reads the full page and synthesizes `headline`, `signal`, `vitals` from the content. These three fields must always reflect the current state of the entire page, not just the latest source. A page cannot be filed without them.

### 9.4 Mandatory frontmatter — regulatory pages

```yaml
---
regulation: <Name>
type: regulatory
domains: [fintech]
page_types: [regulatory]
effective_date: YYYY-MM-DD
posture: Active | Under Review | Escalated | Superseded
last_updated: YYYY-MM-DD
---
```

The **posture model** (Active / Under Review / Escalated / Superseded) replaced the original binary Confirmed / Disputed / Unverified vocabulary. Indian fintech regulation is interpretive — not binary. Curators surface and route; they never conclude on interpretation. Any interpretation call routes to Federal Bank Legal / Internal Legal.

### 9.5 Common to every page

- All factual claims need inline footnotes pointing to `raw/`
- `⚠ Unsourced — needs verification.` for claims that can't be sourced
- `⚠ Conflict: [Source A] states X. [Source B] states Y. Not resolved — flagged for curator.` for conflicting sources
- `> Background (no source in raw/): …` for explicitly-marked web/LLM general knowledge

---

## 10. Build history — what we decided and why

This is the chronological narrative of major decisions in the conversation that built this system to its current state. Read it to understand WHY the code looks the way it does.

### 10.1 Starting point — the Calibre prototype

The system began as a prototype for **Calibre** (a US-market fitness/nutrition app). A working but generic LLM-wiki built in v0. The pivot to Scapia kept the core idea (LLM-maintained wiki, Maker-Checker filter, citation discipline) but required:
- Rebuilding the schema for Indian fintech + travel (vs US health apps)
- Renaming everything from Calibre to Scapia (UI strings, frontmatter terms, parser regexes)
- Adapting the bifurcation rules to Fintech + Travel domains

### 10.2 The 4 gaps we closed in CLAUDE.md

The original CLAUDE.md had four gaps that this session closed:

1. **The Scapia Decision-Lens was missing.** Entity pages described competitors but didn't answer "what should Scapia do?" Fix: mandatory `## Competitor Intel` section at ingest time, with `## Implications for Scapia` → `## Competitor Intel` rename (and downstream parser updates).

2. **"Compliance is binary" was wrong for Indian fintech.** RBI circulars are ambiguous and interpretation-dependent. Fix: replaced Confirmed/Disputed/Unverified with the posture model (Active / Under Review / Escalated / Superseded), added mandatory Open Questions + Sign-off Required fields, made it clear that curators file but never interpret.

3. **Citation discipline only existed at query time.** The LLM could write unsourced claims into the wiki silently. Fix: hoisted citation discipline to a top-level section in CLAUDE.md applying to ALL page types — every claim needs `[^footnote]`, unsourced claims marked `⚠ Unsourced`, conflicts marked `⚠ Conflict` (never silently overwritten).

4. **Push pipeline was missing.** System was pull-only. Fix: documented the live feed (What's New 24h on homepage) + the Resend daily digest as the push surfaces. Materiality is the filter's job, not a separate decision.

### 10.3 The synthesis-pages removal — wiki/queries separation

Original design had `wiki/synthesis/*.md` — query answers could be "saved to wiki." We removed this concept entirely. Reasoning: it mixed two conceptually different layers (outside-world view vs Scapia's interpretation), polluted the wiki with exploratory questions, and added a confusing "Save to Wiki" button whose effect (becoming a citable source for future queries) wasn't clear.

Replaced with: query thread history in browser `localStorage` (`mi_query_threads` key), threaded follow-up support, no path back into the wiki. The wiki stays purely from ingested raw/ sources.

Code changes:
- Removed `wiki/synthesis/` folder and its CLAUDE.md schema
- Removed `Save to Wiki` button from AnswerCard
- Removed `Synthesis` tab from WikiBrowserPage
- `/api/submit` with `source_type: "synthesis"` now returns HTTP 410 Gone
- IntelligencePage rewrote thread storage to use localStorage with `loadThread` event for cross-component coordination

### 10.4 The 10 query response levers

After observing real query outputs and noticing patterns (deflecting Bottom Lines, opaque Confidence labels, vague Implications), we locked 10 prompt enhancements:

1. Bottom Line must directly answer the question (no reframes; reframes go in Signal sections)
2. Confidence requires a because-clause
3. Stat chips need contrast or implication (`2M+ users (4× Scapia)` not `2M+ users`)
4. Implications must be executable (who/when/measurable target)
5. Time-horizon required in Bottom Line or Implications
6. Chart blocks required for 3+ comparable numerical comparisons
7. Counter-signal line when wiki has genuinely contradicting source (not invented)
8. Blind-spot line in Confidence area when there's a meaningful gap
9. Signal sections capped at ~120 words (split if longer)
10. "As of DD/MM/YY" timestamp under Bottom Line

These are all enforced via the `QUERY_PROMPT` in `server.py`.

### 10.5 The AnswerCard redesign

Started as a generic ChatGPT-style card. Iterated through:

1. First pass — sharp 1px borders, Lexend Deca + IBM Plex Mono, intelligence-brief aesthetic
2. User requested: single typeface only (Lexend Deca everywhere) → collapsed mono to sans
3. User requested: wider card → maxWidth 860 → 1100
4. User requested: smaller Bottom Line → font-size clamp(23,3.1vw,31) → clamp(18,2.1vw,22)
5. Stat strip switched from inline-flex to CSS grid (`repeat(auto-fit, minmax(200px, 1fr))`) — fixes alignment when labels wrap
6. Stat cells without extractable numbers are filtered out (don't render an empty cell)
7. Chart unit formatter handles `₹/yr` correctly: prefix before number, suffix after (`₹11,988/yr` not `₹/yr11988`)
8. Implication block removed `maxWidth: 70ch` cap so bullets use full card width
9. Footer wikilinks (in Blind Spot, Confidence reason) now render as pills

Net design: editorial research-note aesthetic, single typeface, sharp 1px borders, orange accents, mono uppercase + letter-spacing for "instrument" labels (without needing a second font).

### 10.6 The ThinkingBubble loader redesign

Original was a generic "Analyzing • • •" pill. Replaced with a staged loader that mirrors the AnswerCard's masthead:

- Pulsing orange square + INTELLIGENCE BRIEF + climbing timer + status word
- 4 stages with markers (outline → pulsing → solid), indeterminate progress strip
- Stage chips scan to orange for `READING WIKI` stage
- Italic status line + `EST. 15–30S` in tinted footer
- Reduced motion media query supported

The wait pre-echoes the answer — the loader feels like the brief is materializing, not buffering.

### 10.7 The Recent Queries preview on HomePage

Past queries were invisible from the homepage (only accessible by navigating to IntelligencePage). Added a mini-preview list of 3 most-recent threads merged into the same visual card as the Intelligence hero (shared left orange rail, no gap between, tight internal spacing). Hidden entirely when there are no past queries.

Click a thread row → navigates to `/intelligence?thread=<id>` → IntelligencePage reads the URL param and opens that thread directly. This avoids the event-dispatch race (Sidebar's event pattern works only when IntelligencePage is already mounted; HomePage uses URL state which survives the navigation).

### 10.8 The shared WikiPill

All wikilink pills across the app — Vault, IntelligencePage answer cards, IntelCard prose, WikiPagePanel body — were inconsistent (some yellow rounded pills, some sharp mono pills, some raw `[[brackets]]` text in Intel Cards). Extracted into `frontend-react/src/components/WikiPill.jsx` shared by every surface. Includes a `renderInlineWithWikilinks` helper that splits any string into a mix of plain text and pill components.

Side effect: `intelParsers.js` stopped stripping `[[wikilinks]]` to plain text, so Intel Card prose now shows clickable pills.

### 10.9 Backend bug fixes from real test ingests

Discovered during the HDFC + CRED test ingests:

1. **`max_tokens=4096` truncated multi-page ingests** — bumped to 8192, added JSONDecodeError handler
2. **Handler crashed on multi-page agent responses** — model legitimately returns an array of pages for multi-entity sources; handler now normalizes single-object vs array
3. **Update path appended a second frontmatter block inline** — added `_split_frontmatter` / `_merge_frontmatter` / `_join_frontmatter` helpers; updates now merge frontmatter and insert new body before the apparatus sections
4. **`index.md` accumulated duplicate entries** — `_replace_or_insert_index_entry` replaces an existing line for the same target instead of appending
5. **The LLM never wrote source-summary pages** — backend now writes them deterministically in `_write_source_summary` after every successful ingest, using data the backend already has (filename, score, band, written paths)
6. **AUTO-APPROVE went to the queue instead of bypassing** — `/api/submit` AUTO-APPROVE branch now calls `_run_ingest_for_item` inline, returns the wiki_paths in the same response. Queue is only for BORDERLINE (Outcome C/D) per spec.
7. **Rejected items left orphaned raw files** — `/api/queue/reject` now deletes the raw file (safety-guarded to only delete inside `raw/`)
8. **Frontend StrictMode double-fire on `?q=` URL** — `useRef` guard ensures `handleSubmit` only fires once even in dev StrictMode

### 10.10 Calibre → Scapia branding sweep

Found 4 leftover "Calibre" strings in the deployed UI (Sidebar branding, IntelCardsPage subtitle, IntelCard section headers, AnswerCard "For Calibre" + parser regex). Renamed everything. **Critical:** AnswerCard parser was looking for `Calibre Implication` — since wiki now produces `Scapia Implication`, the implication block would have rendered as plain markdown instead of in the dark card. Now matches both for compat but uses Scapia going forward.

### 10.11 Verification checklist closed (7 of 8)

A handover verification checklist was tracked across the session:

| # | Task | Status |
|---|---|---|
| 1 | Run ingest workflow end-to-end with a fresh raw source | ✅ HDFC Diners Black + CRED restructure + DPDP Rules all tested |
| 2 | Verify `/api/query` live with ANTHROPIC_API_KEY set | ✅ Verified via Odyssey |
| 3 | Confirm `server.py` Checker prompt matches the adversarial spec | ✅ Patched + verified |
| 4 | Verify Resend email push pipeline delivers | ⏸ Out of scope — Resend is deployment, not local |
| 5 | Walk Intel Cards for all 5 page types in preview | ✅ All 5 tabs render |
| 6 | Run lint workflow and confirm expected gaps surface | ✅ Manual lint via grep |
| 7 | Grep `wiki/` for stale `compliance_status` / old vocabulary | ✅ Clean — zero stale references |
| 8 | Rebuild `frontend-react/dist` and verify no build errors | ✅ Multiple successful builds |

---

## 11. Operational runbook

### 11.1 First-time setup

```bash
# Clone or be in the project directory
cd /Users/sarthak.atrish/v1-LLM-wiki

# Backend deps
pip3 install anthropic

# Frontend deps
cd frontend-react
npm install
cd ..
```

The `.env` file at the project root holds the Odyssey credentials:
```
ANTHROPIC_BASE_URL=https://api.odyssey.scapia.in
ANTHROPIC_API_KEY=sk-…
```

`server.py` auto-loads this file on startup. (You need to be on Scapia's VPN for Odyssey to be reachable.)

### 11.2 Daily dev loop

**Two terminals:**

Terminal 1 — backend:
```bash
cd /Users/sarthak.atrish/v1-LLM-wiki
python3 server.py
```

Terminal 2 — frontend:
```bash
cd /Users/sarthak.atrish/v1-LLM-wiki/frontend-react
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api/*` to `localhost:8080`.

### 11.3 Running an ingest test

1. Go to `/submit`
2. Fill in title, paste content, set source type + domain
3. Click Submit to Queue
4. If AUTO-APPROVE: form sits ~30–60s, then completes (no queue card)
5. If BORDERLINE: form completes immediately, you're shown the queue card on `/curator`

To verify a successful ingest:
- Check `wiki/log.md` — should have a new `## [date] ingest |` line
- Check `wiki/sources/` — should have a new `YYYY-MM-DD-<slug>.md` file
- Check the relevant `wiki/<folder>/` — should have the new or updated page
- Refresh System Pulse on homepage — Sources Indexed count should increment

### 11.4 Running a query test

1. Go to `/` (homepage)
2. Type a question in the Intelligence input → Enter
3. You're navigated to `/intelligence?q=<query>`
4. The staged loader runs for ~15–30s
5. AnswerCard renders the Brief

### 11.5 Stopping a stuck backend

```bash
lsof -i :8080 | grep python | awk '{print $2}' | xargs kill
```

### 11.6 Resetting test state

```bash
# Reset queue + rejection log to empty (preserves health counts)
python3 -c "import json; from pathlib import Path; p = Path('state.json'); s = json.loads(p.read_text()); s['pending_queue'] = []; s['rejection_log'] = []; p.write_text(json.dumps(s, indent=2))"

# Clear localStorage from browser DevTools console
localStorage.clear()
```

### 11.7 Debugging when the answer card is blank after a query

Most common cause: a runtime error in AnswerCard's `parseBrief` (e.g., the recent `WIKI_REGEX is not defined` bug). Open browser DevTools → Console. React errors print with full stack and the failing component name.

### 11.8 Debugging when a submit hangs forever

Backend LLM call probably errored. Check the terminal running `server.py` for a Python traceback. Common causes: Odyssey timeout (VPN dropped), API key issue, model returned malformed JSON.

---

## 12. File and code map

### 12.1 Top-level layout

```
v1-LLM-wiki/
├── CLAUDE.md                       — The agent spec (844 lines). Drives Claude
│                                     Code locally; will be bundled as the
│                                     hosted agent's system prompt verbatim.
├── server.py                       — Single-file Python backend (~1400 lines).
│                                     Will be rewritten as FastAPI for deploy.
├── state.json                      — Runtime state: queue, rejection_log,
│                                     health counts. Filesystem persistence.
├── .env                            — Odyssey credentials (gitignored).
├── .gitignore
│
├── wiki/                           — The structured knowledge base.
│   ├── index.md                    — Master catalog (auto-maintained).
│   ├── log.md                      — Append-only operation log.
│   ├── scapia.md                   — Scapia reference baseline (manual).
│   ├── entities/                   — Competitor pages.
│   ├── regulatory/                 — Regulation pages.
│   ├── events/                     — Discrete market events.
│   ├── partners/                   — Ecosystem partners.
│   ├── market-signals/             — Macro trends.
│   ├── concepts/                   — Shared mechanics (currently empty).
│   ├── comparisons/                — Head-to-head (currently empty).
│   └── sources/                    — One summary page per ingested source.
│
├── raw/                            — Immutable raw sources. Never modified by
│                                     LLM. Audit trail.
│   ├── competitive/
│   ├── regulatory/
│   ├── market/
│   └── ambiguous/
│
├── frontend-react/                 — React + Vite SPA.
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── src/
│   │   ├── main.jsx                — Entry. React.StrictMode wrapper.
│   │   ├── App.jsx                 — Router + layout shell.
│   │   ├── api.js                  — fetch wrappers for all backend endpoints.
│   │   ├── pages/                  — Route components (9 pages).
│   │   ├── components/             — Shared components (8).
│   │   └── utils/
│   │       └── intelParsers.js     — Markdown → intel section parsers.
│   └── dist/                       — Production build output.
│
├── design-mockup/                  — HTML/CSS design references from
│                                     claude.ai/design sessions.
│
├── DEPLOYMENT-ARCHITECTURE.md      — The deployment plan (716 lines).
├── DEPLOYMENT-ARCHITECTURE.pdf     — PDF render of the same doc.
├── KNOWLEDGE-TRANSFER.md           — This document.
├── MARKET-INTELLIGENCE-SYSTEM.md   — The original pitch / problem-statement.
├── mi-gaps-and-solutions.md        — Gap-and-fix narrative.
└── v1-knowledge-transfer.md        — Older partial transfer doc (predates
                                      most of the current state — superseded
                                      by this doc).
```

### 12.2 Backend (`server.py`)

The file is single-purpose: handle HTTP requests, run LLM calls, read/write filesystem.

| Section | Lines (approx) | Purpose |
|---|---|---|
| `.env` loader | 25–40 | Minimal in-place parser, no python-dotenv dependency |
| `get_client()` | 40–60 | Lazy Anthropic client, supports custom `ANTHROPIC_BASE_URL` (Odyssey) |
| `parse_frontmatter()` | 95–115 | Simple line-by-line YAML parser. Cannot handle nested YAML. |
| `list_wiki_pages()` | 120–185 | Walks `wiki/*/` and reads frontmatter from each file |
| `wiki_summary_for_filter()` | 195–210 | Builds short list of existing pages for LLM context |
| `wiki_context_for_query()` | 215–225 | Concatenates all wiki pages into a single context blob |
| `list_feed_items()` | 230–305 | Reads `wiki/sources/` and enriches with touch metadata for the feed |
| `MAKER_PROMPT` | 310–360 | Filter prompt — scores source 1–10 across three checks |
| `CHECKER_PROMPT` | 365–410 | Adversarial filter prompt — assumes low value, tries to refute |
| `QUERY_PROMPT` | 415–490 | Query prompt with full Brief format spec |
| `INGEST_PROMPT` | 495–600 | Page-writing prompt with per-type schema templates |
| `_split_frontmatter()` + `_merge_frontmatter()` + `_join_frontmatter()` | 605–680 | Frontmatter manipulation helpers for clean updates |
| `_replace_or_insert_index_entry()` | 685–730 | Index.md upsert logic (replaces existing lines, doesn't duplicate) |
| `_write_source_summary()` | 735–800 | Deterministic source-summary page writer |
| `_run_ingest_for_item()` | 805–905 | The LLM ingest workflow — calls model, parses, writes pages |
| `run_filter()` | 910–970 | Maker (and optionally Checker) execution |
| HTTP handler class | 975–1390 | All endpoints |

**Endpoints:**

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/pages` | List all wiki pages by folder |
| GET | `/api/page?path=…` | Single page content + metadata |
| GET | `/api/feed` | What's New feed items |
| GET | `/api/raw` | List raw files by folder |
| GET | `/api/raw/content?path=…` | Raw file content |
| GET | `/api/state` | Queue + rejection log + health |
| POST | `/api/query` | Run a query (accepts optional thread_history) |
| POST | `/api/submit` | Submit a raw source (filter → maybe ingest → maybe queue) |
| POST | `/api/queue/approve` | Approve a queued item (curator action) |
| POST | `/api/queue/reject` | Reject a queued item (also deletes raw file) |

### 12.3 Frontend pages (`frontend-react/src/pages/`)

| File | Route | Purpose |
|---|---|---|
| `HomePage.jsx` | `/` | Dark themed landing — Intelligence hero, Recent Queries preview, Vault/IntelCards nav, OPS pills, System Pulse, What's New feed |
| `IntelligencePage.jsx` | `/intelligence` | Query interface + thread history (localStorage) + answer rendering |
| `VaultPage.jsx` | `/vault` | Card grid browse of all wiki pages with filters |
| `IntelCardsPage.jsx` | `/intel-cards` and `/battlecards` | 5-tab structured card view (Competitor / Regulatory / Partner / Market Signal / Customer Signal) |
| `SourcesPage.jsx` | `/sources` | Full-screen feed |
| `CuratorPage.jsx` | `/curator` | Queue + rejections + ingest history |
| `SubmitPage.jsx` | `/submit` | Ingest form |
| `WikiBrowserPage.jsx` | `/wiki` | Legacy browse surface (functionally similar to Vault) |
| `BattlecardsPage.jsx` | (older route) | Predecessor to IntelCardsPage |

### 12.4 Frontend components

| File | Used in | Purpose |
|---|---|---|
| `AnswerCard.jsx` | IntelligencePage | Parses + renders the Brief-format LLM answer |
| `ChartBlock.jsx` | AnswerCard | Renders ```chart``` fences via recharts |
| `InputBar.jsx` | IntelligencePage | Query input + send button |
| `IntelCard.jsx` | IntelCardsPage | 5 card components for the 5 page types |
| `MessageBubble.jsx` | IntelligencePage | Question bubble (the orange chat balloon) |
| `Sidebar.jsx` | App shell | Global left nav (used on intelligence/vault/etc) |
| `WikiPagePanel.jsx` | Vault, IntelligencePage | Right-side slide-out panel for any wiki page |
| `WikiPill.jsx` | Everywhere | Shared wikilink pill — sharp 1px border, 5px dot, hover orange |

### 12.5 Frontend utilities

| File | Purpose |
|---|---|
| `utils/intelParsers.js` | Markdown → intel section parsers (one per page type) |
| `api.js` | Fetch wrappers for every backend endpoint |

---

## 13. Deployment

The full deployment plan lives in **`DEPLOYMENT-ARCHITECTURE.md`** (and `.pdf`). Quick summary:

- **Frontend:** Vercel, single React+Vite app, one domain
- **Backend:** Render free tier (or Docker on Scapia infra — see chat history for the Docker discussion)
- **Database:** Supabase (Postgres + Storage bucket + Auth)
- **LLM:** Anthropic Python SDK + Claude Agent SDK, with `CLAUDE.md` as system prompt verbatim
- **Email:** Resend, daily 09:00 IST digest
- **Roles:** leader + curator (curator gated by shared password env var in v1)
- **Wiki storage:** Hybrid — markdown body + denormalized columns + `intel_section jsonb`
- **Three-week phased rollout:** Foundations → Daily digest + Hosted query → Hosted ingest + Polish

The doc captures 25 locked decisions across 16 sections. Read it cover-to-cover before starting deployment work.

---

## 14. Known issues, deferred items, and gotchas

### 14.1 Known cosmetic bugs

1. **Curator queue UI mislabels every item as "LAYER 2 — ANALYST REVIEW REQUIRED"** regardless of band. AUTO-APPROVE items don't reach the queue anymore (per the bypass fix), so this matters less in practice — but a stale code path can still surface the label incorrectly. Fix is one CSS-level rename.

2. **No "auto-approved" success modal** on the submit form. When AUTO-APPROVE bypasses the queue, the user is currently dumped onto an empty queue page with "No pending decisions" — leaves them unsure whether the submission worked. A small 5-second modal saying "Auto-Approved" was discussed but not yet implemented.

3. **Production frontend bundle is 919 KB** before gzip (262 KB gzipped). Single chunk, no code-splitting. `vite build` emits a warning. Fix is `manualChunks` in `vite.config.js` — defer until pre-deploy.

### 14.2 Deferred to deployment phase

- Real auth (Supabase magic-link) — local dev has none
- Per-user cost caps (deployment has them, local doesn't)
- The `/api/submit` → async background task split (currently sync — blocks for the full 60s ingest)
- The Claude Agent SDK migration (currently a single LLM call returns JSON; SDK migration would use tools with retries and persistent agent_trace)
- Resend email digest (the push surface)
- Cross-device read-state for the orange dot (currently localStorage-only)
- Hosted lint endpoint (currently you'd run lint locally via Claude Code)

### 14.3 Schema gotchas

- **Frontmatter parser is line-based and cannot handle nested YAML.** Lists in frontmatter must use the JSON-array-of-pipe-strings format: `vitals: ["a|b|c", "d|e|f"]`. The YAML idiomatic nested list (`vitals:\n  - "a|b|c"`) parses as an empty value and breaks the page.

- **`## Synthesis` section inside an entity page is NOT the same as `wiki/synthesis/` pages.** The latter was removed; the former (a cross-perspective paragraph inside every entity body) is still part of the schema. Don't conflate them.

- **The agent occasionally emits `Calibre Implication`** instead of `Scapia Implication` in query answers (residual training drift). AnswerCard parser accepts both for compat. If you change parser anchors, keep the dual-match.

### 14.4 Backend gotchas

- **`server.py` is the entire backend.** No tests. No type hints. No FastAPI. ~1400 lines. The deployment plan migrates to FastAPI; for local dev, edit-restart-test is the cycle.

- **State is filesystem-only.** No database in local dev. Concurrent edits to `state.json` from multiple requests could race — but in practice the curator workflow is single-threaded and we haven't hit this.

- **The `_run_ingest_for_item` LLM call is synchronous.** A submit blocks for ~30–60s. Frontend should show a loading state (it does). Deployment plan splits this into a background task + polling endpoint.

- **`max_tokens=8192` on the ingest call.** Multi-entity sources may still get truncated if the model writes very detailed pages for >3 entities. Handler catches `JSONDecodeError` and returns an actionable error.

### 14.5 Frontend gotchas

- **React.StrictMode is on in dev** — mount effects fire twice. Any side-effect-in-useEffect needs a `useRef` guard (we hit this with the auto-submit on `?q=` URL). Not a problem in production builds.

- **Vite proxy `/api → :8080`** is in `vite.config.js`. If you deploy frontend separately from backend, this needs to become an env var (`VITE_API_URL`).

- **localStorage keys to know:**
  - `mi_query_threads` — past query thread history
  - `mi_opened_pages` — unread state (orange dots in Vault + feed)
  - `mi_threads_updated` — custom event dispatched on thread updates (not localStorage but related)

### 14.6 Things that look like bugs but are intentional

- **Frontmatter parser strips wikilinks in intel section parsing... wait, it doesn't anymore.** It used to (the parser flattened `[[...]]` to plain text), but that was changed so Intel Cards render proper pills. If you see plain `[[wikilinks]]` text in an Intel Card, the parser regressed.

- **The frontend NEVER writes to the wiki directly.** All writes go through the backend (which delegates to the LLM). If you find yourself wanting to add a write path from React, you're probably solving the wrong problem.

- **Past queries aren't saved server-side.** They're in localStorage per browser. This is deliberate (privacy + wiki/queries separation). Will move to Supabase per-user in deployment.

---

## 15. Glossary

| Term | Meaning |
|---|---|
| **Scapia** | The product the system tracks intelligence for — a Federal Bank co-branded travel credit card |
| **The wiki** | Markdown pages in `wiki/` — the structured knowledge base, written only by the LLM |
| **Raw source** | A markdown file in `raw/` — the original ingested content. Immutable audit trail. |
| **Source summary** | A page in `wiki/sources/` summarizing one ingested raw source. Drives the live feed. |
| **CLAUDE.md** | The 844-line agent spec at repo root. The LLM follows this to maintain the wiki. |
| **The Brief** | The structured query-answer format: Bottom Line + Signal sections + Implication + Confidence/Blind Spot footer |
| **Maker-Checker** | The two-stage LLM filter that gates page writes. Maker scores; Checker (adversarial) runs on borderline scores. |
| **AUTO-APPROVE / AUTO-REJECT / Layer 2** | The three filter outcomes. Auto-approve writes pages immediately; auto-reject doesn't write or queue; Layer 2 sends to curator review. |
| **Curator** | The operator role. Submits sources, reviews Layer 2 cards. |
| **Leader** | The consumer role. Asks questions, reads briefs, browses. |
| **Posture** | A regulatory page's status: Active / Under Review / Escalated / Superseded. Replaced the binary Confirmed/Disputed model because Indian fintech regulation is interpretive. |
| **Vitals** | A 1–3 chip array in entity page frontmatter. Each chip: `"value|label|note"` pipe-delimited string. Must be contrasted vs Scapia. |
| **Wikilink** | An Obsidian-style `[[folder/slug]]` reference. Rendered as a pill with a category dot. |
| **Intel section** | The mandatory `## X Intel` block on every page type. Frontend parses anchors from this section to render Intel Cards. |
| **Odyssey** | Scapia's internal Anthropic-compatible LLM gateway at `api.odyssey.scapia.in`. Requires VPN. Used in place of direct Anthropic API. |
| **Push layer** | The live feed + daily digest combined — the system's way of pushing material changes to leaders without them having to ask. |
| **Distill sub-step** | After writing/updating any entity page body, the LLM re-reads the full page and synthesizes fresh `headline` / `signal` / `vitals` from the content. Mandatory. |

---

*Document last updated: end of build session, June 2026. If you're reading this six months from now and something's wrong, the build chats in this session and the `DEPLOYMENT-ARCHITECTURE.md` doc are the next places to look.*
