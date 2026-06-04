import React, { useState, useEffect } from 'react'
import { fetchPages } from '../api.js'
import WikiPagePanel from '../components/WikiPagePanel.jsx'

// ── Perspective colours ──────────────────────────────────────────
const PERSP = {
  Product:     { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
  Engineering: { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
  Commercial:  { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' },
}

function PBadge({ label }) {
  const s = PERSP[label] || { bg: '#F3F4F6', text: '#666', border: '#E8E8E8' }
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ backgroundColor: s.bg, color: s.text, border: `1px solid ${s.border}` }}>
      {label}
    </span>
  )
}

// ── Inline SVG illustrations (line-art, orange accent) ───────────
const IllustrationEntity = () => (
  <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <rect x="20" y="28" width="80" height="52" rx="4" stroke="#ce3e00" strokeWidth="2.5"/>
    <rect x="32" y="40" width="14" height="12" rx="2" fill="#FFF3EC" stroke="#ce3e00" strokeWidth="1.5"/>
    <rect x="53" y="40" width="14" height="12" rx="2" fill="#FFF3EC" stroke="#ce3e00" strokeWidth="1.5"/>
    <rect x="74" y="40" width="14" height="12" rx="2" fill="#FFF3EC" stroke="#ce3e00" strokeWidth="1.5"/>
    <rect x="46" y="60" width="28" height="20" rx="2" fill="#FFF3EC" stroke="#ce3e00" strokeWidth="1.5"/>
    <rect x="30" y="20" width="60" height="12" rx="3" fill="#ce3e00" opacity="0.15" stroke="#ce3e00" strokeWidth="1.5"/>
    <circle cx="60" cy="26" r="3" fill="#ce3e00"/>
  </svg>
)

const IllustrationRegulatory = () => (
  <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <path d="M60 15 L85 28 L85 52 C85 65 73 74 60 78 C47 74 35 65 35 52 L35 28 Z" stroke="#ce3e00" strokeWidth="2.5" fill="#FFF3EC"/>
    <path d="M49 47 L56 54 L71 39" stroke="#ce3e00" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="60" cy="46" r="14" stroke="#ce3e00" strokeWidth="1.5" strokeDasharray="3 2" fill="none"/>
  </svg>
)

const IllustrationEvent = () => (
  <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <rect x="25" y="28" width="70" height="54" rx="6" stroke="#ce3e00" strokeWidth="2.5" fill="#FFF3EC"/>
    <line x1="25" y1="42" x2="95" y2="42" stroke="#ce3e00" strokeWidth="1.5"/>
    <rect x="37" y="22" width="8" height="14" rx="3" fill="white" stroke="#ce3e00" strokeWidth="2"/>
    <rect x="75" y="22" width="8" height="14" rx="3" fill="white" stroke="#ce3e00" strokeWidth="2"/>
    <circle cx="46" cy="56" r="4" fill="#ce3e00"/>
    <circle cx="62" cy="56" r="4" fill="#ce3e00" opacity="0.4"/>
    <circle cx="78" cy="56" r="4" fill="#ce3e00" opacity="0.2"/>
    <circle cx="46" cy="68" r="4" fill="#ce3e00" opacity="0.2"/>
    <circle cx="62" cy="68" r="4" fill="#ce3e00"/>
  </svg>
)

const IllustrationSynthesis = () => (
  <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="42" cy="38" r="16" stroke="#ce3e00" strokeWidth="2.5" fill="#FFF3EC"/>
    <circle cx="78" cy="38" r="16" stroke="#ce3e00" strokeWidth="2.5" fill="#FFF3EC"/>
    <path d="M55 28 C59 33 61 33 65 28" stroke="#ce3e00" strokeWidth="2" fill="none"/>
    <path d="M55 48 C59 43 61 43 65 48" stroke="#ce3e00" strokeWidth="2" fill="none"/>
    <rect x="44" y="60" width="32" height="16" rx="4" fill="#ce3e00" opacity="0.15" stroke="#ce3e00" strokeWidth="1.5"/>
    <line x1="52" y1="68" x2="68" y2="68" stroke="#ce3e00" strokeWidth="2" strokeLinecap="round"/>
  </svg>
)

const IllustrationLens = ({ label }) => {
  const icons = {
    Commercial:  { emoji: '💰', color: '#FFF7ED', stroke: '#EA580C' },
    Engineering: { emoji: '⚙️', color: '#F5F3FF', stroke: '#7C3AED' },
    Product:     { emoji: '✦',  color: '#EFF6FF', stroke: '#2563EB' },
  }
  const c = icons[label] || { emoji: '◈', color: '#F3F4F6', stroke: '#666' }
  return (
    <svg viewBox="0 0 120 90" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
      <circle cx="60" cy="42" r="28" fill={c.color} stroke={c.stroke} strokeWidth="2"/>
      <circle cx="60" cy="42" r="18" fill="white" stroke={c.stroke} strokeWidth="1.5" strokeDasharray="3 2"/>
      <circle cx="60" cy="42" r="6" fill={c.stroke}/>
      <line x1="60" y1="14" x2="60" y2="22" stroke={c.stroke} strokeWidth="2" strokeLinecap="round"/>
      <line x1="60" y1="62" x2="60" y2="70" stroke={c.stroke} strokeWidth="2" strokeLinecap="round"/>
      <line x1="32" y1="42" x2="40" y2="42" stroke={c.stroke} strokeWidth="2" strokeLinecap="round"/>
      <line x1="80" y1="42" x2="88" y2="42" stroke={c.stroke} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  )
}

// ── Colour-coded entity avatar ───────────────────────────────────
const ENTITY_COLORS = [
  '#ce3e00','#2563EB','#7C3AED','#059669','#0284C7','#DC2626',
]
function entityColor(name = '') {
  const idx = name.charCodeAt(0) % ENTITY_COLORS.length
  return ENTITY_COLORS[idx]
}

// ── Signal config — Calibre's strategic lens ─────────────────────
// threat     = competitor executing well, direct competitive pressure on Calibre
// opportunity = competitor weakening, space opening for Calibre
// watch       = unclear direction, no immediate action needed
const SIGNAL = {
  threat:      { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Threat'      },
  opportunity: { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: 'Opportunity' },
  watch:       { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'Watch'       },
}

// ── Parse pipe-delimited vitals from frontmatter array ───────────
// Format per item: "value|label|note" (note optional)
function parseVitals(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(v => {
    const parts = String(v).split('|')
    return { value: parts[0] || '', label: parts[1] || '', note: parts[2] || '' }
  }).filter(v => v.value)
}

// ── Tab definitions ───────────────────────────────────────────────
const TABS = [
  { key: 'entities',    label: 'Entities',           desc: 'Competitor profiles'     },
  { key: 'regulatory',  label: 'Regulatory',         desc: 'Policies & compliance'   },
  { key: 'events',      label: 'Events',             desc: 'Market moments'          },
  { key: 'lenses',      label: 'Lenses',             desc: 'Navigate by perspective' },
]

const LENS_DEFS = [
  {
    key: 'Commercial',
    title: 'Commercial',
    desc: 'Pricing, monetisation, market positioning, user growth signals across all competitors.',
  },
  {
    key: 'Engineering',
    title: 'Engineering',
    desc: 'Technical architecture, ML models, infrastructure choices and engineering bets.',
  },
  {
    key: 'Product',
    title: 'Product',
    desc: 'Features, UX direction, roadmap signals and user experience observations.',
  },
]

// ── Card components ──────────────────────────────────────────────
function EntityCard({ item, onClick }) {
  const name     = item.entity || item.slug || 'Unknown'
  const persp    = item.perspectives_populated || []
  const color    = entityColor(name)
  const initials = name.slice(0, 2).toUpperCase()
  const sig      = SIGNAL[(item.signal || '').toLowerCase()] || null
  const headline = item.headline || null
  const vitals   = parseVitals(item.vitals)
  const srcCount = parseInt(item.sources_count || item.source_count) || 0

  // Border: left uses signal colour always; other sides toggle on hover
  const sigColor    = sig ? sig.color : '#ce3e00'
  const defaultSide = '1.5px solid #E8E8E8'

  return (
    <button
      onClick={() => onClick(`entities/${item.slug}`)}
      className="text-left rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1 w-full"
      style={{
        backgroundColor: '#FFFFFF',
        borderTop: defaultSide, borderRight: defaultSide, borderBottom: defaultSide,
        borderLeft: `4px solid ${sigColor}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
        e.currentTarget.style.borderTopColor = sigColor
        e.currentTarget.style.borderRightColor = sigColor
        e.currentTarget.style.borderBottomColor = sigColor
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
        e.currentTarget.style.borderTopColor = '#E8E8E8'
        e.currentTarget.style.borderRightColor = '#E8E8E8'
        e.currentTarget.style.borderBottomColor = '#E8E8E8'
      }}
    >
      <div className="px-4 pt-4 pb-4">

        {/* ── Name + signal badge inline ── */}
        <div className="flex items-start justify-between gap-2 mb-1.5">
          <div className="font-bold" style={{ fontSize: '24px', color: '#111111', letterSpacing: '-0.6px', lineHeight: 1.1 }}>
            {name}
          </div>
          {sig && (
            <span className="flex items-center gap-1 flex-shrink-0"
              style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase',
                       color: sig.color, backgroundColor: sig.bg, border: `1px solid ${sig.border}`,
                       padding: '3px 8px', borderRadius: '100px', marginTop: '5px' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: sig.color, display: 'inline-block', flexShrink: 0 }} />
              {sig.label}
            </span>
          )}
        </div>

        {/* ── Headline (italic, muted — supporting context, not hero) ── */}
        {headline && (
          <div className="mb-3" style={{ fontSize: '11.5px', fontStyle: 'italic', color: '#AAAAAA', lineHeight: 1.5 }}>
            {headline}
          </div>
        )}

        {/* ── Vitals chips — the numbers that tell the story ── */}
        {vitals.length > 0 && (
          <div className="flex gap-2 mb-3">
            {vitals.map((v, i) => (
              <div key={i} className="flex-1 flex flex-col"
                style={{ backgroundColor: '#111111', padding: '11px 12px', minWidth: 0, borderRadius: 0 }}>
                <div className="font-extrabold text-white"
                  style={{ fontSize: '18px', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                  {v.value}
                </div>
                {v.note && (
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#888888', lineHeight: 1.3, marginTop: '3px' }}>
                    {v.note}
                  </div>
                )}
                <div style={{ fontSize: '9px', fontWeight: 700, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px', lineHeight: 1.3 }}>
                  {v.label}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Footer: perspective pills + sources ── */}
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5 flex-wrap">
            {persp.map(p => <PBadge key={p} label={p.charAt(0).toUpperCase() + p.slice(1)} />)}
          </div>
          <span style={{ fontSize: '10px', color: '#AAAAAA', flexShrink: 0, marginLeft: '8px' }}>
            {srcCount} {srcCount === 1 ? 'source' : 'sources'}
          </span>
        </div>

      </div>
    </button>
  )
}

function RegulatoryCard({ item, onClick }) {
  const name   = item.regulation || item.slug || 'Unknown'
  const status = item.posture || item.compliance_status || 'Active'
  const effDate = item.effective_date || '—'

  const STATUS_CFG = {
    Active:         { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
    Confirmed:      { color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0' },
    'Under Review': { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
    Escalated:      { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
    Superseded:     { color: '#6B7280', bg: '#F9FAFB', border: '#E5E7EB' },
    Disputed:       { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
    Unverified:     { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  }
  const sc = STATUS_CFG[status] || STATUS_CFG.Active

  return (
    <button
      onClick={() => onClick(`regulatory/${item.slug}`)}
      className="text-left rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1 w-full"
      style={{
        backgroundColor: '#FFFFFF',
        borderTop: '1.5px solid #E8E8E8', borderRight: '1.5px solid #E8E8E8', borderBottom: '1.5px solid #E8E8E8',
        borderLeft: `4px solid ${sc.color}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
        e.currentTarget.style.borderTopColor = sc.color
        e.currentTarget.style.borderRightColor = sc.color
        e.currentTarget.style.borderBottomColor = sc.color
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
        e.currentTarget.style.borderTopColor = '#E8E8E8'
        e.currentTarget.style.borderRightColor = '#E8E8E8'
        e.currentTarget.style.borderBottomColor = '#E8E8E8'
      }}
    >
      <div className="px-4 pt-4 pb-4">

        {/* ── Top row: type label only ── */}
        <div className="mb-3">
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#BBBBBB', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Regulatory
          </span>
        </div>

        {/* ── Regulation name ── */}
        <div className="font-bold mb-3" style={{ fontSize: '18px', color: '#111111', letterSpacing: '-0.4px', lineHeight: 1.2 }}>
          {name}
        </div>

        {/* ── Chips: effective date + compliance ── */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 flex flex-col" style={{ backgroundColor: '#111111', padding: '11px 12px', minWidth: 0, borderRadius: 0 }}>
            <div className="font-extrabold text-white" style={{ fontSize: '15px', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
              {effDate}
            </div>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>
              Effective date
            </div>
          </div>
          <div className="flex-1 flex flex-col" style={{ backgroundColor: '#111111', padding: '11px 12px', minWidth: 0, borderRadius: 0 }}>
            <div className="font-extrabold" style={{ fontSize: '15px', letterSpacing: '-0.3px', lineHeight: 1.1, color: sc.color }}>
              {status}
            </div>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>
              Compliance
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div style={{ fontSize: '10px', color: '#AAAAAA' }}>
          Updated {item.last_updated || '—'}
        </div>

      </div>
    </button>
  )
}

function EventCard({ item, onClick }) {
  const name       = item.event || item.slug?.replace(/-/g, ' ') || 'Unknown'
  const entitySlug = item.entity || ''
  const entityName = entitySlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  const initials   = entitySlug.slice(0, 2).toUpperCase()
  const color      = entityColor(entitySlug)
  const date       = item.date || item.last_updated || '—'

  return (
    <button
      onClick={() => onClick(`events/${item.slug}`)}
      className="text-left rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1 w-full"
      style={{
        backgroundColor: '#FFFFFF',
        borderTop: '1.5px solid #E8E8E8', borderRight: '1.5px solid #E8E8E8', borderBottom: '1.5px solid #E8E8E8',
        borderLeft: `4px solid ${color}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'
        e.currentTarget.style.borderTopColor = color
        e.currentTarget.style.borderRightColor = color
        e.currentTarget.style.borderBottomColor = color
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'
        e.currentTarget.style.borderTopColor = '#E8E8E8'
        e.currentTarget.style.borderRightColor = '#E8E8E8'
        e.currentTarget.style.borderBottomColor = '#E8E8E8'
      }}
    >
      <div className="px-4 pt-4 pb-4">

        {/* ── Type label ── */}
        <div className="mb-3">
          <span style={{ fontSize: '10px', fontWeight: 700, color: '#BBBBBB', letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Event
          </span>
        </div>

        {/* ── Event name ── */}
        <div className="font-bold mb-3 capitalize" style={{ fontSize: '18px', color: '#111111', letterSpacing: '-0.4px', lineHeight: 1.2 }}>
          {name}
        </div>

        {/* ── Chips: date + entity ── */}
        <div className="flex gap-2 mb-3">
          <div className="flex-1 flex flex-col" style={{ backgroundColor: '#111111', padding: '11px 12px', minWidth: 0, borderRadius: 0 }}>
            <div className="font-extrabold text-white" style={{ fontSize: '15px', letterSpacing: '-0.3px', lineHeight: 1.1 }}>
              {date}
            </div>
            <div style={{ fontSize: '9px', fontWeight: 700, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>
              Date
            </div>
          </div>
          {entitySlug && (
            <div className="flex-1 flex flex-col" style={{ backgroundColor: '#111111', padding: '11px 12px', minWidth: 0, borderRadius: 0 }}>
              <div className="font-extrabold text-white" style={{ fontSize: '15px', letterSpacing: '-0.3px', lineHeight: 1.1, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                {entityName}
              </div>
              <div style={{ fontSize: '9px', fontWeight: 700, color: '#555555', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>
                Entity
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{ fontSize: '10px', color: '#AAAAAA' }}>
          See also: {entityName || 'entity page'}
        </div>

      </div>
    </button>
  )
}

function SynthesisCard({ item, onClick }) {
  const raw = item.title || item.slug || 'Unknown'
  const name = raw.replace(/^["']|["']$/g, '').replace(/-/g, ' ')
  return (
    <button
      onClick={() => onClick(`synthesis/${item.slug}`)}
      className="text-left rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1"
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E8E8', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; e.currentTarget.style.borderColor = '#ce3e00' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = '#E8E8E8' }}
    >
      <div className="flex items-center justify-center" style={{ height: 140, backgroundColor: '#FAFAFA', borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ width: 100, height: 90 }}>
          <IllustrationSynthesis />
        </div>
      </div>
      <div className="px-4 py-3.5">
        <div className="font-bold text-sm leading-snug mb-2 capitalize" style={{ color: '#000000' }}>{name}</div>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: '#999' }}>{item.last_updated || item.date || ''}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE' }}>
            Synthesis
          </span>
        </div>
      </div>
    </button>
  )
}

function LensCard({ lens, entities, onLensClick }) {
  const count = entities.filter(e =>
    (e.perspectives_populated || []).map(p => p.toLowerCase()).includes(lens.key.toLowerCase())
  ).length

  return (
    <button
      onClick={() => onLensClick(lens.key)}
      className="text-left rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-1"
      style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E8E8', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.12)'; e.currentTarget.style.borderColor = '#ce3e00' }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = '#E8E8E8' }}
    >
      <div className="flex items-center justify-center" style={{ height: 140, backgroundColor: '#FAFAFA', borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ width: 100, height: 90 }}>
          <IllustrationLens label={lens.key} />
        </div>
      </div>
      <div className="px-4 py-3.5">
        <div className="font-bold text-base mb-1" style={{ color: '#000000' }}>{lens.title}</div>
        <div className="text-xs mb-2 leading-relaxed" style={{ color: '#888' }}>{lens.desc}</div>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: '#999' }}>{count} {count === 1 ? 'entity' : 'entities'}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ backgroundColor: '#FFF3EC', color: '#ce3e00', border: '1px solid #FDBA74' }}>
            Lens
          </span>
        </div>
      </div>
    </button>
  )
}

// ── Lens filtered view ───────────────────────────────────────────
function LensFilteredView({ lens, entities, onEntityClick, onBack }) {
  const filtered = entities.filter(e =>
    (e.perspectives_populated || []).map(p => p.toLowerCase()).includes(lens.toLowerCase())
  )
  return (
    <div>
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack}
          className="flex items-center gap-1.5 text-sm transition-all hover:opacity-70"
          style={{ color: '#ce3e00' }}>
          ← Back to Lenses
        </button>
        <span style={{ color: '#E8E8E8' }}>|</span>
        <span className="text-sm font-medium" style={{ color: '#111' }}>
          {lens} lens · {filtered.length} {filtered.length === 1 ? 'entity' : 'entities'}
        </span>
      </div>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16" style={{ color: '#AAAAAA' }}>
          <span className="text-3xl mb-2">🔭</span>
          <span className="text-sm">No entities with {lens} data yet</span>
        </div>
      ) : (
        <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {filtered.map((item, idx) => (
            <EntityCard key={idx} item={item} onClick={onEntityClick} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────
export default function WikiBrowserPage() {
  const [pages, setPages] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('entities')
  const [selectedPath, setSelectedPath] = useState(null)
  const [search, setSearch] = useState('')
  const [activeLens, setActiveLens] = useState(null)

  useEffect(() => {
    fetchPages()
      .then(setPages)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const handleTabChange = (key) => {
    setActiveTab(key)
    setSearch('')
    setActiveLens(null)
  }

  const handleLensClick = (lensKey) => setActiveLens(lensKey)
  const handleLensBack = () => setActiveLens(null)

  const entities = pages?.entities || []

  const filterItems = (items, labelFn) =>
    items.filter(item => labelFn(item).toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#f1f6fa' }}>

      {/* ── Header ── */}
      <div className="px-7 pt-6 pb-0 shrink-0" style={{ backgroundColor: '#f1f6fa' }}>
        <div className="flex items-end justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#000000', letterSpacing: '-0.03em' }}>
              Wiki Browser
            </h1>
            <p className="text-sm mt-0.5" style={{ color: '#888' }}>
              {TABS.find(t => t.key === activeTab)?.desc}
            </p>
          </div>
          {/* Search */}
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs" style={{ color: '#AAAAAA' }}>🔍</span>
            <input
              type="text"
              placeholder="Filter…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 pr-3 py-2 text-sm rounded-xl outline-none"
              style={{ backgroundColor: '#FFFFFF', border: '1px solid #E8E8E8', color: '#111', width: 180 }}
            />
          </div>
        </div>

        {/* ── Tab nav ── */}
        <div className="flex gap-1" style={{ borderBottom: '2px solid #E8E8E8' }}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key
            const count = tab.key === 'lenses' ? LENS_DEFS.length : (pages?.[tab.key]?.length ?? null)
            return (
              <button
                key={tab.key}
                onClick={() => handleTabChange(tab.key)}
                className="relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all"
                style={{ color: isActive ? '#000000' : '#888888' }}
              >
                {tab.label}
                {count !== null && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: isActive ? '#ce3e00' : '#F3F4F6',
                      color: isActive ? '#FFFFFF' : '#888',
                    }}>
                    {count}
                  </span>
                )}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                    style={{ backgroundColor: '#ce3e00' }} />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-7 py-6">
        {loading && (
          <div className="flex items-center justify-center h-32 text-sm" style={{ color: '#AAAAAA' }}>
            Loading pages…
          </div>
        )}
        {error && (
          <div className="text-sm p-4 rounded-xl"
            style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
            Error: {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Entities */}
            {activeTab === 'entities' && (() => {
              const items = filterItems(entities, e => e.entity || e.slug || '')
              return items.length === 0
                ? <Empty />
                : <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    {items.map((item, i) => <EntityCard key={i} item={item} onClick={setSelectedPath} />)}
                  </div>
            })()}

            {/* Regulatory */}
            {activeTab === 'regulatory' && (() => {
              const items = filterItems(pages?.regulatory || [], r => r.regulation || r.slug || '')
              return items.length === 0
                ? <Empty />
                : <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    {items.map((item, i) => <RegulatoryCard key={i} item={item} onClick={setSelectedPath} />)}
                  </div>
            })()}

            {/* Events */}
            {activeTab === 'events' && (() => {
              const items = filterItems(pages?.events || [], e => e.event || e.slug || '')
              return items.length === 0
                ? <Empty />
                : <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    {items.map((item, i) => <EventCard key={i} item={item} onClick={setSelectedPath} />)}
                  </div>
            })()}

            {/* Synthesis */}
            {activeTab === 'synthesis' && (() => {
              const items = filterItems(pages?.synthesis || [], s => s.title || s.slug || '')
              return items.length === 0
                ? <Empty />
                : <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                    {items.map((item, i) => <SynthesisCard key={i} item={item} onClick={setSelectedPath} />)}
                  </div>
            })()}

            {/* Lenses */}
            {activeTab === 'lenses' && (
              activeLens
                ? <LensFilteredView lens={activeLens} entities={entities} onEntityClick={setSelectedPath} onBack={handleLensBack} />
                : <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                    {LENS_DEFS.map(lens => (
                      <LensCard key={lens.key} lens={lens} entities={entities} onLensClick={handleLensClick} />
                    ))}
                  </div>
            )}
          </>
        )}
      </div>

      {selectedPath && <WikiPagePanel path={selectedPath} onClose={() => setSelectedPath(null)} />}
    </div>
  )
}

function Empty() {
  return (
    <div className="flex flex-col items-center justify-center h-32" style={{ color: '#AAAAAA' }}>
      <span className="text-2xl mb-2">📭</span>
      <span className="text-sm">No pages found</span>
    </div>
  )
}
