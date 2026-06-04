import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'

// ─────────────────────────────────────────────────────────────────────
// Shared wikilink pill — used by AnswerCard, WikiPagePanel, IntelCard.
// Sharp 1px border, 5px category dot at the front, hover → orange.
// Single typeface (Lexend Deca) — uppercase + letter-spacing handles
// the "instrument" feel without a second font.
//
// Categories (path prefix → dot colour):
//   ink            entities, partners, events, comparisons
//   orange         regulatory, market-signals
//   muted-soft     concepts, sources, anything else
//
// Click behaviour:
//   - If `onClick` is passed, calls it with the path (used by AnswerCard
//     to open the WikiPagePanel side panel)
//   - Otherwise navigates to /vault?open=<path> (used by Vault + Intel
//     Cards where there's no side-panel handler in scope)
// ─────────────────────────────────────────────────────────────────────

const T = {
  ink:        '#111111',
  orange:     '#ce3e00',
  border:     '#E8E8E8',
  mutedSoft:  '#AAAAAA',
  ink04:      'rgba(17,17,17,0.04)',
  orange06:   'rgba(206,62,0,0.06)',
  sans:       '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const CAT_COLOR = {
  entities:         T.ink,
  partners:         T.ink,
  events:           T.ink,
  comparisons:      T.ink,
  regulatory:       T.orange,
  'market-signals': T.orange,
  concepts:         T.mutedSoft,
  sources:          T.mutedSoft,
}

export default function WikiPill({ path, onClick, dark = false }) {
  const [hover, setHover] = useState(false)
  const navigate = useNavigate()

  const handleClick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (onClick) onClick(path)
    else navigate('/vault?open=' + encodeURIComponent(path))
  }

  // Dark variant — for the dark Implication block. Pills become inline
  // underlined links so they don't fight the inverted ground.
  if (dark) {
    return (
      <a
        onClick={handleClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        href="#"
        style={{
          color: hover ? T.orange : '#fff',
          borderBottom: `1px solid ${hover ? T.orange : 'rgba(255,255,255,0.4)'}`,
          textDecoration: 'none',
          fontWeight: 500,
          fontFamily: T.sans,
          fontSize: '12.5px',
          whiteSpace: 'nowrap',
          cursor: 'pointer',
          transition: 'color .14s, border-color .14s',
        }}
      >{path}</a>
    )
  }

  const prefix = (path.split('/')[0] || '').toLowerCase()
  const catColor = CAT_COLOR[prefix] || T.mutedSoft

  return (
    <a
      onClick={handleClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      href="#"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontFamily: T.sans,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '-0.005em',
        color: hover ? T.orange : T.ink,
        background: hover ? T.orange06 : T.ink04,
        border: `1px solid ${hover ? T.orange : T.border}`,
        borderRadius: 3,
        padding: '1px 7px 1px 6px',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: 'border-color .14s, color .14s, background .14s',
        whiteSpace: 'nowrap',
        lineHeight: 1.5,
        verticalAlign: 'baseline',
      }}
    >
      <span style={{
        width: 5, height: 5, display: 'inline-block', flex: '0 0 auto',
        background: catColor,
      }} />
      {path}
    </a>
  )
}

// ─────────────────────────────────────────────────────────────────────
// Render a string containing inline [[wikilinks]] as a mix of plain text
// and WikiPill components. Pass `onClick` to override the default
// /vault?open=... navigation.
// ─────────────────────────────────────────────────────────────────────
const WIKI_REGEX = /\[\[([^\]]+)\]\]/g

export function renderInlineWithWikilinks(text, onClick, { dark = false } = {}) {
  if (!text) return null
  WIKI_REGEX.lastIndex = 0
  const out = []
  let last = 0, m, key = 0
  while ((m = WIKI_REGEX.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<WikiPill key={`wp-${key++}`} path={m[1]} onClick={onClick} dark={dark} />)
    last = WIKI_REGEX.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
