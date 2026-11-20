import { useNavigate } from 'react-router'
import { AdminRsvpList } from '../../components/rsvp/AdminRsvpList'
import { WeeklyEntryScreen } from '../../components/WeeklyEntryScreen'
import { useAuth } from '../../context/AuthContext'
import { usePlayers } from '../../hooks/usePlayers'
import { ADMIN_ROUTES } from './adminRoutes'

/** Weekly event: the next RSVP list (inline, with add player / guest) above result entry. Existing components, unchanged. */
export function AdminEventPage() {
  const { isConfigured } = useAuth()
  const navigate = useNavigate()
  const { players, refresh, addPlayer } = usePlayers(isConfigured)
  return (
    <>
      <AdminRsvpList players={players} />
      <WeeklyEntryScreen
        roster={players}
        onBackToLeaderboard={() => navigate(ADMIN_ROUTES.dashboard)}
        onLeaderboardUpdated={refresh}
        onAddNewPlayerToRoster={addPlayer}
      />
    </>
  )
}
