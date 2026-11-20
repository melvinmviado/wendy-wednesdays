/**
 * "2d 3h", "3h 15m", "42 min": the time left until `ms` runs out, rounded UP to the minute so it
 * never reads 0 before the moment arrives. Empty once the time is up.
 */
export function formatCountdown(ms: number): string {
  if (!(ms > 0)) return ''
  const total = Math.ceil(ms / 60_000)
  const days = Math.floor(total / 1440)
  const hours = Math.floor((total % 1440) / 60)
  const minutes = total % 60
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes} min`
}
