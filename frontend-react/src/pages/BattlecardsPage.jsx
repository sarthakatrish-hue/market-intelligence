import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchPages, fetchPage } from '../api.js'
import {
  parseCompetitorIntel,
  parseRegulatoryIntel,
  parsePartnerIntel,
  parseMarketIntel,
  parseCustomerIntel,
} from '../utils/intelParsers.js'

// ─── Tokens ────────────────────────────────────────────────────────────────
const BRAND = {
  orange: '#ce3e00',
  bg:     '#f1f6fa',
  dark:   '#111111',
  white:  '#FFFFFF',
  border: '#E8E8E8',
  divider:'#F0F0F0',
  muted:  '#888888',
  mutedSoft: '#AAAAAA',
  font:   '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

// Semantic colours: signals + reg-status. Drives card 4px left border + badges.
const SEMANTIC = {
  // competitor signals
  threat:      '#DC2626',
  opportunity: '#16A34A',
  watch:       '#D97706',
  // partner
  partner:     '#2563EB',
  // regulatory status
  active:      '#16A34A',
  underreview: '#D97706',
  escalated:   '#DC2626',
  superseded:  '#9CA3AF',
  // market + customer
  market:      '#0D9488',
  customer:    '#ce3e00',
};

// Body-section accent colours (labels above body subsections).
const ACCENT = {
  green: '#16A34A',
  red:   '#DC2626',
  blue:  '#2563EB',
  amber: '#D97706',
  grey:  '#6B7280',
  teal:  '#0D9488',
  orange: '#ce3e00',
};

// ─── Type registry ─────────────────────────────────────────────────────────
const TYPES = [
  { id: 'competitor', label: 'Competitor'      },
  { id: 'regulatory', label: 'Regulatory'      },
  { id: 'partner',    label: 'Partner'         },
  { id: 'market',     label: 'Market Signal'   },
  { id: 'customer',   label: 'Customer Signal' },
];

// ─── Data helpers ──────────────────────────────────────────────────────────
function parseVitals(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(v => {
    const parts = String(v).split('|')
    return { value: parts[0] || '', label: parts[1] || '', note: parts[2] || '' }
  }).filter(v => v.value)
}

function normalizeDomains(domains = [], travelCats = []) {
  const result = []
  for (const d of domains) {
    if (d === 'travel' && travelCats.length > 0) continue // replaced by travel+cat below
    result.push(d === 'fintech' ? 'Fintech' : d === 'travel' ? 'Travel' : d)
  }
  for (const tc of travelCats) {
    result.push(`Travel · ${tc.charAt(0).toUpperCase() + tc.slice(1)}`)
  }
  return result
}

function normalizeStatus(str = '') {
  return str.toLowerCase().replace(/\s+/g, '')
}

function normalizeCustomerSignal(sentiment = '') {
  const s = (sentiment || '').toLowerCase()
  if (s === 'positive') return 'opportunity'
  if (s === 'negative') return 'threat'
  return 'watch'
}

// ─── Card helpers ───────────────────────────────────────────────────────────
// Resolve a card's accent colour (4px left border).
function cardAccent(card, typeId) {
  if (typeId === 'competitor') return SEMANTIC[card.signal] || SEMANTIC.watch;
  if (typeId === 'regulatory') return SEMANTIC[card.status] || SEMANTIC.active;
  if (typeId === 'partner')    return SEMANTIC.partner;
  if (typeId === 'market')     return SEMANTIC.market;
  if (typeId === 'customer')   return SEMANTIC[card.signal] || SEMANTIC.customer;
  return BRAND.muted;
}

function statusLabel(card, typeId) {
  if (typeId === 'competitor') return card.signal.charAt(0).toUpperCase() + card.signal.slice(1);
  return card.statusLabel || '—';
}

// hex → rgba helper
function rgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const [, r, g, b] = m;
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${a})`;
}

// ─── Small reusable bits ───────────────────────────────────────────────────
function SectionLabel({ color, children }) {
  return (
    <div style={{
      fontFamily: BRAND.font,
      fontSize: 10,
      fontWeight: 700,
      letterSpacing: '0.22em',
      color,
      textTransform: 'uppercase',
      marginBottom: 10,
    }}>{children}</div>
  );
}

function TintBox({ tint, border, children, style }) {
  return (
    <div style={{
      background: tint,
      border: border ? `1px solid ${border}` : 'none',
      padding: '14px 16px',
      fontFamily: BRAND.font,
      fontSize: 13.5,
      lineHeight: 1.55,
      color: '#222',
      ...style,
    }}>{children}</div>
  );
}

function PointLine({ point, context, action, accent }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontFamily: BRAND.font,
        fontWeight: 600,
        fontSize: 13.5,
        color: BRAND.dark,
        letterSpacing: '-0.005em',
      }}>{point}</div>
      {context && <div style={{
        fontFamily: BRAND.font,
        fontSize: 12.5,
        color: '#444',
        lineHeight: 1.5,
        marginTop: 2,
      }}>{context}</div>}
      {action && <div style={{
        fontFamily: BRAND.font,
        fontSize: 11.5,
        color: accent,
        marginTop: 6,
        fontStyle: 'italic',
        lineHeight: 1.4,
      }}>→ {action}</div>}
    </div>
  );
}

// ─── Card shell (header + body slot + implication + recent) ────────────────
function CardShell({ card, typeId, children }) {
  const accent = cardAccent(card, typeId);
  return (
    <div style={{
      background: BRAND.white,
      border: `1px solid ${BRAND.border}`,
      borderLeft: `4px solid ${accent}`,
      fontFamily: BRAND.font,
      color: BRAND.dark,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{ padding: '22px 26px 18px', borderBottom: `1px solid ${BRAND.divider}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <h1 style={{
                margin: 0,
                fontSize: (() => {
                  const len = (card.name || '').length;
                  if (len > 40) return '1.15rem';
                  if (len > 25) return '1.6rem';
                  return '2rem';
                })(),
                fontWeight: 700,
                letterSpacing: '-0.02em',
                lineHeight: 1.15,
                color: BRAND.dark,
              }}>{card.name}</h1>
              <span style={{
                fontFamily: BRAND.font,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.18em',
                color: accent,
                background: rgba(accent, 0.10),
                border: `1px solid ${rgba(accent, 0.35)}`,
                padding: '4px 10px',
                textTransform: 'uppercase',
              }}>{statusLabel(card, typeId)}</span>
            </div>
            <div style={{
              marginTop: 8,
              fontSize: 12.5,
              color: BRAND.muted,
            }}>
              <span style={{ fontWeight: 500, color: '#444' }}>Informs:</span>{' '}
              <span>{card.informs}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(card.domain || []).map((d) => (
                <span key={d} style={{
                  fontSize: 10,
                  fontWeight: 500,
                  letterSpacing: '0.04em',
                  color: BRAND.muted,
                  background: '#F5F5F5',
                  border: `1px solid ${BRAND.border}`,
                  padding: '3px 8px',
                }}>{d}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {(card.metrics || []).map((m) => (
                <div key={m.label} style={{ textAlign: 'right' }}>
                  <div style={{
                    fontSize: 9,
                    fontWeight: 600,
                    letterSpacing: '0.18em',
                    color: BRAND.mutedSoft,
                    textTransform: 'uppercase',
                  }}>{m.label}</div>
                  <div style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: BRAND.dark,
                    letterSpacing: '-0.01em',
                    marginTop: 2,
                  }}>{m.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Body slot */}
      <div style={{ padding: '22px 26px' }}>{children}</div>

      {/* Scapia Implication — always present */}
      {(card.implication || []).length > 0 && (
        <div style={{
          background: BRAND.dark,
          color: '#EDEDED',
          padding: '22px 26px',
        }}>
          <SectionLabel color={BRAND.orange}>Scapia Implication</SectionLabel>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {card.implication.map((t, i) => (
              <li key={i} style={{ display: 'flex', gap: 12, fontSize: 13.5, lineHeight: 1.55 }}>
                <span style={{ color: BRAND.orange, flex: '0 0 auto', fontWeight: 600 }}>→</span>
                <span>{t}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Recent moves footer (competitors mostly) */}
      {(card.recent || []).length > 0 && (
        <div style={{
          padding: '18px 26px',
          borderTop: `1px solid ${BRAND.divider}`,
          background: '#FAFAFA',
        }}>
          <SectionLabel color={BRAND.muted}>Recent moves</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {card.recent.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, fontSize: 12.5, color: '#333' }}>
                <span style={{ flex: '0 0 86px', color: BRAND.muted, fontVariantNumeric: 'tabular-nums' }}>{r.date}</span>
                <span style={{ flex: 1 }}>{r.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Body: Competitor ──────────────────────────────────────────────────────
function CompetitorBody({ card }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <div style={{ background: '#F8FDF9', border: `1px solid ${rgba(ACCENT.green, 0.25)}`, padding: '18px 18px 4px' }}>
        <SectionLabel color={ACCENT.green}>Where Scapia wins</SectionLabel>
        {(card.wins || []).map((w, i) => (
          <PointLine key={i} point={w.point} context={w.context} action={w.action} accent={ACCENT.green} />
        ))}
      </div>
      <div style={{ background: '#FFF8F8', border: `1px solid ${rgba(ACCENT.red, 0.25)}`, padding: '18px 18px 4px' }}>
        <SectionLabel color={ACCENT.red}>Where they're ahead</SectionLabel>
        {(card.ahead || []).map((w, i) => (
          <PointLine key={i} point={w.point} context={w.context} action={w.action} accent={ACCENT.red} />
        ))}
      </div>
    </div>
  );
}

// ─── Body: Regulatory ──────────────────────────────────────────────────────
function RegulatoryBody({ card }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <SectionLabel color={ACCENT.blue}>What it requires</SectionLabel>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(card.requires || []).map((r, i) => (
            <li key={i} style={{ display: 'flex', gap: 12, fontSize: 13.5, lineHeight: 1.55 }}>
              <span style={{ color: ACCENT.blue, fontWeight: 700, flex: '0 0 auto' }}>·</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <SectionLabel color={ACCENT.grey}>Scapia's current posture</SectionLabel>
        <TintBox tint="#F8F8F8" border={BRAND.divider}>{card.posture}</TintBox>
      </div>

      <div>
        <SectionLabel color={ACCENT.amber}>Open questions</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(card.questions || []).map((q, i) => (
            <TintBox key={i} tint="#FFFBEB" border={rgba(ACCENT.amber, 0.25)}>
              <span style={{ color: ACCENT.amber, fontWeight: 700, marginRight: 8 }}>?</span>
              {q}
            </TintBox>
          ))}
        </div>
      </div>

      <div>
        <SectionLabel color={ACCENT.red}>Sign-off required</SectionLabel>
        <TintBox tint="#FFF8F8" border={rgba(ACCENT.red, 0.25)}>{card.signoff}</TintBox>
      </div>
    </div>
  );
}

// ─── Body: Partner ─────────────────────────────────────────────────────────
function PartnerBody({ card }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ background: '#F8FDF9', border: `1px solid ${rgba(ACCENT.green, 0.25)}`, padding: '18px 18px 4px' }}>
          <SectionLabel color={ACCENT.green}>What Scapia gets</SectionLabel>
          {(card.weGet || []).map((w, i) => (
            <PointLine key={i} point={w.point} context={w.context} accent={ACCENT.green} />
          ))}
        </div>
        <div style={{ background: '#F5F8FE', border: `1px solid ${rgba(ACCENT.blue, 0.25)}`, padding: '18px 18px 4px' }}>
          <SectionLabel color={ACCENT.blue}>What partner gets</SectionLabel>
          {(card.theyGet || []).map((w, i) => (
            <PointLine key={i} point={w.point} context={w.context} accent={ACCENT.blue} />
          ))}
        </div>
      </div>

      <div>
        <SectionLabel color={ACCENT.amber}>Current risks</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(card.risks || []).map((r, i) => (
            <TintBox key={i} tint="#FFFBEB" border={rgba(ACCENT.amber, 0.25)}>
              <span style={{ fontWeight: 600 }}>{r.point}</span>
              {r.context && <> — <span style={{ color: '#555' }}>{r.context}</span></>}
            </TintBox>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Body: Market Signal ───────────────────────────────────────────────────
function MarketBody({ card }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div>
        <SectionLabel color={ACCENT.teal}>What's shifting</SectionLabel>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: '#222' }}>{card.shift}</div>
      </div>
      <div>
        <SectionLabel color={ACCENT.grey}>Why it matters for Scapia</SectionLabel>
        <TintBox tint="#F8F8F8" border={BRAND.divider}>{card.matters}</TintBox>
      </div>
    </div>
  );
}

// ─── Body: Customer Signal ─────────────────────────────────────────────────
function CustomerBody({ card }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Source + Sentiment meta row */}
      {(card.source || card.sentiment) && (
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
          {card.source && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: BRAND.mutedSoft, textTransform: 'uppercase', marginBottom: 3 }}>Source</div>
              <div style={{ fontSize: 12.5, color: '#444', lineHeight: 1.4 }}>{card.source}</div>
            </div>
          )}
          {card.sentiment && (
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', color: BRAND.mutedSoft, textTransform: 'uppercase', marginBottom: 3 }}>Sentiment</div>
              <div style={{ fontSize: 12.5, color: '#444', lineHeight: 1.4 }}>{card.sentiment}</div>
            </div>
          )}
        </div>
      )}
      <div>
        <SectionLabel color={ACCENT.grey}>What they're saying</SectionLabel>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(card.saying || []).map((s, i) => {
            const dotColor = SEMANTIC[s.signal] || BRAND.muted;
            return (
              <li key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <span style={{
                  width: 8, height: 8, marginTop: 7, borderRadius: '50%',
                  background: dotColor, flex: '0 0 auto',
                }} />
                <span style={{ fontSize: 13.5, lineHeight: 1.5, color: '#222' }}>{s.point}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <div>
        <SectionLabel color={ACCENT.orange}>Switching signals</SectionLabel>
        <div style={{ fontSize: 14, lineHeight: 1.6, color: '#222' }}>{card.switching}</div>
      </div>
    </div>
  );
}

// ─── Card body dispatcher ──────────────────────────────────────────────────
function CardBody({ card, typeId }) {
  switch (typeId) {
    case 'competitor': return <CompetitorBody card={card} />;
    case 'regulatory': return <RegulatoryBody card={card} />;
    case 'partner':    return <PartnerBody card={card} />;
    case 'market':     return <MarketBody card={card} />;
    case 'customer':   return <CustomerBody card={card} />;
    default: return null;
  }
}

// ─── Loading skeleton ──────────────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div style={{
      background: BRAND.white,
      border: `1px solid ${BRAND.border}`,
      borderLeft: `4px solid ${BRAND.border}`,
    }}>
      <div style={{ padding: '22px 26px 18px', borderBottom: `1px solid ${BRAND.divider}` }}>
        {[55, 35, 70].map((w, i) => (
          <div key={i} style={{
            height: i === 0 ? 32 : 14,
            width: `${w}%`,
            background: '#F3F4F6',
            borderRadius: 4,
            marginBottom: i === 0 ? 16 : 10,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        ))}
      </div>
      <div style={{ padding: '22px 26px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[0, 1].map(col => (
          <div key={col} style={{ background: '#F9F9F9', border: `1px solid ${BRAND.divider}`, padding: '18px' }}>
            {[40, 80, 60, 70, 50].map((w, i) => (
              <div key={i} style={{
                height: 12, width: `${w}%`,
                background: '#EBEBEB', borderRadius: 4, marginBottom: 10,
                animation: 'pulse 1.5s ease-in-out infinite',
              }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Left sidebar: type filter ─────────────────────────────────────────────
function TypeFilterItem({ label, count, active, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        width: '100%',
        padding: '9px 12px',
        background: active ? BRAND.orange : hover ? 'rgba(206,62,0,0.20)' : 'transparent',
        color: active ? BRAND.white : hover ? BRAND.white : 'rgba(255,255,255,0.58)',
        fontFamily: BRAND.font,
        fontSize: '0.92rem',
        fontWeight: active ? 500 : 400,
        cursor: 'pointer',
        transition: 'background .12s, color .12s',
      }}
    >
      {active && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: BRAND.white, opacity: 0.5 }} />}
      <span>{label}</span>
      <span style={{
        fontSize: 10.5,
        fontWeight: 500,
        padding: '1px 7px',
        background: active ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.10)',
        color: active ? BRAND.white : 'rgba(255,255,255,0.45)',
        borderRadius: 999,
        minWidth: 18,
        textAlign: 'center',
      }}>{count}</span>
    </button>
  );
}

// ─── Right sidebar: vertical pill (entity selector item) ───────────────────
function VerticalPill({ name, signalLabel, signalColor, active, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset',
        boxSizing: 'border-box',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        width: '100%',
        padding: '10px 12px 10px 14px',
        background: active ? BRAND.dark : hover ? '#F3F4F6' : BRAND.white,
        color: active ? BRAND.white : BRAND.dark,
        cursor: 'pointer',
        borderBottom: `1px solid ${BRAND.divider}`,
        transition: 'background .12s, color .12s',
      }}
    >
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: signalColor }} />
      <div style={{
        fontFamily: BRAND.font,
        fontWeight: 600,
        fontSize: '0.75rem',
        letterSpacing: '-0.005em',
        lineHeight: 1.2,
      }}>{name}</div>
      <div style={{
        fontFamily: BRAND.font,
        fontSize: '0.55rem',
        fontWeight: 600,
        letterSpacing: '0.18em',
        color: active ? BRAND.mutedSoft : signalColor,
        textTransform: 'uppercase',
      }}>{signalLabel}</div>
    </button>
  );
}

// Group entities by signal/status for the right sidebar layout.
function groupEntities(entities, typeId) {
  const groupKey = (e) => {
    if (typeId === 'competitor') return e.signal;
    if (typeId === 'regulatory') return e.status;
    if (typeId === 'customer')   return e.signal;
    return typeId;
  };
  const map = new Map();
  for (const e of entities) {
    const k = groupKey(e);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(e);
  }
  return Array.from(map.entries()).map(([k, items]) => ({ key: k, items }));
}

// ═══════════════════════════════════════════════════════════════════════════
// BattlecardsPage
// ═══════════════════════════════════════════════════════════════════════════
export default function BattlecardsPage({ initialType = 'competitor', initialRightOpen = true } = {}) {
  const navigate                        = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  // ── Initialise from URL params so refresh restores position ─────────────
  const [typeId, setTypeId]       = useState(() => searchParams.get('type') || initialType);
  const [selected, setSelected]   = useState(() => {
    const t = searchParams.get('type') || initialType
    const id = searchParams.get('id')
    return id ? { [t]: id } : {}
  });
  const [rightOpen, setRightOpen] = useState(initialRightOpen);

  // ── Sync state → URL ─────────────────────────────────────────────────────
  useEffect(() => {
    const p = {}
    if (typeId) p.type = typeId
    const activeId = selected[typeId]
    if (activeId) p.id = activeId
    setSearchParams(p, { replace: true })
  }, [typeId, selected]) // eslint-disable-line react-hooks/exhaustive-deps
  const [tooltip, setTooltip]     = useState(null); // { x, y, text } | null
  const [allCards, setAllCards]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);

  // ── Load all cards from wiki ──────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const pages = await fetchPages()

        const [competitors, regulatory, partners, marketSignals, customerSignals] = await Promise.all([

          // ── Competitor cards ──────────────────────────────────────
          Promise.all((pages.entities || []).map(e =>
            fetchPage(`entities/${e.slug}`).then(d => {
              const intel = parseCompetitorIntel(d.content)
              if (!intel) return null
              return {
                id: e.slug,
                type: 'competitor',
                name: d.meta.entity || e.slug,
                signal: d.meta.signal || 'watch',
                domain: normalizeDomains(d.meta.domains, d.meta.travel_categories),
                informs: intel.decision || '',
                metrics: parseVitals(d.meta.vitals || [])
                  .map(v => ({ label: v.label, value: v.value }))
                  .filter(v => v.label),
                wins:       intel.whereWeWin,
                ahead:      intel.whereTheyWin,
                implication: intel.implication,
                recent:     intel.recentMoves.map(m => ({ date: m.date, text: m.event })),
              }
            }).catch(() => null)
          )),

          // ── Regulatory cards ──────────────────────────────────────
          Promise.all((pages.regulatory || []).map(r =>
            fetchPage(`regulatory/${r.slug}`).then(d => {
              const intel = parseRegulatoryIntel(d.content)
              if (!intel) return null
              const normSt = normalizeStatus(intel.status)
              return {
                id: r.slug,
                type: 'regulatory',
                name: d.meta.regulation || r.slug,
                signal: normSt || 'active',
                status: normSt || 'active',
                statusLabel: intel.status || 'Active',
                domain: normalizeDomains(d.meta.domains, d.meta.travel_categories),
                informs: 'Compliance',
                metrics: [
                  d.meta.effective_date    ? { label: 'Effective', value: d.meta.effective_date }       : null,
                  (d.meta.posture || d.meta.compliance_status) ? { label: 'Posture', value: d.meta.posture || d.meta.compliance_status } : null,
                ].filter(Boolean),
                requires:    intel.whatItRequires,
                posture:     intel.currentPosture,
                questions:   intel.openQuestions,
                signoff:     intel.signOffRequired,
                implication: intel.implication,
              }
            }).catch(() => null)
          )),

          // ── Partner cards ─────────────────────────────────────────
          Promise.all((pages.partners || []).map(p =>
            fetchPage(`partners/${p.slug}`).then(d => {
              const intel = parsePartnerIntel(d.content)
              if (!intel) return null
              return {
                id: p.slug,
                type: 'partner',
                name: d.meta.partner || p.slug,
                signal: 'partner',
                statusLabel: intel.status || 'Active',
                domain: normalizeDomains(d.meta.domains, d.meta.travel_categories),
                informs: intel.relationship || 'Partnership',
                metrics: [],
                weGet:      intel.whatScapiaGets  ? [{ point: intel.whatScapiaGets,  context: '' }] : [],
                theyGet:    intel.whatPartnerGets ? [{ point: intel.whatPartnerGets, context: '' }] : [],
                risks:      intel.currentRisks.map(r => ({ point: r, context: '' })),
                implication: intel.implication,
              }
            }).catch(() => null)
          )),

          // ── Market Signal cards ───────────────────────────────────
          Promise.all((pages['market-signals'] || []).map(m =>
            fetchPage(`market-signals/${m.slug}`).then(d => {
              const intel = parseMarketIntel(d.content)
              if (!intel) return null
              return {
                id: m.slug,
                type: 'market',
                name: d.meta.title || m.slug,
                signal: 'market',
                statusLabel: intel.direction || d.meta.direction || 'Signal',
                domain: normalizeDomains(d.meta.domains, d.meta.travel_categories),
                informs: [intel.direction, intel.domain].filter(Boolean).join(' · ') || 'Market signal',
                metrics: [
                  intel.direction ? { label: 'Direction', value: intel.direction } : null,
                  intel.domain    ? { label: 'Domain',    value: intel.domain }    : null,
                ].filter(Boolean),
                shift:       intel.whatIsShifting,
                matters:     intel.whyItMatters,
                implication: intel.implication,
              }
            }).catch(() => null)
          )),

          // ── Customer Signal cards ─────────────────────────────────
          Promise.all((pages.events || []).map(e =>
            fetchPage(`events/${e.slug}`).then(d => {
              if (!Array.isArray(d.meta.page_types) || !d.meta.page_types.includes('customer')) return null
              const intel = parseCustomerIntel(d.content)
              if (!intel) return null
              const sig = normalizeCustomerSignal(intel.sentiment)
              return {
                id: e.slug,
                type: 'customer',
                name: d.meta.event || e.slug,
                signal: sig,
                // Badge shows opportunity/threat/watch — not the raw sentiment string
                statusLabel: sig === 'opportunity' ? 'Opportunity' : sig === 'threat' ? 'Threat' : 'Watch',
                domain: normalizeDomains(d.meta.domains, d.meta.travel_categories),
                // Short label only — source/sentiment go into the body (CustomerBody)
                informs: 'Voice of Customer',
                metrics: [],
                source:    intel.source    || '',
                sentiment: intel.sentiment || '',
                saying:      intel.whatTheyAreSaying.map(s => ({ point: s, signal: 'watch' })),
                switching:   intel.switchingSignals,
                implication: intel.acquisitionImplication,
              }
            }).catch(() => null)
          )),
        ])

        const all = [...competitors, ...regulatory, ...partners, ...marketSignals, ...customerSignals].filter(Boolean)
        setAllCards(all)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Derived state ─────────────────────────────────────────────────
  const entities     = allCards.filter(c => c.type === typeId)
  const activeEntityId = selected[typeId] || entities[0]?.id
  const card         = entities.find(e => e.id === activeEntityId) || entities[0]

  function chooseEntity(id) {
    setSelected(s => ({ ...s, [typeId]: id }))
  }

  // ── Tooltip for toggle button ─────────────────────────────────────
  const toggleRef = useRef(null);
  function onToggleEnter() {
    const el = toggleRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setTooltip({ x: r.left - 8, y: r.top + r.height / 2, text: rightOpen ? 'Hide list' : 'Show list' });
  }
  function onToggleLeave() { setTooltip(null); }

  // ── Main card area content ────────────────────────────────────────
  function MainContent() {
    if (loading) return <CardSkeleton />
    if (error)   return (
      <div style={{ padding: 32, fontFamily: BRAND.font, fontSize: 13.5, color: BRAND.muted }}>
        Failed to load cards: {error}
      </div>
    )
    if (!card)   return (
      <div style={{
        padding: 32, fontFamily: BRAND.font, fontSize: 13.5, color: BRAND.muted,
        background: BRAND.white, border: `1px solid ${BRAND.border}`,
      }}>
        No {TYPES.find(t => t.id === typeId)?.label.toLowerCase()} cards yet — ingest a source to populate.
      </div>
    )
    return (
      <CardShell card={card} typeId={typeId}>
        <CardBody card={card} typeId={typeId} />
      </CardShell>
    )
  }

  return (
    <div style={{
      position: 'relative',
      display: 'flex',
      height: '100%',
      width: '100%',
      fontFamily: BRAND.font,
      color: BRAND.dark,
      background: BRAND.bg,
      overflow: 'hidden',
    }}>
      {/* ── Left sidebar: type filter ───────────────────────────────────── */}
      <aside style={{
        width: 220,
        flex: '0 0 220px',
        background: '#0a0a0a',
        borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}>
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
              whiteSpace: 'nowrap',
            }}>Intel Cards</span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', padding: '10px 0' }}>
          {TYPES.map((t) => (
            <TypeFilterItem
              key={t.id}
              label={t.label}
              count={allCards.filter(c => c.type === t.id).length}
              active={typeId === t.id}
              onClick={() => setTypeId(t.id)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main: card ──────────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        background: BRAND.bg,
        overflow: 'hidden',
      }}>
        {/* Top bar — mirrors Vault's header row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px 32px 16px', flexShrink: 0 }}>
          <h1 style={{
            margin: 0,
            fontFamily: BRAND.font,
            fontWeight: 600,
            fontSize: 22,
            letterSpacing: '-0.015em',
            color: BRAND.dark,
            flex: 1,
          }}>
            {TYPES.find(t => t.id === typeId)?.label}
          </h1>
          <span style={{
            fontFamily: BRAND.font,
            fontSize: 12,
            fontWeight: 500,
            color: BRAND.muted,
          }}>
            {entities.length} {entities.length === 1 ? 'card' : 'cards'}
          </span>
        </div>

        {/* Scrollable card area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 28px 28px' }}>
          <MainContent />
        </div>
      </main>

      {/* ── Right sidebar: entity selector ──────────────────────────────── */}
      <aside style={{
        position: 'relative',
        width: rightOpen ? 148 : 42,
        flex: rightOpen ? '0 0 148px' : '0 0 42px',
        background: BRAND.white,
        borderLeft: `1px solid ${BRAND.border}`,
        transition: 'width .2s, flex-basis .2s',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Toggle button — absolute */}
        <button
          ref={toggleRef}
          onClick={() => setRightOpen(v => !v)}
          onMouseEnter={onToggleEnter}
          onMouseLeave={onToggleLeave}
          aria-label={rightOpen ? 'Hide list' : 'Show list'}
          style={{
            all: 'unset',
            position: 'absolute',
            left: 7, top: 12,
            width: 28, height: 28,
            borderRadius: '50%',
            background: BRAND.orange,
            color: BRAND.white,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 2,
            boxShadow: '0 2px 6px rgba(17,17,17,0.18)',
            fontSize: 14,
            lineHeight: 1,
          }}
        >
          {rightOpen ? '‹' : '›'}
        </button>

        {/* List */}
        {rightOpen && (
          <div style={{ marginTop: 52, flex: 1, overflowY: 'auto' }}>
            {groupEntities(entities, typeId).map((group, gi, arr) => (
              <React.Fragment key={group.key}>
                {group.items.map((e) => {
                  const sig   = e.signal || e.status || typeId;
                  const color = SEMANTIC[sig] || BRAND.muted;
                  const label = (sig || '').replace(/-/g, ' ');
                  return (
                    <VerticalPill
                      key={e.id}
                      name={e.name}
                      signalLabel={label}
                      signalColor={color}
                      active={e.id === activeEntityId}
                      onClick={() => chooseEntity(e.id)}
                    />
                  );
                })}
                {gi < arr.length - 1 && (
                  <div style={{ height: 2, background: BRAND.dark }} />
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </aside>

      {/* Fixed tooltip — rendered at root, outside any overflow:hidden chain */}
      {tooltip && (
        <div style={{
          position: 'fixed',
          left: tooltip.x,
          top: tooltip.y,
          transform: 'translate(-100%, -50%)',
          background: BRAND.white,
          border: `1px solid ${BRAND.border}`,
          color: BRAND.orange,
          padding: '5px 9px',
          fontFamily: BRAND.font,
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '-0.005em',
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(17,17,17,0.08)',
          zIndex: 100,
        }}>{tooltip.text}</div>
      )}
    </div>
  );
}
