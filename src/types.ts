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
  // Only present where the backend uses MeSerializer -- your own profile
  // (/me) and the roster (users list/retrieve, already gated to
  // admin/staff/leader). Absent on the plain UserSerializer embedded in
  // shift participants/leaders/pool/assignments, which every volunteer on
  // a shift can see -- see MeSerializer's docstring on the backend.
  phone?: string | null
  address?: string
  birthdate?: string | null
  about?: string
  // Derived from real Assignment history (checked in and placed in an
  // oppgave), not self-reported -- only present via MeSerializer, same
  // scoping as the other optional fields above.
  participation_years?: string[]
}

export type ViewerRole = 'owner' | 'admin' | 'checkin_staff' | 'shift_leader' | 'volunteer' | null

export type CheckinMode = 'personal_qr' | 'event_qr'

// Who besides admins can read post-event ratings: 'own' = a leader sees only
// the ratings they gave; 'team' = also fellow leaders' ratings on their vakter.
export type RatingVisibility = 'own' | 'team'

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
  rating_visibility: RatingVisibility
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
  // The vakt's number, if it's one of the main numbered vakter (e.g. 5
  // for "Vakt 5") -- used for the X1 vaktleder eligibility rule (>=2 of
  // vakt 5-10). null for non-numbered vakter (lettered prep/teardown
  // ones, etc.).
  vakt_number: number | null
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

export interface X1Signup {
  id: number
  event: number
  user: number
  created_at: string
}

export interface InventoryCategory {
  id: number
  name: string
}

export type InventoryDirection = 'in' | 'out'

export interface InventoryItem {
  id: number
  event: number
  category: number
  category_name: string
  description: string
  quantity: number
  direction: InventoryDirection
  photo: string | null
  logged_by: number | null
  logged_by_email: string | null
  note: string
  created_at: string
}

export interface InventorySummaryRow {
  category: number
  category_name: string
  in_total: number
  out_total: number
  net: number
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

// A leader's internal "fremhev" flag -- see backend Commendation. Never
// shown to the flagged volunteer; the API only returns it to event admins
// and to the leader who raised it.
export interface Commendation {
  id: number
  event: number
  user: number
  user_email: string
  user_name: string
  shift: number
  shift_title: string
  oppgave_slot: number | null
  skill_name: string | null
  flagged_by: number | null
  flagged_by_email: string | null
  note: string
  created_at: string
}

export type RatingLevel = 'utmerket' | 'god' | 'ok' | 'bekymring'

// A leader's or admin's internal post-event rating of a volunteer on one
// vakt -- see backend Rating. Never shown to the rated volunteer.
export interface Rating {
  id: number
  event: number
  user: number
  user_email: string
  user_name: string
  shift: number
  shift_title: string
  oppgave_slot: number | null
  skill_name: string | null
  rated_by: number | null
  rated_by_email: string | null
  level: RatingLevel
  note: string
  created_at: string
  updated_at: string
}

export type StandingLevel = 'good' | 'concern' | 'new'
export type StandingOverrideLevel = 'good' | 'concern'

// A volunteer's internal standing -- see backend api/standing.py. Derived
// from ratings, check-ins and flags, with an optional admin override. Admin-
// only; never shown to the volunteer.
export interface Standing {
  user: number
  user_email: string
  user_name: string
  standing: StandingLevel // the effective one: override if set, else computed
  computed: StandingLevel
  reasons: ('bekymring' | 'no_shows')[]
  override: StandingOverrideLevel | null
  override_note: string
  ratings: Record<RatingLevel, number>
  commendations: number
  attended: number
  walk_ins: number
  no_shows: number
  excused: number
  upcoming: number
  no_show_rate: number | null
  events: number
}

export type AttendanceStatus = 'attended' | 'walk_in' | 'no_show' | 'excused' | 'upcoming'

export interface AttendancePerson {
  user: number
  user_email: string
  user_name: string
  status: AttendanceStatus
  oppgaver: string[]
  assigned: string | null
  excuse_note: string
}

// One event day: who signed up, who actually arrived, who didn't. A past
// signup with no check-in is a no-show unless an admin has excused it.
export interface AttendanceDay {
  date: string
  signed_up: number
  checked_in: number
  no_shows: number
  excused: number
  people: AttendancePerson[]
}
