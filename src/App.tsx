import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  Trophy,
  Search,
  UserPlus,
  RotateCcw,
  Flame,
  Calendar,
  Users,
  ShieldCheck,
  Lock,
  LogOut,
  Database,
  RefreshCw,
  AlertTriangle,
  CheckSquare
} from 'lucide-react'
import { PlayerScore } from './types/leaderboard'
import { initialPlayers } from './data/leaderboardData'
import { LeaderboardTable } from './components/LeaderboardTable'
import { AddPlayerModal } from './components/AddPlayerModal'
import { AdminLoginModal } from './components/AdminLoginModal'
import { WeeklyEntryScreen } from './components/WeeklyEntryScreen'
import { WebsiteLogo } from './components/WebsiteLogo'
import { useAuth } from './context/AuthContext'
import { supabase } from './lib/supabase'

export default function App() {
  const { user, isAdmin, signOut, isConfigured } = useAuth()

  const [currentView, setCurrentView] = useState<'leaderboard' | 'weekly-entry'>('leaderboard')
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
  const handleSelectView = (view: 'leaderboard' | 'weekly-entry') => {
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

  return (
    <div className="min-h-screen bg-black text-white selection:bg-red-600 selection:text-white">
      {/* Background ambient lighting in deep crimson & black */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[38rem] h-[38rem] bg-gradient-to-b from-red-600/15 via-red-950/10 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-red-900/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 -right-40 w-80 h-80 bg-red-950/15 rounded-full blur-3xl" />
      </div>

      {/* Top Navbar / Admin Bar */}
      <nav className="w-full border-b border-zinc-800/80 bg-black/85 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-3xl mx-auto px-3 sm:px-6 py-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2.5">
            <WebsiteLogo size="sm" />
            <span className="font-extrabold text-white text-xs sm:text-sm tracking-tight hidden sm:inline">
              Wendy Wednesdays
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 border border-zinc-800">
              <Database className={`w-3.5 h-3.5 ${isConfigured ? 'text-emerald-400' : 'text-red-500'}`} />
              <span className="font-medium text-zinc-300">
                {isConfigured ? 'Supabase Connected' : 'Demo Mode'}
              </span>
            </div>
            {!isConfigured && (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="hidden sm:inline-block text-[11px] text-red-400 hover:text-red-300 underline cursor-pointer"
              >
                Connect Database
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isAdmin ? (
              <div className="flex items-center gap-2">
                <span className="hidden sm:flex items-center gap-1 text-red-300 bg-red-950/60 border border-red-500/40 px-2 py-0.5 rounded-full text-[11px] font-semibold">
                  <ShieldCheck className="w-3 h-3 text-red-400" />
                  <span className="truncate max-w-[130px]">{user?.email || 'Admin'}</span>
                </span>
                <button
                  onClick={() => {
                    signOut()
                    setCurrentView('leaderboard')
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 transition cursor-pointer"
                  title="Sign out as administrator"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-zinc-800 bg-zinc-900/90 text-zinc-200 hover:text-white hover:border-red-600/50 transition cursor-pointer"
              >
                <Lock className="w-3 h-3 text-red-500" />
                <span>Admin Login</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-3 sm:px-6 py-6 sm:py-8 flex flex-col gap-6">
        {/* Navigation Tabs (Leaderboard vs Admin Weekly Entry) */}
        <div className="flex items-center justify-center p-1 rounded-2xl bg-zinc-900/90 border border-zinc-800 max-w-sm mx-auto w-full shadow-xl">
          <button
            onClick={() => handleSelectView('leaderboard')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${
              currentView === 'leaderboard'
                ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md shadow-red-600/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Trophy className="w-4 h-4" />
            <span>Leaderboard</span>
          </button>

          <button
            onClick={() => handleSelectView('weekly-entry')}
            className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer relative ${
              currentView === 'weekly-entry'
                ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-md shadow-red-600/30'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            <span>Weekly Entry</span>
            {!isAdmin && (
              <Lock className="w-3 h-3 text-red-400 absolute right-2.5" />
            )}
          </button>
        </div>

        {/* Database Warning if table missing */}
        {dbError && (
          <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-500/40 text-xs text-red-200 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-white">Database Notice: {dbError}</p>
              <p className="text-[11px] text-red-300 leading-relaxed">
                Run the script in <code className="bg-zinc-900 px-1 py-0.5 rounded text-white">supabase/schema.sql</code> in your Supabase SQL Editor to set up the tables and computed view.
              </p>
            </div>
          </div>
        )}

        {/* VIEW 1: ADMIN WEEKLY ENTRY SCREEN */}
        {currentView === 'weekly-entry' && isAdmin ? (
          <WeeklyEntryScreen
            roster={players}
            onBackToLeaderboard={() => setCurrentView('leaderboard')}
            onLeaderboardUpdated={fetchSupabasePlayers}
            onAddNewPlayerToRoster={handleAddPlayer}
          />
        ) : (
          /* VIEW 2: SEASON LEADERBOARD */
          <div className="flex flex-col gap-6 sm:gap-8">
            {/* Header Section */}
            <header className="flex flex-col items-center text-center space-y-3 pt-2">
              <WebsiteLogo size="xl" className="mb-1" />

              <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border border-red-500/40 bg-red-950/50 text-red-300 text-xs font-bold tracking-wide shadow-sm">
                <Flame className="w-3.5 h-3.5 text-red-500" />
                <span>2026 Season Standings (Weeks 1 to 8)</span>
              </div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
                Wendy Wednesdays
              </h1>

              <p className="text-zinc-400 text-sm sm:text-base max-w-md">
                Official season leaderboard ranked by total points. Database-computed from weekly attendance & scores.
              </p>

              {/* Quick Metrics Bar */}
              <div className="flex items-center justify-center gap-3 sm:gap-6 pt-1 text-xs text-zinc-400">
                <div className="flex items-center gap-1.5 bg-zinc-900/90 px-3 py-1.5 rounded-xl border border-zinc-800">
                  <Users className="w-3.5 h-3.5 text-red-500" />
                  <span>
                    <strong className="text-white font-mono">{stats.totalPlayers}</strong> Players
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-zinc-900/90 px-3 py-1.5 rounded-xl border border-zinc-800">
                  <Trophy className="w-3.5 h-3.5 text-white" />
                  <span>
                    Leader:{' '}
                    <strong className="text-red-400 font-mono font-bold">
                      {stats.topScore.toLocaleString()}
                    </strong>{' '}
                    pts
                  </span>
                </div>
                <div className="hidden sm:flex items-center gap-1.5 bg-zinc-900/90 px-3 py-1.5 rounded-xl border border-zinc-800">
                  <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                  <span>
                    Avg:{' '}
                    <strong className="text-white font-mono">
                      {stats.avgPoints.toLocaleString()}
                    </strong>{' '}
                    pts
                  </span>
                </div>
              </div>
            </header>

            {/* Controls Bar (Mobile-first Search, Add Player & Refresh) */}
            <div className="flex items-center gap-2 pt-1">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search player name..."
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-zinc-900/90 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-white px-1.5 py-0.5 rounded bg-zinc-800 cursor-pointer"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Add Player (Protected for Admins only) */}
              <button
                onClick={handleOpenAddPlayer}
                className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition cursor-pointer shadow-md shrink-0 ${
                  isAdmin
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-600/30 active:scale-95'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80'
                }`}
                title={isAdmin ? 'Add New Player' : 'Admin Login required to add player'}
              >
                {isAdmin ? (
                  <UserPlus className="w-4 h-4" />
                ) : (
                  <Lock className="w-3.5 h-3.5 text-red-500" />
                )}
                <span className="hidden sm:inline">Add Player</span>
              </button>

              {/* Weekly Entry shortcut for admin */}
              {isAdmin && (
                <button
                  onClick={() => setCurrentView('weekly-entry')}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white hover:bg-zinc-200 text-black font-extrabold text-xs sm:text-sm transition cursor-pointer shadow-md shadow-white/10 active:scale-95 shrink-0"
                  title="Record Weekly Entry"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span className="hidden sm:inline">Record Week</span>
                </button>
              )}

              {/* Refresh / Sync with Supabase */}
              {isConfigured && (
                <button
                  onClick={fetchSupabasePlayers}
                  disabled={loadingDb}
                  className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 active:scale-95 text-zinc-400 hover:text-white transition cursor-pointer shrink-0 disabled:opacity-50"
                  title="Refresh from Supabase database"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingDb ? 'animate-spin text-red-500' : ''}`} />
                </button>
              )}

              {!isConfigured && (
                <button
                  onClick={handleResetData}
                  className="p-2.5 rounded-xl border border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 active:scale-95 text-zinc-400 hover:text-white transition cursor-pointer shrink-0"
                  title="Reset to default scores"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Mobile-First Season Leaderboard Table (Only Rank, Player, Weeks, Points) */}
            <section aria-label="Season Standings Table">
              <LeaderboardTable players={players} searchQuery={searchQuery} />
            </section>
          </div>
        )}

        {/* Legend / Info Footer */}
        <footer className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-zinc-850 text-xs text-zinc-500 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> Gold: 1st
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 inline-block" /> Silver: 2nd
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-600 inline-block" /> Bronze: 3rd
            </span>
          </div>

          <div className="text-[11px] text-zinc-500">
            Wendy Wednesdays • Cloudflare Pages & Supabase
          </div>
        </footer>
      </main>

      {/* Add Player Modal (Protected) */}
      <AddPlayerModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddPlayer={handleAddPlayer}
        onRequireAuth={() => setIsAuthModalOpen(true)}
      />

      {/* Admin Login Modal */}
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
