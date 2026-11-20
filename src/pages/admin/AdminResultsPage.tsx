import { useNavigate } from 'react-router'
import { WeeklyEntryScreen } from '../../components/WeeklyEntryScreen'
import { useAuth } from '../../context/AuthContext'
import { usePlayers } from '../../hooks/usePlayers'
import { ADMIN_ROUTES } from './adminRoutes'

export function AdminResultsPage() {
  const { isConfigured } = useAuth()
  const navigate = useNavigate()
  const { players, refresh, addPlayer } = usePlayers(isConfigured)
  return (
    <WeeklyEntryScreen
      roster={players}
      onBackToLeaderboard={() => navigate(ADMIN_ROUTES.dashboard)}
      onLeaderboardUpdated={refresh}
      onAddNewPlayerToRoster={addPlayer}
    />
  )
}
