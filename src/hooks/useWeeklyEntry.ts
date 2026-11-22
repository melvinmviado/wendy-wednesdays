import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import type { PlayerScore, CourtData } from '../types/leaderboard'
import { buildCourtsFromRecords, buildSaveRecords, getCourtWarnings } from '../utils/weeklyEntry'
import type { SaveResult } from '../components/SaveResultModal'
import { createPlayer } from '../data/players'
import { loadWeekPlacements, saveWeekScores } from '../data/weekEntry'
import { UNKNOWN_PLAYER, useCourtBoard } from './useCourtBoard'

interface UseWeeklyEntryArgs {
  roster: PlayerScore[]
  onLeaderboardUpdated: () => void
  onAddNewPlayerToRoster: (newPlayer: PlayerScore) => void
}

/** Who sits where and for how many points: what Save would write. Names don't count. */
const placementKey = (courts: CourtData[]): string =>
  JSON.stringify(courts.map((c) => c.slots.map((s) => [s.playerId, s.points])))

/** A save error in plain words, with a hint when it looks like a sign-in problem. */
function saveErrorMessage(err: unknown): string {
  if (typeof err !== 'object' || err === null || !('message' in err) || typeof err.message !== 'string') {
    return 'Failed to save court results'
  }
  const e = err as { message: string; details?: string; hint?: string }
  const msg = [e.message, e.details, e.hint].filter(Boolean).join(' – ')
  return /row-level security|jwt|permission denied/i.test(e.message) ? `${msg} (Please log in as admin and try again.)` : msg
}

/**
 * The admin weekly-entry screen: pick a week, load its saved seating onto the court board
 * (useCourtBoard), quick-add players, and save. Guards: a failed load blocks Save until a retry
 * succeeds, weeks can't be switched mid-save, and unsaved seating is only discarded on confirm.
 */
export const useWeeklyEntry = ({ roster, onLeaderboardUpdated, onAddNewPlayerToRoster }: UseWeeklyEntryArgs) => {
  const board = useCourtBoard(roster)
  const { courts, replaceCourts, attendedPlayerIds } = board

  const [selectedWeek, setSelectedWeek] = useState<number>(1)
  const [newPlayerName, setNewPlayerName] = useState('')
  const [searchFilter, setSearchFilter] = useState('')

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
  useEffect(() => {
    rosterRef.current = roster
  }, [roster])
  // Players with an attended row for the active week as last loaded/saved. Lets save mark
  // players who were removed from a court (even if no longer on the roster) as not attended.
  const savedAttendeeIdsRef = useRef<Set<string>>(new Set())
  const loadSeqRef = useRef(0)
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
  }, [])

  const loadWeekData = useCallback(async (week: number) => {
    const seq = ++loadSeqRef.current
    setLoadingWeek(true)
    setErrorMsg(null)
    setSaveSuccessMsg(null)
    setLegacyPlacedCount(0)
    setLoadFailed(false)

    try {
      const attendedRows = await loadWeekPlacements(week)
      if (seq !== loadSeqRef.current) return // a newer week load superseded this one

      const nameOf = (id: string) => rosterRef.current.find((p) => p.id === id)?.name ?? UNKNOWN_PLAYER
      const { courts: loaded, unseatedCount } = buildCourtsFromRecords(attendedRows, nameOf)
      savedAttendeeIdsRef.current = new Set(attendedRows.map((r) => r.playerId))
      replaceCourts(loaded)
      setSavedKey(placementKey(loaded))
      setLegacyPlacedCount(unseatedCount)
    } catch (err: unknown) {
      if (seq !== loadSeqRef.current) return
      const msg = err instanceof Error ? err.message : 'Error loading week data'
      setErrorMsg(`Couldn't load Week ${week}: ${msg}`)
      // Drop the previous week's seating so it can't be saved under this week's number
      savedAttendeeIdsRef.current = new Set()
      replaceCourts([])
      setSavedKey(placementKey([]))
      setLoadFailed(true)
    } finally {
      if (seq === loadSeqRef.current) setLoadingWeek(false)
    }
  }, [replaceCourts])

  // Reload only when the active week changes
  useEffect(() => {
    loadWeekData(selectedWeek)
  }, [selectedWeek, loadWeekData])

  // Quick add a player to the roster and seat them at once
  const handleQuickAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newPlayerName.trim()
    if (!name) return
    setErrorMsg(null)
    setSaveSuccessMsg(null)

    // Same path as the Players page: duplicate-name checks and friendly errors in both modes.
    const result = await createPlayer(name)
    if (!result.ok) {
      setErrorMsg(result.error.message)
      return
    }
    onAddNewPlayerToRoster(result.data)
    board.seat(result.data)
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
      const records = buildSaveRecords(courts, roster, selectedWeek, savedAttendeeIdsRef.current)
      await saveWeekScores(records, selectedWeek, roster)
      onLeaderboardUpdated()

      if (loadSeq === loadSeqRef.current) {
        savedAttendeeIdsRef.current = new Set(attendedPlayerIds)
        setSavedKey(savedCourtsKey)
      }
      setLegacyPlacedCount(0)
      setSaveResult({
        status: 'success',
        message: `Saved ${records.filter((r) => r.attended).length} players across ${courts.length} courts. Leaderboard recomputed.`,
      })
    } catch (err: unknown) {
      console.error('Failed to save court results:', err)
      setSaveResult({ status: 'error', message: saveErrorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const filteredRoster = useMemo(() => {
    const q = searchFilter.trim().toLowerCase()
    return q ? roster.filter((p) => p.name.toLowerCase().includes(q)) : roster
  }, [roster, searchFilter])

  // Count summaries ("12 players, 3 courts")
  const attendedCount = attendedPlayerIds.size
  const courtCount = attendedCount === 0 ? 0 : courts.length

  return {
    ...board,
    handleBenchPlayerTap: (player: PlayerScore) => {
      board.handleBenchPlayerTap(player)
      setErrorMsg(null)
    },
    selectedWeek,
    selectWeek,
    saveResult,
    setSaveResult,
    attendedCount,
    courtCount,
    newPlayerName,
    setNewPlayerName,
    searchFilter,
    setSearchFilter,
    saving,
    loadingWeek,
    loadFailed,
    retryLoad: () => loadWeekData(selectedWeek),
    isDirty,
    saveSuccessMsg,
    errorMsg,
    legacyPlacedCount,
    dismissLegacyNotice: () => setLegacyPlacedCount(0),
    handleQuickAddPlayer,
    handleSaveWeek,
    filteredRoster,
  }
}

export type WeeklyEntry = ReturnType<typeof useWeeklyEntry>
