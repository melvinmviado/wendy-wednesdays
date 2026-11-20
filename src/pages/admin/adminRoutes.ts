/** Every admin URL. Navigate with these, never with string literals. */
export const ADMIN_ROUTES = {
  dashboard: '/admin',
  event: '/admin/event',
  players: '/admin/players',
  setup: '/admin/setup',
  // Earlier single-task pages: still routed (the leaderboard's "Record Week" button uses results).
  results: '/admin/results',
  events: '/admin/events',
  claims: '/admin/claims',
} as const

export type AdminRoutePath = (typeof ADMIN_ROUTES)[keyof typeof ADMIN_ROUTES]
