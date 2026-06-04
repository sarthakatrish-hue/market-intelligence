// src/utils/intelParsers.js
// Named exports for all 5 Intel section parsers.
// Shared between BattlecardsPage and any other consumer.

// ── Strip markdown artifacts from display text ────────────────────
// Applied to every parsed string before it reaches the UI.
// IMPORTANT: We deliberately leave [[wikilinks]] intact so IntelCard can
// render them as proper WikiPills (matches AnswerCard + WikiPagePanel
// citation styling). Renderers wrap strings in renderInlineWithWikilinks.
function cleanText(text) {
  if (!text) return text
  return text
    .replace(/\[\^[^\]]+\]/g, '')                            // [^footnote-key]
    .replace(/<!--[\s\S]*?-->/g, '')                         // <!-- HTML comments -->
    .replace(/^>\s*⚠[^\n]*/gm, '')                          // > ⚠ Unsourced / Conflict lines
    .replace(/^>\s*Background[^\n]*/gm, '')                  // > Background (no source in raw/)
    .replace(/^>\s*/gm, '')                                  // remaining blockquote > markers
    .replace(/\*\*([^*]+)\*\*/g, '$1')                       // **bold** → plain text
    .replace(/\s{2,}/g, ' ')                                 // collapse whitespace
    .trim()
}

function cleanLines(lines) {
  return lines.map(cleanText).filter(Boolean)
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

    const point = cleanText(pointMatch[1].trim())
    const contextLines = []
    let action = ''

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.startsWith('→ Action:')) {
        action = cleanText(line.replace(/^→ Action:\s*/, '').trim())
      } else if (line && !line.startsWith('>') && !line.startsWith('<!--')) {
        contextLines.push(line)
      }
    }

    items.push({ point, context: cleanText(contextLines.join(' ')), action })
  }
  return items
}

// ── Parse ## Competitor Intel ─────────────────────────────────────
export function parseCompetitorIntel(content) {
  if (!content) return null
  const sectionMatch = content.match(/## Competitor Intel([\s\S]*?)(?=\n## [^#]|\s*$)/)
  if (!sectionMatch) return null
  const section = sectionMatch[1]

  const decisionMatch = section.match(/\*\*Decision this informs:\*\*\s*(.+)/)
  const decision = decisionMatch ? cleanText(decisionMatch[1].trim()) : ''

  const winsMatch = section.match(/### Where Scapia Wins([\s\S]*?)(?=###|\s*$)/)
  const whereWeWin = winsMatch ? parseWinLossItems(winsMatch[1]) : []

  const lossMatch = section.match(/### Where They[''`']?re Ahead([\s\S]*?)(?=###|\s*$)/)
  const whereTheyWin = lossMatch ? parseWinLossItems(lossMatch[1]) : []

  const implMatch = section.match(/### Scapia Implication([\s\S]*?)(?=###|\s*$)/)
  const implication = implMatch
    ? cleanLines((implMatch[1].match(/^→\s*(?!Action:)(.+)/gm) || []).map(l => l.replace(/^→\s*/, '').trim()))
    : []

  const movesMatch = section.match(/### Recent Moves([\s\S]*?)(?=###|\s*$)/)
  const recentMoves = movesMatch
    ? (movesMatch[1].match(/^-\s*.+/gm) || []).map(l => {
        const text = cleanText(l.replace(/^-\s*/, '').trim())
        const colonIdx = text.indexOf(':')
        if (colonIdx > -1) return { date: text.substring(0, colonIdx).trim(), event: text.substring(colonIdx + 1).trim() }
        return { date: '—', event: text }
      })
    : [{ date: '—', event: 'No significant recent moves' }]

  return { decision, whereWeWin, whereTheyWin, implication, recentMoves }
}

// ── Parse ## Regulatory Intel ─────────────────────────────────────
export function parseRegulatoryIntel(content) {
  if (!content) return null
  const sectionMatch = content.match(/## Regulatory Intel([\s\S]*?)(?=\n## [^#]|\s*$)/)
  if (!sectionMatch) return null
  const section = sectionMatch[1]

  const statusMatch = section.match(/\*\*Status:\*\*\s*(.+)/)
  const status = statusMatch ? cleanText(statusMatch[1].trim()) : ''

  const requiresMatch = section.match(/### What It Requires([\s\S]*?)(?=###|\s*$)/)
  const whatItRequires = requiresMatch
    ? cleanLines((requiresMatch[1].match(/^-\s*.+/gm) || []).map(l => l.replace(/^-\s*/, '').trim()))
    : []

  const postureMatch = section.match(/### Scapia's Current Posture([\s\S]*?)(?=###|\s*$)/)
  const currentPosture = postureMatch ? cleanText(postureMatch[1].trim()) : ''

  const questionsMatch = section.match(/### Open Questions([\s\S]*?)(?=###|\s*$)/)
  const openQuestions = questionsMatch
    ? cleanLines((questionsMatch[1].match(/^-\s*.+/gm) || []).map(l => l.replace(/^-\s*/, '').trim()))
    : []

  const signOffMatch = section.match(/### Sign-off Required([\s\S]*?)(?=###|\s*$)/)
  const signOffRequired = signOffMatch ? cleanText(signOffMatch[1].trim()) : ''

  const implMatch = section.match(/### Scapia Implication([\s\S]*?)(?=###|\s*$)/)
  const implication = implMatch
    ? cleanLines((implMatch[1].match(/^→\s*(?!Action:)(.+)/gm) || []).map(l => l.replace(/^→\s*/, '').trim()))
    : []

  return { status, whatItRequires, currentPosture, openQuestions, signOffRequired, implication }
}

// ── Parse ## Partner Intel ────────────────────────────────────────
export function parsePartnerIntel(content) {
  if (!content) return null
  const sectionMatch = content.match(/## Partner Intel([\s\S]*?)(?=\n## [^#]|\s*$)/)
  if (!sectionMatch) return null
  const section = sectionMatch[1]

  const relationshipMatch = section.match(/\*\*Relationship:\*\*\s*(.+)/)
  const relationship = relationshipMatch ? cleanText(relationshipMatch[1].trim()) : ''

  const statusMatch = section.match(/\*\*Status:\*\*\s*(.+)/)
  const status = statusMatch ? cleanText(statusMatch[1].trim()) : ''

  const getsMatch = section.match(/### What Scapia Gets([\s\S]*?)(?=###|\s*$)/)
  const whatScapiaGets = getsMatch ? cleanText(getsMatch[1].trim()) : ''

  const partnerGetsMatch = section.match(/### What Partner Gets([\s\S]*?)(?=###|\s*$)/)
  const whatPartnerGets = partnerGetsMatch ? cleanText(partnerGetsMatch[1].trim()) : ''

  const risksMatch = section.match(/### Current Risks([\s\S]*?)(?=###|\s*$)/)
  const currentRisks = risksMatch
    ? cleanLines((risksMatch[1].match(/^-\s*.+/gm) || []).map(l => l.replace(/^-\s*/, '').trim()))
    : []

  const implMatch = section.match(/### Scapia Implication([\s\S]*?)(?=###|\s*$)/)
  const implication = implMatch
    ? cleanLines((implMatch[1].match(/^→\s*(?!Action:)(.+)/gm) || []).map(l => l.replace(/^→\s*/, '').trim()))
    : []

  return { relationship, status, whatScapiaGets, whatPartnerGets, currentRisks, implication }
}

// ── Parse ## Market Intel ─────────────────────────────────────────
export function parseMarketIntel(content) {
  if (!content) return null
  const sectionMatch = content.match(/## Market Intel([\s\S]*?)(?=\n## [^#]|\s*$)/)
  if (!sectionMatch) return null
  const section = sectionMatch[1]

  const domainMatch = section.match(/\*\*Domain:\*\*\s*(.+)/)
  const domain = domainMatch ? cleanText(domainMatch[1].trim()) : ''

  const directionMatch = section.match(/\*\*Direction:\*\*\s*(.+)/)
  const direction = directionMatch ? cleanText(directionMatch[1].trim()) : ''

  const shiftMatch = section.match(/### What's Shifting([\s\S]*?)(?=###|\s*$)/)
  const whatIsShifting = shiftMatch ? cleanText(shiftMatch[1].trim()) : ''

  const mattersMatch = section.match(/### Why It Matters for Scapia([\s\S]*?)(?=###|\s*$)/)
  const whyItMatters = mattersMatch ? cleanText(mattersMatch[1].trim()) : ''

  const implMatch = section.match(/### Scapia Implication([\s\S]*?)(?=###|\s*$)/)
  const implication = implMatch
    ? cleanLines((implMatch[1].match(/^→\s*(?!Action:)(.+)/gm) || []).map(l => l.replace(/^→\s*/, '').trim()))
    : []

  return { domain, direction, whatIsShifting, whyItMatters, implication }
}

// ── Parse ## Customer Intel ───────────────────────────────────────
export function parseCustomerIntel(content) {
  if (!content) return null
  const sectionMatch = content.match(/## Customer Intel([\s\S]*?)(?=\n## [^#]|\s*$)/)
  if (!sectionMatch) return null
  const section = sectionMatch[1]

  const sourceMatch = section.match(/\*\*Source:\*\*\s*(.+)/)
  const source = sourceMatch ? cleanText(sourceMatch[1].trim()) : ''

  const sentimentMatch = section.match(/\*\*Sentiment:\*\*\s*(.+)/)
  const sentiment = sentimentMatch ? cleanText(sentimentMatch[1].trim()) : ''

  const sayingMatch = section.match(/### What They're Saying([\s\S]*?)(?=###|\s*$)/)
  const whatTheyAreSaying = sayingMatch
    ? cleanLines((sayingMatch[1].match(/^-\s*.+/gm) || []).map(l => l.replace(/^-\s*/, '').trim()))
    : []

  const switchingMatch = section.match(/### Switching Signals([\s\S]*?)(?=###|\s*$)/)
  const switchingSignals = switchingMatch ? cleanText(switchingMatch[1].trim()) : ''

  const implMatch = section.match(/### Scapia Acquisition Implication([\s\S]*?)(?=###|\s*$)/)
  const acquisitionImplication = implMatch
    ? cleanLines((implMatch[1].match(/^→\s*(?!Action:)(.+)/gm) || []).map(l => l.replace(/^→\s*/, '').trim()))
    : []

  return { source, sentiment, whatTheyAreSaying, switchingSignals, acquisitionImplication }
}
