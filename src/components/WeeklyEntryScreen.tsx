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
  Trophy,
  RefreshCw,
  AlertCircle,
  X,
  RotateCcw,
  Layers,
  ArrowRight,
  Medal
} from 'lucide-react'
import { PlayerScore, CourtData, WeeklyScoreRecord } from '../types/leaderboard'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { getTeamOverallRank } from '../utils/scoring'

interface WeeklyEntryScreenProps {
  roster: PlayerScore[]
  onBackToLeaderboard: () => void
  onLeaderboardUpdated: () => void
  onAddNewPlayerToRoster: (newPlayer: PlayerScore) => void
}

const WEEKS = [1, 2, 3, 4, 5, 6, 7, 8]

// Default points: 10 for the overall 1st place team, then 1 fewer for each following team
// (Court 1 winners 10, Court 1 runners-up 9, Court 2 winners 8, ...), floored at 0.
// Both players on a team share the team's points.
const getCourtDefaultPoints = (courtNum: number) => {
  const first = Math.max(0, 11 - getTeamOverallRank(courtNum, 1))
  const second = Math.max(0, 11 - getTeamOverallRank(courtNum, 2))
  return { first, second }
}

export const WeeklyEntryScreen: React.FC<WeeklyEntryScreenProps> = ({
  roster,
  onBackToLeaderboard,
  onLeaderboardUpdated,
  onAddNewPlayerToRoster,
}) => {
  // Navigation & Week Selection
  const [selectedWeek, setSelectedWeek] = useState<number>(1)
  const [stage, setStage] = useState<'checkin' | 'courts'>('checkin')

  // Stage 1: Checked-in Player IDs
  const [checkedInPlayerIds, setCheckedInPlayerIds] = useState<Set<string>>(new Set())
  const [newPlayerName, setNewPlayerName] = useState('')
  const [searchFilter, setSearchFilter] = useState('')

  // Stage 2: Court Data (Each court has 2 teams of 2 players: 1st place team & 2nd place team)
  const [courts, setCourts] = useState<CourtData[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)

  // Status & Feedback
  const [saving, setSaving] = useState(false)
  const [loadingWeek, setLoadingWeek] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Initialize a blank CourtData with 4 slots (2 in 1st place, 2 in 2nd place)
  const buildEmptyCourt = useCallback((courtNum: number): CourtData => {
    const { first, second } = getCourtDefaultPoints(courtNum)
    return {
      courtNumber: courtNum,
      firstPlacePoints: first,
      secondPlacePoints: second,
      slots: [
        {
          slotId: `c${courtNum}-t1-p1`,
          teamPlace: 1,
          playerIndex: 1,
          playerId: null,
          playerName: null,
          points: first,
        },
        {
          slotId: `c${courtNum}-t1-p2`,
          teamPlace: 1,
          playerIndex: 2,
          playerId: null,
          playerName: null,
          points: first,
        },
        {
          slotId: `c${courtNum}-t2-p1`,
          teamPlace: 2,
          playerIndex: 1,
          playerId: null,
          playerName: null,
          points: second,
        },
        {
          slotId: `c${courtNum}-t2-p2`,
          teamPlace: 2,
          playerIndex: 2,
          playerId: null,
          playerName: null,
          points: second,
        },
      ],
    }
  }, [])

  // Load existing week entries from Supabase or localStorage
  const loadWeekData = useCallback(async (week: number) => {
    setLoadingWeek(true)
    setErrorMsg(null)
    setSaveSuccessMsg(null)

    try {
      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('weekly_scores')
          .select('player_id, attended, court_number, finish_order, points')
          .eq('week_number', week)

        if (error) throw error

        const attendedIds = new Set<string>()
        const assignedRecords: {
          playerId: string
          courtNumber: number
          finishOrder: number
          points: number
        }[] = []

        if (data) {
          data.forEach((row) => {
            if (row.attended) {
              attendedIds.add(row.player_id)
              if (row.court_number && row.finish_order) {
                assignedRecords.push({
                  playerId: row.player_id,
                  courtNumber: row.court_number,
                  finishOrder: row.finish_order,
                  points: row.points,
                })
              }
            }
          })
        }

        setCheckedInPlayerIds(attendedIds)

        // Group assigned players by court
        const courtCount = Math.max(1, Math.ceil(attendedIds.size / 4))
        const newCourts: CourtData[] = []

        for (let i = 0; i < courtCount; i++) {
          const courtNum = i + 1
          const court = buildEmptyCourt(courtNum)
          const courtRecords = assignedRecords.filter((r) => r.courtNumber === courtNum)

          // 1st place team records (finish_order === 1)
          const firstPlaceRecords = courtRecords.filter((r) => r.finishOrder === 1)
          if (firstPlaceRecords.length > 0) {
            court.firstPlacePoints = firstPlaceRecords[0].points
            court.slots[0].points = firstPlaceRecords[0].points
            court.slots[1].points = firstPlaceRecords[0].points

            if (firstPlaceRecords[0]) {
              const p = roster.find((x) => x.id === firstPlaceRecords[0].playerId)
              court.slots[0].playerId = firstPlaceRecords[0].playerId
              court.slots[0].playerName = p ? p.name : null
            }
            if (firstPlaceRecords[1]) {
              const p = roster.find((x) => x.id === firstPlaceRecords[1].playerId)
              court.slots[1].playerId = firstPlaceRecords[1].playerId
              court.slots[1].playerName = p ? p.name : null
            }
          }

          // 2nd place team records (finish_order === 2)
          const secondPlaceRecords = courtRecords.filter((r) => r.finishOrder === 2)
          if (secondPlaceRecords.length > 0) {
            court.secondPlacePoints = secondPlaceRecords[0].points
            court.slots[2].points = secondPlaceRecords[0].points
            court.slots[3].points = secondPlaceRecords[0].points

            if (secondPlaceRecords[0]) {
              const p = roster.find((x) => x.id === secondPlaceRecords[0].playerId)
              court.slots[2].playerId = secondPlaceRecords[0].playerId
              court.slots[2].playerName = p ? p.name : null
            }
            if (secondPlaceRecords[1]) {
              const p = roster.find((x) => x.id === secondPlaceRecords[1].playerId)
              court.slots[3].playerId = secondPlaceRecords[1].playerId
              court.slots[3].playerName = p ? p.name : null
            }
          }

          newCourts.push(court)
        }

        setCourts(newCourts)
      } else {
        // Demo mode from localStorage
        const storedKey = `wendy_weekly_scores_w${week}`
        const saved = localStorage.getItem(storedKey)
        const attendedIds = new Set<string>()
        const assignedRecords: WeeklyScoreRecord[] = []

        if (saved) {
          try {
            const parsed: WeeklyScoreRecord[] = JSON.parse(saved)
            parsed.forEach((s) => {
              if (s.attended) {
                attendedIds.add(s.playerId)
                if (s.courtNumber && s.finishOrder) {
                  assignedRecords.push(s)
                }
              }
            })
          } catch {
            // ignore
          }
        }

        setCheckedInPlayerIds(attendedIds)

        const courtCount = Math.max(1, Math.ceil(attendedIds.size / 4))
        const newCourts: CourtData[] = []

        for (let i = 0; i < courtCount; i++) {
          const courtNum = i + 1
          const court = buildEmptyCourt(courtNum)
          const courtRecords = assignedRecords.filter((r) => r.courtNumber === courtNum)

          const firstPlaceRecords = courtRecords.filter((r) => r.finishOrder === 1)
          if (firstPlaceRecords.length > 0) {
            court.firstPlacePoints = firstPlaceRecords[0].points
            court.slots[0].points = firstPlaceRecords[0].points
            court.slots[1].points = firstPlaceRecords[0].points

            if (firstPlaceRecords[0]) {
              const p = roster.find((x) => x.id === firstPlaceRecords[0].playerId)
              court.slots[0].playerId = firstPlaceRecords[0].playerId
              court.slots[0].playerName = p ? p.name : null
            }
            if (firstPlaceRecords[1]) {
              const p = roster.find((x) => x.id === firstPlaceRecords[1].playerId)
              court.slots[1].playerId = firstPlaceRecords[1].playerId
              court.slots[1].playerName = p ? p.name : null
            }
          }

          const secondPlaceRecords = courtRecords.filter((r) => r.finishOrder === 2)
          if (secondPlaceRecords.length > 0) {
            court.secondPlacePoints = secondPlaceRecords[0].points
            court.slots[2].points = secondPlaceRecords[0].points
            court.slots[3].points = secondPlaceRecords[0].points

            if (secondPlaceRecords[0]) {
              const p = roster.find((x) => x.id === secondPlaceRecords[0].playerId)
              court.slots[2].playerId = secondPlaceRecords[0].playerId
              court.slots[2].playerName = p ? p.name : null
            }
            if (secondPlaceRecords[1]) {
              const p = roster.find((x) => x.id === secondPlaceRecords[1].playerId)
              court.slots[3].playerId = secondPlaceRecords[1].playerId
              court.slots[3].playerName = p ? p.name : null
            }
          }

          newCourts.push(court)
        }

        setCourts(newCourts)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error loading week data'
      setErrorMsg(msg)
    } finally {
      setLoadingWeek(false)
    }
  }, [roster, buildEmptyCourt])

  // Reload when active week changes
  useEffect(() => {
    loadWeekData(selectedWeek)
  }, [selectedWeek, loadWeekData])

  // Toggle player check-in
  const togglePlayerCheckin = (playerId: string) => {
    setCheckedInPlayerIds((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
        // If unchecking, also remove from court slots
        setCourts((currCourts) =>
          currCourts.map((c) => ({
            ...c,
            slots: c.slots.map((s) =>
              s.playerId === playerId ? { ...s, playerId: null, playerName: null } : s
            ),
          }))
        )
      } else {
        next.add(playerId)
      }
      return next
    })
  }

  // Quick add player to roster & immediately check them in
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

      // Automatically check in the newly created player!
      setCheckedInPlayerIds((prev) => new Set(prev).add(createdId))
      setNewPlayerName('')
      setSaveSuccessMsg(`Added "${name}" and checked into Week ${selectedWeek}!`)
      setTimeout(() => setSaveSuccessMsg(null), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add player'
      setErrorMsg(msg)
    }
  }

  // Transition from Stage 1 to Stage 2 (build required courts: 4 players per court)
  const handleProceedToCourts = () => {
    if (checkedInPlayerIds.size === 0) {
      setErrorMsg('Please check in at least 1 player before assigning courts.')
      return
    }

    const courtCount = Math.max(1, Math.ceil(checkedInPlayerIds.size / 4))

    // Preserve existing assignments if they exist and are still checked in
    setCourts((prevCourts) => {
      return Array.from({ length: courtCount }, (_, i) => {
        const courtNum = i + 1
        const existingCourt = prevCourts.find((c) => c.courtNumber === courtNum)
        const emptyCourt = buildEmptyCourt(courtNum)

        if (!existingCourt) return emptyCourt

        return {
          ...existingCourt,
          slots: emptyCourt.slots.map((s, idx) => {
            const existingSlot = existingCourt.slots[idx]
            const isValid =
              existingSlot?.playerId && checkedInPlayerIds.has(existingSlot.playerId)

            return {
              ...s,
              playerId: isValid ? existingSlot.playerId : null,
              playerName: isValid ? existingSlot.playerName : null,
              points: existingSlot ? existingSlot.points : s.points,
            }
          }),
        }
      })
    })

    setErrorMsg(null)
    setStage('courts')
  }

  // Find all assigned player IDs across all court slots
  const assignedPlayerIds = useMemo(() => {
    const ids = new Set<string>()
    courts.forEach((c) => {
      c.slots.forEach((s) => {
        if (s.playerId) ids.add(s.playerId)
      })
    })
    return ids
  }, [courts])

  // Players currently in the top unassigned bench dock (checked-in minus assigned)
  const unassignedBenchPlayers = useMemo(() => {
    return roster.filter(
      (p) => checkedInPlayerIds.has(p.id) && !assignedPlayerIds.has(p.id)
    )
  }, [roster, checkedInPlayerIds, assignedPlayerIds])

  // Next available court slot in finishing order:
  // Court 1: 1st Place Team (Partner 1) -> 1st Place Team (Partner 2) -> 2nd Place Team (Partner 1) -> 2nd Place Team (Partner 2)
  // Court 2: ...
  const nextEmptySlot = useMemo(() => {
    for (const court of courts) {
      for (const slot of court.slots) {
        if (!slot.playerId) {
          return { courtNumber: court.courtNumber, slotId: slot.slotId }
        }
      }
    }
    return null
  }, [courts])

  // Tap name in top bench dock to place in finishing order
  const handleBenchPlayerTap = (player: PlayerScore) => {
    // If user clicked a specific slot target, fill that slot
    let targetSlotId = selectedSlotId
    if (!targetSlotId || !isSlotEmptyById(targetSlotId)) {
      // Otherwise fill next available slot in finishing order
      targetSlotId = nextEmptySlot ? nextEmptySlot.slotId : null
    }

    if (!targetSlotId) {
      setErrorMsg('All court slots are currently filled! Unassign a player to place another.')
      return
    }

    setCourts((prev) =>
      prev.map((court) => ({
        ...court,
        slots: court.slots.map((slot) => {
          if (slot.slotId !== targetSlotId) return slot
          return {
            ...slot,
            playerId: player.id,
            playerName: player.name,
          }
        }),
      }))
    )

    // Clear target slot selection after filling
    setSelectedSlotId(null)
    setErrorMsg(null)
  }

  const isSlotEmptyById = (slotId: string) => {
    for (const c of courts) {
      const s = c.slots.find((x) => x.slotId === slotId)
      if (s) return !s.playerId
    }
    return false
  }

  // Remove player from court slot back to bench dock
  const handleRemoveFromSlot = (slotId: string) => {
    setCourts((prev) =>
      prev.map((court) => ({
        ...court,
        slots: court.slots.map((slot) => {
          if (slot.slotId !== slotId) return slot
          return {
            ...slot,
            playerId: null,
            playerName: null,
          }
        }),
      }))
    )
  }

  // Adjust points for an entire Team (updating both players who share that place)
  const handleAdjustTeamPoints = (courtNum: number, teamPlace: 1 | 2, delta: number) => {
    setCourts((prev) =>
      prev.map((court) => {
        if (court.courtNumber !== courtNum) return court

        if (teamPlace === 1) {
          const newPts = Math.max(0, court.firstPlacePoints + delta)
          return {
            ...court,
            firstPlacePoints: newPts,
            slots: court.slots.map((s) => (s.teamPlace === 1 ? { ...s, points: newPts } : s)),
          }
        } else {
          const newPts = Math.max(0, court.secondPlacePoints + delta)
          return {
            ...court,
            secondPlacePoints: newPts,
            slots: court.slots.map((s) => (s.teamPlace === 2 ? { ...s, points: newPts } : s)),
          }
        }
      })
    )
  }

  // Reset all court assignments back to bench
  const handleResetCourtAssignments = () => {
    if (window.confirm('Reset all court assignments back to the bench?')) {
      setCourts((prev) =>
        prev.map((c) => ({
          ...c,
          slots: c.slots.map((s) => ({
            ...s,
            playerId: null,
            playerName: null,
          })),
        }))
      )
      setSelectedSlotId(null)
    }
  }

  // Save Week & Bulk Upsert to Database
  const handleSaveWeek = async () => {
    setSaving(true)
    setErrorMsg(null)
    setSaveSuccessMsg(null)

    try {
      const recordsToUpsert: {
        player_id: string
        week_number: number
        attended: boolean
        court_number: number | null
        finish_order: number | null
        points: number
      }[] = []

      // 1. All players placed on courts (two players per court share finish_order: 1, two share finish_order: 2)
      courts.forEach((c) => {
        c.slots.forEach((s) => {
          if (s.playerId) {
            recordsToUpsert.push({
              player_id: s.playerId,
              week_number: selectedWeek,
              attended: true,
              court_number: c.courtNumber,
              finish_order: s.teamPlace, // 1 for 1st place team, 2 for 2nd place team
              points: s.points, // Shared points!
            })
          }
        })
      })

      // 2. Any checked-in bench players who weren't assigned to a court
      unassignedBenchPlayers.forEach((p) => {
        recordsToUpsert.push({
          player_id: p.id,
          week_number: selectedWeek,
          attended: true,
          court_number: null,
          finish_order: null,
          points: 0,
        })
      })

      // 3. Any roster players who were NOT checked in
      roster.forEach((p) => {
        if (!checkedInPlayerIds.has(p.id)) {
          recordsToUpsert.push({
            player_id: p.id,
            week_number: selectedWeek,
            attended: false,
            court_number: null,
            finish_order: null,
            points: 0,
          })
        }
      })

      if (isSupabaseConfigured) {
        const { error: upsertError } = await supabase
          .from('weekly_scores')
          .upsert(recordsToUpsert, { onConflict: 'player_id,week_number' })

        if (upsertError) throw upsertError

        onLeaderboardUpdated()
      } else {
        // Demo mode: local storage sync
        const storedKey = `wendy_weekly_scores_w${selectedWeek}`
        const localRecords: WeeklyScoreRecord[] = recordsToUpsert.map((r) => ({
          playerId: r.player_id,
          weekNumber: r.week_number,
          attended: r.attended,
          courtNumber: r.court_number ?? undefined,
          finishOrder: r.finish_order ?? undefined,
          points: r.points,
        }))
        localStorage.setItem(storedKey, JSON.stringify(localRecords))

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
        `Week ${selectedWeek} saved! Bulk upserted ${recordsToUpsert.filter((r) => r.attended).length} players across ${courts.length} courts. Leaderboard recomputed.`
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to save court results'
      setErrorMsg(msg)
    } finally {
      setSaving(false)
    }
  }

  // Filter roster in Stage 1
  const filteredRoster = useMemo(() => {
    const q = searchFilter.trim().toLowerCase()
    if (!q) return roster
    return roster.filter((p) => p.name.toLowerCase().includes(q))
  }, [roster, searchFilter])

  // Count summaries
  const checkedInCount = checkedInPlayerIds.size
  const courtsRequired = Math.max(1, Math.ceil(checkedInCount / 4))
  const assignedCount = assignedPlayerIds.size

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
            Doubles Court Cards (2 Teams / Court)
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
                onClick={() => {
                  setSelectedWeek(week)
                  setStage('checkin')
                }}
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

      {/* Stage Progression Breadcrumb Bar */}
      <div className="flex items-center p-1 rounded-2xl bg-zinc-900 border border-zinc-800 text-xs font-bold shadow-md">
        <button
          onClick={() => setStage('checkin')}
          className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
            stage === 'checkin'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-mono">
            1
          </span>
          <span>Check-in ({checkedInCount})</span>
        </button>

        <button
          onClick={handleProceedToCourts}
          className={`flex-1 py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer ${
            stage === 'courts'
              ? 'bg-red-600 text-white shadow-md shadow-red-600/30'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-mono">
            2
          </span>
          <span>Court Cards ({courts.length} Courts)</span>
        </button>
      </div>

      {/* Alerts & Feedback */}
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

      {/* ========================================================= */}
      {/* STAGE 1: PLAYER CHECK-IN                                  */}
      {/* ========================================================= */}
      {stage === 'checkin' && (
        <div className="flex flex-col gap-5 animate-in fade-in duration-200">
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

          {/* Check-in Header & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-zinc-900/80 border border-zinc-800">
            <div className="flex items-center gap-4 text-xs">
              <div className="flex items-center gap-1.5 text-zinc-300 font-bold">
                <Users className="w-4 h-4 text-red-500" />
                <span>
                  <strong className="text-white font-mono text-sm">{checkedInCount}</strong> Checked In
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-zinc-300 font-bold">
                <Layers className="w-4 h-4 text-white" />
                <span>
                  <strong className="text-red-400 font-mono text-sm">{courtsRequired}</strong> Courts (4 players/court)
                </span>
              </div>
            </div>

            <div className="relative max-w-xs w-full">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search roster..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-black border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-red-500"
              />
            </div>
          </div>

          {/* Roster Check-in Grid */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1 text-xs text-zinc-400">
              <span className="font-bold uppercase tracking-wider">
                Tap players that participated
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCheckedInPlayerIds(new Set(roster.map((p) => p.id)))}
                  className="text-red-400 hover:text-white underline cursor-pointer"
                >
                  Select All
                </button>
                <span>•</span>
                <button
                  type="button"
                  onClick={() => setCheckedInPlayerIds(new Set())}
                  className="text-zinc-400 hover:text-white underline cursor-pointer"
                >
                  Clear
                </button>
              </div>
            </div>

            {loadingWeek ? (
              <div className="py-12 text-center text-zinc-400 text-sm flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-red-500" />
                <span>Loading Week {selectedWeek} check-ins...</span>
              </div>
            ) : filteredRoster.length === 0 ? (
              <div className="py-12 text-center text-zinc-500 text-sm rounded-2xl border border-zinc-800 bg-zinc-950/40">
                No players match your search filter.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredRoster.map((player) => {
                  const isChecked = checkedInPlayerIds.has(player.id)
                  return (
                    <div
                      key={player.id}
                      onClick={() => togglePlayerCheckin(player.id)}
                      className={`p-3 rounded-2xl border transition-all duration-150 flex items-center justify-between gap-3 cursor-pointer select-none ${
                        isChecked
                          ? 'bg-zinc-900 border-red-500/60 shadow-md shadow-red-950/20 ring-1 ring-red-500/30'
                          : 'bg-black/60 border-zinc-850 opacity-65 hover:opacity-100 hover:border-zinc-750'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Checkbox Icon */}
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all ${
                            isChecked
                              ? 'bg-red-600 text-white shadow-md shadow-red-600/40 ring-1 ring-red-400'
                              : 'border border-zinc-700 bg-zinc-900 text-transparent'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </div>

                        <div className="truncate">
                          <span
                            className={`font-bold text-sm block truncate ${
                              isChecked ? 'text-white' : 'text-zinc-400'
                            }`}
                          >
                            {player.name}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {isChecked ? 'Checked In' : 'Not Participating'}
                          </span>
                        </div>
                      </div>

                      {isChecked && (
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-950/80 border border-red-500/40 text-red-300 shrink-0">
                          Attended
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Bottom Proceed Action Button */}
          <div className="sticky bottom-4 z-20 w-full pt-2">
            <button
              onClick={handleProceedToCourts}
              disabled={checkedInCount === 0}
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 active:scale-[0.99] text-white font-black text-sm tracking-wide shadow-xl shadow-red-600/30 transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>
                Proceed to Court Cards ({checkedInCount} Players • {courtsRequired} Courts)
              </span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* STAGE 2: TOP UNASSIGNED BENCH DOCK & COURT CARDS           */}
      {/* ========================================================= */}
      {stage === 'courts' && (
        <div className="flex flex-col gap-6 animate-in fade-in duration-200">
          {/* Top Stage Navigation & Controls */}
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setStage('checkin')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white hover:border-zinc-700 text-xs font-semibold transition cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-red-500" />
              <span>Back to Check-in</span>
            </button>

            <button
              onClick={handleResetCourtAssignments}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white hover:border-zinc-700 text-xs font-medium transition cursor-pointer"
              title="Reset all assigned players back to bench dock"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Courts</span>
            </button>
          </div>

          {/* ======================================================= */}
          {/* TOP UNASSIGNED BENCH DOCK                                */}
          {/* ======================================================= */}
          <section className="sticky top-[60px] z-30 w-full rounded-2xl border border-red-500/40 bg-zinc-950/95 backdrop-blur-xl p-3 sm:p-4 shadow-2xl shadow-black/80 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-red-500" />
                <h3 className="text-xs sm:text-sm font-black text-white uppercase tracking-wider">
                  Unassigned Bench Dock
                </h3>
              </div>
              <span className="text-xs font-mono font-bold text-red-400 bg-red-950/60 border border-red-500/30 px-2 py-0.5 rounded-full">
                {unassignedBenchPlayers.length} on bench
              </span>
            </div>

            <p className="text-[11px] text-zinc-400 leading-snug">
              Tap names below in finishing order: Winning team partners (1st place) then Runner-up partners (2nd place).
            </p>

            {/* Bench Player Pills */}
            {unassignedBenchPlayers.length === 0 ? (
              <div className="py-2.5 px-3 rounded-xl bg-zinc-900 border border-white/20 text-xs text-white flex items-center justify-center gap-2 font-semibold">
                <Sparkles className="w-4 h-4 text-red-500 animate-pulse" />
                <span>All checked-in players are assigned to courts! Ready to save.</span>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto pr-1">
                {unassignedBenchPlayers.map((player) => (
                  <button
                    key={player.id}
                    onClick={() => handleBenchPlayerTap(player)}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-900 hover:bg-red-600/90 hover:text-white border border-zinc-700/80 hover:border-red-500 active:scale-95 transition-all cursor-pointer shadow-sm group select-none"
                    title={`Tap to place ${player.name} onto next court slot`}
                  >
                    <div className="w-5 h-5 rounded-full bg-zinc-800 text-zinc-300 group-hover:bg-black group-hover:text-white flex items-center justify-center text-[10px] font-bold">
                      {player.name.charAt(0)}
                    </div>
                    <span className="text-xs font-bold text-zinc-200 group-hover:text-white">
                      {player.name}
                    </span>
                    <Plus className="w-3.5 h-3.5 text-red-400 group-hover:text-white ml-0.5" />
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* ======================================================= */}
          {/* COURT CARDS (2 TEAMS OF 2 PLAYERS PER COURT)             */}
          {/* ======================================================= */}
          <section className="flex flex-col gap-5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-red-500" />
                <span>Rendered Courts ({courts.length} Courts • 2 Teams / 4 Players)</span>
              </span>
              <span className="text-xs font-mono text-zinc-500">
                {assignedCount} / {checkedInCount} assigned
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {courts.map((court) => {
                const filledCount = court.slots.filter((s) => s.playerId).length
                const isCourtFull = filledCount === 4
                const isTopCourt = court.courtNumber === 1

                const firstPlaceSlots = court.slots.filter((s) => s.teamPlace === 1)
                const secondPlaceSlots = court.slots.filter((s) => s.teamPlace === 2)

                return (
                  <div
                    key={court.courtNumber}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-2xl overflow-hidden flex flex-col"
                  >
                    {/* Court Card Header */}
                    <div className="p-3.5 bg-black border-b border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-xs border ${
                            isTopCourt
                              ? 'bg-amber-400 text-amber-950 border-amber-300'
                              : 'bg-red-950/60 border-red-500/40 text-red-400'
                          }`}
                        >
                          C{court.courtNumber}
                        </div>
                        <div>
                          <h4 className="font-black text-sm text-white tracking-wide flex items-center gap-1.5">
                            <span>Court {court.courtNumber}</span>
                            {isTopCourt && (
                              <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-amber-400/20 text-amber-300 border border-amber-400/40">
                                Top Court
                              </span>
                            )}
                          </h4>
                          <span className="text-[10px] text-zinc-500">2 Teams of 2 Players</span>
                        </div>
                      </div>

                      <span
                        className={`text-[11px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${
                          isCourtFull
                            ? 'bg-zinc-900 border-white/20 text-white'
                            : 'bg-red-950/60 border-red-500/40 text-red-300'
                        }`}
                      >
                        {filledCount}/4 Players
                      </span>
                    </div>

                    <div className="p-3.5 flex flex-col gap-4">
                      {/* ================================================= */}
                      {/* TEAM 1: 1ST PLACE WINNING TEAM (2 PLAYERS)        */}
                      {/* ================================================= */}
                      <div className="rounded-xl border border-amber-500/40 bg-gradient-to-b from-amber-950/20 to-black/80 p-3 flex flex-col gap-2.5 shadow-sm">
                        {/* Team Header & Shared Points Stepper */}
                        <div className="flex items-center justify-between pb-2 border-b border-amber-500/20 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                            <span className="font-black text-amber-300 uppercase tracking-wider text-[11px]">
                              1st Place Team (Winners)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-zinc-400 font-medium">Both share:</span>
                            <div className="flex items-center gap-0.5 bg-black border border-amber-500/40 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => handleAdjustTeamPoints(court.courtNumber, 1, -5)}
                                className="w-5 h-5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center text-xs cursor-pointer"
                                title="Minus 5 points for both 1st place players"
                              >
                                <Minus className="w-3 h-3" />
                              </button>

                              <span className="w-12 text-center font-mono font-black text-xs text-amber-300">
                                {court.firstPlacePoints} pts
                              </span>

                              <button
                                type="button"
                                onClick={() => handleAdjustTeamPoints(court.courtNumber, 1, 5)}
                                className="w-5 h-5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center text-xs cursor-pointer"
                                title="Add 5 points for both 1st place players"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 2 Player Slots for 1st Place Team */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {firstPlaceSlots.map((slot) => {
                            const isFilled = Boolean(slot.playerId)
                            const isTargeted = selectedSlotId === slot.slotId
                            const isNext = nextEmptySlot?.slotId === slot.slotId

                            return (
                              <div
                                key={slot.slotId}
                                onClick={() => {
                                  if (!isFilled) setSelectedSlotId(slot.slotId)
                                }}
                                className={`p-2.5 rounded-xl border transition-all duration-150 flex items-center justify-between gap-2 ${
                                  isFilled
                                    ? 'bg-zinc-900/90 border-amber-500/30'
                                    : isTargeted
                                    ? 'bg-amber-950/50 border-amber-400 ring-2 ring-amber-400/50 cursor-pointer animate-pulse'
                                    : isNext
                                    ? 'bg-black border-amber-500/50 border-dashed cursor-pointer hover:border-amber-400'
                                    : 'bg-black/50 border-zinc-800 border-dashed cursor-pointer hover:border-zinc-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="w-6 h-6 rounded-md bg-amber-400 text-amber-950 font-black text-[11px] flex items-center justify-center shrink-0">
                                    1st
                                  </div>

                                  {isFilled ? (
                                    <div className="truncate flex-1">
                                      <span className="font-bold text-xs text-white truncate block">
                                        {slot.playerName}
                                      </span>
                                      <span className="text-[10px] text-amber-400/80 font-mono">
                                        Partner {slot.playerIndex} • {slot.points} pts
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="truncate flex-1">
                                      <span
                                        className={`text-xs font-semibold ${
                                          isTargeted || isNext ? 'text-amber-300 font-bold' : 'text-zinc-500'
                                        }`}
                                      >
                                        {isTargeted
                                          ? 'Selected Target'
                                          : isNext
                                          ? 'Next: 1st Place'
                                          : `Partner ${slot.playerIndex}`}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {isFilled && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRemoveFromSlot(slot.slotId)
                                    }}
                                    className="w-5 h-5 rounded-md bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-400 border border-zinc-700 flex items-center justify-center transition cursor-pointer shrink-0"
                                    title="Unassign player back to bench"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* ================================================= */}
                      {/* TEAM 2: 2ND PLACE RUNNER-UP TEAM (2 PLAYERS)      */}
                      {/* ================================================= */}
                      <div className="rounded-xl border border-zinc-700/80 bg-gradient-to-b from-zinc-900/60 to-black/80 p-3 flex flex-col gap-2.5 shadow-sm">
                        {/* Team Header & Shared Points Stepper */}
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-800 text-xs">
                          <div className="flex items-center gap-1.5">
                            <Medal className="w-4 h-4 text-zinc-300 shrink-0" />
                            <span className="font-black text-zinc-200 uppercase tracking-wider text-[11px]">
                              2nd Place Team (Runners-Up)
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-zinc-400 font-medium">Both share:</span>
                            <div className="flex items-center gap-0.5 bg-black border border-zinc-700 rounded-lg p-0.5">
                              <button
                                type="button"
                                onClick={() => handleAdjustTeamPoints(court.courtNumber, 2, -5)}
                                className="w-5 h-5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center text-xs cursor-pointer"
                                title="Minus 5 points for both 2nd place players"
                              >
                                <Minus className="w-3 h-3" />
                              </button>

                              <span className="w-12 text-center font-mono font-black text-xs text-white">
                                {court.secondPlacePoints} pts
                              </span>

                              <button
                                type="button"
                                onClick={() => handleAdjustTeamPoints(court.courtNumber, 2, 5)}
                                className="w-5 h-5 rounded bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white flex items-center justify-center text-xs cursor-pointer"
                                title="Add 5 points for both 2nd place players"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {/* 2 Player Slots for 2nd Place Team */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {secondPlaceSlots.map((slot) => {
                            const isFilled = Boolean(slot.playerId)
                            const isTargeted = selectedSlotId === slot.slotId
                            const isNext = nextEmptySlot?.slotId === slot.slotId

                            return (
                              <div
                                key={slot.slotId}
                                onClick={() => {
                                  if (!isFilled) setSelectedSlotId(slot.slotId)
                                }}
                                className={`p-2.5 rounded-xl border transition-all duration-150 flex items-center justify-between gap-2 ${
                                  isFilled
                                    ? 'bg-zinc-900/90 border-zinc-700'
                                    : isTargeted
                                    ? 'bg-red-950/50 border-red-500 ring-2 ring-red-500/40 cursor-pointer animate-pulse'
                                    : isNext
                                    ? 'bg-black border-red-500/50 border-dashed cursor-pointer hover:border-red-400'
                                    : 'bg-black/50 border-zinc-800 border-dashed cursor-pointer hover:border-zinc-700'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  <div className="w-6 h-6 rounded-md bg-zinc-200 text-zinc-900 font-black text-[11px] flex items-center justify-center shrink-0">
                                    2nd
                                  </div>

                                  {isFilled ? (
                                    <div className="truncate flex-1">
                                      <span className="font-bold text-xs text-white truncate block">
                                        {slot.playerName}
                                      </span>
                                      <span className="text-[10px] text-zinc-400 font-mono">
                                        Partner {slot.playerIndex} • {slot.points} pts
                                      </span>
                                    </div>
                                  ) : (
                                    <div className="truncate flex-1">
                                      <span
                                        className={`text-xs font-semibold ${
                                          isTargeted || isNext ? 'text-red-400 font-bold' : 'text-zinc-500'
                                        }`}
                                      >
                                        {isTargeted
                                          ? 'Selected Target'
                                          : isNext
                                          ? 'Next: 2nd Place'
                                          : `Partner ${slot.playerIndex}`}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {isFilled && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleRemoveFromSlot(slot.slotId)
                                    }}
                                    className="w-5 h-5 rounded-md bg-zinc-800 hover:bg-red-950 text-zinc-400 hover:text-red-400 border border-zinc-700 flex items-center justify-center transition cursor-pointer shrink-0"
                                    title="Unassign player back to bench"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Sticky Bottom Save Action Bar */}
          <div className="sticky bottom-4 z-20 w-full pt-2">
            <div className="w-full p-4 rounded-2xl bg-zinc-950/95 border border-zinc-800 backdrop-blur-lg shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs text-zinc-300">
                <Trophy className="w-4 h-4 text-red-500 shrink-0" />
                <span>
                  <strong>Week {selectedWeek}</strong> • {assignedCount} / {checkedInCount} on Courts
                  {unassignedBenchPlayers.length > 0 && (
                    <span className="text-red-400 font-bold ml-1">
                      ({unassignedBenchPlayers.length} unassigned on bench)
                    </span>
                  )}
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
                    <span>Saving Court Results...</span>
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
      )}
    </div>
  )
}
