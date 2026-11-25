import React from 'react'
import { formatEventDateTime } from '@/lib/datetime'
import { SESSION_TIME_ZONE } from '@/utils/rsvpSchedule'

const clock = (d: Date) => formatEventDateTime(d.toISOString(), SESSION_TIME_ZONE).split(', ').slice(-1)[0]

/** "Updated 7:42 PM EST · Live": when the page last confirmed it matches the server. */
export const UpdatedLine: React.FC<{ updatedAt: Date | null; live: boolean; stale: boolean; className?: string }> = ({ updatedAt, live, stale, className = '' }) => {
  if (!updatedAt) return null
  return (
    <footer className={`flex flex-wrap items-center gap-2 text-sm text-muted ${className}`}>
      <span>Updated {clock(updatedAt)}</span>
      {stale ? (
        <span className="font-semibold text-brand-hover">· Can't reach the server; retrying</span>
      ) : live ? (
        <span className="inline-flex items-center gap-1.5 print:hidden">
          <span aria-hidden="true">·</span>
          <span className="h-2 w-2 rounded-full bg-ok motion-safe:animate-pulse" aria-hidden="true" />
          <span>Live</span>
        </span>
      ) : null}
    </footer>
  )
}
