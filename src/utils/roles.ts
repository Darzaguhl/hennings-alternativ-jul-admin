import type { ViewerRole } from '../types'

// Owner is a strictly-more-privileged superadmin (see backend Event.is_owner /
// is_superadmin) -- anywhere "superadmin" access is required, owner must
// pass too. Only isOwner() is used for the one place that's owner-only:
// granting/revoking owner or superadmin membership.
export const hasSuperadminAccess = (role: ViewerRole | undefined) => role === 'owner' || role === 'superadmin'
export const isOwner = (role: ViewerRole | undefined) => role === 'owner'
