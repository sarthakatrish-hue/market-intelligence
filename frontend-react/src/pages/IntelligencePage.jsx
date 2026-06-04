import React, { useState, useEffect, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { submitQuery as apiSubmitQuery } from '../api.js'
import AnswerCard from '../components/AnswerCard.jsx'
import WikiPagePanel from '../components/WikiPagePanel.jsx'

// ── Thread storage (localStorage) ─────────────────────────────────────────
// Threads are personal, per-device, ephemeral by design. NOT written to the
// wiki — the wiki stays purely from ingested raw/ sources. Threads are the
// Scapia-interpretation layer over that data.
const THREADS_KEY = 'mi_query_threads'
const MAX_THREADS = 50

function loadThreads() {
  try {
    const raw = localStorage.getItem(THREADS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function saveThreads(threads) {
  try {
    localStorage.setItem(THREADS_KEY, JSON.stringify(threads.slice(0, MAX_THREADS)))
  } catch { /* quota — silently drop */ }
}

function newThreadId() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8)
}

function threadTitle(thread) {
  return thread?.turns?.[0]?.question || 'Untitled'
}

// ── Tokens ────────────────────────────────────────────────────────────────
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

// Inject .no-scrollbar once
if (typeof document !== 'undefined' && !document.getElementById('ip-no-scrollbar')) {
  const s = document.createElement('style')
  s.id = 'ip-no-scrollbar'
  s.textContent = '.no-scrollbar::-webkit-scrollbar{display:none}.no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}'
  document.head.appendChild(s)
}

// ── Helpers ───────────────────────────────────────────────────────────────
const getTitle = (item) => item?.title || item?.path || ''
const getPath  = (item) => item?.path  || item?.title || ''

// ── Icons ─────────────────────────────────────────────────────────────────
const Stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'square' }

const IconSearch = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" {...Stroke}>
    <circle cx="7" cy="7" r="4.5" />
    <line x1="10.5" y1="10.5" x2="14" y2="14" />
  </svg>
)
const IconPlus = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
    <line x1="8" y1="2.5" x2="8" y2="13.5" />
    <line x1="2.5" y1="8" x2="13.5" y2="8" />
  </svg>
)
const IconArrowRight = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square">
    <line x1="2.5" y1="8" x2="13" y2="8" />
    <polyline points="9,4 13,8 9,12" />
  </svg>
)

// ── Sub-components ────────────────────────────────────────────────────────
function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
      <span style={{ fontFamily: 'sans-serif', fontWeight: 700, fontSize: 28, letterSpacing: '-0.02em', color: BRAND.white, lineHeight: 1 }}>scapia</span>
      <span style={{ fontFamily: BRAND.font, fontWeight: 600, fontSize: 11, letterSpacing: '0.22em', color: BRAND.orange, textTransform: 'uppercase', lineHeight: 1 }}>Intelligence</span>
    </div>
  )
}

function SectionLabel({ index, title, hint }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 12,
      marginBottom: 18, paddingBottom: 12,
      borderBottom: `1px solid ${BRAND.border}`,
    }}>
      {index && <span style={{ fontFamily: BRAND.font, fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', color: BRAND.orange }}>{index}</span>}
      <span style={{ fontFamily: BRAND.font, fontSize: 13, fontWeight: 500, color: BRAND.dark }}>{title}</span>
      {hint && <span style={{ marginLeft: 'auto', fontFamily: BRAND.font, fontSize: 12, fontWeight: 400, color: BRAND.muted }}>{hint}</span>}
    </div>
  )
}

function PastQueryRow({ label, meta, active, onClick, onDelete }) {
  const [hover, setHover] = useState(false)
  const bg    = active ? BRAND.orange : hover ? 'rgba(206,62,0,0.20)' : 'transparent'
  const color = active ? BRAND.white  : hover ? BRAND.white : 'rgba(255,255,255,0.52)'
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative', boxSizing: 'border-box', width: '100%',
        background: bg, transition: 'background .12s',
      }}
    >
      <button
        onClick={onClick}
        title={label}
        style={{
          all: 'unset', boxSizing: 'border-box', display: 'block', width: '100%',
          padding: '7px 28px 7px 12px', fontFamily: BRAND.font, fontSize: '0.82rem',
          fontWeight: active ? 500 : 400, textAlign: 'left', color,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          cursor: 'pointer',
        }}
      >
        {label}
        {meta && (
          <span style={{
            marginLeft: 8, fontSize: '0.66rem', fontWeight: 500,
            opacity: 0.6, letterSpacing: '0.02em',
          }}>· {meta}</span>
        )}
      </button>
      {onDelete && hover && (
        <button
          onClick={onDelete}
          aria-label="Delete thread"
          title="Delete thread"
          style={{
            all: 'unset', position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
            width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color, opacity: 0.7, cursor: 'pointer', fontSize: 14, lineHeight: 1,
          }}
        >×</button>
      )}
    </div>
  )
}

function SuggestionPill({ text, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
        fontFamily: BRAND.font, fontSize: 13, fontWeight: 400,
        color: hover ? BRAND.orange : BRAND.dark,
        background: BRAND.white,
        border: `1px solid ${hover ? BRAND.orange : BRAND.border}`,
        padding: '10px 14px', textAlign: 'left',
        transition: 'border-color .15s, color .15s, transform .15s',
        transform: hover ? 'translateY(-1px)' : 'none',
        lineHeight: 1.4,
      }}
    >{text}</button>
  )
}

function QueryBubble({ text }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
      <div style={{
        maxWidth: '70%', background: BRAND.orange, color: BRAND.white,
        padding: '14px 18px', borderRadius: '18px 18px 4px 18px',
        fontFamily: BRAND.font, fontSize: 14.5, fontWeight: 400, lineHeight: 1.45,
        letterSpacing: '-0.005em',
      }}>{text}</div>
    </div>
  )
}

const SUGGESTIONS = [
  "What are Axis Atlas's recent moves on reward devaluation?",
  "Summarise RBI co-brand card rules and Scapia's current posture.",
  "Which travel OTAs are moving into fintech?",
]

// ── Empty state ───────────────────────────────────────────────────────────
function EmptyState({ onSuggest }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '40px 24px',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        <SectionLabel index="02" title="Intelligence" />
        <h1 style={{
          margin: 0, fontFamily: BRAND.font, fontWeight: 600,
          fontSize: 34, letterSpacing: '-0.02em', lineHeight: 1.1, color: BRAND.dark,
        }}>What do you want to know?</h1>
        <p style={{
          margin: '14px 0 28px', fontFamily: BRAND.font, fontSize: 15,
          color: BRAND.muted, lineHeight: 1.5,
        }}>
          Ask about competitors, regulations, and market signals across Fintech and Travel.
        </p>
        <div style={{
          fontFamily: BRAND.font, fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', color: BRAND.muted, textTransform: 'uppercase',
          marginBottom: 10,
        }}>Try one</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SUGGESTIONS.map((s) => (
            <SuggestionPill key={s} text={s} onClick={() => onSuggest(s)} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Loading indicator ─────────────────────────────────────────────────────
// Mirrors the Brief card masthead — orange pulsing square + "INTELLIGENCE
// BRIEF" + climbing timer + 4 timed stages. The wait pre-echoes the answer
// so the card feels like it's materializing, not buffering. Stages are
// PRESUMPTIVE — driven by elapsed-time on the frontend (the backend doesn't
// emit progress events yet). The final stage holds indefinitely on an
// indeterminate strip until the answer returns — honest, since we can't
// know exactly when Claude finishes.

const LOADER_STAGES = [
  { label: 'ASSEMBLING CONTEXT' },
  { label: 'READING WIKI', chips: ['entities', 'regulatory', 'events'] },
  { label: 'SYNTHESIZING SIGNALS' },
  { label: 'COMPOSING BRIEF' },
]
const LOADER_MASTHEAD = ['STARTING', 'READING', 'SYNTHESIZING', 'COMPOSING']
const LOADER_STATUS_LINE = [
  'Assembling wiki context…',
  'Reading across Fintech & Travel…',
  'Synthesizing signals from the sources…',
  'Composing the brief — almost there…',
]

function loaderStageOf(t) {
  if (t < 2)  return 0
  if (t < 8)  return 1
  if (t < 15) return 2
  return 3
}
function loaderFmt(t) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return m + ':' + String(s).padStart(2, '0')
}

// Inject loader keyframes once
if (typeof document !== 'undefined' && !document.getElementById('mi-loader-css')) {
  const s = document.createElement('style')
  s.id = 'mi-loader-css'
  s.textContent = `
    @keyframes mi-pulseSq {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.78); }
    }
    @keyframes mi-chipScan {
      0%, 100% { opacity: 0.45; color: #888; border-color: #E8E8E8; background: rgba(17,17,17,0.04); }
      45% { opacity: 1; color: #ce3e00; border-color: #ce3e00; background: rgba(206,62,0,0.06); }
    }
    @keyframes mi-indet {
      0% { left: -40%; }
      100% { left: 110%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .mi-anim { animation: none !important; }
      .mi-fill-active { width: 55% !important; left: 0 !important; }
    }
  `
  document.head.appendChild(s)
}

function StageMarker({ state }) {
  // state: 'done' | 'active' | 'pending'
  const base = {
    width: 9, height: 9, marginTop: 4, display: 'inline-block',
    borderStyle: 'solid', borderWidth: 1.5,
    transition: 'background .2s, border-color .2s',
  }
  if (state === 'done') {
    return <span style={{ ...base, background: BRAND.orange, borderColor: BRAND.orange }} />
  }
  if (state === 'active') {
    return <span className="mi-anim" style={{
      ...base, background: BRAND.orange, borderColor: BRAND.orange,
      animation: 'mi-pulseSq 1.2s ease-in-out infinite',
    }} />
  }
  return <span style={{ ...base, background: 'transparent', borderColor: '#ECECEC' }} />
}

function StageProgress({ state }) {
  const track = {
    marginTop: 11, height: 2, width: '100%',
    background: '#ECECEC', overflow: 'hidden', position: 'relative',
    opacity: state === 'pending' ? 0 : 1,
  }
  if (state === 'done') {
    return (
      <div style={track}>
        <span style={{ position: 'absolute', top: 0, left: 0, height: '100%', width: '100%', background: BRAND.orange, opacity: 0.32 }} />
      </div>
    )
  }
  if (state === 'active') {
    return (
      <div style={track}>
        <span className="mi-anim mi-fill-active" style={{
          position: 'absolute', top: 0, left: '-40%', height: '100%',
          width: '36%', background: BRAND.orange, opacity: 1,
          animation: 'mi-indet 1.5s cubic-bezier(.65,.05,.36,1) infinite',
        }} />
      </div>
    )
  }
  return <div style={track} />
}

function StageChip({ scan, delay }) {
  const base = {
    fontFamily: BRAND.font, fontSize: 10.5, letterSpacing: '0.02em',
    color: BRAND.muted, background: 'rgba(17,17,17,0.04)',
    border: `1px solid ${BRAND.border}`, padding: '1px 7px', borderRadius: 3,
    opacity: 0.5,
  }
  if (scan) {
    return null  // children will set animation
  }
  return base
}

function ThinkingBubble() {
  const [elapsed, setElapsed] = useState(0)
  const startRef = useRef(Date.now())

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed((Date.now() - startRef.current) / 1000)
    }, 200)
    return () => clearInterval(id)
  }, [])

  const active = loaderStageOf(elapsed)
  const cls = (i) => i < active ? 'done' : i === active ? 'active' : 'pending'

  return (
    <div style={{ marginBottom: 24 }}>
      <article style={{
        background: BRAND.white,
        border: `1px solid ${BRAND.border}`,
        borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 1px 2px rgba(17,17,17,0.03), 0 6px 18px rgba(17,17,17,0.035)',
        fontFamily: BRAND.font,
      }}>
        {/* Masthead */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, padding: '15px 28px', borderBottom: `1px solid #ECECEC`,
          flexWrap: 'wrap',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 9,
            fontFamily: BRAND.font, fontSize: 10.5, fontWeight: 600,
            letterSpacing: '0.18em', color: BRAND.dark,
          }}>
            <span className="mi-anim" style={{
              width: 8, height: 8, background: BRAND.orange, display: 'inline-block',
              animation: 'mi-pulseSq 1.4s ease-in-out infinite',
            }} />
            INTELLIGENCE BRIEF
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            fontFamily: BRAND.font, fontSize: 10.5,
            letterSpacing: '0.1em', color: BRAND.muted,
          }}>
            <span style={{
              color: BRAND.dark, fontWeight: 500,
              fontVariantNumeric: 'tabular-nums', minWidth: 30,
            }}>{loaderFmt(elapsed)}</span>
            <span style={{ color: BRAND.mutedSoft }}>·</span>
            <span style={{
              fontWeight: 600, letterSpacing: '0.14em', color: BRAND.orange,
            }}>{LOADER_MASTHEAD[active]}</span>
          </div>
        </div>

        {/* Stages */}
        <div style={{ padding: '22px 28px 6px', display: 'flex', flexDirection: 'column' }}>
          {LOADER_STAGES.map((st, i) => {
            const state = cls(i)
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '16px 1fr', gap: 14,
                padding: '13px 0', alignItems: 'start',
                borderTop: i === 0 ? 'none' : `1px solid #ECECEC`,
                paddingTop: i === 0 ? 2 : 13,
              }}>
                <StageMarker state={state} />
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontFamily: BRAND.font, fontSize: 12, fontWeight: 500,
                    letterSpacing: '0.14em', textTransform: 'uppercase', lineHeight: 1,
                    color: state === 'done' ? BRAND.muted
                         : state === 'active' ? BRAND.dark
                         : BRAND.mutedSoft,
                    transition: 'color .2s',
                  }}>
                    {st.label}
                  </div>
                  {st.chips && state !== 'pending' && (
                    <div style={{ marginTop: 9, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {st.chips.map((c, ci) => (
                        <span
                          key={ci}
                          className={state === 'active' ? 'mi-anim' : ''}
                          style={{
                            fontFamily: BRAND.font, fontSize: 10.5,
                            letterSpacing: '0.02em', color: BRAND.muted,
                            background: 'rgba(17,17,17,0.04)',
                            border: `1px solid ${BRAND.border}`,
                            padding: '1px 7px', borderRadius: 3,
                            opacity: 0.5,
                            ...(state === 'active' ? {
                              animation: `mi-chipScan 2.1s ease-in-out ${ci * 0.35}s infinite`,
                            } : {}),
                          }}
                        >{c}</span>
                      ))}
                    </div>
                  )}
                  <StageProgress state={state} />
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 16, padding: '15px 28px 18px', marginTop: 6,
          borderTop: `1px solid #ECECEC`,
          background: 'rgba(17,17,17,0.04)', flexWrap: 'wrap',
        }}>
          <div style={{
            fontFamily: BRAND.font, fontSize: 13.5, fontStyle: 'italic',
            color: '#555', letterSpacing: '-0.005em',
          }}>
            {LOADER_STATUS_LINE[active]}
          </div>
          <div style={{
            fontFamily: BRAND.font, fontSize: 10, fontWeight: 600,
            letterSpacing: '0.14em', color: BRAND.muted, whiteSpace: 'nowrap',
          }}>
            EST. 15–30S
          </div>
        </div>
      </article>
    </div>
  )
}

// ── Answer view (renders all turns of an active thread) ───────────────────
// A turn with `answer === null` is a pending/in-flight question — render the
// QueryBubble immediately and show the loader in its answer slot.
function AnswerView({ turns, onCitationClick }) {
  return (
    <div style={{ width: '100%', maxWidth: 1100, margin: '0 auto', padding: '32px 40px 24px' }}>
      {turns.map((turn, i) => {
        const isPending = turn.answer === null || turn.answer === undefined
        // Brief responses get the heavy card wrapper. Notes / elaborations
        // are lighter shapes — they bring their own card chrome from
        // AnswerCard, so we skip the outer wrapper for them.
        const fmt = turn.format || 'brief'
        const wrapperStyle = fmt === 'brief'
          ? {
              background: BRAND.white,
              border: `1px solid ${BRAND.border}`,
              borderRadius: 16,
              boxShadow: '0 1px 2px rgba(17,17,17,0.03), 0 8px 24px rgba(17,17,17,0.04)',
              overflow: 'hidden',
              marginBottom: i === turns.length - 1 ? 0 : 24,
            }
          : { marginBottom: i === turns.length - 1 ? 0 : 24 }
        return (
          <React.Fragment key={i}>
            <QueryBubble text={turn.question} />
            {isPending ? (
              <ThinkingBubble />
            ) : (
              <div style={wrapperStyle}>
                <AnswerCard
                  answer={turn.answer}
                  query={turn.question}
                  format={fmt}
                  onCitationClick={onCitationClick}
                />
              </div>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function IntelligencePage() {
  const navigate  = useNavigate()
  const inputRef  = useRef(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const [threads, setThreads] = useState(() => loadThreads())
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [sidebarFilter, setSidebarFilter] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [wikiPath, setWikiPath] = useState(null)

  const activeThread = activeThreadId
    ? threads.find((t) => t.id === activeThreadId)
    : null
  const turns = activeThread?.turns || []
  const isAnswerState = turns.length > 0 || loading

  // Auto-submit from ?q= URL param OR open a thread from ?thread= URL param.
  // (Both used by HomePage to deep-link from its Intelligence hero / Recent
  // Queries list.) useRef guard handles React StrictMode double-mount in dev.
  const urlActionDone = useRef(false)
  useEffect(() => {
    if (urlActionDone.current) return
    const q = searchParams.get('q')
    const threadId = searchParams.get('thread')
    if (q) {
      urlActionDone.current = true
      setSearchParams({}, { replace: true })
      handleSubmit(q)
    } else if (threadId) {
      urlActionDone.current = true
      setSearchParams({}, { replace: true })
      selectThread(threadId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Global event bus: newQuery resets to fresh state; loadThread opens a thread
  useEffect(() => {
    const onNew = () => resetToEmpty()
    const onLoad = (e) => {
      const id = e?.detail?.threadId
      if (id) selectThread(id)
    }
    window.addEventListener('newQuery', onNew)
    window.addEventListener('loadThread', onLoad)
    return () => {
      window.removeEventListener('newQuery', onNew)
      window.removeEventListener('loadThread', onLoad)
    }
  }, [])

  function resetToEmpty() {
    setActiveThreadId(null)
    setDraft('')
    setLoading(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  function selectThread(threadId) {
    setActiveThreadId(threadId)
    setDraft('')
    setLoading(false)
  }

  async function handleSubmit(text) {
    const q = (text ?? draft).trim()
    if (!q) return
    setDraft('')
    setLoading(true)

    // Determine the target thread:
    //   - If there's an active thread, this question is a follow-up → append to it
    //   - Otherwise, create a new thread
    let targetThread = activeThread
    if (!targetThread) {
      targetThread = {
        id: newThreadId(),
        turns: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      setActiveThreadId(targetThread.id)
    }

    // Build thread_history for backend (previous COMPLETED turns only)
    const threadHistory = targetThread.turns
      .filter((t) => t.answer)
      .map((t) => ({ question: t.question, answer: t.answer }))

    // ── Push a pending turn IMMEDIATELY so the user's question shows up ──
    // The pending turn has `answer: null`; AnswerView renders the loader in
    // its answer slot until we replace null with the real answer below.
    const pendingTs = Date.now()
    const pendingTurn = { question: q, answer: null, ts: pendingTs }
    const threadWithPending = {
      ...targetThread,
      turns: [...targetThread.turns, pendingTurn],
      updatedAt: pendingTs,
    }
    setThreads((prev) => {
      const others = prev.filter((t) => t.id !== threadWithPending.id)
      const next = [threadWithPending, ...others]
      // Don't persist the pending state to localStorage — only the completed
      // version. (saveThreads runs once the answer lands.)
      return next
    })

    // Helper to finalize the thread once we have an answer (or error).
    // `format` is one of: "brief" (default) | "elaboration" | "note"
    // — backend tells us which renderer to use so non-Brief responses
    // (greetings, meta, follow-ups) don't get wrapped in IntelligenceBrief.
    const finalize = (finalAnswer, finalFormat = 'brief') => {
      const finalizedThread = {
        ...threadWithPending,
        turns: threadWithPending.turns.map((t) =>
          t.ts === pendingTs ? { ...t, answer: finalAnswer, format: finalFormat } : t
        ),
        updatedAt: Date.now(),
      }
      setThreads((prev) => {
        const others = prev.filter((t) => t.id !== finalizedThread.id)
        const next = [finalizedThread, ...others]
        saveThreads(next)
        return next
      })
      window.dispatchEvent(new CustomEvent('mi_threads_updated'))
    }

    try {
      const data = await apiSubmitQuery(q, threadHistory)
      finalize(data.answer || '_No answer returned._', data.format || 'brief')
    } catch (err) {
      finalize(`**Error:** ${err.message}`, 'note')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit() }
  }

  function handleNewQuery() {
    window.dispatchEvent(new CustomEvent('newQuery'))
    resetToEmpty()
  }

  function handleDeleteThread(id, e) {
    if (e) { e.stopPropagation(); e.preventDefault() }
    setThreads((prev) => {
      const next = prev.filter((t) => t.id !== id)
      saveThreads(next)
      return next
    })
    if (activeThreadId === id) resetToEmpty()
  }

  // Sorted by most recent activity
  const sortedThreads = [...threads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  const filteredThreads = sortedThreads.filter((t) => {
    if (!sidebarFilter) return true
    return threadTitle(t).toLowerCase().includes(sidebarFilter.toLowerCase())
  })

  return (
    <div style={{
      display: 'flex', height: '100%', width: '100%',
      fontFamily: BRAND.font, color: BRAND.dark, background: BRAND.bg,
      overflow: 'hidden',
    }}>

      {/* ── Left sidebar ─────────────────────────────────────────────── */}
      <aside style={{
        width: 240, flex: '0 0 240px',
        background: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', height: '100%',
      }}>
        <div
          onClick={() => navigate('/')}
          style={{ padding: '22px 18px 14px', cursor: 'pointer' }}
        >
          <Wordmark />
        </div>

        <div style={{ padding: '0 14px 10px' }}>
          <div style={{
            position: 'relative', display: 'flex', alignItems: 'center',
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.10)',
            padding: '7px 10px 7px 30px',
          }}>
            <span style={{ position: 'absolute', left: 10, color: 'rgba(255,255,255,0.38)', display: 'inline-flex' }}>
              <IconSearch />
            </span>
            <input
              type="text"
              value={sidebarFilter}
              onChange={(e) => setSidebarFilter(e.target.value)}
              placeholder="Search queries..."
              style={{ all: 'unset', flex: 1, fontFamily: BRAND.font, fontSize: 12.5, color: BRAND.white }}
            />
          </div>
        </div>

        <div style={{ padding: '0 14px 16px' }}>
          <button
            onClick={handleNewQuery}
            style={{
              all: 'unset', boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '9px 12px',
              background: BRAND.orange, color: BRAND.white,
              fontFamily: BRAND.font, fontWeight: 500, fontSize: 13,
              cursor: 'pointer', textAlign: 'center', transition: 'filter .15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(1.08)')}
            onMouseLeave={(e) => (e.currentTarget.style.filter = 'none')}
          >
            <IconPlus />
            <span>New Query</span>
          </button>
        </div>

        <div style={{
          padding: '4px 18px 8px',
          fontFamily: BRAND.font, fontSize: 10, fontWeight: 600,
          letterSpacing: '0.2em', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase',
        }}>
          Past queries
        </div>

        <div className="no-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '0 6px 12px' }}>
          {filteredThreads.length === 0 && (
            <div style={{ padding: '8px 12px', fontFamily: BRAND.font, fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>
              No past queries yet.
            </div>
          )}
          {filteredThreads.map((thread) => (
            <PastQueryRow
              key={thread.id}
              label={threadTitle(thread)}
              meta={thread.turns.length > 1 ? `${thread.turns.length} turns` : null}
              active={activeThreadId === thread.id}
              onClick={() => selectThread(thread.id)}
              onDelete={(e) => handleDeleteThread(thread.id, e)}
            />
          ))}
        </div>
      </aside>

      {/* ── Main area ────────────────────────────────────────────────── */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        height: '100%', background: BRAND.bg, overflow: 'hidden', minWidth: 0,
      }}>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {isAnswerState ? (
            <AnswerView
              turns={turns}
              onCitationClick={(path) => setWikiPath(path)}
            />
          ) : (
            <EmptyState onSuggest={(t) => handleSubmit(t)} />
          )}
        </div>

        {/* Input bar */}
        <div style={{
          background: BRAND.white,
          borderTop: `1px solid ${BRAND.border}`,
          padding: '16px 24px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center',
            background: BRAND.white, border: `1px solid ${BRAND.border}`,
            borderRadius: 12, padding: '4px 4px 4px 14px',
          }}>
            <input
              ref={inputRef}
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about competitors, regulations, market signals…"
              style={{ all: 'unset', flex: 1, padding: '10px 0', fontFamily: BRAND.font, fontSize: 14, color: BRAND.dark }}
            />
            <button
              onClick={() => handleSubmit()}
              aria-label="Send"
              style={{
                all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
                width: 34, height: 34,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: draft.trim() ? BRAND.orange : '#AAAAAA',
                transition: 'color .15s, transform .15s',
              }}
              onMouseEnter={(e) => { if (draft.trim()) e.currentTarget.style.transform = 'translateX(2px)' }}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'none')}
            >
              <IconArrowRight />
            </button>
          </div>
          <div style={{ marginTop: 8, fontFamily: BRAND.font, fontSize: 11, color: '#AAAAAA' }}>
            Press Enter to send · Shift+Enter for new line
          </div>
        </div>
      </main>

      {/* Wiki page slide-in panel */}
      {wikiPath && (
        <WikiPagePanel path={wikiPath} onClose={() => setWikiPath(null)} />
      )}
    </div>
  )
}
