import React from 'react'
import { renderInlineWithWikilinks } from './WikiPill.jsx'

// Render any text-with-wikilinks via the shared pill component. Pills get
// their default behaviour — click → navigate to /vault?open=<path> — since
// IntelCard has no side-panel handler in scope.
const wl = (text) => renderInlineWithWikilinks(text)

// ── Signal colour map (exported so IntelCardsPage can reuse) ──────
export const SIGNAL_COLORS = {
  threat:      { text: '#DC2626', bg: '#FEF2F2', border: '#FECACA', left: '#DC2626' },
  opportunity: { text: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', left: '#16A34A' },
  watch:       { text: '#D97706', bg: '#FFFBEB', border: '#FDE68A', left: '#D97706' },
}

// ── Competitor / Battlecard ───────────────────────────────────────
function CompetitorCard({ card }) {
  const sc = SIGNAL_COLORS[card.signal] || SIGNAL_COLORS.watch

  return (
    <div style={{
      backgroundColor: '#FFFFFF',
      border: '1px solid #E8E8E8',
      borderLeft: `4px solid ${sc.left}`,
      borderRadius: '16px',
      overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0,0,0,0.06)',
    }}>

      {/* ── Header ── */}
      <div style={{ padding: '24px 28px 20px', borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '28px' }}>

          {/* Left: title + signal badge + decision */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: card.decision ? '6px' : 0 }}>
              <div style={{
                fontSize: '2rem', fontWeight: '800',
                letterSpacing: '-0.03em', color: '#111', lineHeight: 1.05,
              }}>
                {card.name}
              </div>
              <span style={{
                padding: '4px 12px', borderRadius: '999px',
                fontSize: '0.68rem', fontWeight: '700',
                letterSpacing: '0.08em', textTransform: 'uppercase',
                flexShrink: 0,
                backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
              }}>
                {card.signal}
              </span>
            </div>
            {card.decision && (
              <div style={{ fontSize: '0.7rem', color: '#999', fontWeight: '500', letterSpacing: '0.02em' }}>
                Informs: {card.decision}
              </div>
            )}
          </div>

          {/* Right: vitals chips */}
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(card.vitals || []).map((v, i) => (
              <div key={i} style={{
                backgroundColor: '#111', borderRadius: 0,
                padding: '7px 12px', display: 'flex', flexDirection: 'column', gap: '1px',
              }}>
                <span style={{ fontSize: '1rem', fontWeight: '700', color: '#fff', lineHeight: 1.1 }}>{v.value}</span>
                {v.note  && <span style={{ fontSize: '0.62rem', color: '#9CA3AF', lineHeight: 1.1 }}>{v.note}</span>}
                {v.label && <span style={{ fontSize: '0.56rem', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: '#6B7280', lineHeight: 1 }}>{v.label}</span>}
              </div>
            ))}
          </div>

        </div>
      </div>

      {/* ── Win / Loss two-column grid ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderBottom: '1px solid #F0F0F0' }}>

        {/* Wins column */}
        <div style={{ padding: '20px 24px', borderRight: '1px solid #E8E8E8', backgroundColor: '#F8FDF9' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            fontSize: '0.65rem', fontWeight: '800', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#16A34A',
            marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #D1FAE5',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#16A34A', flexShrink: 0, display: 'inline-block' }} />
            Where Scapia Wins
          </div>
          {card.whereWeWin.map((item, i) => (
            <div key={i} style={{
              paddingTop: i === 0 ? 0 : '11px',
              paddingBottom: i === card.whereWeWin.length - 1 ? 0 : '11px',
              borderBottom: i === card.whereWeWin.length - 1 ? 'none' : '1px solid #F0F0F0',
            }}>
              <div style={{ fontSize: '0.84rem', fontWeight: '700', color: '#111', lineHeight: 1.35, letterSpacing: '-0.01em', marginBottom: '5px' }}>
                {wl(item.point)}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#666', lineHeight: 1.6, marginBottom: item.action ? '6px' : 0 }}>
                {wl(item.context)}
              </div>
              {item.action && (
                <div style={{ fontSize: '0.71rem', color: '#16A34A', fontWeight: '600', display: 'flex', alignItems: 'flex-start', gap: '5px', lineHeight: 1.4 }}>
                  <span style={{ flexShrink: 0, marginTop: '1px' }}>→</span>
                  <span>{wl(item.action)}</span>
                </div>
              )}
            </div>
          ))}
          {card.whereWeWin.length === 0 && (
            <div style={{ fontSize: '0.78rem', color: '#9CA3AF', fontStyle: 'italic' }}>No data yet.</div>
          )}
        </div>

        {/* Losses column */}
        <div style={{ padding: '20px 24px', backgroundColor: '#FFF8F8' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            fontSize: '0.65rem', fontWeight: '800', letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#DC2626',
            marginBottom: '14px', paddingBottom: '10px', borderBottom: '1px solid #FEE2E2',
          }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: '#DC2626', flexShrink: 0, display: 'inline-block' }} />
            Where They're Ahead
          </div>
          {card.whereTheyWin.map((item, i) => (
            <div key={i} style={{
              paddingTop: i === 0 ? 0 : '11px',
              paddingBottom: i === card.whereTheyWin.length - 1 ? 0 : '11px',
              borderBottom: i === card.whereTheyWin.length - 1 ? 'none' : '1px solid #F0F0F0',
            }}>
              <div style={{ fontSize: '0.84rem', fontWeight: '700', color: '#111', lineHeight: 1.35, letterSpacing: '-0.01em', marginBottom: '5px' }}>
                {wl(item.point)}
              </div>
              <div style={{ fontSize: '0.74rem', color: '#666', lineHeight: 1.6, marginBottom: item.action ? '6px' : 0 }}>
                {wl(item.context)}
              </div>
              {item.action && (
                <div style={{ fontSize: '0.71rem', color: '#DC2626', fontWeight: '600', display: 'flex', alignItems: 'flex-start', gap: '5px', lineHeight: 1.4 }}>
                  <span style={{ flexShrink: 0, marginTop: '1px' }}>→</span>
                  <span>{wl(item.action)}</span>
                </div>
              )}
            </div>
          ))}
          {card.whereTheyWin.length === 0 && (
            <div style={{ fontSize: '0.78rem', color: '#9CA3AF', fontStyle: 'italic' }}>No data yet.</div>
          )}
        </div>
      </div>

      {/* ── Scapia Implication ── */}
      <div style={{ padding: '0 24px 20px' }}>
        <div style={{ backgroundColor: '#111', borderRadius: 0, padding: '18px 22px' }}>
          <div style={{
            fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#ce3e00', marginBottom: '12px',
          }}>
            Scapia Implication
          </div>
          {card.implication.map((item, i) => (
            <div key={i} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', marginBottom: i === card.implication.length - 1 ? 0 : '8px' }}>
              <span style={{ color: '#ce3e00', flexShrink: 0, marginTop: '2px', fontSize: '0.82rem' }}>→</span>
              <span style={{ fontSize: '0.82rem', color: '#D1D5DB', lineHeight: 1.55 }}>{wl(item)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Recent Moves ── */}
      {card.recentMoves.some(m => m.event !== 'No significant recent moves') && (
        <div style={{ padding: '14px 28px 20px' }}>
          <div style={{
            fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#bbb', marginBottom: '10px',
          }}>
            Recent Moves
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {card.recentMoves.map((m, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'baseline', gap: '8px',
                paddingRight: i === card.recentMoves.length - 1 ? 0 : '20px',
                marginRight:  i === card.recentMoves.length - 1 ? 0 : '20px',
                borderRight:  i === card.recentMoves.length - 1 ? 'none' : '1px solid #EBEBEB',
              }}>
                <span style={{ fontSize: '0.68rem', color: '#ce3e00', fontWeight: '700', flexShrink: 0 }}>{m.date}</span>
                <span style={{ fontSize: '0.78rem', color: '#555' }}>{m.event}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Regulatory Card ───────────────────────────────────────────────
function RegulatoryCard({ card }) {
  const statusConfig = {
    active:        { bg: '#DCFCE7', text: '#16A34A', border: '#BBF7D0', label: 'Active' },
    confirmed:     { bg: '#DCFCE7', text: '#16A34A', border: '#BBF7D0', label: 'Confirmed' },
    'under-review':{ bg: '#FEF9C3', text: '#CA8A04', border: '#FDE68A', label: 'Under Review' },
    escalated:     { bg: '#FEE2E2', text: '#DC2626', border: '#FECACA', label: 'Escalated' },
    superseded:    { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB', label: 'Superseded' },
  }
  const sc = statusConfig[card.statusType] || statusConfig.active
  const whatItSays = Array.isArray(card.whatItSays) ? card.whatItSays : []
  const openQuestions = Array.isArray(card.openQuestions) ? card.openQuestions : []

  return (
    <div style={{
      backgroundColor: '#FFFFFF', border: '1px solid #E8E8E8',
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '10px', backgroundColor: '#DCFCE7',
              border: '1px solid #86EFAC', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '1rem', flexShrink: 0,
            }}>
              ⚖️
            </div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#111', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                {card.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '2px' }}>{card.effectiveDate}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
            <span style={{
              backgroundColor: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE',
              borderRadius: '999px', padding: '3px 10px', fontSize: '0.65rem',
              fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>
              Regulatory
            </span>
            <span style={{
              backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
              borderRadius: '999px', padding: '3px 10px', fontSize: '0.65rem', fontWeight: '700',
            }}>
              {sc.label}
            </span>
          </div>
        </div>
      </div>

      {/* What It Says */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#2563EB', marginBottom: '8px' }}>
          What It Says
        </div>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {whatItSays.map((item, i) => (
            <li key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <span style={{ color: '#93C5FD', flexShrink: 0, marginTop: '3px', fontSize: '0.6rem' }}>●</span>
              <span style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.55 }}>{wl(item)}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Current Posture */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>
          Current Posture
        </div>
        <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.6, backgroundColor: '#F8F8F8', borderRadius: 0, padding: '10px 14px', border: '1px solid #E8E8E8' }}>
          {wl(card.currentPosture)}
        </div>
      </div>

      {/* Open Questions */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#CA8A04', marginBottom: '8px' }}>
          Open Questions
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {openQuestions.map((q, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 0, padding: '8px 12px' }}>
              <span style={{ color: '#CA8A04', flexShrink: 0, fontSize: '0.75rem', marginTop: '1px' }}>?</span>
              <span style={{ fontSize: '0.78rem', color: '#92400E', lineHeight: 1.55 }}>{wl(q)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Sign-off Required */}
      <div style={{ padding: '16px 24px' }}>
        <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#DC2626', marginBottom: '8px' }}>
          Sign-off Required
        </div>
        <div style={{ backgroundColor: '#FFF8F8', border: '1px solid #FECACA', borderRadius: 0, padding: '10px 14px', fontSize: '0.78rem', color: '#7F1D1D', lineHeight: 1.55, fontWeight: '500' }}>
          {card.signOff}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// PartnerCard
// ─────────────────────────────────────────────────────────────────
function PartnerCard({ card }) {
  const statusConfig = {
    active:      { bg: '#DBEAFE', text: '#2563EB', border: '#BFDBFE', label: 'Active' },
    negotiating: { bg: '#FEF9C3', text: '#CA8A04', border: '#FDE68A', label: 'Negotiating' },
    'at-risk':   { bg: '#FEE2E2', text: '#DC2626', border: '#FECACA', label: 'At Risk' },
  }
  const statusKey = (card.status || 'Active').toLowerCase().replace(/\s+/g, '-')
  const sc = statusConfig[statusKey] || statusConfig.active
  const currentRisks = Array.isArray(card.currentRisks) ? card.currentRisks : []
  const implication  = Array.isArray(card.implication)  ? card.implication  : []

  return (
    <div style={{
      backgroundColor: '#FFFFFF', border: '1px solid #E8E8E8',
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '10px', backgroundColor: '#DBEAFE',
              border: '1px solid #BFDBFE', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '1rem', flexShrink: 0,
            }}>🤝</div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#111', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                {card.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '2px' }}>{card.relationship || 'Partner'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
            <span style={{
              backgroundColor: '#EFF6FF', color: '#2563EB', border: '1px solid #BFDBFE',
              borderRadius: '999px', padding: '3px 10px', fontSize: '0.65rem',
              fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>Partner</span>
            <span style={{
              backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
              borderRadius: '999px', padding: '3px 10px', fontSize: '0.65rem', fontWeight: '700',
            }}>{sc.label}</span>
          </div>
        </div>
      </div>

      {card.whatScapiaGets && (
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#16A34A', marginBottom: '8px' }}>
            What Scapia Gets
          </div>
          <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.6 }}>{wl(card.whatScapiaGets)}</div>
        </div>
      )}

      {card.whatPartnerGets && (
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#2563EB', marginBottom: '8px' }}>
            What Partner Gets
          </div>
          <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.6 }}>{wl(card.whatPartnerGets)}</div>
        </div>
      )}

      {currentRisks.length > 0 && (
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#DC2626', marginBottom: '8px' }}>
            Current Risks
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {currentRisks.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', backgroundColor: '#FFF8F8', border: '1px solid #FECACA', padding: '8px 12px' }}>
                <span style={{ color: '#DC2626', flexShrink: 0, fontSize: '0.7rem', marginTop: '2px' }}>⚠</span>
                <span style={{ fontSize: '0.78rem', color: '#7F1D1D', lineHeight: 1.55 }}>{wl(r)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {implication.length > 0 && (
        <div style={{ padding: '0 24px 20px', paddingTop: '16px' }}>
          <div style={{ backgroundColor: '#111', borderRadius: 0, padding: '18px 22px' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ce3e00', marginBottom: '12px' }}>
              Scapia Implication
            </div>
            {implication.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', marginBottom: i === implication.length - 1 ? 0 : '8px' }}>
                <span style={{ color: '#ce3e00', flexShrink: 0, marginTop: '2px', fontSize: '0.82rem' }}>→</span>
                <span style={{ fontSize: '0.82rem', color: '#D1D5DB', lineHeight: 1.55 }}>{wl(item)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// MarketSignalCard
// ─────────────────────────────────────────────────────────────────
function MarketSignalCard({ card }) {
  const directionConfig = {
    tailwind: { bg: '#DCFCE7', text: '#16A34A', border: '#86EFAC', label: 'Tailwind', icon: '↗' },
    headwind: { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5', label: 'Headwind', icon: '↘' },
    neutral:  { bg: '#F3F4F6', text: '#6B7280', border: '#D1D5DB', label: 'Neutral',  icon: '→' },
  }
  const dirKey = (card.direction || 'neutral').toLowerCase()
  const dc = directionConfig[dirKey] || directionConfig.neutral
  const implication = Array.isArray(card.implication) ? card.implication : []

  return (
    <div style={{
      backgroundColor: '#FFFFFF', border: '1px solid #E8E8E8',
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '10px', backgroundColor: dc.bg,
              border: `1px solid ${dc.border}`, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '1.1rem', flexShrink: 0, color: dc.text, fontWeight: '700',
            }}>{dc.icon}</div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#111', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                {card.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '2px' }}>{card.domain || 'Market Signal'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
            <span style={{
              backgroundColor: '#F5F3FF', color: '#7C3AED', border: '1px solid #DDD6FE',
              borderRadius: '999px', padding: '3px 10px', fontSize: '0.65rem',
              fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>Market Signal</span>
            <span style={{
              backgroundColor: dc.bg, color: dc.text, border: `1px solid ${dc.border}`,
              borderRadius: '999px', padding: '3px 10px', fontSize: '0.65rem', fontWeight: '700',
            }}>{dc.label}</span>
          </div>
        </div>
      </div>

      {card.whatIsShifting && (
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7C3AED', marginBottom: '8px' }}>
            What's Shifting
          </div>
          <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.6 }}>{wl(card.whatIsShifting)}</div>
        </div>
      )}

      {card.whyItMatters && (
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>
            Why It Matters for Scapia
          </div>
          <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.6, backgroundColor: '#F8F8F8', padding: '10px 14px', border: '1px solid #E8E8E8' }}>
            {wl(card.whyItMatters)}
          </div>
        </div>
      )}

      {implication.length > 0 && (
        <div style={{ padding: '0 24px 20px', paddingTop: '16px' }}>
          <div style={{ backgroundColor: '#111', borderRadius: 0, padding: '18px 22px' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ce3e00', marginBottom: '12px' }}>
              Scapia Implication
            </div>
            {implication.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', marginBottom: i === implication.length - 1 ? 0 : '8px' }}>
                <span style={{ color: '#ce3e00', flexShrink: 0, marginTop: '2px', fontSize: '0.82rem' }}>→</span>
                <span style={{ fontSize: '0.82rem', color: '#D1D5DB', lineHeight: 1.55 }}>{wl(item)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// CustomerSignalCard
// ─────────────────────────────────────────────────────────────────
function CustomerSignalCard({ card }) {
  const sentimentConfig = {
    positive: { bg: '#DCFCE7', text: '#16A34A', border: '#86EFAC', label: 'Positive' },
    negative: { bg: '#FEE2E2', text: '#DC2626', border: '#FCA5A5', label: 'Negative' },
    mixed:    { bg: '#FEF9C3', text: '#CA8A04', border: '#FDE68A', label: 'Mixed' },
  }
  const sentKey = (card.sentiment || 'mixed').toLowerCase()
  const sc = sentimentConfig[sentKey] || sentimentConfig.mixed
  const whatTheyAreSaying = Array.isArray(card.whatTheyAreSaying) ? card.whatTheyAreSaying : []
  const acquisitionImplication = Array.isArray(card.acquisitionImplication) ? card.acquisitionImplication : []

  return (
    <div style={{
      backgroundColor: '#FFFFFF', border: '1px solid #E8E8E8',
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F0F0F0' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '10px', backgroundColor: '#FFE4E6',
              border: '1px solid #FECDD3', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '1rem', flexShrink: 0,
            }}>💬</div>
            <div>
              <div style={{ fontWeight: '800', fontSize: '0.95rem', color: '#111', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
                {card.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '2px' }}>{card.source || 'Customer signal'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
            <span style={{
              backgroundColor: '#FFF1F2', color: '#E11D48', border: '1px solid #FECDD3',
              borderRadius: '999px', padding: '3px 10px', fontSize: '0.65rem',
              fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>Customer</span>
            <span style={{
              backgroundColor: sc.bg, color: sc.text, border: `1px solid ${sc.border}`,
              borderRadius: '999px', padding: '3px 10px', fontSize: '0.65rem', fontWeight: '700',
            }}>{sc.label}</span>
          </div>
        </div>
      </div>

      {whatTheyAreSaying.length > 0 && (
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E11D48', marginBottom: '8px' }}>
            What They're Saying
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {whatTheyAreSaying.map((q, i) => (
              <li key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <span style={{ color: '#FBA5B4', flexShrink: 0, marginTop: '3px', fontSize: '0.6rem' }}>●</span>
                <span style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.55 }}>{q}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {card.switchingSignals && (
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #F0F0F0' }}>
          <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#888', marginBottom: '8px' }}>
            Switching Signals
          </div>
          <div style={{ fontSize: '0.8rem', color: '#374151', lineHeight: 1.6, backgroundColor: '#F8F8F8', padding: '10px 14px', border: '1px solid #E8E8E8' }}>
            {wl(card.switchingSignals)}
          </div>
        </div>
      )}

      {acquisitionImplication.length > 0 && (
        <div style={{ padding: '0 24px 20px', paddingTop: '16px' }}>
          <div style={{ backgroundColor: '#111', borderRadius: 0, padding: '18px 22px' }}>
            <div style={{ fontSize: '0.6rem', fontWeight: '800', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#ce3e00', marginBottom: '12px' }}>
              Scapia Acquisition Implication
            </div>
            {acquisitionImplication.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '9px', alignItems: 'flex-start', marginBottom: i === acquisitionImplication.length - 1 ? 0 : '8px' }}>
                <span style={{ color: '#ce3e00', flexShrink: 0, marginTop: '2px', fontSize: '0.82rem' }}>→</span>
                <span style={{ fontSize: '0.82rem', color: '#D1D5DB', lineHeight: 1.55 }}>{wl(item)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────────────
export default function IntelCard({ card }) {
  if (card.type === 'regulatory')    return <RegulatoryCard    card={card} />
  if (card.type === 'partner')       return <PartnerCard       card={card} />
  if (card.type === 'market-signal') return <MarketSignalCard  card={card} />
  if (card.type === 'customer')      return <CustomerSignalCard card={card} />
  return <CompetitorCard card={card} />
}
