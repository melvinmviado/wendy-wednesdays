import { useEventSettings } from '../../hooks/useEventSettings'
import { useRsvp } from '../../hooks/useRsvp'
import type { AdminContext } from './adminContext'
import type { AdminTask } from './adminTasks'

/** Live short status for a dashboard card; a card with nothing worth showing has no entry. */
export function useAdminBadges(claimQueue: AdminContext['claimQueue']): Partial<Record<AdminTask['id'], string>> {
  const { settings } = useEventSettings()
  const rsvp = useRsvp({ isAdmin: true, settings }) // the dashboard is already behind the admin guard

  const badges: Partial<Record<AdminTask['id'], string>> = {}
  if (!rsvp.unavailable && !rsvp.loading && rsvp.capacity !== null) badges.event = `${rsvp.inCount}/${rsvp.capacity} in`
  if (!claimQueue.unavailable && claimQueue.requests.length > 0) badges.players = `${claimQueue.requests.length} pending`
  return badges
}
