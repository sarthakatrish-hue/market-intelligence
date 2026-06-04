const BASE = import.meta.env.VITE_API_URL ?? ''

export async function fetchPages() {
  const res = await fetch(`${BASE}/api/pages`)
  if (!res.ok) throw new Error(`Failed to fetch pages: ${res.status}`)
  return res.json()
}

export async function fetchPage(path) {
  const res = await fetch(`${BASE}/api/page?path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error(`Failed to fetch page: ${res.status}`)
  return res.json()
}

export async function submitQuery(query, threadHistory = []) {
  const res = await fetch(`${BASE}/api/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`Submit failed: ${res.status}`)
  return res.json()
}

export async function fetchState() {
  const res = await fetch(`${BASE}/api/state`)
  if (!res.ok) throw new Error(`Failed to fetch state: ${res.status}`)
  return res.json()
}

export async function approveQueueItem(id) {
  const res = await fetch(`${BASE}/api/queue/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error(`Approve failed: ${res.status}`)
  return res.json()
}

export async function fetchRaw() {
  const res = await fetch(`${BASE}/api/raw`)
  if (!res.ok) throw new Error(`Failed to fetch raw files: ${res.status}`)
  return res.json()
}

export async function fetchRawContent(path) {
  const res = await fetch(`${BASE}/api/raw/content?path=${encodeURIComponent(path)}`)
  if (!res.ok) throw new Error(`Failed to fetch raw content: ${res.status}`)
  return res.json()
}

export async function fetchFeed() {
  const res = await fetch(`${BASE}/api/feed`)
  if (!res.ok) throw new Error(`Failed to fetch feed: ${res.status}`)
  return res.json()
}

export async function rejectQueueItem(id) {
  const res = await fetch(`${BASE}/api/queue/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) throw new Error(`Reject failed: ${res.status}`)
  return res.json()
}
