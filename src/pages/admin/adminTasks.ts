import { CalendarCog, CalendarDays, Users, type LucideIcon } from 'lucide-react'
import { ADMIN_ROUTES, type AdminRoutePath } from './adminRoutes'

export interface AdminTask {
  id: 'event' | 'players' | 'setup'
  title: string
  description: string
  path: AdminRoutePath
  icon: LucideIcon
}

/** The three dashboard cards. A new admin group is one entry here plus its route in AppRoutes. */
export const ADMIN_TASKS: readonly AdminTask[] = [
  { id: 'event', title: 'Weekly event', description: 'Enter results, manage the next RSVP list, add a player or guest.', path: ADMIN_ROUTES.event, icon: CalendarDays },
  { id: 'players', title: 'Players', description: 'Add, rename or archive players and review name claims.', path: ADMIN_ROUTES.players, icon: Users },
  { id: 'setup', title: 'Event setup', description: 'Change the event and RSVP dates.', path: ADMIN_ROUTES.setup, icon: CalendarCog },
]

export const DASHBOARD_TITLE = 'Admin dashboard'

const LEGACY_TITLES: Readonly<Record<string, string>> = {
  [ADMIN_ROUTES.results]: 'Enter weekly results',
  [ADMIN_ROUTES.events]: 'Event dates & RSVP',
  [ADMIN_ROUTES.claims]: 'Player name claims',
}

/** Title for a pathname, or null when it is not a known admin page. Tolerates a trailing slash. */
export function adminTitleFor(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  if (path === ADMIN_ROUTES.dashboard) return DASHBOARD_TITLE
  return ADMIN_TASKS.find((t) => t.path === path)?.title ?? LEGACY_TITLES[path] ?? null
}
