const BASE = import.meta.env.VITE_API_URL ?? ''

// Every call sends the session cookie. In dev the Vite proxy makes /api
// same-origin, so the httpOnly mi_session cookie rides along automatically;
// `credentials: 'include'` keeps it correct if the backend is ever hit cross-origin.
const CREDS = { credentials: 'include' }

function jsonHeaders() {
  return { 'Content-Type': 'application/json' }
}

export async function fetchPages() {
  const res = await fetch(`${BASE}/api/pages`, { ...CREDS })
  if (!res.ok) throw new Error(`Failed to fetch pages: ${res.status}`)
  return res.json()
}

export async function fetchPage(path) {
  const res = await fetch(`${BASE}/api/page?path=${encodeURIComponent(path)}`, { ...CREDS })
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`)
  return res.json()
}

export async function submitQuery(query, threadHistory = []) {
  const res = await fetch(`${BASE}/api/query`, {
    ...CREDS,
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({
      query,
      thread_history: Array.isArray(threadHistory) ? threadHistory : [],
    }),
  })
  if (!res.ok) throw new Error(`Query failed: ${res.status}`)
  return res.json()
}

export async function submitContent(payload) {
  const res = await fetch(`${BASE}/api/submit`, {
    ...CREDS,
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`)
  return res.json()
}

export async function fetchState() {
  const res = await fetch(`${BASE}/api/state`, { ...CREDS })
  if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`)
  return res.json()
}

export async function approveQueueItem(id) {
  const res = await fetch(`${BASE}/api/queue/approve`, {
    ...CREDS,
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error(`Approve failed: ${res.status}`)
  return res.json()
}

export async function fetchRaw() {
  const res = await fetch(`${BASE}/api/raw`, { ...CREDS })
  if (!res.ok) throw new Error(`Failed to fetch raw files: ${res.status}`)
  return res.json()
}

export async function fetchRawContent(path) {
  const res = await fetch(`${BASE}/api/raw/content?path=${encodeURIComponent(path)}`, { ...CREDS })
  if (!res.ok) throw new Error(`Failed to fetch raw content: ${res.status}`)
  return res.json()
}

export async function fetchFeed() {
  const res = await fetch(`${BASE}/api/feed`, { ...CREDS })
  if (!res.ok) throw new Error(`Failed to fetch feed: ${res.status}`)
  return res.json()
}

export async function rejectQueueItem(id) {
  const res = await fetch(`${BASE}/api/queue/reject`, {
    ...CREDS,
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error(`Reject failed: ${res.status}`)
  return res.json()
}

// ── Auth ─────────────────────────────────────────────────────────────────────
// The browser-visible URL that starts the Google OAuth dance. The backend 302s
// to Google, then back to /api/auth/callback, then home with the session cookie.
export const LOGIN_URL = `${BASE}/api/auth/login`

// Current identity from the session cookie. Returns the user, or null if the
// caller is not signed in (the backend answers 401). Never throws on 401.
export async function fetchMe() {
  const res = await fetch(`${BASE}/api/me`, { ...CREDS })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`Failed to fetch identity: ${res.status}`)
  return res.json()
}

export async function logout() {
  await fetch(`${BASE}/api/auth/logout`, { ...CREDS, method: 'POST' })
}

// ── Access requests + roles ──────────────────────────────────────────────────
export async function submitAccessRequest({ requested_role, reason } = {}) {
  const res = await fetch(`${BASE}/api/access-requests`, {
    ...CREDS,
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ requested_role, reason: reason || '' }),
  })
  if (!res.ok) throw new Error(`Access request failed: ${res.status}`)
  return res.json()
}

// The caller's own requests — used to show "already pending" on a gate.
export async function fetchMyRequests() {
  const res = await fetch(`${BASE}/api/access-requests/mine`, { ...CREDS })
  if (!res.ok) throw new Error(`Failed to fetch requests: ${res.status}`)
  return res.json() // { requests: [...] }
}

// Admin: full request queue.
export async function fetchAccessRequests() {
  const res = await fetch(`${BASE}/api/access-requests`, { ...CREDS })
  if (!res.ok) throw new Error(`Failed to fetch access requests: ${res.status}`)
  return res.json() // { requests: [...] }
}

// Admin: grant or deny a request.
export async function decideAccessRequest(id, decision) {
  const res = await fetch(`${BASE}/api/access-requests/decide`, {
    ...CREDS,
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ id, decision }),
  })
  if (!res.ok) throw new Error(`Decision failed: ${res.status}`)
  return res.json()
}

// Admin: the user roster (default admin + grant-holders + requesters).
export async function fetchAdminUsers() {
  const res = await fetch(`${BASE}/api/admin/users`, { ...CREDS })
  if (!res.ok) throw new Error(`Failed to fetch users: ${res.status}`)
  return res.json() // { users: [...] }
}

// Admin: set a user's granted roles (curator/admin); 'leader' is implicit.
export async function setUserRoles(email, roles) {
  const res = await fetch(`${BASE}/api/admin/roles`, {
    ...CREDS,
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ email, roles }),
  })
  if (!res.ok) throw new Error(`Set roles failed: ${res.status}`)
  return res.json()
}
