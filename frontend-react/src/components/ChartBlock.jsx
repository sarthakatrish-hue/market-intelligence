import React from 'react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid,
} from 'recharts'

// Mono terminal palette — single accent (orange) against ink, no rainbow
const ORANGE = '#ce3e00'
const INK = '#111111'
const MUTED = '#888888'
const RULE = '#ECECEC'
const BORDER = '#E8E8E8'
const PAPER = '#FFFFFF'
const INK_04 = 'rgba(17,17,17,0.04)'
const SANS = '"Lexend Deca", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const MONO = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

// Donut needs multiple slices — but we keep it monochromatic (shades of ink),
// not rainbow. The first slice is orange (highlight), the rest are tonal greys.
const CHART_COLORS = ['#ce3e00', '#111111', '#444444', '#666666', '#888888', '#aaaaaa', '#cccccc']

// ── Parse the simple YAML-like spec ──────────────────────────────
function parseSpec(raw) {
  const spec = { type: 'bar', title: '', unit: '', data: [] }
  const lines = (raw || '').trim().split('\n')
  let inData = false
  let cur = null

  const v = (line) => {
    const idx = line.indexOf(':')
    return idx < 0 ? '' : line.slice(idx + 1).trim().replace(/^["']|["']$/g, '')
  }

  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    if (t === 'data:') { inData = true; continue }
    if (!inData) {
      if (t.startsWith('type:'))  spec.type  = v(t)
      if (t.startsWith('title:')) spec.title = v(t)
      if (t.startsWith('unit:'))  spec.unit  = v(t)
    } else {
      if (t.startsWith('- label:')) {
        if (cur) spec.data.push(cur)
        cur = { label: v(t.slice(2)), value: 0, note: '' }
      } else if (cur && t.startsWith('value:')) {
        cur.value = parseFloat(v(t)) || 0
      } else if (cur && t.startsWith('note:')) {
        cur.note = v(t)
      }
    }
  }
  if (cur) spec.data.push(cur)
  return spec
}

// ─────────────────────────────────────────────────────────────────
// Smart unit formatting. The model writes things like:
//   unit: "₹"      → prefix
//   unit: "%"      → suffix
//   unit: "₹/yr"   → split: ₹ prefix + /yr suffix
//   unit: "K"      → suffix
//   unit: "users"  → suffix (with leading space)
// Also formats the numeric value with thousands separators.
// ─────────────────────────────────────────────────────────────────
function splitUnit(unit) {
  if (!unit) return { prefix: '', suffix: '' }
  // Currency symbols that go BEFORE the number
  const currencyMatch = unit.match(/^([₹$€£¥])(.*)$/)
  if (currencyMatch) {
    const suffix = currencyMatch[2] || ''
    return { prefix: currencyMatch[1], suffix }
  }
  return { prefix: '', suffix: unit }
}

function formatTickValue(value, unit) {
  const { prefix, suffix } = splitUnit(unit)
  const num = typeof value === 'number' ? value.toLocaleString() : value
  // Add a thin space before alphabetic suffixes for readability ("11,988/yr" vs
  // "11,988 users") — leave /-prefixed suffixes flush against the number.
  const sep = suffix && /^[A-Za-z]/.test(suffix) ? ' ' : ''
  return `${prefix}${num}${sep}${suffix}`
}

// ── Custom tooltip ────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, unit }) {
  if (!active || !payload?.length) return null
  const d = payload[0]
  const entry = d.payload || {}
  return (
    <div style={{
      backgroundColor: PAPER, border: `1px solid ${BORDER}`,
      padding: '8px 12px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      fontFamily: MONO,
    }}>
      <div style={{ fontWeight: 500, color: INK, fontSize: 11, marginBottom: 2, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label || d.name}
      </div>
      <div style={{ color: ORANGE, fontWeight: 600, fontSize: 15, letterSpacing: '-0.01em' }}>
        {formatTickValue(d.value, unit)}
      </div>
      {entry.note && (
        <div style={{ color: MUTED, fontSize: 10, marginTop: 4, letterSpacing: '0.04em', fontFamily: MONO }}>{entry.note}</div>
      )}
    </div>
  )
}

// ── Shared container — sharp 1px border, mono title kicker ──────────
function ChartContainer({ title, children }) {
  return (
    <div style={{
      background: PAPER,
      border: `1px solid ${BORDER}`,
      padding: '16px 18px 12px',
      margin: '12px 0',
    }}>
      {title && (
        <div style={{
          fontFamily: MONO,
          fontSize: 10,
          fontWeight: 600,
          color: ORANGE,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}>
          {title}
          <span style={{ flex: 1, height: 1, background: RULE }} />
        </div>
      )}
      {children}
    </div>
  )
}

const TICK_STYLE = { fontSize: 10.5, fill: MUTED, fontFamily: MONO, letterSpacing: '0.04em' }

// ── Bar chart ─────────────────────────────────────────────────────
function BarChartBlock({ spec }) {
  return (
    <ChartContainer title={spec.title}>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={spec.data} margin={{ top: 4, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={RULE} vertical={false} />
          <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false}
            tickFormatter={(v) => formatTickValue(v, spec.unit)} />
          <Tooltip content={<ChartTooltip unit={spec.unit} />} cursor={{ fill: '#FFF7F4' }} />
          <Bar dataKey="value" fill={ORANGE} radius={0} maxBarSize={52} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

// ── Horizontal bar chart ──────────────────────────────────────────
function HorizontalBarBlock({ spec }) {
  const h = Math.max(180, spec.data.length * 46)
  // Find longest label for YAxis width
  const maxLabelLen = Math.max(...spec.data.map(d => (d.label || '').length))
  const yAxisWidth = Math.min(Math.max(maxLabelLen * 7, 80), 140)

  return (
    <ChartContainer title={spec.title}>
      <ResponsiveContainer width="100%" height={h}>
        <BarChart data={spec.data} layout="vertical" margin={{ top: 4, right: 40, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={RULE} horizontal={false} />
          <XAxis type="number" tick={TICK_STYLE} axisLine={false} tickLine={false}
            tickFormatter={(v) => formatTickValue(v, spec.unit)} />
          <YAxis type="category" dataKey="label" tick={TICK_STYLE} axisLine={false}
            tickLine={false} width={yAxisWidth} />
          <Tooltip content={<ChartTooltip unit={spec.unit} />} cursor={{ fill: '#FFF7F4' }} />
          <Bar dataKey="value" fill={ORANGE} radius={0} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

// ── Line chart ────────────────────────────────────────────────────
function LineChartBlock({ spec }) {
  return (
    <ChartContainer title={spec.title}>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={spec.data} margin={{ top: 4, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#F3F3F3" />
          <XAxis dataKey="label" tick={TICK_STYLE} axisLine={false} tickLine={false} />
          <YAxis tick={TICK_STYLE} axisLine={false} tickLine={false}
            tickFormatter={(v) => formatTickValue(v, spec.unit)} />
          <Tooltip content={<ChartTooltip unit={spec.unit} />} />
          <Line type="monotone" dataKey="value" stroke={ORANGE} strokeWidth={2.5}
            dot={{ fill: ORANGE, r: 4, strokeWidth: 0 }}
            activeDot={{ r: 6, fill: ORANGE }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  )
}

// ── Donut chart ───────────────────────────────────────────────────
function DonutBlock({ spec }) {
  const total = spec.data.reduce((s, d) => s + d.value, 0)
  return (
    <ChartContainer title={spec.title}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap' }}>
        <div style={{ flexShrink: 0 }}>
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie data={spec.data} cx="50%" cy="50%" innerRadius={46} outerRadius={72}
                dataKey="value" paddingAngle={2} startAngle={90} endAngle={450}>
                {spec.data.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<ChartTooltip unit={spec.unit} />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {spec.data.map((item, i) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                fontSize: 12, fontFamily: MONO, letterSpacing: '0.02em',
                borderTop: i === 0 ? 'none' : `1px solid ${RULE}`,
                paddingTop: i === 0 ? 0 : 8,
                paddingBottom: i === spec.data.length - 1 ? 0 : 8,
              }}>
                <div style={{
                  width: 7, height: 7,
                  backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
                  flexShrink: 0,
                }} />
                <span style={{ color: '#555', fontFamily: SANS }}>{item.label}</span>
                <span style={{ fontWeight: 500, color: INK, marginLeft: 'auto', paddingLeft: 12, fontFamily: MONO }}>
                  {formatTickValue(item.value, spec.unit)}
                </span>
                <span style={{ color: MUTED, fontSize: 10.5, width: 36, textAlign: 'right' }}>
                  {pct}%
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </ChartContainer>
  )
}

// ── Main export ───────────────────────────────────────────────────
export default function ChartBlock({ raw }) {
  const spec = parseSpec(raw)
  if (!spec.data.length) return null

  if (spec.type === 'bar')             return <BarChartBlock spec={spec} />
  if (spec.type === 'horizontal-bar')  return <HorizontalBarBlock spec={spec} />
  if (spec.type === 'line')            return <LineChartBlock spec={spec} />
  if (spec.type === 'donut')           return <DonutBlock spec={spec} />
  return null
}
