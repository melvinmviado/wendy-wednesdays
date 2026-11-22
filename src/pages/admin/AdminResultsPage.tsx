import { useNavigate } from 'react-router'
import { WeeklyEntryScreen } from '../../components/WeeklyEntryScreen'
import { RosterGate } from '../../components/admin/RosterGate'
import { useAuth } from '../../context/AuthContext'
import { usePlayers } from '../../hooks/usePlayers'
import { ADMIN_ROUTES } from './adminRoutes'

export function AdminResultsPage() {
  const { isConfigured } = useAuth()
  const navigate = useNavigate()
  const { players, refresh, addPlayer, loaded, dbError } = usePlayers(isConfigured)
  return (
    <RosterGate loaded={loaded} error={dbError} onRetry={() => void refresh()}>
      <WeeklyEntryScreen
        roster={players}
        onBackToLeaderboard={() => navigate(ADMIN_ROUTES.dashboard)}
        onLeaderboardUpdated={refresh}
        onAddNewPlayerToRoster={addPlayer}
      />
    </RosterGate>
  )
}
