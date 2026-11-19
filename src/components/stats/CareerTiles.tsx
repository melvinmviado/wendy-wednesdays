import React from 'react'
import type { PlayerCareer } from '../../utils/playerStats'

interface CareerTilesProps {
  career: PlayerCareer
}

const Tile: React.FC<{ label: string; value: string; small?: boolean; hint?: string }> = ({ label, value, small, hint }) => (
  <div className="min-w-0 rounded-xl border border-line bg-raised p-3">
    <dt className="text-xs font-semibold text-muted">{label}</dt>
    <dd className={`mt-1 font-black tabular-nums text-ink ${small ? 'text-lg leading-tight' : 'text-2xl'}`}>{value}</dd>
    {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
  </div>
)

export const CareerTiles: React.FC<CareerTilesProps> = ({ career }) => {
  const { weeksPlayed, bestCourtFinish, podiumCount, avgPointsPerSession } = career
  return (
    <dl className="grid grid-cols-2 gap-3">
      <Tile label="Weeks played" value={`${weeksPlayed}`} />
      <Tile
        label="Best court finish"
        value={bestCourtFinish ? `Court ${bestCourtFinish.courtNumber} · ${bestCourtFinish.finish}` : '–'}
        small
      />
      <Tile label="Podiums" value={`${podiumCount}`} hint={podiumCount === 0 ? 'None yet' : undefined} />
      <Tile label="Avg points / session" value={avgPointsPerSession === null ? '–' : avgPointsPerSession.toFixed(1)} />
    </dl>
  )
}
