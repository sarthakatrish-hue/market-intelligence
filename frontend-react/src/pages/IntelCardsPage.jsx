import React, { useState, useEffect } from 'react'
import IntelCard, { SIGNAL_COLORS } from '../components/IntelCard.jsx'
import { fetchPages, fetchPage } from '../api.js'

// ── Parse vitals from frontmatter ─────────────────────────────────
function parseVitals(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map(v => {
    const parts = String(v).split('|')
    return { value: parts[0] || '', label: parts[1] || '', note: parts[2] || '' }
  }).filter(v => v.value)
}

// ── Parse win/loss items from a subsection block ──────────────────
function parseWinLossItems(text) {
  if (!text) return []
  const items = []
  const blocks = text.split(/\n(?=\*\*[^*])/).filter(b => b.trim())

  for (const block of blocks) {
    const lines = block.trim().split('\n')
    const firstLine = lines[0].trim()
    if (!firstLine.startsWith('**')) continue

    const pointMatch = firstLine.match(/^\*\*(.+?)\*\*/)
    if (!pointMatch) continue

    const point = pointMatch[1].trim()
    const contextLines = []
    let action = ''

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('→ Action:')) {
        action = line.replace(/^→ Action:\s*/, '').trim()
      } else if (line) {
        contextLines.push(line)
      }
    }

    items.push({ point, context: contextLines.join(' '), action })
  }
  return items
}

// ── Parse ## Competitor Intel ─────────────────────────────────────
function parseCompetitorIntel(content) {
  if (!content) return null
  const sectionMatch = content.match(/## Competitor Intel([\s\S]*?)(?=\n## [^#]|\s*$)/)
  if (!sectionMatch) return null
  const section = sectionMatch[1]

  const decisionMatch = section.match(/\*\*Decision this informs:\*\*\s*(.+)/)
  const decision = decisionMatch ? decisionMatch[1].trim() : ''

  const winsMatch = section.match(/### Where Scapia Wins([\s\S]*?)(?=###|\s*$)/)
  const whereWeWin = winsMatch ? parseWinLossItems(winsMatch[1]) : []

  const lossMatch = section.match(/### Where They[''`']?re Ahead([\s\S]*?)(?=###|\s*$)/)
  const whereTheyWin = lossMatch ? parseWinLossItems(lossMatch[1]) : []

  const implMatch = section.match(/### Scapia Implication([\s\S]*?)(?=###|\s*$)/)
  const implication = implMatch
    ? (implMatch[1].match(/^→\s*(?!Action:)(.+)/gm) || []).map(l => l.replace(/^→\s*/, '').trim())
    : []

  const movesMatch = section.match(/### Recent Moves([\s\S]*?)(?=###|\s*$)/)
  const recentMoves = movesMatch
    ? (movesMatch[1].match(/^-\s*.+/gm) || []).map(l => {
        const text = l.replace(/^-\s*/, '').trim()
        const colonIdx = text.indexOf(':')
        if (colonIdx > -1) return { date: text.substring(0, colonIdx).trim(), event: text.substring(colonIdx + 1).trim() }
        return { date: '—', event: text }
      })
    : [{ date: '—', event: 'No significant recent moves' }]

  return { decision, whereWeWin, whereTheyWin, implication, recentMoves }
}

// ── Parse ## Regulatory Intel ─────────────────────────────────────
function parseRegulatoryIntel(content) {
  if (!content) return null
  const sectionMatch = content.match(/## Regulatory Intel([\s\S]*?)(?=\n## [^#]|\s*$)/)
  if (!sectionMatch) return null
  const section = sectionMatch[1]

  const statusMatch = section.match(/\*\*Status:\*\*\s*(.+)/)
  const status = statusMatch ? statusMatch[1].trim() : ''

  const requiresMatch = section.match(/### What It Requires([\s\S]*?)(?=###|\s*$)/)
  const whatItRequires = requiresMatch
    ? (requiresMatch[1].match(/^-\s*.+/gm) || []).map(l => l.replace(/^-\s*/, '').trim())
    : []

  const postureMatch = section.match(/### Scapia's Current Posture([\s\S]*?)(?=###|\s*$)/)
  const currentPosture = postureMatch ? postureMatch[1].trim() : ''

  const questionsMatch = section.match(/### Open Questions([\s\S]*?)(?=###|\s*$)/)
  const openQuestions = questionsMatch
    ? (questionsMatch[1].match(/^-\s*.+/gm) || []).map(l => l.replace(/^-\s*/, '').trim())
    : []

  const signOffMatch = section.match(/### Sign-off Required([\s\S]*?)(?=###|\s*$)/)
  const signOffRequired = signOffMatch ? signOffMatch[1].trim() : ''

  const implMatch = section.match(/### Scapia Implication([\s\S]*?)(?=###|\s*$)/)
  const implication = implMatch
    ? (implMatch[1].match(/^→\s*(?!Action:)(.+)/gm) || []).map(l => l.replace(/^→\s*/, '').trim())
    : []

  return { status, whatItRequires, currentPosture, openQuestions, signOffRequired, implication }
}

// ── Parse ## Partner Intel ────────────────────────────────────────
function parsePartnerIntel(content) {
  if (!content) return null
  const sectionMatch = content.match(/## Partner Intel([\s\S]*?)(?=\n## [^#]|\s*$)/)
  if (!sectionMatch) return null
  const section = sectionMatch[1]

  const relationshipMatch = section.match(/\*\*Relationship:\*\*\s*(.+)/)
  const relationship = relationshipMatch ? relationshipMatch[1].trim() : ''

  const statusMatch = section.match(/\*\*Status:\*\*\s*(.+)/)
  const status = statusMatch ? statusMatch[1].trim() : ''

  const getsMatch = section.match(/### What Scapia Gets([\s\S]*?)(?=###|\s*$)/)
  const whatScapiaGets = getsMatch ? getsMatch[1].trim() : ''

  const partnerGetsMatch = section.match(/### What Partner Gets([\s\S]*?)(?=###|\s*$)/)
  const whatPartnerGets = partnerGetsMatch ? partnerGetsMatch[1].trim() : ''

  const risksMatch = section.match(/### Current Risks([\s\S]*?)(?=###|\s*$)/)
  const currentRisks = risksMatch
    ? (risksMatch[1].match(/^-\s*.+/gm) || []).map(l => l.replace(/^-\s*/, '').trim())
    : []

  const implMatch = section.match(/### Scapia Implication([\s\S]*?)(?=###|\s*$)/)
  const implication = implMatch
    ? (implMatch[1].match(/^→\s*(?!Action:)(.+)/gm) || []).map(l => l.replace(/^→\s*/, '').trim())
    : []

  return { relationship, status, whatScapiaGets, whatPartnerGets, currentRisks, implication }
}

// ── Parse ## Market Intel ─────────────────────────────────────────
function parseMarketIntel(content) {
  if (!content) return null
  const sectionMatch = content.match(/## Market Intel([\s\S]*?)(?=\n## [^#]|\s*$)/)
  if (!sectionMatch) return null
  const section = sectionMatch[1]

  const domainMatch = section.match(/\*\*Domain:\*\*\s*(.+)/)
  const domain = domainMatch ? domainMatch[1].trim() : ''

  const directionMatch = section.match(/\*\*Direction:\*\*\s*(.+)/)
  const direction = directionMatch ? directionMatch[1].trim() : ''

  const shiftMatch = section.match(/### What's Shifting([\s\S]*?)(?=###|\s*$)/)
  const whatIsShifting = shiftMatch ? shiftMatch[1].trim() : ''

  const mattersMatch = section.match(/### Why It Matters for Scapia([\s\S]*?)(?=###|\s*$)/)
  const whyItMatters = mattersMatch ? mattersMatch[1].trim() : ''

  const implMatch = section.match(/### Scapia Implication([\s\S]*?)(?=###|\s*$)/)
  const implication = implMatch
    ? (implMatch[1].match(/^→\s*(?!Action:)(.+)/gm) || []).map(l => l.replace(/^→\s*/, '').trim())
    : []

  return { domain, direction, whatIsShifting, whyItMatters, implication }
}

// ── Parse ## Customer Intel ───────────────────────────────────────
function parseCustomerIntel(content) {
  if (!content) return null
  const sectionMatch = content.match(/## Customer Intel([\s\S]*?)(?=\n## [^#]|\s*$)/)
  if (!sectionMatch) return null
  const section = sectionMatch[1]

  const sourceMatch = section.match(/\*\*Source:\*\*\s*(.+)/)
  const source = sourceMatch ? sourceMatch[1].trim() : ''

  const sentimentMatch = section.match(/\*\*Sentiment:\*\*\s*(.+)/)
  const sentiment = sentimentMatch ? sentimentMatch[1].trim() : ''

  const sayingMatch = section.match(/### What They're Saying([\s\S]*?)(?=###|\s*$)/)
  const whatTheyAreSaying = sayingMatch
    ? (sayingMatch[1].match(/^-\s*.+/gm) || []).map(l => l.replace(/^-\s*/, '').trim())
    : []

  const switchingMatch = section.match(/### Switching Signals([\s\S]*?)(?=###|\s*$)/)
  const switchingSignals = switchingMatch ? switchingMatch[1].trim() : ''

  const implMatch = section.match(/### Scapia Acquisition Implication([\s\S]*?)(?=###|\s*$)/)
  const acquisitionImplication = implMatch
    ? (implMatch[1].match(/^→\s*(?!Action:)(.+)/gm) || []).map(l => l.replace(/^→\s*/, '').trim())
    : []

  return { source, sentiment, whatTheyAreSaying, switchingSignals, acquisitionImplication }
}

// ── Loading skeleton ──────────────────────────────────────────────
function CardSkeleton() {
  return (
    <div style={{
      backgroundColor: '#FFFFFF', border: '1px solid #E8E8E8',
      borderLeft: '4px solid #E8E8E8',
      borderRadius: '16px', overflow: 'hidden',
      boxShadow: '0 2px 10px rgba(0,0,0,0.06)', padding: '24px 28px',
    }}>
      {[60, 40, 100, 60, 80].map((w, i) => (
        <div key={i} style={{
          height: i === 0 ? 28 : 14,
          width: `${w}%`,
          backgroundColor: '#F3F4F6',
          borderRadius: 6,
          marginBottom: i === 0 ? 20 : 10,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
    </div>
  )
}

// ── Vertical sidebar pill ─────────────────────────────────────────
function VerticalPill({ card, isActive, onClick }) {
  const sc = SIGNAL_COLORS[card.signal] || SIGNAL_COLORS.watch

  return (
    <div
      onClick={onClick}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = '#F3F4F6' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
      style={{
        position: 'relative',
        overflow: 'hidden',
        padding: '8px 10px 8px 14px',
        borderRadius: 0,
        borderBottom: '1px solid #F0F0F0',
        backgroundColor: isActive ? '#111' : 'transparent',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        transition: 'background-color 0.12s',
      }}
    >
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0,
        width: '3px', backgroundColor: sc.left,
      }} />
      <span style={{ fontSize: '0.75rem', fontWeight: '700', color: isActive ? '#fff' : '#111', letterSpacing: '-0.01em', lineHeight: 1.3 }}>
        {card.name}
      </span>
      <span style={{ fontSize: '0.55rem', fontWeight: '700', letterSpacing: '0.1em', textTransform: 'uppercase', color: sc.text }}>
        {card.signal}
      </span>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────
export default function IntelCardsPage() {
  const [activeTab, setActiveTab]           = useState('competitor')
  const [competitorCards, setCompetitorCards] = useState([])
  const [selectedId, setSelectedId]         = useState(null)
  const [loading, setLoading]               = useState(true)
  const [error, setError]                   = useState(null)
  const [sidebarOpen, setSidebarOpen]       = useState(true)
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipPos, setTooltipPos]         = useState({ x: 0, y: 0 })
  const [regulatoryCards, setRegulatoryCards] = useState([])
  const [partnerCards,    setPartnerCards]    = useState([])
  const [marketCards,     setMarketCards]     = useState([])
  const [customerCards,   setCustomerCards]   = useState([])

  // ── Load entity cards from wiki ─────────────────────────────────
  useEffect(() => {
    async function loadCards() {
      try {
        setLoading(true)
        setError(null)

        const pages = await fetchPages()

        // ── Competitor cards ────────────────────────────────────────
        const cCards = await Promise.all(
          (pages.entities || []).map(async (entity) => {
            const { meta, content } = await fetchPage(`entities/${entity.slug}`)
            const intel  = parseCompetitorIntel(content)
            const vitals = parseVitals(meta.vitals || [])
            console.log(`[Competitor Intel] ${entity.slug}:`, intel)
            return {
              id: entity.slug,
              name: meta.entity || entity.slug,
              type: 'competitor',
              signal: meta.signal || 'watch',
              vitals,
              stats: vitals.map(v => v.label ? `${v.value} · ${v.label}${v.note ? ` (${v.note})` : ''}` : v.value),
              // Flat fields for IntelCard compatibility
              decision:     intel?.decision     || '',
              whereWeWin:   intel?.whereWeWin   || [],
              whereTheyWin: intel?.whereTheyWin || [],
              implication:  intel?.implication  || [],
              recentMoves:  intel?.recentMoves  || [{ date: '—', event: 'No significant recent moves' }],
              intel,
              hasIntel: !!intel,
            }
          })
        )

        // ── Regulatory cards ────────────────────────────────────────
        const rCards = await Promise.all(
          (pages.regulatory || []).map(async (r) => {
            const { meta, content } = await fetchPage(`regulatory/${r.slug}`)
            const intel = parseRegulatoryIntel(content)
            console.log(`[Regulatory Intel] ${r.slug}:`, intel)
            const postureRaw = (intel?.status || meta.posture || meta.compliance_status || 'Active')
            const statusType = postureRaw.toLowerCase().replace(/\s+/g, '-')
            return {
              id: r.slug,
              name: meta.regulation || r.slug,
              type: 'regulatory',
              signal: postureRaw.toLowerCase() === 'escalated' ? 'threat' : 'watch',
              statusType,
              effectiveDate: meta.effective_date || '',
              whatItSays: intel?.whatItRequires || [],
              currentPosture: intel?.currentPosture || '',
              openQuestions: intel?.openQuestions || [],
              signOff: intel?.signOffRequired || '',
              implication: intel?.implication || [],
              intel,
              hasIntel: !!intel,
            }
          })
        )

        // ── Partner cards ───────────────────────────────────────────
        const pCards = await Promise.all(
          (pages.partners || []).map(async (p) => {
            const { meta, content } = await fetchPage(`partners/${p.slug}`)
            const intel = parsePartnerIntel(content)
            console.log(`[Partner Intel] ${p.slug}:`, intel)
            return {
              id: p.slug,
              name: meta.partner || meta.title || p.slug,
              type: 'partner',
              signal: (intel?.status || '').toLowerCase() === 'at risk' ? 'threat' : 'watch',
              relationship:    intel?.relationship    || '',
              status:          intel?.status          || 'Active',
              whatScapiaGets:  intel?.whatScapiaGets  || '',
              whatPartnerGets: intel?.whatPartnerGets || '',
              currentRisks:    intel?.currentRisks    || [],
              implication:     intel?.implication     || [],
              intel,
              hasIntel: !!intel,
            }
          })
        )

        // ── Market Signal cards ─────────────────────────────────────
        const mCards = await Promise.all(
          (pages['market-signals'] || []).map(async (m) => {
            const { meta, content } = await fetchPage(`market-signals/${m.slug}`)
            const intel = parseMarketIntel(content)
            console.log(`[Market Intel] ${m.slug}:`, intel)
            const dir = (intel?.direction || meta.direction || '').toLowerCase()
            return {
              id: m.slug,
              name: meta.title || m.slug,
              type: 'market-signal',
              signal: dir === 'tailwind' ? 'opportunity' : dir === 'headwind' ? 'threat' : 'watch',
              domain:         intel?.domain         || '',
              direction:      intel?.direction      || meta.direction || '',
              whatIsShifting: intel?.whatIsShifting || '',
              whyItMatters:   intel?.whyItMatters   || '',
              implication:    intel?.implication    || [],
              intel,
              hasIntel: !!intel,
            }
          })
        )

        // ── Customer Signal cards ───────────────────────────────────
        const csCards = (
          await Promise.all(
            (pages.events || []).map(async (e) => {
              const { meta, content } = await fetchPage(`events/${e.slug}`)
              if (!Array.isArray(meta.page_types) || !meta.page_types.includes('customer')) return null
              const intel = parseCustomerIntel(content)
              console.log(`[Customer Intel] ${e.slug}:`, intel)
              return {
                id: e.slug,
                name: meta.event || meta.title || e.slug,
                type: 'customer',
                signal: (intel?.sentiment || '').toLowerCase() === 'negative' ? 'opportunity' : 'watch',
                source:                  intel?.source                  || '',
                sentiment:               intel?.sentiment               || '',
                whatTheyAreSaying:       intel?.whatTheyAreSaying       || [],
                switchingSignals:        intel?.switchingSignals        || '',
                acquisitionImplication:  intel?.acquisitionImplication  || [],
                intel,
                hasIntel: !!intel,
              }
            })
          )
        ).filter(Boolean)

        setCompetitorCards(cCards)
        setRegulatoryCards(rCards)
        setPartnerCards(pCards)
        setMarketCards(mCards)
        setCustomerCards(csCards)
        setSelectedId(prev => prev || (cCards[0]?.id ?? null))

      } catch (err) {
        console.error('Failed to load intel cards:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    loadCards()
  }, [])

  const TABS = [
    { id: 'competitor',    label: 'Competitor',       count: competitorCards.length },
    { id: 'regulatory',   label: 'Regulatory',        count: regulatoryCards.length },
    { id: 'partner',      label: 'Partners',          count: partnerCards.length },
    { id: 'market-signal', label: 'Market Signals',   count: marketCards.length },
    { id: 'customer',     label: 'Customer Signals',  count: customerCards.length },
  ]

  const selectedCard = (() => {
    const pool = activeTab === 'competitor'    ? competitorCards
                : activeTab === 'regulatory'   ? regulatoryCards
                : activeTab === 'partner'      ? partnerCards
                : activeTab === 'market-signal'? marketCards
                : customerCards
    return pool.find(c => c.id === selectedId) || pool[0] || null
  })()

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: '#f1f6fa' }}>

      {/* ── Page header ── */}
      <div style={{
        backgroundColor: '#FFFFFF',
        borderBottom: '1px solid #E8E8E8',
        padding: '20px 32px 0',
        flexShrink: 0,
      }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <h1 style={{ fontSize: '1.3rem', fontWeight: '800', color: '#111', letterSpacing: '-0.02em', margin: 0 }}>
                Intel Cards
              </h1>
              <p style={{ fontSize: '0.8rem', color: '#888', margin: '4px 0 0' }}>
                Where Scapia wins, where they're ahead — rendered live from the wiki.
              </p>
            </div>
            <div style={{
              fontSize: '0.7rem', color: '#888', backgroundColor: '#F3F4F6',
              border: '1px solid #E8E8E8', borderRadius: '8px', padding: '6px 12px', fontWeight: '500',
            }}>
              Live · wiki-sourced
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex' }}>
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 18px', fontSize: '0.82rem', fontWeight: '600',
                  border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '2px solid #ce3e00' : '2px solid transparent',
                  color: activeTab === tab.id ? '#ce3e00' : '#888',
                  transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: '6px',
                  fontFamily: 'inherit',
                }}
              >
                {tab.label}
                <span style={{
                  backgroundColor: activeTab === tab.id ? '#FFF3EC' : '#F3F4F6',
                  color: activeTab === tab.id ? '#ce3e00' : '#888',
                  border: `1px solid ${activeTab === tab.id ? '#FDBA74' : '#E8E8E8'}`,
                  borderRadius: '999px', padding: '1px 7px', fontSize: '0.65rem', fontWeight: '700',
                }}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 overflow-hidden" style={{ display: 'flex' }}>

        {/* ── Main card area ── */}
        <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: '24px 28px' }}>

          {/* Error */}
          {error && (
            <div style={{
              backgroundColor: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: '12px', padding: '16px 20px', color: '#DC2626', fontSize: '0.85rem',
            }}>
              Failed to load competitor cards: {error}
            </div>
          )}

          {/* ── Competitor tab ── */}
          {activeTab === 'competitor' && !error && (
            loading
              ? <CardSkeleton />
              : selectedCard
                ? <IntelCard card={selectedCard} />
                : <div style={{ color: '#888', fontSize: '0.85rem', padding: '20px 0' }}>No competitor cards available.</div>
          )}

          {/* ── Regulatory tab ── */}
          {activeTab === 'regulatory' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
              gap: '20px', alignItems: 'start',
            }}>
              {regulatoryCards.map((card) => (
                <IntelCard key={card.id} card={card} />
              ))}
              {regulatoryCards.length === 0 && (
                <div style={{ color: '#888', fontSize: '0.85rem', padding: '20px 0' }}>No regulatory cards yet.</div>
              )}
            </div>
          )}

          {/* ── Partner tab ── */}
          {activeTab === 'partner' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
              gap: '20px', alignItems: 'start',
            }}>
              {partnerCards.map((card) => (
                <IntelCard key={card.id} card={card} />
              ))}
              {partnerCards.length === 0 && (
                <div style={{ color: '#888', fontSize: '0.85rem', padding: '20px 0' }}>No partner cards yet.</div>
              )}
            </div>
          )}

          {/* ── Market Signal tab ── */}
          {activeTab === 'market-signal' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
              gap: '20px', alignItems: 'start',
            }}>
              {marketCards.map((card) => (
                <IntelCard key={card.id} card={card} />
              ))}
              {marketCards.length === 0 && (
                <div style={{ color: '#888', fontSize: '0.85rem', padding: '20px 0' }}>No market-signal cards yet.</div>
              )}
            </div>
          )}

          {/* ── Customer Signal tab ── */}
          {activeTab === 'customer' && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))',
              gap: '20px', alignItems: 'start',
            }}>
              {customerCards.map((card) => (
                <IntelCard key={card.id} card={card} />
              ))}
              {customerCards.length === 0 && (
                <div style={{ color: '#888', fontSize: '0.85rem', padding: '20px 0' }}>No customer-signal cards yet.</div>
              )}
            </div>
          )}
        </div>

        {/* ── Competitor right sidebar ── */}
        {activeTab === 'competitor' && !error && (
          <div style={{
            width: sidebarOpen ? 148 : 42,
            flexShrink: 0,
            borderLeft: '1px solid #E8E8E8',
            backgroundColor: '#fff',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            transition: 'width 0.18s ease',
            position: 'relative',
          }}>
            {/* Collapse toggle */}
            <button
              onClick={() => setSidebarOpen(v => !v)}
              style={{
                position: 'absolute', top: 12, left: 7,
                width: 28, height: 28,
                border: '1px solid #b83600', borderRadius: '50%',
                backgroundColor: '#ce3e00', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 2, color: '#fff', fontSize: '1rem',
                transition: 'background-color 0.15s',
                boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = '#b83600'
                const r = e.currentTarget.getBoundingClientRect()
                setTooltipPos({ x: r.left - 8, y: r.top + r.height / 2 })
                setTooltipVisible(true)
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = '#ce3e00'
                setTooltipVisible(false)
              }}
            >
              {sidebarOpen ? '›' : '‹'}
            </button>

            {/* Competitor list */}
            {sidebarOpen && (
              <div className="no-scrollbar" style={{ paddingTop: 44, overflowY: 'auto', flex: 1 }}>
                {loading
                  ? [1,2,3,4].map(i => (
                      <div key={i} style={{
                        margin: '6px 10px', height: 40, borderRadius: 4,
                        backgroundColor: '#F3F4F6',
                        animation: 'pulse 1.5s ease-in-out infinite',
                      }} />
                    ))
                  : (() => {
                      const SIGNAL_ORDER = ['threat', 'watch', 'opportunity']
                      const grouped = SIGNAL_ORDER
                        .map(sig => ({ sig, cards: competitorCards.filter(c => (c.signal || 'watch') === sig) }))
                        .filter(g => g.cards.length > 0)
                      return grouped.map((group, gi) => (
                        <React.Fragment key={group.sig}>
                          {gi > 0 && (
                            <div style={{ margin: '6px 0', borderTop: '2px solid #111' }} />
                          )}
                          {group.cards.map(card => (
                            <VerticalPill
                              key={card.id}
                              card={card}
                              isActive={card.id === (selectedId || competitorCards[0]?.id)}
                              onClick={() => setSelectedId(card.id)}
                            />
                          ))}
                        </React.Fragment>
                      ))
                    })()
                }
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fixed tooltip — rendered outside overflow:hidden sidebar */}
      {tooltipVisible && (
        <div style={{
          position: 'fixed',
          left: tooltipPos.x,
          top: tooltipPos.y,
          transform: 'translate(-100%, -140%)',
          backgroundColor: '#ce3e00',
          color: '#fff',
          padding: '4px 10px',
          borderRadius: '5px',
          fontSize: '0.68rem',
          fontWeight: 500,
          whiteSpace: 'nowrap',
          zIndex: 9999,
          pointerEvents: 'none',
          letterSpacing: '0.01em',
        }}>
          {sidebarOpen ? 'Hide competitor list' : 'Show competitor list'}
        </div>
      )}
    </div>
  )
}
