# Scapia Market Intelligence — Deployment Architecture

Living architecture document for the production deployment of the Scapia Market Intelligence wiki. Captures every decision locked during planning so the next person (or future-you) can read this once and understand the whole system.

This document is the **plan**, not the **runbook**. The runbook (exact commands, env vars, step order) comes after this is approved.

> **Up to date with `DEPLOYMENT-SPECIFICATIONS.html` (v1).** Patched: query thread storage moved from localStorage to Postgres (§7); cost caps expanded from 3 layers to 8 layers including circuit breaker, per-minute rate limit, concurrent semaphore, and cost velocity tripwire (§9); names generalized from Karthik/Rathina to "leaders".

---

## 1. Overview

The current system is file-based and runs entirely on the maintainer's laptop via Claude Code. The deployed system is a hosted SaaS with:

- A **leader-facing read surface** for executives (leaders) — browse the wiki, ask questions, receive a daily digest.
- A **curator-facing workbench** for whoever runs ingestion — submit raw sources, watch jobs run, review Layer 2 cards, audit ingest logs.

The same `CLAUDE.md` that drives Claude Code today drives the hosted agent in production. Zero schema drift between local and prod.

---

## 2. Topology

```
┌─────────────────────────────────────────────────────────────────┐
│  Vercel (free tier)                                             │
│  scapia-intel.vercel.app                                        │
│  React + Vite, single app, route-split:                         │
│    /             → leader surfaces                              │
│    /curator/*    → curator surfaces (role-gated)                │
└──────────────────────────┬──────────────────────────────────────┘
                           │ HTTPS + Bearer JWT
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  Render (free tier + keepalive)                                 │
│  FastAPI, single Python process                                 │
│  - HTTP endpoints (read + write + internal)                     │
│  - Agent runtime (Claude Agent SDK + CLAUDE.md verbatim)        │
│  - BackgroundTasks for async ingest                             │
│  - Streaming for /api/query (SSE)                               │
└──────────┬───────────────────────────┬──────────────────────────┘
           │                           │
           ▼                           ▼
   Anthropic API                Supabase (Postgres + Storage + Auth)
   - Sonnet 4.7 default         - pages, sources, ingest_jobs,
   - Agent loop for ingest        ingest_log, query_threads,
   - Single call for query        query_log, ingest_cost_log,
                                   subscribers, digest_log, user_profiles
                                 - raw-sources bucket
                                 - Magic-link auth
                                 - pg_cron: daily digest,
                                   nightly snapshot, 14-min keepalive
                          │
                          ▼
                   Resend (daily digest)
                          │
                          ▼
                   Subscriber inboxes
```

Six external services: **Vercel, Render, Supabase, Anthropic, Resend, GitHub.**

---

## 3. What's locked

| # | Layer | Decision |
|---|---|---|
| 1 | Strategy | Path B — full agent in cloud (not just a read-only viewer) |
| 2 | Recipients | Mixed — leaders read; curator submits |
| 3 | Frontend host | Vercel free tier |
| 4 | Frontend split | One app, two route trees (`/` leader, `/curator/*` curator). Curator sidebar is a superset of leader sidebar. |
| 5 | Roles | `leader` and `curator` only. No `admin`. User management via Supabase Studio. |
| 6 | Backend host | Render free tier + keepalive ping every 14 min |
| 7 | Framework | FastAPI (async, Pydantic validation, OpenAPI auto-docs) |
| 8 | Process model | Single FastAPI process + `BackgroundTasks` + restart-recovery cleanup on startup |
| 9 | Database | Supabase Postgres + Storage bucket + Auth |
| 10 | Storage shape | **Hybrid** — `body` markdown verbatim + denormalized columns + `intel_section jsonb` |
| 11 | Write validation | Hard contract — write rejected if mandatory section or anchors missing |
| 12 | Sources feed row | Postgres trigger on `folder='sources'` writes |
| 13 | Parser location | In the backend, called inside `write_page` tool |
| 14 | Agent runtime | Anthropic Python SDK + Claude Agent SDK |
| 15 | Agent system prompt | `CLAUDE.md` bundled at deploy time, loaded once at startup, sent verbatim on every agent run |
| 16 | Tool surface | 7 tools: `read_raw`, `list_pages`, `read_page`, `write_page`, `upload_raw`, `append_log`, `mark_layer2` |
| 17 | Query worker | Single Anthropic call, no agent loop, all-pages context for v1, SSE streaming |
| 18 | Error handling | Agent self-corrects via structured tool errors; 30-iteration max; stuck detection; SDK-native Anthropic backoff |
| 19 | Observability | Full `agent_trace` persisted per job; Sentry on failed jobs and 500s |
| 20 | Auth | Supabase Auth magic-link email; JWT verified server-side; `user_profiles.role` lookup per request |
| 21 | Internal endpoints auth | `X-Internal-Secret` header for cron-triggered routes |
| 22 | Cost caps + rate limits + circuit breaker | 8 layers: circuit breaker · per-minute rate · concurrent semaphore · per-user daily · cost velocity · monthly hard kill · per-ingest cap · iteration ceiling |
| 23 | Background jobs | Three: daily digest (09:00 IST), nightly git snapshot (03:00 IST), keepalive (every 14 min) — all `pg_cron` → `/internal/*` |
| 24 | Email | Resend, daily digest only (no per-event push in v1) |
| 25 | Email skip rule | No new sources in last 24h → no email sent |

---

## 4. Frontend

### 4.1 Routing

```
Leader surfaces (visible to leader + curator):
  /                       → Home (query input + answer view)
  /vault                  → Browse all wiki pages with filters
  /intel-cards            → 5-tab Intel Cards (Competitor, Regulatory,
                            Partner, Market Signal, Customer Signal)
  /sources                → Live "What's New" feed
  /account                → Profile, daily usage, digest preference

Curator surfaces (curator only, returns 403 for leader):
  /curator/submit         → Submit raw source (paste markdown or upload file)
  /curator/jobs           → Async ingest job queue + live status
  /curator/jobs/:id       → Single job with full agent_trace
  /curator/layer2         → Borderline cards review queue
  /curator/lint           → (cut to v2)
  /curator/log            → Append-only ingest log
```

### 4.2 Sidebar shape

```
Leader sidebar (role='leader'):
  Home
  Intel Cards
  Vault
  Sources
  Account

Curator sidebar (role='curator'):
  [all of leader sidebar]
  ─────────────
  CURATOR
    Submit
    Jobs
    Layer 2
    Ingest Log
```

Frontend role gating is convenience — the backend is the security boundary.

### 4.3 Cleanup needed before deploy

| File / dir | Action |
|---|---|
| `frontend/` (legacy v0) | Delete |
| `frontend-react/src/data/intelCards.js` | Delete (dead Calibre demo data) |
| Hardcoded `/api` proxy | Replace with `import.meta.env.VITE_API_URL` |
| Missing `vercel.json` | Add SPA rewrites so `/vault` etc. don't 404 on refresh |
| `MI.d` token duplication | Hoist into one shared `tokens.js` module |
| Bundle size warning (919KB) | Code-split `/curator/*` via `React.lazy()` |

---

## 5. Backend

### 5.1 File layout

```
backend/
├── main.py                  FastAPI app, mounts routers, CORS, JWT middleware
├── settings.py              env: ANTHROPIC_API_KEY, SUPABASE_URL,
│                                  SUPABASE_SERVICE_KEY, RESEND_API_KEY,
│                                  INTERNAL_SECRET, all cost cap thresholds,
│                                  model name (default: claude-sonnet-4-7)
├── deps.py                  get_user(), require_role(), require_internal()
├── supabase_client.py       typed wrapper around supabase-py
├── parser.py                markdown → intel_section jsonb
├── validator.py             per-type frontmatter + body schema checks
├── routes/
│   ├── public.py            /api/me, /api/pages, /api/page, /api/intel-cards,
│   │                        /api/feed, /api/sources
│   ├── leader.py            /api/query (SSE)
│   ├── curator.py           /api/submit, /api/jobs, /api/jobs/{id},
│   │                        /api/layer2/{id}/decide, /api/ingest-log
│   └── internal.py          /internal/send-digest, /internal/git-snapshot,
│                            /internal/keepalive
├── agent/
│   ├── client.py            Anthropic client + Agent SDK setup
│   ├── tools.py             7 tools — registered with Agent SDK
│   ├── ingest_worker.py     run_ingest_job(job_id, user_id)
│   ├── query_worker.py      run_query(question, user_id) — plain SDK, not agent
│   └── prompts.py           loads CLAUDE.md + QUERY_PROMPT template
├── jobs/
│   ├── digest.py            builds HTML, sends via Resend
│   └── snapshot.py          pages → markdown → GitHub API → snapshots branch
├── CLAUDE.md                copied from repo root on deploy
├── Dockerfile               python:3.12-slim base
└── requirements.txt
```

### 5.2 Endpoint map

| Method | Path | Auth | Returns |
|---|---|---|---|
| GET | `/api/me` | JWT | `{user, role, daily_usage}` |
| GET | `/api/pages?folder=&type=` | JWT | page summaries (no body) |
| GET | `/api/page/{path*}` | JWT | `{meta, body, intel_section}` |
| GET | `/api/intel-cards` | JWT | all pages with intel_section |
| GET | `/api/feed` | JWT | sources DESC limit 50 |
| GET | `/api/sources` | JWT | leader sanitized, curator full |
| POST | `/api/query` | JWT (leader+curator) | **SSE stream** |
| POST | `/api/submit` | JWT (curator) | `{job_id}` |
| GET | `/api/jobs?status=&limit=` | JWT (curator) | list of jobs |
| GET | `/api/jobs/{id}` | JWT (curator) | single job + agent_trace |
| POST | `/api/layer2/{id}/decide` | JWT (curator) | resumes ingest |
| GET | `/api/ingest-log?limit=` | JWT (curator) | log rows |
| POST | `/internal/send-digest` | X-Internal-Secret | daily digest |
| POST | `/internal/git-snapshot` | X-Internal-Secret | nightly snapshot |
| POST | `/internal/keepalive` | X-Internal-Secret | 200 OK |

### 5.3 Process model

One FastAPI process on Render free tier (512MB RAM, 0.1 CPU). Handles HTTP requests, runs the agent loop in BackgroundTasks, serves cron-triggered internal endpoints.

**Why single process:** Render free tier provides one VM; splitting web/worker requires a second paid VM. For 2–5 users, one process is plenty. FastAPI is async-first — while an agent waits on Anthropic (most of its 20–40s), other requests share the event loop without blocking.

**Concurrency budget:**
- ~1–2 concurrent ingest jobs fit in memory
- Leader requests during active ingest: ~100ms extra latency, otherwise unaffected

**Restart recovery (5 lines on startup):**
```python
@app.on_event("startup")
async def cleanup_orphaned_jobs():
    await supabase.from_("ingest_jobs") \
        .update({"status": "failed", "error": "interrupted by restart"}) \
        .eq("status", "running") \
        .lt("updated_at", now() - timedelta(minutes=5)) \
        .execute()
```

---

## 6. Agent runtime

### 6.1 Mental model

**Plain Anthropic call:** one in, one out.
**Agent loop:** repeated calls where Claude decides between (a) calling a tool or (b) returning final text. Each iteration is one API call. Loop exits on final text or max iterations (30).

The **Claude Agent SDK** wraps this loop:
- Tools defined as decorated Python functions
- Message-history bookkeeping handled
- Tool-result injection handled
- Streaming + retries handled

### 6.2 CLAUDE.md as system prompt

```python
CLAUDE_MD = (Path(__file__).parent.parent / "CLAUDE.md").read_text()

agent = ClaudeAgent(
    system_prompt=CLAUDE_MD,        # all ~900 lines, verbatim
    tools=ALL_TOOLS,
    model=settings.ANTHROPIC_MODEL,
    max_iterations=30,
)
```

A small **Tool Usage** section is added near the top of `CLAUDE.md` to tell the agent: use `read_raw(path)` instead of bash to read raw files; use `write_page(...)` instead of writing files. Same file works for both local Claude Code and hosted agent.

### 6.3 The 7 tools

| Tool | Purpose |
|---|---|
| `read_raw(path)` | Download a raw source from Storage |
| `list_pages(folder?, page_type?)` | List wiki pages with summary fields |
| `read_page(path)` | Return `{frontmatter, body, intel_section}` for one page |
| `write_page(path, frontmatter, body)` | Validate, parse, upsert. **Hard contract** — rejects on missing mandatory section/anchors |
| `upload_raw(path, content)` | For user-verbal-context capture per CLAUDE.md |
| `append_log(operation, description)` | Add to append-only ingest_log table |
| `mark_layer2(...)` | Surface Layer 2 review card, stops workflow, writes no pages |

**Tools deliberately NOT given:** `delete_page`, `run_sql`, `web_search`, `fetch_url`, `send_email`, `git_commit`, `decide_layer2`. Each absence is a misuse the agent cannot commit.

### 6.4 Query worker — different shape

Query is NOT an agent loop. Single Anthropic call with pre-assembled context:

```
1. enforce_cost_cap(user.id)
2. assemble_context()           # SELECT body FROM pages → concat (v1: all pages, ~26K tokens)
3. anthropic.messages.stream(   # SSE-style streaming
     system=QUERY_PROMPT,
     messages=[{role:"user", content:prompt}],
   )
4. log_query(user_id, question, answer, tokens, cost)
```

Context strategy scales:
- **v1 (~13 pages):** include all
- **~50–150 pages:** folder-filtered inclusion
- **150+ pages:** Supabase pgvector semantic search

### 6.5 Error handling

| Class | Recovery |
|---|---|
| Tool error (validation failure) | Agent self-corrects in next iteration |
| Anthropic rate limit / 5xx | SDK retries 3× with exponential backoff |
| Max iterations (30) hit | Job fails with trace excerpt |
| Stuck loop (same tool+args fails 3×) | Job fails |
| Render restart mid-job | Startup cleanup marks `status='failed'` — curator retries |
| Cost cap pre-flight | 429 to curator, no job created |
| Cost cap mid-ingest | Job ends `status='cost_capped'`, partial work discarded |

Every job (success or failure) persists full `agent_trace` jsonb — iteration-by-iteration tool calls + results. Curator opens any past job to audit.

Sentry receives: failed ingest jobs, non-Anthropic 500s, frontend `window.onerror`.

---

## 7. Database

### 7.1 Hybrid storage shape for pages

```sql
CREATE TABLE pages (
  path text PRIMARY KEY,
  folder text NOT NULL,
  slug text NOT NULL,
  type text NOT NULL,
  page_types text[] DEFAULT '{}',
  domains text[] DEFAULT '{}',
  travel_categories text[] DEFAULT '{}',
  headline text,
  signal text,
  vitals jsonb,
  posture text,
  frontmatter jsonb NOT NULL,
  body text NOT NULL,                 -- canonical markdown the agent wrote
  intel_section jsonb,                -- pre-parsed, frontend reads directly
  last_updated date,
  sources_count int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX pages_folder_idx       ON pages(folder);
CREATE INDEX pages_page_types_gin   ON pages USING gin(page_types);
CREATE INDEX pages_domains_gin      ON pages USING gin(domains);
CREATE INDEX pages_signal_idx       ON pages(signal);
CREATE INDEX pages_posture_idx      ON pages(posture);
CREATE INDEX pages_updated_at_desc  ON pages(updated_at DESC);
```

### 7.2 Other tables

```sql
-- Sources feed
CREATE TABLE sources (
  slug text PRIMARY KEY,
  headline text NOT NULL,
  source_title text,
  source_file text,
  ingested_at timestamptz NOT NULL,
  touches text[] DEFAULT '{}',
  primary_entity text,
  signal text,
  page_types text[] DEFAULT '{}',
  domains text[] DEFAULT '{}',
  filter_score int,
  filter_band text
);

-- Async ingest jobs
CREATE TABLE ingest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_path text NOT NULL,
  submitted_by uuid REFERENCES auth.users(id),
  status text NOT NULL,
  agent_trace jsonb,
  result jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
-- status: 'queued' | 'running' | 'completed' | 'layer2' | 'rejected' | 'failed' | 'cost_capped'

-- Append-only log
CREATE TABLE ingest_log (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz DEFAULT now(),
  operation text NOT NULL,
  description text NOT NULL
);

-- Query threads — groups follow-ups (moved from localStorage to Postgres for cross-device)
CREATE TABLE query_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id),
  title text,                         -- auto-derived from first question
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
CREATE INDEX query_threads_user_updated_idx ON query_threads(user_id, updated_at DESC);

-- Per-turn record · doubles as cost-tracking row
CREATE TABLE query_log (
  id bigserial PRIMARY KEY,
  thread_id uuid REFERENCES query_threads(id) ON DELETE CASCADE,
  position int NOT NULL,              -- 1, 2, 3 ... turn order within thread
  user_id uuid REFERENCES auth.users(id),
  question text NOT NULL,
  answer text,
  pages_read text[],
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,4),
  created_at timestamptz DEFAULT now()
);
CREATE INDEX query_log_thread_position_idx ON query_log(thread_id, position);

-- Note: query_threads + query_log live ALONGSIDE pages, never JOINed with it.
-- Wiki/queries separation preserved — queries are scoped by user_id, never
-- written back into the wiki.

CREATE TABLE ingest_cost_log (
  job_id uuid REFERENCES ingest_jobs(id),
  user_id uuid REFERENCES auth.users(id),
  input_tokens int,
  output_tokens int,
  cost_usd numeric(10,4),
  created_at timestamptz DEFAULT now()
);

-- Roles
CREATE TABLE user_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text,
  role text NOT NULL CHECK (role IN ('leader', 'curator')),
  created_at timestamptz DEFAULT now()
);

-- Digest
CREATE TABLE subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text,
  role text,
  paused boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE digest_log (
  id bigserial PRIMARY KEY,
  sent_at timestamptz DEFAULT now(),
  subscriber_email text,
  source_slugs text[],
  resend_message_id text
);
```

### 7.3 Views

```sql
-- Powers per-user cost cap checks
CREATE VIEW user_daily_usage AS …  -- aggregates query_log + ingest_cost_log

-- Powers monthly hard kill
CREATE VIEW monthly_spend AS …     -- SUM cost_usd across both cost tables, current month
```

### 7.4 Triggers

- Postgres trigger on `pages` INSERT/UPDATE where `folder = 'sources'` derives the matching `sources` row from `frontmatter` jsonb. Agent calls one tool; trigger handles consistency.

### 7.5 Storage bucket

- `raw-sources/` — all raw markdown/text source files
- Paths mirror the current `raw/competitive/...` etc. structure
- Immutable in practice (no delete endpoint exposed to agent)

---

## 8. Auth & roles

### 8.1 Flow

```
1. User → /login → enters email
2. supabase.auth.signInWithOtp({email})
3. Supabase sends magic link
4. Click → /auth/callback → session JWT in localStorage
5. Frontend: GET /api/me with Bearer JWT
6. Backend verifies JWT (cached JWKS), looks up user_profiles.role
7. Returns {user, role, daily_usage}
8. Frontend renders role-appropriate UI
```

### 8.2 Backend enforcement

```python
async def get_user(authorization: str = Header()) -> User:
    claims = jwt.decode(token, JWKS, algorithms=["RS256"], audience="authenticated")
    profile = await supabase.from_("user_profiles") \
        .select("role, name").eq("user_id", claims["sub"]).single().execute()
    return User(id=claims["sub"], email=claims["email"], role=profile.data["role"])

def require_role(*allowed: str):
    async def checker(user: User = Depends(get_user)):
        if user.role not in allowed:
            raise HTTPException(403)
        return user
    return checker
```

Auth overhead per request: ~6ms (1ms JWT verify + 5ms profile lookup).

### 8.3 Internal endpoints

```python
async def require_internal(x_internal_secret: str = Header()):
    if not secrets.compare_digest(x_internal_secret, settings.INTERNAL_SECRET):
        raise HTTPException(403)
```

`INTERNAL_SECRET` lives in Render env vars and Supabase database setting `app.internal_secret`. No path to escalate from JWT to internal access.

### 8.4 Day-0 seeding

```
1. Create Supabase project, run migrations
2. Supabase Studio → Auth → invite you by email
3. Click magic link → user.id created in auth.users
4. Studio → Table Editor → user_profiles → INSERT (your user_id, 'You', 'curator')
5. Repeat steps 2 + 4 for each leader and additional curator
```

10 minutes total. Documented in runbook with copy-paste SQL.

---

## 9. Cost caps, rate limits & circuit breakers

### 9.1 Eight layers of defense — defense in depth

Budget-based guardrails protect total spend. Rate-based guardrails protect against short-window spikes. Health-based guardrails halt the system when Odyssey degrades or costs go anomalous.

| # | Layer | Tier | Threshold (env var) | When checked |
|---|---|---|---|---|
| 1 | Circuit breaker | Pre-flight · health | 5 Anthropic errors / 60s window | Before every Anthropic call |
| 2 | Per-minute rate limit | Pre-flight · rate | `RATE_PER_USER_PER_MIN=8` | Pre-flight on every LLM-triggering action |
| 3 | Concurrent ingest semaphore | Pre-flight · rate | `MAX_CONCURRENT_INGESTS=2` | Before starting an agent loop |
| 4 | Per-user daily query count | Pre-flight · budget | `PER_USER_DAILY_QUERY_COUNT=30` | Pre-flight on `/api/query` and `/api/submit` |
| 4 | Per-user daily input tokens | Pre-flight · budget | `PER_USER_DAILY_INPUT_TOKENS=200000` | Same |
| 4 | Per-user daily output tokens | Pre-flight · budget | `PER_USER_DAILY_OUTPUT_TOKENS=50000` | Same |
| 5 | Cost velocity tripwire | Pre-flight · health | `COST_VELOCITY_HOURLY_USD=5` | Pre-flight on every Anthropic call |
| 6 | Monthly hard kill | Pre-flight · budget | `MONTHLY_HARD_KILL_USD=200` | Pre-flight on every Anthropic call |
| 7 | Per-ingest max input | In-flight · budget | `PER_INGEST_MAX_INPUT_TOKENS=100000` | Between agent iterations |
| 7 | Per-ingest max output | In-flight · budget | `PER_INGEST_MAX_OUTPUT_TOKENS=20000` | Between agent iterations |
| 8 | Iteration ceiling + stuck-loop detection | In-flight · runtime | 30 iterations max · same tool+args fails 3× | Between agent iterations |
| — | Monthly alert | Soft alert | `MONTHLY_BUDGET_ALERT_USD=100` | Anthropic console |

Tokens aggregate across query + ingest under one daily envelope.

### 9.2 The three NEW additions (beyond the original three budget layers)

**Circuit breaker** (layer 1) — in-memory state per Render container. State machine: `closed → open → half-open → closed`. After 5 Anthropic errors in 60s, opens for 60s · all LLM calls return 503 immediately · then a single probe call decides whether to re-close. ~30 lines of Python.

**Concurrent ingest semaphore** (layer 3) — database check before starting an agent loop: `SELECT count(*) FROM ingest_jobs WHERE status='running'`. If ≥ `MAX_CONCURRENT_INGESTS`, the job stays `queued`. Next completing job picks it up. Prevents 3× cost spikes when multiple curators submit simultaneously. ~10 lines.

**Cost velocity tripwire** (layer 5) — single SQL view: `SUM(cost_usd) WHERE created_at > now() - interval '1 hour'`. If above `COST_VELOCITY_HOURLY_USD`, halt all LLM calls + fire Sentry alert. Catches runaway loops and bugs hammering the LLM. Operator must manually reset. ~15 lines + 1 view.

### 9.3 Module layout

All guardrails live in `backend/agent/guardrails/`:

```
backend/agent/
├── client.py           # Anthropic SDK · ALL calls go through guarded_call()
├── tools.py
├── filter.py
├── ingest_worker.py
├── query_worker.py
└── guardrails/         # ★ 6 layers of defense
    ├── circuit_breaker.py  # layer 1
    ├── rate_limit.py       # layer 2
    ├── semaphore.py        # layer 3
    ├── cost_caps.py        # layers 4 + 6 (daily + monthly)
    ├── velocity.py         # layer 5
    └── guarded_call.py     # wraps every Anthropic SDK call
```

Every Anthropic call in the codebase goes through `guarded_call()`. No bypass paths.

### 9.4 User-facing wording

```
429 user_per_minute_rate
  "Slow down — try again in a few seconds."

429 user_daily_query_cap
  "Daily query limit reached (30/30). Resets at 00:00 IST."

429 user_daily_token_cap
  "Daily token usage hit. Resets at 00:00 IST."

202 queued (concurrent semaphore)
  Job appears in /curator/jobs with status='queued', runs when slot frees.

503 circuit_breaker_open
  "LLM gateway temporarily unavailable. Retry in 60s."

503 cost_velocity_tripped
  "System paused — investigating high usage. Try later."

503 monthly_budget_exhausted
  "System paused — monthly budget cap reached. Contact admin to increase."
```

Rendered as inline banners on the affected surface. No alert dialogs. Operator gets a Sentry event for any 503-class trip.

Total v1 implementation cost: ~80 lines of Python · ~5ms latency per Anthropic call. See `DEPLOYMENT-SPECIFICATIONS.html` §9 for the full diagram and table.

### 9.3 /api/me usage display

```json
{
  "daily_usage": {
    "queries_used": 12,
    "queries_limit": 30,
    "input_tokens_used": 84120,
    "input_tokens_limit": 200000,
    "resets_at": "2026-06-02T00:00:00+05:30"
  }
}
```

Surfaces as quiet sidebar text: `12 of 30 queries today · resets 00:00 IST`.

---

## 10. Background jobs

### 10.1 Daily digest — 09:00 IST

- `pg_cron` → POST `/internal/send-digest`
- Queries sources from last 24h
- Skip if zero (don't train people to ignore emails)
- Renders HTML mirroring the "What's New" panel
- Sends to active subscribers via Resend
- Idempotent via `digest_log` table (never sends same day's digest twice)

### 10.2 Nightly git snapshot — 03:00 IST

- `pg_cron` → POST `/internal/git-snapshot`
- Exports all pages → markdown files
- Commits to `snapshots` branch on GitHub via API
- Provides day-granularity audit trail without polluting `main`
- Failure → Sentry, retry next night (Supabase is canonical, no data loss)

### 10.3 Keepalive — every 14 min

- `pg_cron` → POST `/internal/keepalive`
- Returns 200
- Prevents Render's 15-min idle sleep
- Effectively makes free tier always-on

### 10.4 pg_cron setup (one-time)

```sql
SELECT cron.schedule('daily-digest', '0 9 * * *', $$ … $$);
SELECT cron.schedule('nightly-snapshot', '0 3 * * *', $$ … $$);
SELECT cron.schedule('keepalive', '*/14 * * * *', $$ … $$);
```

---

## 11. External services & secrets

| Service | Purpose | Secrets needed |
|---|---|---|
| **Vercel** | Frontend hosting | (none — public app) |
| **Render** | Backend hosting | All backend env vars below |
| **Supabase** | DB + Storage + Auth | `SUPABASE_URL`, `SUPABASE_ANON_KEY` (frontend), `SUPABASE_SERVICE_KEY` (backend) |
| **Anthropic** | LLM | `ANTHROPIC_API_KEY` |
| **Resend** | Email | `RESEND_API_KEY` + verified sending domain |
| **GitHub** | Code + snapshots | `GITHUB_TOKEN` (for snapshot job to push) |

### Backend env vars (Render)

```
ANTHROPIC_API_KEY=sk-ant-…
ANTHROPIC_MODEL=claude-sonnet-4-7
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJ…
RESEND_API_KEY=re_…
RESEND_FROM_ADDRESS=intel@yourdomain.com
GITHUB_TOKEN=ghp_…
GITHUB_REPO=sarthak-atrish/v1-LLM-wiki
INTERNAL_SECRET=<64 random bytes>
ALLOWED_ORIGIN=https://scapia-intel.vercel.app
# Budget guardrails
PER_USER_DAILY_QUERY_COUNT=30
PER_USER_DAILY_INPUT_TOKENS=200000
PER_USER_DAILY_OUTPUT_TOKENS=50000
PER_INGEST_MAX_INPUT_TOKENS=100000
PER_INGEST_MAX_OUTPUT_TOKENS=20000
MONTHLY_BUDGET_ALERT_USD=100
MONTHLY_HARD_KILL_USD=200
# Rate guardrails
RATE_PER_USER_PER_MIN=8
MAX_CONCURRENT_INGESTS=2
# Health guardrails
COST_VELOCITY_HOURLY_USD=5
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_OPEN_SECONDS=60
# Observability
SENTRY_DSN=https://…
```

### Frontend env vars (Vercel)

```
VITE_API_URL=https://your-backend.onrender.com
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ…
VITE_SENTRY_DSN=https://…
```

---

## 12. Expected wait times (operational reference)

| Surface | Typical wait |
|---|---|
| Vault (list) | 200–500ms |
| WikiPagePanel (click a card) | 150–300ms |
| Intel Cards (5 tabs) | 300–700ms |
| Sources feed | 150–400ms |
| Account / Me | 150–300ms |
| Query (SSE streaming) | First token <1s, full answer 5–15s |
| Submit (acknowledgement) | <1s |
| Ingest full completion | 20–40s typical, up to 60s |
| Layer 2 path (filter routes to curator) | ~10–15s, then waits on human |

No surface ever blocks the user for "minutes" thanks to keepalive (no cold starts) and async ingest.

---

## 13. v1 scope cuts (deferred to v2)

| Feature | Why deferred |
|---|---|
| Hosted `/api/lint` endpoint | Run locally with Claude Code; not needed for handover |
| Cross-device read state (orange dot follows you) | localStorage works for v1; per-user `read_state` table is +1 day |
| Layer 2 batch actions | One card at a time is fine for v1 volume |
| Hosted crawler for Tracked sources | Never built; out of scope |
| Admin UI (promote users, manage subscribers) | Supabase Studio is enough for 2–5 users |
| Per-event push notifications (real-time) | Daily digest only in v1 |
| Real-time cost dashboard | Curator can query Supabase Studio |
| Vector search for query context | Not needed until ~150+ pages |
| Tiered cost caps per role | Same cap for leader and curator |

---

## 14. Three-week phase plan

| Week | Phase | Deliverable |
|---|---|---|
| **Week 1** | Foundations + Viewer | Supabase live, schema migrated, magic-link auth working, FastAPI on Render with read endpoints, frontend cleanup + role-gated routing, GitHub Action syncs wiki → Supabase, leaders can log in and browse |
| **Week 2** | Daily digest + Hosted query | Resend domain verified, daily digest firing, `/api/query` with streaming + cost tracking + caps, frontend wired to new query endpoint |
| **Week 3** | Hosted ingest + Polish | `/api/submit` + Claude Agent SDK + 7 tools, async job runner, Layer 2 review UI, Sentry on both surfaces, handover runbook, final security pass |

---

## 15. Handover surface

When this is done and you hand over the URL:

- **Leaders** receive a magic-link email, click, land in the leader app. Browse Vault. Ask questions. Daily digest in their inbox.
- **The next curator** receives a magic link too, lands in the same app, but their sidebar shows the Curator group. They can submit raw sources, watch jobs, resolve Layer 2 cards.
- **You** can step back from being the bottleneck.

You retain admin access via Supabase Studio for user management and any operational concerns the UI doesn't surface (lint, manual snapshots, role changes).

---

## 16. What this document deliberately doesn't specify

These are real follow-ups, sized but not locked:

- **Exact CSS / visual design** for the curator workbench (submit form layout, jobs list, Layer 2 card design)
- **Domain on `scapia.in`** — using `scapia-intel.vercel.app` for v1; custom domain is a one-evening DNS task whenever
- **Resend sender domain verification** — needs DNS access, picked once
- **Monitoring beyond Sentry** — no Datadog / metrics dashboard in v1
- **Backup/restore procedure** beyond Supabase's built-in 7-day point-in-time
- **Disaster recovery runbook** — handover doc includes "if X breaks, do Y" for the common cases

These get answered as we build. None blocks Phase 0.

---

*Document version: planning lock — June 2026. Next revision: after Week 1 Phase 0 completion.*
