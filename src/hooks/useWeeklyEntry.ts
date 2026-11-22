import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { PlayerScore, CourtData, WeeklyScoreRecord } from '../types/leaderboard'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import {
  buildCourtsFromRecords,
  buildSaveRecords,
  getCourtWarnings,
  getSeatedPlayerIds,
  moveOrSwapPlayers,
  seatPlayer,
  unseatPlayer,
  type SavedPlacement,
} from '../utils/weeklyEntry'
import type { SaveResult } from '../components/SaveResultModal'
import { createPlayer, persistActivePlayers } from '../data/players'

interface UseWeeklyEntryArgs {
  roster: PlayerScore[]
  onLeaderboardUpdated: () => void
  onAddNewPlayerToRoster: (newPlayer: PlayerScore) => void
}

const UNKNOWN_PLAYER = 'Archived player'

/** Who sits where and for how many points: what Save would write. Names don't count. */
const placementKey = (courts: CourtData[]): string =>
  JSON.stringify(courts.map((c) => c.slots.map((s) => [s.playerId, s.points])))

export const useWeeklyEntry = ({
  roster,
  onLeaderboardUpdated,
  onAddNewPlayerToRoster,
}: UseWeeklyEntryArgs) => {
  // Navigation & Week Selection
  const [selectedWeek, setSelectedWeek] = useState<number>(1)

  // Roster search / quick add (attendance is derived from court placement)
  const [newPlayerName, setNewPlayerName] = useState('')
  const [searchFilter, setSearchFilter] = useState('')

  // Court Data (Each court has 2 teams of 2 players: 1st place team & 2nd place team)
  const [courts, setCourts] = useState<CourtData[]>([])
  // Empty slot the next roster tap should fill, and seated slot picked for swap/move/remove
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [pickedSlotId, setPickedSlotId] = useState<string | null>(null)

  // Status & Feedback
  const [saving, setSaving] = useState(false)
  const [loadingWeek, setLoadingWeek] = useState(false)
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<SaveResult | null>(null)
  // How many legacy attended-but-unseated players were auto-placed on load (0 = no notice)
  const [legacyPlacedCount, setLegacyPlacedCount] = useState(0)
  // The active week could not be loaded: nothing on screen reflects it, so saving is blocked
  // until a retry succeeds (otherwise the previous week's seating could overwrite this one).
  const [loadFailed, setLoadFailed] = useState(false)
  // placementKey of the courts as last loaded or saved, to warn before discarding edits
  const [savedKey, setSavedKey] = useState(() => placementKey([]))

  // Roster is read through a ref so a roster change (e.g. quick add) never reloads the week
  // and wipes unsaved seating.
  const rosterRef = useRef(roster)
  // Players with an attended row for the active week as last loaded/saved. Lets save mark
  // players who were removed from a court (even if no longer on the roster) as not attended.
  const savedAttendeeIdsRef = useRef<Set<string>>(new Set())
  const loadSeqRef = useRef(0)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
  }, [])

  // Load existing week entries from Supabase or localStorage
  const loadWeekData = useCallback(async (week: number) => {
    const seq = ++loadSeqRef.current
    setLoadingWeek(true)
    setErrorMsg(null)
    setSaveSuccessMsg(null)
    setLegacyPlacedCount(0)
    setLoadFailed(false)

    try {
      let attendedRows: SavedPlacement[] = []

      if (isSupabaseConfigured) {
        const { data, error } = await supabase
          .from('weekly_scores')
          .select('player_id, attended, court_number, finish_order, points')
          .eq('week_number', week)

        if (error) throw error

        attendedRows = (data ?? [])
          .filter((row) => row.attended)
          .map((row) => ({
            playerId: row.player_id,
            courtNumber: row.court_number,
            finishOrder: row.finish_order,
            points: row.points,
          }))
      } else {
        // Demo mode from localStorage
        const saved = localStorage.getItem(`wendy_weekly_scores_w${week}`)
        if (saved) {
          try {
            const parsed: WeeklyScoreRecord[] = JSON.parse(saved)
            attendedRows = parsed.filter((s) => s.attended)
          } catch {
            // ignore
          }
        }
      }

      if (seq !== loadSeqRef.current) return // a newer week load superseded this one

      const nameOf = (id: string) =>
        rosterRef.current.find((p) => p.id === id)?.name ?? UNKNOWN_PLAYER
      const { courts: loaded, unseatedCount } = buildCourtsFromRecords(attendedRows, nameOf)

      savedAttendeeIdsRef.current = new Set(attendedRows.map((r) => r.playerId))
      setCourts(loaded)
      setSavedKey(placementKey(loaded))
      setSelectedSlotId(null)
      setPickedSlotId(null)
      setLegacyPlacedCount(unseatedCount)
    } catch (err: unknown) {
      if (seq !== loadSeqRef.current) return
      const msg = err instanceof Error ? err.message : 'Error loading week data'
      setErrorMsg(`Couldn't load Week ${week}: ${msg}`)
      // Drop the previous week's seating so it can't be saved under this week's number
      savedAttendeeIdsRef.current = new Set()
      setCourts([])
      setSavedKey(placementKey([]))
      setSelectedSlotId(null)
      setPickedSlotId(null)
      setLoadFailed(true)
    } finally {
      if (seq === loadSeqRef.current) setLoadingWeek(false)
    }
  }, [])

  // Reload only when the active week changes
  useEffect(() => {
    loadWeekData(selectedWeek)
  }, [selectedWeek, loadWeekData])

  // Keep the roster ref current, and fill in names for players seated before the roster arrived
  useEffect(() => {
    rosterRef.current = roster
    setCourts((prev) => {
      let changed = false
      const next = prev.map((c) => ({
        ...c,
        slots: c.slots.map((s) => {
          if (!s.playerId || s.playerName !== UNKNOWN_PLAYER) return s
          const p = roster.find((x) => x.id === s.playerId)
          if (!p) return s
          changed = true
          return { ...s, playerName: p.name }
        }),
      }))
      return changed ? next : prev
    })
  }, [roster])

  // Seat everyone on the roster in order (replaces the current placement, so confirm first)
  const handleSelectAll = () => {
    if (
      attendedPlayerIds.size > 0 &&
      !window.confirm('Seat everyone in roster order? This replaces the current court placement.')
    ) {
      return
    }
    setCourts(roster.reduce((acc, p) => seatPlayer(acc, p), [] as CourtData[]))
    setSelectedSlotId(null)
    setPickedSlotId(null)
  }

  // Quick add player to roster & immediately seat them
  const handleQuickAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newPlayerName.trim()
    if (!name) return

    setErrorMsg(null)
    setSaveSuccessMsg(null)

    // Same path as the Players page: duplicate-name checks and friendly errors in both modes.
    // Totals come from the saved scores, so the new player starts at 0 weeks / 0 points.
    const result = await createPlayer(name)
    if (!result.ok) {
      setErrorMsg(result.error.message)
      return
    }
    const newPlayer = result.data
    onAddNewPlayerToRoster(newPlayer)

    // Automatically seat the newly created player
    setCourts((prev) => seatPlayer(prev, newPlayer))
    setNewPlayerName('')
    setSaveSuccessMsg(`Added "${name}" and checked into Week ${selectedWeek}!`)
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    successTimerRef.current = setTimeout(() => setSaveSuccessMsg(null), 3000)
  }

  const isDirty = placementKey(courts) !== savedKey

  // Switch weeks. Not while a save is running (it would finish against the new week's state),
  // and unsaved seating is only thrown away after the admin confirms.
  const selectWeek = (week: number) => {
    if (week === selectedWeek || saving) return
    if (isDirty && !window.confirm(`Week ${selectedWeek} has unsaved changes. Discard them and open Week ${week}?`)) return
    setSaveResult(null)
    setSelectedWeek(week)
  }

  const retryLoad = () => loadWeekData(selectedWeek)

  // Court placement is the single source of truth for attendance (derived, never duplicated)
  const attendedPlayerIds = useMemo(() => getSeatedPlayerIds(courts), [courts])

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

  // Tap an unseated roster name to seat them: the targeted empty slot if any, else the next slot
  // (adds a court when every slot is full)
  const handleBenchPlayerTap = (player: PlayerScore) => {
    const target = selectedSlotId
    setCourts((prev) => seatPlayer(prev, player, target))
    setSelectedSlotId(null)
    setPickedSlotId(null)
    setErrorMsg(null)
  }

  // Tap a court slot. Seated: pick it (then tap another seated slot to swap, or an empty slot to
  // move). Empty: move the picked player there, or target it for the next roster tap.
  const handleSlotTap = (slotId: string) => {
    const slot = courts.flatMap((c) => c.slots).find((s) => s.slotId === slotId)
    if (!slot) return
    if (pickedSlotId) {
      if (pickedSlotId !== slotId) setCourts((prev) => moveOrSwapPlayers(prev, pickedSlotId, slotId))
      setPickedSlotId(null)
      return
    }
    if (slot.playerId) {
      setPickedSlotId(slotId)
      setSelectedSlotId(null)
    } else {
      setSelectedSlotId((cur) => (cur === slotId ? null : slotId))
    }
  }

  // Remove player from their court slot (they become absent unless re-seated)
  const handleRemoveFromSlot = (slotId: string) => {
    const playerId = courts.flatMap((c) => c.slots).find((s) => s.slotId === slotId)?.playerId
    if (!playerId) return
    setCourts((prev) => unseatPlayer(prev, playerId))
    setPickedSlotId(null)
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
      setPickedSlotId(null)
    }
  }

  // Save Week & Bulk Upsert to Database
  const handleSaveWeek = async () => {
    if (loadFailed || loadingWeek || saving) return // nothing trustworthy to save yet
    // Incomplete courts are allowed, but the admin must confirm
    if (
      attendedPlayerIds.size === 0 &&
      !window.confirm(`No players are seated. Saving will mark everyone absent for Week ${selectedWeek}.`)
    ) {
      return
    }
    const warnings = getCourtWarnings(courts)
    if (warnings.length > 0 && !window.confirm(`${warnings.join('\n')}\n\nSave anyway?`)) return

    setSaving(true)
    setErrorMsg(null)
    setSaveSuccessMsg(null)
    setSaveResult(null)
    // A week switch during the save starts a new load; the result below must not leak into it.
    const loadSeq = loadSeqRef.current
    const savedCourtsKey = placementKey(courts)

    try {
      // attended = true exactly for seated players; everyone else (including players removed from
      // a court since the last save) is written as not attended so stats stay correct.
      const recordsToUpsert = buildSaveRecords(
        courts,
        roster,
        selectedWeek,
        savedAttendeeIdsRef.current
      )

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

        persistActivePlayers(updatedLeaderboard)
        onLeaderboardUpdated()
      }

      if (loadSeq === loadSeqRef.current) {
        savedAttendeeIdsRef.current = new Set(attendedPlayerIds)
        setSavedKey(savedCourtsKey)
      }
      setLegacyPlacedCount(0)
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

  // Count summaries ("12 players, 3 courts")
  const attendedCount = attendedPlayerIds.size
  const courtCount = attendedCount === 0 ? 0 : courts.length

  return {
    selectedWeek,
    selectWeek,
    saveResult,
    setSaveResult,
    attendedPlayerIds,
    attendedCount,
    courtCount,
    handleSelectAll,
    pickedSlotId,
    handleSlotTap,
    newPlayerName,
    setNewPlayerName,
    searchFilter,
    setSearchFilter,
    courts,
    selectedSlotId,
    setSelectedSlotId,
    saving,
    loadingWeek,
    loadFailed,
    retryLoad,
    isDirty,
    saveSuccessMsg,
    errorMsg,
    legacyPlacedCount,
    dismissLegacyNotice: () => setLegacyPlacedCount(0),
    handleQuickAddPlayer,
    nextEmptySlot,
    handleBenchPlayerTap,
    handleRemoveFromSlot,
    handleAdjustTeamPoints,
    handleResetCourtAssignments,
    handleSaveWeek,
    filteredRoster,
  }
}

export type WeeklyEntry = ReturnType<typeof useWeeklyEntry>
