import React, { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchPage, fetchPages, fetchState, approveQueueItem, rejectQueueItem, submitContent } from '../api.js'
import WikiPagePanel from '../components/WikiPagePanel.jsx'

// ─── Tokens ────────────────────────────────────────────────────────────────
const BRAND = {
  orange:    '#ce3e00',
  bg:        '#f1f6fa',
  dark:      '#111111',
  white:     '#FFFFFF',
  border:    '#E8E8E8',
  divider:   '#F0F0F0',
  muted:     '#888888',
  mutedSoft: '#AAAAAA',
  font:      '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const C = {
  green:  '#16A34A',
  red:    '#DC2626',
  amber:  '#D97706',
  blue:   '#2563EB',
  teal:   '#0D9488',
}

function rgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const [, r, g, b] = m
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${a})`
}

// ─── Nav definition ────────────────────────────────────────────────────────
const NAV = [
  { group: 'ACTIVE', items: [
    { id: 'queue',  label: 'Queue' },
    { id: 'submit', label: 'Submit' },
  ]},
  { group: 'REFERENCE', items: [
    { id: 'log',      label: 'Log' },
    { id: 'index',    label: 'Index' },
    { id: 'rejected', label: 'Auto-Rejected' },
  ]},
  { group: 'TOOLS', items: [
    { id: 'lint', label: 'Health Check' },
  ]},
]

// ─── API data normalisers ──────────────────────────────────────────────────
// Map pending_queue item (from /api/state) → QueueCard shape
function normalizeQueueItem(item) {
  const outcome = item.layer2_outcome || (item.band === 'BORDERLINE' ? 'C' : '?')
  const outcomeLabels = { C: 'Borderline', D: 'Disagreement', A: 'Auto-approved', B: 'Auto-rejected' }
  const checkerScore  = item.checker_score != null ? item.checker_score : null
  const checkerReason = item.checker_reason || '—'
  const why = item.band === 'BORDERLINE'
    ? (checkerScore != null && Math.abs(item.maker_score - checkerScore) >= 3
        ? 'Scores diverge by 3+ points — disagreement.'
        : 'Both scores within borderline band.')
    : item.band

  return {
    id:           item.id,
    layer:        2,
    filename:     item.filename,
    date:         item.timestamp || '—',
    outcome,
    outcomeLabel: outcomeLabels[outcome] || outcome,
    maker:   { score: item.maker_score,  reason: item.maker_reason  || '—' },
    checker: { score: checkerScore ?? '—', reason: checkerReason },
    why,
    // keep originals for the approve/reject API call
    _raw: item,
  }
}

// Map rejection_log item (from /api/state) → RejectedCard shape
function normalizeRejectedItem(item) {
  const scoreNum = typeof item.score === 'string'
    ? parseInt(item.score, 10)
    : (item.score ?? 0)
  return {
    id:       item.id,
    filename: item.filename,
    date:     item.timestamp || '—',
    score:    isNaN(scoreNum) ? 0 : scoreNum,
    reason:   item.reason || '—',
  }
}

// ─── Log parsing ───────────────────────────────────────────────────────────
const OP_NORMALIZE = {
  ingest:          'INGEST',
  'filter-reject': 'REJECTED',
  query:           'QUERY',
  lint:            'LINT',
  'filter-layer2': 'LAYER 2',
  create:          'CREATE',
  update:          'INGEST',
}

function parseLogContent(content) {
  return (content || '')
    .split('\n')
    .filter((l) => l.startsWith('## ['))
    .map((l) => {
      const match = l.match(/^## \[(\d{4}-\d{2}-\d{2})\] ([^\s|]+) \| (.+)$/)
      if (!match) return null
      const rawOp = match[2].toLowerCase()
      return { date: match[1], op: OP_NORMALIZE[rawOp] || match[2].toUpperCase(), desc: match[3] }
    })
    .filter(Boolean)
    .reverse()
}

// ─── Index builder ─────────────────────────────────────────────────────────
function buildIndexGroups(pages) {
  const ORDER = [
    { id: 'entities',    label: 'Entities',     apiKey: 'entities' },
    { id: 'regulatory',  label: 'Regulatory',    apiKey: 'regulatory' },
    { id: 'partners',    label: 'Partners',       apiKey: 'partners' },
    { id: 'market',      label: 'Market Signals', apiKey: 'market-signals' },
    { id: 'events',      label: 'Events',         apiKey: 'events' },
    { id: 'concepts',    label: 'Concepts',       apiKey: 'concepts' },
    { id: 'comparisons', label: 'Comparisons',    apiKey: 'comparisons' },
  ]
  return ORDER.map(({ id, label, apiKey }) => {
    const raw = pages[apiKey] || []
    const items = raw.map((item) => {
      const domainParts = (item.domains || []).map((d) => d.charAt(0).toUpperCase() + d.slice(1))
      const catParts    = (item.travel_categories || []).map((c) => `Travel/${c.charAt(0).toUpperCase() + c.slice(1)}`)
      const meta = [...domainParts, ...catParts].join(' · ') || '—'
      return {
        name:    item.slug || (item.path || '').split('/').pop() || 'untitled',
        meta,
        updated: item.last_updated || item.date || '—',
        path:    item.path || `${apiKey}/${item.slug}`,
      }
    })
    return { id, label, items }
  }).filter((g) => g.items.length > 0)
}

// ─── Small reusable bits ───────────────────────────────────────────────────
function PageHeader({ title, subtitle, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 16, marginBottom: 22, paddingBottom: 14,
      borderBottom: `1px solid ${BRAND.border}`,
    }}>
      <div>
        <h1 style={{
          margin: 0, fontFamily: BRAND.font, fontWeight: 600, fontSize: 24,
          letterSpacing: '-0.015em', color: BRAND.dark,
        }}>{title}</h1>
        {subtitle && <div style={{ marginTop: 6, fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  )
}

function SectionLabel({ color, children, style }) {
  return (
    <div style={{
      fontFamily: BRAND.font, fontSize: 10, fontWeight: 700,
      letterSpacing: '0.22em', color, textTransform: 'uppercase', ...style,
    }}>{children}</div>
  )
}

// ─── Dark sidebar nav item ─────────────────────────────────────────────────
function NavItem({ label, badge, active, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box',
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 8, width: '100%',
        padding: '9px 18px',
        fontFamily: BRAND.font, fontSize: '0.92rem',
        fontWeight: active ? 500 : 400,
        color:  active ? BRAND.orange : hover ? '#e8601a' : '#BBBBBB',
        background: active
          ? 'rgba(206,62,0,0.18)'
          : hover ? 'rgba(206,62,0,0.10)' : 'transparent',
        cursor: 'pointer',
        transition: 'background .12s, color .12s',
      }}
    >
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span style={{
          fontFamily: BRAND.font, fontSize: 10, fontWeight: 600,
          padding: '1px 7px', borderRadius: 999, minWidth: 18, textAlign: 'center',
          background: C.red, color: BRAND.white,
        }}>{badge}</span>
      )}
    </button>
  )
}

// ─── Dark sidebar ──────────────────────────────────────────────────────────
function Sidebar({ active, onSelect, queueCount, onHome }) {
  return (
    <aside style={{
      width: 220, flex: '0 0 220px',
      background: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* Header — matches Vault/BattlecardsPage */}
      <div
        onClick={onHome}
        style={{ padding: '22px 18px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{
            fontFamily: 'sans-serif', fontWeight: 700, fontSize: 28,
            letterSpacing: '-0.02em', color: BRAND.white, lineHeight: 1,
          }}>scapia</span>
          <span style={{
            fontFamily: BRAND.font, fontWeight: 600, fontSize: 11,
            letterSpacing: '0.22em', color: BRAND.orange,
            textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap',
          }}>Curator</span>
        </div>
      </div>

      {/* Nav */}
      <div style={{ padding: '10px 0', flex: 1, overflowY: 'auto' }}>
        {NAV.map((g) => (
          <div key={g.group} style={{ marginTop: 8 }}>
            <div style={{
              padding: '6px 18px 4px',
              fontFamily: BRAND.font, fontSize: '0.65rem', fontWeight: 600,
              letterSpacing: '0.08em', color: 'rgba(255,255,255,0.30)',
              textTransform: 'uppercase',
            }}>{g.group}</div>
            {g.items.map((it) => (
              <NavItem
                key={it.id}
                label={it.label}
                badge={it.id === 'queue' ? queueCount : undefined}
                active={active === it.id}
                onClick={() => onSelect(it.id)}
              />
            ))}
          </div>
        ))}
      </div>
    </aside>
  )
}

// ─── Section 1: Queue ──────────────────────────────────────────────────────
function ActionButton({ label, kind, onClick, disabled }) {
  const [hover, setHover] = useState(false)
  const colorMap = { approve: C.green, reject: C.red, neutral: BRAND.muted }
  const color = colorMap[kind] || BRAND.muted
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: BRAND.font, fontSize: 12.5, fontWeight: 500, padding: '7px 14px',
        border: `1px solid ${color}`,
        color: disabled ? BRAND.muted : hover ? BRAND.white : color,
        background: disabled ? '#F5F5F5' : hover ? color : 'transparent',
        opacity: disabled ? 0.5 : 1,
        transition: 'background .15s, color .15s',
      }}
    >{label}</button>
  )
}

function ScoreRow({ role, score, reason }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, lineHeight: 1.5 }}>
      <span style={{
        fontFamily: BRAND.font, fontSize: 9.5, fontWeight: 700,
        letterSpacing: '0.18em', textTransform: 'uppercase',
        background: '#F5F5F5', color: BRAND.muted, padding: '3px 7px', flex: '0 0 auto',
      }}>{role}</span>
      <span style={{ fontWeight: 700, color: BRAND.dark, flex: '0 0 auto' }}>{score}/10</span>
      <span style={{ color: '#555', fontStyle: 'italic' }}>— "{reason}"</span>
    </div>
  )
}

function QueueCard({ item, onAction, acting }) {
  return (
    <div style={{
      background: BRAND.white, border: `1px solid ${BRAND.border}`,
      borderLeft: `4px solid ${C.amber}`, padding: '18px 22px',
      display: 'flex', flexDirection: 'column', gap: 14,
      fontFamily: BRAND.font, color: BRAND.dark,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <SectionLabel color={C.amber}>Layer {item.layer} — Analyst review required</SectionLabel>
        <span style={{ fontSize: 11.5, color: BRAND.muted, fontVariantNumeric: 'tabular-nums' }}>{item.date}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{item.filename}</div>
        <div style={{ fontSize: 12.5, color: BRAND.muted }}>
          Outcome: <span style={{ fontWeight: 600, color: BRAND.dark }}>{item.outcome}</span>
          <span style={{ color: BRAND.muted }}> ({item.outcomeLabel})</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ScoreRow role="Maker"   score={item.maker.score}   reason={item.maker.reason} />
        {item.checker.score !== '—' && (
          <ScoreRow role="Checker" score={item.checker.score} reason={item.checker.reason} />
        )}
      </div>

      <div style={{ background: '#FAFAFA', padding: '10px 14px', fontSize: 12.5, color: '#444' }}>
        <span style={{ fontWeight: 600, color: BRAND.dark }}>Why flagged:</span> {item.why}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <ActionButton label="Approve"         kind="approve"  disabled={acting} onClick={() => onAction?.(item.id, 'approve')} />
        <ActionButton label="Reject"          kind="reject"   disabled={acting} onClick={() => onAction?.(item.id, 'reject')} />
        <ActionButton label="Split"           kind="neutral"  disabled={acting} onClick={() => onAction?.(item.id, 'split')} />
        <ActionButton label="Regulatory only" kind="neutral"  disabled={acting} onClick={() => onAction?.(item.id, 'regulatory')} />
      </div>
    </div>
  )
}

function QueueSection({ items, onAction, acting, loading }) {
  if (loading) return (
    <div>
      <PageHeader title="Queue" subtitle="Loading…" />
      <div style={{ padding: 32, textAlign: 'center', fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>Loading queue…</div>
    </div>
  )
  if (items.length === 0) return (
    <div>
      <PageHeader title="Queue" subtitle="No pending decisions" />
      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.border}`, padding: '64px 24px', textAlign: 'center', fontFamily: BRAND.font }}>
        <div style={{
          width: 44, height: 44, margin: '0 auto 14px', borderRadius: '50%',
          background: rgba(C.green, 0.1), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: C.green,
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4,12 10,18 20,6" />
          </svg>
        </div>
        <div style={{ fontSize: 20, fontWeight: 600, color: BRAND.dark, letterSpacing: '-0.01em' }}>Queue clear</div>
        <div style={{ marginTop: 6, fontSize: 13.5, color: BRAND.muted }}>No pending decisions — the system is running clean.</div>
      </div>
    </div>
  )
  return (
    <div>
      <PageHeader title="Queue" subtitle={`${items.length} pending decision${items.length !== 1 ? 's' : ''}`} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((it) => <QueueCard key={it.id} item={it} onAction={onAction} acting={acting === it.id} />)}
      </div>
    </div>
  )
}

// ─── Section 2: Submit ─────────────────────────────────────────────────────
// Source type → raw/ subfolder routing
// competitive: entities, partners, customer signals (all additive, multi-perspective)
// regulatory:  one authoritative conclusion per regulation
// market:      macro trends, category growth, financial health
// ambiguous:   LLM determines treatment at ingest time
const SOURCE_TYPES = [
  { label: 'Competitor source',     api: 'competitive' },  // raw/competitive/
  { label: 'Partner source',        api: 'competitive' },  // raw/competitive/
  { label: 'Customer signal',       api: 'competitive' },  // raw/competitive/ — App Store, Reddit, Twitter
  { label: 'Regulatory filing',     api: 'regulatory'  },  // raw/regulatory/
  { label: 'Market trend / report', api: 'market'      },  // raw/market/
  { label: 'Mixed / unclear',       api: 'ambiguous'   },  // raw/ambiguous/ — split treatment
]
const TRAVEL_CATEGORIES = ['Flights', 'Stays', 'Trains', 'Buses', 'Visas', 'Experiences', 'Store']

function FormLabel({ children }) {
  return (
    <div style={{
      fontFamily: BRAND.font, fontSize: 11, fontWeight: 600, letterSpacing: '0.08em',
      color: BRAND.muted, textTransform: 'uppercase', marginBottom: 8,
    }}>{children}</div>
  )
}

function inputStyle(focused) {
  return {
    all: 'unset', boxSizing: 'border-box', width: '100%', padding: '10px 12px',
    fontFamily: BRAND.font, fontSize: 13.5, color: BRAND.dark, background: BRAND.white,
    border: `1px solid ${focused ? BRAND.dark : BRAND.border}`, borderRadius: 8,
    transition: 'border-color .15s',
  }
}

function ToggleChip({ active, onClick, children }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button" onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', cursor: 'pointer', fontFamily: BRAND.font, fontSize: 13,
        padding: '7px 14px',
        background: active ? BRAND.dark : hover ? '#F5F5F5' : BRAND.white,
        color: active ? BRAND.white : BRAND.dark,
        border: `1px solid ${active ? BRAND.dark : BRAND.border}`,
        borderRadius: 999,
        transition: 'background .12s, color .12s, border-color .12s',
      }}
    >{children}</button>
  )
}

function EntityTagInput({ tags, onAdd, onRemove }) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  function handleKey(e) {
    if (e.key === 'Enter' && draft.trim()) { e.preventDefault(); onAdd(draft.trim()); setDraft('') }
    else if (e.key === 'Backspace' && !draft && tags.length) onRemove(tags.length - 1)
  }
  return (
    <div style={{
      display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px',
      background: BRAND.white, border: `1px solid ${focused ? BRAND.dark : BRAND.border}`,
      borderRadius: 8, minHeight: 38, alignItems: 'center', transition: 'border-color .15s',
    }}>
      {tags.map((t, i) => (
        <span key={i} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 4px 3px 10px',
          background: rgba(BRAND.orange, 0.10), color: BRAND.orange,
          fontFamily: BRAND.font, fontSize: 12, fontWeight: 500, borderRadius: 999,
        }}>
          {t}
          <button onClick={() => onRemove(i)} type="button" style={{
            all: 'unset', cursor: 'pointer', width: 18, height: 18, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', borderRadius: '50%',
            color: BRAND.orange, fontSize: 14, lineHeight: 1,
          }}>×</button>
        </span>
      ))}
      <input
        type="text" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKey}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={tags.length === 0 ? 'Type entity name and press Enter' : ''}
        style={{ all: 'unset', flex: 1, minWidth: 140, padding: '4px 4px', fontFamily: BRAND.font, fontSize: 13, color: BRAND.dark }}
      />
    </div>
  )
}

function SubmitSection({ onSubmitSuccess }) {
  const [title, setTitle]         = useState('')
  const [body, setBody]           = useState('')
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10))
  const [sourceType, setSourceType] = useState('Article')
  const [domains, setDomains]     = useState([])
  const [travelCats, setTravelCats] = useState([])
  const [tags, setTags]           = useState([])
  const [notes, setNotes]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult]       = useState(null)
  const [error, setError]         = useState(null)

  const toggleDomain = (d) => setDomains((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d])
  const toggleCat    = (c) => setTravelCats((arr) => arr.includes(c) ? arr.filter((x) => x !== c) : [...arr, c])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!title.trim() || !body.trim()) { setError('Title and content are required.'); return }
    setSubmitting(true); setError(null); setResult(null)

    const sourceTypeDef = SOURCE_TYPES.find((s) => s.label === sourceType) || SOURCE_TYPES[0]
    const filename = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.md'
    const content  = [
      body.trim(),
      notes.trim() ? `\n\n---\nCurator notes: ${notes.trim()}` : '',
      tags.length   ? `\nEntities: ${tags.join(', ')}` : '',
    ].join('')

    try {
      const res = await submitContent({ content, source_type: sourceTypeDef.api, filename })
      setResult(res)
      // Pass the response through so the parent can show an Auto-Approved
      // modal over the Queue tab when the source bypassed the queue.
      onSubmitSuccess?.(res)
      // Reset form
      setTitle(''); setBody(''); setDomains([]); setTravelCats([]); setTags([]); setNotes('')
    } catch (err) {
      setError(err.message || 'Submit failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ maxWidth: 900, width: '100%', margin: '0 auto' }}>
      <PageHeader title="Submit a source" subtitle="Hand-feed something the system should consider." />
      <form onSubmit={handleSubmit} style={{
        background: BRAND.white, border: `1px solid ${BRAND.border}`, borderRadius: 16,
        padding: '36px 40px', width: '100%', fontFamily: BRAND.font,
        display: 'flex', flexDirection: 'column', gap: 22,
        boxSizing: 'border-box',
      }}>
        {error && (
          <div style={{ padding: '10px 14px', background: rgba(C.red, 0.08), border: `1px solid ${rgba(C.red, 0.3)}`, color: C.red, fontFamily: BRAND.font, fontSize: 13 }}>
            {error}
          </div>
        )}
        {result && (
          <div style={{ padding: '10px 14px', background: rgba(C.green, 0.08), border: `1px solid ${rgba(C.green, 0.3)}`, color: C.green, fontFamily: BRAND.font, fontSize: 13 }}>
            {result.band === 'AUTO-REJECT'
              ? `Auto-rejected (Maker: ${result.maker_score}/10) — ${result.maker_reason}`
              : `Submitted — ${result.band} (Maker: ${result.maker_score}/10). Added to queue.`}
          </div>
        )}
        <div>
          <FormLabel>Source title</FormLabel>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
            placeholder="e.g. Axis Atlas EDGE Miles devaluation — internal note"
            style={inputStyle(false)} />
        </div>
        <div>
          <FormLabel>Source URL or paste content</FormLabel>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} required
            placeholder="Paste article, filing text, review content, or drop a URL"
            style={{ ...inputStyle(false), padding: '10px 12px', resize: 'vertical', fontFamily: BRAND.font, lineHeight: 1.5 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <FormLabel>Source date</FormLabel>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle(false)} />
          </div>
          <div>
            <FormLabel>Source type</FormLabel>
            <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}
              style={{ ...inputStyle(false), appearance: 'auto' }}>
              {SOURCE_TYPES.map((t) => <option key={t.label} value={t.label}>{t.label}</option>)}
            </select>
          </div>
        </div>
        <div>
          <FormLabel>Domain</FormLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <ToggleChip active={domains.includes('Fintech')} onClick={() => toggleDomain('Fintech')}>Fintech</ToggleChip>
            <ToggleChip active={domains.includes('Travel')}  onClick={() => toggleDomain('Travel')}>Travel</ToggleChip>
          </div>
        </div>
        {domains.includes('Travel') && (
          <div>
            <FormLabel>Travel category</FormLabel>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
              {TRAVEL_CATEGORIES.map((c) => (
                <ToggleChip key={c} active={travelCats.includes(c)} onClick={() => toggleCat(c)}>{c}</ToggleChip>
              ))}
            </div>
          </div>
        )}
        <div>
          <FormLabel>Entities this touches</FormLabel>
          <EntityTagInput tags={tags} onAdd={(t) => setTags((arr) => [...arr, t])} onRemove={(i) => setTags((arr) => arr.filter((_, idx) => idx !== i))} />
        </div>
        <div>
          <FormLabel>Curator notes (optional)</FormLabel>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
            placeholder="Context the LLM can't know from the source alone"
            style={{ ...inputStyle(false), padding: '10px 12px', resize: 'vertical', fontFamily: BRAND.font, lineHeight: 1.5 }} />
        </div>
        <button type="submit" disabled={submitting} style={{
          all: 'unset', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '100%', padding: '12px 18px', background: submitting ? BRAND.muted : BRAND.orange,
          color: BRAND.white, fontFamily: BRAND.font, fontWeight: 500, fontSize: 14, borderRadius: 10,
          cursor: submitting ? 'not-allowed' : 'pointer', transition: 'filter .15s',
        }}
          onMouseEnter={(e) => { if (!submitting) e.currentTarget.style.filter = 'brightness(1.08)' }}
          onMouseLeave={(e) => { e.currentTarget.style.filter = 'none' }}
        >{submitting ? 'Submitting…' : 'Submit to Queue'}</button>
      </form>
    </div>
  )
}

// ─── Section 3: Log ────────────────────────────────────────────────────────
const OP_COLORS = {
  INGEST: C.green, REJECTED: C.red, QUERY: C.blue, LINT: C.amber,
  'LAYER 2': BRAND.orange, CREATE: C.teal,
}

function OpBadge({ op }) {
  const color = OP_COLORS[op] || BRAND.muted
  return (
    <span style={{
      fontFamily: BRAND.font, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em',
      color, background: rgba(color, 0.10), border: `1px solid ${rgba(color, 0.35)}`,
      padding: '2px 7px', textTransform: 'uppercase', flex: '0 0 auto',
      minWidth: 78, textAlign: 'center',
    }}>{op}</span>
  )
}

function LogEntry({ e, i, isLast, isOpen, onToggle }) {
  const color = OP_COLORS[e.op] || BRAND.muted
  // Split on ' | ' to render each pipe segment as its own bullet in expanded view
  const segments = e.desc.split(' | ').map(s => s.trim()).filter(Boolean)

  return (
    <div style={{
      borderBottom: isLast ? 'none' : `1px solid ${BRAND.divider}`,
      fontFamily: BRAND.font,
    }}>
      {/* ── Row header — always visible, click to toggle ── */}
      <div
        onClick={onToggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '11px 16px',
          background: isOpen ? '#F7F9FC' : (i % 2 === 0 ? BRAND.white : '#FAFAFA'),
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        {/* Expand chevron */}
        <span style={{
          fontSize: 10, color: BRAND.muted, flex: '0 0 auto', width: 10,
          transform: isOpen ? 'rotate(90deg)' : 'none',
          transition: 'transform 0.15s ease',
          display: 'inline-block',
        }}>›</span>
        <span style={{ fontSize: '0.72rem', color: BRAND.muted, flex: '0 0 auto', minWidth: 82, fontVariantNumeric: 'tabular-nums' }}>{e.date}</span>
        <OpBadge op={e.op} />
        <span style={{
          fontSize: '0.82rem', color: isOpen ? BRAND.dark : '#333',
          flex: 1, minWidth: 0,
          whiteSpace: isOpen ? 'normal' : 'nowrap',
          overflow: isOpen ? 'visible' : 'hidden',
          textOverflow: isOpen ? 'clip' : 'ellipsis',
          fontWeight: isOpen ? 500 : 400,
        }}>{segments[0]}</span>
      </div>

      {/* ── Expanded body ── */}
      {isOpen && (
        <div style={{
          padding: '0 16px 14px 122px',  // indent to align under the desc text
          background: '#F7F9FC',
        }}>
          {segments.length === 1 ? (
            <p style={{ margin: 0, fontSize: 12.5, color: '#444', lineHeight: 1.6 }}>{segments[0]}</p>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {segments.map((seg, si) => (
                <li key={si} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    flex: '0 0 auto', marginTop: 5, width: 5, height: 5, borderRadius: '50%',
                    background: si === 0 ? color : BRAND.mutedSoft,
                  }} />
                  <span style={{
                    fontSize: 12.5, lineHeight: 1.6,
                    color: si === 0 ? '#222' : '#555',
                    fontWeight: si === 0 ? 500 : 400,
                  }}>{seg}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function LogSection({ entries, loading }) {
  const FILTERS = ['All', 'Ingest', 'Query', 'Lint', 'Rejected', 'Layer 2']
  const [filter, setFilter]       = useState('All')
  const [openIdx, setOpenIdx]     = useState(null)

  const filtered = filter === 'All' ? entries : entries.filter((e) => e.op.toLowerCase() === filter.toLowerCase())

  const handleToggle = (i) => setOpenIdx(prev => prev === i ? null : i)

  return (
    <div>
      <PageHeader title="Wiki Log" subtitle="Newest first. Click any entry to expand." />
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {FILTERS.map((f) => <ToggleChip key={f} active={filter === f} onClick={() => { setFilter(f); setOpenIdx(null) }}>{f}</ToggleChip>)}
      </div>
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>Loading log…</div>
      ) : (
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.border}`, overflowY: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
          {filtered.map((e, i) => (
            <LogEntry
              key={i}
              e={e}
              i={i}
              isLast={i === filtered.length - 1}
              isOpen={openIdx === i}
              onToggle={() => handleToggle(i)}
            />
          ))}
          {filtered.length === 0 && (
            <div style={{ padding: 24, fontFamily: BRAND.font, color: BRAND.muted, fontSize: 13 }}>
              {entries.length === 0 ? 'Log is empty — entries appear here after the first ingest.' : 'No log entries match this filter.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── Section 4: Index ──────────────────────────────────────────────────────
function IndexGroup({ group, openWiki }) {
  const [open, setOpen] = useState(true)
  return (
    <div style={{ background: BRAND.white, border: `1px solid ${BRAND.border}`, marginBottom: 12 }}>
      <button onClick={() => setOpen((v) => !v)} style={{
        all: 'unset', boxSizing: 'border-box', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', width: '100%', padding: '14px 18px',
        cursor: 'pointer', fontFamily: BRAND.font,
        borderBottom: open ? `1px solid ${BRAND.divider}` : 'none',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: BRAND.muted, fontSize: 12 }}>›</span>
          <span style={{ fontWeight: 600, fontSize: 14.5, color: BRAND.dark, letterSpacing: '-0.01em' }}>{group.label}</span>
        </div>
        <span style={{ fontFamily: BRAND.font, fontSize: 11, color: BRAND.muted, background: '#F5F5F5', padding: '2px 9px', borderRadius: 999 }}>{group.items.length} pages</span>
      </button>
      {open && group.items.map((it, i) => (
        <button key={it.name} onClick={() => openWiki?.(it.path || it.name)} style={{
          all: 'unset', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 12,
          width: '100%', padding: '10px 18px', cursor: 'pointer',
          background: i % 2 === 0 ? BRAND.white : '#FAFAFA',
          borderBottom: i === group.items.length - 1 ? 'none' : `1px solid ${BRAND.divider}`,
          fontFamily: BRAND.font,
        }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(206,62,0,0.06)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? BRAND.white : '#FAFAFA')}
        >
          <span style={{ fontWeight: 600, fontSize: 13, color: BRAND.orange, flex: '0 0 240px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.name}</span>
          <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {it.meta.split(' · ').filter(Boolean).map((piece) => (
              <span key={piece} style={{ fontSize: 10.5, color: BRAND.muted, background: '#F0F0F0', padding: '2px 7px', borderRadius: 4 }}>{piece}</span>
            ))}
          </span>
          <span style={{ fontSize: 11.5, color: BRAND.mutedSoft, fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>{it.updated}</span>
        </button>
      ))}
    </div>
  )
}

function IndexSection({ groups, openWiki, loading }) {
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  return (
    <div>
      <PageHeader title="Wiki Index" subtitle="Every page in the vault, by type."
        right={<span style={{ fontFamily: BRAND.font, fontSize: 12, fontWeight: 500, color: BRAND.dark, background: BRAND.white, border: `1px solid ${BRAND.border}`, padding: '6px 12px', borderRadius: 999 }}>{total} pages</span>}
      />
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>Loading index…</div>
      ) : groups.length === 0 ? (
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.border}`, padding: '48px 24px', textAlign: 'center', fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>No pages in the wiki yet.</div>
      ) : (
        groups.map((g) => <IndexGroup key={g.id} group={g} openWiki={openWiki} />)
      )}
    </div>
  )
}

// ─── Section 5: Auto-Rejected ──────────────────────────────────────────────
function RejectedCard({ item, onReview }) {
  const [hover, setHover] = useState(false)
  return (
    <div style={{
      background: BRAND.white, border: `1px solid ${BRAND.border}`,
      borderLeft: `4px solid ${C.red}`, padding: '14px 18px',
      display: 'flex', flexDirection: 'column', gap: 6, fontFamily: BRAND.font,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: BRAND.dark, letterSpacing: '-0.01em' }}>{item.filename}</span>
        <span style={{ fontSize: 11.5, color: BRAND.muted, fontVariantNumeric: 'tabular-nums' }}>{item.date}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 12.5, color: '#444', lineHeight: 1.5 }}>
          <span style={{ fontWeight: 600, color: BRAND.dark }}>Maker: {item.score}/10</span>{' '}
          <span style={{ color: BRAND.muted, fontStyle: 'italic' }}>— {item.reason}</span>
        </span>
        <button onClick={() => onReview?.(item.id)}
          onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
          style={{
            all: 'unset', cursor: 'pointer', fontFamily: BRAND.font, fontSize: 12, fontWeight: 500,
            color: hover ? BRAND.white : BRAND.orange, background: hover ? BRAND.orange : 'transparent',
            border: `1px solid ${BRAND.orange}`, padding: '5px 10px',
            transition: 'background .15s, color .15s', flex: '0 0 auto',
          }}
        >Review ↗</button>
      </div>
    </div>
  )
}

function RejectedSection({ items, onReview, loading }) {
  return (
    <div>
      <PageHeader title="Auto-Rejected Sources" subtitle="Sources scored 1–3 by Maker — no pages written." />
      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>Loading…</div>
      ) : items.length === 0 ? (
        <div style={{ background: BRAND.white, border: `1px solid ${BRAND.border}`, padding: '48px 24px', textAlign: 'center', fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>No auto-rejected sources.</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {items.map((it) => <RejectedCard key={it.id} item={it} onReview={onReview} />)}
          </div>
          <div style={{ marginTop: 16, fontFamily: BRAND.font, fontSize: 12, color: BRAND.muted, fontStyle: 'italic' }}>
            Auto-rejected sources can be escalated to Queue for curator review.
          </div>
        </>
      )}
    </div>
  )
}

// ─── Section 6: Lint ───────────────────────────────────────────────────────
// TODO: wire Run Lint → POST /api/lint (endpoint not yet implemented)
const MOCK_LINT_RESULTS = {
  ranAt: null,
  errors: [
    { id: 'e1', desc: 'Missing Intel section on regulatory/pmla-kyc-re-verification.md.', page: 'regulatory/pmla-kyc-re-verification' },
    { id: 'e2', desc: 'Disputed claim in entities/icici-emeralde.md (annual fee conflicts across 2 sources).', page: 'entities/icici-emeralde' },
  ],
  warnings: [
    { id: 'w1', desc: 'Orphan: concepts/lounge-economics.md not cross-referenced by any entity.', page: 'concepts/lounge-economics' },
    { id: 'w2', desc: "Stale claim: niyo-global.md says \"monthly product release\" — last was 4 months ago.", page: 'entities/niyo-global' },
  ],
  suggestions: [
    { id: 's1', desc: 'No page yet for entity: SBI Cashback. Mentioned in 3 sources.', page: null },
    { id: 's2', desc: 'Source gap: no DGCA primary-source filing for refund mandate; only press coverage.', page: null },
  ],
}

function LintGroup({ title, color, items }) {
  if (!items?.length) return null
  return (
    <div style={{ background: BRAND.white, border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${color}`, padding: '16px 20px', marginBottom: 12, fontFamily: BRAND.font }}>
      <SectionLabel color={color} style={{ marginBottom: 12 }}>{title} · {items.length}</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((f) => (
          <div key={f.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5 }}>
            <span style={{ color, flex: '0 0 auto', fontWeight: 700, marginTop: 1 }}>·</span>
            <span style={{ flex: 1, color: '#222' }}>{f.desc}</span>
            {f.page && <a href="#" style={{ fontFamily: BRAND.font, fontSize: 11.5, color: BRAND.orange, textDecoration: 'none', flex: '0 0 auto', borderBottom: `1px solid ${rgba(BRAND.orange, 0.4)}` }}>{f.page}</a>}
          </div>
        ))}
      </div>
    </div>
  )
}

function RunCheckButton({ onRun, running }) {
  const [hover, setHover] = React.useState(false)
  return (
    <button
      onClick={onRun}
      disabled={running}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box',
        cursor: running ? 'not-allowed' : 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '10px 26px', borderRadius: 8,
        background: running ? BRAND.muted : hover ? '#b83600' : BRAND.orange,
        color: BRAND.white,
        fontFamily: BRAND.font, fontWeight: 500, fontSize: 13.5,
        opacity: running ? 0.7 : 1,
        transition: 'background .15s, opacity .15s',
        whiteSpace: 'nowrap',
      }}
    >
      {running ? 'Running…' : 'Run Health Check'}
    </button>
  )
}

function LintSection({ results, onRun, running }) {
  const lastRunMeta = results?.ranAt
    ? (
      <div style={{ fontFamily: BRAND.font, fontSize: 11.5, color: BRAND.muted, marginBottom: 20 }}>
        Last run: {results.ranAt}
      </div>
    ) : (
      <div style={{ fontFamily: BRAND.font, fontSize: 11.5, color: BRAND.mutedSoft, fontStyle: 'italic', marginBottom: 20 }}>
        No results yet — click Run Health Check to analyse the wiki.
      </div>
    )

  return (
    <div style={{ maxWidth: 900, width: '100%', margin: '0 auto' }}>
      <PageHeader
        title="Wiki Health Check"
        subtitle="Surface gaps, stale claims, and disputed pages."
        right={<RunCheckButton onRun={onRun} running={running} />}
      />
      {lastRunMeta}
      {results && (
        results.errors.length + results.warnings.length + results.suggestions.length === 0
          ? (
            <div style={{ background: BRAND.white, border: `1px solid ${BRAND.border}`, borderRadius: 12, padding: '48px 24px', textAlign: 'center', fontFamily: BRAND.font }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: C.green }}>All clear</div>
              <div style={{ marginTop: 6, fontSize: 13, color: BRAND.muted }}>Wiki is healthy.</div>
            </div>
          ) : (
            <>
              <LintGroup title="Errors"      color={C.red}   items={results.errors} />
              <LintGroup title="Warnings"    color={C.amber} items={results.warnings} />
              <LintGroup title="Suggestions" color={C.teal}  items={results.suggestions} />
            </>
          )
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CuratorPage
// ═══════════════════════════════════════════════════════════════════════════
// Auto-Approved toast — overlays the Queue tab when a submit bypassed the
// queue (band=AUTO-APPROVE, pages written inline). Auto-dismisses after 5s.
// Lives over the Queue page only, behind the user's click-through.
// ═══════════════════════════════════════════════════════════════════════════
if (typeof document !== 'undefined' && !document.getElementById('mi-autoapprove-toast-css')) {
  const s = document.createElement('style')
  s.id = 'mi-autoapprove-toast-css'
  s.textContent = `
    @keyframes mi-toast-fade-in {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    @keyframes mi-toast-pop {
      from { opacity: 0; transform: translate(-50%, -50%) scale(0.94); }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes mi-toast-progress {
      from { width: 100%; }
      to   { width: 0%; }
    }
  `
  document.head.appendChild(s)
}

function AutoApprovedToast({ paths, score, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(17,17,17,0.42)',
        backdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
        animation: 'mi-toast-fade-in 0.18s ease-out',
        cursor: 'pointer',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          background: BRAND.white,
          border: `1px solid ${BRAND.border}`,
          borderLeft: `3px solid ${BRAND.orange}`,
          padding: '22px 28px 18px',
          minWidth: 380, maxWidth: 520,
          boxShadow: '0 12px 40px rgba(17,17,17,0.18)',
          fontFamily: BRAND.font,
          animation: 'mi-toast-pop 0.22s cubic-bezier(.4,.0,.2,1)',
          cursor: 'default',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9,
          fontFamily: BRAND.font, fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', textTransform: 'uppercase',
          color: BRAND.orange, marginBottom: 12,
        }}>
          <span style={{
            width: 8, height: 8, background: BRAND.orange, display: 'inline-block',
          }} />
          Auto-Approved
          {typeof score === 'number' && (
            <span style={{
              marginLeft: 'auto',
              fontFamily: BRAND.font, fontSize: 10, fontWeight: 500,
              letterSpacing: '0.14em', color: '#888',
            }}>
              MAKER {score}/10
            </span>
          )}
        </div>

        {/* Body */}
        <div style={{
          fontSize: 15, fontWeight: 500, lineHeight: 1.4,
          color: BRAND.dark, marginBottom: 10,
          letterSpacing: '-0.01em',
        }}>
          Source ingested — {paths.length} page{paths.length === 1 ? '' : 's'} written
        </div>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          fontFamily: BRAND.font, fontSize: 12,
          color: '#555', lineHeight: 1.5,
        }}>
          {paths.map((p, i) => (
            <div key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
            }}>
              <span style={{
                width: 4, height: 4, background: '#AAAAAA', display: 'inline-block',
                flexShrink: 0,
              }} />
              {p}
            </div>
          ))}
        </div>

        {/* Progress bar — visually counts down the 5s auto-dismiss */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 2, background: '#F0F0F0',
        }}>
          <div style={{
            height: '100%', background: BRAND.orange,
            animation: 'mi-toast-progress 5s linear forwards',
          }} />
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
export default function CuratorPage() {
  const navigate                        = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Initialise from URL params so refresh restores position ─────────────
  const [section, setSection] = useState(() => searchParams.get('section') || 'queue')

  // ── Sync state → URL ─────────────────────────────────────────────────────
  useEffect(() => {
    setSearchParams(section !== 'queue' ? { section } : {}, { replace: true })
  }, [section]) // eslint-disable-line react-hooks/exhaustive-deps
  const [queue, setQueue]               = useState([])
  const [rejected, setRejected]         = useState([])
  const [stateLoading, setStateLoading] = useState(true)
  const [acting, setActing]             = useState(null)   // id of item being actioned

  const [lintResults, setLintResults]   = useState(null)
  const [lintRunning, setLintRunning]   = useState(false)

  const [logEntries, setLogEntries]     = useState([])
  const [logLoading, setLogLoading]     = useState(false)
  const [indexGroups, setIndexGroups]   = useState([])
  const [indexLoading, setIndexLoading] = useState(false)

  // ── Auto-Approved toast — shown over the Queue tab when a submit bypassed
  // the queue. Holds the wiki_paths so the modal can show what was written.
  // Auto-clears after 5s.
  const [autoApproved, setAutoApproved] = useState(null)
  useEffect(() => {
    if (!autoApproved) return
    const id = setTimeout(() => setAutoApproved(null), 5000)
    return () => clearTimeout(id)
  }, [autoApproved])

  const [panelPath, setPanelPath]       = useState(null)

  // ── Load queue + rejected from real API on mount ──────────────────────
  function loadState() {
    setStateLoading(true)
    fetchState()
      .then((s) => {
        setQueue((s.pending_queue || []).map(normalizeQueueItem))
        setRejected((s.rejection_log || []).map(normalizeRejectedItem))
      })
      .catch(() => {})
      .finally(() => setStateLoading(false))
  }

  useEffect(() => { loadState() }, [])

  // ── Log: lazy fetch on tab open ───────────────────────────────────────
  useEffect(() => {
    if (section !== 'log') return
    setLogLoading(true)
    fetchPage('log')
      .then((d) => setLogEntries(parseLogContent(d.content)))
      .catch(() => {})
      .finally(() => setLogLoading(false))
  }, [section])

  // ── Index: lazy fetch on tab open ─────────────────────────────────────
  useEffect(() => {
    if (section !== 'index') return
    setIndexLoading(true)
    fetchPages()
      .then((pages) => setIndexGroups(buildIndexGroups(pages)))
      .catch(() => {})
      .finally(() => setIndexLoading(false))
  }, [section])

  // ── Queue actions (approve / reject via real API) ─────────────────────
  async function onQueueAction(id, action) {
    setActing(id)
    try {
      if (action === 'approve') await approveQueueItem(id)
      else if (action === 'reject') await rejectQueueItem(id)
      // optimistic remove + reload state for accuracy
      setQueue((q) => q.filter((it) => it.id !== id))
      loadState()
    } catch (e) {
      console.error('Queue action failed:', e)
      loadState() // re-sync on error
    } finally {
      setActing(null)
    }
  }

  // ── Escalate rejected → queue ─────────────────────────────────────────
  function onReviewRejected(id) {
    const item = rejected.find((r) => r.id === id)
    if (!item) return
    setRejected((r) => r.filter((x) => x.id !== id))
    setQueue((q) => [{
      id: 'esc-' + id, layer: 2,
      filename: item.filename, date: item.date,
      outcome: 'C', outcomeLabel: 'Escalated from auto-reject',
      maker:   { score: item.score, reason: item.reason },
      checker: { score: '—', reason: 'Re-scoring requested by curator.' },
      why: 'Manual escalation from Auto-Rejected.',
    }, ...q])
    setSection('queue')
  }

  function runLint() {
    setLintRunning(true)
    // TODO: wire → POST /api/lint when endpoint is implemented
    setTimeout(() => {
      setLintResults({ ...MOCK_LINT_RESULTS, ranAt: new Date().toLocaleTimeString() })
      setLintRunning(false)
    }, 600)
  }

  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', fontFamily: BRAND.font, color: BRAND.dark, background: BRAND.bg, overflow: 'hidden' }}>
      <Sidebar
        active={section}
        onSelect={setSection}
        queueCount={queue.length}
        onHome={() => navigate('/')}
      />

      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '24px 28px', background: BRAND.bg, position: 'relative' }}>
        {section === 'queue'    && <QueueSection items={queue} onAction={onQueueAction} acting={acting} loading={stateLoading} />}
        {section === 'submit'   && (
          <SubmitSection
            onSubmitSuccess={(res) => {
              loadState()
              // If the backend wrote pages inline (AUTO-APPROVE bypass), capture
              // the result so the Queue tab shows the success modal.
              if (res && res.auto_written && Array.isArray(res.wiki_paths) && res.wiki_paths.length) {
                setAutoApproved({ paths: res.wiki_paths, score: res.maker_score })
              }
              setSection('queue')
            }}
          />
        )}
        {section === 'log'      && <LogSection entries={logEntries} loading={logLoading} />}
        {section === 'index'    && <IndexSection groups={indexGroups} openWiki={setPanelPath} loading={indexLoading} />}
        {section === 'rejected' && <RejectedSection items={rejected} onReview={onReviewRejected} loading={stateLoading} />}
        {section === 'lint'     && <LintSection results={lintResults} onRun={runLint} running={lintRunning} />}

        {/* Auto-Approved toast — overlays the Queue tab only, auto-dismisses after 5s */}
        {autoApproved && section === 'queue' && (
          <AutoApprovedToast
            paths={autoApproved.paths}
            score={autoApproved.score}
            onClose={() => setAutoApproved(null)}
          />
        )}
      </main>

      {panelPath && <WikiPagePanel path={panelPath} onClose={() => setPanelPath(null)} />}
    </div>
  )
}
