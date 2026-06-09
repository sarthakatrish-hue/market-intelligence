// ─────────────────────────────────────────────────────────────────────────────
// Current user + roles — REAL AUTH (the swap-seam, now live)
//
// This file is the single seam between the app and "who is signed in". It used
// to read a fake identity from localStorage; it now reads the real session from
// the backend (`GET /api/me`), which returns exactly:
//
//     { name, email, roles: ['leader' | 'curator' | 'admin', …] }
//
// after Google OIDC login (@scapia.cards only). Roles are ADDITIVE — a user's
// capabilities are the union across their roles. Every authenticated user is at
// least a `leader`; `curator`/`admin` are granted by an admin. Because identity
// flows through useUser()/the capability helpers below, no consumer changed when
// auth went from stub → real: only this file did.
//
// The session lives in an httpOnly cookie (mi_session) the browser can't read —
// so there is no client-side identity to spoof. Frontend gating is convenience;
// the backend re-checks every request and returns 401/403 regardless of the UI.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useCallback, useEffect, useState } from 'react'
import React from 'react'
import { fetchMe, logout as apiLogout } from '../api.js'

// ── Auth context ─────────────────────────────────────────────────────────────
// { user, loading, refresh, signOut }. `user` is null until /api/me resolves
// (loading) and stays null when unauthenticated (→ App renders the LoginScreen).
const AuthCtx = createContext({ user: null, loading: true, refresh: () => {}, signOut: () => {} })

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const me = await fetchMe()
      setUser(me)
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    try { await apiLogout() } catch {}
    setUser(null)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  return React.createElement(AuthCtx.Provider, { value: { user, loading, refresh, signOut } }, children)
}

// Full auth state — used by App (loading/gate) and anything needing signOut/refresh.
export function useAuth() {
  return useContext(AuthCtx)
}

// The signed-in user object (or null). Drop-in replacement for the old hook so
// every existing `import { useUser } from '../auth/user.js'` keeps working.
export function useUser() {
  return useContext(AuthCtx).user
}

// ── Capabilities (union across roles; admin is superuser) ────────────────────
export function hasRole(user, role) {
  return !!user && Array.isArray(user.roles) && user.roles.includes(role)
}
export function isAdmin(user)   { return hasRole(user, 'admin') }
export function canQuery(user)  { return hasRole(user, 'admin') || hasRole(user, 'leader') }
export function canCurate(user) { return hasRole(user, 'admin') || hasRole(user, 'curator') }

// Map a capability key → boolean, for generic guards.
export function hasCapability(user, capability) {
  switch (capability) {
    case 'query':  return canQuery(user)
    case 'curate': return canCurate(user)
    case 'admin':  return isAdmin(user)
    case 'view':   return true
    default:       return false
  }
}
