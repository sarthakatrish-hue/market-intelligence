# Scapia Market Intelligence

LLM-maintained wiki for tracking competitors, regulators, market signals, and
partners relevant to **Scapia** — the Federal Bank co-branded travel credit
card. Curators feed raw sources; a Maker–Checker LLM filter scores them;
Claude writes structured wiki pages following the spec in `CLAUDE.md`. Leaders
ask plain-English questions and get a Brief-format answer grounded in the
wiki with inline citations.

> **The wiki is maintained by an LLM, not by humans** — so it stays current
> without anyone remembering to update it.

---

## Start here

| Doc | Read when… |
|---|---|
| [`KNOWLEDGE-TRANSFER.md`](./KNOWLEDGE-TRANSFER.md) | You're picking up the project — read end-to-end. |
| [`CLAUDE.md`](./CLAUDE.md) | You want the wiki schema, page contracts, ingest workflow. |
| [`DEPLOYMENT-ARCHITECTURE.md`](./DEPLOYMENT-ARCHITECTURE.md) | You're moving the system from local dev to production. |
| [`MARKET-INTELLIGENCE-SYSTEM.md`](./MARKET-INTELLIGENCE-SYSTEM.md) | You want the original problem statement / pitch. |

---

## Quick start (local dev)

```bash
# 1. Backend
cp .env.example .env           # fill in ANTHROPIC_API_KEY (Scapia VPN required)
pip install -r requirements.txt
python3 server.py              # listens on :8080

# 2. Frontend (separate terminal)
cd frontend-react
npm install
npm run dev                    # opens http://localhost:5173
```

Vite proxies `/api/*` to `localhost:8080`. State is filesystem — wiki pages
live in `wiki/`, raw sources in `raw/`, runtime queue in `state.json`
(auto-recreated on first run if absent).

For the full operational runbook see
[`KNOWLEDGE-TRANSFER.md`](./KNOWLEDGE-TRANSFER.md#11-operational-runbook).

---

## Repo layout

```
.
├── CLAUDE.md                  ← agent spec the LLM follows
├── server.py                  ← single-file Python backend (will become FastAPI)
├── wiki/                      ← LLM-written structured knowledge base
├── raw/                       ← immutable ingested sources (audit trail)
├── frontend-react/            ← React + Vite SPA
├── state.json                 ← runtime state (gitignored; example in state.example.json)
└── *.md / *.html              ← knowledge-transfer + deployment docs
```
