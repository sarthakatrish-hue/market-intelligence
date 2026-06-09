// ─────────────────────────────────────────────────────────────────────────────
// LoginScreen — shown when /api/me says nobody is signed in.
//
// "Continue with Google" hands off to the backend OAuth start URL; the backend
// drives the whole dance and redirects home with a session cookie. Access is
// restricted to @scapia.cards — a wrong-domain attempt comes back to "/" with
// ?auth_error=domain, which we surface here.
// ─────────────────────────────────────────────────────────────────────────────
import React, { useState } from 'react'
import { LOGIN_URL } from '../api.js'

const BRAND = {
  orange: '#ce3e00', orangeHover: '#b83600',
  dark: '#111111', muted: '#888888', border: '#E8E8E8',
  font: '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const AUTH_ERRORS = {
  domain: 'Use your @scapia.cards account — access is limited to the Scapia workspace.',
  state:  'Login session expired. Please try again.',
  nocode: 'Login was cancelled. Please try again.',
  exchange: "Couldn't complete sign-in with Google. Please try again.",
}

function GoogleMark({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

export default function LoginScreen() {
  const [hover, setHover] = useState(false)
  const err = new URLSearchParams(window.location.search).get('auth_error')
  const errMsg = err ? (AUTH_ERRORS[err] || 'Sign-in failed. Please try again.') : null

  return (
    <div style={{
      minHeight: '100vh', width: '100%', background: '#f1f6fa',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 40, fontFamily: BRAND.font,
    }}>
      <div style={{
        background: '#fff', border: `1px solid ${BRAND.border}`, borderRadius: 16,
        boxShadow: '0 12px 40px rgba(17,17,17,0.08)', padding: '44px 40px',
        width: 420, maxWidth: '100%', textAlign: 'center',
      }}>
        <div style={{
          fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', color: BRAND.dark,
        }}>
          scapia<span style={{ color: BRAND.orange }}>.</span>
        </div>
        <div style={{
          fontSize: 12, fontWeight: 600, letterSpacing: '0.22em', textTransform: 'uppercase',
          color: BRAND.orange, marginTop: 6,
        }}>
          Market Intelligence
        </div>

        <div style={{ fontSize: 14, color: BRAND.muted, lineHeight: 1.55, marginTop: 22, maxWidth: 320, marginInline: 'auto' }}>
          Sign in with your Scapia account to continue.
        </div>

        {errMsg && (
          <div style={{
            marginTop: 18, padding: '10px 14px', borderRadius: 10, textAlign: 'left',
            background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.18)',
            color: '#B91C1C', fontSize: 12.5, lineHeight: 1.5,
          }}>
            {errMsg}
          </div>
        )}

        <a
          href={LOGIN_URL}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            marginTop: 26, width: '100%', boxSizing: 'border-box', textDecoration: 'none',
            padding: '12px 18px', borderRadius: 11, fontSize: 14, fontWeight: 600,
            fontFamily: BRAND.font, color: '#fff', cursor: 'pointer',
            background: hover ? BRAND.orangeHover : BRAND.orange, transition: 'background .14s',
          }}
        >
          <span style={{
            display: 'inline-flex', width: 22, height: 22, borderRadius: '50%', background: '#fff',
            alignItems: 'center', justifyContent: 'center',
          }}><GoogleMark /></span>
          Continue with Google
        </a>

        <div style={{ fontSize: 11.5, color: '#AAAAAA', marginTop: 18, lineHeight: 1.5 }}>
          Access is restricted to @scapia.cards accounts.
        </div>
      </div>
    </div>
  )
}
