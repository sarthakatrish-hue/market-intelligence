import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import ChartBlock from './ChartBlock.jsx'
import WikiPill, { renderInlineWithWikilinks } from './WikiPill.jsx'

// ─────────────────────────────────────────────────────────────────────
// Design tokens — match the Brief mockup exactly.
// Two typefaces, split by job:
//   Lexend Deca  — argument prose (lede, body)
//   IBM Plex Mono — everything instrumental (IDs, dates, stats, pills, footer)
// ─────────────────────────────────────────────────────────────────────
const T = {
  bg:         '#f1f6fa',
  ink:        '#111111',
  bodyInk:    '#2a2a2a',
  orange:     '#ce3e00',
  border:     '#E8E8E8',
  rule:       '#ECECEC',
  muted:      '#888888',
  mutedSoft:  '#AAAAAA',
  paper:      '#FFFFFF',
  ink04:      'rgba(17,17,17,0.04)',
  ink06:      'rgba(17,17,17,0.06)',
  orange06:   'rgba(206,62,0,0.06)',
  green:      '#22a06b',
  sans:       '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  // Single typeface — Lexend Deca everywhere. The "instrument" feel comes from
  // uppercase + letter-spacing on labels, not a separate monospace font.
  mono:       '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

// WikiPill + renderInlineWithWikilinks now live in ./WikiPill.jsx — shared
// by AnswerCard, WikiPagePanel and IntelCard so all three surfaces render
// citations identically.

// Used by the Bottom Line blockquote handler in ReactMarkdown to detect
// "Bottom Line: ..." strings vs other blockquotes.
function extractText(node) {
  if (!node) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node)) return extractText(node.props?.children)
  return ''
}

// ─────────────────────────────────────────────────────────────────────
// Parse a single stat cell into {value, label, delta}.
// Tries TWO extraction strategies:
//   1. Leading-position match — clean "VALUE rest..." pattern (preferred)
//   2. Anywhere match — find the first prominent number in the text and
//      treat that as the headline value (handles e.g. "Scapia 4.3★ across
//      12,400 App Store reviews" → value=4.3★)
// If neither extracts a value, returns {value: ''} — caller hides such
// cells to keep the strip visually uniform.
// ─────────────────────────────────────────────────────────────────────
function parseStatCell(text) {
  const cleanWs = (s) => s.replace(/\s+/g, ' ').replace(/^\s*[—\-,;:.]\s*/, '').trim()

  // Strategy 1: leading-position. Covers ₹0.52/mile, $5,000, 800K, 2M+,
  // 30%, 36hrs, Jan '26, ₹11,988/yr, +60%, ▼ ₹0.75
  let value = ''
  let label = text
  const leading = text.match(
    /^((?:[+\-▼▲]\s*)?(?:₹|\$|€|£)?\s*[\d,.]+(?:[KMB%+]+|\/[A-Za-z0-9]+|★|[A-Za-z]+|'\d{2})?)\s+([\s\S]+)$/
  )
  if (leading) {
    value = leading[1].trim()
    label = leading[2].trim()
  } else {
    // Strategy 2: anywhere. Find the first numeric chunk in the text and
    // use it as the headline value; strip it from the label.
    const anywhere = text.match(
      /(?:₹|\$|€|£)?\s*[\d,]+(?:\.\d+)?(?:[KMB%+]+|\/[A-Za-z0-9]+|★|stars?)?/
    )
    if (anywhere && anywhere[0].match(/\d/)) {
      value = anywhere[0].trim()
      label = cleanWs(text.replace(anywhere[0], ' '))
    }
  }

  // Detect a delta hint inside the label and tint it
  let delta = null
  const wasMatch = label.match(/\((was|previously|from)\s+([^)]+)\)/i)
  if (wasMatch) {
    delta = { dir: 'down', text: '▼ ' + wasMatch[2] }
    label = label.replace(wasMatch[0], '').trim()
  } else {
    const downMatch = label.match(/\b(down)\s+([\d.]+%)\b/i)
    const upMatch = label.match(/\b(up)\s+([\d.]+%)\b/i)
    if (downMatch) {
      delta = { dir: 'down', text: '▼ ' + downMatch[2] }
      label = label.replace(downMatch[0], '').trim()
    } else if (upMatch) {
      delta = { dir: 'up', text: '▲ ' + upMatch[2] }
      label = label.replace(upMatch[0], '').trim()
    }
  }
  return { value, label: cleanWs(label), delta }
}

// ─────────────────────────────────────────────────────────────────────
// Brief parser — split the markdown answer into the structured sections
// the Brief layout needs.
// ─────────────────────────────────────────────────────────────────────
function parseBrief(text) {
  const empty = {
    bottomLine: '',
    asOfDate: '',
    confidenceLevel: '',
    signals: [],
    charts: [],
    implication: { kicker: 'Scapia Implication', items: [] },
    footer: { confidence: '', perspectives: '', blindSpot: '', sourcesCount: 0 },
  }
  if (!text) return empty

  // Strip frontmatter (legacy synthesis pages had it)
  let clean = text.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()

  // Strip trailing Sources/References section
  clean = clean.replace(/\n{0,3}(?:#{1,3}\s+)?(?:\*{1,2})?(?:Sources?|References?)(?:\*{1,2})?\s*\n[\s\S]*$/im, '').trim()

  // Pull any ```chart fenced blocks out of the markdown. They'll be rendered
  // by our ChartBlock component separately; we don't want them showing as
  // raw code in the signal prose.
  const briefCharts = []
  clean = clean.replace(/```chart\s*\n([\s\S]*?)```/g, (_, raw) => {
    briefCharts.push(raw.trim())
    return ''
  }).trim()

  // ── Extract Bottom Line + As-of/confidence sub-line ────────────
  let bottomLine = ''
  let asOfDate = ''
  let confidenceLevel = ''

  // Bottom Line blockquote
  clean = clean.replace(
    /^>\s*\*\*(?:Bottom Line|TL;DR):?\*\*\s*([\s\S]*?)(?=\n>(?!\s*As of)|\n\n|\n---|$)/im,
    (_, content) => { bottomLine = content.replace(/\n>\s*/g, ' ').trim(); return '' }
  ).trim()

  // As-of line — "> As of DD/MM/YY · High confidence"
  clean = clean.replace(
    /^>\s*As of\s+([^\n·]+?)(?:\s*·\s*(High|Medium|Low)\s+confidence)?\s*$/im,
    (_, d, c) => { asOfDate = (d || '').trim(); confidenceLevel = (c || '').trim(); return '' }
  ).trim()

  // ── Extract footer fields (Confidence / Perspectives / Blind spot) ─
  let confidenceLine = '', perspectivesLine = '', blindSpotLine = ''
  clean = clean.replace(/^\*\*Confidence:\*\*(.+)$/m, (_, r) => { confidenceLine = r.trim(); return '' }).trim()
  clean = clean.replace(/^\*\*Perspectives:\*\*(.+)$/m, (_, r) => { perspectivesLine = r.trim(); return '' }).trim()
  clean = clean.replace(/^\*\*Blind spot:\*\*(.+)$/im, (_, r) => { blindSpotLine = r.trim(); return '' }).trim()

  // ── Split off the Implication block ────────────────────────────
  let implicationItems = []
  const implMatch = clean.match(/^([\s\S]*?)\n#{1,3}\s+(?:Scapia|Calibre) Implication\s*\n+([\s\S]*)$/im)
  if (implMatch) {
    clean = implMatch[1].trim()
    const implBody = implMatch[2]
      .replace(/^\s*-{3,}\s*$/gm, '')   // drop divider lines
      .trim()
    // Implication bullets:  "- text"  (possibly multi-line)
    const bulletRe = /^-\s+([\s\S]*?)(?=\n-\s|$)/gm
    let bm
    while ((bm = bulletRe.exec(implBody)) !== null) {
      implicationItems.push(bm[1].trim())
    }
  }

  // ── Split Signal sections by "## Signal · ..." headings ────────
  // Split-then-parse-each-chunk is more robust than one mega-regex because the
  // gm flag makes `$` mean end-of-line, which caused the lookahead to terminate
  // body capture at zero characters for the last section.
  const signals = []
  const chunks = clean.split(/(?=^##\s+Signal\s*·)/m)
  for (const chunk of chunks) {
    const headerMatch = chunk.match(/^##\s+Signal\s*·\s*\[\[([^\]]+)\]\]\s*·\s*(?:Lens[:\s]*)?([^\n]+)/)
    if (!headerMatch) continue

    const path = headerMatch[1].trim()
    const lens = headerMatch[2].trim()

    // Everything after the header line, up to the next "## " heading (which
    // would be a different section that the split missed, e.g. a stray "##").
    let body = chunk.slice(headerMatch[0].length)
    const nextHeading = body.search(/\n##\s/)
    if (nextHeading >= 0) body = body.slice(0, nextHeading)
    body = body
      .replace(/^---\s*\n+/gm, '')   // drop divider lines
      .replace(/\n+---\s*$/g, '')
      .trim()

    // Pull the **Stat:** line. Parse each cell — keep only cells where a
    // value could be extracted. Cells without values look out-of-place next
    // to cells with big numbers (the user flagged this in the screenshots),
    // so we hide them rather than render a label-only stub.
    let stats = []
    let prose = body
    const statMatch = body.match(/^\*\*Stat:\*\*\s*(.+)$/m)
    if (statMatch) {
      const cells = statMatch[1].split('·').map((s) => s.trim()).filter(Boolean)
      const withValues = cells.map(parseStatCell).filter((c) => c.value)
      // Only render the strip if at least one cell extracted a value.
      // If zero, the model wrote prose-as-stats — drop the strip entirely.
      if (withValues.length > 0) stats = withValues
      prose = body.replace(/^\*\*Stat:\*\*.*$/m, '').trim()
    }

    // Counter-signal line (optional)
    let counterSignal = ''
    prose = prose.replace(/^(?:>\s*)?(?:⚠\s*)?Counter-signal:\s*(.+)$/im, (_, r) => {
      counterSignal = r.trim(); return ''
    }).trim()

    // Pull ```chart blocks out of THIS signal's prose so they render via
    // ChartBlock under the prose, not as raw markdown.
    const signalCharts = []
    prose = prose.replace(/```chart\s*\n([\s\S]*?)```/g, (_, raw) => {
      signalCharts.push(raw.trim())
      return ''
    }).trim()

    signals.push({ path, lens, stats, prose, counterSignal, charts: signalCharts })
  }

  // ── Count citations across the whole brief for footer ──────────
  const citations = new Set()
  const citeRe = /\[\[([^\]]+)\]\]/g
  let cm
  while ((cm = citeRe.exec(text)) !== null) citations.add(cm[1])

  return {
    bottomLine,
    asOfDate,
    confidenceLevel,
    signals,
    charts: briefCharts,
    implication: { kicker: 'Scapia Implication', items: implicationItems },
    footer: {
      confidence: confidenceLine,
      perspectives: perspectivesLine,
      blindSpot: blindSpotLine,
      sourcesCount: citations.size,
    },
  }
}

// ─────────────────────────────────────────────────────────────────────
// Stat cell — receives a pre-parsed {value, label, delta} object.
// Lives inside a CSS grid; the grid handles separators and equal widths.
// Labels wrap inside the cell (no nowrap) — keeps the strip aligned even
// when one cell has substantially more text than another.
// ─────────────────────────────────────────────────────────────────────
function StatCell({ value, label, delta }) {
  const deltaNode = delta && (
    <span style={{
      color: delta.dir === 'up' ? T.green : T.orange,
      fontWeight: 600,
      marginLeft: 4,
      whiteSpace: 'nowrap',
    }}>{delta.text}</span>
  )
  return (
    <div style={{
      padding: '12px 20px',
      background: T.paper,
      minWidth: 0,
    }}>
      {value && (
        <div style={{
          fontFamily: T.sans,
          fontSize: 19,
          fontWeight: 500,
          color: T.ink,
          letterSpacing: '-0.01em',
          lineHeight: 1.15,
          // Value stays on one line, ellipsis if absurdly long
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>{value}</div>
      )}
      <div style={{
        marginTop: value ? 6 : 0,
        fontFamily: T.sans,
        fontSize: 10,
        letterSpacing: '0.06em',
        color: T.muted,
        textTransform: 'uppercase',
        // Allow long labels to wrap inside the cell
        lineHeight: 1.45,
        wordBreak: 'normal',
        overflowWrap: 'anywhere',
      }}>
        {label}
        {deltaNode && <> {deltaNode}</>}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Owner tag — small uppercase mono chip at end of implication bullets.
// Extracts "owner: <X>" from the bullet text and renders as a sharp tag.
// ─────────────────────────────────────────────────────────────────────
function extractOwnerAndWindow(bullet) {
  // owner: growth, window: 30 days, target: 500 signups
  const ownerMatch = bullet.match(/(?:—|--|-)?\s*owner:\s*([^,;\n]+)/i)
  const owner = ownerMatch ? ownerMatch[1].trim() : ''
  // Strip the trailing "owner:...target:..." meta clause from main body
  let main = bullet.replace(/\s*(?:—|--|-)\s*owner:\s*[\s\S]+$/i, '').trim()
  return { owner, main }
}

// ─────────────────────────────────────────────────────────────────────
// Render a paragraph of prose with [[wikilinks]] resolved to pills.
// Used inside Signal body and inside Implication items.
// ─────────────────────────────────────────────────────────────────────
function ProseWithLinks({ text, onCitationClick, dark = false }) {
  if (!text) return null
  const lines = text.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
  return (
    <>
      {lines.map((line, i) => (
        <p key={i} style={{
          margin: i === 0 ? 0 : '12px 0 0',
          fontFamily: T.sans,
          fontSize: 15,
          lineHeight: 1.62,
          color: dark ? '#ededed' : T.bodyInk,
        }}>
          {renderInlineWithWikilinks(line, onCitationClick, { dark })}
        </p>
      ))}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────────
// One Signal section
// ─────────────────────────────────────────────────────────────────────
function SignalSection({ signal, index, total, onCitationClick }) {
  const isLast = index === total - 1
  return (
    <section style={{
      padding: '22px 0',
      borderBottom: isLast ? 'none' : `1px solid ${T.rule}`,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 14, flexWrap: 'wrap',
      }}>
        <span style={{
          fontFamily: T.mono, fontSize: 11, fontWeight: 600,
          letterSpacing: '0.05em', color: T.orange,
        }}>S{index + 1}</span>
        <span style={{
          fontFamily: T.mono, fontSize: 9.5, fontWeight: 600,
          letterSpacing: '0.2em', color: T.mutedSoft, paddingRight: 2,
        }}>SIGNAL</span>
        <WikiPill path={signal.path} onClick={onCitationClick} />
        {signal.lens && (
          <span style={{
            marginLeft: 'auto',
            fontFamily: T.mono, fontSize: 10,
            letterSpacing: '0.1em', color: T.muted,
            whiteSpace: 'nowrap', textTransform: 'uppercase',
          }}>LENS · {signal.lens}</span>
        )}
      </div>

      {signal.stats.length > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: `repeat(auto-fit, minmax(200px, 1fr))`,
          border: `1px solid ${T.border}`,
          background: T.ink04,
          marginBottom: 14,
          // Cells are separated by 1px gaps that show the ink04 background
          // through, giving the rule between them.
          gap: 1,
        }}>
          {signal.stats.map((s, i) => (
            <StatCell
              key={i}
              value={s.value}
              label={s.label}
              delta={s.delta}
            />
          ))}
        </div>
      )}

      <div>
        <ProseWithLinks text={signal.prose} onCitationClick={onCitationClick} />
      </div>

      {/* Inline charts that lived inside this signal's prose */}
      {signal.charts && signal.charts.length > 0 && (
        <div style={{ marginTop: 14 }}>
          {signal.charts.map((raw, i) => (
            <div key={i} style={{ marginBottom: i === signal.charts.length - 1 ? 0 : 14 }}>
              <ChartBlock raw={raw} />
            </div>
          ))}
        </div>
      )}

      {signal.counterSignal && (
        <div style={{
          marginTop: 14,
          padding: '10px 14px',
          background: 'rgba(206,62,0,0.04)',
          border: `1px solid rgba(206,62,0,0.18)`,
          borderLeft: `3px solid ${T.orange}`,
          fontFamily: T.sans,
          fontSize: 13.5,
          lineHeight: 1.55,
          color: T.bodyInk,
        }}>
          <span style={{
            display: 'inline-block', marginRight: 8,
            fontFamily: T.mono, fontSize: 9.5, fontWeight: 700,
            letterSpacing: '0.16em', color: T.orange, textTransform: 'uppercase',
          }}>Counter-signal</span>
          {renderInlineWithWikilinks(signal.counterSignal, onCitationClick)}
        </div>
      )}
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Bottom Line band
// ─────────────────────────────────────────────────────────────────────
function BottomLineBand({ text, onCitationClick }) {
  if (!text) return null
  return (
    <div style={{
      padding: '30px 30px 28px',
      borderBottom: `1px solid ${T.rule}`,
    }}>
      <div style={{
        fontFamily: T.mono, fontSize: 10.5, fontWeight: 600,
        letterSpacing: '0.2em', textTransform: 'uppercase',
        color: T.orange, marginBottom: 14,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        Bottom Line
        <span style={{ flex: 1, height: 1, background: T.rule }} />
      </div>
      <p style={{
        margin: 0,
        fontFamily: T.sans,
        fontSize: 'clamp(18px, 2.1vw, 22px)',
        fontWeight: 500,
        lineHeight: 1.32,
        letterSpacing: '-0.018em',
        color: T.ink,
      }}>
        {renderInlineWithWikilinks(text, onCitationClick)}
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Masthead — brief ID + dateline + confidence chip
// ─────────────────────────────────────────────────────────────────────
function Masthead({ briefNo, asOfDate, confidenceLevel }) {
  // Confidence dot colour
  const confColor =
    confidenceLevel === 'High'   ? T.green :
    confidenceLevel === 'Medium' ? '#CA8A04' :
    confidenceLevel === 'Low'    ? T.orange : T.green

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      padding: '15px 30px',
      borderBottom: `1px solid ${T.rule}`,
      flexWrap: 'wrap',
    }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 9,
        fontFamily: T.mono, fontSize: 10.5, fontWeight: 600,
        letterSpacing: '0.18em', color: T.ink,
      }}>
        <span style={{ width: 8, height: 8, background: T.orange, display: 'inline-block' }} />
        INTELLIGENCE BRIEF
        <span style={{ color: T.mutedSoft, fontWeight: 400, letterSpacing: '0.1em' }}>
          № {briefNo}
        </span>
      </div>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 12,
        fontFamily: T.mono, fontSize: 10.5,
        letterSpacing: '0.08em', color: T.muted,
      }}>
        {asOfDate && <span>AS OF {asOfDate.toUpperCase()}</span>}
        {confidenceLevel && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontFamily: T.mono, fontSize: 10, fontWeight: 600,
            letterSpacing: '0.12em',
            padding: '3px 8px',
            border: `1px solid ${T.border}`,
            color: T.ink,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: confColor, display: 'inline-block' }} />
            {confidenceLevel.toUpperCase()} CONFIDENCE
          </span>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Implication block — dark CTA with orange accent line
// ─────────────────────────────────────────────────────────────────────
function ImplicationBlock({ items, onCitationClick }) {
  if (!items || items.length === 0) return null
  return (
    <section style={{
      position: 'relative',
      background: T.ink,
      color: '#ededed',
      padding: '26px 30px 28px',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 30,
        width: 44, height: 3, background: T.orange,
      }} />
      <div style={{
        fontFamily: T.mono, fontSize: 10.5, fontWeight: 600,
        letterSpacing: '0.2em', textTransform: 'uppercase',
        color: T.orange, marginBottom: 18,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        Scapia Implication
        <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.12)' }} />
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column' }}>
        {items.map((raw, i) => {
          const { owner, main } = extractOwnerAndWindow(raw)
          // Strip leading bold marker "**title** ..." → keep the title bold + the rest plain
          const boldLeadMatch = main.match(/^\*\*([^*]+)\*\*\s*(.*)$/s)
          let titleNode = null
          let restText = main
          if (boldLeadMatch) {
            titleNode = (
              <strong style={{ fontWeight: 700, color: '#fff' }}>
                {renderInlineWithWikilinks(boldLeadMatch[1], onCitationClick, { dark: true })}
              </strong>
            )
            restText = boldLeadMatch[2]
          }
          return (
            <li key={i} style={{
              display: 'flex', gap: 14, padding: '13px 0',
              borderTop: i === 0 ? 'none' : '1px solid rgba(255,255,255,0.08)',
              alignItems: 'baseline',
              paddingTop: i === 0 ? 2 : 13,
            }}>
              <span style={{
                color: T.orange, flex: '0 0 auto', fontWeight: 600,
                fontFamily: T.mono, fontSize: 14.5,
              }}>→</span>
              <span style={{
                fontFamily: T.sans, fontSize: 14.5, lineHeight: 1.55,
                color: '#ededed',
                // No max-width — implication bullets use the full card width
                // like the signal prose, so long actions don't break to a
                // narrow column.
              }}>
                {titleNode}
                {titleNode && restText && ' '}
                {restText && renderInlineWithWikilinks(restText, onCitationClick, { dark: true })}
                {owner && (
                  <span style={{
                    display: 'inline-block', marginLeft: 8,
                    fontFamily: T.mono, fontSize: 9.5, fontWeight: 600,
                    letterSpacing: '0.12em', textTransform: 'uppercase',
                    color: '#ededed',
                    border: '1px solid rgba(255,255,255,0.22)',
                    padding: '1px 6px',
                    verticalAlign: 'middle',
                    whiteSpace: 'nowrap',
                  }}>{owner}</span>
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Footer — Confidence / Perspectives / Blind Spot / Sources
// Tinted mono band; reads as apparatus, not argument.
// ─────────────────────────────────────────────────────────────────────
function FooterMeta({ footer, onCitationClick }) {
  const { confidence, perspectives, blindSpot, sourcesCount } = footer
  if (!confidence && !perspectives && !blindSpot && !sourcesCount) return null

  const perspChips = perspectives
    ? perspectives.split(/[·,]/).map(s => s.trim()).filter(Boolean)
    : []

  // Confidence line splits at "—" into level + because-clause
  const confSplit = confidence.match(/^([A-Za-z]+)\s*[—\-–]\s*([\s\S]+)$/)
  const confLevel = confSplit ? confSplit[1].trim() : confidence
  const confReason = confSplit ? confSplit[2].trim() : ''
  // Strip the level word out of unsplit confidence so it doesn't double up
  const confInlineRest = confSplit ? '' : confidence.replace(/^[A-Za-z]+/, '').trim()

  const cellK = {
    fontFamily: T.mono, fontSize: 9.5, fontWeight: 600,
    letterSpacing: '0.16em', color: T.muted,
    textTransform: 'uppercase', paddingTop: 2,
  }
  const cellV = {
    fontFamily: T.mono, fontSize: 11.5, lineHeight: 1.55,
    letterSpacing: '0.01em', color: '#555',
  }

  return (
    <div style={{ padding: '18px 30px 22px', background: T.ink04 }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '96px 1fr',
        gap: '6px 16px',
        alignItems: 'baseline',
      }}>
        {confidence && (
          <>
            <div style={cellK}>Confidence</div>
            <div style={cellV}>
              <span style={{ color: T.ink, fontWeight: 600 }}>{confLevel}</span>
              {confReason && <> — {renderInlineWithWikilinks(confReason, onCitationClick)}</>}
              {confInlineRest && <> {renderInlineWithWikilinks(confInlineRest, onCitationClick)}</>}
            </div>
          </>
        )}
        {perspChips.length > 0 && (
          <>
            <div style={cellK}>Perspectives</div>
            <div style={cellV}>
              <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                {perspChips.map((p, i) => (
                  <span key={i} style={{
                    border: `1px solid ${T.border}`,
                    background: T.paper,
                    padding: '1px 7px',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    color: '#555',
                  }}>{p}</span>
                ))}
              </span>
            </div>
          </>
        )}
        {blindSpot && (
          <>
            <div style={{ ...cellK, color: T.orange }}>Blind Spot</div>
            <div style={{ ...cellV, color: T.ink }}>
              {renderInlineWithWikilinks(blindSpot, onCitationClick)}
            </div>
          </>
        )}
        {sourcesCount > 0 && (
          <>
            <div style={cellK}>Sources</div>
            <div style={cellV}>{sourcesCount} cited · 10-second scan / 60-second read</div>
          </>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Generate a stable-ish brief number from the query string.
// Just a deterministic 4-digit hash — purely cosmetic.
// ─────────────────────────────────────────────────────────────────────
function briefNumber(seed) {
  let h = 0
  for (let i = 0; i < (seed || '').length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0
  return String(Math.abs(h) % 9000 + 1000).padStart(4, '0')
}

// ─────────────────────────────────────────────────────────────────────
// Main AnswerCard
// ─────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────
// NoteCard — small chat-bubble shape for greetings, meta, out-of-scope.
// No Brief chrome, no Confidence/Blind Spot — just a friendly card.
// ─────────────────────────────────────────────────────────────────────
function NoteCard({ answer, tone, onCitationClick }) {
  // tone affects the small accent stripe colour at the top
  const accent = tone === 'redirect' ? T.orange : T.ink
  return (
    <article style={{
      background: T.paper,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(17,17,17,0.03), 0 4px 14px rgba(17,17,17,0.035)',
      fontFamily: T.sans,
      maxWidth: 720,
    }}>
      <div style={{ height: 3, background: accent }} />
      <div style={{ padding: '20px 24px', fontSize: 14.5, lineHeight: 1.6, color: T.bodyInk }}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            p: ({ children }) => (
              <p style={{ margin: '0 0 10px', lineHeight: 1.6 }}>{children}</p>
            ),
            strong: ({ children }) => (
              <strong style={{ color: T.ink, fontWeight: 700 }}>{children}</strong>
            ),
            ul: ({ children }) => (
              <ul style={{ margin: '6px 0 12px', paddingLeft: 22 }}>{children}</ul>
            ),
            li: ({ children }) => (
              <li style={{ marginBottom: 4 }}>{children}</li>
            ),
            em: ({ children }) => (
              <em style={{ color: T.muted, fontStyle: 'italic' }}>{children}</em>
            ),
          }}
        >
          {answer}
        </ReactMarkdown>
      </div>
    </article>
  )
}

// ─────────────────────────────────────────────────────────────────────
// ElaborationCard — for follow-up clarifications. Plain prose card with
// inline wikilink pills, no Brief masthead / Confidence / Blind Spot.
// Signals it's a follow-up via a small "Elaboration" eyebrow label.
// ─────────────────────────────────────────────────────────────────────
function ElaborationCard({ answer, onCitationClick }) {
  // Convert wikilinks inline same as ProseWithLinks does
  const paragraphs = (answer || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
  return (
    <article style={{
      background: T.paper,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(17,17,17,0.03), 0 4px 14px rgba(17,17,17,0.035)',
      fontFamily: T.sans,
    }}>
      <div style={{
        padding: '14px 28px 10px',
        borderBottom: `1px solid ${T.rule}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          fontFamily: T.sans, fontSize: 10.5, fontWeight: 600,
          letterSpacing: '0.18em', textTransform: 'uppercase',
          color: T.orange,
        }}>
          Elaboration
        </div>
        <span style={{ flex: 1, height: 1, background: T.rule }} />
      </div>
      <div style={{ padding: '18px 28px 22px' }}>
        {paragraphs.map((p, i) => (
          <p key={i} style={{
            margin: i === 0 ? 0 : '12px 0 0',
            fontSize: 14.5, lineHeight: 1.65, color: T.bodyInk,
          }}>
            {renderInlineWithWikilinks(p, onCitationClick)}
          </p>
        ))}
      </div>
    </article>
  )
}

export default function AnswerCard({ answer, query, format, onCitationClick }) {
  const [copied, setCopied] = useState(false)
  const [feedback, setFeedback] = useState(null)

  // ── Format-based routing — backend tells us what shape the response is ──
  // "note"        → small chat-bubble card (greetings, meta, redirect)
  // "elaboration" → plain prose card with citations (follow-up clarifications)
  // "brief" / undefined → full IntelligenceBrief renderer (default)
  if (format === 'note') {
    // Parse the answer for a tone hint passed alongside (defaults to greeting)
    return <NoteCard answer={answer || ''} tone={undefined} onCitationClick={onCitationClick} />
  }
  if (format === 'elaboration') {
    return <ElaborationCard answer={answer || ''} onCitationClick={onCitationClick} />
  }

  const brief = parseBrief(answer || '')
  // Orphan charts — chart blocks that lived between/outside signal sections.
  // Signal-internal charts render inside their SignalSection.
  const orphanCharts = brief.charts || []

  const handleCopy = () => {
    navigator.clipboard.writeText(answer || '').then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Fallback for a malformed/empty answer
  if (!brief.bottomLine && brief.signals.length === 0 && brief.implication.items.length === 0) {
    return (
      <div style={{
        padding: '24px 30px',
        background: T.paper,
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        fontFamily: T.sans, fontSize: 14, color: T.bodyInk,
      }}>
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer || '_No answer yet._'}</ReactMarkdown>
      </div>
    )
  }

  return (
    <article style={{
      background: T.paper,
      border: `1px solid ${T.border}`,
      borderRadius: 14,
      overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(17,17,17,0.03), 0 10px 30px rgba(17,17,17,0.045)',
      fontFamily: T.sans,
    }}>
      <Masthead
        briefNo={briefNumber(query || brief.bottomLine)}
        asOfDate={brief.asOfDate}
        confidenceLevel={brief.confidenceLevel}
      />

      <BottomLineBand text={brief.bottomLine} onCitationClick={onCitationClick} />

      {brief.signals.length > 0 && (
        <div style={{ padding: '6px 30px 4px' }}>
          {brief.signals.map((sig, i) => (
            <SignalSection
              key={i}
              signal={sig}
              index={i}
              total={brief.signals.length}
              onCitationClick={onCitationClick}
            />
          ))}
        </div>
      )}

      {/* Orphan charts — rendered after signals, before implication */}
      {orphanCharts.length > 0 && (
        <div style={{ padding: '0 30px 22px' }}>
          {orphanCharts.map((raw, i) => (
            <div key={i} style={{ marginBottom: i === orphanCharts.length - 1 ? 0 : 16 }}>
              <ChartBlock raw={raw} />
            </div>
          ))}
        </div>
      )}

      <ImplicationBlock
        items={brief.implication.items}
        onCitationClick={onCitationClick}
      />

      <FooterMeta footer={brief.footer} onCitationClick={onCitationClick} />

      {/* Action row — copy + thumbs feedback (Save-to-Wiki removed earlier) */}
      <div style={{
        padding: '14px 30px 16px',
        borderTop: `1px solid ${T.rule}`,
        display: 'flex', alignItems: 'center', gap: 8,
        background: T.paper,
      }}>
        <button
          onClick={handleCopy}
          style={{
            all: 'unset',
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 11px',
            fontFamily: T.mono, fontSize: 11, fontWeight: 500,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: copied ? T.green : T.muted,
            border: `1px solid ${T.border}`,
            cursor: 'pointer',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
        {[['up', T.green], ['down', T.orange]].map(([dir, color]) => (
          <button
            key={dir}
            onClick={() => setFeedback(feedback === dir ? null : dir)}
            aria-label={dir === 'up' ? 'Useful' : 'Not useful'}
            style={{
              all: 'unset', width: 28, height: 28,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${T.border}`,
              color: feedback === dir ? color : T.mutedSoft,
              cursor: 'pointer',
              fontFamily: T.mono, fontSize: 13,
            }}
          >
            {dir === 'up' ? '▲' : '▼'}
          </button>
        ))}
      </div>
    </article>
  )
}
