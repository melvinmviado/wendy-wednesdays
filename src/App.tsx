import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Trophy,
  Search,
  UserPlus,
  RotateCcw,
  ShieldCheck,
  Lock,
  LogOut,
  Database,
  RefreshCw,
  AlertTriangle,
  CheckSquare,
  ClipboardList
} from 'lucide-react'
import { PlayerScore } from './types/leaderboard'
import { initialPlayers } from './data/leaderboardData'
import { LeaderboardTable } from './components/LeaderboardTable'
import { AddPlayerModal } from './components/AddPlayerModal'
import { AdminLoginModal } from './components/AdminLoginModal'
import { WeeklyEntryScreen } from './components/WeeklyEntryScreen'
import { WeeklyResultsScreen } from './components/results/WeeklyResultsScreen'
import { WebsiteLogo } from './components/WebsiteLogo'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'

export default function App() {
  const { user, isAdmin, signOut, isConfigured } = useAuth()

  const [currentView, setCurrentView] = useState<'leaderboard' | 'weekly-results' | 'weekly-entry'>('leaderboard')
  const [players, setPlayers] = useState<PlayerScore[]>(() => {
    const saved = localStorage.getItem('wendy_leaderboard_players')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        // fallback
      }
    }
    return initialPlayers
  })

  const [searchQuery, setSearchQuery] = useState('')
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [loadingDb, setLoadingDb] = useState(false)
  const [dbError, setDbError] = useState<string | null>(null)

  // Fetch players from database (prioritizing the computed season_leaderboard view)
  const fetchSupabasePlayers = useCallback(async () => {
    if (!isConfigured) return

    setLoadingDb(true)
    setDbError(null)

    try {
      // 1. Try querying the database-computed view
      const { data: viewData, error: viewError } = await supabase
        .from('season_leaderboard')
        .select('*')
        .order('total_points', { ascending: false })

      if (!viewError && viewData && viewData.length > 0) {
        const mapped: PlayerScore[] = viewData.map((item) => ({
          id: item.id,
          name: item.name,
          weeksPlayed: item.weeks_played ?? 0,
          totalPoints: item.total_points ?? 0,
        }))
        setPlayers(mapped)
        localStorage.setItem('wendy_leaderboard_players', JSON.stringify(mapped))
        return
      }

      // 2. Fallback to direct players table if view is not yet created
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .order('total_points', { ascending: false })

      if (error) {
        throw error
      }

      if (data && data.length > 0) {
        const mapped: PlayerScore[] = data.map((item) => ({
          id: item.id,
          name: item.name,
          weeksPlayed: item.weeks_played ?? 0,
          totalPoints: item.total_points ?? 0,
        }))
        setPlayers(mapped)
        localStorage.setItem('wendy_leaderboard_players', JSON.stringify(mapped))
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch from database'
      setDbError(msg)
    } finally {
      setLoadingDb(false)
    }
  }, [isConfigured])

  // Load on mount and setup real-time subscriptions
  useEffect(() => {
    if (isConfigured) {
      fetchSupabasePlayers()

      // Subscribe to real-time changes on both weekly_scores and players
      const channel = supabase
        .channel('public:leaderboard_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'weekly_scores' },
          () => {
            fetchSupabasePlayers()
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'players' },
          () => {
            fetchSupabasePlayers()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [isConfigured, fetchSupabasePlayers])

  const handleAddPlayer = (newPlayer: PlayerScore) => {
    const updated = [newPlayer, ...players]
    setPlayers(updated)
    localStorage.setItem('wendy_leaderboard_players', JSON.stringify(updated))
  }

  const handleResetData = () => {
    if (window.confirm('Reset leaderboard to default initial players?')) {
      setPlayers(initialPlayers)
      localStorage.setItem('wendy_leaderboard_players', JSON.stringify(initialPlayers))
      setSearchQuery('')
    }
  }

  // Handle clicking "Add Player" - requires admin
  const handleOpenAddPlayer = () => {
    if (!isAdmin) {
      setIsAuthModalOpen(true)
    } else {
      setIsAddModalOpen(true)
    }
  }

  // Navigation tab switcher
  const handleSelectView = (view: 'leaderboard' | 'weekly-results' | 'weekly-entry') => {
    if (view === 'weekly-entry' && !isAdmin) {
      setIsAuthModalOpen(true)
      return
    }
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
            {isAdmin ? (
              <>
                <span className="hidden sm:flex items-center gap-1.5 text-ink bg-brand-soft border border-brand px-2.5 py-1 rounded-full">
                  <ShieldCheck className="w-3.5 h-3.5 text-brand-hover" aria-hidden="true" />
                  <span className="truncate max-w-[130px]">{user?.email || 'Admin'}</span>
                </span>
                <button
                  onClick={() => {
                    signOut()
                    setCurrentView('leaderboard')
                  }}
                  className={btnQuiet}
                  title="Sign out as administrator"
                >
                  <LogOut className="w-4 h-4" aria-hidden="true" />
                  <span>Sign Out</span>
                </button>
              </>
            ) : (
              <button onClick={() => setIsAuthModalOpen(true)} className={btnQuiet}>
                <Lock className="w-4 h-4 text-brand-hover" aria-hidden="true" />
                <span>Admin Login</span>
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
              ['weekly-entry', CheckSquare, 'Weekly Entry'],
            ] as const)
              .filter(([view]) => view !== 'weekly-entry' || isAdmin)
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

        {currentView === 'weekly-entry' && isAdmin ? (
          <WeeklyEntryScreen
            roster={players}
            onBackToLeaderboard={() => setCurrentView('leaderboard')}
            onLeaderboardUpdated={fetchSupabasePlayers}
            onAddNewPlayerToRoster={handleAddPlayer}
          />
        ) : currentView === 'weekly-results' ? (
          <WeeklyResultsScreen isAdmin={isAdmin} />
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
                <button onClick={handleOpenAddPlayer} className={btnBrand} title="Add New Player">
                  <UserPlus className="w-4 h-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Add Player</span>
                </button>
              )}

              {isAdmin && (
                <button onClick={() => setCurrentView('weekly-entry')} className={`${btn} bg-ink text-ground hover:bg-ink-soft`} title="Record Weekly Entry">
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
              <LeaderboardTable players={players} searchQuery={searchQuery} />
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

      <AddPlayerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddPlayer={handleAddPlayer}
        onRequireAuth={() => setIsAuthModalOpen(true)}
      />

      <AdminLoginModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onSuccess={() => {
          setCurrentView('weekly-entry')
        }}
      />
    </div>
  )
}
