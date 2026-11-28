import { ApiError } from '../../api/client'
import type { Acquisition, ForecastRow, PlanLine, PlanOutcome, PlanStatus } from '../../types'

// The work changes with the season, so the plan shows one slice at a time.
export type Mode = 'plan' | 'mottak' | 'evaluering'

export const defaultMode = (year: number, today = new Date()): Mode => {
  if (year < today.getFullYear()) return 'evaluering'
  // From just before Christmas Eve the job is receiving deliveries.
  return year === today.getFullYear() && today.getMonth() === 11 && today.getDate() >= 18 ? 'mottak' : 'plan'
}

export const STATUS_LABEL: Record<PlanStatus, string> = {
  planned: 'Planlagt',
  asked: 'Spurt',
  confirmed: 'Bekreftet',
  delivered: 'Mottatt',
  cancelled: 'Droppet',
}
export const STATUS_TONE: Record<PlanStatus, 'neutral' | 'warning' | 'success' | 'critical'> = {
  planned: 'neutral',
  asked: 'warning',
  confirmed: 'success',
  delivered: 'success',
  cancelled: 'critical',
}
export const OUTCOME_LABEL: Record<PlanOutcome, string> = {
  '': 'Ikke registrert',
  ran_out_early: 'Tomt tidlig',
  ran_out: 'Tomt',
  right: 'Passet',
  leftover: 'Rest igjen',
}
export const ACQ_LABEL: Record<Acquisition, string> = { gift: 'Gave', purchase: 'Kjøpt', mixed: 'Gave og kjøp', unknown: 'Ukjent' }
export const ACTION_ICON: Record<ForecastRow['action'], string> = { increase: '▲', decrease: '▼', keep: '＝', drop: '✕', none: '·' }
export const CONFIDENCE_LABEL = { high: 'sikker', medium: 'middels sikker', low: 'usikker' }

export const message = (err: unknown, fallback: string) => (err instanceof ApiError ? err.message || fallback : fallback)
export const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v))
export const trim = (v: string | number | null | undefined) => {
  const n = num(v)
  return n === null ? '—' : new Intl.NumberFormat('no-NO', { maximumFractionDigits: 2 }).format(n)
}
export const kr = (n: number) =>
  new Intl.NumberFormat('no-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(n)

// A suggestion is for an item as a whole. It can only be copied onto a line
// when that line *is* the whole item (one donor) and counts in the same unit;
// otherwise one donor would be asked for everyone's amount.
export const canApply = (line: PlanLine, suggestion: ForecastRow | undefined, linesForItem: number) =>
  !!suggestion &&
  linesForItem === 1 &&
  line.status !== 'cancelled' &&
  suggestion.action !== 'drop' &&
  suggestion.action !== 'none' &&
  suggestion.unit === line.unit &&
  num(line.quantity_requested) !== suggestion.suggested_quantity
