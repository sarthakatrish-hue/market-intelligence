import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchPages } from '../api.js'
import WikiPagePanel from '../components/WikiPagePanel.jsx'

// ─── Tokens ────────────────────────────────────────────────────────────────
const BRAND = {
  orange:    '#ce3e00',
  bg:        '#f1f6fa',
  dark:      '#111111',
  white:     '#FFFFFF',
  border:    '#E8E8E8',
  muted:     '#888888',
  mutedSoft: '#AAAAAA',
  font:      '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

// Semantic colours — drive card left-borders + status badges
const SEMANTIC = {
  threat:       '#DC2626',
  opportunity:  '#16A34A',
  watch:        '#D97706',
  partner:      '#2563EB',
  marketsignal: '#0D9488',
  concept:      '#6B7280',
  comparison:   '#ce3e00',
  active:       '#16A34A',
  underreview:  '#D97706',
  escalated:    '#DC2626',
  superseded:   '#9CA3AF',
  eventfallback:'#D97706',
}

// Inject .no-scrollbar once
if (typeof document !== 'undefined' && !document.getElementById('vault-no-scrollbar')) {
  const s = document.createElement('style')
  s.id = 'vault-no-scrollbar'
  s.textContent = '.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}'
  document.head.appendChild(s)
}

// ─── Domain tree ───────────────────────────────────────────────────────────
const TREE = [
  { id: 'all',   label: 'All',    kind: 'top' },
  { id: 'fintech', label: 'Fintech', kind: 'top' },
  {
    id: 'travel', label: 'Travel', kind: 'top', expandable: true,
    children: [
      { id: 'travel.all',         label: 'All' },
      { id: 'travel.flights',     label: 'Flights' },
      { id: 'travel.stays',       label: 'Stays' },
      { id: 'travel.trains',      label: 'Trains' },
      { id: 'travel.buses',       label: 'Buses' },
      { id: 'travel.visas',       label: 'Visas' },
      { id: 'travel.experiences', label: 'Experiences' },
      { id: 'travel.store',       label: 'Store' },
    ],
  },
]

function domainPredicate(nodeId) {
  if (nodeId === 'all') return () => true
  if (nodeId === 'fintech') return (p) => p.domains.includes('fintech')
  if (nodeId === 'travel' || nodeId === 'travel.all')
    return (p) => p.domains.includes('travel')
  const sub = nodeId.split('.')[1]
  return (p) => p.domains.includes('travel') && p.travel_categories.includes(sub)
}

function nodeTitle(nodeId) {
  if (nodeId === 'all') return 'All'
  if (nodeId === 'fintech') return 'Fintech'
  if (nodeId === 'travel' || nodeId === 'travel.all') return 'Travel'
  const sub = nodeId.split('.')[1]
  return `Travel · ${sub.charAt(0).toUpperCase() + sub.slice(1)}`
}

// ─── Type tabs ─────────────────────────────────────────────────────────────
const TYPE_TABS = [
  { id: 'all',          label: 'All',            match: () => true },
  { id: 'entity',       label: 'Competitors',       match: (p) => p.page_types.includes('competitor') },
  { id: 'partner',      label: 'Partners',       match: (p) => p.page_types.includes('partner') },
  { id: 'regulatory',   label: 'Regulatory',     match: (p) => p.page_types.includes('regulatory') },
  { id: 'event',        label: 'Events',         match: (p) => p.page_types.includes('event') || p.page_types.includes('customer') },
  { id: 'marketsignal', label: 'Market Signals', match: (p) => p.page_types.includes('market-signal') },
  { id: 'concept',      label: 'Concepts',       match: (p) => p.page_types.includes('concept') },
  { id: 'comparison',   label: 'Comparisons',    match: (p) => p.page_types.includes('comparison') },
]

// ─── Card helpers ──────────────────────────────────────────────────────────
function cardColor(page) {
  switch (page.folder) {
    case 'entities':      return SEMANTIC[page.signal] || SEMANTIC.watch
    case 'regulatory': {
      const key = (page.posture || page.compliance_status || '').toLowerCase().replace(/\s+/g, '')
      return SEMANTIC[key] || SEMANTIC.active
    }
    case 'partners':      return SEMANTIC.partner
    case 'events':        return SEMANTIC[page.signal] || SEMANTIC.eventfallback
    case 'market-signals':return SEMANTIC.marketsignal
    case 'concepts':      return SEMANTIC.concept
    case 'comparisons':   return SEMANTIC.comparison
    default:              return BRAND.muted
  }
}

function typeLabel(page) {
  if (page.page_types.includes('competitor'))    return 'Competitor'
  if (page.page_types.includes('regulatory'))    return 'Regulatory'
  if (page.page_types.includes('partner'))       return 'Partner'
  if (page.page_types.includes('event'))         return 'Event'
  if (page.page_types.includes('customer'))      return 'Customer Signal'
  if (page.page_types.includes('market-signal')) return 'Market Signal'
  if (page.page_types.includes('concept'))       return 'Concept'
  if (page.page_types.includes('comparison'))    return 'Comparison'
  const fallback = { entities: 'Competitor', regulatory: 'Regulatory', events: 'Event',
    partners: 'Partner', 'market-signals': 'Market Signal', concepts: 'Concept',
    comparisons: 'Comparison', synthesis: 'Synthesis' }
  return fallback[page.folder] || page.folder
}

function statusText(page) {
  switch (page.folder) {
    case 'entities':
      return { threat: 'Active threat', opportunity: 'Opportunity', watch: 'Watch' }[page.signal] || page.signal || 'Watch'
    case 'regulatory':
      return page.posture || page.compliance_status || 'Active'
    case 'partners':      return 'Partner'
    case 'events':        return 'Event'
    case 'market-signals':return 'Signal'
    case 'concepts':      return 'Reference'
    case 'comparisons':   return 'Comparison'
    default: return ''
  }
}

function hexToRgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  return `rgba(${parseInt(m[1],16)}, ${parseInt(m[2],16)}, ${parseInt(m[3],16)}, ${a})`
}

// Build display domain chips from frontmatter arrays
function domainChips(page) {
  const out = []
  if (page.domains.includes('fintech')) out.push('Fintech')
  if (page.domains.includes('travel')) {
    if (page.travel_categories.length > 0) {
      page.travel_categories.forEach((tc) =>
        out.push(`Travel · ${tc.charAt(0).toUpperCase() + tc.slice(1)}`)
      )
    } else {
      out.push('Travel')
    }
  }
  return out.length > 0 ? out : ['—']
}

// ─── Sidebar tree row ──────────────────────────────────────────────────────
// variant='l1' → top-level (All, Fintech, Travel)
// variant='l2' → sub-category (Flights, Stays, …)
// parentActive  → Travel header when a child sub-item is selected
function TreeRow({ label, active, parentActive = false, indent = 0,
                   hasChevron = false, expanded = false,
                   onToggleExpand, onClick, variant = 'l1' }) {
  const [hover, setHover] = useState(false)

  let bg, color, fw

  if (variant === 'l2') {
    bg    = active ? 'rgba(206,62,0,0.20)' : hover ? 'rgba(255,255,255,0.05)' : 'transparent'
    color = active ? BRAND.orange : hover ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.38)'
    fw    = active ? 500 : 400
  } else if (parentActive) {
    // Travel header — child is selected below it
    bg    = hover ? 'rgba(206,62,0,0.16)' : 'rgba(206,62,0,0.09)'
    color = BRAND.orange
    fw    = 500
  } else {
    bg    = active ? BRAND.orange : hover ? 'rgba(206,62,0,0.20)' : 'transparent'
    color = active ? BRAND.white : hover ? BRAND.white : 'rgba(255,255,255,0.58)'
    fw    = active ? 500 : 400
  }

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
        padding: variant === 'l1' ? '9px 12px' : '6px 12px',
        paddingLeft: 12 + indent,
        fontFamily: BRAND.font,
        fontSize: variant === 'l1' ? '0.92rem' : '0.80rem',
        fontStyle: variant === 'l2' ? 'italic' : 'normal',
        fontWeight: fw, color, background: bg,
        cursor: 'pointer', transition: 'background .12s, color .12s', userSelect: 'none',
      }}
    >
      {/* left accent bar */}
      {(variant === 'l2' && active) && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: BRAND.orange }} />
      )}
      {parentActive && (
        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: BRAND.orange }} />
      )}
      <span style={{ flex: 1 }}>{label}</span>
      {hasChevron && (
        <span
          onClick={(e) => { e.stopPropagation(); onToggleExpand?.() }}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 20, height: 20,
            color: parentActive ? BRAND.orange : active ? BRAND.white : 'rgba(255,255,255,0.35)',
            fontSize: 17, transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform .15s',
          }}
        >›</span>
      )}
    </div>
  )
}

// ─── Universal card ────────────────────────────────────────────────────────
function PageCard({ page, isOpened, onClick }) {
  const [hover, setHover] = useState(false)
  const color  = cardColor(page)
  const chips  = domainChips(page)
  const status = statusText(page)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', background: BRAND.white,
        borderTop:    `1px solid ${hover ? color : BRAND.border}`,
        borderRight:  `1px solid ${hover ? color : BRAND.border}`,
        borderBottom: `1px solid ${hover ? color : BRAND.border}`,
        borderLeft:   `4px solid ${color}`,
        padding: '16px 18px 14px', cursor: 'pointer',
        transition: 'border-color .18s, transform .15s, box-shadow .15s',
        transform:  hover ? 'translateY(-1px)' : 'none',
        boxShadow:  hover ? '0 6px 18px rgba(17,17,17,0.05)' : 'none',
        display: 'flex', flexDirection: 'column', gap: 12,
        minHeight: 168, fontFamily: BRAND.font,
      }}
    >
      {/* Unread indicator dot — disappears once the card is opened */}
      {!isOpened && (
        <span style={{
          position: 'absolute', top: 9, right: 11,
          width: 7, height: 7, borderRadius: '50%',
          background: BRAND.orange, display: 'block',
          boxShadow: `0 0 0 2px rgba(206,62,0,0.18)`,
        }} />
      )}
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', color: BRAND.muted, textTransform: 'uppercase' }}>
          {typeLabel(page)}
        </span>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {chips.map((d) => (
            <span key={d} style={{
              fontSize: 9.5, fontWeight: 500, letterSpacing: '0.04em',
              color: BRAND.muted, background: '#F5F5F5',
              border: `1px solid ${BRAND.border}`, padding: '2px 6px',
            }}>{d}</span>
          ))}
        </div>
      </div>

      {/* Title + headline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 17, color: BRAND.dark, letterSpacing: '-0.015em', lineHeight: 1.2 }}>
          {page.name}
        </div>
        {page.headline && (
          <div style={{ fontStyle: 'italic', fontSize: 11.5, color: BRAND.mutedSoft, lineHeight: 1.4 }}>
            {page.headline}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        {status && (
          <span style={{
            display: 'inline-block', fontSize: 10, fontWeight: 600,
            letterSpacing: '0.06em', color,
            background: hexToRgba(color, 0.10),
            border: `1px solid ${hexToRgba(color, 0.35)}`,
            padding: '3px 8px', textTransform: 'uppercase',
          }}>{status}</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 11, color: BRAND.mutedSoft }}>
          {page.date}
          {page.sources_count > 0 && ` · ${page.sources_count} ${page.sources_count === 1 ? 'source' : 'sources'}`}
        </span>
      </div>
    </div>
  )
}

// ─── Type tab ──────────────────────────────────────────────────────────────
function TypeTab({ label, count, active, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', cursor: 'pointer',
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '7px 14px', borderRadius: 999,
        background: active ? BRAND.dark : 'transparent',
        color: active ? BRAND.white : hover ? BRAND.dark : BRAND.muted,
        fontFamily: BRAND.font, fontSize: 12.5, fontWeight: active ? 500 : 400,
        transition: 'background .12s, color .12s',
      }}
    >
      <span>{label}</span>
      <span style={{
        fontSize: 10.5, fontWeight: 500, padding: '1px 6px',
        background: active ? 'rgba(255,255,255,0.18)' : '#F0F0F0',
        color: active ? BRAND.white : BRAND.muted,
        borderRadius: 6, minWidth: 16, textAlign: 'center',
      }}>{count}</span>
    </button>
  )
}

// ─── Loading skeleton ──────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div style={{
      background: BRAND.white, borderLeft: `4px solid ${BRAND.border}`,
      border: `1px solid ${BRAND.border}`, padding: '16px 18px',
      minHeight: 168, display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      {[80, 140, 60].map((w, i) => (
        <div key={i} style={{
          height: i === 1 ? 14 : 10, width: `${w}%`, maxWidth: 240,
          background: '#F0F0F0', borderRadius: 4,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

// ─── Normalize a raw meta item into a page object ──────────────────────────
function normalise(item, folder) {
  return {
    id:               item.slug,
    path:             item.path || `${folder}/${item.slug}`,
    name:             item.title || item.slug,
    folder,
    page_types:       Array.isArray(item.page_types)       ? item.page_types       : [],
    domains:          Array.isArray(item.domains)          ? item.domains          : [],
    travel_categories:Array.isArray(item.travel_categories)? item.travel_categories: [],
    signal:           item.signal           || 'watch',
    headline:         item.headline         || '',
    posture:          item.posture || item.compliance_status || '',
    compliance_status:item.compliance_status || '',
    date:             item.last_updated     || item.date || '',
    sources_count:    parseInt(item.sources_count || item.source_count || 0, 10),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// VaultPage
// ═══════════════════════════════════════════════════════════════════════════
export default function VaultPage() {
  const navigate                        = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Initialise from URL params so refresh restores position ─────────────
  const [pages,        setPages]        = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState(null)
  // If navigated from the feed with ?open=path, auto-open that wiki panel
  const [selectedPath, setSelectedPath] = useState(() => {
    const p = searchParams.get('open')
    return p ? decodeURIComponent(p) : null
  })
  const [activeNode,   setActiveNode]   = useState(() => searchParams.get('domain') || 'all')
  const [travelOpen,   setTravelOpen]   = useState(() => {
    const d = searchParams.get('domain') || 'all'
    return d === 'travel' || d.startsWith('travel.')
  })
  const [activeTab,  setActiveTab]  = useState(() => searchParams.get('type') || 'all')
  const [filter,     setFilter]     = useState('')

  // ── Opened-pages tracking (shared with homepage feed via localStorage) ───
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

  // ── Sync state → URL (replace so back/forward still works cleanly) ───────
  useEffect(() => {
    const p = {}
    if (activeNode !== 'all') p.domain = activeNode
    if (activeTab  !== 'all') p.type   = activeTab
    setSearchParams(p, { replace: true })
  }, [activeNode, activeTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load all pages from API ──────────────────────────────────────────────
  useEffect(() => {
    let live = true
    fetchPages()
      .then((data) => {
        if (!live) return
        const FOLDER_KEYS = [
          'entities', 'partners', 'regulatory', 'events',
          'market-signals', 'concepts', 'comparisons',
        ]
        const flat = []
        for (const folder of FOLDER_KEYS) {
          const items = data[folder] || []
          for (const item of items) flat.push(normalise(item, folder))
        }
        setPages(flat)
        setLoading(false)
      })
      .catch((err) => {
        if (live) { setError(err.message); setLoading(false) }
      })
    return () => { live = false }
  }, [])

  // ── Filter pipeline ──────────────────────────────────────────────────────
  const domainFiltered = useMemo(
    () => pages.filter(domainPredicate(activeNode)),
    [pages, activeNode]
  )

  const tabCounts = useMemo(() => {
    const out = {}
    TYPE_TABS.forEach((t) => { out[t.id] = domainFiltered.filter(t.match).length })
    return out
  }, [domainFiltered])

  const typeFiltered = useMemo(() => {
    const tab = TYPE_TABS.find((t) => t.id === activeTab)
    return domainFiltered.filter(tab ? tab.match : () => true)
  }, [domainFiltered, activeTab])

  const visible = useMemo(() => {
    if (!filter) return typeFiltered
    const f = filter.toLowerCase()
    return typeFiltered.filter(
      (p) => p.name.toLowerCase().includes(f) || p.headline.toLowerCase().includes(f)
    )
  }, [typeFiltered, filter])

  return (
    <div style={{
      display: 'flex', height: '100%', width: '100%',
      fontFamily: BRAND.font, color: BRAND.dark, background: BRAND.bg,
      overflow: 'hidden',
    }}>

      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: 220, flex: '0 0 220px',
        background: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', height: '100%',
      }}>
        {/* Header — scapia VAULT on one row */}
        <div
          onClick={() => navigate('/')}
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
              textTransform: 'uppercase', lineHeight: 1,
            }}>VAULT</span>
          </div>
        </div>

        <div className="no-scrollbar" style={{ padding: '10px 0', flex: 1, overflowY: 'auto' }}>
          {TREE.map((node) => {
            const travelHasActiveChild = activeNode.startsWith('travel.')
            if (!node.expandable) {
              return (
                <TreeRow
                  key={node.id} label={node.label}
                  active={activeNode === node.id}
                  variant="l1"
                  onClick={() => { setActiveNode(node.id); setActiveTab('all') }}
                />
              )
            }
            // Travel — expandable parent
            return (
              <React.Fragment key={node.id}>
                <TreeRow
                  label={node.label}
                  active={travelHasActiveChild}
                  hasChevron expanded={travelOpen}
                  variant="l1"
                  onToggleExpand={() => setTravelOpen((v) => !v)}
                  onClick={() => {
                    setTravelOpen(true)
                    setActiveNode('travel.all')
                    setActiveTab('all')
                  }}
                />
                {travelOpen && node.children.map((child) => (
                  <TreeRow
                    key={child.id} label={child.label}
                    active={activeNode === child.id}
                    indent={18} variant="l2"
                    onClick={() => { setActiveNode(child.id); setActiveTab('all') }}
                  />
                ))}
              </React.Fragment>
            )
          })}
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────────────── */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        height: '100%', background: BRAND.bg, overflow: 'hidden', minWidth: 0,
      }}>
        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px 32px 16px' }}>
          <h1 style={{
            margin: 0, fontFamily: BRAND.font, fontWeight: 600, fontSize: 22,
            letterSpacing: '-0.015em', color: BRAND.dark, flex: 1,
          }}>{nodeTitle(activeNode)}</h1>

          <div style={{
            position: 'relative', display: 'flex', alignItems: 'center',
            background: BRAND.white, border: `1px solid ${BRAND.border}`,
            padding: '6px 12px 6px 32px', width: 240, borderRadius: 8,
          }}>
            <span style={{ position: 'absolute', left: 11, color: BRAND.muted, display: 'inline-flex' }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square">
                <circle cx="7" cy="7" r="4.5" />
                <line x1="10.5" y1="10.5" x2="14" y2="14" />
              </svg>
            </span>
            <input
              type="text" value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter…"
              style={{ all: 'unset', flex: 1, fontFamily: BRAND.font, fontSize: 13, color: BRAND.dark }}
            />
          </div>
        </div>

        {/* Type tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 32px 16px', flexWrap: 'wrap' }}>
          {TYPE_TABS.map((tab) => (
            <TypeTab
              key={tab.id} label={tab.label}
              count={tabCounts[tab.id] || 0}
              active={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
            />
          ))}
        </div>

        {/* Card grid */}
        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '4px 32px 32px' }}>
          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {[1, 2, 3, 4, 5, 6].map((i) => <SkeletonCard key={i} />)}
            </div>
          ) : error ? (
            <div style={{ padding: '64px 16px', textAlign: 'center', fontFamily: BRAND.font, fontSize: 14, color: '#DC2626' }}>
              Failed to load wiki: {error}
            </div>
          ) : visible.length === 0 ? (
            <div style={{ padding: '64px 16px', textAlign: 'center', fontFamily: BRAND.font, fontSize: 14, color: BRAND.muted }}>
              {pages.length === 0
                ? 'No pages ingested yet. Start by submitting a source.'
                : 'No pages match the current filter.'}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              {visible.map((p) => (
                <PageCard
                  key={p.id} page={p}
                  isOpened={openedPages.has(p.path)}
                  onClick={() => { markPageOpened(p.path); setSelectedPath(p.path) }}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {selectedPath && (
        <WikiPagePanel
          path={selectedPath}
          onClose={() => setSelectedPath(null)}
        />
      )}
    </div>
  )
}
