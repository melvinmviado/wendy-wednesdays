import React from 'react'
import { MapPin } from 'lucide-react'
import type { PublicSeat } from '@/lib/publicCourtBoard'
import type { PublicCourt } from '@/utils/publicCourtView'
import { Avatar } from '../Avatar'

interface PublicCourtCardProps {
  court: PublicCourt
  edge: 'TOP' | 'BOTTOM' | null
  /** The signed-in player is on this court. */
  mine: boolean
  myPlayerId: string | null
  /** Player ids matching the search, shown marked. */
  matches: ReadonlySet<string>
}

export const SeatName: React.FC<{ seat: PublicSeat; me: boolean; match: boolean }> = ({ seat, me, match }) => (
  <>
    <Avatar name={seat.name} avatarUrl={seat.avatarUrl} size={32} />
    <span className={`min-w-0 flex-1 truncate ${me ? 'font-black' : 'font-semibold'}`}>
      {match ? <mark className="rounded bg-gold/30 px-0.5 text-ink">{seat.name}</mark> : seat.name}
      {me && <span className="ml-1 text-xs font-bold uppercase text-ink-soft">(you)</span>}
    </span>
    <span className="shrink-0 text-xs tabular-nums text-muted">
      <span className="sr-only">seed </span>#{seat.seedRank}
    </span>
  </>
)

/** One court: the facility number large, then its four players. "Your court" is said in words, not only color. */
export const PublicCourtCard: React.FC<PublicCourtCardProps> = ({ court, edge, mine, myPlayerId, matches }) => (
  <li
    aria-label={`Court ${court.number}${edge ? `, ${edge.toLowerCase()} court` : ''}${mine ? ', your court' : ''}`}
    className={`rounded-2xl border bg-surface p-4 print:break-inside-avoid print:rounded-lg print:p-2 ${
      mine ? 'border-brand ring-2 ring-brand print:ring-0 print:border-2' : 'border-line'
    }`}
  >
    <div className="flex items-start gap-3">
      <h3 className="flex items-baseline gap-2 text-ink">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted">Court</span>
        <span className="text-6xl font-black leading-none tabular-nums print:text-4xl">{court.number}</span>
      </h3>
      <div className="ml-auto flex flex-col items-end gap-1">
        {edge && <span className="rounded-full border border-line px-2 py-0.5 text-xs font-bold tracking-wide text-ink-soft">{edge}</span>}
        {mine && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-ink print:border print:border-black">
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Your court
          </span>
        )}
      </div>
    </div>
    <ul className="mt-3 grid gap-2 min-[420px]:grid-cols-2 print:mt-1 print:gap-0.5">
      {court.seats.map((seat, slot) => (
        <li key={slot} className="flex min-h-11 items-center gap-2 text-base text-ink print:min-h-0 print:text-sm">
          {seat ? (
            <SeatName seat={seat} me={seat.playerId === myPlayerId} match={matches.has(seat.playerId)} />
          ) : (
            <span className="text-sm italic text-muted">Open seat</span>
          )}
        </li>
      ))}
    </ul>
  </li>
)
