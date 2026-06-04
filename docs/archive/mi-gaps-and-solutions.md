# Market Intelligence v1 — Gaps & Proposed Solutions
**Stakeholder Review · May 2026**

This document consolidates the gaps identified in the stakeholder review of the Market Intelligence prototype, along with proposed solutions for v1. To be discussed with Anil, Karthik, and Rathina.

---

## GAP 1 — The Scapia Decision-Lens Is Missing

### The Gap
- Entity pages in the prototype are competitor-centric — they describe what a competitor is doing but do not answer what Scapia should do about it
- There is no mandatory "Implications for Scapia" field on entity pages
- The implication layer only exists at query time (the "For Calibre" card in the answer output) — not at ingest time when the page is written
- A page that doesn't help a decision-maker decide something — pricing, positioning, partnership, roadmap — shouldn't exist

### How We Solve It
- Make "Implications for Scapia" a mandatory section on every entity page at ingest time — not optional, not deferred to query time
- The section must answer: what decision does this inform? (pricing, positioning, partnership, or roadmap)
- A page cannot be filed without this section populated — enforced in the schema
- The query-time implication card (synthesis output) is kept as well — both layers work together: entity-level at ingest, synthesised at query

---

## GAP 2 — "Compliance Is Binary" Is Wrong and Dangerous for an Indian Fintech

### The Gap
- The prototype treats regulatory intelligence as binary — compliant or not, one authoritative conclusion
- RBI circulars, co-brand rules, and DLG guidelines are ambiguous, evolving, and interpretation-dependent by design — that is why banks staff legal teams
- The "one conclusion or mark Disputed" model will either produce confidently wrong answers or flag everything as Disputed — both are failures
- "Disputed" means two sources conflict — RBI ambiguity is not a source conflict, it is genuine interpretive uncertainty; the model has no vocabulary for this
- A curator or analyst cannot and should not resolve RBI interpretation — that belongs to legal and compliance
- The system has no escalation path built in
- For a Federal Bank-partnered regulated entity, a confidently wrong regulatory answer is the most expensive failure the system can produce

### How We Solve It
- Reframe regulatory output from a verdict to a posture — what Scapia is doing today, what is still open, who needs to sign off
- Replace Confirmed / Disputed / Unverified with a new status vocabulary: `Active · Under Review · Escalated · Superseded`
- Add mandatory fields to every regulatory page: **Open Questions** and **Sign-off Required** (Federal Bank / Internal Legal / Both)
- Build a hard rule into the schema: curators file and summarise, they never conclude on interpretation — any interpretation call routes to legal/compliance automatically
- The system's job on regulatory is to surface and route, not to resolve

---

## GAP 3 — No MVP, No Phasing — Scope Explosion Risk

### The Gap
- The prototype document bolts on: browser extension, org-wide contributor funnel, automated crawler, Maker-Checker pipeline, evaluation framework, vector DB, hybrid search, graph traversal
- That is a multi-quarter product-company build — effectively rebuilding Crayon from scratch
- The real failure mode is spending three months on infrastructure and never producing intelligence
- There is no phase plan that names what 80% of the value is and explicitly defers the rest

### How We Solve It
- Phase 1 is hardening what already works: disciplined ingest + Scapia framing + query — this already delivers value
- Everything else earns its way in behind explicit triggers — a feature only gets built when the current phase proves it is needed
- Phase 1 = curator + crawler feeding the system, one disciplined operator, no org-wide contribution yet
- Org-wide contribution is a Phase 2 problem — it only makes sense once the output is valuable enough that people want to contribute because they see what comes back

---

## GAP 4 — Citation and Hallucination Discipline Is Missing

### The Gap
- Citations in the prototype only exist at query time — the AnswerCard shows source pills at the bottom of the output
- At ingest time, when the LLM writes an entity page, there is zero enforcement — it can synthesise a claim no source supports and write it as fact
- That unsourced claim sits in the wiki, gets picked up by future queries, and gets cited as if it were real intelligence
- There is no "unsourced" state — a claim either exists in the wiki or it does not, there is no middle ground
- Conflicts between sources are silently overwritten, not flagged

### How We Solve It
- Every sentence-level claim on a wiki page must carry an inline footnote at write time — enforced in the schema, not optional
- If the LLM cannot point to a source in `raw/` for a claim, it must mark it `⚠ Unsourced — needs verification` rather than writing it as fact
- When a new source contradicts an existing claim, the LLM writes a `⚠ Conflict:` callout naming both sources — never overwrites silently
- Web knowledge and general LLM knowledge is only allowed as explicitly marked background — never as a load-bearing fact
- Every ingested source gets its own `wiki/sources/<slug>.md` page — sources become first-class pages, not just footnotes
- User verbal context shared in chat is captured as a dated `raw/` file so it is sourced like everything else
- The core shift: citation discipline moves from the output layer to the write layer

---

## GAP 5 — The Filter Scores Relevance, Duplication, and Value — But Not Source Credibility

### The Gap
- The Maker-Checker filter scores three dimensions: relevance, duplication, incremental value — none of these is credibility
- A confidently-written Reddit rumour and an RBI filing go through exactly the same filter on the same axes
- The source trust hierarchy exists in prose ("marketing pages lie, T&C pages are truth") but never actually enters the scoring — it is a stated principle the filter ignores
- A high incremental-value claim from a low-trust source can sail through the filter and land in the wiki as fact
- The only outcomes are accept or reject — there is no state for "interesting but the source is weak, treat with caution"

### How We Solve It
- Add credibility as an explicit fourth scoring dimension in the Maker-Checker rubric alongside relevance, duplication, and incremental value
- Define a fixed source trust ladder the filter applies mechanically:
  - **T1 Primary** — RBI/NPCI filings, regulator documents, card T&Cs — full trust
  - **T2 Reported** — Livemint, ET, credible press with named sources — high trust
  - **T3 Aggregated** — industry reports, analyst notes — medium trust
  - **T4 Anecdotal** — Reddit, Twitter, Glassdoor, anonymous forums — low trust, never load-bearing
- The credibility tier becomes a hard modifier on the final score — a T4 source cannot score above a threshold regardless of incremental value
- Add a first-class `Interesting / Unverified` state as a filter outcome alongside approve and reject — T4 sources with high incremental value land here, flagged for the curator to verify before promoting
- Every wiki page displays the credibility tier of its source so readers always know what kind of evidence a claim rests on

---

## GAP 6 — The System Is Pull-Only — The Highest-Value CEO Feature (Push) Is Missing

### The Gap
- The entire system is pull-only — a user has to remember to open it and ask a question
- The crawler generates change events but they get filed silently into the wiki — no one is notified
- For a CEO the highest-value moment is not "I wonder what's happening" — it is "something just changed that affects Scapia, here's what it means"
- A system that requires the user to initiate every interaction will get opened once and forgotten

### How We Solve It
- Build a material-change detection → Scapia-implication → notify pipeline: when a significant change is detected (competitor pricing move, RBI circular, reward devaluation), the system generates a brief and pushes it — not just files it
- The alert is not "Axis Atlas devalued miles" — it is "Axis Atlas devalued miles 30%, here's why that matters to Scapia's positioning right now"
- The full push layer design, homepage structure, and wiki browser layout will be shaped after inputs from Karthik and Rathina — they are the primary users and their view on what intelligence they actually want surfaced will define how this is built

---

## GAP 7 — The Input Model Contradicts the Core Thesis

### The Gap
- The prototype argues maintenance fails because humans get busy — then puts the entire sourcing burden on humans (contributors clipping signals, a curator reviewing weekly)
- The LLM removes the bookkeeping burden, not the sourcing burden — and sourcing is exactly what the thesis says always collapses
- For a company Scapia's size, asking a PM to clip a Reddit thread for a wiki they don't own is a behaviour that will not stick without a strong reason
- There is no incentive model and no answer to what makes contribution stick

### How We Solve It
- Acknowledge the gap honestly: the LLM compounds and maintains, humans still have to feed it — that is the correct framing
- Do not solve org-wide contribution in Phase 1 — curator + crawler is the deliberate choice
- One disciplined curator feeding the system is infinitely more sustainable than ten PMs who contribute twice and stop
- Org-wide contribution becomes viable in Phase 2 once the push layer works — if a PM receives a useful alert from the system, they will start feeding it because they see what comes back
- The incentive model answers itself when the output is valuable enough
