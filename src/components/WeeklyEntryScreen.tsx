import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar,
  Check,
  CheckCircle2,
  Plus,
  Minus,
  Save,
  UserPlus,
  Search,
  Sparkles,
  ArrowLeft,
  Users,
  Award,
  RefreshCw,
  AlertCircle
} from 'lucide-react'
import { PlayerScore, WeeklyScoreRecord } from '../types/leaderboard'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

interface WeeklyEntryScreenProps {
  roster: PlayerScore[]
  onBackToLeaderboard: () => void
  onLeaderboardUpdated: () => void
  onAddNewPlayerToRoster: (newPlayer: PlayerScore) => void
}

interface PlayerWeekRow {
  playerId: string
  name: string
  attended: boolean
  points: number
}

const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8]
const QUICK_POINT_PILLS = [10, 25, 50, 100]

export const WeeklyEntryScreen: React.FC<WeeklyEntryScreenProps> = ({
  roster,
  onBackToLeaderboard,
  onLeaderboardUpdated,
  onAddNewPlayerToRoster,
}) => {
  const [selectedWeek, setSelectedWeek] = useState<number>(1)
  const [newPlayerName, setNewPlayerName] = useState('')
  const [playerRows, setPlayerRows] = useState<PlayerWeekRow[]>([])
  const [searchFilter, setSearchFilter] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingWeek, setLoadingWeek] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Load existing week entries from Supabase or local storage
  const loadWeekData = useCallback(async (week: number) => {
    setLoadingWeek(true)
    setErrorMsg(null)
    setSaveSuccessMsg(null)

    try {
      if (isSupabaseConfigured) {
        // Fetch existing entries for this week from Supabase
        const { data, error } = await supabase
          .from('weekly_scores')
          .select('player_id, attended, points')
          .eq('week_number', week)

        if (error) {
          throw error
        }

        const scoreMap = new Map<string, { attended: boolean; points: number }>()
        if (data) {
          data.forEach((row) => {
            scoreMap.set(row.player_id, {
              attended: row.attended,
              points: row.points,
            })
          })
        }

        // Initialize rows for all rostered players
        const initialized: PlayerWeekRow[] = roster.map((p) => {
          const existing = scoreMap.get(p.id)
          return {
            playerId: p.id,
            name: p.name,
            attended: existing ? existing.attended : false,
            points: existing ? existing.points : 0,
          }
        })
        setPlayerRows(initialized)
      } else {
        // Demo mode: read from localStorage
        const storedKey = `wendy_weekly_scores_w${week}`
        const saved = localStorage.getItem(storedKey)
        const scoreMap = new Map<string, { attended: boolean; points: number }>()

        if (saved) {
          try {
            const parsed: WeeklyScoreRecord[] = JSON.parse(saved)
            parsed.forEach((s) => scoreMap.set(s.playerId, { attended: s.attended, points: s.points }))
          } catch {
            // ignore
          }
        }

        const initialized: PlayerWeekRow[] = roster.map((p) => {
          const existing = scoreMap.get(p.id)
          return {
            playerId: p.id,
            name: p.name,
            attended: existing ? existing.attended : false,
            points: existing ? existing.points : 0,
          }
        })
        setPlayerRows(initialized)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error loading week data'
      setErrorMsg(msg)
    } finally {
      setLoadingWeek(false)
    }
  }, [roster])

  // Reload when week or roster changes
  useEffect(() => {
    loadWeekData(selectedWeek)
  }, [selectedWeek, loadWeekData])

  // Toggle attended state for a player
  const toggleAttended = (playerId: string) => {
    setPlayerRows((prev) =>
      prev.map((row) => {
        if (row.playerId === playerId) {
          const nextAttended = !row.attended
          return {
            ...row,
            attended: nextAttended,
            points: row.points,
          }
        }
        return row
      })
    )
  }

  // Adjust points by an delta (+/- stepper or quick pills)
  const adjustPoints = (playerId: string, delta: number) => {
    setPlayerRows((prev) =>
      prev.map((row) => {
        if (row.playerId === playerId) {
          const newPoints = Math.max(0, row.points + delta)
          return {
            ...row,
            attended: true,
            points: newPoints,
          }
        }
        return row
      })
    )
  }

  // Direct points edit
  const setExactPoints = (playerId: string, val: number) => {
    const points = isNaN(val) ? 0 : Math.max(0, val)
    setPlayerRows((prev) =>
      prev.map((row) => {
        if (row.playerId === playerId) {
          return { ...row, attended: true, points }
        }
        return row
      })
    )
  }

  // Quick add player to roster
  const handleQuickAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newPlayerName.trim()
    if (!name) return

    setErrorMsg(null)
    setSaveSuccessMsg(null)

    try {
      let createdId = Date.now().toString()

      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('players')
          .insert([{ name, weeks_played: 1, total_points: 0 }])
          .select()
          .single()

        if (error) throw error
        if (data) createdId = data.id
      }

      const newPlayer: PlayerScore = {
        id: createdId,
        name,
        weeksPlayed: 1,
        totalPoints: 0,
      }

      onAddNewPlayerToRoster(newPlayer)

      // Add directly to active week rows and mark attended!
      setPlayerRows((prev) => [
        {
          playerId: createdId,
          name,
          attended: true,
          points: 0,
        },
        ...prev,
      ])

      setNewPlayerName('')
      setSaveSuccessMsg(`Added "${name}" and marked as attended!`)
      setTimeout(() => setSaveSuccessMsg(null), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add player'
      setErrorMsg(msg)
    }
  }

  // Bulk upsert checked players & let database compute leaderboard
  const handleSaveWeek = async () => {
    setSaving(true)
    setErrorMsg(null)
    setSaveSuccessMsg(null)

    try {
      const checkedPlayers = playerRows.filter((r) => r.attended)

      if (isSupabaseConfigured) {
        // Bulk upsert to Supabase weekly_scores table
        const upsertPayload = playerRows.map((r) => ({
          player_id: r.playerId,
          week_number: selectedWeek,
          attended: r.attended,
          points: r.attended ? r.points : 0,
        }))

        const { error: upsertError } = await supabase
          .from('weekly_scores')
          .upsert(upsertPayload, { onConflict: 'player_id,week_number' })

        if (upsertError) {
          throw upsertError
        }

        onLeaderboardUpdated()
      } else {
        // Demo mode: save to local storage & recompute
        const storedKey = `wendy_weekly_scores_w${selectedWeek}`
        const localRecords: WeeklyScoreRecord[] = playerRows.map((r) => ({
          playerId: r.playerId,
          weekNumber: selectedWeek,
          attended: r.attended,
          points: r.attended ? r.points : 0,
        }))
        localStorage.setItem(storedKey, JSON.stringify(localRecords))

        // Aggregate across all weeks for local demo
        const allLocalWeeklyScores: WeeklyScoreRecord[] = []
        for (let w = 1; w <= 8; w++) {
          const wKey = `wendy_weekly_scores_w${w}`
          const wSaved = localStorage.getItem(wKey)
          if (wSaved) {
            try {
              const list: WeeklyScoreRecord[] = JSON.parse(wSaved)
              allLocalWeeklyScores.push(...list)
            } catch {
              // ignore
            }
          }
        }

        // Compute leaderboard
        const updatedLeaderboard = roster.map((p) => {
          const pScores = allLocalWeeklyScores.filter((s) => s.playerId === p.id && s.attended)
          const weeksPlayed = new Set(pScores.map((s) => s.weekNumber)).size
          const totalPoints = pScores.reduce((sum, s) => sum + s.points, 0)
          return {
            ...p,
            weeksPlayed,
            totalPoints,
          }
        })

        localStorage.setItem('wendy_leaderboard_players', JSON.stringify(updatedLeaderboard))
        onLeaderboardUpdated()
      }

      setSaveSuccessMsg(
        `Week ${selectedWeek} saved! Bulk upserted ${checkedPlayers.length} checked players. Leaderboard recomputed.`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save weekly scores'
      setErrorMsg(msg)
    } finally {
      setSaving(false)
    }
  }

  // Filtered rows for fast mobile search
  const filteredRows = useMemo(() => {
    const q = searchFilter.trim().toLowerCase()
    if (!q) return playerRows
    return playerRows.filter((r) => r.name.toLowerCase().includes(q))
  }, [playerRows, searchFilter])

  // Summary stats
  const checkedCount = useMemo(() => playerRows.filter((r) => r.attended).length, [playerRows])
  const totalWeekPoints = useMemo(
    () => playerRows.reduce((sum, r) => sum + (r.attended ? r.points : 0), 0),
    [playerRows]
  )

  return (
    <div className="w-full flex flex-col gap-6">
      {/* Header / Nav Back Bar */}
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-800">
        <button
          onClick={onBackToLeaderboard}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700 text-xs font-semibold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-red-500" />
          <span>Leaderboard</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-red-950/60 border border-red-500/40 text-red-300 text-xs font-bold tracking-wide">
            Admin Weekly Entry
          </span>
        </div>
      </div>

      {/* Week Selector (Weeks 1 to 8) */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-red-500" />
            <span>Select Week (1 to 8)</span>
          </label>
          <span className="text-xs font-mono font-bold text-red-400">
            Active: Week {selectedWeek}
          </span>
        </div>

        {/* 1 to 8 Quick Tap Buttons */}
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {WEEKS.map((week) => {
            const isSelected = selectedWeek === week
            return (
              <button
                key={week}
                onClick={() => setSelectedWeek(week)}
                className={`py-2.5 px-2 rounded-xl text-center font-bold text-xs sm:text-sm transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-gradient-to-r from-red-600 to-red-700 border-red-500 text-white shadow-lg shadow-red-600/30 scale-[1.03]'
                    : 'bg-zinc-900/90 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800'
                }`}
              >
                <span>Week {week}</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* Quick Add Player Bar */}
      <section className="w-full">
        <form onSubmit={handleQuickAddPlayer} className="flex gap-2">
          <div className="relative flex-1">
            <UserPlus className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="Quick add player to roster..."
              className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition"
            />
          </div>
          <button
            type="submit"
            disabled={!newPlayerName.trim()}
            className="px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs sm:text-sm transition cursor-pointer shadow-md shadow-red-600/30 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            + Add
          </button>
        </form>
      </section>

      {/* Status & Alerts */}
      {saveSuccessMsg && (
        <div className="p-3.5 rounded-xl bg-zinc-900 border border-white/20 text-xs text-white flex items-center justify-between gap-2 animate-in fade-in shadow-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-red-500" />
            <span>{saveSuccessMsg}</span>
          </div>
          <button
            onClick={onBackToLeaderboard}
            className="underline font-bold text-red-400 hover:text-white cursor-pointer shrink-0"
          >
            View Standings →
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-950/70 border border-red-800/80 text-xs text-red-200 flex items-center gap-2 animate-in fade-in">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Week Summary & Search Filter Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/70 border border-zinc-800">
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
            <Users className="w-4 h-4 text-red-500" />
            <span>
              <strong className="text-white font-mono">{checkedCount}</strong> Attended
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
            <Award className="w-4 h-4 text-white" />
            <span>
              <strong className="text-red-400 font-mono font-bold">{totalWeekPoints}</strong> Week Pts
            </span>
          </div>
        </div>

        {/* Search within week */}
        <div className="relative max-w-xs w-full">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder="Filter players..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
          />
        </div>
      </div>

      {/* Player List: Tap to Check Attended + Quick Pills & Stepper */}
      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
            Roster • Tap to check attendance
          </span>
          <span className="text-[11px] text-zinc-500 font-mono">
            {filteredRows.length} players
          </span>
        </div>

        {loadingWeek ? (
          <div className="py-12 text-center text-zinc-400 text-sm flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-red-500" />
            <span>Loading Week {selectedWeek} entries...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-12 text-center text-zinc-500 text-sm rounded-2xl border border-zinc-800 bg-zinc-950/40">
            No players found. Use the quick add bar above to add one!
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {filteredRows.map((player) => {
              const isAttended = player.attended

              return (
                <div
                  key={player.playerId}
                  className={`w-full rounded-2xl border transition-all duration-200 p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isAttended
                      ? 'bg-zinc-900/95 border-red-500/50 shadow-md shadow-red-950/20 ring-1 ring-red-500/30'
                      : 'bg-black/60 border-zinc-850 opacity-65 hover:opacity-100 hover:border-zinc-750'
                  }`}
                >
                  {/* Left: Tapping toggles attendance */}
                  <div
                    onClick={() => toggleAttended(player.playerId)}
                    className="flex items-center gap-3 cursor-pointer select-none flex-1 min-w-0"
                  >
                    {/* Checkbox badge */}
                    <div
                      className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all shrink-0 ${
                        isAttended
                          ? 'bg-red-600 text-white shadow-md shadow-red-600/40 ring-2 ring-red-400/50'
                          : 'border border-zinc-700 bg-zinc-900 text-transparent'
                      }`}
                    >
                      <Check className="w-4 h-4 stroke-[3]" />
                    </div>

                    <div className="truncate">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-bold text-sm truncate ${
                            isAttended ? 'text-white' : 'text-zinc-400'
                          }`}
                        >
                          {player.name}
                        </span>
                        {isAttended && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-950/70 border border-red-500/40 text-red-300">
                            Attended
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-zinc-500">
                        {isAttended ? 'Tap to mark absent' : 'Tap to mark attended'}
                      </span>
                    </div>
                  </div>

                  {/* Right: Point Assignment Quick-Tap Pills & +/- Stepper */}
                  {isAttended ? (
                    <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0 sm:border-l sm:border-zinc-800 sm:pl-3">
                      {/* Quick-tap point pills */}
                      <div className="flex items-center gap-1">
                        {QUICK_POINT_PILLS.map((increment) => (
                          <button
                            key={increment}
                            type="button"
                            onClick={() => adjustPoints(player.playerId, increment)}
                            className="px-2.5 py-1 rounded-lg bg-red-950/60 border border-red-500/40 hover:border-red-400 text-red-200 font-mono text-xs font-bold active:scale-90 transition cursor-pointer hover:bg-red-900/50"
                            title={`Add ${increment} points`}
                          >
                            +{increment}
                          </button>
                        ))}
                      </div>

                      {/* +/- Stepper and Points Display */}
                      <div className="flex items-center gap-1 bg-black border border-zinc-800 rounded-xl p-1">
                        <button
                          type="button"
                          onClick={() => adjustPoints(player.playerId, -5)}
                          className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-90 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                          title="Minus 5 points"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>

                        <input
                          type="number"
                          min="0"
                          step="5"
                          value={player.points}
                          onChange={(e) => setExactPoints(player.playerId, parseInt(e.target.value, 10))}
                          className="w-14 text-center font-mono font-bold text-sm bg-transparent text-white focus:outline-none"
                        />

                        <button
                          type="button"
                          onClick={() => adjustPoints(player.playerId, 5)}
                          className="w-7 h-7 rounded-lg bg-zinc-900 hover:bg-zinc-800 active:scale-90 text-zinc-300 hover:text-white flex items-center justify-center transition cursor-pointer"
                          title="Add 5 points"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-600 italic">
                      Check attendance to assign points
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Sticky / Fixed Save Week Bar */}
      <div className="sticky bottom-4 z-20 w-full pt-2">
        <div className="w-full p-4 rounded-2xl bg-zinc-950/95 border border-zinc-800 backdrop-blur-lg shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-300">
            <Sparkles className="w-4 h-4 text-red-500 shrink-0" />
            <span>
              <strong>Week {selectedWeek}</strong> • {checkedCount} checked players •{' '}
              <strong className="text-red-400 font-mono font-bold">{totalWeekPoints} pts</strong>
            </span>
          </div>

          <button
            onClick={handleSaveWeek}
            disabled={saving || loadingWeek}
            className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 via-red-500 to-red-700 hover:from-red-500 hover:to-red-600 active:scale-95 text-white font-black text-sm tracking-wide shadow-lg shadow-red-600/30 transition cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {saving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-white" />
                <span>Saving Week {selectedWeek}...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4 text-white" />
                <span>Save Week {selectedWeek} & Compute Leaderboard</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
