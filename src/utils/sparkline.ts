export const CHART = { width: 320, height: 150, padX: 20, top: 30, bottom: 32 }

export interface SparkPoint {
  week: number // 1-based
  x: number
  y: number // for missed weeks: the baseline (never plotted as a value)
  value: number | null
}

export interface Sparkline {
  points: SparkPoint[]
  segments: string[] // SVG path data, one per run of consecutive attended weeks (2+ points)
  bestIndex: number | null // index of the highest-scoring week, first on ties
  baselineY: number
}

/** Pure geometry for the season sparkline. A null (missed week) breaks the line rather than dropping to 0. */
export function buildSparkline(values: (number | null)[]): Sparkline {
  const { width, height, padX, top, bottom } = CHART
  const baselineY = height - bottom
  const plotH = baselineY - top
  const step = values.length > 1 ? (width - padX * 2) / (values.length - 1) : 0
  const max = Math.max(0, ...values.filter((v): v is number => v !== null))

  const points: SparkPoint[] = values.map((value, i) => ({
    week: i + 1,
    x: padX + step * i,
    y: value === null || max === 0 ? baselineY : baselineY - (value / max) * plotH,
    value,
  }))

  const segments: string[] = []
  let run: SparkPoint[] = []
  const flush = () => {
    if (run.length >= 2) segments.push(run.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' '))
    run = []
  }
  for (const p of points) {
    if (p.value === null) flush()
    else run.push(p)
  }
  flush()

  let bestIndex: number | null = null
  points.forEach((p, i) => {
    if (p.value !== null && (bestIndex === null || p.value > (points[bestIndex].value as number))) bestIndex = i
  })

  return { points, segments, bestIndex, baselineY }
}
