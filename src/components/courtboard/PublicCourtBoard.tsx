import React, { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { AlertTriangle, ArrowLeft, Armchair, CalendarClock, Loader2, Search } from 'lucide-react'
import { courtBoardPath, publicBoardApi, type PublicBoardApi } from '@/lib/publicCourtBoard'
import { usePublicCourtBoard } from '@/hooks/usePublicCourtBoard'
import { boardAsText, filterView, findMine, groupBoard } from '@/utils/publicCourtView'
import { formatSessionDate } from '@/utils/rsvpSchedule'
import { WebsiteLogo } from '../WebsiteLogo'
import { PublicCourtCard, SeatName } from './PublicCourtCard'
import { ShareTools } from './ShareTools'
import { UpdatedLine } from './UpdatedLine'
import { YourCourtBanner } from './YourCourtBanner'

interface PublicCourtBoardProps {
  sessionDate: string
  myPlayerId: string | null
  api?: PublicBoardApi
}

/** The public Court Board (mobile first): your court, the courts top to bottom, alternates, sharing. */
export const PublicCourtBoard: React.FC<PublicCourtBoardProps> = ({ sessionDate, myPlayerId, api = publicBoardApi }) => {
  const { board, loading, error, updatedAt, live, refetch } = usePublicCourtBoard(sessionDate, api)
  const [query, setQuery] = useState('')
  const view = useMemo(() => groupBoard(board?.seats ?? []), [board])
  const mine = findMine(view, myPlayerId)
  const filtered = useMemo(() => filterView(view, query), [view, query])
  const url = `${window.location.origin}${courtBoardPath(sessionDate)}`
  const day = formatSessionDate(sessionDate)
  const courts = filtered.view.courts
  const total = view.courts.length

  return (
    <div className="min-h-screen bg-ground text-ink">
      <nav aria-label="Main" className="sticky top-0 z-30 w-full border-b border-line bg-ground print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 text-sm sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <WebsiteLogo size="sm" />
            <span className="hidden font-bold text-ink sm:inline">Wendy Wednesdays</span>
          </div>
          <Link to="/" className="inline-flex min-h-10 items-center gap-1.5 text-ink-soft transition-colors hover:text-ink">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Leaderboard
          </Link>
        </div>
      </nav>
      {board && mine && <YourCourtBanner mine={mine} />}

      <main className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6 sm:px-6 print:max-w-none print:gap-2 print:p-0">
        <header>
          <h1 className="text-4xl font-black tracking-tight text-ink print:text-2xl">Courts</h1>
          <p className="text-ink-soft">{day}</p>
        </header>

        {loading ? (
          <p role="status" className="flex items-center gap-2 text-ink-soft">
            <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Loading the courts…
          </p>
        ) : error && !board ? (
          <div role="alert" className="flex items-start gap-3 rounded-xl border border-brand bg-brand-soft p-4 text-sm">
            <AlertTriangle className="h-5 w-5 shrink-0 text-brand-hover" aria-hidden="true" />
            <p className="flex-1">Couldn't load the courts. {error.message}</p>
            <button type="button" onClick={() => void refetch()} className="min-h-11 cursor-pointer rounded-lg border border-line px-3 font-semibold hover:bg-raised">Try again</button>
          </div>
        ) : !board ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-line bg-surface p-8 text-center">
            <CalendarClock className="h-8 w-8 text-muted" aria-hidden="true" />
            <p className="text-lg font-bold text-ink">Courts are posted once RSVP closes and the organizer publishes.</p>
            <p className="text-sm text-ink-soft">This page updates by itself: keep it open.</p>
          </div>
        ) : (
          <>
            <div className="relative print:hidden">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a player"
                aria-label="Find a player by name"
                className="min-h-11 w-full rounded-lg border border-line bg-surface px-3 pl-9 text-base text-ink placeholder:text-muted"
              />
              <p role="status" aria-live="polite" className="sr-only">
                {query.trim() ? `${filtered.matches.size} ${filtered.matches.size === 1 ? 'player' : 'players'} found` : ''}
              </p>
            </div>

            <section aria-labelledby="courts-heading">
              <h2 id="courts-heading" className="sr-only">Courts, top to bottom</h2>
              {courts.length === 0 && query.trim() ? (
                <p className="text-sm text-ink-soft">{filtered.view.alternates.length ? 'No court has a player by that name.' : 'No player matches that name.'}</p>
              ) : total === 0 ? (
                <p className="rounded-2xl border border-line bg-surface p-4 text-ink-soft">
                  {view.alternates.length ? 'Not enough players for a full court of four.' : 'Nobody is on the courts for this run.'}
                </p>
              ) : (
                <ol className="flex flex-col gap-3 print:grid print:grid-cols-3 print:gap-2">
                  {courts.map((court) => (
                    <PublicCourtCard
                      key={court.position}
                      court={court}
                      edge={total > 1 && court.position === view.courts[0].position ? 'TOP' : total > 1 && court.position === view.courts[total - 1].position ? 'BOTTOM' : null}
                      mine={mine?.kind === 'court' && mine.court.position === court.position}
                      myPlayerId={myPlayerId}
                      matches={filtered.matches}
                    />
                  ))}
                </ol>
              )}
            </section>

            {filtered.view.alternates.length > 0 && (
              <section aria-labelledby="alternates-heading" className="rounded-2xl border border-dashed border-line bg-surface p-4 print:break-inside-avoid print:p-2">
                <h2 id="alternates-heading" className="mb-2 flex items-center gap-2 text-lg font-bold text-ink">
                  <Armchair className="h-5 w-5 text-muted" aria-hidden="true" /> Sitting out / alternates
                </h2>
                <ul className="grid gap-2 min-[420px]:grid-cols-2 print:grid-cols-4 print:gap-0.5">
                  {filtered.view.alternates.map((s) => (
                    <li key={s.playerId} className="flex min-h-11 items-center gap-2 text-ink print:min-h-0 print:text-sm">
                      <SeatName seat={s} me={s.playerId === myPlayerId} match={filtered.matches.has(s.playerId)} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <ShareTools url={url} text={boardAsText(view, `Courts, ${day}`, url)} tvHref={`${courtBoardPath(sessionDate)}?tv=1`} />
          </>
        )}
        <UpdatedLine updatedAt={updatedAt} live={live} stale={!!error && !!board} />
      </main>
    </div>
  )
}
