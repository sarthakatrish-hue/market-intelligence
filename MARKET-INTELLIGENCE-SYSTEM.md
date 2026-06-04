# Market Intelligence System
---
## 1. Problem Statement
### 1.1 The Situation
Competitive and regulatory intelligence at a fast-paced organisation tends to be distributed — across people, conversations, and documents. When a leader needs it, they ask around internally, do a quick search, or work off whatever was last remembered. That is not a failure of effort. It is what happens when there is no designated place for intelligence to live.
### 1.2 The Problem
Distributed intelligence has four properties that make it dangerous at scale:
1. **It doesn't persist** — beyond the person who holds it. When they leave, switch teams, or simply forget, the intelligence leaves with them.
2. **It isn't shared uniformly** — different people have different pieces of the picture. No one has the whole picture.
3. **It degrades silently** — yesterday's competitive insight becomes today's stale assumption without anyone noticing.
4. **It requires active effort to retrieve every time** — someone has to go looking, and what they find depends on who they ask and what that person happens to remember.
The gap this creates is direct: no single, trustworthy, always-current view of competitors. No single source of truth on the regulatory landscape.
### 1.3 The Cost of the Gap
This gap is not abstract. It shows up as:
- **Decisions made on stale information** — a strategic call based on a competitor's position from six months ago, not today
- **Duplicated research effort** — two people in different teams separately reading the same report, reaching different conclusions, neither knowing the other did it
- **Regulatory signals that surface too late** — a compliance shift visible in public filings three months before it became a problem, but no one was watching

The typical attempts to fix this — a Confluence wiki, a shared Notion doc, a Slack channel pinned with links — all fail the same way. They require humans to do the maintenance. Humans get busy. The maintenance stops. The wiki goes stale. Within weeks it is trusted by no one, used by no one, and the org reverts to asking around. This is not a discipline problem. It is a structural one. Maintenance burden grows faster than value when humans are responsible for keeping it current.
---
## 2. The Technical Architecture — LLM Wiki
### 3.1 The Core Pattern
Standard document AI retrieves chunks at query time and re-derives an answer from scratch on every question. Nothing accumulates. This system works differently — the LLM reads each source at ingest, extracts the intelligence, and integrates it into a persistent wiki. Knowledge is compiled once and kept current. The 50th source enriches an existing structure rather than adding to a pile.

**Note:** The insight that persistent, compounding memory is more valuable than on-demand retrieval is not new. Mem0 applies it to conversational AI — giving assistants memory of past user interactions across sessions. This system applies the same insight to a different problem: not remembering what a user said, but building an organisation's collective picture of a market.
### 3.2 Three Layers
**Raw sources** — immutable. The LLM reads from these, never modifies them. The audit trail.
**The wiki** — LLM-maintained markdown files. One page per competitor, regulation, and market event. The LLM creates pages, updates them on every ingest, maintains cross-references, flags contradictions. A human never writes a wiki page directly.
**The schema** — a configuration file defining page types, structure, and the exact workflows the LLM follows. This is what makes the LLM a disciplined wiki maintainer rather than a generic assistant.
### 3.3 Three Operations
**Ingest** — source enters, LLM reads it, runs the filter, integrates signal into relevant pages. Contradictions flagged immediately.
**Query** — leader asks a question, LLM reads relevant pages, returns a sourced answer with citations traceable to specific pages and sources. Answers worth keeping are filed as synthesis pages.
**Lint** — periodic health check. Scans for contradictions, stale claims, orphan pages, missing cross-references, and gaps. Detects and flags — never silently fixes.
### 3.4 Optimising for Scale
The base pattern works at small source counts but requires deliberate optimization as the wiki grows. Each introduced when it solves a real problem — not speculatively.
- **Hybrid search (BM25 + vector)** — replaces the flat index for navigation
- **Graph traversal** — activates cross-references at query time
- **Vector database** — for scalable page retrieval
- **Prompt caching** — reduces API cost on repeated page reads
- **Split lint** — structural (automated, daily) + semantic (LLM-powered, weekly)
---
## 3. The User Model — Three Roles
Three roles. Each with a distinct, non-overlapping relationship to the system.

**Contributors — the whole org.** Anyone who spots a relevant signal in their daily work. They submit it in under a minute and move on. No research, no curation. That is the entirety of their interaction.

**Curators — one reviewer.** Approves submissions, resolves contradictions flagged by lint, directs gaps. The system does the bookkeeping. The curator does the thinking. ~30–60 minutes a week.

**Queriers — leaders.** Entirely on the output side. Ask a question, get a sourced answer. They never see the ingestion flow or the wiki structure.

The model changes who owns the intelligence. Currently it lives with whoever did the research. In this system it lives in the wiki — contributed by everyone, curated by one, accessible to all.

| Role | Who | What they do | Time |
|---|---|---|---|
| Contributor | Whole org | Submit signals encountered in daily work | 45 seconds per submission |
| Curator | Reviewer | Review, approve, resolve contradictions, direct gaps | 30–60 mins per week |
| Querier | Leaders | Ask questions, act on answers | As long as asking a question |
---
## 4. The Two Types of Intelligence — And Why They Need Different Treatment
Uniformity means something different depending on the type of intelligence. Treating both types the same way is a design mistake.
### 4.1 Regulatory Intelligence — One Authoritative Conclusion
Compliance is binary. Multiple interpretations of the same requirement don't produce richer understanding — they produce compliance risk. The system produces one clear, sourced conclusion: what the regulation requires and what the organisation must do. If two authoritative sources genuinely disagree, the page is marked disputed and routed for human resolution. A leader never gets a confidently wrong answer on a regulatory question.
### 4.2 Competitive Intelligence — Additive, Not Reductive
Competitive intelligence is not binary. Different teams seeing different dimensions of the same competitor are not contradicting each other — they're each seeing something real. The problem is not that different views exist. It is that those views never reach each other. The system fixes this by making all perspectives visible to everyone — not by forcing agreement.
### 4.3 What Uniform Actually Means
Uniform does not mean everyone sees the same interpretation. It means everyone has access to the same intelligence.

| | Regulatory | Competitive |
|---|---|---|
| Nature | Binary — compliant or not | Multi-dimensional — multiple valid lenses |
| System output | One authoritative conclusion | Multiple views preserved, synthesis drawn |
| When ambiguous | Flagged as disputed, human resolves | Views held together, tension noted |
| What uniform means | Same conclusion for everyone | Same access for everyone, views additive |
---
## 5. How the System Handles Each Type
### 5.1 Regulatory Pages
One page per regulation. Fixed structure: requirement, effective date, compliance action, source, status. One conclusion only — no perspective sections, ever. If two authoritative sources disagree, the page is marked **Disputed** and flagged for human resolution. The system never silently picks a side.
```
What it requires:   [precise description]
Effective date:     [date]
Compliance action:  [what the org must do]
Source:             [filing reference]
Status:             Confirmed / Disputed
```
### 5.2 Competitive Entity Pages
One page per competitor. Divided into view sections — only sections with source evidence are populated, empty sections omitted. A second source never creates a new page — it enriches the existing one. Prior content is never overwritten; it is extended. This is how competitive intelligence compounds.
```
Positioning view:   [pricing, market moves, commercial signals]
Capability view:    [product direction, technical choices, roadmap]
Perception view:    [user sentiment, reviews, switching reasons]
Synthesis:          [cross-view picture, drawn across all populated sections]
```
### 5.3 Views
Views describe what dimension of a competitor a signal reveals — not which team submitted it. A contributor tags by signal type, not by role.

| View | What it captures |
|---|---|
| **Capability** | What they're building — product direction, technical choices, roadmap |
| **Positioning** | How they compete — pricing, messaging, partnerships, market moves |
| **Perception** | How the market sees them — sentiment, reviews, switching reasons |
| **Regulatory** | Compliance signals — routes to a regulatory page, not an entity page |
---
## 6. Source Types
Four source types cover the full signal space — each with a different collection mechanism, trust profile, and handling requirement.

| Type | What it is | How it enters |
|---|---|---|
| **Formal** | Regulatory filings, earnings calls, analyst reports, press releases, patent filings | Submitted by curators. High credibility, low frequency. |
| **Informal** | Reddit threads, Twitter/X, engineering blogs, Hacker News, podcasts | Submitted by contributors via browser extension. Variable credibility, high frequency. The gap between what a competitor claims and what the market experiences lives here. |
| **Tracked** | Competitor pricing pages, App Store listings, job boards, review sites, RSS feeds | Automated crawler monitors and diffs. Zero human effort. Filter triggered on change. |
| **Direct** | Sales calls, conference conversations, competitor demos, off-the-record contacts | Submitted via the platform's submit page — the only source type with no URL. Contributor adds 1–3 sentences, tags confidence level. Corroborated when multiple contributors report the same signal independently. |
---
## 7. How Sources Enter the System
### 7.1 Browser Extension — Formal, Informal, Tracked
The primary submission interface for contributors. Installed once. Contributors never visit the platform to submit.

**Note:** Browser-based capture tools like Obsidian Web Clipper solve the same collection problem — one click saves a page. The difference is the destination: web clippers save to a personal notes folder. This extension sends directly into the intelligence pipeline, tagged, routed, and filter-scored before the contributor has moved to their next tab.

On any page a contributor is already viewing, one click opens a lightweight popup:
```
View:    [ Capability ]  [ Positioning ]  [ Perception ]  [ Regulatory ]
Note:    [ optional one-line context                                     ]
         [ Send ]
```
The extension extracts and cleans the page content, converts it to markdown, writes it to the correct source folder, and triggers the filter. The contributor sees the filter result — accepted or rejected with a reason — without leaving the page they are on.

For Tracked sources, the extension is not involved. The crawler handles collection entirely automatically and feeds into the same pipeline.
### 7.2 Submit Page — Direct Sources Only
The platform's submit page is reserved exclusively for Direct signals — insights from human experience that have no URL. The interface is purpose-built for this single source type:
```
What did you learn?        [ text area ]
Which competitor?          [ dropdown  ]
Which view?                [ Capability / Positioning / Perception / Regulatory ]
How confident are you?     [ High / Medium / Uncertain ]
                           [ Submit ]
```
No URL field. No file upload. Just what the contributor learned, where it belongs, and how confident they are. The only reason anyone visits the submit page.
### 7.3 Automated Crawler — Tracked Sources
A scheduler runs at a configured interval — hourly for high-priority pages, daily for standard monitoring. For each monitored URL it fetches the current page, diffs it against the stored version, and if content has changed writes the diff to the source collection and triggers the filter.

The filter treats crawled content the same as any other source — Maker scores it, Checker runs if borderline, curator reviews if uncertain. The only difference is upstream: no human was involved in spotting or submitting the signal. The wiki grows while the team sleeps.

**Note:** Automated competitor monitoring is the core product of tools like Crayon, Klue, and Kompyte — they crawl competitor touchpoints and surface changes as a feed. The distinction here is downstream: crawled signals don't surface as a feed, they flow into the wiki and are synthesised against everything already known about that competitor.
---
## 8. The Filter — How the Wiki Stays Clean
### 8.1 Why a Filter
Org-wide contribution means volume. Volume without a filter means noise — duplicate sources, generic listicles, low-signal content — reaching the wiki and degrading the intelligence it holds. The filter exists to ensure the wiki only sees what is genuinely new and genuinely useful. Everything else is stopped before it touches a single page.
### 8.2 The Layers
**Layer 1 — Automated scoring (zero human effort)**
Every submission is scored automatically across three checks: relevance (does this connect to anything the wiki already knows?), duplication (does this add anything the wiki doesn't already know?), and incremental value (what does this actually contribute?). Clear passes and clear rejects are routed instantly. Only the uncertain middle band reaches the next step.
**Layer 2 — Curator review (10–30 seconds per item)**
Submissions that pass Layer 1 but remain uncertain reach the curator as a pre-enriched card — source type, entities mentioned, which wiki pages it would update, both filter scores and the reason each was given. The curator approves or rejects in one click. They are reviewing the system's assessment, not re-reading the source.
### 8.3 The Filter Architecture
No single technique covers the full problem. The filter needs two things: a reliable score and a reliable confidence signal. These are different problems solved by different techniques.

| Problem | Technique | Why |
|---|---|---|
| Producing the score | LLM-as-Judge with explicit rubric | Structured, auditable, improves with better prompting |
| Producing the confidence signal | Maker-Checker | Disagreement = uncertainty, emerges naturally |
| Improving over time | Evaluation Framework | Curator approvals and rejections become labelled ground truth |
| Multi-pass structure | Borrowed from Autoresearch | Relevance, duplication, quality scored as separate checks, not one blended judgement |

Concretely, Layer 1 runs in two steps:

**Maker** scores the source across three criteria using a structured rubric. Produces a score and a routing recommendation. If the score is 8–10, the source is auto-approved — Checker skipped entirely. If the score is 1–3, the source is auto-rejected — Checker skipped entirely. Only a score of 4–7 triggers the Checker.

**Checker** runs the same three checks independently, with no visibility into the Maker's score. This independence is what produces the confidence signal — if both arrive at the same conclusion, that agreement is genuine. If they diverge, the divergence is meaningful.
### 8.4 Checker Outcomes
| Outcome | Condition | Action |
|---|---|---|
| A | Checker scores 8–10 | Auto-approve — Checker upgraded the borderline Maker call |
| B | Checker scores 1–3 | Auto-reject — Checker downgraded the borderline Maker call |
| C | Both 4–7, scores within 1–2 pts | Layer 2 — borderline card, curator reviews |
| D | Both 4–7, scores diverge 3+ pts | Layer 2 — disagreement card, curator reviews |

Layer 2 is only ever triggered by Outcomes C and D. Clear signals — in either direction — never reach the curator.
### 8.5 Edge Cases
**The duplicate**
A source already fully ingested is submitted again. Maker runs the duplication check — every data point in the source already exists in the wiki. Maker scores 2/10. Auto-rejected. Checker never runs. Layer 2 never sees it. Zero pages written. The log records the rejection with the reason.

**The ambiguous source**
A source mixes regulatory enforcement signals with competitive landscape data. Maker scores 5/10 — relevant, not a duplicate, but the source type is genuinely ambiguous. Checker runs independently and scores 6/10 for the same reason. Both in the 4–7 band, scores within 1 point → Outcome C. A Layer 2 card is presented to the curator with both scores, both reasons, and action options — Split, Regulatory only, Competitive only, Reject. Curator selects Split. Both treatments applied, both logged.

**The Checker upgrade**
A source contains genuine new signal buried in a long post with significant noise. Maker scores 5/10, uncertain whether the signal justifies the noise. Checker reads it independently, isolates the signal, and scores 9/10 — clear incremental value. Outcome A: auto-approved. The Maker's borderline call is overridden by the Checker's confident one. The signal reaches the wiki; the curator never had to intervene.
