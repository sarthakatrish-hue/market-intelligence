// ─────────────────────────────────────────────────────────────────────────────
// Access gates — what a user sees when they lack a capability.
//
//   • AccessGateToast   — top-center toast with a "Request access" CTA that
//                         swaps to a "Request sent" confirmation. Used inline on
//                         the homepage (query input, recent queries, OPS pills).
//   • AccessGateCard    — full-page card variant. Used as a route guard so a
//                         deep-linked /admin or /curator is gated too.
//   • RequireCapability — route wrapper: renders children if allowed, else the
//                         card above.
//
// Visual language matches CuratorPage's AutoApprovedToast + the AdminPage Toast:
// white card, colored left rail, soft shadow, Lexend Deca, #ce3e00 accents.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useEffect, useRef, useState } from 'react'
import { useUser, hasCapability } from '../auth/user.js'
import { submitAccessRequest, fetchMyRequests } from '../api.js'

const BRAND = {
  orange: '#ce3e00', orangeHover: '#b83600', card: '#FFFFFF',
  dark: '#111111', text2: '#333333', muted: '#888888', mutedSoft: '#AAAAAA',
  border: '#E8E8E8',
  font: '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const C = { green: '#16A34A', amber: '#D97706' }

function rgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const [, r, g, b] = m
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${a})`
}

// ── Gate copy, keyed by capability ──────────────────────────────────────────
// `requested_role` is what gets written to the access-request queue; `access`
// is the noun used in the "Request sent" confirmation line.
export const GATES = {
  query: {
    title: 'Query access required',
    body: 'Asking questions is available to leaders. Request access and an admin will review it.',
    requested_role: 'leader',
    access: 'query access',
  },
  curate: {
    title: 'Curator access only',
    body: 'This area is restricted. Ask an admin if you need access.',
    requested_role: 'curator',
    access: 'curator access',
  },
  admin: {
    title: 'Admin only',
    body: 'This area is restricted. Ask an admin if you need access.',
    requested_role: 'admin',
    access: 'admin access',
  },
}

// ── Icons ────────────────────────────────────────────────────────────────────
function IconLock({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter">
      <rect x="5" y="11" width="14" height="9" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}
function IconCheck({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.4" strokeLinecap="square" strokeLinejoin="miter">
      <polyline points="5,12.5 10,17.5 19,7" />
    </svg>
  )
}

// ── Shared "request access" logic ────────────────────────────────────────────
// Returns whether a pending request already exists for this gate, plus a submit
// fn. Fetches the caller's own requests on mount so a fresh gate reflects an
// already-pending request (backend scopes /api/access-requests/mine to the user).
function useRequestState(capability) {
  const gate = GATES[capability] || GATES.query
  const [pending, setPending] = useState(false)
  useEffect(() => {
    let alive = true
    fetchMyRequests()
      .then(({ requests }) => {
        if (!alive) return
        setPending((requests || []).some(
          (r) => r.requested_role === gate.requested_role && r.status === 'pending',
        ))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [gate.requested_role])
  const submit = () => {
    submitAccessRequest({ requested_role: gate.requested_role })
      .then(() => setPending(true))
      .catch(() => {})
  }
  return { gate, pending, submit }
}

// ── Primary / ghost buttons ──────────────────────────────────────────────────
function PrimaryButton({ label, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
        fontFamily: BRAND.font, fontSize: 13, fontWeight: 600, padding: '9px 16px',
        borderRadius: 10, background: hover ? BRAND.orangeHover : BRAND.orange, color: '#fff',
        transition: 'background .14s', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )
}
function GhostButton({ label, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
        fontFamily: BRAND.font, fontSize: 13, fontWeight: 500, padding: '9px 14px',
        borderRadius: 10, color: hover ? BRAND.text2 : BRAND.muted,
        transition: 'color .14s', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )
}

// ── Toast variant ────────────────────────────────────────────────────────────
// Controlled by the parent: render <AccessGateToast capability onClose /> when
// a gate fires; it auto-dismisses a few seconds after "Request sent".
export function AccessGateToast({ capability, onClose }) {
  const { gate, pending, submit } = useRequestState(capability)
  const [sent, setSent] = useState(false)
  const timer = useRef(null)

  const close = () => { clearTimeout(timer.current); onClose && onClose() }

  const onRequest = () => {
    submit()
    setSent(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(close, 3200)
  }

  useEffect(() => () => clearTimeout(timer.current), [])

  const railColor = sent ? BRAND.orange : C.amber

  return (
    <div style={{
      position: 'fixed', top: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 60,
      animation: 'mi-gate-in .26s cubic-bezier(.2,.8,.3,1) both',
    }}>
      <style>{`@keyframes mi-gate-in{from{opacity:0;transform:translate(-50%,-12px) scale(.96)}to{opacity:1;transform:translate(-50%,0) scale(1)}}`}</style>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 14, background: '#fff',
        borderLeft: `3px solid ${railColor}`, boxShadow: '0 12px 40px rgba(17,17,17,0.18)',
        borderRadius: 12, padding: '16px 20px 16px 18px', width: 420, maxWidth: '92vw',
      }}>
        {/* Icon */}
        <span style={{
          width: 30, height: 30, borderRadius: '50%', flex: '0 0 auto', marginTop: 1,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: sent ? rgba(C.green, 0.12) : rgba(C.amber, 0.12),
          color: sent ? C.green : C.amber,
        }}>{sent ? <IconCheck /> : <IconLock />}</span>

        {/* Copy + actions */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {sent ? (
            <>
              <div style={{ fontFamily: BRAND.font, fontSize: 14, fontWeight: 600, color: BRAND.dark }}>
                Request sent
              </div>
              <div style={{ fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted, lineHeight: 1.5, marginTop: 3 }}>
                Your request for {gate.access} has been sent to the admin. You'll get access once it's approved.
              </div>
            </>
          ) : (
            <>
              <div style={{ fontFamily: BRAND.font, fontSize: 14, fontWeight: 600, color: BRAND.dark }}>
                {gate.title}
              </div>
              <div style={{ fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted, lineHeight: 1.5, marginTop: 3 }}>
                {gate.body}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12, marginLeft: -2 }}>
                {pending ? (
                  <span style={{ fontFamily: BRAND.font, fontSize: 12.5, fontWeight: 500, color: C.amber, padding: '6px 2px' }}>
                    Request pending — an admin will review it.
                  </span>
                ) : (
                  <PrimaryButton label="Request access" onClick={onRequest} />
                )}
                <GhostButton label="Dismiss" onClick={close} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Full-page card variant (route guard) ─────────────────────────────────────
export function AccessGateCard({ capability }) {
  const { gate, pending, submit } = useRequestState(capability)
  const [justSent, setJustSent] = useState(false)
  const isPending = pending || justSent

  return (
    <div style={{
      minHeight: '100vh', width: '100%', background: '#f1f6fa',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 40, fontFamily: BRAND.font,
    }}>
      <div style={{
        background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 14,
        boxShadow: '0 12px 40px rgba(17,17,17,0.08)', padding: '40px 38px',
        width: 440, maxWidth: '100%', textAlign: 'center',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 20px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: rgba(BRAND.dark, 0.05), color: BRAND.muted,
        }}><IconLock size={24} /></div>

        <div style={{ fontSize: 20, fontWeight: 600, color: BRAND.dark, letterSpacing: '-0.01em' }}>
          {gate.title}
        </div>
        <div style={{ fontSize: 13.5, color: BRAND.muted, lineHeight: 1.55, marginTop: 8, maxWidth: 340, marginInline: 'auto' }}>
          {isPending
            ? `Your request for ${gate.access} has been sent to the admin. You'll get access once it's approved.`
            : gate.body}
        </div>

        <div style={{ marginTop: 22, display: 'flex', justifyContent: 'center' }}>
          {isPending ? (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 999,
              background: rgba(C.amber, 0.10), color: C.amber, fontSize: 12.5, fontWeight: 600,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.amber }} />
              Request pending
            </span>
          ) : (
            <PrimaryButton label="Request access" onClick={() => { submit(); setJustSent(true) }} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Route guard ──────────────────────────────────────────────────────────────
export function RequireCapability({ capability, children }) {
  const user = useUser()
  if (hasCapability(user, capability)) return children
  return <AccessGateCard capability={capability} />
}
