import { useCallback, useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { UnsavedContext } from './unsaved'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-6 shadow-sm ${className}`}>{children}</div>
  )
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-green-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const base = 'rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'
  const styles = {
    primary: 'bg-green-700 text-cream-50 hover:bg-green-800',
    secondary: 'bg-cream-200 text-ink-900 hover:bg-cream-50 border border-cream-200',
    danger: 'bg-red-600/10 text-red-600 hover:bg-red-600/20',
  }
  return <button className={`${base} ${styles[variant]} ${className}`} {...props} />
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none ${props.className ?? ''}`}
    />
  )
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-cream-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-gold-500 focus:outline-none ${props.className ?? ''}`}
    />
  )
}

// The native <input type="file"> renders as a bare, browser-default
// "Choose File" control with no styling hook of its own -- wrapping a
// visually-hidden input in a styled <label> (labels forward clicks to
// their input) gets it to match Button's look instead.
export function FileInput({
  onChange,
  accept,
  fileName,
  chooseLabel = 'Velg bilde',
  changeLabel = 'Bytt bilde',
  className = '',
}: {
  onChange: (file: File | null) => void
  accept?: string
  fileName?: string | null
  /** Button text before / after a file is chosen (defaults suit the photo uploads). */
  chooseLabel?: string
  changeLabel?: string
  className?: string
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-cream-200 bg-cream-200 px-4 py-2 text-sm font-medium text-ink-900 transition-colors hover:bg-cream-50 ${className}`}
    >
      <span>{fileName ? changeLabel : chooseLabel}</span>
      <input
        type="file"
        accept={accept}
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  )
}

export function Label({ children }: { children: ReactNode }) {
  return <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-600">{children}</label>
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'critical' | 'success' | 'warning' }) {
  const tones = {
    neutral: 'bg-cream-200 text-ink-700',
    critical: 'bg-red-600/10 text-red-600',
    success: 'bg-green-700/10 text-green-800',
    warning: 'bg-gold-500/20 text-gold-600',
  }
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>{children}</span>
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null
  return <p className="text-sm text-red-600">{children}</p>
}

// A panel that slides over the right-hand side, for editing one thing without
// leaving the list. Escape or clicking outside closes it. Two kinds of field
// can be inside: ones that save when they lose focus (so Escape blurs the
// active field first), and forms with their own save button, which report
// unsaved input (see unsaved.ts) so that closing asks before discarding it.
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const unsaved = useRef(new Set<string>())
  const report = useCallback((id: string, dirty: boolean) => {
    if (dirty) unsaved.current.add(id)
    else unsaved.current.delete(id)
  }, [])
  const requestClose = () => {
    if (unsaved.current.size > 0 && !confirm('Du har noe som ikke er lagret. Lukke likevel?')) return
    onClose()
  }
  const closeRef = useRef(requestClose)
  useEffect(() => {
    closeRef.current = requestClose
  })
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      ;(document.activeElement as HTMLElement | null)?.blur()
      closeRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <button className="absolute inset-0 cursor-default bg-green-900/30" aria-label="Lukk panelet" tabIndex={-1} onClick={requestClose} />
      <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-cream-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-green-900">{title}</h2>
          <button className="rounded-lg px-2 py-1 text-ink-600 hover:bg-cream-100" aria-label="Lukk" onClick={requestClose}>
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">
          <UnsavedContext.Provider value={report}>{children}</UnsavedContext.Provider>
        </div>
      </div>
    </div>
  )
}

// A button that opens a short list of rarely used actions.
export function Menu({ label, items }: { label: string; items: { label: string; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const escape = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', outside)
      document.removeEventListener('keydown', escape)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label} ▾
      </Button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border border-cream-200 bg-white py-1 shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              className="block w-full px-4 py-2 text-left text-sm text-ink-900 hover:bg-cream-100"
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// A row of mutually exclusive choices ("which view am I in").
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (value: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div className="inline-flex rounded-lg border border-cream-200 bg-cream-200 p-0.5" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === o.value ? 'bg-white text-green-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
