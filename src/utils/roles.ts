import type { ViewerRole } from '../types'

// Owner is a strictly-more-privileged admin (see backend Event.is_owner /
// is_admin) -- anywhere "admin" access is required, owner must
// pass too. Only isOwner() is used for the one place that's owner-only:
// granting/revoking owner or admin membership.
export const hasAdminAccess = (role: ViewerRole | undefined) => role === 'owner' || role === 'admin'
export const isOwner = (role: ViewerRole | undefined) => role === 'owner'
