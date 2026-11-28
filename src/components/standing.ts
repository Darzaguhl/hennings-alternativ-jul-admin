import type { Standing, StandingLevel } from '../types'

export const STANDING_LABEL: Record<StandingLevel, string> = { good: 'Bra', concern: 'Følg opp', new: 'Ny' }
export const STANDING_TONE: Record<StandingLevel, 'success' | 'critical' | 'neutral'> = {
  good: 'success',
  concern: 'critical',
  new: 'neutral',
}

// Why the automatic rule says "follow up", in words.
export const explainStanding = (r: Standing) => {
  const parts: string[] = []
  if (r.reasons.includes('bekymring')) parts.push(`${r.ratings.bekymring} vurdering(er) med Bekymring`)
  if (r.reasons.includes('no_shows')) parts.push(`uteblitt på ${r.no_shows} av ${r.attended + r.no_shows} vakter`)
  return parts.join(' · ')
}
