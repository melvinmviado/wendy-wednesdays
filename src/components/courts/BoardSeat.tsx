import React from 'react'
import { AlertTriangle, UserPlus } from 'lucide-react'
import type { BoardEntry } from '@/utils/courtBoardModel'
import { Avatar } from '../Avatar'
import { dragSource, dropTarget } from './boardDnd'

const focus = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover'

interface PlayerChipProps {
  entry: BoardEntry
  selected: boolean
  /** On the board twice: the editor blocks publishing until it is fixed. */
  duplicate?: boolean
  draggable: boolean
  onTap: (id: string) => void
  onDrop: (draggedId: string, targetId: string) => void
}

/** A player on a court or in the tray. Tap to select; with one selected, tap another to swap. */
export const PlayerChip: React.FC<PlayerChipProps> = ({ entry, selected, duplicate, draggable, onTap, onDrop }) => (
  <button
    type="button"
    aria-pressed={selected}
    aria-label={`${entry.name}, seed ${entry.seedRank}${duplicate ? ', on the board twice' : ''}`}
    onClick={() => onTap(entry.id)}
    {...dragSource(entry.id, draggable)}
    {...dropTarget((id) => onDrop(id, entry.id), draggable)}
    className={`flex min-h-14 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm transition-colors ${focus} ${
      selected ? 'border-brand bg-brand-soft ring-2 ring-brand' : duplicate ? 'border-brand bg-surface' : 'border-line bg-ground hover:bg-raised'
    }`}
  >
    <Avatar name={entry.name} avatarUrl={entry.avatarUrl} size={28} />
    <span className="min-w-0 flex-1 truncate font-semibold text-ink">{entry.name}</span>
    {duplicate && <AlertTriangle className="h-4 w-4 shrink-0 text-brand-hover" aria-hidden="true" />}
    <span className="shrink-0 text-xs tabular-nums text-muted" aria-hidden="true">#{entry.seedRank}</span>
  </button>
)

interface EmptySeatProps {
  label: string
  /** The selected player's name: tapping moves them here. Null: tapping opens the picker. */
  movingName: string | null
  draggable: boolean
  onTap: () => void
  onDrop: (draggedId: string) => void
}

/** An empty seat, flagged so it stands out on a court that should have four. */
export const EmptySeat: React.FC<EmptySeatProps> = ({ label, movingName, draggable, onTap, onDrop }) => (
  <button
    type="button"
    onClick={onTap}
    aria-label={movingName ? `${label}: move ${movingName} here` : `${label}: choose a player`}
    {...dropTarget(onDrop, draggable)}
    className={`flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-2 text-sm font-semibold transition-colors ${focus} ${
      movingName ? 'border-brand bg-brand-soft text-ink' : 'border-brand/60 text-brand-hover hover:bg-brand-soft'
    }`}
  >
    <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
    {movingName ? 'Move here' : 'Empty seat'}
  </button>
)
