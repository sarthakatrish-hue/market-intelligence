import React, { useState, useRef } from 'react'

export default function InputBar({ onSubmit, disabled }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)

  const handleSubmit = () => {
    const trimmed = value.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleChange = (e) => {
    setValue(e.target.value)
    const el = textareaRef.current
    if (el) {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 160) + 'px'
    }
  }

  const canSubmit = !disabled && value.trim()

  return (
    <div
      className="px-4 py-3"
      style={{ borderTop: '1px solid #E8E8E8', backgroundColor: '#f1f6fa' }}
    >
      <div
        className="flex items-end gap-2 rounded-2xl px-4 py-3 transition-all"
        style={{
          backgroundColor: '#FFFFFF',
          border: `1px solid ${canSubmit ? '#ce3e00' : '#E8E8E8'}`,
          boxShadow: canSubmit ? '0 0 0 3px rgba(206,62,0,0.08)' : 'none',
        }}
      >
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder="Ask about competitors, regulations, market signals…"
          className="flex-1 bg-transparent outline-none resize-none text-sm leading-relaxed"
          style={{
            color: '#111111',
            minHeight: '24px',
            maxHeight: '160px',
          }}
        />
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="flex items-center justify-center rounded-xl transition-all shrink-0"
          style={{
            width: 34,
            height: 34,
            backgroundColor: canSubmit ? '#ce3e00' : '#F3F4F6',
            color: canSubmit ? '#FFFFFF' : '#AAAAAA',
          }}
          title="Send"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
      <div className="text-center mt-1.5">
        <span className="text-xs" style={{ color: '#AAAAAA' }}>Press Enter to send · Shift+Enter for new line</span>
      </div>
    </div>
  )
}
