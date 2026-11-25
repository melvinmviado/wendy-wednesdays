import React, { useState } from 'react'
import { Loader2, Shuffle } from 'lucide-react'
import { formatEventDateTime } from '@/lib/datetime'
import type { BoardMeta, CourtResult, GenerateSummary } from '@/lib/courtSettings'
import { describeGenerated } from '@/utils/courtActivity'
import { ModalShell, modalBtnDanger, modalBtnQuiet } from './ModalShell'

interface GenerateBoardSectionProps {
  meta: BoardMeta | null
  /** Court numbers are saved for this run or an earlier one. */
  hasRange: boolean
  autoPublish: boolean
  /** The run's RSVP cutoff: rsvp_cutoff_at in the database, getScheduleTimestamps here. */
  lockAt: Date
  now: Date
  timeZone: string
  /** False in the demo, which has no database to generate in. */
  databaseReady: boolean
  generate: (force: boolean) => Promise<CourtResult<GenerateSummary>>
  toast: (kind: 'success' | 'error', message: string) => void
}

/** Board status for the run, and "Generate now" (with a confirm when a board already exists). */
export const GenerateBoardSection: React.FC<GenerateBoardSectionProps> = (p) => {
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const exists = !!p.meta && p.meta.state !== 'none'
  const when = (iso: string | null) => (iso ? formatEventDateTime(iso, p.timeZone) : '')

  const blocked = !p.databaseReady
    ? 'Generating needs the database. Connect Supabase to try it.'
    : !p.hasRange
      ? 'Save the court numbers first.'
      : p.now < p.lockAt
        ? `RSVPs close ${when(p.lockAt.toISOString())}. The board is generated automatically within a few minutes after that, or you can generate it here then.`
        : null

  const run = async () => {
    setBusy(true)
    // A board changed by hand is only replaced with force; the confirm below already asked.
    const result = await p.generate(!!p.meta?.manuallyEdited)
    setBusy(false)
    setConfirming(false)
    if (result.ok) p.toast('success', describeGenerated(result.data))
    else p.toast('error', result.error.message)
  }

  const status =
    !p.meta || p.meta.state === 'none'
      ? 'No board for this run yet.'
      : p.meta.state === 'draft'
        ? `Draft generated ${when(p.meta.generatedAt)}. Only admins can see it.`
        : `Published ${when(p.meta.publishedAt)}. Players can see it.`

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 sm:p-6">
      <p className="text-sm text-ink">
        {status}
        {p.meta?.manuallyEdited && exists && <span className="text-ink-soft"> Changed by hand since.</span>}
      </p>
      {blocked && <p className="text-sm text-ink-soft">{blocked}</p>}
      <div className="flex justify-end">
        <button
          type="button"
          disabled={!!blocked || busy}
          onClick={() => (exists ? setConfirming(true) : void run())}
          className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-5 text-sm font-bold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : <Shuffle className="h-4 w-4" aria-hidden="true" />}
          {busy ? 'Generating…' : 'Generate now'}
        </button>
      </div>

      {confirming && p.meta && (
        <ModalShell title="Replace the current board?" onClose={() => !busy && setConfirming(false)}>
          <div className="mt-3 flex flex-col gap-2 text-sm text-ink-soft">
            <p>
              This run already has a {p.meta.state} board. Generating again builds a new one from the current RSVP list
              and season ranks.
            </p>
            {p.meta.manuallyEdited && <p className="font-semibold text-ink">It was changed by hand, and those changes will be lost.</p>}
            {p.meta.state === 'published' && !p.autoPublish && (
              <p className="font-semibold text-ink">The new board starts as a draft, so players stop seeing courts until it is published again.</p>
            )}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setConfirming(false)} disabled={busy} className={modalBtnQuiet}>Keep current board</button>
            <button type="button" onClick={() => void run()} disabled={busy} className={modalBtnDanger}>
              {busy && <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />}
              {busy ? 'Generating…' : 'Replace board'}
            </button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
