import React, { useState } from 'react'
import { submitContent } from '../api.js'

const SOURCE_TYPES = [
  { value: 'web_article', label: 'Web Article' },
  { value: 'news', label: 'News' },
  { value: 'research_paper', label: 'Research Paper' },
  { value: 'regulatory_document', label: 'Regulatory Document' },
  { value: 'social_media', label: 'Social Media' },
  { value: 'earnings_call', label: 'Earnings Call' },
  { value: 'blog_post', label: 'Blog Post' },
  { value: 'other', label: 'Other' },
]

const PERSPECTIVES = [
  { value: 'competitive_intelligence', label: 'Competitive Intelligence' },
  { value: 'market_trends', label: 'Market Trends' },
  { value: 'regulatory_landscape', label: 'Regulatory Landscape' },
  { value: 'consumer_sentiment', label: 'Consumer Sentiment' },
  { value: 'technology', label: 'Technology' },
  { value: 'finance', label: 'Finance' },
  { value: 'general', label: 'General' },
]

const BAND_CONFIG = {
  'AUTO-APPROVE': { bg: '#DCFCE7', border: '#86EFAC', text: '#16A34A', icon: '✓' },
  'AUTO-REJECT':  { bg: '#FEE2E2', border: '#FCA5A5', text: '#DC2626', icon: '✕' },
  'LAYER2':       { bg: '#FEF9C3', border: '#FDE047', text: '#CA8A04', icon: '⏳' },
}

const inputStyle = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #E8E8E8',
  color: '#111111',
  borderRadius: '8px',
  outline: 'none',
  width: '100%',
  padding: '10px 12px',
  fontSize: '0.875rem',
  transition: 'border-color 0.15s',
}

function SelectField({ label, value, onChange, options, placeholder }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none"
        style={{ ...inputStyle, color: value ? '#111111' : '#AAAAAA' }}
        onFocus={e => { e.target.style.borderColor = '#ce3e00' }}
        onBlur={e => { e.target.style.borderColor = '#E8E8E8' }}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  )
}

export default function SubmitPage() {
  const [form, setForm] = useState({
    source_type: '',
    perspective: '',
    filename: '',
    content: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const updateField = (field) => (val) => setForm((prev) => ({ ...prev, [field]: val }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.content.trim() || !form.source_type || !form.perspective) return
    setSubmitting(true)
    setResult(null)
    setError(null)
    try {
      const res = await submitContent(form)
      setResult(res)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const bandConfig = result ? (BAND_CONFIG[result.band || result.decision] || BAND_CONFIG['LAYER2']) : null
  const canSubmit = !submitting && form.content.trim() && form.source_type && form.perspective

  return (
    <div className="flex flex-col h-full overflow-y-auto" style={{ backgroundColor: '#f1f6fa' }}>
      <div className="max-w-2xl mx-auto w-full px-6 py-8">
        {/* Header */}
        <div className="mb-7">
          <h1 className="text-lg font-semibold mb-1" style={{ color: '#111111', letterSpacing: '-0.01em' }}>Submit Content</h1>
          <p className="text-sm" style={{ color: '#888888' }}>Add new intelligence to the knowledge base. Content will be scored and filtered automatically.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <SelectField
              label="Source Type"
              value={form.source_type}
              onChange={updateField('source_type')}
              options={SOURCE_TYPES}
              placeholder="Select source type…"
            />
            <SelectField
              label="Perspective"
              value={form.perspective}
              onChange={updateField('perspective')}
              options={PERSPECTIVES}
              placeholder="Select perspective…"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>
              Filename <span className="font-normal" style={{ color: '#AAAAAA' }}>(optional)</span>
            </label>
            <input
              type="text"
              value={form.filename}
              onChange={(e) => updateField('filename')(e.target.value)}
              placeholder="e.g. entities/myfitnesspal.md"
              style={inputStyle}
              onFocus={e => { e.target.style.borderColor = '#ce3e00' }}
              onBlur={e => { e.target.style.borderColor = '#E8E8E8' }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: '#374151' }}>Content</label>
            <textarea
              value={form.content}
              onChange={(e) => updateField('content')(e.target.value)}
              placeholder="Paste the raw content, article text, or notes here…"
              rows={12}
              style={{ ...inputStyle, resize: 'vertical', minHeight: '200px', lineHeight: '1.6' }}
              onFocus={e => { e.target.style.borderColor = '#ce3e00' }}
              onBlur={e => { e.target.style.borderColor = '#E8E8E8' }}
            />
          </div>

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3 rounded-xl text-sm font-medium text-white transition-all"
            style={{
              backgroundColor: canSubmit ? '#ce3e00' : '#F3F4F6',
              color: canSubmit ? '#FFFFFF' : '#AAAAAA',
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
          >
            {submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⟳</span>
                Submitting…
              </span>
            ) : (
              'Submit Content'
            )}
          </button>
        </form>

        {/* Error */}
        {error && (
          <div
            className="mt-5 p-4 rounded-xl text-sm"
            style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}
          >
            <span className="font-medium">Error: </span>{error}
          </div>
        )}

        {/* Result */}
        {result && bandConfig && (
          <div
            className="mt-5 p-5 rounded-xl"
            style={{ backgroundColor: bandConfig.bg, border: `1px solid ${bandConfig.border}` }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex items-center justify-center w-9 h-9 rounded-full text-lg font-bold"
                style={{ backgroundColor: `${bandConfig.text}18`, color: bandConfig.text }}
              >
                {bandConfig.icon}
              </div>
              <div>
                <div className="font-semibold text-sm" style={{ color: '#111111' }}>Filter Result</div>
                <div className="text-xs" style={{ color: bandConfig.text }}>
                  {result.band || result.decision || 'Processed'}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 text-sm">
              {result.maker_score != null && (
                <div className="flex items-center justify-between">
                  <span style={{ color: '#666666' }}>Maker Score</span>
                  <span className="font-mono font-medium" style={{ color: bandConfig.text }}>{result.maker_score.toFixed(3)}</span>
                </div>
              )}
              {result.checker_score != null && (
                <div className="flex items-center justify-between">
                  <span style={{ color: '#666666' }}>Checker Score</span>
                  <span className="font-mono font-medium" style={{ color: bandConfig.text }}>{result.checker_score.toFixed(3)}</span>
                </div>
              )}
              {result.reason && (
                <div
                  className="mt-2 px-3 py-2 rounded-lg text-xs"
                  style={{ backgroundColor: 'rgba(0,0,0,0.06)', color: '#444444' }}
                >
                  {result.reason}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
