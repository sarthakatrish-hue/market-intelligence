import React from 'react'

export default function MessageBubble({ text }) {
  return (
    <div className="flex justify-end mb-4">
      <div
        className="rounded-2xl px-4 py-3 text-sm text-white"
        style={{
          backgroundColor: '#ce3e00',
          maxWidth: '70%',
          lineHeight: 1.6,
          wordBreak: 'break-word',
        }}
      >
        {text}
      </div>
    </div>
  )
}
