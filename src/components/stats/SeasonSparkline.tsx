import React, { useMemo, useState } from 'react'
import { CHART, buildSparkline } from '../../utils/sparkline'

interface SeasonSparklineProps {
  points: (number | null)[] // weeks 1-8, null = did not attend
}

// Inline SVG sparkline. Missed weeks are a gap with a hollow marker, never a drop to zero.
export const SeasonSparkline: React.FC<SeasonSparklineProps> = ({ points }) => {
  const spark = useMemo(() => buildSparkline(points), [points])
  const [active, setActive] = useState<number | null>(null)

  if (spark.bestIndex === null) {
    return <p className="rounded-xl border border-line bg-raised py-8 text-center text-sm text-muted">No weeks played yet</p>
  }

  const { width, height, padX } = CHART
  const best = spark.points[spark.bestIndex]
  // Show the active point's value on hover/tap/focus; the best week's value is always shown
  const labelled = new Set([spark.bestIndex, ...(active === null ? [] : [active])])
  const summary = `Points by week. Best week was week ${best.week} with ${best.value} points.`

  return (
    <div className="rounded-xl border border-line bg-raised p-2 sm:p-3">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" onClick={() => setActive(null)} aria-label={summary} className="block h-auto w-full select-none">
        <line x1={padX} x2={width - padX} y1={spark.baselineY} y2={spark.baselineY} className="stroke-line" strokeWidth={1} />

        {spark.segments.map((d) => (
          <path key={d} d={d} fill="none" className="stroke-brand-hover" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {spark.points.map((p, i) => {
          const attended = p.value !== null
          const isBest = i === spark.bestIndex
          const text = attended ? `${p.value}` : 'Did not attend'
          // Keep labels inside the viewBox at both ends
          const anchor = p.x < 50 ? 'start' : p.x > width - 50 ? 'end' : 'middle'
          return (
            <g key={p.week}>
              {attended ? (
                <circle cx={p.x} cy={p.y} r={isBest ? 6 : 4} className={isBest ? 'fill-gold stroke-gold' : 'fill-brand-hover stroke-brand-hover'} strokeWidth={1} />
              ) : (
                <circle cx={p.x} cy={p.y} r={4} className="fill-surface stroke-muted" strokeWidth={1.5} />
              )}
              {labelled.has(i) && (
                <text
                  x={p.x}
                  y={attended ? p.y - 12 : p.y - 10}
                  textAnchor={anchor}
                  className={`text-[11px] font-bold tabular-nums ${isBest && attended ? 'fill-gold' : attended ? 'fill-ink' : 'fill-muted'}`}
                >
                  {text}
                </text>
              )}
              <text
                x={p.x}
                y={height - 10}
                textAnchor="middle"
                className={`text-[10px] font-semibold ${active === i ? 'fill-ink' : 'fill-muted'}`}
              >
                W{p.week}
              </text>
              {/* 44px touch target; focusable so keyboard users can reach each value */}
              <circle
                cx={p.x}
                cy={attended ? p.y : spark.baselineY}
                r={22}
                fill="transparent"
                tabIndex={0}
                aria-label={`Week ${p.week}: ${attended ? `${p.value} points` : 'did not attend'}`}
                className="cursor-pointer outline-none focus-visible:stroke-brand-hover"
                strokeWidth={1.5}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={(e) => {
                  e.stopPropagation() // tapping a point selects it; tapping anywhere else clears
                  setActive(i)
                }}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
