import { useState, useMemo } from 'react'
import {
  Trophy,
  Search,
  UserPlus,
  RotateCcw,
  Sparkles,
  Flame,
  Calendar,
  Users
} from 'lucide-react'
import { PlayerScore } from './types/leaderboard'
import { initialPlayers } from './data/leaderboardData'
import { LeaderboardTable } from './components/LeaderboardTable'
import { Podium } from './components/Podium'
import { AddPlayerModal } from './components/AddPlayerModal'

export default function App() {
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
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Sync to local storage
  const updatePlayers = (newPlayers: PlayerScore[]) => {
    setPlayers(newPlayers)
    localStorage.setItem('wendy_leaderboard_players', JSON.stringify(newPlayers))
  }

  const handleAddPlayer = (newPlayerData: Omit<PlayerScore, 'id'>) => {
    const newPlayer: PlayerScore = {
      ...newPlayerData,
      id: Date.now().toString(),
    }
    updatePlayers([...players, newPlayer])
  }

  const handleResetData = () => {
    if (window.confirm('Reset leaderboard to default initial player scores?')) {
      updatePlayers(initialPlayers)
      setSearchQuery('')
    }
  }

  // Sorted list for stats & podium
  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => {
      if (b.totalPoints !== a.totalPoints) {
        return b.totalPoints - a.totalPoints
      }
      return b.weeksPlayed - a.weeksPlayed || a.name.localeCompare(b.name)
    })
  }, [players])

  const topThree = useMemo(() => sortedPlayers.slice(0, 3), [sortedPlayers])

  const stats = useMemo(() => {
    const totalPlayers = players.length
    const topScore = sortedPlayers[0]?.totalPoints || 0
    const totalPointsSum = players.reduce((acc, p) => acc + p.totalPoints, 0)
    const avgPoints = totalPlayers > 0 ? Math.round(totalPointsSum / totalPlayers) : 0
    return { totalPlayers, topScore, avgPoints }
  }, [players, sortedPlayers])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-cyan-500 selection:text-black">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[36rem] h-[36rem] bg-gradient-to-b from-amber-500/10 via-cyan-500/5 to-transparent rounded-full blur-3xl" />
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-10 -right-40 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <main className="max-w-3xl mx-auto px-3 sm:px-6 py-8 sm:py-12 flex flex-col gap-6 sm:gap-8">
        {/* Header Section */}
        <header className="flex flex-col items-center text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-500/30 bg-amber-950/40 text-amber-300 text-xs font-semibold tracking-wide shadow-sm">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>2026 Season Standings</span>
          </div>

          <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
            Wendy Wednesdays
          </h1>

          <p className="text-slate-400 text-sm sm:text-base max-w-md">
            Official season leaderboard ranked by total points. Updated weekly after each round.
          </p>

          {/* Quick Metrics Bar */}
          <div className="flex items-center justify-center gap-3 sm:gap-6 pt-1 text-xs text-slate-400">
            <div className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>
                <strong className="text-white font-mono">{stats.totalPlayers}</strong> Players
              </span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>
                Leader:{' '}
                <strong className="text-white font-mono">
                  {stats.topScore.toLocaleString()}
                </strong>{' '}
                pts
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
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

        {/* Top 3 Podium (Visual Spotlight for Top Three Ranks) */}
        {topThree.length >= 3 && !searchQuery && (
          <section aria-label="Top 3 Season Leaders">
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Top Three Leaders</span>
              </h2>
            </div>
            <Podium topPlayers={topThree} />
          </section>
        )}

        {/* Controls Bar (Mobile-first Search & Add Player Action) */}
        <div className="flex items-center gap-2 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search player name..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-1.5 py-0.5 rounded bg-slate-800 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          <button
            onClick={() => setIsModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-semibold text-xs sm:text-sm transition cursor-pointer shadow-md shadow-cyan-500/20 shrink-0"
            title="Add Player"
          >
            <UserPlus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Player</span>
          </button>

          <button
            onClick={handleResetData}
            className="p-2.5 rounded-xl border border-slate-800 bg-slate-900/80 hover:bg-slate-800 active:scale-95 text-slate-400 hover:text-white transition cursor-pointer shrink-0"
            title="Reset to default scores"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile-First Season Leaderboard Table */}
        <section aria-label="Season Standings Table">
          <LeaderboardTable players={players} searchQuery={searchQuery} />
        </section>

        {/* Legend / Info Footer */}
        <footer className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800/80 text-xs text-slate-500 text-center sm:text-left">
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

          <div className="text-[11px] text-slate-600">
            Hosted on Cloudflare Pages • Tailwind CSS
          </div>
        </footer>
      </main>

      {/* Add Player Modal */}
      <AddPlayerModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAddPlayer={handleAddPlayer}
      />
    </div>
  )
}
