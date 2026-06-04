import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchRaw, fetchRawContent } from '../api.js'

// ─── Tokens ────────────────────────────────────────────────────────────────
const BRAND = {
  orange: '#ce3e00',
  bg:     '#f1f6fa',
  dark:   '#111111',
  white:  '#FFFFFF',
  border: '#E8E8E8',
  divider:'#F0F0F0',
  muted:  '#888888',
  font:   '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const FOLDER_META = {
  competitive: { label: 'Competitive',  color: '#ce3e00', desc: 'Competitor, partner, and customer signal sources' },
  regulatory:  { label: 'Regulatory',   color: '#2563EB', desc: 'Regulatory filings and circulars' },
  market:      { label: 'Market',       color: '#16A34A', desc: 'Macro trends, category growth, financial health' },
  ambiguous:   { label: 'Ambiguous',    color: '#D97706', desc: 'Mixed sources — split treatment at ingest' },
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// ─── Raw file viewer panel ─────────────────────────────────────────────────
function RawPanel({ file, onClose }) {
  const [content, setContent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState(null)

  useEffect(() => {
    if (!file) return
    setLoading(true); setContent(null); setError(null)
    fetchRawContent(file.path)
      .then((d) => setContent(d.content))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [file?.path])

  if (!file) return null

  const meta = FOLDER_META[file.folder] || FOLDER_META.ambiguous

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, backgroundColor: 'rgba(0,0,0,0.25)' }}
      />
      {/* Panel */}
      <div style={{
        position: 'fixed', right: 0, top: 0, height: '100%', zIndex: 50,
        width: 640, maxWidth: '90vw',
        backgroundColor: BRAND.white,
        borderLeft: `1px solid ${BRAND.border}`,
        boxShadow: '-12px 0 40px rgba(0,0,0,0.1)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${BRAND.border}`, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontFamily: BRAND.font, fontWeight: 600, fontSize: 14, color: BRAND.dark }}>{file.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <span style={{
                fontFamily: BRAND.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                textTransform: 'uppercase', color: meta.color,
                background: `${meta.color}18`, padding: '2px 7px', borderRadius: 4,
              }}>{meta.label}</span>
              <span style={{ fontFamily: BRAND.font, fontSize: 11, color: BRAND.muted }}>{formatBytes(file.size)} · {file.modified}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center',
              justifyContent: 'center', width: 32, height: 32, borderRadius: 8,
              color: BRAND.muted, transition: 'background .12s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F3F4F6')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: '#FAFAFA' }}>
          {loading && (
            <div style={{ padding: 32, textAlign: 'center', fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: '10px 14px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', fontFamily: BRAND.font, fontSize: 13 }}>
              Error: {error}
            </div>
          )}
          {!loading && !error && content != null && (
            <pre style={{
              margin: 0, fontFamily: '"SF Mono", "Fira Code", "Menlo", monospace',
              fontSize: 12.5, lineHeight: 1.7, color: BRAND.dark,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>{content}</pre>
          )}
          {!loading && !error && content === '' && (
            <div style={{ padding: 32, textAlign: 'center', fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>File is empty.</div>
          )}
        </div>
      </div>
    </>
  )
}

// ─── File row ──────────────────────────────────────────────────────────────
function FileRow({ file, active, onClick }) {
  const [hover, setHover] = useState(false)
  const meta = FOLDER_META[file.folder] || FOLDER_META.ambiguous
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box',
        display: 'flex', alignItems: 'center', gap: 14,
        width: '100%', padding: '11px 20px', cursor: 'pointer',
        background: active ? `${meta.color}0f` : hover ? `${meta.color}08` : BRAND.white,
        borderBottom: `1px solid ${BRAND.divider}`,
        borderLeft: `3px solid ${active ? meta.color : 'transparent'}`,
        transition: 'background .1s, border-color .1s',
        fontFamily: BRAND.font,
      }}
    >
      {/* File icon */}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={active ? meta.color : BRAND.muted} strokeWidth="1.8" strokeLinecap="round" style={{ flexShrink: 0 }}>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="14" y2="17" />
      </svg>

      <span style={{
        flex: 1, minWidth: 0, fontSize: 13, fontWeight: active ? 600 : 400,
        color: active ? meta.color : BRAND.dark,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{file.name}</span>

      <span style={{ fontSize: 11, color: BRAND.muted, flexShrink: 0 }}>{formatBytes(file.size)}</span>
      <span style={{ fontSize: 11, color: BRAND.muted, flexShrink: 0, minWidth: 80, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{file.modified}</span>
    </button>
  )
}

// ─── Folder section ────────────────────────────────────────────────────────
function FolderSection({ folderKey, files, activeFile, onSelect }) {
  const [open, setOpen] = useState(true)
  const meta = FOLDER_META[folderKey]

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Group header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          all: 'unset', boxSizing: 'border-box',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          width: '100%', padding: '10px 20px', cursor: 'pointer',
          background: BRAND.white, borderBottom: `1px solid ${BRAND.border}`,
          fontFamily: BRAND.font,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            display: 'inline-block',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform .15s', color: BRAND.muted, fontSize: 12,
          }}>›</span>
          <div style={{
            width: 8, height: 8, borderRadius: '50%', background: meta.color, flexShrink: 0,
          }} />
          <span style={{ fontWeight: 600, fontSize: 14, color: BRAND.dark, letterSpacing: '-0.01em' }}>{meta.label}</span>
          <span style={{ fontSize: 12, color: BRAND.muted }}>{meta.desc}</span>
        </div>
        <span style={{
          fontFamily: BRAND.font, fontSize: 11, color: BRAND.muted,
          background: '#F5F5F5', padding: '2px 9px', borderRadius: 999,
        }}>{files.length} {files.length === 1 ? 'file' : 'files'}</span>
      </button>

      {open && (
        files.length === 0 ? (
          <div style={{
            padding: '16px 20px', fontFamily: BRAND.font, fontSize: 12.5,
            color: BRAND.muted, fontStyle: 'italic',
            background: '#FAFAFA', borderBottom: `1px solid ${BRAND.divider}`,
          }}>
            No files in this folder yet.
          </div>
        ) : (
          files.map((f) => (
            <FileRow
              key={f.path}
              file={f}
              active={activeFile?.path === f.path}
              onClick={() => onSelect(f)}
            />
          ))
        )
      )}
    </div>
  )
}

// ─── SourcesPage ──────────────────────────────────────────────────────────
export default function SourcesPage() {
  const navigate = useNavigate()
  const [rawFiles, setRawFiles]     = useState({ competitive: [], regulatory: [], market: [], ambiguous: [] })
  const [loading, setLoading]       = useState(true)
  const [activeFile, setActiveFile] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetchRaw()
      .then((data) => setRawFiles(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalFiles = Object.values(rawFiles).reduce((n, arr) => n + arr.length, 0)

  return (
    <div style={{
      display: 'flex', height: '100%', width: '100%',
      fontFamily: BRAND.font, background: BRAND.bg, overflow: 'hidden',
    }}>
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: 220, flex: '0 0 220px',
        background: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', flexDirection: 'column', height: '100%',
      }}>
        {/* Header */}
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
              textTransform: 'uppercase', lineHeight: 1, whiteSpace: 'nowrap',
            }}>Sources</span>
          </div>
        </div>

        {/* Stats */}
        <div style={{ padding: '16px 18px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontFamily: BRAND.font, fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>Raw files</div>
          {Object.entries(FOLDER_META).map(([key, meta]) => {
            const count = rawFiles[key]?.length || 0
            return (
              <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
                  <span style={{ fontFamily: BRAND.font, fontSize: '0.82rem', color: '#BBBBBB' }}>{meta.label}</span>
                </div>
                <span style={{ fontFamily: BRAND.font, fontSize: '0.82rem', color: count > 0 ? BRAND.orange : 'rgba(255,255,255,0.25)', fontVariantNumeric: 'tabular-nums' }}>{count}</span>
              </div>
            )
          })}
          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: BRAND.font, fontSize: '0.82rem', color: '#BBBBBB' }}>Total</span>
            <span style={{ fontFamily: BRAND.font, fontSize: '0.82rem', fontWeight: 600, color: BRAND.white }}>{totalFiles}</span>
          </div>
        </div>

        {/* Nav back to Curator */}
        <div style={{ padding: '10px 0' }}>
          <button
            onClick={() => navigate('/curator')}
            style={{
              all: 'unset', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '9px 18px', cursor: 'pointer',
              fontFamily: BRAND.font, fontSize: '0.82rem', color: '#BBBBBB',
              transition: 'color .12s, background .12s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = BRAND.orange; e.currentTarget.style.background = 'rgba(206,62,0,0.10)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#BBBBBB'; e.currentTarget.style.background = 'transparent' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Curator Queue
          </button>
        </div>
      </aside>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 28px 16px', borderBottom: `1px solid ${BRAND.border}`,
          background: BRAND.white, flexShrink: 0,
        }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: BRAND.font, fontWeight: 600, fontSize: 22, letterSpacing: '-0.015em', color: BRAND.dark }}>
              Raw Sources
            </h1>
            <div style={{ marginTop: 4, fontFamily: BRAND.font, fontSize: 12.5, color: BRAND.muted }}>
              {loading ? 'Loading…' : `${totalFiles} file${totalFiles !== 1 ? 's' : ''} across 3 folders — immutable source log`}
            </div>
          </div>
          <button
            onClick={() => { setLoading(true); fetchRaw().then(setRawFiles).catch(() => {}).finally(() => setLoading(false)) }}
            style={{
              all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
              fontFamily: BRAND.font, fontSize: 12, fontWeight: 500, padding: '7px 14px',
              border: `1px solid ${BRAND.border}`, color: BRAND.muted,
              transition: 'border-color .15s, color .15s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = BRAND.orange; e.currentTarget.style.color = BRAND.orange }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = BRAND.border; e.currentTarget.style.color = BRAND.muted }}
          >↺ Refresh</button>
        </div>

        {/* File list */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 48, textAlign: 'center', fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>
              Loading raw files…
            </div>
          ) : totalFiles === 0 ? (
            <div style={{ padding: '80px 48px', textAlign: 'center', fontFamily: BRAND.font }}>
              <div style={{ fontSize: 18, fontWeight: 600, color: BRAND.dark, letterSpacing: '-0.01em' }}>No raw files yet</div>
              <div style={{ marginTop: 8, fontSize: 13.5, color: BRAND.muted, maxWidth: 380, margin: '8px auto 0' }}>
                Files appear here after sources are submitted through the Curator queue.
                The raw directory is immutable — files are never modified after ingest.
              </div>
              <button
                onClick={() => navigate('/curator')}
                style={{
                  all: 'unset', boxSizing: 'border-box', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center', marginTop: 24,
                  padding: '10px 20px', background: BRAND.orange, color: BRAND.white,
                  fontFamily: BRAND.font, fontWeight: 500, fontSize: 13,
                  borderRadius: 8, cursor: 'pointer',
                }}
              >Go to Curator →</button>
            </div>
          ) : (
            Object.entries(FOLDER_META).map(([key]) => (
              <FolderSection
                key={key}
                folderKey={key}
                files={rawFiles[key] || []}
                activeFile={activeFile}
                onSelect={setActiveFile}
              />
            ))
          )}
        </div>
      </main>

      {/* Raw file viewer panel */}
      {activeFile && <RawPanel file={activeFile} onClose={() => setActiveFile(null)} />}
    </div>
  )
}
