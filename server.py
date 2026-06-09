#!/usr/bin/env python3
"""
Scapia Market Intelligence — local dev server.
Run from v1-LLM-wiki/:  python3 server.py
Vite (port 5173) proxies /api → this server (port 8080).
"""

import base64
import hashlib
import hmac
import http.server
import json
import os
import re
import secrets
import sys
import time
import traceback
import urllib.parse
import urllib.request
import uuid
from datetime import date
from http import cookies as http_cookies
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# ── Paths ──────────────────────────────────────────────────────────────────
ROOT  = Path(__file__).parent.resolve()   # v1-LLM-wiki/
WIKI  = ROOT / "wiki"
RAW   = ROOT / "raw"
STATE = ROOT / "state.json"

# ── Minimal .env loader (no python-dotenv dependency) ──────────────────────
_env_file = ROOT / ".env"
if _env_file.exists():
    for _line in _env_file.read_text().splitlines():
        _line = _line.strip()
        if not _line or _line.startswith("#") or "=" not in _line:
            continue
        _k, _v = _line.split("=", 1)
        _k, _v = _k.strip(), _v.strip().strip('"').strip("'")
        if _k:
            os.environ[_k] = _v   # .env wins over shell — explicit local-dev override

# ── Auth / OAuth config ────────────────────────────────────────────────────
# Real Google OIDC login (@scapia.cards only) + server-side RBAC. The frontend
# swap-seam (src/auth/user.js) now reads /api/me instead of localStorage.
GOOGLE_CLIENT_ID     = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
OAUTH_REDIRECT_URL   = os.environ.get("OAUTH_REDIRECT_URL", "http://localhost:5173/api/auth/callback")
SESSION_SECRET       = os.environ.get("SESSION_SECRET", "")
ALLOWED_HD           = os.environ.get("ALLOWED_HD", "scapia.cards")
DEFAULT_ADMIN_EMAIL  = os.environ.get("DEFAULT_ADMIN_EMAIL", "sarthak.atrish@scapia.cards").lower()
COOKIE_SECURE        = os.environ.get("COOKIE_SECURE", "0") == "1"
# Dev escape hatch: skip Google login entirely and treat every request as the
# default admin. The full OAuth/RBAC stack stays wired — this only short-circuits
# current_user() when no real session is present. NEVER set this in production.
AUTH_BYPASS          = os.environ.get("AUTH_BYPASS", "0") == "1"
AUTH_STORE           = ROOT / "auth_store.json"

SESSION_COOKIE = "mi_session"
STATE_COOKIE   = "mi_oauth_state"
SESSION_TTL    = 7 * 24 * 3600          # 7 days
BASE_ROLE      = "leader"               # every authenticated scapia.cards user
GRANTABLE      = ("curator", "admin")   # roles an admin can grant on top of leader

GOOGLE_AUTH_URL     = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"

if not SESSION_SECRET:
    # Ephemeral fallback so dev still works, but sessions die on restart. Warn loudly.
    SESSION_SECRET = secrets.token_hex(32)
    print("⚠  SESSION_SECRET not set — using an ephemeral secret. "
          "Sessions will not survive a server restart. Set SESSION_SECRET in .env.")


# ── Auth store (roles + access requests) ───────────────────────────────────
# Lives OUTSIDE wiki/ — roles must never sit in a world-readable .md. JSON here
# is the deliberate interim step before Postgres user_roles.
def load_auth_store():
    if AUTH_STORE.exists():
        try:
            data = json.loads(AUTH_STORE.read_text())
            if isinstance(data, dict):
                data.setdefault("roles", {})
                data.setdefault("access_requests", [])
                return data
        except Exception:
            pass
    return {"roles": {}, "access_requests": []}


def save_auth_store(store):
    AUTH_STORE.write_text(json.dumps(store, indent=2))


def roles_for_email(email):
    """Base 'leader' + any granted roles + 'admin' for the default admin. Deduped."""
    email = (email or "").lower()
    store = load_auth_store()
    granted = store.get("roles", {}).get(email, [])
    roles = [BASE_ROLE]
    for r in granted:
        if r in GRANTABLE and r not in roles:
            roles.append(r)
    if email == DEFAULT_ADMIN_EMAIL and "admin" not in roles:
        roles.append("admin")
    return roles


# Capability logic — mirrors frontend src/auth/user.js (union across roles).
def _has(roles, role):       return role in (roles or [])
def cap_query(roles):        return _has(roles, "admin") or _has(roles, "leader")
def cap_curate(roles):       return _has(roles, "admin") or _has(roles, "curator")
def cap_admin(roles):        return _has(roles, "admin")

def has_capability(roles, capability):
    return {
        "query":  cap_query(roles),
        "curate": cap_curate(roles),
        "admin":  cap_admin(roles),
        "view":   True,
    }.get(capability, False)


# ── Stateless signed session cookie ────────────────────────────────────────
def _b64e(b):  return base64.urlsafe_b64encode(b).decode().rstrip("=")
def _b64d(s):  return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def make_session(email, name):
    payload = json.dumps(
        {"email": email, "name": name, "iat": int(time.time()), "exp": int(time.time()) + SESSION_TTL},
        separators=(",", ":"),
    ).encode()
    body = _b64e(payload)
    sig  = _b64e(hmac.new(SESSION_SECRET.encode(), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_session(token):
    try:
        body, sig = token.split(".", 1)
        expected = _b64e(hmac.new(SESSION_SECRET.encode(), body.encode(), hashlib.sha256).digest())
        if not hmac.compare_digest(sig, expected):
            return None
        data = json.loads(_b64d(body))
        if int(data.get("exp", 0)) < int(time.time()):
            return None
        return data
    except Exception:
        return None


# ── Google OAuth flow (stdlib urllib, no external deps) ────────────────────
def google_authorize_url(state):
    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": OAUTH_REDIRECT_URL,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "hd": ALLOWED_HD,
        "prompt": "select_account",
        "access_type": "online",
    }
    return GOOGLE_AUTH_URL + "?" + urllib.parse.urlencode(params)


def _post_form(url, fields):
    data = urllib.parse.urlencode(fields).encode()
    req = urllib.request.Request(url, data=data, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def exchange_code(code):
    """Trade an auth code for tokens. Returns the token dict (incl. access_token)."""
    return _post_form(GOOGLE_TOKEN_URL, {
        "code": code,
        "client_id": GOOGLE_CLIENT_ID,
        "client_secret": GOOGLE_CLIENT_SECRET,
        "redirect_uri": OAUTH_REDIRECT_URL,
        "grant_type": "authorization_code",
    })


def fetch_userinfo(access_token):
    """Fetch the OIDC userinfo (email, hd, email_verified, name)."""
    req = urllib.request.Request(
        GOOGLE_USERINFO_URL, headers={"Authorization": f"Bearer {access_token}"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def domain_ok(info):
    """Workspace gate: verified email AND hd==scapia.cards (fallback: email suffix)."""
    if not info.get("email_verified", False):
        return False
    email = (info.get("email") or "").lower()
    if info.get("hd", "").lower() == ALLOWED_HD:
        return True
    return email.endswith("@" + ALLOWED_HD)


# ── Anthropic client (lazy) ────────────────────────────────────────────────
_client = None

def get_client():
    global _client
    if _client is None:
        try:
            import anthropic
            key = os.environ.get("ANTHROPIC_API_KEY", "")
            if not key:
                raise RuntimeError(
                    "ANTHROPIC_API_KEY not set.\n"
                    "Export it before starting the server:\n"
                    "  export ANTHROPIC_API_KEY=sk-ant-…\n"
                    "  python3 server.py"
                )
            # Optional: point at an Anthropic-compatible gateway (e.g. Odyssey)
            base_url = os.environ.get("ANTHROPIC_BASE_URL", "").strip()
            kwargs = {"api_key": key}
            if base_url:
                kwargs["base_url"] = base_url
            _client = anthropic.Anthropic(**kwargs)
        except ImportError:
            raise RuntimeError("anthropic package not installed. Run: pip3 install anthropic")
    return _client

# ── State helpers ──────────────────────────────────────────────────────────
def load_state():
    if STATE.exists():
        return json.loads(STATE.read_text())
    return {"pending_queue": [], "rejection_log": [], "health": {}}

def save_state(s):
    STATE.write_text(json.dumps(s, indent=2))

# ── Wiki helpers ───────────────────────────────────────────────────────────
def _parse_yaml_array(s):
    """Parse a YAML inline array like ["a,b", c, 'd'] respecting quoted strings.
    Handles values that contain commas (e.g. ₹5,000)."""
    s = s.strip()[1:-1]  # strip [ and ]
    items = []
    buf = ''
    in_q = None
    for ch in s:
        if in_q is None and ch in ('"', "'"):
            in_q = ch       # entering a quoted string — don't add delimiter to buf
        elif ch == in_q:
            in_q = None     # closing quote — don't add delimiter to buf
        elif ch == ',' and in_q is None:
            item = buf.strip()
            if item:
                items.append(item)
            buf = ''
        else:
            buf += ch       # includes commas inside quoted strings
    item = buf.strip()
    if item:
        items.append(item)
    return items

def parse_frontmatter(text):
    """Return (meta_dict, body_text). Quote-aware YAML inline array parser."""
    m = re.match(r'^---\s*\n([\s\S]*?)\n---\s*\n', text)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        kv = line.split(':', 1)
        if len(kv) == 2:
            k, v = kv[0].strip(), kv[1].strip()
            if v.startswith('[') and v.endswith(']'):
                v = _parse_yaml_array(v)
            elif len(v) >= 2 and v[0] in ('"', "'") and v[-1] == v[0]:
                v = v[1:-1]
            meta[k] = v
    return meta, text[m.end():]

def list_wiki_pages():
    """Return all wiki folders as grouped arrays plus queue/lastIngested."""
    FOLDERS = [
        ("entities",       "entities"),
        ("partners",       "partners"),
        ("regulatory",     "regulatory"),
        ("events",         "events"),
        ("market-signals", "market-signals"),
        ("sources",        "sources"),
        ("concepts",       "concepts"),
        ("comparisons",    "comparisons"),
    ]
    result = {key: [] for _, key in FOLDERS}
    for folder, key in FOLDERS:
        d = WIKI / folder
        if not d.exists():
            continue
        for f in sorted(d.glob("*.md")):
            meta, _ = parse_frontmatter(f.read_text())
            meta["slug"]  = f.stem
            meta["path"]  = f"{folder}/{f.stem}"
            meta["title"] = (meta.get("title") or meta.get("event") or
                             meta.get("entity") or meta.get("regulation") or
                             meta.get("partner") or f.stem.replace("-", " ").title())
            result[key].append(meta)

    state = load_state()
    result["queue"] = state.get("pending_queue", [])

    # lastIngested from log.md
    log_path = WIKI / "log.md"
    last = "—"
    if log_path.exists():
        for line in reversed(log_path.read_text().splitlines()):
            m = re.match(r'^## \[(\d{4}-\d{2}-\d{2})\] ingest', line)
            if m:
                last = m.group(1)
                break
    result["lastIngested"] = last
    return result

def load_wiki_page(path):
    """path like 'entities/axis-atlas' → (meta, full_text)."""
    p = WIKI / (path if path.endswith('.md') else path + '.md')
    if not p.exists():
        return None, None
    text = p.read_text()
    meta, _ = parse_frontmatter(text)
    meta["slug"] = p.stem
    return meta, text

def list_raw_files():
    """Return raw files grouped by folder: competitive, regulatory, market, ambiguous."""
    FOLDERS = ["competitive", "regulatory", "market", "ambiguous"]
    result = {}
    for folder in FOLDERS:
        d = RAW / folder
        if not d.exists():
            result[folder] = []
            continue
        files = []
        for f in sorted(d.glob("*.md"), key=lambda x: x.stat().st_mtime, reverse=True):
            stat = f.stat()
            files.append({
                "name":     f.name,
                "path":     f"{folder}/{f.name}",
                "folder":   folder,
                "size":     stat.st_size,
                "modified": str(date.fromtimestamp(stat.st_mtime)),
            })
        result[folder] = files
    return result

def load_raw_file(path):
    """path like 'competitive/filename.md' → file text or None."""
    # Sanitise — only allow files inside RAW
    p = (RAW / path).resolve()
    try:
        p.relative_to(RAW.resolve())
    except ValueError:
        return None
    if not p.exists() or not p.is_file():
        return None
    return p.read_text()

def wiki_context_for_query():
    """Compact context from all wiki pages for the query prompt."""
    parts = []
    for folder in ("entities", "partners", "regulatory", "events", "market-signals", "concepts", "comparisons"):
        d = WIKI / folder
        if not d.exists():
            continue
        for f in sorted(d.glob("*.md")):
            parts.append(f"=== {folder}/{f.stem}.md ===\n{f.read_text()}\n")
    scapia_md = WIKI / "scapia.md"
    if scapia_md.exists():
        parts.insert(0, f"=== scapia.md (REFERENCE BASELINE) ===\n{scapia_md.read_text()}\n")
    return "\n".join(parts) if parts else "(Wiki is empty — no pages ingested yet.)"

def wiki_summary_for_filter():
    """Short summary of current wiki state for Maker/Checker context."""
    pages = list_wiki_pages()
    lines = ["Current Scapia wiki contains:"]
    for e in pages.get("entities", []):
        lines.append(f"  Entity: {e.get('entity', e['slug'])} | signal: {e.get('signal','')} | domains: {e.get('domains','')}")
    for r in pages.get("regulatory", []):
        lines.append(f"  Regulatory: {r.get('regulation', r['slug'])} | posture: {r.get('posture', r.get('compliance_status',''))}")
    for ev in pages.get("events", []):
        lines.append(f"  Event: {ev.get('event', ev['slug'])} | date: {ev.get('date','')}")
    if not pages["entities"] and not pages["regulatory"] and not pages["events"]:
        lines.append("  (empty — first ingest)")
    return "\n".join(lines)

def list_feed_items():
    """Read wiki/sources/, enrich each with entity/signal metadata, return sorted list."""
    sources_dir = WIKI / "sources"
    if not sources_dir.exists():
        return []

    items = []
    for f in sorted(sources_dir.glob("*.md")):
        text = f.read_text()
        meta, body = parse_frontmatter(text)

        # Only source-summary pages
        if meta.get("type") != "source-summary":
            continue

        slug = f.stem

        # touches — normalise to list
        touches = meta.get("touches", [])
        if isinstance(touches, str):
            touches = [t.strip() for t in touches.split(",") if t.strip()]
        if not isinstance(touches, list):
            touches = []

        # headline — frontmatter field, or fall back to first sentence of body
        headline = meta.get("headline", "")
        if not headline:
            body_stripped = body.strip()
            dot_idx = body_stripped.find(".")
            if dot_idx > 0:
                sentence = body_stripped[: dot_idx + 1].strip()
            else:
                sentence = body_stripped[:100].strip()
            # strip footnote refs like [^key]
            sentence = re.sub(r"\[\^[^\]]+\]", "", sentence).strip()
            if len(sentence) > 100:
                sentence = sentence[:97] + "…"
            headline = sentence

        # Derive primary entity and metadata from touches[0] only (per spec)
        primary_entity = ""
        primary_title  = ""
        signal         = ""
        page_types     = []
        domains        = []

        if touches:
            first_touch = touches[0]
            folder = first_touch.split("/")[0] if "/" in first_touch else ""
            primary_entity = first_touch.split("/")[-1] if "/" in first_touch else first_touch

            if folder in ("entities", "regulatory", "market-signals", "events", "partners"):
                touch_meta, _ = load_wiki_page(first_touch)
                if touch_meta:
                    # primary_title — first matching field
                    for key in ("entity", "regulation", "event", "partner", "title"):
                        if touch_meta.get(key):
                            primary_title = touch_meta[key]
                            break

                    # signal — derived per folder type
                    if folder == "entities":
                        signal = touch_meta.get("signal", "")
                    elif folder == "regulatory":
                        cs = touch_meta.get("posture", touch_meta.get("compliance_status", ""))
                        signal = cs.lower() if cs else ""
                    elif folder == "market-signals":
                        d = touch_meta.get("direction", "")
                        signal = d.lower() if d else ""
                    else:
                        signal = touch_meta.get("signal", "")

                    # page_types
                    pt = touch_meta.get("page_types", [])
                    if isinstance(pt, str):
                        pt = [pt]
                    page_types = pt if isinstance(pt, list) else []

                    # domains
                    dm = touch_meta.get("domains", [])
                    if isinstance(dm, str):
                        dm = [dm]
                    domains = dm if isinstance(dm, list) else []

        if not primary_title and primary_entity:
            primary_title = primary_entity.replace("-", " ").title()

        items.append({
            "slug":           slug,
            "headline":       headline,
            "source_title":   meta.get("source_title", ""),
            "ingested":       meta.get("ingested", ""),
            "touches":        touches,
            "primary_entity": primary_entity,
            "primary_title":  primary_title,
            "signal":         signal,
            "page_types":     page_types,
            "domains":        domains,
        })

    # Sort by ingested descending
    items.sort(key=lambda x: x.get("ingested", ""), reverse=True)
    return items


# ── Filter prompts ─────────────────────────────────────────────────────────
MAKER_PROMPT = """\
You are the Maker filter for the Scapia market intelligence wiki.
Scapia is a Federal Bank co-branded travel credit card operating in two domains:
  Fintech — credit card product, earn rates, co-brand economics, RBI/NPCI regulation, MDR, credit-on-UPI
  Travel  — flights, stays, trains, buses, visas, experiences, store

Known competitors/entities to track:
  Direct travel cards: Axis Atlas, HDFC Diners Black/Regalia, ICICI Emeralde, SBI Elite, AmEx Platinum Travel
  New-age cards: OneCard, Uni, Slice, Kiwi, Jupiter Edge, Fi-Federal, Niyo Global
  UPI/credit-on-UPI: CRED, PhonePe, Google Pay, Paytm, Slice UPI, Jupiter
  Travel platforms: MakeMyTrip, goibibo, redBus, ixigo, EaseMyTrip, Yatra, Cleartrip, IndiGo, Air India
  Going-out/lifestyle: Eternal (Zomato, Blinkit), BookMyShow, Dineout
  Issuers: Federal Bank, Axis, HDFC, ICICI, SBI, RBL, IndusInd
  Regulators: RBI, NPCI, DGCA, DPDP, Visa, Mastercard, RuPay

{wiki_summary}

Evaluate this source:
Filename: {filename}
Source type: {source_type}
Content:
--- SOURCE ---
{content}
--- END ---

Run three checks:
1. Relevance: Does this source mention a Scapia competitor, partner, regulator, or tracked domain (Fintech/Travel)?
2. Duplication: Does this source add anything the wiki doesn't already know?
3. Incremental value score (1–10):
   - 1–3: Irrelevant, generic, or fully duplicated
   - 4–7: Relevant but borderline or partially overlapping
   - 8–10: High-value new intelligence specific to Scapia's Fintech or Travel context

Respond in JSON only (no markdown fences):
{{
  "relevance_check": "one sentence",
  "duplication_check": "one sentence",
  "score": <integer 1-10>,
  "reason": "one sentence",
  "band": "AUTO-REJECT" | "BORDERLINE" | "AUTO-APPROVE",
  "entities_mentioned": ["slug-format entity names"],
  "domains": ["fintech", "travel"],
  "page_types": ["competitor", "regulatory", "event", "partner", "customer", "market-signal", "concept"]
}}
"""

CHECKER_PROMPT = """\
You are the adversarial Checker filter for the Scapia market intelligence wiki.
Scapia is a Federal Bank co-branded travel credit card (Fintech + Travel domains).

IMPORTANT — adversarial stance:
The Maker has already scored this source. You do not see the Maker's score, by design.
Two same-model passes on the same rubric are correlated — they share blind spots and will
co-sign the same errors. Your value comes from the OPPOSING prompt, not from being a second
pair of eyes. Assume this source is low-value and look for reasons to REJECT it.

For each of the three checks below, try to refute rather than re-confirm:
  1. Relevance       — argue the connection to tracked Scapia entities is incidental, not material.
  2. Duplication     — argue the wiki already covers this signal, even if phrased differently.
  3. Incremental value — argue what looks like new signal is actually noise, restatement, marketing
                         puff, or speculation dressed as fact.

If, despite this skeptical stance, the source still clearly survives all three refutations, score
it high (8–10) — that agreement carries real weight. If your refutation lands on any check, score
low (1–3). Genuine ambiguity → 4–7.

{wiki_summary}

Source to refute:
Filename: {filename}

--- SOURCE ---
{content}
--- END ---

Scoring: 1–3 reject (refutation landed) | 4–7 borderline (refutation partial) | 8–10 survives refutation

Respond in JSON only (no markdown fences):
{{
  "score": <integer 1-10>,
  "reason": "one sentence — name which refutation landed or why none did",
  "band": "AUTO-REJECT" | "BORDERLINE" | "AUTO-APPROVE"
}}
"""

# ── Query prompt — follows CLAUDE.md Brief Format exactly ──────────────────
# ──────────────────────────────────────────────────────────────────────────
# Shared ingest helper — runs the LLM page-write for a single source.
# Called from BOTH /api/submit (when band is AUTO-APPROVE, skipping the
# queue per CLAUDE.md spec) and /api/queue/approve (for BORDERLINE items
# the analyst manually approved).
# ──────────────────────────────────────────────────────────────────────────

class _IngestJsonError(Exception):
    """Raised when the LLM returns malformed JSON that we cannot recover from."""


def _split_frontmatter(text):
    """
    Split a markdown string into (frontmatter_dict, body_str).
    If the text doesn't start with `---`, returns ({}, text).

    Frontmatter is parsed line-by-line — does NOT handle nested YAML lists,
    same as the rest of the codebase. List values stay as the raw string
    (e.g. '[fintech, travel]') and are preserved verbatim on join.
    """
    if not text:
        return {}, ""
    m = re.match(r'^---\s*\n([\s\S]*?)\n---\s*\n?', text)
    if not m:
        return {}, text
    fm_block = m.group(1)
    body = text[m.end():]
    fm = {}
    # Track field order so we can re-emit frontmatter in the original order
    fm["__order__"] = []
    for line in fm_block.split("\n"):
        if not line.strip() or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip()
        fm[key] = val
        if key not in fm["__order__"]:
            fm["__order__"].append(key)
    return fm, body


def _merge_frontmatter(existing, new):
    """
    Merge new frontmatter into existing. New fields overwrite existing keys.
    Existing keys absent from new are preserved. Field order from existing is
    kept; new-only keys are appended at the end.
    """
    if not new:
        return dict(existing) if existing else {}
    merged = dict(existing) if existing else {}
    order = list(existing.get("__order__", [])) if existing else []
    for k, v in new.items():
        if k == "__order__":
            continue
        merged[k] = v
        if k not in order:
            order.append(k)
    merged["__order__"] = order
    return merged


def _write_source_summary(item, written_paths, source_content=""):
    """
    Deterministically create wiki/sources/<slug>.md after a successful ingest.
    Per CLAUDE.md, every source gets a summary page — these drive the live
    feed and the System Pulse "Sources Indexed" count, so we don't rely on
    the LLM to remember; the backend writes it from data it already has.
    """
    today = date.today()
    # Slug: YYYY-MM-DD-<descriptor>, descriptor from raw filename stem
    descriptor = re.sub(r'\.md$', '', item["filename"])
    # Strip leading date if the raw filename already has one
    descriptor = re.sub(r'^\d{4}-\d{2}-\d{2}-', '', descriptor)
    slug = f"{today.isoformat()}-{descriptor}"
    sources_dir = WIKI / "sources"
    sources_dir.mkdir(parents=True, exist_ok=True)
    dest = sources_dir / f"{slug}.md"

    # Skip if a source page for this exact filename was already created today
    if dest.exists():
        return slug

    # Derive a one-line headline. Prefer the Maker's reason (a short editorial
    # take), falling back to the first non-empty line of the raw content.
    headline = (item.get("maker_reason") or "").strip()
    if not headline and source_content:
        first_lines = [ln.strip().lstrip("#").strip() for ln in source_content.split("\n")[:10]]
        first_lines = [ln for ln in first_lines if ln and not ln.startswith("*")]
        headline = (first_lines[0] if first_lines else "Source ingested.")[:140]
    if not headline:
        headline = "Source ingested."

    # Primary entity / signal / page_types from the first written page (if any)
    primary_path = written_paths[0] if written_paths else ""
    primary_entity = primary_path.split("/")[-1] if primary_path else ""

    # Frontmatter — matches the existing sources/*.md schema
    fm_lines = [
        "---",
        "type: source-summary",
        f"source_file: raw/{item.get('source_type', 'competitive')}/{item['filename']}",
        f"source_title: \"{descriptor.replace('-', ' ').title()}\"",
        f"source_date: {today.isoformat()}",
        f"ingested: {today.isoformat()}",
        f"touches: [{', '.join(written_paths)}]",
        f"primary_entity: {primary_entity}",
        f"signal: {item.get('band', '').lower()}",
        f"page_types: [{', '.join(item.get('page_types', []) or [])}]",
        f"domains: [{', '.join(item.get('domains', []) or [])}]",
        f"filter_score: {item.get('maker_score', '')}",
        f"filter_band: {item.get('band', '')}",
        f"headline: \"{headline.replace(chr(34), chr(39))}\"",
        "---",
        "",
    ]

    # Body — short summary referencing the raw file and pages touched
    body_lines = [
        f"**Source:** `raw/{item.get('source_type','competitive')}/{item['filename']}`  ",
        f"**Ingested:** {today.isoformat()}  ",
        f"**Filter:** Maker {item.get('maker_score','?')}/10 · {item.get('band','')}  ",
        "",
        f"**Pages touched on this ingest:**",
    ]
    for p in written_paths:
        body_lines.append(f"- [[{p}]]")
    body_lines += [
        "",
        f"_{headline}_",
        "",
    ]

    dest.write_text("\n".join(fm_lines) + "\n".join(body_lines))
    return slug


def _join_frontmatter(fm, body):
    """Serialize (frontmatter_dict, body_str) back into a complete markdown file."""
    if not fm or not any(k for k in fm if k != "__order__"):
        return body
    lines = ["---"]
    order = fm.get("__order__") or [k for k in fm.keys() if k != "__order__"]
    for k in order:
        if k == "__order__" or k not in fm:
            continue
        lines.append(f"{k}: {fm[k]}")
    lines.append("---")
    lines.append("")
    return "\n".join(lines) + body.lstrip("\n")


def _replace_or_insert_index_entry(idx_text, folder, new_entry):
    """
    Update wiki/index.md cleanly.

    The agent emits an `index_entry` line per page write. If a line for the
    same [[folder/slug]] target already exists in the index, REPLACE it in
    place (so updates don't accumulate duplicate entries). Otherwise INSERT
    it just below the matching section heading.
    """
    if not new_entry:
        return idx_text

    # Extract the [[path/slug]] token from the new entry — that's the dedupe key
    m = re.search(r'\[\[([^\]]+)\]\]', new_entry)
    if not m:
        return idx_text
    target = m.group(1)

    # Build a regex that matches any existing line referencing the same target
    target_re = re.compile(
        r'^.*\[\[' + re.escape(target) + r'\]\].*$',
        re.MULTILINE
    )
    if target_re.search(idx_text):
        # Replace existing entry in place
        return target_re.sub(new_entry, idx_text, count=1)

    # Insert under the matching section heading
    section_map = {
        "entities":         "## Competitor Entities",
        "regulatory":       "## Regulatory Pages",
        "events":           "## Events",
        "partners":         "## Partners",
        "market-signals":   "## Market Signals",
        "concepts":         "## Concepts",
        "comparisons":      "## Comparisons",
        "sources":          "## Sources",
    }
    section = section_map.get(folder)
    if section and section in idx_text:
        return idx_text.replace(section, section + "\n" + new_entry)
    return idx_text


def _run_ingest_for_item(item, approved_via="curator"):
    """
    Run the LLM ingest workflow for a queued/auto-approved item.
    Writes pages, updates index.md, appends to log.md. Returns list of paths
    written. Raises _IngestJsonError on malformed LLM output.
    """
    client = get_client()
    raw_path = Path(item.get("raw_path", ""))
    if not raw_path.exists():
        raise _IngestJsonError(f"Source file not found: {raw_path}")
    content = raw_path.read_text()

    wiki_sum = wiki_summary_for_filter()
    prompt = INGEST_PROMPT.format(
        wiki_summary=wiki_sum,
        filename=item["filename"],
        source_type=item["source_type"],
        entities=", ".join(item.get("entities") or []),
        domains=", ".join(item.get("domains") or []),
        page_types=", ".join(item.get("page_types") or []),
        content=content[:8000],
        today=str(date.today()),
    )
    msg = client.messages.create(
        model="claude-sonnet-4-6", max_tokens=8192,
        messages=[{"role": "user", "content": prompt}]
    )
    raw = re.sub(r'^```json\s*|\s*```$', '', msg.content[0].text.strip(), flags=re.MULTILINE).strip()
    try:
        result = json.loads(raw)
    except json.JSONDecodeError as e:
        raise _IngestJsonError(
            f"Agent response truncated or invalid JSON (stopped at char {e.pos}). "
            f"Raw source likely too complex — split into multiple sources or simplify. "
            f"stop_reason={msg.stop_reason}"
        )

    # Normalise: model may return a single page object OR an array of pages
    pages_to_write = result if isinstance(result, list) else [result]
    written = []

    for page in pages_to_write:
        if not isinstance(page, dict) or "wiki_path" not in page or "content" not in page:
            continue
        wiki_path = WIKI / (page["wiki_path"] + ".md")
        wiki_path.parent.mkdir(parents=True, exist_ok=True)

        if page.get("action") == "update" and wiki_path.exists():
            # The LLM often emits a complete page (frontmatter + body) even when
            # the action is "update". Naively appending dumps a second frontmatter
            # block into the body where it renders as raw text.
            #
            # Fix: split the new content into (frontmatter, body). Merge the new
            # frontmatter fields into the existing frontmatter (so headline,
            # signal, vitals, sources_count, last_updated all refresh). Insert
            # the new body BEFORE the existing "## Synthesis" or "## Competitor
            # Intel" sections so the synthesis/intel stays at the bottom.
            existing = wiki_path.read_text()
            new_fm, new_body = _split_frontmatter(page["content"])
            existing_fm, existing_body = _split_frontmatter(existing)

            # Merge frontmatter — new fields win, existing keys without
            # corresponding new values survive
            merged_fm = _merge_frontmatter(existing_fm, new_fm)

            # Bump sources_count if the new frontmatter didn't already
            try:
                if new_fm and "sources_count" not in new_fm:
                    cur = int(existing_fm.get("sources_count", "1"))
                    merged_fm["sources_count"] = str(cur + 1)
            except (ValueError, TypeError):
                pass

            # Insert the new body before the first "## Synthesis" or
            # "## Competitor Intel" / "## Regulatory Intel" / etc. so the
            # apparatus sections stay at the bottom of the page.
            insertion_anchors = [
                "\n## Synthesis",
                "\n## Competitor Intel",
                "\n## Regulatory Intel",
                "\n## Partner Intel",
                "\n## Market Intel",
                "\n## Customer Intel",
            ]
            insert_at = -1
            for anchor in insertion_anchors:
                idx = existing_body.find(anchor)
                if idx >= 0 and (insert_at < 0 or idx < insert_at):
                    insert_at = idx
            if new_body.strip():
                if insert_at >= 0:
                    merged_body = (
                        existing_body[:insert_at].rstrip()
                        + "\n\n" + new_body.strip()
                        + "\n\n" + existing_body[insert_at:].lstrip()
                    )
                else:
                    merged_body = existing_body.rstrip() + "\n\n" + new_body.strip() + "\n"
            else:
                merged_body = existing_body

            wiki_path.write_text(_join_frontmatter(merged_fm, merged_body))
        else:
            wiki_path.write_text(page["content"])
        written.append(page["wiki_path"])

        # Update index.md — REPLACE existing entry if same target exists,
        # otherwise INSERT under the matching section heading.
        index_path = WIKI / "index.md"
        if index_path.exists() and page.get("index_entry"):
            idx = index_path.read_text()
            folder = page["wiki_path"].split("/")[0]
            updated = _replace_or_insert_index_entry(idx, folder, page["index_entry"])
            if updated != idx:
                index_path.write_text(updated)

    # Deterministically write the source-summary page (drives the live feed
    # and the System Pulse "Sources Indexed" count). Don't rely on the LLM to
    # remember — backend has all the data it needs.
    if written:
        try:
            source_content = ""
            try:
                source_content = (RAW / item.get("source_type", "competitive") / item["filename"]).read_text()
            except Exception:
                pass
            source_slug = _write_source_summary(item, written, source_content)
            written.append(f"sources/{source_slug}")
        except Exception as e:
            # Source summary failure shouldn't kill the ingest — log and continue
            print(f"  ⚠ source summary write failed: {e}", file=sys.stderr)

    # Append to log.md
    log_path = WIKI / "log.md"
    if log_path.exists() and written:
        with open(log_path, "a") as f:
            f.write(
                f"\n## [{date.today()}] ingest | {item['filename']} → "
                f"{', '.join(p + '.md' for p in written)} | "
                f"{'Auto-approved' if approved_via == 'auto' else 'Approved via curator'}\n"
            )

    return written


QUERY_PROMPT = """\
You are a market intelligence analyst for Scapia, a Federal Bank co-branded travel credit card.
Scapia operates in two domains:
  Fintech — credit card product, earn rates, co-brand economics, RBI/NPCI regulation, MDR, credit-on-UPI
  Travel  — flights, stays, trains, buses, visas, experiences, store

Today is {today}.

You have access to the Scapia market intelligence wiki:

{wiki_context}
{thread_context}
Answer this question:
{query}

You MUST follow this exact Brief format. Do not deviate from it.

> **Bottom Line:** [Exactly one sentence. Must DIRECTLY answer the question asked — not a
> reframe of the question, not a meta-observation. If the question is "How should Scapia
> respond to X?", Bottom Line says what Scapia should do. Reframes (e.g. "X isn't the real
> threat — Y is") go in Signal sections, never in Bottom Line. Bottom Line must also
> include a time-horizon (e.g. "within 30 days", "before Q3", "while window stays open"]
> As of {today_short} · [High|Medium|Low] confidence

---

## Signal · [[folder/slug]] · [Lens: Fintech | Travel | Regulatory]
**Stat:** [value (contrast vs Scapia or strategic frame)] · [value (contrast)] · [value (contrast)]
[2–3 sentences of signal — soft cap ~120 words per section. If longer, split into TWO Signal
sections instead. Cite every factual claim with [[wikilinks]] inline.]
[Optional: ⚠ Counter-signal: <one sentence> — ONLY if the wiki contains an actual contradicting source.
Do NOT invent counter-signals from general knowledge.]

(Repeat one Signal section per entity or regulatory topic. Never merge two entities into one section.)

[Optional chart block — REQUIRED when comparing 3+ competitors on the same numerical metric
(e.g. annual fees, user counts, forex markup). Skip when wiki doesn't have the numbers.]
```chart
type: horizontal-bar
title: "Annual Fee Comparison"
unit: "₹"
data:
  - label: HDFC Diners Black
    value: 11800
  - label: Axis Atlas
    value: 5000
  - label: Scapia
    value: 0
    note: "lifetime free"
```

---

## Scapia Implication
- [Executable action. Must answer WHO, BY WHEN, and HOW SUCCESS IS MEASURED.
  Format: "Verb-first action — owner: <team>, window: <days>, target: <measurable outcome>".
  BAD:  "Build a comparison battlecard"
  GOOD: "Ship a 30-day Reddit acquisition push targeting r/CreditCardsIndia Atlas-alternative
         threads — owner: growth, window: 30 days, target: 500 attributed signups."]
- [2–4 bullets total. Each must be specific enough that a team could start tomorrow.]

---

**Confidence:** [High|Medium|Low] — [one-sentence "because" clause naming the evidence shape]
**Perspectives:** [list domains/angles covered]
[Optional: **Blind spot:** <one sentence on what the wiki does NOT cover that would sharpen
this view, e.g. "No data on HDFC's conversion rate from pre-approval DMs.">]

Hard rules:
- Bottom Line is exactly ONE sentence and DIRECTLY answers the question. Time-horizon included.
- Stat chips: each value carries a contrast against Scapia or a strategic frame, never raw numbers alone
- Confidence line must include a "because" clause naming the evidence — not just "High · 2 sources"
- Implications must be executable (owner, window, measurable target) — not vague aspirations
- Counter-signal lines are OPTIONAL and ONLY allowed when the wiki contains an actual contradicting source
- Blind-spot line is OPTIONAL — use when there's a meaningful gap a reader should know about
- Charts are MANDATORY for 3+ comparable numerical values; SKIP when data is sparse
- Signal sections: one per entity, ~120 words soft cap, split if longer
- Regulatory content: one authoritative posture, no hedging
- Never invent data not present in the wiki
- If the wiki is empty, say so and answer from general knowledge clearly marked as background
- Do NOT add a ## Sources section — citations live in [[wikilinks]] only
"""


# ──────────────────────────────────────────────────────────────────────────
# Intent classification (Phase 1 of the response router)
#
# Every incoming query is classified into one of five intents. Each intent
# gets a different response shape — the old behavior (forcing every input
# through the Brief format, even "hi") was confusing and looked absurd.
#
# Routing logic:
#   1. Regex fast-path for greetings / meta / thanks (zero LLM cost)
#   2. Haiku classifier for everything else (~1s, ~$0.001)
#   3. Dispatch to the matching handler
# ──────────────────────────────────────────────────────────────────────────

# Regex fast-paths — catch the obvious cases without a model call
GREETING_RE = re.compile(
    r"^\s*(hi|hii+|hello+|hey+|hola|namaste|good\s*(morning|afternoon|evening|night)"
    r"|sup|yo|gm|gn|hiya|howdy)\s*[!.?]*\s*$",
    re.IGNORECASE,
)
THANKS_RE = re.compile(
    r"^\s*(thanks?|thank\s+you|thx|ty|cheers|appreciate\s+it|got\s+it|noted|ok|okay)"
    r"\s*[!.?]*\s*$",
    re.IGNORECASE,
)
META_RE = re.compile(
    r"^\s*(what\s+(can|do)\s+you\s+(do|know)|how\s+(do\s+i\s+use|does\s+this\s+work)"
    r"|what\s+is\s+this|who\s+are\s+you|help|what\s+can\s+i\s+ask)\s*[!.?]*\s*$",
    re.IGNORECASE,
)

# Follow-up cue words — when paired with thread_history, suggest elaboration intent
FOLLOWUP_CUES = (
    "tell me more", "tell me about", "tell about", "expand on", "expand it",
    "in deep", "in depth", "go deeper", "more on", "more about",
    "what about", "and what", "and how", "what else", "elaborate",
    "explain", "clarify", "deeper", "details on", "details about",
    "drill into", "dig into", "unpack",
)

INTENT_CLASSIFIER_PROMPT = """\
You are a query intent classifier for a Scapia market intelligence assistant.
Classify the user's query into ONE of these intents:

  brief_query        - a substantive question about Scapia's competitors, regulators,
                       market signals, or strategy. Deserves a full structured Brief.
  clarification      - a short follow-up that wants elaboration on something the
                       prior assistant turn already said. Cues: "tell me more",
                       "expand on", "in deep", "what about X", "and how about".
                       ONLY classify as clarification if has_thread_history is true.
  out_of_scope       - the query is not about Scapia / fintech / travel / market
                       intelligence at all (e.g. "what's the weather", "tell me a
                       joke", coding help, general knowledge questions).
  meta               - the user is asking what the system can do, what it knows,
                       how to use it.
  greeting           - hi/hello/thanks/ok/got it style — no real question.

User query: {query}
has_thread_history: {has_history}

Respond in JSON only (no markdown fences):
{{
  "intent": "brief_query" | "clarification" | "out_of_scope" | "meta" | "greeting",
  "reason": "one short sentence"
}}
"""


ELABORATION_PROMPT = """\
You are a market intelligence analyst for Scapia. The user is asking a
follow-up question about something you said in the previous turn — they want
you to go DEEPER on a specific point, not produce a new full brief.

Today is {today}.

Previous turn (your last response to them):
---
{prior_answer}
---

Their follow-up question:
{query}

Wiki context (read-only background you can cite):

{wiki_context}

Respond as an elaboration, NOT a Brief. Specifically:
- Do NOT use the "Bottom Line" / "Intelligence Brief" framing
- Do NOT emit "As of ..." dateline, Confidence line, Perspectives, or Blind Spot
- Do NOT emit a chart block unless the user explicitly asked for numbers
- DO use inline [[wikilinks]] for every claim (citation discipline still applies)
- DO stay focused on the specific thing they asked about — pull from the prior
  turn's content and elaborate ONE angle deeper
- DO keep it tight — 2–4 short paragraphs maximum

Output format (plain prose with inline wikilinks):

[Open with a one-line anchor sentence that names what you're elaborating on.]

[2–3 short paragraphs going deeper on that specific point. Cite with [[wikilinks]].]

[Optional: end with a tight "What this means for Scapia" line — single sentence,
no headers, no kicker.]
"""


def _canned_greeting():
    """Friendly welcome with starter prompts. Zero LLM cost."""
    return {
        "format": "note",
        "tone": "greeting",
        "answer": (
            "Hi — I'm the Scapia market intelligence agent. Ask me about "
            "competitors, regulators, market signals, or strategic positioning, "
            "and I'll brief you with sourced answers.\n\n"
            "**Try one of these to get started:**\n"
            "- How should Scapia respond to CRED's Pass Lite repricing?\n"
            "- What's the priority acquisition move against Atlas refugees?\n"
            "- What are Scapia's RBI compliance gaps right now?\n"
            "- Who's winning international travel rewards in India?"
        ),
    }


def _canned_thanks():
    return {
        "format": "note",
        "tone": "greeting",
        "answer": "Anytime. Ask another question whenever you need a brief.",
    }


def _canned_meta():
    """Capabilities note. Zero LLM cost."""
    return {
        "format": "note",
        "tone": "meta",
        "answer": (
            "**Scapia Market Intelligence** — a wiki maintained by Claude, "
            "tracking what the market is doing.\n\n"
            "**What I track:**\n"
            "- Competitors (other travel cards, neo-banks, OTAs)\n"
            "- Regulators (RBI, NPCI, DPDP, co-brand rules)\n"
            "- Market signals (aviation trends, travel demand, category growth)\n"
            "- Partners (Federal Bank, networks, OTA distribution deals)\n\n"
            "**Ask me anything like:**\n"
            "- _How should Scapia respond to [competitor]'s move?_\n"
            "- _What's the regulatory risk around [topic] for co-brand cards?_\n"
            "- _What's the market landscape for [category]?_\n"
            "- _Where are Scapia's biggest acquisition opportunities right now?_\n\n"
            "Every answer cites the wiki sources it drew from. Click any "
            "citation pill to open that source. Browse the full wiki via the "
            "Vault, or see structured competitor/regulatory cards via Intel Cards."
        ),
    }


def _canned_out_of_scope(query):
    return {
        "format": "note",
        "tone": "redirect",
        "answer": (
            f"That's outside what I'm scoped to know. I'm focused on Scapia's "
            f"market intelligence — competitors, regulators, market signals, "
            f"partners. Try asking about one of those, or browse the **Vault** "
            f"to see what the wiki currently knows."
        ),
    }


def _classify_intent_regex(query):
    """Returns intent string if a regex fast-path matches, else None."""
    q = (query or "").strip()
    if not q:
        return "greeting"  # empty input treated as greeting
    if GREETING_RE.match(q):
        return "greeting"
    if THANKS_RE.match(q):
        return "greeting"  # thanks shares the canned-greeting flow
    if META_RE.match(q):
        return "meta"
    return None


def _classify_intent_llm(query, has_history):
    """Haiku-powered intent classifier. ~1s, ~$0.001 per call."""
    try:
        client = get_client()
        prompt = INTENT_CLASSIFIER_PROMPT.format(
            query=query[:500],  # cap input to avoid runaway costs
            has_history="true" if has_history else "false",
        )
        msg = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=120,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = re.sub(r'^```json\s*|\s*```$', '', msg.content[0].text.strip(),
                     flags=re.MULTILINE).strip()
        parsed = json.loads(raw)
        intent = parsed.get("intent", "brief_query")
        if intent not in ("brief_query", "clarification", "out_of_scope", "meta", "greeting"):
            intent = "brief_query"
        return intent
    except Exception as e:
        # On classifier failure, default to brief_query — preserves current behavior
        print(f"  ⚠ intent classifier failed: {e}", file=sys.stderr)
        return "brief_query"


def _detect_clarification_via_cues(query, has_history):
    """Cheap check — short query + follow-up cue word + thread history = clarification."""
    if not has_history:
        return False
    q = (query or "").strip().lower()
    if len(q.split()) > 25:  # if it's a long well-formed question, it's a new brief
        return False
    return any(cue in q for cue in FOLLOWUP_CUES)


def classify_intent(query, has_history):
    """
    Two-pass classification:
      1. Regex fast-path (free) — handles obvious greetings + meta
      2. Cue-based clarification detection (free) — follow-up + short query
      3. Haiku classifier (~$0.001) for everything else
    Returns one of: greeting | meta | clarification | out_of_scope | brief_query
    """
    regex_hit = _classify_intent_regex(query)
    if regex_hit:
        return regex_hit
    if _detect_clarification_via_cues(query, has_history):
        return "clarification"
    return _classify_intent_llm(query, has_history)


# ── Ingest prompt — follows CLAUDE.md entity schema ───────────────────────
INGEST_PROMPT = """\
You are the wiki writer for Scapia's market intelligence wiki.
Scapia is a Federal Bank co-branded travel credit card (Fintech + Travel domains).

{wiki_summary}

A source has been approved for ingestion:
Filename: {filename}
Source type: {source_type}
Entities mentioned: {entities}
Domains: {domains}
Page types: {page_types}

--- SOURCE CONTENT ---
{content}
--- END ---

Write the wiki page(s) needed. Today is {today}.

PRIMARY-ENTITY RULE
A source can mention many companies but is usually ABOUT one primary entity.
Write a page for the primary entity only. Other entities can appear as
contextual references inside that page (or as a small Event page if there
is a discrete event involving them). Do NOT spawn a separate entity page
for every name mentioned.

MAX 3 PAGES PER INGEST.
Typical good output: 1 page (entity OR regulatory OR market-signal).
Sometimes 2 pages (entity + discrete event page).
3 pages is the absolute ceiling. If the source seems to require more,
you are reading it too broadly — pick the strongest one and stop.

FRONTMATTER FORMAT RULES (NON-NEGOTIABLE)
- Frontmatter is parsed line-by-line. NO nested YAML.
- vitals MUST be a single-line JSON array of pipe-delimited strings.
  CORRECT:   vitals: ["₹11,800|Annual Fee|2x Scapia", "2%|Forex|vs 0% Scapia", "16/yr|Lounge|matches Scapia"]
  WRONG:     vitals:
               - "₹11,800|Annual Fee"
               - "2%|Forex"
  The "WRONG" example is YAML list syntax. The parser cannot read it. Do not produce it.
- Exactly 3 vitals chips. Each must contrast against Scapia (the reader is
  a Scapia leader — they don't need to know HDFC's fee in isolation, they
  need to know "₹11,800 vs Scapia's ₹0").
- headline must be one sentence, 8-14 words, source-backed, makes a Scapia
  leader want to click.

For COMPETITOR sources, create/update an entity page:
---
entity: <Entity Name>
type: competitor-entity
domains: [fintech, travel]
travel_categories: []
page_types: [competitor]
perspectives_populated: [fintech]
sources_count: 1
last_updated: {today}
headline: "<one sentence, 8-14 words, contrasts against Scapia>"
signal: <threat|opportunity|watch>
vitals: ["<value>|<label>|<vs-Scapia note>", "<value>|<label>|<vs-Scapia note>", "<value>|<label>|<vs-Scapia note>"]
---

## Fintech view
<!-- Source: raw/{source_type}/{filename} -->
[Content with inline footnotes. Every factual claim: [^slug]]

## Synthesis
[2-3 sentence cross-perspective synthesis]

## Competitor Intel

**Decision this informs:** Pricing · Positioning

### Where Scapia Wins
**[Point headline — max 12 words, concrete]**
[Context — 2-3 sentences, source-backed]
→ Action: [Specific imperative action]

### Where They're Ahead
**[Point headline — honest about the gap]**
[Context — 2-3 sentences]
→ Action: [How Scapia should respond]

### Scapia Implication
→ [Imperative action — verb-first, specific]
→ [Imperative action]

### Recent Moves
- {today}: [Event from this source]

[^slug]: [Source citation — raw/{source_type}/{filename}]

For REGULATORY sources, create/update a regulatory page:
---
regulation: <Regulation Name>
type: regulatory
domains: [fintech]
travel_categories: []
page_types: [regulatory]
effective_date: <YYYY-MM-DD>
posture: <Active|Under Review|Escalated|Superseded>
last_updated: {today}
---

[Optional 1-2 sentence intro with inline [^slug] citations.]

## Regulatory Intel

**Status:** <Active|Under Review|Escalated|Superseded>

### What It Requires
- [Direct paraphrase of the regulation — source-backed]

### Scapia's Current Posture
[One paragraph — what Scapia is doing today.]

### Open Questions
- [Unresolved ambiguity — routes to legal]

### Sign-off Required
Federal Bank / Internal Legal / Both

### Scapia Implication
→ [Imperative action — verb-first, specific]
→ [Imperative action]

[^slug]: [Source citation — raw/{source_type}/{filename}]

For PARTNER sources, create/update a partner page:
---
partner: <Partner Name>
type: partner
domains: [fintech]
page_types: [partner]
last_updated: {today}
headline: "<one sentence about this partnership, 8-14 words>"
---

[Optional 1-2 sentence intro with inline [^slug] citations.]

## Partner Intel

**Relationship:** <Co-brand issuer|Distribution partner|Technology partner>
**Status:** <Active|Negotiating|At Risk>

### What Scapia Gets
[Paragraph — source-backed.]

### What Partner Gets
[Paragraph — source-backed.]

### Current Risks
- [Specific risk]

### Scapia Implication
→ [Imperative action]
→ [Imperative action]

[^slug]: [Source citation — raw/{source_type}/{filename}]

For MARKET-SIGNAL sources, create/update a market-signal page:
---
title: <Signal Title>
type: market-signal
domains: [travel]
travel_categories: []
page_types: [market-signal]
direction: <Tailwind|Headwind|Neutral>
last_updated: {today}
headline: "<one sentence about the signal, 8-14 words>"
---

[Optional 1-2 sentence intro with inline [^slug] citations.]

## Market Intel

**Domain:** <Fintech|Travel> · [sub-category]
**Direction:** <Tailwind|Headwind|Neutral>

### What's Shifting
[Paragraph — the signal, source-backed.]

### Why It Matters for Scapia
[Paragraph — direct line to Scapia's positioning or timing.]

### Scapia Implication
→ [Imperative action]
→ [Imperative action]

[^slug]: [Source citation — raw/{source_type}/{filename}]

For EVENT sources, create an event page (links back to the entity):
---
event: <Event Name>
type: event
domains: []
travel_categories: []
page_types: [event, competitor]
entity: <entity-slug>
date: {today}
headline: "<one sentence — what happened and why it matters for Scapia, 8-14 words>"
---
[Event description with source-backed [^slug] facts. Link to [[entities/<entity-slug>]].]

[^slug]: [Source citation — raw/{source_type}/{filename}]

For CUSTOMER-SIGNAL sources (App Store / Reddit / Twitter voice-of-customer),
create an event page tagged customer:
---
event: <Customer Signal Name>
type: event
domains: []
travel_categories: []
page_types: [customer]
entity: <entity-slug>
date: {today}
headline: "<one sentence — the customer signal and why it matters, 8-14 words>"
---

[Optional 1-2 sentence intro with inline [^slug] citations.]

## Customer Intel

**Source:** <App Store|Reddit|Twitter|Mixed>
**Sentiment:** <Positive|Negative|Mixed>

### What They're Saying
- [Key point — extracted signal, not raw quote]

### Switching Signals
[Paragraph — who's switching from what and why.]

### Scapia Acquisition Implication
→ [Imperative action]
→ [Imperative action]

[^slug]: [Source citation — raw/{source_type}/{filename}]

RESPONSE FORMAT
Respond in JSON ONLY. No markdown fences. No prose before or after the JSON.

Single-page response (preferred):
{{
  "action": "create" | "update",
  "wiki_path": "entities/slug" | "regulatory/slug" | "events/slug" | "partners/slug" | "market-signals/slug",
  "content": "<full markdown of the page, frontmatter + body>",
  "index_entry": "- [[path/slug]] — one-line summary"
}}

Multi-page response (when a source genuinely needs entity + event, or
when an ambiguous source needs regulatory + competitive split — max 3):
[
  {{ "action": "...", "wiki_path": "entities/slug", "content": "...", "index_entry": "..." }},
  {{ "action": "...", "wiki_path": "events/slug",   "content": "...", "index_entry": "..." }}
]

Both shapes are accepted. Prefer single-page. Use multi-page only when
the source describes BOTH a competitor position AND a discrete event,
or BOTH a regulatory rule AND a competitive signal.

Validation checklist before returning:
- Frontmatter has no nested YAML (vitals/lists are JSON arrays on one line)
- The page carries its MANDATORY Intel section with the EXACT anchor for its type:
    competitor    → "## Competitor Intel"
    regulatory    → "## Regulatory Intel"
    partner       → "## Partner Intel"
    market-signal → "## Market Intel"
    customer      → "## Customer Intel"
  (An event page that is NOT a customer signal needs no Intel section.)
- Sub-headings use the EXACT "###" titles shown in the template above
  (e.g. "### What It Requires", "### Scapia's Current Posture",
  "### Why It Matters for Scapia"). The frontend parser matches them
  literally — any drift drops that field from the Intel Card.
- Scapia Implication bullets start with "→ " (not "- "); win/loss action
  lines start with "→ Action:".
- Every factual claim in the body has an inline [^footnote] marker
- Footnote definitions appear at the bottom of the body, pointing to raw/...
- Entity pages: vitals has exactly 3 chips, each contrasting against Scapia
- headline (entity / event / partner / market-signal) is 8-14 words, one sentence
"""

# ── Filter runner ──────────────────────────────────────────────────────────
def score_to_band(s):
    if s >= 8: return "AUTO-APPROVE"
    if s <= 3: return "AUTO-REJECT"
    return "BORDERLINE"

def run_filter(content, source_type, filename):
    client = get_client()
    wiki_sum = wiki_summary_for_filter()

    maker_prompt = MAKER_PROMPT.format(
        wiki_summary=wiki_sum, filename=filename,
        source_type=source_type, content=content[:8000]
    )
    maker_msg = client.messages.create(
        model="claude-haiku-4-5-20251001", max_tokens=512,
        messages=[{"role": "user", "content": maker_prompt}]
    )
    maker_raw = re.sub(r'^```json\s*|\s*```$', '', maker_msg.content[0].text.strip(), flags=re.MULTILINE).strip()
    maker = json.loads(maker_raw)
    maker_score = int(maker.get("score", 5))

    if maker_score >= 8:
        return {
            "maker_score": maker_score, "maker_reason": maker.get("reason", ""),
            "checker_score": None, "checker_reason": None,
            "band": "AUTO-APPROVE", "layer2_outcome": None,
            "entities": maker.get("entities_mentioned", []),
            "domains": maker.get("domains", []),
            "page_types": maker.get("page_types", []),
        }
    if maker_score <= 3:
        return {
            "maker_score": maker_score, "maker_reason": maker.get("reason", ""),
            "checker_score": None, "checker_reason": None,
            "band": "AUTO-REJECT", "layer2_outcome": None,
            "entities": maker.get("entities_mentioned", []),
            "domains": maker.get("domains", []),
            "page_types": maker.get("page_types", []),
        }

    checker_prompt = CHECKER_PROMPT.format(
        wiki_summary=wiki_sum, filename=filename, content=content[:8000]
    )
    checker_msg = client.messages.create(
        model="claude-haiku-4-5-20251001", max_tokens=256,
        messages=[{"role": "user", "content": checker_prompt}]
    )
    checker_raw = re.sub(r'^```json\s*|\s*```$', '', checker_msg.content[0].text.strip(), flags=re.MULTILINE).strip()
    checker = json.loads(checker_raw)
    checker_score = int(checker.get("score", 5))

    if checker_score >= 8:
        band, layer2 = "AUTO-APPROVE", None
    elif checker_score <= 3:
        band, layer2 = "AUTO-REJECT", None
    else:
        diff = abs(maker_score - checker_score)
        layer2 = "C" if diff <= 2 else "D"
        band = "LAYER2"

    return {
        "maker_score": maker_score,     "maker_reason": maker.get("reason", ""),
        "checker_score": checker_score, "checker_reason": checker.get("reason", ""),
        "band": band, "layer2_outcome": layer2,
        "entities": maker.get("entities_mentioned", []),
        "domains": maker.get("domains", []),
        "page_types": maker.get("page_types", []),
    }

# ── HTTP handler ───────────────────────────────────────────────────────────
class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        print(f"  {self.command} {self.path} → {args[1]}")

    # ── CORS ────────────────────────────────────────────────────────────────
    # Dev is same-origin via the Vite proxy, so CORS is moot there. If the
    # backend is hit cross-origin we must reflect the Origin (a bare '*' is
    # illegal alongside credentials) and allow credentials so the cookie rides.
    def _cors_headers(self):
        origin = self.headers.get("Origin")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Credentials", "true")
        else:
            self.send_header("Access-Control-Allow-Origin", "*")

    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, msg, status=500):
        self.send_json({"error": msg}, status)

    def read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(length)) if length else {}

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ── Cookies / session ─────────────────────────────────────────────────────
    def _get_cookie(self, name):
        raw = self.headers.get("Cookie")
        if not raw:
            return None
        try:
            jar = http_cookies.SimpleCookie(raw)
            return jar[name].value if name in jar else None
        except Exception:
            return None

    def _cookie_attrs(self, max_age):
        attrs = f"Path=/; HttpOnly; SameSite=Lax; Max-Age={max_age}"
        if COOKIE_SECURE:
            attrs += "; Secure"
        return attrs

    def _set_cookie(self, name, value, max_age=SESSION_TTL):
        self.send_header("Set-Cookie", f"{name}={value}; {self._cookie_attrs(max_age)}")

    def _clear_cookie(self, name):
        self.send_header("Set-Cookie", f"{name}=; {self._cookie_attrs(0)}")

    def send_redirect(self, location, cookies=None):
        self.send_response(302)
        self.send_header("Location", location)
        for c in (cookies or []):
            self.send_header("Set-Cookie", c)
        self._cors_headers()
        self.end_headers()

    # ── Identity / capability guards ────────────────────────────────────────
    def current_user(self):
        """Return {email, name, roles} from the session cookie, or None."""
        token = self._get_cookie(SESSION_COOKIE)
        if not token:
            if AUTH_BYPASS:
                return {"email": DEFAULT_ADMIN_EMAIL, "name": "Dev Bypass",
                        "roles": roles_for_email(DEFAULT_ADMIN_EMAIL)}
            return None
        data = verify_session(token)
        if not data:
            return None
        email = data.get("email", "")
        return {"email": email, "name": data.get("name") or email, "roles": roles_for_email(email)}

    def require(self, capability):
        """Return the user if it has `capability`, else send 401/403 and return None."""
        user = self.current_user()
        if not user:
            self.send_error_json("Authentication required", 401)
            return None
        if not has_capability(user["roles"], capability):
            self.send_error_json("Forbidden — insufficient role", 403)
            return None
        return user

    def do_GET(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')
        qs     = parse_qs(parsed.query)

        if path == '/api/pages':
            self.send_json(list_wiki_pages())
            return

        if path == '/api/page':
            wiki_path = qs.get('path', [''])[0]
            if not wiki_path:
                self.send_error_json("Missing path parameter", 400)
                return
            meta, content = load_wiki_page(wiki_path)
            if content is None:
                self.send_error_json(f"Page not found: {wiki_path}", 404)
                return
            self.send_json({"meta": meta, "content": content})
            return

        if path == '/api/state':
            self.send_json(load_state())
            return

        if path == '/api/raw':
            self.send_json(list_raw_files())
            return

        if path == '/api/raw/content':
            raw_path = qs.get('path', [''])[0]
            if not raw_path:
                self.send_error_json("Missing path parameter", 400)
                return
            content = load_raw_file(raw_path)
            if content is None:
                self.send_error_json(f"Raw file not found: {raw_path}", 404)
                return
            self.send_json({"path": raw_path, "content": content})
            return

        if path == '/api/feed':
            self.send_json({"items": list_feed_items()})
            return

        # ── Auth ───────────────────────────────────────────────────────────
        if path == '/api/auth/login':
            self._handle_login()
            return

        # Callback path matches the registered redirect URI convention
        # (market-intelligence.scapia.in/auth/callback) — same path in dev & prod.
        if path == '/auth/callback':
            self._handle_callback(qs)
            return

        if path == '/api/me':
            user = self.current_user()
            if not user:
                self.send_error_json("Not authenticated", 401)
                return
            self.send_json(user)
            return

        if path == '/api/access-requests/mine':
            user = self.current_user()
            if not user:
                self.send_error_json("Authentication required", 401)
                return
            store = load_auth_store()
            mine = [r for r in store.get("access_requests", []) if r.get("email") == user["email"]]
            self.send_json({"requests": mine})
            return

        if path == '/api/access-requests':
            if not self.require("admin"):
                return
            store = load_auth_store()
            self.send_json({"requests": store.get("access_requests", [])})
            return

        if path == '/api/admin/users':
            if not self.require("admin"):
                return
            self.send_json({"users": self._admin_roster()})
            return

        self.send_error(404, "Not found")

    def do_POST(self):
        parsed = urlparse(self.path)
        path   = parsed.path.rstrip('/')
        try:
            body = self.read_body()
        except Exception:
            self.send_error_json("Invalid JSON body", 400)
            return
        try:
            if path == '/api/auth/logout':
                self.send_response(200)
                self._clear_cookie(SESSION_COOKIE)
                self._cors_headers()
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"ok":true}')
            elif path == '/api/access-requests':
                self._handle_access_request(body)
            elif path == '/api/access-requests/decide':
                self._handle_access_decide(body)
            elif path == '/api/admin/roles':
                self._handle_set_roles(body)
            elif path == '/api/query':
                if not self.require("query"):
                    return
                self._handle_query(body)
            elif path == '/api/submit':
                if not self.require("curate"):
                    return
                self._handle_submit(body)
            elif path == '/api/queue/approve':
                if not self.require("curate"):
                    return
                self._handle_approve(body)
            elif path == '/api/queue/reject':
                if not self.require("curate"):
                    return
                self._handle_reject(body)
            else:
                self.send_error_json("Unknown endpoint", 404)
        except RuntimeError as e:
            self.send_error_json(str(e), 503)
        except Exception as e:
            traceback.print_exc()
            self.send_error_json(str(e), 500)

    # ── Auth handlers ────────────────────────────────────────────────────────
    def _handle_login(self):
        if not GOOGLE_CLIENT_ID:
            self.send_error_json("GOOGLE_CLIENT_ID not configured on the server", 503)
            return
        state = secrets.token_urlsafe(24)
        cookie = f"{STATE_COOKIE}={state}; {self._cookie_attrs(600)}"
        self.send_redirect(google_authorize_url(state), cookies=[cookie])

    def _handle_callback(self, qs):
        # CSRF: state param must match the state cookie we set at /login.
        state_param  = qs.get("state", [""])[0]
        state_cookie = self._get_cookie(STATE_COOKIE)
        if not state_param or state_param != state_cookie:
            self.send_redirect("/?auth_error=state")
            return
        code = qs.get("code", [""])[0]
        if not code:
            self.send_redirect("/?auth_error=nocode")
            return
        try:
            tokens = exchange_code(code)
            info   = fetch_userinfo(tokens["access_token"])
        except Exception as e:
            print(f"  OAuth callback error: {e}")
            self.send_redirect("/?auth_error=exchange")
            return
        if not domain_ok(info):
            # Wrong domain / unverified — clear the state cookie and bounce.
            self.send_redirect("/?auth_error=domain", cookies=[f"{STATE_COOKIE}=; {self._cookie_attrs(0)}"])
            return
        email = (info.get("email") or "").lower()
        name  = info.get("name") or email
        session = make_session(email, name)
        self.send_redirect("/", cookies=[
            f"{SESSION_COOKIE}={session}; {self._cookie_attrs(SESSION_TTL)}",
            f"{STATE_COOKIE}=; {self._cookie_attrs(0)}",
        ])

    # ── Access-request + role handlers ─────────────────────────────────────
    def _handle_access_request(self, body):
        user = self.current_user()
        if not user:
            self.send_error_json("Authentication required", 401)
            return
        requested_role = (body.get("requested_role") or "").strip()
        if requested_role not in GRANTABLE:
            self.send_error_json("requested_role must be 'curator' or 'admin'", 400)
            return
        reason = (body.get("reason") or "").strip()
        store = load_auth_store()
        reqs  = store.setdefault("access_requests", [])
        existing = next(
            (r for r in reqs if r.get("email") == user["email"]
             and r.get("requested_role") == requested_role and r.get("status") == "pending"),
            None,
        )
        ts = int(time.time() * 1000)
        if existing:
            existing["ts"] = ts
            if reason:
                existing["reason"] = reason
            req = existing
        else:
            req = {
                "id": f"req_{ts}_{secrets.randbelow(100000)}",
                "name": user["name"], "email": user["email"],
                "requested_role": requested_role, "reason": reason,
                "status": "pending", "ts": ts,
            }
            reqs.insert(0, req)
        save_auth_store(store)
        self.send_json(req)

    def _handle_access_decide(self, body):
        if not self.require("admin"):
            return
        req_id   = body.get("id")
        decision = body.get("decision")
        if decision not in ("granted", "denied"):
            self.send_error_json("decision must be 'granted' or 'denied'", 400)
            return
        store = load_auth_store()
        req = next((r for r in store.get("access_requests", []) if r.get("id") == req_id), None)
        if not req:
            self.send_error_json("Request not found", 404)
            return
        req["status"] = decision
        if decision == "granted" and req["requested_role"] in GRANTABLE:
            grants = store.setdefault("roles", {}).setdefault(req["email"], [])
            if req["requested_role"] not in grants:
                grants.append(req["requested_role"])
        save_auth_store(store)
        self.send_json({"ok": True, "request": req})

    def _handle_set_roles(self, body):
        if not self.require("admin"):
            return
        email = (body.get("email") or "").strip().lower()
        roles = body.get("roles")
        if not email or not isinstance(roles, list):
            self.send_error_json("email and roles[] required", 400)
            return
        grants = [r for r in roles if r in GRANTABLE]   # 'leader' is implicit, never stored
        store = load_auth_store()
        if grants:
            store.setdefault("roles", {})[email] = grants
        else:
            store.setdefault("roles", {}).pop(email, None)
        save_auth_store(store)
        self.send_json({"ok": True, "email": email, "roles": roles_for_email(email)})

    def _admin_roster(self):
        """Roster = default admin + everyone with a grant + everyone who filed a request."""
        store = load_auth_store()
        emails = {DEFAULT_ADMIN_EMAIL}
        names  = {}
        emails.update(store.get("roles", {}).keys())
        for r in store.get("access_requests", []):
            if r.get("email"):
                emails.add(r["email"])
                names.setdefault(r["email"], r.get("name"))
        me = self.current_user()
        if me:
            emails.add(me["email"])
            names.setdefault(me["email"], me["name"])
        roster = []
        for e in sorted(emails):
            roster.append({
                "email": e,
                "name": names.get(e) or e,
                "roles": roles_for_email(e),
                "is_default_admin": e == DEFAULT_ADMIN_EMAIL,
            })
        return roster

    # ── /api/query ─────────────────────────────────────────────────────────
    # Two-phase router:
    #   Phase 1 — classify intent (regex fast-path → Haiku fallback)
    #   Phase 2 — dispatch to the matching handler:
    #     greeting / meta / out_of_scope → canned response (no LLM call)
    #     clarification                  → Sonnet w/ ELABORATION_PROMPT
    #     brief_query                    → Sonnet w/ QUERY_PROMPT (the Brief)
    #
    # Every response carries a `format` field so the frontend can render
    # appropriately: "brief" (full IntelligenceBrief card), "elaboration"
    # (plain prose card, no chrome), "note" (small chat-bubble card).
    def _handle_query(self, body):
        query = (body.get("query") or "").strip()
        if not query:
            self.send_error_json("query required", 400)
            return
        # Optional thread history — list of {question, answer} from previous turns
        thread_history = body.get("thread_history") or []
        if not isinstance(thread_history, list):
            thread_history = []
        thread_history = thread_history[-3:]
        has_history = any((t.get("answer") or "").strip() for t in thread_history)

        today_obj = date.today()
        log_path = WIKI / "log.md"

        # ── Phase 1: classify intent ──
        intent = classify_intent(query, has_history)

        # ── Phase 2: dispatch ──
        if intent == "greeting":
            # Differentiate "hi" vs "thanks" — both canned, but slightly different copy
            if THANKS_RE.match(query):
                resp = _canned_thanks()
            else:
                resp = _canned_greeting()
            self._log_query(log_path, today_obj, query, intent)
            self.send_json(resp)
            return

        if intent == "meta":
            self._log_query(log_path, today_obj, query, intent)
            self.send_json(_canned_meta())
            return

        if intent == "out_of_scope":
            self._log_query(log_path, today_obj, query, intent)
            self.send_json(_canned_out_of_scope(query))
            return

        if intent == "clarification" and thread_history:
            # Find the most recent COMPLETED turn — that's what we elaborate on
            prior_turn = next(
                (t for t in reversed(thread_history) if (t.get("answer") or "").strip()),
                None,
            )
            if prior_turn:
                client = get_client()
                context = wiki_context_for_query()
                prior_answer = (prior_turn.get("answer") or "").strip()
                if len(prior_answer) > 3500:
                    prior_answer = prior_answer[:3500] + "\n...[truncated]"
                prompt = ELABORATION_PROMPT.format(
                    today=today_obj.isoformat(),
                    prior_answer=prior_answer,
                    query=query,
                    wiki_context=context,
                )
                msg = client.messages.create(
                    model="claude-sonnet-4-6",
                    max_tokens=1500,
                    messages=[{"role": "user", "content": prompt}],
                )
                self._log_query(log_path, today_obj, query, intent)
                self.send_json({
                    "answer": msg.content[0].text,
                    "format": "elaboration",
                })
                return
            # No prior turn to elaborate on → fall through to brief_query

        # ── Default: brief_query (the original Brief format) ──
        client = get_client()
        context = wiki_context_for_query()
        thread_ctx = ""
        if thread_history:
            lines = ["", "Previous turns in this conversation thread (for follow-up context):", ""]
            for i, turn in enumerate(thread_history, 1):
                q = (turn.get("question") or "").strip()
                a = (turn.get("answer") or "").strip()
                if not q or not a:
                    continue
                if len(a) > 1500:
                    a = a[:1500] + "\n...[truncated]"
                lines.append(f"--- Turn {i} ---")
                lines.append(f"Q: {q}")
                lines.append(f"A: {a}")
                lines.append("")
            lines.append("Treat the user's current question as a follow-up that may reference these prior turns.")
            lines.append("")
            thread_ctx = "\n".join(lines)

        prompt = QUERY_PROMPT.format(
            wiki_context=context,
            thread_context=thread_ctx,
            query=query,
            today=today_obj.isoformat(),
            today_short=today_obj.strftime("%d/%m/%y"),
        )
        msg = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        self._log_query(log_path, today_obj, query, "brief_query")
        self.send_json({
            "answer": msg.content[0].text,
            "format": "brief",
        })

    def _log_query(self, log_path, today_obj, query, intent):
        if log_path.exists():
            entry = f"\n## [{today_obj}] query/{intent} | {query[:80]}\n"
            with open(log_path, "a") as f:
                f.write(entry)

    # ── /api/submit ────────────────────────────────────────────────────────
    def _handle_submit(self, body):
        content     = (body.get("content") or "").strip()
        source_type = body.get("source_type", "competitive")
        filename    = body.get("filename", "unnamed").strip()

        if not content:
            self.send_error_json("content required", 400)
            return

        # Synthesis pages were removed — query answers live in localStorage threads,
        # not in the wiki. Reject any legacy "synthesis" source_type explicitly.
        if source_type == "synthesis":
            self.send_error_json(
                "Synthesis pages were removed. Query answers are now stored in personal "
                "thread history (localStorage) on the Intelligence page, not as wiki pages.",
                410  # Gone
            )
            return

        # Regular ingest — sanitise filename
        filename = re.sub(r'[^a-z0-9._/-]', '-', filename.lower()).strip('-') or "source"
        if not filename.endswith('.md'):
            filename += '.md'

        result = run_filter(content, source_type, filename)
        state = load_state()

        if result["band"] == "AUTO-REJECT":
            entry = {
                "id": f"reject-{uuid.uuid4().hex[:8]}",
                "filename": filename,
                "score": f"{result['maker_score']}/10",
                "band": "AUTO-REJECT",
                "reason": result["maker_reason"],
                "timestamp": str(date.today()),
            }
            state.setdefault("rejection_log", []).insert(0, entry)
            # Log
            log_path = WIKI / "log.md"
            if log_path.exists():
                with open(log_path, "a") as f:
                    f.write(f"\n## [{date.today()}] filter-reject | {filename} | Maker: {result['maker_score']}/10 AUTO-REJECT — {result['maker_reason']}\n")
        else:
            # Save raw file regardless of band — preserves the audit trail
            dest = RAW / source_type / filename
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(content)
            entities = result.get("entities", [])

            # Build the shape we'd pass to the ingest helper either way
            ingest_item = {
                "id": f"auto-{uuid.uuid4().hex[:8]}",
                "filename": filename,
                "source_type": source_type,
                "entity": entities[0] if entities else None,
                "entities": entities,
                "domains": result.get("domains", []),
                "page_types": result.get("page_types", []),
                "maker_score": result["maker_score"],
                "maker_reason": result["maker_reason"],
                "checker_score": result.get("checker_score"),
                "checker_reason": result.get("checker_reason"),
                "band": result["band"],
                "layer2_outcome": result.get("layer2_outcome"),
                "timestamp": str(date.today()),
                "raw_path": str(dest),
            }

            log_path = WIKI / "log.md"
            band_label = result['band']
            checker_info = f", Checker: {result['checker_score']}/10" if result.get('checker_score') else ""

            if result["band"] == "AUTO-APPROVE":
                # ── Bypass the analyst queue per CLAUDE.md ──
                # AUTO-APPROVE = high-confidence signal, no human in loop.
                # Write the pages IMMEDIATELY and return the paths in the same
                # response. The submit form sees the result and can navigate
                # straight to the updated wiki page.
                if log_path.exists():
                    with open(log_path, "a") as f:
                        f.write(
                            f"\n## [{date.today()}] ingest | {filename} | "
                            f"Maker: {result['maker_score']}/10{checker_info} {band_label} — bypassing queue\n"
                        )
                try:
                    written = _run_ingest_for_item(ingest_item, approved_via="auto")
                    result["wiki_paths"] = written
                    result["auto_written"] = True
                    # Refresh health counts
                    pages_list = list_wiki_pages()
                    state["health"] = {
                        "entity_count":         len(pages_list.get("entities", [])),
                        "regulatory_count":     len(pages_list.get("regulatory", [])),
                        "event_count":          len(pages_list.get("events", [])),
                        "partner_count":        len(pages_list.get("partners", [])),
                        "market_signal_count":  len(pages_list.get("market-signals", [])),
                        "last_ingest":          str(date.today()),
                    }
                except _IngestJsonError as e:
                    # Auto-write failed — fall back to queueing so the curator can retry
                    result["wiki_paths"] = []
                    result["auto_written"] = False
                    result["auto_write_error"] = str(e)
                    state.setdefault("pending_queue", []).insert(0, {**ingest_item, "id": f"queue-{uuid.uuid4().hex[:8]}"})
            else:
                # BORDERLINE (Outcome C/D) — queue for analyst review per spec
                queue_item = {**ingest_item, "id": f"queue-{uuid.uuid4().hex[:8]}"}
                state.setdefault("pending_queue", []).insert(0, queue_item)
                if log_path.exists():
                    with open(log_path, "a") as f:
                        f.write(
                            f"\n## [{date.today()}] filter-layer2 | {filename} | "
                            f"Maker: {result['maker_score']}/10{checker_info} {band_label} — queued for analyst\n"
                        )

        save_state(state)
        self.send_json(result)

    # ── /api/queue/approve ─────────────────────────────────────────────────
    def _handle_approve(self, body):
        item_id = body.get("id")
        state   = load_state()
        queue   = state.get("pending_queue", [])
        item    = next((i for i in queue if i["id"] == item_id), None)
        if not item:
            self.send_error_json("Queue item not found", 404)
            return

        try:
            written = _run_ingest_for_item(item, approved_via="curator")
        except _IngestJsonError as e:
            self.send_error_json(str(e), 500)
            return

        # Remove the approved item from the queue
        state["pending_queue"] = [i for i in queue if i["id"] != item_id]
        # Refresh health counts
        pages = list_wiki_pages()
        state["health"] = {
            "entity_count":         len(pages.get("entities", [])),
            "regulatory_count":     len(pages.get("regulatory", [])),
            "event_count":          len(pages.get("events", [])),
            "partner_count":        len(pages.get("partners", [])),
            "market_signal_count":  len(pages.get("market-signals", [])),
            "last_ingest":          str(date.today()),
        }
        save_state(state)
        self.send_json({"ok": True, "wiki_paths": written})

    # ── /api/queue/reject ──────────────────────────────────────────────────
    def _handle_reject(self, body):
        item_id = body.get("id")
        state   = load_state()
        queue   = state.get("pending_queue", [])
        item    = next((i for i in queue if i["id"] == item_id), None)
        if not item:
            self.send_error_json("Queue item not found", 404)
            return

        # Also delete the raw source file — a rejected item never reached the
        # wiki, so there's no audit value in keeping the raw file around. This
        # prevents orphaned files in raw/<source_type>/ accumulating from test
        # submissions and analyst rejects.
        raw_path_str = item.get("raw_path", "")
        deleted_raw = False
        if raw_path_str:
            try:
                rp = Path(raw_path_str)
                # Safety guard — only delete if the path is actually inside RAW/
                if rp.exists() and rp.is_file() and str(rp.resolve()).startswith(str(RAW.resolve())):
                    rp.unlink()
                    deleted_raw = True
            except Exception as e:
                # Best-effort cleanup — don't fail the reject if delete errors
                print(f"  ⚠ raw file cleanup failed: {e}", file=sys.stderr)

        log_entry = {
            "id": f"reject-{uuid.uuid4().hex[:8]}",
            "filename": item["filename"],
            "score": f"{item['maker_score']}/10",
            "band": "ANALYST-REJECTED",
            "reason": f"Rejected by analyst. Maker: {item['maker_score']}/10.",
            "raw_file_deleted": deleted_raw,
            "timestamp": str(date.today()),
        }
        state.setdefault("rejection_log", []).insert(0, log_entry)
        state["pending_queue"] = [i for i in queue if i["id"] != item_id]
        save_state(state)

        # Append to log.md
        log_path = WIKI / "log.md"
        if log_path.exists():
            with open(log_path, "a") as f:
                f.write(
                    f"\n## [{date.today()}] filter-reject | {item['filename']} | "
                    f"Maker: {item.get('maker_score','?')}/10 ANALYST-REJECTED — "
                    f"raw file {'deleted' if deleted_raw else 'kept (path missing)'}\n"
                )

        self.send_json({"ok": True, "raw_deleted": deleted_raw})


# ── Entry point ────────────────────────────────────────────────────────────
if __name__ == "__main__":
    port    = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    key_set = bool(os.environ.get("ANTHROPIC_API_KEY"))

    print(f"\n  Scapia Market Intelligence — API Server")
    print(f"  ─────────────────────────────────────────────")
    print(f"  API:      http://localhost:{port}")
    print(f"  Wiki:     {WIKI}")
    print(f"  API key:  {'✓ set' if key_set else '✗ NOT SET — /api/query and filter will return 503'}")
    if AUTH_BYPASS:
        print(f"  Auth:     ⚠ BYPASS ON — every request is {DEFAULT_ADMIN_EMAIL} (admin). DEV ONLY.")
    if not key_set:
        print(f"\n  To enable live queries:")
        print(f"    export ANTHROPIC_API_KEY=sk-ant-…")
        print(f"    python3 server.py")
    print(f"\n  Vite (port 5173) proxies /api → here.")
    print(f"  Press Ctrl+C to stop.\n")

    server = http.server.HTTPServer(("", port), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
