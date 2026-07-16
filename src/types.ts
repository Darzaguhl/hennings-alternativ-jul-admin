export interface Skill {
  id: number
  name: string
}

export interface User {
  id: number
  username: string
  email: string
  first_name: string
  last_name: string
  experience_notes: string
}

export type ViewerRole = 'owner' | 'admin' | 'checkin_staff' | 'shift_leader' | 'volunteer' | null

export type CheckinMode = 'personal_qr' | 'event_qr'

export interface Event {
  id: number
  title: string
  description: string
  date: string | null
  code: string
  is_active: boolean
  signup_opens_at: string | null
  signup_closes_at: string | null
  signups_open: boolean
  checkin_mode: CheckinMode
  created_by: User
  viewer_role: ViewerRole
}

export type Criticality = 'normal' | 'critical'

export interface Shift {
  id: number
  event: number
  title: string
  date: string
  start_time: string
  end_time: string
  capacity: number | null
  min_capacity: number | null
  criticality: Criticality
  is_critical: boolean
  is_understaffed: boolean
  created_by: User
  leaders: User[]
  is_led_by_viewer: boolean
  participants: User[]
  signup_count: number
  assigned_count: number
  is_full: boolean
}

export interface ShiftConflict {
  id: number
  event: number
  shift_a: number
  shift_b: number
  shift_a_title: string
  shift_b_title: string
}

export interface OppgaveSlot {
  id: number
  event: number
  shift: number
  shift_title: string
  skill: number
  skill_name: string
  capacity: number | null
  signup_count: number
  assigned_count: number
  is_full: boolean
}

export type MembershipRole = 'owner' | 'admin' | 'checkin_staff'

export interface Membership {
  id: number
  event: number
  user: User
  role: MembershipRole
  created_at: string
}

export interface Invite {
  id: number
  event: number
  email: string
  role: MembershipRole
  invited_by: User
  created_at: string
  expires_at: string
  accepted_at: string | null
  is_usable: boolean
}

export interface InvitePreview {
  email: string
  role: MembershipRole
  event_title: string
  is_usable: boolean
}

export interface ShiftSignup {
  id: number
  shift: Shift
  oppgave_slot: OppgaveSlot
  user: User
  has_relevant_experience: boolean | null
  experience_notes: string
  created_at: string
}

export interface Assignment {
  id: number
  shift: Shift
  oppgave_slot: OppgaveSlot
  user: User
  confirmed_by: User
  confirmed_at: string
}

export interface PoolEntry {
  user: User
  checked_in_at: string
  candidates: ShiftSignup[]
  suggested_oppgave_slot: OppgaveSlot | null
}

export interface ShiftMetric {
  id: number
  title: string
  criticality: Criticality
  capacity: number | null
  min_capacity: number | null
  signup_count: number
  assigned_count: number
  is_full: boolean
  is_understaffed: boolean
}

export interface EventMetrics {
  date: string
  checked_in: number
  assigned: number
  in_pool: number
  shifts: ShiftMetric[]
}

export interface OppgaveHistoryYear {
  year: string
  signups: number
  assigned: number
}

export interface OppgaveHistoryEntry {
  title: string
  years: OppgaveHistoryYear[]
  total_signups: number
  total_assigned: number
  fill_rate: number | null
  oversubscription_factor: number | null
}
