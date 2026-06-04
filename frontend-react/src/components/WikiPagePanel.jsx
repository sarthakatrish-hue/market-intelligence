import React, { useEffect, useState, useRef, useCallback } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { fetchPage } from '../api.js'
import WikiPill, { renderInlineWithWikilinks } from './WikiPill.jsx'

const MIN_WIDTH = 560
const MAX_WIDTH = 900

// Wrapper kept for back-compat with the existing render helpers below —
// delegates to the shared renderInlineWithWikilinks. The onOpen callback
// keeps the side-panel handoff working (clicking a pill inside a panel
// swaps the panel to the linked page rather than navigating away).
function renderTextWithWikilinks(text, onOpen) {
  return renderInlineWithWikilinks(text, onOpen)
}

function processChildren(children, onOpen) {
  if (!children) return children
  return React.Children.map(children, child => {
    if (typeof child === 'string') return renderTextWithWikilinks(child, onOpen)
    if (React.isValidElement(child) && child.props?.children) {
      return React.cloneElement(child, {}, processChildren(child.props.children, onOpen))
    }
    return child
  })
}

// Strip YAML frontmatter and HTML comments from markdown before rendering
function stripFrontmatter(content) {
  if (!content) return content
  return content
    .replace(/^---[\s\S]*?---\n?/, '')
    .replace(/<!--[\s\S]*?-->/g, '')
}

export default function WikiPagePanel({ path, onClose }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [width, setWidth] = useState(MIN_WIDTH)
  const [openPath, setOpenPath] = useState(path)
  const [navStack, setNavStack] = useState([])
  const dragging = useRef(false)
  const startX = useRef(0)
  const startWidth = useRef(MIN_WIDTH)

  // Sync when external path prop changes
  useEffect(() => {
    setOpenPath(path)
    setNavStack([])
  }, [path])

  function handleWikilinkOpen(linkPath) {
    setNavStack(prev => [...prev, openPath])
    setOpenPath(linkPath)
  }

  function handleBack() {
    setNavStack(prev => {
      const next = [...prev]
      const previous = next.pop()
      setOpenPath(previous)
      return next
    })
  }

  const onMouseDown = useCallback((e) => {
    dragging.current = true
    startX.current = e.clientX
    startWidth.current = width
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'
  }, [width])

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return
      const delta = startX.current - e.clientX
      const newWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta))
      setWidth(newWidth)
    }
    const onMouseUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  useEffect(() => {
    if (!openPath) return
    setLoading(true)
    setData(null)
    setError(null)
    fetchPage(openPath)
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [openPath])

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40"
        style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: `${width}px`,
          maxWidth: '90vw',
          backgroundColor: '#FFFFFF',
          borderLeft: '1px solid #E8E8E8',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.1)',
        }}
      >
        {/* Drag handle */}
        <div
          onMouseDown={onMouseDown}
          style={{
            position: 'absolute', left: 0, top: 0, width: '5px', height: '100%',
            cursor: 'ew-resize', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            width: '3px', height: '40px', borderRadius: '99px',
            backgroundColor: '#D1D5DB', transition: 'background-color 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#ce3e00'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#D1D5DB'}
          />
        </div>
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4 shrink-0"
          style={{ borderBottom: '1px solid #E8E8E8' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {navStack.length > 0 && (
              <button
                onClick={handleBack}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '6px', border: '1px solid #E8E8E8',
                  backgroundColor: '#F3F4F6', cursor: 'pointer', color: '#555', flexShrink: 0,
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#E8E8E8'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = '#F3F4F6'}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
            )}
            <div>
              <div className="font-semibold text-sm" style={{ color: '#111111' }}>
                {openPath.split('/').pop().replace(/-/g, ' ')}
              </div>
              {data?.meta?.last_updated && (
                <div className="text-xs mt-0.5" style={{ color: '#999999' }}>
                  Updated {data.meta.last_updated}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-lg transition-all hover:bg-gray-100"
            style={{ color: '#999999' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Meta chips */}
        {data?.meta && (
          <div className="px-5 py-2.5 flex flex-wrap gap-2 shrink-0" style={{ borderBottom: '1px solid #F0F0F0' }}>
            {(data.meta.type || data.meta.category) && (
              <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: '#FFF3EC', color: '#ce3e00', border: '1px solid #FDBA74' }}>
                {data.meta.type || data.meta.category}
              </span>
            )}
            {(data.meta.source_count || data.meta.sources_count) && (
              <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: '#F3F4F6', color: '#666666', border: '1px solid #E8E8E8' }}>
                {data.meta.source_count || data.meta.sources_count} sources
              </span>
            )}
            {(() => {
              const posture = data.meta.posture || data.meta.compliance_status
              if (!posture) return null
              const palette = {
                'Active':        { bg: '#DCFCE7', fg: '#16A34A', border: '#86EFAC' },
                'Confirmed':     { bg: '#DCFCE7', fg: '#16A34A', border: '#86EFAC' },
                'Under Review':  { bg: '#FEF9C3', fg: '#CA8A04', border: '#FDE047' },
                'Escalated':     { bg: '#FEE2E2', fg: '#DC2626', border: '#FCA5A5' },
                'Superseded':    { bg: '#F3F4F6', fg: '#6B7280', border: '#D1D5DB' },
              }
              const c = palette[posture] || { bg: '#FEF9C3', fg: '#CA8A04', border: '#FDE047' }
              return (
                <span className="px-2 py-0.5 rounded-full text-xs" style={{
                  backgroundColor: c.bg, color: c.fg, border: `1px solid ${c.border}`,
                }}>
                  {posture}
                </span>
              )
            })()}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5" style={{ backgroundColor: '#f1f6fa' }}>
          {loading && (
            <div className="flex items-center justify-center h-32" style={{ color: '#AAAAAA' }}>
              <span className="text-sm">Loading…</span>
            </div>
          )}
          {error && (
            <div className="text-sm p-4 rounded-lg" style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
              Error: {error}
            </div>
          )}
          {!loading && !error && data && (
            <div className="prose-light">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p:    ({ children }) => <p>{processChildren(children, handleWikilinkOpen)}</p>,
                  li:   ({ children }) => <li>{processChildren(children, handleWikilinkOpen)}</li>,
                  td:   ({ children }) => <td>{processChildren(children, handleWikilinkOpen)}</td>,
                  th:   ({ children }) => <th>{processChildren(children, handleWikilinkOpen)}</th>,
                  h1:   ({ children }) => <h1>{processChildren(children, handleWikilinkOpen)}</h1>,
                  h2:   ({ children }) => <h2>{processChildren(children, handleWikilinkOpen)}</h2>,
                  h3:   ({ children }) => <h3>{processChildren(children, handleWikilinkOpen)}</h3>,
                  strong: ({ children }) => <strong>{processChildren(children, handleWikilinkOpen)}</strong>,
                }}
              >
                {stripFrontmatter(data.content) || '_No content available._'}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
