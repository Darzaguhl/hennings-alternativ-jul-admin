import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

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
