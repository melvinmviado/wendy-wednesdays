import React, { useMemo, useState } from 'react'
import { AlertTriangle, Eye, EyeOff, History, Loader2, RefreshCw } from 'lucide-react'
import type { BoardData } from '@/lib/courtBoard'
import type { BoardIssues } from '@/utils/courtBoardModel'
import { ModalShell, modalBtnDanger, modalBtnQuiet } from '../admin/ModalShell'

interface BoardHeaderProps {
  board: BoardData
  issues: BoardIssues
  publishing: boolean
  regenerating: boolean
  onPublish: (publish: boolean) => void
  onRegenerate: () => Promise<void>
  onActivity: () => void
}

const quiet =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover'
const strong =
  'inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-ink hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink'

export const StateBadge: React.FC<{ state: BoardData['state'] }> = ({ state }) =>
  state === 'published' ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-ok/50 px-2.5 py-1 text-xs font-bold text-ok">
      <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Published
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-brand bg-brand-soft px-2.5 py-1 text-xs font-bold text-ink">
      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> Draft - not visible to players
    </span>
  )

/** Status badge, the board's actions, and its warnings. */
export const BoardHeader: React.FC<BoardHeaderProps> = ({ board, issues, publishing, regenerating, onPublish, onRegenerate, onActivity }) => {
  const [confirming, setConfirming] = useState(false)
  const blocked = issues.duplicates.length > 0
  const published = board.state === 'published'
  // Checked against the board as it is now, so a fix made here clears its line at once.
  const { leftList, notSeated } = useMemo(() => {
    const onBoard = new Set(board.entries.map((e) => e.id))
    const changes = board.rsvpChanges ?? []
    return {
      leftList: changes.filter((c) => c.kind === 'not_confirmed' && c.id && onBoard.has(c.id)).map((c) => c.name),
      notSeated: changes.filter((c) => c.kind === 'not_on_board' && !(c.id && onBoard.has(c.id))).map((c) => c.name),
    }
  }, [board.entries, board.rsvpChanges])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <StateBadge state={board.state} />
          {board.manuallyEdited && <span className="text-xs text-ink-soft">Edited by hand</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onActivity} className={quiet}>
            <History className="h-4 w-4" aria-hidden="true" /> Activity
          </button>
          <button type="button" onClick={() => setConfirming(true)} disabled={regenerating} className={quiet}>
            <RefreshCw className={`h-4 w-4 ${regenerating ? 'motion-safe:animate-spin' : ''}`} aria-hidden="true" />
            {regenerating ? 'Regenerating…' : 'Regenerate'}
          </button>
          <button
            type="button"
            onClick={() => onPublish(!published)}
            disabled={publishing || (!published && blocked)}
            className={published ? quiet : strong}
          >
            {publishing ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : published ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            {published ? 'Unpublish' : 'Publish'}
          </button>
        </div>
      </div>

      {(blocked || issues.shortCourts.length > 0) && (
        <div role={blocked ? 'alert' : 'status'} className="flex items-start gap-3 rounded-xl border border-brand bg-brand-soft p-3 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-hover" aria-hidden="true" />
          <ul className="flex flex-col gap-1">
            {issues.duplicates.map((p) => (
              <li key={p.id} className="font-semibold">{p.name} is on the board twice. Publishing is blocked until they are in one place.</li>
            ))}
            {issues.shortCourts.map((c) => (
              <li key={c.number}>Court {c.number} has {c.count} {c.count === 1 ? 'player' : 'players'}, not 4.</li>
            ))}
          </ul>
        </div>
      )}

      {(leftList.length > 0 || notSeated.length > 0) && (
        <section aria-labelledby="rsvp-changes-heading" className="flex items-start gap-3 rounded-xl border border-brand bg-brand-soft p-3 text-sm text-ink">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-brand-hover" aria-hidden="true" />
          <div className="flex flex-col gap-1">
            <h2 id="rsvp-changes-heading" className="font-semibold">The RSVP list changed after this board was made</h2>
            {leftList.length > 0 && <p>No longer confirmed, still on the board: {leftList.join(', ')}.</p>}
            {notSeated.length > 0 && <p>Confirmed, not on the board: {notSeated.join(', ')}.</p>}
            <p className="text-ink-soft">Fix it by hand (remove, or fill a seat), or Regenerate. Guests join the roster when you regenerate.</p>
          </div>
        </section>
      )}

      {confirming && (
        <ModalShell title="Regenerate the board?" onClose={() => setConfirming(false)}>
          <div className="mt-3 flex flex-col gap-2 text-sm text-ink-soft">
            <p>This builds a new board from the current RSVP list and season ranks, replacing this one.</p>
            <p className={board.manuallyEdited ? 'font-semibold text-ink' : ''}>
              {board.manuallyEdited ? 'Your manual edits will be lost.' : 'Any manual edits are lost.'}
            </p>
            {published && !board.autoPublish && (
              <p className="font-semibold text-ink">The new board starts as a draft, so players stop seeing courts until you publish it again.</p>
            )}
          </div>
          <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setConfirming(false)} className={modalBtnQuiet}>Keep this board</button>
            <button type="button" onClick={() => { setConfirming(false); void onRegenerate() }} className={modalBtnDanger}>Regenerate</button>
          </div>
        </ModalShell>
      )}
    </div>
  )
}
