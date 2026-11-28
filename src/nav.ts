// The menu: a handful of sections, each with tabs. One place decides who sees
// what, and a section with a single visible tab is shown as just that page (no
// tab bar). Paths are the same as before the grouping, so old links work.
import type { ViewerRole } from './types'
import { hasAdminAccess } from './utils/roles'

type Role = ViewerRole | undefined

interface TabDef {
  path: string
  label: string | ((role: Role) => string)
  /** Menu label when this is the only tab the viewer sees in its section. */
  soloLabel?: string
  show: (role: Role) => boolean
}

interface SectionDef {
  key: string
  label: string
  tabs: TabDef[]
}

export interface Section {
  key: string
  label: string
  tabs: { path: string; label: string }[]
}

const everyone = () => true
const admin = hasAdminAccess
const checkin = (r: Role) => admin(r) || r === 'checkin_staff'
const pool = (r: Role) => checkin(r) || r === 'shift_leader'
const team = (r: Role) => admin(r) || r === 'shift_leader'

const SECTIONS: SectionDef[] = [
  {
    key: 'oversikt',
    label: 'Oversikt',
    tabs: [
      { path: '/', label: 'Nå', soloLabel: 'Oversikt', show: everyone },
      { path: '/historikk', label: 'Historikk', show: admin },
    ],
  },
  {
    key: 'innsjekk',
    label: 'Innsjekk',
    tabs: [
      { path: '/innsjekk', label: 'Innsjekk', show: checkin },
      { path: '/pool', label: 'Pool & tildeling', show: pool },
      { path: '/oppmote', label: 'Oppmøte', show: admin },
    ],
  },
  {
    key: 'frivillige',
    label: 'Frivillige',
    tabs: [
      { path: '/frivillige', label: 'Liste', soloLabel: 'Frivillige', show: pool },
      { path: '/team', label: (r) => (r === 'shift_leader' ? 'Mitt team' : 'Team og vurdering'), show: team },
    ],
  },
  {
    key: 'mat',
    label: 'Mat & lager',
    tabs: [
      { path: '/matplan', label: 'Matplan', show: admin },
      { path: '/givere', label: 'Givere', show: admin },
      { path: '/lager', label: 'Lager', show: admin },
    ],
  },
  {
    key: 'oppsett',
    label: 'Oppsett',
    tabs: [
      { path: '/arrangement', label: 'Arrangement', show: admin },
      { path: '/vakter', label: 'Vakter', show: everyone },
      { path: '/oppgaver', label: 'Oppgaver', show: admin },
      { path: '/roller', label: 'Roller', show: admin },
    ],
  },
]

export const visibleSections = (role: Role): Section[] =>
  SECTIONS.flatMap((section) => {
    const tabs = section.tabs.filter((t) => t.show(role))
    if (tabs.length === 0) return []
    const solo = tabs.length === 1
    const resolved = tabs.map((t) => ({ path: t.path, label: typeof t.label === 'function' ? t.label(role) : t.label }))
    return [{ key: section.key, label: solo ? (tabs[0].soloLabel ?? resolved[0].label) : section.label, tabs: resolved }]
  })
