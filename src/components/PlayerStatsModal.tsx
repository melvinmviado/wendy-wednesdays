import React, { useEffect, useRef, useState } from 'react'
import type { PlayerScore } from '../types/leaderboard'
import { useDialogBehavior } from '../hooks/useDialogBehavior'
import { usePlayerStats } from '../hooks/usePlayerStats'
import { EXIT_MS, prefersReducedMotion } from '../utils/motion'
import { PlayerStatsDialog } from './PlayerStatsDialog'
import type { RankMovement } from '../utils/ranking'

export interface SelectedPlayer {
  player: PlayerScore
  rank: number
  tied: boolean
  movement?: RankMovement
}

interface PlayerStatsModalProps {
  selected: SelectedPlayer | null
  onClose: () => void
  onSelectWeek?: (weekNumber: number) => void // jump to that week in Weekly Results
}

// Owns data, focus/scroll behaviour and the exit transition; PlayerStatsDialog does the rendering.
export const PlayerStatsModal: React.FC<PlayerStatsModalProps> = ({ selected, onClose, onSelectWeek }) => {
  const panelRef = useRef<HTMLDivElement>(null)
  // Keep the last player mounted while the exit transition plays
  const [lingering, setLingering] = useState<SelectedPlayer | null>(null)

  useEffect(() => {
    if (selected) {
      setLingering(selected)
      return
    }
    if (!lingering) return
    if (prefersReducedMotion()) {
      setLingering(null)
      return
    }
    const timer = setTimeout(() => setLingering(null), EXIT_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  // With reduced motion there is no exit transition, so nothing lingers
  const current = selected ?? (prefersReducedMotion() ? null : lingering)
  useDialogBehavior(selected !== null, panelRef, onClose)
  const { stats, loading, error, retry, available } = usePlayerStats(current?.player.id ?? null)

  if (!current) return null
  return (
    <PlayerStatsDialog
      selected={current}
      state={{ stats, loading, error, available }}
      panelRef={panelRef}
      leaving={selected === null}
      onRetry={retry}
      onClose={onClose}
      onSelectWeek={onSelectWeek}
    />
  )
}
