import { useState, useEffect, useMemo, useCallback } from 'react'
import { PlayerScore, CourtData, WeeklyScoreRecord } from '../types/leaderboard'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { getTeamOverallRank } from '../utils/scoring'
import type { SaveResult } from '../components/SaveResultModal'

interface UseWeeklyEntryArgs {
  roster: PlayerScore[]
  onLeaderboardUpdated: () => void
  onAddNewPlayerToRoster: (newPlayer: PlayerScore) => void
}

// Default points: 10 for the overall 1st place team, then 1 fewer for each following team
// (Court 1 winners 10, Court 1 runners-up 9, Court 2 winners 8, ...), floored at 0.
// Both players on a team share the team's points.
const getCourtDefaultPoints = (courtNum: number) => {
  const first = Math.max(0, 11 - getTeamOverallRank(courtNum, 1))
  const second = Math.max(0, 11 - getTeamOverallRank(courtNum, 2))
  return { first, second }
}

export const useWeeklyEntry = ({
  roster,
  onLeaderboardUpdated,
  onAddNewPlayerToRoster,
}: UseWeeklyEntryArgs) => {
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
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null)

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
    setSaveResult(null)

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

      setSaveResult({
        status: 'success',
        message: `Saved ${recordsToUpsert.filter((r) => r.attended).length} players across ${courts.length} courts. Leaderboard recomputed.`,
      })
    } catch (err: unknown) {
      console.error('Failed to save court results:', err)
      let msg = 'Failed to save court results'
      if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
        const e = err as { message: string; details?: string; hint?: string }
        msg = [e.message, e.details, e.hint].filter(Boolean).join(' – ')
        if (/row-level security|jwt|permission denied/i.test(e.message)) {
          msg += ' (Please log in as admin and try again.)'
        }
      }
      setSaveResult({ status: 'error', message: msg })
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

  return {
    selectedWeek,
    setSelectedWeek,
    stage,
    setStage,
    saveResult,
    setSaveResult,
    checkedInPlayerIds,
    setCheckedInPlayerIds,
    newPlayerName,
    setNewPlayerName,
    searchFilter,
    setSearchFilter,
    courts,
    selectedSlotId,
    setSelectedSlotId,
    saving,
    loadingWeek,
    saveSuccessMsg,
    errorMsg,
    togglePlayerCheckin,
    handleQuickAddPlayer,
    handleProceedToCourts,
    unassignedBenchPlayers,
    nextEmptySlot,
    handleBenchPlayerTap,
    handleRemoveFromSlot,
    handleAdjustTeamPoints,
    handleResetCourtAssignments,
    handleSaveWeek,
    filteredRoster,
    checkedInCount,
    courtsRequired,
    assignedCount,
  }
}

export type WeeklyEntry = ReturnType<typeof useWeeklyEntry>
