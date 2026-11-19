import React from 'react'
import type { RankMovement as Movement } from '../utils/ranking'

interface RankMovementProps {
  movement?: Movement
}

const places = (n: number) => `${n} ${n === 1 ? 'place' : 'places'}`

// Rank change since the previous week. Arrow + number carry the meaning, colour only reinforces it.
export const RankMovement: React.FC<RankMovementProps> = ({ movement }) => {
  if (!movement) return null

  if (movement.status === 'new') {
    return (
      <span
        role="img"
        aria-label="New this week"
        className="shrink-0 whitespace-nowrap rounded-full bg-raised px-1.5 py-0.5 text-[10px] font-bold leading-none text-ink-soft"
      >
        <span aria-hidden="true">NEW</span>
      </span>
    )
  }

  const delta = movement.delta ?? 0
  if (movement.status === 'same' || delta === 0) return null

  const up = delta > 0
  const n = Math.abs(delta)
  return (
    <span
      role="img"
      aria-label={`${up ? 'Up' : 'Down'} ${places(n)} since last week`}
      className={`shrink-0 whitespace-nowrap text-xs tabular-nums ${up ? 'font-bold text-ok' : 'font-medium text-muted'}`}
    >
      <span aria-hidden="true">
        {up ? '▲' : '▼'} {n}
      </span>
    </span>
  )
}
