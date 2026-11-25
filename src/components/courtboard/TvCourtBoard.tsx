import React, { useMemo, useRef } from 'react'
import { publicBoardApi, type PublicBoardApi } from '@/lib/publicCourtBoard'
import { useAutoScroll, usePublicCourtBoard } from '@/hooks/usePublicCourtBoard'
import { groupBoard } from '@/utils/publicCourtView'
import { formatSessionDate } from '@/utils/rsvpSchedule'
import { UpdatedLine } from './UpdatedLine'

/**
 * TV mode (?tv=1) for a screen at the facility: white on black, huge type, courts in a grid in
 * physical order (top court first), no navigation, and a slow scroll when it does not all fit.
 */
export const TvCourtBoard: React.FC<{ sessionDate: string; api?: PublicBoardApi }> = ({ sessionDate, api = publicBoardApi }) => {
  const { board, loading, error, updatedAt, live } = usePublicCourtBoard(sessionDate, api)
  const view = useMemo(() => groupBoard(board?.seats ?? []), [board])
  const scroller = useRef<HTMLDivElement>(null)
  useAutoScroll(scroller, !!board)
  const last = view.courts.length - 1

  return (
    <div ref={scroller} className="h-dvh overflow-y-auto bg-black p-6 text-white [scrollbar-width:none] sm:p-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-5xl font-black tracking-tight sm:text-6xl">Courts · {formatSessionDate(sessionDate)}</h1>
        <UpdatedLine updatedAt={updatedAt} live={live} stale={!!error && !!board} className="text-2xl text-white/80!" />
      </header>

      {loading ? (
        <p role="status" className="mt-16 text-4xl">Loading the courts…</p>
      ) : !board ? (
        <p className="mt-16 max-w-4xl text-5xl font-bold leading-tight">
          {error ? "Can't load the courts right now. Retrying…" : 'Courts are posted once RSVP closes and the organizer publishes.'}
        </p>
      ) : (
        <>
          {view.courts.length === 0 && (
            <p className="mt-16 text-5xl font-bold">{view.alternates.length ? 'Not enough players for a full court of four.' : 'Nobody is on the courts for this run.'}</p>
          )}
          <ol aria-label="Courts, top to bottom" className="mt-8 grid grid-cols-[repeat(auto-fill,minmax(min(26rem,100%),1fr))] gap-6">
            {view.courts.map((court, i) => (
              <li key={court.position} aria-label={`Court ${court.number}`} className="rounded-3xl border-4 border-white p-6">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-[7rem] font-black leading-none tabular-nums">{court.number}</h2>
                  {(i === 0 || i === last) && view.courts.length > 1 && (
                    <span className="rounded-full bg-white px-4 py-1 text-2xl font-black text-black">{i === 0 ? 'TOP' : 'BOTTOM'}</span>
                  )}
                </div>
                <ul className="mt-4 flex flex-col gap-2">
                  {court.seats.map((s, slot) => (
                    <li key={slot} className="flex items-baseline justify-between gap-4 text-4xl font-bold">
                      <span className="truncate">{s ? s.name : <span className="font-normal italic text-white/60">Open seat</span>}</span>
                      {s && <span className="shrink-0 text-2xl font-normal tabular-nums text-white/60"><span className="sr-only">seed </span>#{s.seedRank}</span>}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {view.alternates.length > 0 && (
            <section className="mt-8 rounded-3xl border-4 border-dashed border-white/70 p-6">
              <h2 className="text-4xl font-black">Sitting out / alternates</h2>
              <p className="mt-3 text-4xl font-bold leading-snug">{view.alternates.map((s) => s.name).join(' · ')}</p>
            </section>
          )}
        </>
      )}
    </div>
  )
}
