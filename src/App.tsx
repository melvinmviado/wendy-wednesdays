import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { ClipboardList, Trophy } from 'lucide-react'
import { initialPlayers } from './data/leaderboardData'
import { usePlayers } from './hooks/usePlayers'
import { ADMIN_ROUTES } from './pages/admin/adminRoutes'
import { useRankMovement } from './hooks/useRankMovement'
import { AppNav } from './components/AppNav'
import { AuthModal } from './components/auth/AuthModal'
import { ProfileDialog } from './components/auth/ProfileDialog'
import { LeaderboardView } from './components/leaderboard/LeaderboardView'
import { WeeklyResultsScreen } from './components/results/WeeklyResultsScreen'
import { useAuth } from './context/AuthContext'
import { useIsAdmin } from './hooks/useIsAdmin'
import { useToasts } from './hooks/useToasts'
import { Toasts } from './components/admin/Toasts'
import { RsvpDock } from './components/rsvp/RsvpDock'

type View = 'leaderboard' | 'weekly-results'

const TABS = [
  ['leaderboard', Trophy, 'Leaderboard'],
  ['weekly-results', ClipboardList, 'Results'],
] as const

export default function App() {
  const { signOut, isConfigured, isSignedIn, returnError, user } = useAuth()
  // Same test as ClaimSection: these users get the claim box instead of the sign-in prompt
  const canClaim = isConfigured && isSignedIn && !!user && !user.is_anonymous
  const { isAdmin } = useIsAdmin()
  const navigate = useNavigate()

  const [resultsWeek, setResultsWeek] = useState<number | null>(null)
  const [currentView, setCurrentView] = useState<View>('leaderboard')
  const { players, setPlayers, loadingDb, loaded, dbError, refresh } = usePlayers(isConfigured)
  const movement = useRankMovement(players)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)
  const toasts = useToasts()

  // A failed magic-link / Google return (expired link, denied consent) reopens the dialog with the reason.
  useEffect(() => {
    if (returnError) setIsAuthModalOpen(true)
  }, [returnError])

  const resetDemoData = (): boolean => {
    if (!window.confirm('Reset leaderboard to default initial players?')) return false
    setPlayers(initialPlayers)
    localStorage.setItem('wendy_leaderboard_players', JSON.stringify(initialPlayers))
    return true
  }

  // A manual tab switch opens the default week, not a stale jump target
  const selectView = (view: View) => {
    setResultsWeek(null)
    setCurrentView(view)
  }

  const signOutHome = () => {
    signOut()
    setCurrentView('leaderboard')
  }

  return (
    <div className="min-h-screen bg-ground text-ink">
      <AppNav
        isConfigured={isConfigured}
        isSignedIn={isSignedIn}
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onProfile={() => setIsProfileOpen(true)}
        onAdminDashboard={() => navigate(ADMIN_ROUTES.dashboard)}
        onSignOut={signOutHome}
      />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-8">
        <div role="tablist" className="flex p-1 rounded-xl bg-surface border border-line max-w-md w-full">
          {TABS.map(([view, Icon, label]) => (
            <button
              key={view}
              role="tab"
              aria-selected={currentView === view}
              onClick={() => selectView(view)}
              className={`flex-1 min-h-10 px-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                currentView === view ? 'bg-brand text-brand-ink' : 'text-ink-soft hover:text-ink'
              }`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>

        {currentView === 'weekly-results' ? (
          <WeeklyResultsScreen isAdmin={isAdmin} initialWeek={resultsWeek} />
        ) : (
          <LeaderboardView
            players={players}
            movement={movement}
            loading={loadingDb}
            loaded={loaded}
            error={dbError}
            isAdmin={isAdmin}
            isConfigured={isConfigured}
            canClaim={canClaim}
            onRefresh={() => void refresh()}
            onResetDemo={resetDemoData}
            onRecordWeek={() => navigate(ADMIN_ROUTES.results)}
            onOpenWeek={(week) => {
              setResultsWeek(week)
              setCurrentView('weekly-results')
            }}
            onSignIn={() => setIsAuthModalOpen(true)}
          />
        )}

        <footer className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-line text-sm text-muted">
          <ul className="flex items-center gap-4">
            <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-400" aria-hidden="true" />Gold: 1st</li>
            <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-300" aria-hidden="true" />Silver: 2nd</li>
            <li className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-amber-600" aria-hidden="true" />Bronze: 3rd</li>
          </ul>
          <p>Wendy Wednesdays, on Cloudflare Pages and Supabase</p>
        </footer>
      </main>

      <Toasts toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      <RsvpDock players={players} toast={toasts} />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
      {isProfileOpen && <ProfileDialog onClose={() => setIsProfileOpen(false)} onSignOut={signOutHome} />}
    </div>
  )
}
