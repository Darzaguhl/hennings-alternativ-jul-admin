import type {
  Assignment,
  Event,
  EventMetrics,
  Invite,
  InvitePreview,
  Membership,
  MembershipRole,
  OppgaveHistoryEntry,
  OppgaveSlot,
  PoolEntry,
  Shift,
  ShiftConflict,
  Skill,
  User,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL as string

const ACCESS_KEY = 'haj_admin_access'
const REFRESH_KEY = 'haj_admin_refresh'

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set: (access: string, refresh: string) => {
    localStorage.setItem(ACCESS_KEY, access)
    localStorage.setItem(REFRESH_KEY, refresh)
  },
  setAccess: (access: string) => localStorage.setItem(ACCESS_KEY, access),
  clear: () => {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

// Set by AuthProvider on mount so a dead session (both the access token
// expired AND the refresh call failing, e.g. because the backend is still
// waking up from Render free-tier sleep) clears React's user state and
// lets the existing <ProtectedRoute> redirect via React Router. A hard
// window.location.assign('/login') from here used to do this instead --
// same anti-pattern already fixed once for login() (see "Fix wrong-
// password login showing as a page reload/not-found") -- forcing a real
// browser navigation out from under an in-flight SPA render is exactly
// what was producing the same "Not Found" flash on refresh right after a
// backend restart.
let onSessionExpired: (() => void) | null = null
export const setSessionExpiredHandler = (fn: (() => void) | null) => {
  onSessionExpired = fn
}

export class ApiError extends Error {
  status: number
  body: unknown
  constructor(status: number, body: unknown, message: string) {
    super(message)
    this.status = status
    this.body = body
  }
}

const extractErrorMessage = (body: unknown): string => {
  if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>
    if (typeof obj.detail === 'string') return obj.detail
    const firstKey = Object.keys(obj)[0]
    if (firstKey) {
      const value = obj[firstKey]
      if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
      if (typeof value === 'string') return value
    }
  }
  return 'Noe gikk galt. Prøv igjen.'
}

let refreshPromise: Promise<string | null> | null = null

const refreshAccessToken = async (): Promise<string | null> => {
  const refresh = tokenStore.getRefresh()
  if (!refresh) return null
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE_URL}/api/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
      .then(async (res) => {
        if (!res.ok) return null
        const data = (await res.json()) as { access: string }
        tokenStore.setAccess(data.access)
        return data.access
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

interface RequestOptions {
  method?: string
  body?: unknown
  params?: Record<string, string | number | undefined>
}

const buildUrl = (path: string, params?: RequestOptions['params']) => {
  const url = new URL(`${API_BASE_URL}${path}`)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) url.searchParams.set(key, String(value))
    })
  }
  return url.toString()
}

async function request<T>(path: string, options: RequestOptions = {}, retry = true): Promise<T> {
  const access = tokenStore.getAccess()
  const res = await fetch(buildUrl(path, options.params), {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  })

  if (res.status === 401 && retry) {
    const newAccess = await refreshAccessToken()
    if (newAccess) return request<T>(path, options, false)
    tokenStore.clear()
    onSessionExpired?.()
    throw new ApiError(401, null, 'Session expired')
  }

  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, body, extractErrorMessage(body))
  return body as T
}

export const api = {
  // Unauthenticated, and a wrong-password 401 here is a normal outcome, not
  // an expired session — bypass request()'s refresh-then-hard-redirect logic
  // so the error surfaces inline on the login form instead of reloading the page.
  login: (email: string, password: string) =>
    fetch(`${API_BASE_URL}/api/token/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(async (res) => {
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new ApiError(res.status, body, extractErrorMessage(body))
      return body as { access: string; refresh: string }
    }),

  me: () => request<User>('/api/users/me/'),
  users: () => request<User[]>('/api/users/'),
  deleteUser: (userId: number) => request<void>(`/api/users/${userId}/`, { method: 'DELETE' }),
  userNotes: (userId: number) => request<{ id: number; email: string; admin_notes: string }>(`/api/users/${userId}/notes/`),
  updateUserNotes: (userId: number, adminNotes: string) =>
    request<{ id: number; email: string; admin_notes: string }>(`/api/users/${userId}/notes/`, {
      method: 'PATCH',
      body: { admin_notes: adminNotes },
    }),

  events: () => request<Event[]>('/api/events/'),
  event: (id: number) => request<Event>(`/api/events/${id}/`),
  createEvent: (data: Partial<Event>) => request<Event>('/api/events/', { method: 'POST', body: data }),
  updateEvent: (id: number, data: Partial<Event>) =>
    request<Event>(`/api/events/${id}/`, { method: 'PATCH', body: data }),
  deleteEvent: (id: number) => request<void>(`/api/events/${id}/`, { method: 'DELETE' }),
  activateEvent: (id: number) => request<Event>(`/api/events/${id}/activate/`, { method: 'POST' }),
  deactivateEvent: (id: number) => request<Event>(`/api/events/${id}/deactivate/`, { method: 'POST' }),

  shifts: (eventId: number) => request<Shift[]>('/api/shifts/', { params: { event: eventId } }),
  createShift: (data: Partial<Shift> & { event: number }) =>
    request<Shift>('/api/shifts/', { method: 'POST', body: data }),
  updateShift: (id: number, data: Partial<Shift> & { leader_ids?: number[] }) =>
    request<Shift>(`/api/shifts/${id}/`, { method: 'PATCH', body: data }),
  deleteShift: (id: number) => request<void>(`/api/shifts/${id}/`, { method: 'DELETE' }),
  shiftAssignments: (id: number) => request<Assignment[]>(`/api/shifts/${id}/assignments/`),

  shiftConflicts: (eventId: number) =>
    request<ShiftConflict[]>('/api/shift-conflicts/', { params: { event: eventId } }),
  createShiftConflict: (eventId: number, shiftAId: number, shiftBId: number) =>
    request<ShiftConflict>('/api/shift-conflicts/', {
      method: 'POST',
      body: { event: eventId, shift_a: shiftAId, shift_b: shiftBId },
    }),
  deleteShiftConflict: (id: number) => request<void>(`/api/shift-conflicts/${id}/`, { method: 'DELETE' }),

  oppgaveSlots: (params: { event?: number; shift?: number }) =>
    request<OppgaveSlot[]>('/api/oppgave-slots/', { params }),
  createOppgaveSlot: (shiftId: number, skillId: number, capacity: number | null) =>
    request<OppgaveSlot>('/api/oppgave-slots/', {
      method: 'POST',
      body: { shift: shiftId, skill: skillId, capacity },
    }),
  deleteOppgaveSlot: (id: number) => request<void>(`/api/oppgave-slots/${id}/`, { method: 'DELETE' }),

  skills: () => request<Skill[]>('/api/skills/'),
  createSkill: (data: Partial<Skill>) => request<Skill>('/api/skills/', { method: 'POST', body: data }),
  updateSkill: (id: number, data: Partial<Skill>) =>
    request<Skill>(`/api/skills/${id}/`, { method: 'PATCH', body: data }),
  deleteSkill: (id: number) => request<void>(`/api/skills/${id}/`, { method: 'DELETE' }),

  memberships: (eventId: number) => request<Membership[]>(`/api/events/${eventId}/memberships/`),
  addMembership: (eventId: number, userId: number, role: MembershipRole) =>
    request<Membership>(`/api/events/${eventId}/memberships/`, {
      method: 'POST',
      body: { user_id: userId, role },
    }),
  removeMembership: (eventId: number, membershipId: number) =>
    request<void>(`/api/events/${eventId}/remove-membership/`, {
      method: 'POST',
      body: { membership_id: membershipId },
    }),

  invites: (eventId: number) => request<Invite[]>(`/api/events/${eventId}/invites/`),
  createInvite: (eventId: number, email: string, role: MembershipRole) =>
    request<Invite>(`/api/events/${eventId}/invites/`, { method: 'POST', body: { email, role } }),
  revokeInvite: (eventId: number, inviteId: number) =>
    request<void>(`/api/events/${eventId}/revoke-invite/`, { method: 'POST', body: { invite_id: inviteId } }),

  // Unauthenticated: no access token exists yet for someone accepting an
  // invite, so these bypass the normal Authorization-header request().
  inviteByToken: (token: string) =>
    fetch(`${API_BASE_URL}/api/invites/${token}/`).then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, null, 'Invite not found')
      return (await res.json()) as InvitePreview
    }),
  acceptInvite: (token: string, password: string) =>
    fetch(`${API_BASE_URL}/api/invites/accept/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    }).then(async (res) => {
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new ApiError(res.status, body, extractErrorMessage(body))
      return body as { access: string; refresh: string; user: User; event: Event }
    }),

  pool: (eventId: number, date?: string) =>
    request<PoolEntry[]>(`/api/events/${eventId}/pool/`, { params: { date } }),
  assign: (eventId: number, userId: number, oppgaveSlotId: number) =>
    request<Assignment>(`/api/events/${eventId}/assign/`, {
      method: 'POST',
      body: { user_id: userId, oppgave_slot_id: oppgaveSlotId },
    }),
  checkinByCode: (eventId: number, userCode: string) =>
    request<{ status: string; message: string; user: User }>(`/api/events/${eventId}/checkin/`, {
      method: 'POST',
      body: { user_code: userCode },
    }),
  checkinByUserId: (eventId: number, userId: number) =>
    request<{ status: string; message: string; user: User }>(`/api/events/${eventId}/checkin/`, {
      method: 'POST',
      body: { user_id: userId },
    }),

  metrics: (eventId: number, date?: string) =>
    request<EventMetrics>(`/api/events/${eventId}/metrics/`, { params: { date } }),

  oppgaveHistory: () => request<OppgaveHistoryEntry[]>('/api/metrics/oppgave-history/'),
}
