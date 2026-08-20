// Native <input type="date"> always *stores* a locale-independent value
// (YYYY-MM-DD), but Chrome's *displayed* digit order follows the
// browser's own UI language setting, not this app's or anything a site
// controls -- a visitor with their browser set to English sees
// MM/DD/YYYY regardless. Plain text inputs using these helpers to
// display/parse DD.MM.ÅÅÅÅ sidestep that, at the cost of the native
// calendar/scroll widgets. Shared across pages that need a date field
// (Vakter, Oversikt) so the parsing rules can't drift between them.
export const isoToDisplayDate = (iso: string) => {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export const displayToIsoDate = (display: string): string | null => {
  const match = display.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!match) return null
  const [, d, m, y] = match
  const day = Number(d)
  const month = Number(m)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}
