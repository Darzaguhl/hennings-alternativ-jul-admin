import { useEffect, useState } from 'react'
import { Input, Label } from '../ui'

// A number that saves when you leave the field.
export function NumberField({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string | null) => void }) {
  const shown = value === null ? '' : String(Number(value))
  const [text, setText] = useState(shown)
  useEffect(() => setText(shown), [shown])
  return (
    <div>
      <Label>{label}</Label>
      <Input
        inputMode="decimal"
        aria-label={label}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const cleaned = text.trim().replace(',', '.')
          if (cleaned === shown || (cleaned !== '' && shown !== '' && Number(cleaned) === Number(shown))) return
          if (cleaned !== '' && Number.isNaN(Number(cleaned))) return setText(shown)
          onSave(cleaned === '' ? null : cleaned)
        }}
      />
    </div>
  )
}

// Free text that saves when you leave the field.
export function TextField({
  label,
  value,
  onSave,
  multiline = false,
}: {
  label: string
  value: string
  onSave: (v: string) => void
  multiline?: boolean
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  const common = {
    'aria-label': label,
    value: text,
    onChange: (e: { target: { value: string } }) => setText(e.target.value),
    onBlur: () => {
      if (text !== value) onSave(text)
    },
  }
  return (
    <div>
      <Label>{label}</Label>
      {multiline ? (
        <textarea
          rows={3}
          className="w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none"
          {...common}
        />
      ) : (
        <Input {...common} />
      )}
    </div>
  )
}
