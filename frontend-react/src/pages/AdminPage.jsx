// ─────────────────────────────────────────────────────────────────────────────
// Admin page — manage users + grant/deny access requests.
//
// Layout mirrors the Intelligence / Vault pages: its own dark left sidebar with
// admin utilities, and a light main panel. Reached from the OPS section's
// "Admin" pill and guarded by RequireCapability("admin") in App.jsx (/admin is
// in NO_GLOBAL_SIDEBAR so the global sidebar is suppressed in favour of this).
//
// No hardcoded data: the roster and the request queue both come live from the
// backend (/api/admin/users, /api/access-requests). Grants, denials and role
// toggles are real, persisted server-side (auth_store.json today, Postgres
// later) — they take effect on the target user's next /api/me.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../auth/user.js'
import { fetchAccessRequests, fetchAdminUsers, decideAccessRequest, setUserRoles } from '../api.js'

/* ── Design tokens (shared with CuratorPage / Vault) ─────────────────────── */
const BRAND = {
  orange: '#ce3e00', orangeHover: '#b83600', bg: '#f1f6fa', card: '#FFFFFF',
  dark: '#111111', text2: '#333333', text3: '#555555', muted: '#888888',
  mutedSoft: '#AAAAAA', border: '#E8E8E8', divider: '#F0F0F0', white: '#FFFFFF',
  font: '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const C = { green: '#16A34A', red: '#DC2626', amber: '#D97706', teal: '#0D9488' }

function rgba(hex, a) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return hex
  const [, r, g, b] = m
  return `rgba(${parseInt(r, 16)}, ${parseInt(g, 16)}, ${parseInt(b, 16)}, ${a})`
}

const ROLE_LABEL = { leader: 'Leader', curator: 'Curator', admin: 'Admin' }
const ROLE_ORDER = ['leader', 'curator', 'admin']

function relTime(ts) {
  if (!ts) return ''
  const m = Math.floor((Date.now() - ts) / 60000)
  if (m < 1) return 'Just now'
  if (m < 60) return m + 'm ago'
  const h = Math.floor(m / 60)
  if (h < 24) return h + 'h ago'
  const d = Math.floor(h / 24)
  if (d === 1) return 'Yesterday'
  return d + 'd ago'
}

/* ── Small icon ───────────────────────────────────────────────────────────── */
function IconCheck({ size = 15, sw = 2.4 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={sw} strokeLinecap="square" strokeLinejoin="miter">
      <polyline points="5,12.5 10,17.5 19,7" />
    </svg>
  )
}

/* ── Left sidebar (admin utilities) — matches Intelligence / Vault style ──── */
function NavRow({ label, active, count, onClick }) {
  const [hover, setHover] = useState(false)
  const bg = active ? BRAND.orange : hover ? 'rgba(206,62,0,0.20)' : 'transparent'
  const color = active ? BRAND.white : hover ? BRAND.white : 'rgba(255,255,255,0.58)'
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '9px 12px',
        fontFamily: BRAND.font, fontSize: '0.92rem', fontWeight: active ? 500 : 400,
        color, background: bg, cursor: 'pointer', userSelect: 'none',
        transition: 'background .12s, color .12s',
      }}
    >
      <span style={{ flex: 1 }}>{label}</span>
      {count > 0 && (
        <span style={{
          minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: BRAND.font, fontSize: 11, fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          background: active ? 'rgba(255,255,255,0.22)' : rgba(C.amber, 0.9),
          color: BRAND.white,
        }}>{count}</span>
      )}
    </div>
  )
}

function AdminSidebar({ view, setView, pending, total }) {
  const navigate = useNavigate()
  return (
    <aside style={{
      width: 240, flex: '0 0 240px',
      background: '#0a0a0a', borderRight: '1px solid rgba(255,255,255,0.07)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* Wordmark */}
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
            letterSpacing: '0.22em', color: BRAND.orange, textTransform: 'uppercase', lineHeight: 1,
          }}>ADMIN</span>
        </div>
      </div>

      {/* Section label */}
      <div style={{
        padding: '14px 18px 8px', fontFamily: BRAND.font, fontSize: 10, fontWeight: 600,
        letterSpacing: '0.2em', color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase',
      }}>
        Manage
      </div>

      {/* Nav */}
      <div style={{ padding: '0 0 10px' }}>
        <NavRow label="Access requests" active={view === 'requests'} count={pending} onClick={() => setView('requests')} />
        <NavRow label="Users"           active={view === 'users'}    count={total}   onClick={() => setView('users')} />
      </div>

      <div style={{ flex: 1 }} />

      {/* Footer hint */}
      <div style={{
        padding: '14px 18px 18px', borderTop: '1px solid rgba(255,255,255,0.08)',
        fontFamily: BRAND.font, fontSize: 11, lineHeight: 1.5, color: 'rgba(255,255,255,0.30)',
      }}>
        Roles are additive. Grants apply immediately.
      </div>
    </aside>
  )
}

/* ── Page header ──────────────────────────────────────────────────────────── */
function PageHeader({ title, subtitle, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16,
      marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${BRAND.border}`,
    }}>
      <div>
        <h1 style={{ margin: 0, fontFamily: BRAND.font, fontWeight: 600, fontSize: 24,
          letterSpacing: '-0.015em', color: BRAND.dark }}>{title}</h1>
        {subtitle && (
          <div style={{ marginTop: 6, fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted }}>{subtitle}</div>
        )}
      </div>
      {right}
    </div>
  )
}

function HeaderChip({ children }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 13px',
      borderRadius: 999, background: BRAND.card, border: `1px solid ${BRAND.border}`,
      fontFamily: BRAND.font, fontSize: 12, fontWeight: 500, color: BRAND.text2,
      whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
    }}>{children}</div>
  )
}

function SectionLabel({ color = BRAND.muted, children, style }) {
  return (
    <div style={{
      fontFamily: BRAND.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.20em',
      color, textTransform: 'uppercase', ...style,
    }}>{children}</div>
  )
}

/* ── Outline action button ────────────────────────────────────────────────── */
function OutlineButton({ label, color = BRAND.dark, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: 'pointer',
        fontFamily: BRAND.font, fontSize: 12.5, fontWeight: 500, padding: '7px 14px',
        border: `1px solid ${color}`, background: hover ? color : 'transparent',
        color: hover ? '#fff' : color, transition: 'background .12s, color .12s', whiteSpace: 'nowrap',
      }}
    >{label}</button>
  )
}

/* ── Role chips ───────────────────────────────────────────────────────────── */
function RoleChips({ roles }) {
  if (!roles || roles.length === 0) {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', padding: '3px 11px', borderRadius: 999,
        background: rgba(BRAND.dark, 0.04), border: `1px solid ${BRAND.border}`,
        fontFamily: BRAND.font, fontSize: 11.5, fontWeight: 500, color: BRAND.muted,
      }}>Viewer</span>
    )
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {ROLE_ORDER.filter(r => roles.includes(r)).map(r => (
        <span key={r} style={{
          display: 'inline-flex', alignItems: 'center', padding: '3px 11px', borderRadius: 999,
          background: rgba(BRAND.orange, 0.10), color: BRAND.orange,
          fontFamily: BRAND.font, fontSize: 11.5, fontWeight: 500,
        }}>{ROLE_LABEL[r]}</span>
      ))}
    </div>
  )
}

/* ── Pill toggle ──────────────────────────────────────────────────────────── */
function PillToggle({ label, on, disabled, onClick }) {
  const [hover, setHover] = useState(false)
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={disabled ? (label === 'Leader' ? 'Every signed-in user is a Leader' : "You can't remove your own admin access") : undefined}
      style={{
        all: 'unset', boxSizing: 'border-box', cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: BRAND.font, fontSize: 11.5, fontWeight: 500, padding: '5px 12px', borderRadius: 999,
        border: `1px solid ${on ? BRAND.dark : BRAND.border}`,
        background: on ? BRAND.dark : (hover && !disabled ? rgba(BRAND.dark, 0.04) : '#fff'),
        color: on ? '#fff' : (disabled ? BRAND.mutedSoft : BRAND.text2),
        opacity: disabled ? 0.55 : 1, transition: 'background .12s, color .12s, border-color .12s',
      }}
    >{label}</button>
  )
}

/* ── Access request card ──────────────────────────────────────────────────── */
function RequestCard({ req, onGrant, onDeny }) {
  const requestedLabel = ROLE_LABEL[req.requested_role] || 'Access'
  return (
    <div style={{
      background: BRAND.card, border: `1px solid ${BRAND.border}`, borderLeft: `4px solid ${C.amber}`,
      padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <SectionLabel color={C.amber} style={{ whiteSpace: 'nowrap' }}>Access request</SectionLabel>
        <span style={{ fontFamily: BRAND.font, fontSize: 12, color: BRAND.mutedSoft, fontVariantNumeric: 'tabular-nums' }}>{relTime(req.ts)}</span>
      </div>
      <div>
        <div style={{ fontFamily: BRAND.font, fontSize: 15, fontWeight: 600, color: BRAND.dark }}>{req.name}</div>
        <div style={{ fontFamily: BRAND.font, fontSize: 12.5, color: BRAND.muted, marginTop: 2 }}>{req.email}</div>
      </div>
      <div>
        <div style={{ fontFamily: BRAND.font, fontSize: 13.5, color: BRAND.text2 }}>
          Requesting: <span style={{ fontWeight: 500, color: BRAND.dark }}>{requestedLabel} access</span>
        </div>
        {req.reason && (
          <div style={{ fontFamily: BRAND.font, fontSize: 13, fontStyle: 'italic', color: BRAND.muted,
            marginTop: 5, lineHeight: 1.5, maxWidth: 560 }}>“{req.reason}”</div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 2 }}>
        <OutlineButton label={`Grant ${requestedLabel}`} color={C.teal} onClick={() => onGrant(req)} />
        <OutlineButton label="Deny"                      color={C.red}  onClick={() => onDeny(req)} />
      </div>
    </div>
  )
}

/* ── Users table ──────────────────────────────────────────────────────────── */
const GRID = 'minmax(220px, 2.4fr) 1.4fr auto'

function UserRow({ user, even, onToggle }) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 16, padding: '14px 22px',
        background: hover ? rgba(BRAND.orange, 0.06) : (even ? '#fff' : '#FAFAFA'),
        borderBottom: `1px solid ${BRAND.divider}`, transition: 'background .12s',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: BRAND.font, fontSize: 13.5, fontWeight: 600, color: BRAND.dark }}>
          {user.name}{user.you && <span style={{ color: BRAND.muted, fontWeight: 400 }}> (You)</span>}
        </div>
        <div style={{ fontFamily: BRAND.font, fontSize: 12, color: BRAND.muted, marginTop: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
      </div>
      <div><RoleChips roles={user.roles} /></div>
      <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
        {ROLE_ORDER.map(r => (
          <PillToggle
            key={r}
            label={ROLE_LABEL[r]}
            on={user.roles.includes(r)}
            disabled={r === 'leader' || (user.you && r === 'admin')}
            onClick={() => onToggle(user, r)}
          />
        ))}
      </div>
    </div>
  )
}

/* ── Empty state ──────────────────────────────────────────────────────────── */
function EmptyState({ title, body }) {
  return (
    <div style={{
      background: BRAND.card, border: `1px dashed ${BRAND.border}`,
      padding: '40px 24px', textAlign: 'center',
    }}>
      <div style={{ fontFamily: BRAND.font, fontSize: 14, fontWeight: 600, color: BRAND.text2 }}>{title}</div>
      <div style={{ fontFamily: BRAND.font, fontSize: 13, color: BRAND.muted, marginTop: 6, lineHeight: 1.5 }}>{body}</div>
    </div>
  )
}

/* ── Success toast ────────────────────────────────────────────────────────── */
function Toast({ text }) {
  return (
    <div style={{
      position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
      animation: 'mi-admin-toast-in .26s cubic-bezier(.2,.8,.3,1) both',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, background: '#fff',
        borderLeft: `3px solid ${BRAND.orange}`, boxShadow: '0 12px 40px rgba(17,17,17,0.18)',
        borderRadius: 12, padding: '14px 20px 14px 17px', minWidth: 260,
      }}>
        <span style={{
          width: 26, height: 26, borderRadius: '50%', background: rgba(C.green, 0.12), color: C.green,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
        }}><IconCheck /></span>
        <div style={{ fontFamily: BRAND.font, fontSize: 13.5, fontWeight: 600, color: BRAND.dark }}>{text}</div>
      </div>
    </div>
  )
}

/* ── Admin page ───────────────────────────────────────────────────────────── */
export default function AdminPage() {
  const me = useUser()

  const [view, setView] = useState('requests')
  const [requests, setRequests] = useState([])
  const [roster, setRoster] = useState([])
  const [toast, setToast] = useState(null)
  const timer = useRef(null)

  // Pull the live queue + roster from the backend; called on mount and after
  // every grant/deny/toggle so the table always reflects persisted state.
  const reload = useCallback(async () => {
    try {
      const [{ requests }, { users }] = await Promise.all([fetchAccessRequests(), fetchAdminUsers()])
      setRequests(requests || [])
      setRoster(users || [])
    } catch {
      /* a 401/403 here means the session lapsed; the route guard handles it */
    }
  }, [])

  useEffect(() => { reload() }, [reload])
  useEffect(() => () => clearTimeout(timer.current), [])

  const pendingRequests = useMemo(
    () => requests.filter(r => r.status === 'pending'),
    [requests],
  )

  // Roster comes straight from the backend (roles already computed). Flag self.
  const users = useMemo(
    () => roster.map(u => ({ id: 'u_' + u.email, ...u, you: !!me && u.email === me.email })),
    [roster, me],
  )

  const fireToast = (text) => {
    setToast({ text, k: Date.now() })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setToast(null), 2200)
  }

  // Grant the role the user asked for (backend grants req.requested_role).
  const grant = async (req) => {
    await decideAccessRequest(req.id, 'granted')
    await reload()
    fireToast('Access granted.')
  }

  const deny = async (req) => {
    await decideAccessRequest(req.id, 'denied')
    await reload()
    fireToast('Request denied.')
  }

  // Toggle a grantable role (curator/admin). 'leader' is implicit and not stored;
  // we send the user's grantable roles with `role` flipped.
  const toggle = async (user, role) => {
    if (role === 'leader') return
    const grantable = (user.roles || []).filter(r => r === 'curator' || r === 'admin')
    const has = grantable.includes(role)
    const next = has ? grantable.filter(r => r !== role) : [...grantable, role]
    await setUserRoles(user.email, next)
    await reload()
    fireToast('Access updated.')
  }

  const pending = pendingRequests.length

  return (
    <div style={{
      display: 'flex', height: '100%', width: '100%',
      fontFamily: BRAND.font, color: BRAND.dark, background: BRAND.bg, overflow: 'hidden',
    }}>
      <style>{`@keyframes mi-admin-toast-in{from{opacity:0;transform:translate(-50%,12px) scale(.96)}to{opacity:1;transform:translate(-50%,0) scale(1)}}`}</style>

      <AdminSidebar view={view} setView={setView} pending={pending} total={users.length} />

      <main style={{
        flex: 1, minWidth: 0, height: '100%', overflowY: 'auto',
        padding: '34px 40px 80px', position: 'relative',
      }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          {view === 'requests' ? (
            <>
              <PageHeader
                title="Access requests"
                subtitle="Review and grant access to people who've asked."
                right={<HeaderChip>{pending} pending</HeaderChip>}
              />
              {pending > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {pendingRequests.map(r => <RequestCard key={r.id} req={r} onGrant={grant} onDeny={deny} />)}
                </div>
              ) : (
                <EmptyState
                  title="No pending requests"
                  body="When someone requests query, curator or admin access, it shows up here for review."
                />
              )}
            </>
          ) : (
            <>
              <PageHeader
                title="Users"
                subtitle="Everyone with access, and the roles they hold."
                right={<HeaderChip>{users.length} users · {pending} pending</HeaderChip>}
              />
              <div style={{ background: BRAND.card, border: `1px solid ${BRAND.border}` }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: GRID, gap: 16, alignItems: 'center',
                  padding: '11px 22px', borderBottom: `1px solid ${BRAND.border}`, background: '#fff',
                }}>
                  {['User', 'Roles', 'Manage'].map((h, i) => (
                    <div key={h} style={{
                      fontFamily: BRAND.font, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
                      textTransform: 'uppercase', color: BRAND.mutedSoft,
                      textAlign: i === 2 ? 'right' : 'left', whiteSpace: 'nowrap',
                    }}>{h}</div>
                  ))}
                </div>
                {users.map((u, i) => (
                  <UserRow key={u.id} user={u} even={i % 2 === 0} onToggle={toggle} />
                ))}
              </div>
            </>
          )}
        </div>

        {toast && <Toast key={toast.k} text={toast.text} />}
      </main>
    </div>
  )
}
