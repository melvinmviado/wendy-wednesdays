import React from 'react'
import { Armchair, MapPin } from 'lucide-react'
import type { MyPlace } from '@/utils/publicCourtView'

const names = (list: string[]) =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`

/** Pinned under the nav: where the signed-in player starts tonight. */
export const YourCourtBanner: React.FC<{ mine: NonNullable<MyPlace> }> = ({ mine }) => (
  <section aria-labelledby="your-court-heading" className="sticky top-14 z-20 border-b-2 border-brand bg-surface print:hidden">
    <div className="mx-auto flex max-w-3xl items-center gap-4 px-4 py-3 sm:px-6">
      {mine.kind === 'court' ? (
        <>
          <MapPin className="h-6 w-6 shrink-0 text-brand-hover" aria-hidden="true" />
          <div className="flex flex-col">
            <h2 id="your-court-heading" className="text-xs font-bold uppercase tracking-wide text-ink-soft">Your court</h2>
            <p className="text-5xl font-black leading-none tabular-nums text-ink">
              <span className="sr-only">Court </span>
              {mine.court.number}
            </p>
          </div>
          <p className="min-w-0 flex-1 text-sm text-ink-soft">
            {mine.partners.length > 0 ? (
              <>With <span className="font-semibold text-ink">{names(mine.partners.map((s) => s.name))}</span></>
            ) : (
              'Nobody else is on your court yet.'
            )}
            {mine.partners.length > 0 && mine.partners.length < 3 && ' (and an open seat)'}
          </p>
        </>
      ) : (
        <>
          <Armchair className="h-6 w-6 shrink-0 text-brand-hover" aria-hidden="true" />
          <div className="flex flex-col">
            <h2 id="your-court-heading" className="text-lg font-black text-ink">You're an alternate</h2>
            <p className="text-sm text-ink-soft">You're sitting out at the start. You're listed under Sitting out / alternates below.</p>
          </div>
        </>
      )}
    </div>
  </section>
)
