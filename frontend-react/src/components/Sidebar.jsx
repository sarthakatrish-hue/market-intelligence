import React, { useState, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { fetchPages } from '../api.js'

const NavItem = ({ to, icon, label }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
        isActive ? 'font-medium' : 'hover:bg-white/5'
      }`
    }
    style={({ isActive }) => ({
      backgroundColor: isActive ? 'rgba(206,62,0,0.12)' : 'transparent',
      color: isActive ? '#ce3e00' : '#CCCCCC',
    })}
  >
    <span className="text-base leading-none">{icon}</span>
    <span>{label}</span>
  </NavLink>
)

// Read query threads from localStorage. Kept in sync with IntelligencePage's
// thread storage — no API call needed. Past queries are personal/per-device.
const THREADS_KEY = 'mi_query_threads'
function loadThreads() {
  try {
    const raw = localStorage.getItem(THREADS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

export default function Sidebar() {
  const [searchQuery, setSearchQuery] = useState('')
  const [threads, setThreads] = useState(() => loadThreads())
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [hoveredIdx, setHoveredIdx] = useState(null)
  const navigate = useNavigate()

  // Refresh on storage changes (other tabs) and on focus
  useEffect(() => {
    const refresh = () => setThreads(loadThreads())
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
  const filtered = sorted.filter((t) => {
    const title = t?.turns?.[0]?.question || ''
    return title.toLowerCase().includes(searchQuery.toLowerCase())
  }).slice(0, 20)

  const getTitle = (t) => t?.turns?.[0]?.question || 'Untitled'

  useEffect(() => {
    const handleNewQuery = () => setActiveThreadId(null)
    window.addEventListener('newQuery', handleNewQuery)
    return () => window.removeEventListener('newQuery', handleNewQuery)
  }, [])

  const handleNewQuery = () => {
    setActiveThreadId(null)
    navigate('/intelligence')
    window.dispatchEvent(new CustomEvent('newQuery'))
  }

  const handlePastQuery = (thread) => {
    setActiveThreadId(thread.id)
    navigate('/intelligence')
    window.dispatchEvent(new CustomEvent('loadThread', { detail: { threadId: thread.id } }))
  }

  return (
    <aside
      className="flex flex-col h-full shrink-0"
      style={{
        width: '240px',
        backgroundColor: '#000000',
        borderRight: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-5" style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div
          className="flex items-center justify-center rounded-lg text-white text-sm font-bold shrink-0"
          style={{ width: 32, height: 32, backgroundColor: '#ce3e00' }}
        >
          S
        </div>
        <div>
          <div className="text-white font-semibold text-sm leading-tight tracking-wide" style={{ letterSpacing: '0.03em' }}>SCAPIA</div>
          <div className="text-xs font-medium" style={{ color: '#ce3e00', letterSpacing: '0.08em' }}>INTELLIGENCE</div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 pt-3 pb-2">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: '#666' }}>🔍</span>
          <input
            type="text"
            placeholder="Search queries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg outline-none transition-all"
            style={{
              backgroundColor: 'rgba(255,255,255,0.07)',
              border: '1px solid rgba(255,255,255,0.09)',
              color: '#FFFFFF',
            }}
          />
        </div>
      </div>

      {/* New Query Button */}
      <div className="px-3 pb-3">
        <button
          onClick={handleNewQuery}
          className="w-full py-2 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 active:opacity-75"
          style={{ backgroundColor: '#ce3e00' }}
        >
          + New Query
        </button>
      </div>

      {/* Past Queries */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {filtered.length > 0 && (
          <>
            <div
              className="text-xs font-medium uppercase tracking-wider px-1 mb-1.5"
              style={{ color: '#666666', fontSize: '0.7rem', letterSpacing: '0.06em' }}
            >
              Past Queries
            </div>
            <div className="flex flex-col gap-0.5">
              {filtered.map((item, idx) => {
                const isActive = activeThreadId === item.id
                const isHovered = hoveredIdx === idx
                return (
                  <button
                    key={item.id}
                    onClick={() => handlePastQuery(item)}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="text-left px-3 py-2 rounded-lg text-sm transition-all truncate"
                    style={{
                      color: isActive ? '#ce3e00' : isHovered ? '#e8601a' : '#BBBBBB',
                      backgroundColor: isActive
                        ? 'rgba(206,62,0,0.18)'
                        : isHovered
                        ? 'rgba(206,62,0,0.10)'
                        : 'transparent',
                    }}
                    title={getTitle(item)}
                  >
                    {getTitle(item)}
                  </button>
                )
              })}
            </div>
          </>
        )}
        {filtered.length === 0 && searchQuery && (
          <div className="text-xs px-1" style={{ color: '#666' }}>No results</div>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }} />

      {/* Nav Items */}
      <div className="px-3 py-3 flex flex-col gap-0.5">
        <NavItem to="/intelligence" icon="💬" label="Intelligence" />
        <NavItem to="/battlecards" icon="🃏" label="Intel Cards" />
        <NavItem to="/wiki" icon="📚" label="Wiki Browser" />
        <NavItem to="/curator" icon="🗂️" label="Curator Queue" />
        <NavItem to="/submit" icon="📤" label="Submit" />
      </div>
    </aside>
  )
}
