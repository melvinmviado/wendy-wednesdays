import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CourtData, PlayerScore } from '@/types/leaderboard'
import { getSeatedPlayerIds, moveOrSwapPlayers, seatPlayer, unseatPlayer } from '@/utils/weeklyEntry'

/** Shown for a seated player who isn't on the roster (archived, or the roster hasn't loaded yet). */
export const UNKNOWN_PLAYER = 'Archived player'

/**
 * The court board of the weekly-entry screen: who sits where, the points per team, and the two
 * tap selections (an empty slot targeted for the next roster tap, a seated slot picked to swap,
 * move or remove). Court placement is the only record of attendance. Loading and saving a week
 * live in useWeeklyEntry.
 */
export function useCourtBoard(roster: PlayerScore[]) {
  // Each court has 2 teams of 2 players: the 1st place team and the 2nd place team
  const [courts, setCourts] = useState<CourtData[]>([])
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null)
  const [pickedSlotId, setPickedSlotId] = useState<string | null>(null)

  const clearSelection = () => {
    setSelectedSlotId(null)
    setPickedSlotId(null)
  }

  /** Replace the whole board (a week was loaded, or failed to load). Stable across renders. */
  const replaceCourts = useCallback((next: CourtData[]) => {
    setCourts(next)
    setSelectedSlotId(null)
    setPickedSlotId(null)
  }, [])

  // Fill in names for players seated before the roster arrived
  useEffect(() => {
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

  // Court placement is the single source of truth for attendance (derived, never duplicated)
  const attendedPlayerIds = useMemo(() => getSeatedPlayerIds(courts), [courts])

  // Next available slot in finishing order: Court 1 1st place team (partner 1, partner 2), then its
  // 2nd place team, then Court 2, ...
  const nextEmptySlot = useMemo(() => {
    for (const court of courts) {
      for (const slot of court.slots) {
        if (!slot.playerId) return { courtNumber: court.courtNumber, slotId: slot.slotId }
      }
    }
    return null
  }, [courts])

  // Seat everyone on the roster in order (replaces the current placement, so confirm first)
  const handleSelectAll = () => {
    if (
      attendedPlayerIds.size > 0 &&
      !window.confirm('Seat everyone in roster order? This replaces the current court placement.')
    ) {
      return
    }
    replaceCourts(roster.reduce((acc, p) => seatPlayer(acc, p), [] as CourtData[]))
  }

  /** Seat a player in the next open slot (used after a quick add). */
  const seat = (player: Pick<PlayerScore, 'id' | 'name'>) => setCourts((prev) => seatPlayer(prev, player))

  // Tap an unseated roster name to seat them: the targeted empty slot if any, else the next slot
  // (adds a court when every slot is full)
  const handleBenchPlayerTap = (player: PlayerScore) => {
    const target = selectedSlotId
    setCourts((prev) => seatPlayer(prev, player, target))
    clearSelection()
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

  // Remove a player from their slot (they become absent unless re-seated)
  const handleRemoveFromSlot = (slotId: string) => {
    const playerId = courts.flatMap((c) => c.slots).find((s) => s.slotId === slotId)?.playerId
    if (!playerId) return
    setCourts((prev) => unseatPlayer(prev, playerId))
    setPickedSlotId(null)
  }

  // Adjust points for a whole team (both partners share the place)
  const handleAdjustTeamPoints = (courtNum: number, teamPlace: 1 | 2, delta: number) => {
    setCourts((prev) =>
      prev.map((court) => {
        if (court.courtNumber !== courtNum) return court
        const key = teamPlace === 1 ? 'firstPlacePoints' : 'secondPlacePoints'
        const newPts = Math.max(0, court[key] + delta)
        return {
          ...court,
          [key]: newPts,
          slots: court.slots.map((s) => (s.teamPlace === teamPlace ? { ...s, points: newPts } : s)),
        }
      })
    )
  }

  // Send everyone back to the bench (courts and their points stay)
  const handleResetCourtAssignments = () => {
    if (!window.confirm('Reset all court assignments back to the bench?')) return
    setCourts((prev) => prev.map((c) => ({ ...c, slots: c.slots.map((s) => ({ ...s, playerId: null, playerName: null })) })))
    clearSelection()
  }

  return {
    courts,
    replaceCourts,
    selectedSlotId,
    setSelectedSlotId,
    pickedSlotId,
    attendedPlayerIds,
    nextEmptySlot,
    seat,
    handleSelectAll,
    handleBenchPlayerTap,
    handleSlotTap,
    handleRemoveFromSlot,
    handleAdjustTeamPoints,
    handleResetCourtAssignments,
  }
}
