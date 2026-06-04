import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchPages, fetchFeed } from '../api.js'

// ── No-scrollbar style ───────────────────────────────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('hp-no-scrollbar')) {
  const s = document.createElement('style')
  s.id = 'hp-no-scrollbar'
  s.textContent = '.hp-no-scroll::-webkit-scrollbar{display:none}.hp-no-scroll{-ms-overflow-style:none;scrollbar-width:none}'
  document.head.appendChild(s)
}

// ── Tokens ───────────────────────────────────────────────────────────────────
const MI = {
  d: {
    bg:           '#0d0e10',
    panel:        '#16181b',
    panelHover:   '#1c1f23',
    panelHi:      '#1b1e22',
    orange:       '#ce3e00',
    border:       'rgba(255,255,255,0.08)',
    borderBright: 'rgba(255,255,255,0.15)',
    borderHi:     'rgba(255,255,255,0.16)',
    muted:        'rgba(255,255,255,0.45)',
    soft:         'rgba(255,255,255,0.28)',
    faint:        'rgba(255,255,255,0.34)',
    text:         '#FFFFFF',
    font:         '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
}

const GRID_BG = {
  backgroundImage: [
    'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px)',
    'linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
  ].join(', '),
  backgroundSize: '52px 52px',
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function signalColor(signal) {
  if (!signal) return 'rgba(255,255,255,0.34)'
  const s = signal.toLowerCase()
  if (s === 'opportunity')                       return '#16A34A'
  if (s === 'threat')                             return '#DC2626'
  if (s === 'watch')                              return '#D97706'
  if (s === 'active' || s === 'regulatory')      return '#D97706'
  if (s === 'tailwind' || s === 'market-signal') return '#0D9488'
  if (s === 'headwind')                           return '#DC2626'
  return 'rgba(255,255,255,0.34)'
}

function relativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1) return 'Just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  if (d < 7) return `${d} days ago`
  return dateStr
}

// ── Icons ────────────────────────────────────────────────────────────────────
const Stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'square' }

const IconIntelligence = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...Stroke}>
    <circle cx="10.5" cy="10.5" r="6.5" />
    <line x1="15.5" y1="15.5" x2="20" y2="20" />
    <line x1="8" y1="10.5" x2="13" y2="10.5" />
    <line x1="10.5" y1="8" x2="10.5" y2="13" />
  </svg>
)

const IconVault = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...Stroke}>
    <rect x="3" y="5" width="18" height="14" />
    <polyline points="3,5 9,5 11,9 21,9" />
    <line x1="3" y1="13" x2="21" y2="13" />
    <line x1="8" y1="13" x2="8" y2="19" />
  </svg>
)

const IconBattlecards = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...Stroke}>
    <rect x="2" y="2" width="9" height="9" />
    <rect x="13" y="2" width="9" height="9" />
    <rect x="2" y="13" width="9" height="9" />
    <rect x="13" y="13" width="9" height="9" />
    <line x1="4" y1="5" x2="9" y2="5" />
    <line x1="15" y1="5" x2="20" y2="5" />
    <line x1="4" y1="16" x2="9" y2="16" />
    <line x1="15" y1="16" x2="20" y2="16" />
  </svg>
)

const IconArrow = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="square">
    <line x1="2" y1="8" x2="12.5" y2="8" />
    <polyline points="9,4 13,8 9,12" />
  </svg>
)

const IconSources = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
    <rect x="3" y="16" width="22" height="8" />
    <polyline points="9,11 14,6 19,11" />
    <line x1="14" y1="6" x2="14" y2="18" />
    <line x1="7" y1="20" x2="9" y2="20" />
  </svg>
)

const IconCurator = ({ size = 17 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
    <rect x="4" y="3" width="20" height="22" />
    <line x1="8" y1="9"  x2="16" y2="9" />
    <line x1="8" y1="13" x2="14" y2="13" />
    <line x1="8" y1="18" x2="12" y2="18" />
    <polyline points="16,18 18,20 21,16" />
  </svg>
)

// ── Live chip ─────────────────────────────────────────────────────────────────
function LiveChip() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '5px 12px 5px 10px', borderRadius: 999,
      border: `1px solid ${MI.d.border}`,
      background: 'rgba(255,255,255,0.04)',
      fontFamily: MI.d.font, fontSize: 11.5, fontWeight: 500,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: '#22a06b',
        boxShadow: '0 0 0 2.5px rgba(34,160,107,0.20)',
        display: 'inline-block', flexShrink: 0,
      }} />
      <span style={{ color: MI.d.text }}>Live</span>
      <span style={{ color: MI.d.soft }}>·</span>
      <span style={{ color: MI.d.muted }}>wiki-sourced</span>
    </div>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────
function Header() {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '18px 40px',
      borderBottom: `1px solid ${MI.d.border}`,
      flexShrink: 0,
      background: '#000000',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{
          fontFamily: 'sans-serif', fontWeight: 700,
          fontSize: 28, letterSpacing: '-0.02em',
          color: MI.d.text, lineHeight: 1,
        }}>scapia</span>
        <span style={{
          fontFamily: MI.d.font, fontWeight: 600,
          fontSize: 10.5, letterSpacing: '0.26em',
          color: MI.d.orange, textTransform: 'uppercase', lineHeight: 1,
        }}>Market Intel</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{
          fontFamily: MI.d.font, fontSize: 10, fontWeight: 600,
          letterSpacing: '0.22em', color: MI.d.soft,
          textTransform: 'uppercase',
        }}>Command Center</span>
        <LiveChip />
      </div>
    </header>
  )
}

// ── Recent queries preview ──────────────────────────────────────────────────
// Mini list of the 3 most-recent threads from localStorage. Hidden entirely
// when there are no past queries (no clutter on first visit). Row click →
// navigates to /intelligence?thread=<id> which opens that thread directly
// on the Intelligence page. "View all" link goes to the bare /intelligence.
const RECENT_THREADS_KEY = 'mi_query_threads'

function relTime(ts) {
  if (!ts) return ''
  const diffMs = Date.now() - ts
  const m = Math.floor(diffMs / 60000)
  if (m < 1)    return 'just now'
  if (m < 60)   return m + 'm ago'
  const h = Math.floor(m / 60)
  if (h < 24)   return h + 'h ago'
  const d = Math.floor(h / 24)
  if (d === 1)  return 'Yesterday'
  if (d < 7)    return d + ' days ago'
  const w = Math.floor(d / 7)
  if (w < 4)    return w + 'w ago'
  return new Date(ts).toLocaleDateString(undefined, { day: '2-digit', month: 'short' })
}

function readThreads() {
  try {
    const raw = localStorage.getItem(RECENT_THREADS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function RecentQueriesPreview() {
  const navigate = useNavigate()
  const [threads, setThreads] = useState(() => readThreads())
  const [hoverRow, setHoverRow] = useState(null)
  const [hoverViewAll, setHoverViewAll] = useState(false)

  // Refresh on storage events + when IntelligencePage finishes a turn
  useEffect(() => {
    const refresh = () => setThreads(readThreads())
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('mi_threads_updated', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('mi_threads_updated', refresh)
    }
  }, [])

  const sorted = [...threads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const top3 = sorted.slice(0, 3)
  const total = sorted.length

  // Hide block entirely when empty — per the locked spec
  if (total === 0) return null

  const openThread = (id) => navigate('/intelligence?thread=' + encodeURIComponent(id))
  const viewAll = () => navigate('/intelligence')

  return (
    <div style={{
      background: '#000000',
      // Top border is omitted — the Intelligence hero above provides the
      // dividing line (its borderBottom). Left/right/bottom + the 4px orange
      // rail make this read as a continuation of the same card.
      borderTop:    'none',
      borderRight:  `1px solid ${MI.d.border}`,
      borderBottom: `1px solid ${MI.d.border}`,
      borderLeft:   `4px solid ${MI.d.orange}`,
      padding: '12px 22px 8px',
      marginBottom: 28,
      fontFamily: MI.d.font,
    }}>
      {/* Header — eyebrow label + View all (N) → */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        marginBottom: 6,
      }}>
        <div style={{
          fontFamily: MI.d.font, fontSize: 10, fontWeight: 600,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: MI.d.soft,
        }}>
          Recent Queries
        </div>
        <button
          onClick={viewAll}
          onMouseEnter={() => setHoverViewAll(true)}
          onMouseLeave={() => setHoverViewAll(false)}
          style={{
            all: 'unset', cursor: 'pointer',
            fontFamily: MI.d.font, fontSize: 11, fontWeight: 500,
            letterSpacing: '0.04em',
            color: hoverViewAll ? MI.d.orange : MI.d.muted,
            transition: 'color .14s',
          }}
        >
          View all ({total}) →
        </button>
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {top3.map((t, i) => {
          const q = t?.turns?.[0]?.question || 'Untitled'
          const isHover = hoverRow === t.id
          return (
            <button
              key={t.id}
              onClick={() => openThread(t.id)}
              onMouseEnter={() => setHoverRow(t.id)}
              onMouseLeave={() => setHoverRow(null)}
              title={q}
              style={{
                all: 'unset', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '6px 0',
                borderTop: i === 0 ? 'none' : `1px solid rgba(255,255,255,0.06)`,
              }}
            >
              <span style={{
                width: 5, height: 5, flexShrink: 0,
                background: isHover ? MI.d.orange : MI.d.faint,
                transition: 'background .14s',
              }} />
              <span style={{
                flex: 1, minWidth: 0,
                fontFamily: MI.d.font, fontSize: 13.5, fontWeight: 400,
                color: isHover ? '#fff' : 'rgba(255,255,255,0.72)',
                letterSpacing: '-0.005em',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                transition: 'color .14s',
              }}>
                {q}
              </span>
              <span style={{
                fontFamily: MI.d.font, fontSize: 10.5,
                letterSpacing: '0.04em',
                color: isHover ? MI.d.orange : MI.d.faint,
                whiteSpace: 'nowrap', flexShrink: 0,
                transition: 'color .14s',
              }}>
                {relTime(t.updatedAt)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Nav card (Vault / Intel Cards) ────────────────────────────────────────────
function NavCard({ icon: Icon, name, desc, route }) {
  const [hover, setHover] = useState(false)
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(route)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        background: '#000000',
        borderTop:    `1px solid ${hover ? MI.d.orange : MI.d.border}`,
        borderRight:  `1px solid ${hover ? MI.d.orange : MI.d.border}`,
        borderBottom: `1px solid ${hover ? MI.d.orange : MI.d.border}`,
        borderLeft:   `1px solid ${hover ? MI.d.orange : MI.d.border}`,
        padding: '24px 24px',
        minHeight: 155,
        transition: 'border-color .16s, transform .18s, box-shadow .18s',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover
          ? `0 0 0 1px ${MI.d.orange}22, 0 8px 28px rgba(0,0,0,0.55)`
          : '0 2px 8px rgba(0,0,0,0.3)',
        fontFamily: MI.d.font,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ color: hover ? MI.d.orange : MI.d.muted, transition: 'color .16s' }}>
            <Icon size={19} />
          </div>
          <div style={{
            fontWeight: 600, fontSize: 22, letterSpacing: '-0.02em',
            color: hover ? MI.d.orange : MI.d.text, lineHeight: 1.1,
            transition: 'color .16s',
          }}>{name}</div>
        </div>
        <div style={{
          color: hover ? MI.d.orange : MI.d.soft,
          transform: hover ? 'translateX(2px)' : 'none',
          transition: 'color .16s, transform .15s',
          marginTop: 2, flexShrink: 0,
        }}>
          <IconArrow size={20} />
        </div>
      </div>
      <div style={{ fontSize: 12, color: MI.d.muted, lineHeight: 1.45, marginTop: 10 }}>
        {desc}
      </div>
    </button>
  )
}

// ── Ops pill + group ──────────────────────────────────────────────────────────
function OpsPill({ Icon, name, sub, route }) {
  const [hover, setHover] = useState(false)
  const navigate = useNavigate()
  return (
    <button
      onClick={() => navigate(route)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
        flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 14,
        padding: '14px 22px', borderRadius: 999,
        background: '#000000',
        border: `1px solid ${hover ? MI.d.orange : 'rgba(255,255,255,0.14)'}`,
        boxShadow: hover ? `0 0 0 1px ${MI.d.orange}22` : 'none',
        transition: 'border-color .16s, box-shadow .16s',
        fontFamily: MI.d.font,
      }}
    >
      {/* Icon */}
      <span style={{
        color: hover ? MI.d.orange : MI.d.muted,
        display: 'inline-flex', transition: 'color .16s',
      }}>
        <Icon size={19} />
      </span>
      {/* Label + sub */}
      <div style={{ lineHeight: 1.25, whiteSpace: 'nowrap' }}>
        <div style={{
          fontSize: 13.5, fontWeight: 600,
          color: hover ? MI.d.orange : MI.d.text,
          transition: 'color .16s',
        }}>{name}</div>
        {sub && (
          <div style={{ fontSize: 10.5, color: MI.d.faint, letterSpacing: '0.03em', marginTop: 2 }}>{sub}</div>
        )}
      </div>
      {/* Arrow */}
      <span style={{
        color: hover ? MI.d.orange : MI.d.faint,
        display: 'inline-flex', transition: 'color .16s',
      }}>
        <IconArrow size={14} />
      </span>
    </button>
  )
}

function OpsGroup({ stats }) {
  const sourcesSub = `${stats?.sources ?? '…'} · ${stats?.lastIngested ?? '…'}`
  const curatorSub = `${stats?.flags ?? '…'} flags · ${stats?.pending ?? '…'} pending`
  return (
    <div style={{
      width: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: 10, marginTop: 24,
    }}>
      <div style={{
        fontFamily: MI.d.font, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.22em', textTransform: 'uppercase',
        color: MI.d.faint,
      }}>Ops</div>
      <div style={{ display: 'flex', gap: 12 }}>
        <OpsPill Icon={IconSources} name="Sources" sub={sourcesSub} route="/sources" />
        <OpsPill Icon={IconCurator} name="Curator" sub={curatorSub} route="/curator" />
      </div>
    </div>
  )
}

// ── System Pulse ──────────────────────────────────────────────────────────────
function StatCol({ value, label, warn }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
      <span style={{
        fontFamily: MI.d.font, fontSize: 20, fontWeight: 600,
        letterSpacing: '-0.02em',
        color: warn ? MI.d.orange : MI.d.text,
        lineHeight: 1,
      }}>{value}</span>
      <span style={{
        fontFamily: MI.d.font, fontSize: 9, fontWeight: 600,
        letterSpacing: '0.15em', textTransform: 'uppercase',
        color: MI.d.soft,
      }}>{label}</span>
    </div>
  )
}

function SystemPulse({ stats }) {
  const items = [
    { label: 'Entities Tracked', value: stats?.entities ?? '…', warn: false },
    { label: 'Sources Indexed',  value: stats?.sources  ?? '…', warn: false },
    { label: 'Pending Review',   value: stats?.pending  ?? '…', warn: (stats?.pending ?? 0) > 0 },
    { label: 'Open Flags',       value: stats?.flags    ?? '…', warn: (stats?.flags   ?? 0) > 0 },
  ]
  return (
    <div style={{
      borderTop: `1px solid ${MI.d.border}`,
      padding: '16px 40px',
      display: 'flex', alignItems: 'center', flexShrink: 0,
      background: '#000000',
    }}>
      <span style={{
        fontFamily: MI.d.font, fontSize: 9, fontWeight: 600,
        letterSpacing: '0.22em', color: 'rgba(255,255,255,0.22)',
        textTransform: 'uppercase', marginRight: 22, whiteSpace: 'nowrap',
      }}>System Pulse</span>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {items.map((it, i) => (
          <React.Fragment key={it.label}>
            {i > 0 && (
              <span style={{
                color: 'rgba(255,255,255,0.12)', fontSize: 16, lineHeight: 1,
                margin: '0 22px', userSelect: 'none',
              }}>|</span>
            )}
            <StatCol value={it.value} label={it.label} warn={it.warn} />
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

// ── Feed item ─────────────────────────────────────────────────────────────────
function FeedItem({ item, onMarkPageOpened, navigate }) {
  const [hover, setHover] = useState(false)
  const primaryPath = item.touches?.[0] || null

  function handleClick() {
    if (primaryPath) onMarkPageOpened(primaryPath)
    const dest = primaryPath
      ? `/vault?open=${encodeURIComponent(primaryPath)}`
      : '/vault'
    navigate(dest)
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
        display: 'block', width: '100%',
        padding: '8px 12px',
        background: hover ? 'rgba(255,255,255,0.04)' : 'transparent',
        transition: 'background .12s',
        textAlign: 'left',
      }}
    >

      
      {/* Row 1: signal dot · entity · chips */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2, minWidth: 0 }}>
        <span style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: signalColor(item.signal),
          display: 'inline-block',
        }} />
        <span style={{
          fontFamily: MI.d.font, fontSize: 11, fontWeight: 500,
          color: MI.d.text, flexShrink: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          maxWidth: 80,
        }}>{item.primary_title || item.primary_entity}</span>
        {item.page_types?.[0] && (
          <span style={{
            fontFamily: MI.d.font, fontSize: 8.5, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.38)',
            flexShrink: 0, whiteSpace: 'nowrap',
          }}>{item.page_types[0]}</span>
        )}
      </div>


      {/* Row 2: headline · time */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, paddingLeft: 11 }}>
        <span style={{
          fontFamily: MI.d.font, fontSize: 10.5, color: MI.d.muted,
          flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          lineHeight: 1.35,
        }}>{item.headline}</span>
        <span style={{
          fontFamily: MI.d.font, fontSize: 9, color: 'rgba(255,255,255,0.25)',
          flexShrink: 0, whiteSpace: 'nowrap',
        }}>· {relativeTime(item.ingested)}</span>
      </div>
    </button>
  )
}

// ── Feed section — one scrollable half of the panel ──────────────────────────
function FeedSection({ items, feedLoaded, noItemsAtAll, onMarkPageOpened, navigate }) {
  const emptyText = !feedLoaded
    ? 'Loading…'
    : noItemsAtAll
      ? 'No sources — restart server'
      : 'All caught up'
  const emptyColor = !feedLoaded || noItemsAtAll
    ? 'rgba(255,255,255,0.25)'
    : 'rgba(255,255,255,0.18)'
  return (
    <div className="hp-no-scroll" style={{ flex: 1, overflowY: 'auto', padding: '2px 0', minHeight: 0 }}>
      {items.length === 0 ? (
        <div style={{
          height: '100%', minHeight: 70,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: emptyColor, fontFamily: MI.d.font, fontSize: 11,
          fontStyle: 'italic',
        }}>{emptyText}</div>
      ) : (
        items.map((item) => (
          <FeedItem
            key={item.slug}
            item={item}
            onMarkPageOpened={onMarkPageOpened}
            navigate={navigate}
          />
        ))
      )}
    </div>
  )
}

// ── Feed panel — vertical stack: Last 24h (top) / Unseen earlier (bottom) ────
function FeedPanel({ items, feedLoaded, openedPages, onMarkPageOpened, onMarkAllRead, onRefresh, navigate }) {
  const now    = Date.now()
  const MS_24H = 24 * 60 * 60 * 1000

  function isUnread(item) {
    const path = item.touches?.[0]
    if (!path) return true
    return !openedPages.has(path)
  }

  const allUnread   = items.filter(isUnread)
  const recentUnread = allUnread.filter((item) => {
    const age = now - new Date(item.ingested).getTime()
    return age >= 0 && age < MS_24H
  })
  // "Unseen earlier" = unread items NOT in the recent bucket
  const earlierUnread = allUnread.filter((item) => {
    const age = now - new Date(item.ingested).getTime()
    return age < 0 || age >= MS_24H   // future-dated items also fall here
  })

  const totalUnread   = allUnread.length
  const noItemsAtAll  = feedLoaded && items.length === 0

  return (
    <div style={{
      flex: 3,
      borderLeft: `1px solid ${MI.d.border}`,
      display: 'flex', flexDirection: 'column',
      height: '100%', background: MI.d.bg,
      minWidth: 0,
    }}>

      {/* ── Panel header ────────────────────────────────────────────────── */}
      <div style={{
        padding: '13px 16px 11px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
      }}>
        <span style={{ fontFamily: MI.d.font, fontWeight: 600, fontSize: 13, color: MI.d.text }}>
          What's New
        </span>
        {totalUnread > 0 && (
          <span style={{
            background: 'rgba(206,62,0,0.18)', color: MI.d.orange,
            fontFamily: MI.d.font, fontSize: 10, fontWeight: 700,
            padding: '2px 7px', borderRadius: 999,
          }}>{totalUnread}</span>
        )}
      </div>

      {/* ── Upper section: Last 24h ──────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        {/* Section label */}
        <div style={{
          padding: '7px 16px 5px',
          fontFamily: MI.d.font, fontSize: 9, fontWeight: 600,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.28)', flexShrink: 0,
        }}>Last 24h</div>
        <FeedSection
          items={recentUnread}
          feedLoaded={feedLoaded}
          noItemsAtAll={noItemsAtAll}
          onMarkPageOpened={onMarkPageOpened}
          navigate={navigate}
        />
      </div>

      {/* ── Section divider ──────────────────────────────────────────────── */}
      <div style={{
        flexShrink: 0,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        padding: '7px 16px 5px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{
          fontFamily: MI.d.font, fontSize: 9, fontWeight: 600,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.28)',
        }}>Unseen earlier</span>
      </div>

      {/* ── Lower section: older unread ──────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <FeedSection
          items={earlierUnread}
          feedLoaded={feedLoaded}
          noItemsAtAll={noItemsAtAll}
          onMarkPageOpened={onMarkPageOpened}
          navigate={navigate}
        />
      </div>

      {/* ── Bottom bar ──────────────────────────────────────────────────── */}
      <BottomBar
        hasUnread={totalUnread > 0}
        onMarkAllRead={onMarkAllRead}
        onRefresh={onRefresh}
      />
    </div>
  )
}

// ── Bottom bar ────────────────────────────────────────────────────────────────
function BottomBar({ hasUnread, onMarkAllRead, onRefresh }) {
  const [markHover,    setMarkHover]    = useState(false)
  const [refreshHover, setRefreshHover] = useState(false)
  return (
    <div style={{
      borderTop: '1px solid rgba(255,255,255,0.07)',
      padding: '10px 14px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      {hasUnread ? (
        <span
          onMouseEnter={() => setMarkHover(true)}
          onMouseLeave={() => setMarkHover(false)}
          onClick={onMarkAllRead}
          style={{
            fontFamily: MI.d.font, fontSize: 11, fontWeight: 400, cursor: 'pointer',
            color: markHover ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.35)',
            transition: 'color .15s', userSelect: 'none',
          }}
        >Mark all as read</span>
      ) : (
        <span style={{
          fontFamily: MI.d.font, fontSize: 11,
          color: 'rgba(255,255,255,0.18)', fontStyle: 'italic',
        }}>All read</span>
      )}
      <span
        onMouseEnter={() => setRefreshHover(true)}
        onMouseLeave={() => setRefreshHover(false)}
        onClick={onRefresh}
        title="Mark all pages as unread — dots reappear on Vault cards"
        style={{
          fontFamily: MI.d.font, fontSize: 10.5, cursor: 'pointer',
          color: refreshHover ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.28)',
          transition: 'color .15s', userSelect: 'none',
          letterSpacing: '0.02em',
        }}
      >↺ mark all unread</span>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function HomePage() {
  const navigate                = useNavigate()
  const [query, setQuery]           = useState('')
  const [stats, setStats]           = useState(null)
  const [sendHover, setSendHover]   = useState(false)
  const [inputFocused, setInputFocused] = useState(false)
  const [feedItems, setFeedItems]   = useState([])
  const [feedLoaded, setFeedLoaded] = useState(false)

  // ── Opened-pages state — shared with VaultPage via localStorage ──────────
  const [openedPages, setOpenedPages] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('mi_opened_pages') || '[]')) }
    catch { return new Set() }
  })

  function markPageOpened(path) {
    if (!path) return
    setOpenedPages((prev) => {
      if (prev.has(path)) return prev
      const next = new Set(prev)
      next.add(path)
      try { localStorage.setItem('mi_opened_pages', JSON.stringify([...next])) } catch {}
      return next
    })
  }

  function markAllRead() {
    const allPaths = feedItems.map((i) => i.touches?.[0]).filter(Boolean)
    const next = new Set([...openedPages, ...allPaths])
    try { localStorage.setItem('mi_opened_pages', JSON.stringify([...next])) } catch {}
    setOpenedPages(next)
  }

  function handleRefresh() {
    try {
      localStorage.removeItem('mi_opened_pages')
      localStorage.removeItem('mi_seen_sources') // clear legacy key too
    } catch {}
    setOpenedPages(new Set())
    setFeedLoaded(false)
    fetchFeed()
      .then((data) => { setFeedItems(data.items || []); setFeedLoaded(true) })
      .catch(() => { setFeedLoaded(true) })
  }

  // ── Load stats ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchPages()
      .then((data) => {
        // Flags = real lint-style flags across the wiki:
        //   - any regulatory page with posture = "Escalated"
        // (Future: also count ⚠ Unsourced / ⚠ Conflict markers in page bodies
        //  — requires backend support since those live in body text, not frontmatter)
        const escalated = Array.isArray(data.regulatory)
          ? data.regulatory.filter((r) => (r.posture || '').toLowerCase() === 'escalated').length
          : 0
        setStats({
          entities:      Array.isArray(data.entities) ? data.entities.length : '—',
          sources:       Array.isArray(data.sources)  ? data.sources.length  : '—',
          pending:       Array.isArray(data.queue)    ? data.queue.length    : '—',
          flags:         escalated,
          lastIngested:  data.lastIngested || '—',
        })
      })
      .catch(() => {})
  }, [])

  // ── Load feed ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchFeed()
      .then((data) => { setFeedItems(data.items || []); setFeedLoaded(true) })
      .catch(() => { setFeedLoaded(true) })  // loaded=true even on error so UI knows
  }, [])

  function handleSend() {
    if (query.trim()) navigate('/intelligence?q=' + encodeURIComponent(query.trim()))
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSend()
  }

  return (
    <div style={{
      background: MI.d.bg,
      height: '100vh',
      fontFamily: MI.d.font,
      color: MI.d.text,
      display: 'flex',
      flexDirection: 'column',
      ...GRID_BG,
    }}>
      <Header />

      {/* ── Body row (left 70% + right 30%) ─────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>

        {/* ── Left 70% ─────────────────────────────────────────────────── */}
        <div style={{ flex: 7, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

          <main className="hp-no-scroll" style={{ flex: 1, padding: '36px 40px 24px', overflowY: 'auto', backgroundColor: '#212121', ...GRID_BG }}>

            {/* Hero Intelligence card — flush with the Recent Queries panel
                below it (they share the same left orange rail and form one
                visual card with an internal horizontal divider) */}
            <div style={{
              background: '#000000',
              borderTop:    `1px solid ${MI.d.border}`,
              borderRight:  `1px solid ${MI.d.border}`,
              borderBottom: `1px solid ${MI.d.border}`,
              borderLeft:   `4px solid ${MI.d.orange}`,
              padding: '40px 36px',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 13, marginBottom: 18 }}>
                <div style={{ color: MI.d.orange, marginTop: 2, flexShrink: 0 }}>
                  <IconIntelligence size={21} />
                </div>
                <div>
                  <div style={{
                    fontWeight: 700, fontSize: 32,
                    letterSpacing: '-0.02em', lineHeight: 1,
                    color: MI.d.text,
                  }}>Intelligence</div>
                  <div style={{
                    marginTop: 5, fontSize: 12.5,
                    color: MI.d.muted, lineHeight: 1.4,
                  }}>
                    Ask questions, get sourced answers across Fintech and Travel.
                  </div>
                </div>
              </div>

              {/* Query input */}
              <div style={{
                display: 'flex', alignItems: 'center',
                background: '#212121',
                border: `1px solid ${inputFocused ? MI.d.orange : MI.d.borderBright}`,
                padding: '3px 3px 3px 14px',
                transition: 'border-color .15s',
              }}>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  placeholder="Ask about competitors, regulations, market signals…"
                  style={{
                    all: 'unset', flex: 1,
                    fontFamily: MI.d.font, fontSize: 13.5,
                    color: MI.d.text, padding: '9px 0',
                  }}
                />
                <button
                  onClick={handleSend}
                  onMouseEnter={() => setSendHover(true)}
                  onMouseLeave={() => setSendHover(false)}
                  aria-label="Send query"
                  style={{
                    all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
                    width: 34, height: 34,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    background: query.trim()
                      ? (sendHover ? '#b83600' : MI.d.orange)
                      : 'rgba(255,255,255,0.06)',
                    color: query.trim() ? '#fff' : MI.d.soft,
                    transition: 'background .15s, color .15s',
                    flexShrink: 0,
                  }}
                >
                  <IconArrow size={20} />
                </button>
              </div>
            </div>

            {/* Recent queries preview — hidden when empty */}
            <RecentQueriesPreview />

            {/* 2-col nav row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <NavCard
                icon={IconVault}
                name="Vault"
                desc="Browse the full wiki. Organized by domain, category, and page type."
                route="/vault"
              />
              <NavCard
                icon={IconBattlecards}
                name="Intel Cards"
                desc="Competitor and regulatory cards. Always current, wiki-sourced."
                route="/battlecards"
              />
            </div>

            {/* Ops pills */}
            <OpsGroup stats={stats} />
          </main>

          <SystemPulse stats={stats} />
        </div>

        {/* ── Right 30% — Feed panel ───────────────────────────────────── */}
        <FeedPanel
          items={feedItems}
          feedLoaded={feedLoaded}
          openedPages={openedPages}
          onMarkPageOpened={markPageOpened}
          onMarkAllRead={markAllRead}
          onRefresh={handleRefresh}
          navigate={navigate}
        />
      </div>
    </div>
  )
}
