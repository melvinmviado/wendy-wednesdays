import { useState, useMemo, useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Trophy,
  Search,
  RotateCcw,
  LogIn,
  Database,
  RefreshCw,
  AlertTriangle,
  ClipboardList,
  CheckSquare
} from 'lucide-react'
import { initialPlayers } from './data/leaderboardData'
import { usePlayers } from './hooks/usePlayers'
import { ADMIN_ROUTES } from './pages/admin/adminRoutes'
import { LeaderboardTable } from './components/LeaderboardTable'
import { useRankMovement } from './hooks/useRankMovement'
import { PlayerStatsModal, type SelectedPlayer } from './components/PlayerStatsModal'
import { AuthModal } from './components/auth/AuthModal'
import { UserMenu } from './components/auth/UserMenu'
import { ProfileDialog } from './components/auth/ProfileDialog'
import { ClaimSection } from './components/claims/ClaimSection'
import { WeeklyResultsScreen } from './components/results/WeeklyResultsScreen'
import { WebsiteLogo } from './components/WebsiteLogo'
import { useAuth } from './context/AuthContext'
import { useIsAdmin } from './hooks/useIsAdmin'
import { useToasts } from './hooks/useToasts'
import { Toasts } from './components/admin/Toasts'
import { RsvpDock } from './components/rsvp/RsvpDock'

export default function App() {
  const { signOut, isConfigured, isSignedIn, returnError, user } = useAuth()
  // Same test as ClaimSection: these users get the claim box instead of the sign-in prompt
  const canClaim = isConfigured && isSignedIn && !!user && !user.is_anonymous
  const { isAdmin } = useIsAdmin()
  const navigate = useNavigate()

  const [statsPlayer, setStatsPlayer] = useState<SelectedPlayer | null>(null)
  const [resultsWeek, setResultsWeek] = useState<number | null>(null)
  const [currentView, setCurrentView] = useState<'leaderboard' | 'weekly-results'>('leaderboard')
  const { players, setPlayers, loadingDb, dbError, refresh: fetchSupabasePlayers } = usePlayers(isConfigured)

  const movement = useRankMovement(players)
  const [searchQuery, setSearchQuery] = useState('')
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [isProfileOpen, setIsProfileOpen] = useState(false)

  // A failed magic-link / Google return (expired link, denied consent) reopens the dialog with the reason.
  useEffect(() => {
    if (returnError) setIsAuthModalOpen(true)
  }, [returnError])
  const toasts = useToasts()

  const handleResetData = () => {
    if (window.confirm('Reset leaderboard to default initial players?')) {
      setPlayers(initialPlayers)
      localStorage.setItem('wendy_leaderboard_players', JSON.stringify(initialPlayers))
      setSearchQuery('')
    }
  }

  // Navigation tab switcher
  const handleSelectView = (view: 'leaderboard' | 'weekly-results') => {
    setResultsWeek(null) // a manual tab switch should open the default week, not a stale jump target
    setCurrentView(view)
  }

  // Sorted list for statistics & podium
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints
      }
      return b.weeksPlayed - a.weeksPlayed || a.name.localeCompare(b.name)
    })
  }, [players])


  const stats = useMemo(() => {
    const totalPlayers = players.length
    const topScore = sortedPlayers[0]?.totalPoints || 0
    const totalPointsSum = players.reduce((acc, p) => acc + p.totalPoints, 0)
    const avgPoints = totalPlayers > 0 ? Math.round(totalPointsSum / totalPlayers) : 0
    return { totalPlayers, topScore, avgPoints }
  }, [players, sortedPlayers])

  const btn =
    'inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-lg text-sm font-semibold transition-colors motion-safe:active:scale-[0.97] cursor-pointer shrink-0 disabled:opacity-50 disabled:cursor-not-allowed'
  const btnQuiet = `${btn} border border-line bg-surface text-ink hover:bg-raised`
  const btnBrand = `${btn} bg-brand text-brand-ink hover:bg-brand-hover`

  return (
    <div className="min-h-screen bg-ground text-ink">
      <nav className="w-full border-b border-line bg-ground sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-3 min-w-0">
            <WebsiteLogo size="sm" />
            <span className="font-bold text-ink hidden sm:inline">Wendy Wednesdays</span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-line text-ink-soft">
              <Database className={`w-3.5 h-3.5 ${isConfigured ? 'text-ok' : 'text-brand-hover'}`} aria-hidden="true" />
              <span role="status">{isConfigured ? 'Supabase Connected' : 'Demo Mode'}</span>
            </span>
            {!isConfigured && (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="hidden sm:inline-block text-brand-hover hover:text-ink underline underline-offset-2 cursor-pointer"
              >
                Connect Database
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link to="/rules" className={btnQuiet}>
              Rules
            </Link>
            {isSignedIn ? (
              <UserMenu
                onProfile={() => setIsProfileOpen(true)}
                onAdminDashboard={() => navigate(ADMIN_ROUTES.dashboard)}
                onSignOut={() => {
                  signOut()
                  setCurrentView('leaderboard')
                }}
              />
            ) : (
              <button onClick={() => setIsAuthModalOpen(true)} className={btnBrand}>
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>Sign in</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-8">
          <div role="tablist" className="flex p-1 rounded-xl bg-surface border border-line max-w-md w-full">
            {([
              ['leaderboard', Trophy, 'Leaderboard'],
              ['weekly-results', ClipboardList, 'Results'],
            ] as const)
              .map(([view, Icon, label]) => (
              <button
                key={view}
                role="tab"
                aria-selected={currentView === view}
                onClick={() => handleSelectView(view)}
                className={`flex-1 min-h-10 px-3 rounded-lg text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  currentView === view ? 'bg-brand text-brand-ink' : 'text-ink-soft hover:text-ink'
                }`}
              >
                <Icon className="w-4 h-4" aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </div>

        {dbError && (
          <div role="alert" className="p-4 rounded-xl bg-brand-soft border border-brand text-sm text-ink flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-brand-hover shrink-0" aria-hidden="true" />
            <div className="space-y-1">
              <p className="font-semibold">Database Notice: {dbError}</p>
              <p className="text-ink-soft leading-relaxed">
                Run the script in <code className="bg-ground px-1.5 py-0.5 rounded text-ink">supabase/schema.sql</code> in your Supabase SQL Editor to set up the tables and computed view.
              </p>
            </div>
          </div>
        )}

        {currentView === 'weekly-results' ? (
          <WeeklyResultsScreen isAdmin={isAdmin} initialWeek={resultsWeek} />
        ) : (
          <div className="flex flex-col gap-8">
            <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
              <div className="flex items-center gap-5 min-w-0">
                <WebsiteLogo size="xl" />
                <div className="min-w-0">
                  <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-ink [text-wrap:balance] wrap-break-word min-w-0">
                    Wendy Wednesdays
                  </h1>
                  <p className="mt-2 text-ink-soft">2026 season standings, weeks 1 to 8</p>
                </div>
              </div>

              <dl className="flex gap-8 sm:text-right">
                <div>
                  <dt className="text-sm text-muted">Players</dt>
                  <dd className="text-3xl font-black tabular-nums text-ink">{stats.totalPlayers}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted">Leader pts</dt>
                  <dd className="text-3xl font-black tabular-nums text-brand-hover">{stats.topScore.toLocaleString()}</dd>
                </div>
                <div className="hidden sm:block">
                  <dt className="text-sm text-muted">Avg pts</dt>
                  <dd className="text-3xl font-black tabular-nums text-ink">{stats.avgPoints.toLocaleString()}</dd>
                </div>
              </dl>
            </header>

            <p className="text-ink-soft max-w-prose">
              Official season leaderboard ranked by total points. Database-computed from weekly attendance & scores.
            </p>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search player name..."
                  aria-label="Search player name"
                  className="w-full min-h-10 pl-9 pr-16 rounded-lg bg-surface border border-line text-ink placeholder:text-muted"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-ink-soft hover:text-ink px-2 py-0.5 rounded bg-raised cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {isAdmin && (
                <button onClick={() => navigate(ADMIN_ROUTES.results)} className={`${btn} bg-ink text-ground hover:bg-ink-soft`} title="Record Weekly Entry">
                  <CheckSquare className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Record Week</span>
                </button>
              )}

              {isConfigured && (
                <button onClick={fetchSupabasePlayers} disabled={loadingDb} className={`${btnQuiet} px-3`} title="Refresh from Supabase database" aria-label="Refresh from Supabase database">
                  <RefreshCw className={`w-4 h-4 ${loadingDb ? 'motion-safe:animate-spin text-brand-hover' : ''}`} aria-hidden="true" />
                </button>
              )}

              {!isConfigured && (
                <button onClick={handleResetData} className={`${btnQuiet} px-3`} title="Reset to default scores" aria-label="Reset to default scores">
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <section aria-label="Season Standings Table">
              <LeaderboardTable
                players={players}
                searchQuery={searchQuery}
                onSelectPlayer={setStatsPlayer}
                movement={movement}
              />
              <PlayerStatsModal
                selected={statsPlayer}
                onClose={() => setStatsPlayer(null)}
                onSelectWeek={(week) => {
                  setResultsWeek(week)
                  setCurrentView('weekly-results')
                }}
                renderExtra={(player) => <ClaimSection playerId={player.id} playerName={player.name} />}
                onSignIn={
                  isConfigured && !canClaim
                    ? () => {
                        setStatsPlayer(null)
                        setIsAuthModalOpen(true)
                      }
                    : undefined
                }
              />
            </section>

          </div>
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
      {isProfileOpen && (
        <ProfileDialog
          onClose={() => setIsProfileOpen(false)}
          onSignOut={() => {
            signOut()
            setCurrentView('leaderboard')
          }}
        />
      )}
    </div>
  )
}
