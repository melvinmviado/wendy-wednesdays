import React, { useEffect, useId, useRef, useState } from 'react'
import { History, Loader2, X } from 'lucide-react'
import { formatEventDateTime } from '@/lib/datetime'
import type { ActivityEntry } from '@/lib/courtBoard'
import type { CourtResult } from '@/lib/courtSettings'
import { useDialogBehavior } from '@/hooks/useDialogBehavior'
import { describeActivity } from '@/utils/courtActivity'

interface ActivityDrawerProps {
  load: () => Promise<CourtResult<ActivityEntry[]>>
  /** Changes whenever the board does, so the list follows edits made while it is open. */
  refreshKey: unknown
  timeZone: string
  onClose: () => void
}

/** The run's assignment_audit_log, newest first: who generated, moved, published. */
export const ActivityDrawer: React.FC<ActivityDrawerProps> = ({ load, refreshKey, timeZone, onClose }) => {
  const panelRef = useRef<HTMLElement>(null)
  const titleId = useId()
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useDialogBehavior(true, panelRef, onClose)

  useEffect(() => {
    let live = true
    void load().then((r) => {
      if (!live) return
      if (r.ok) {
        setEntries(r.data)
        setError(null)
      } else {
        setError(r.error.message)
      }
    })
    return () => {
      live = false
    }
  }, [load, refreshKey])

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ground/80" onClick={onClose}>
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-sm flex-col border-l border-line bg-surface outline-none"
      >
        <div className="flex items-center gap-2 border-b border-line p-4">
          <History className="h-5 w-5 text-muted" aria-hidden="true" />
          <h2 id={titleId} className="flex-1 text-lg font-bold text-ink">Activity</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-lg text-ink-soft hover:bg-raised hover:text-ink">
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {error && !entries ? (
            <p role="alert" className="text-sm text-brand-hover">{error}</p>
          ) : !entries ? (
            <p role="status" className="flex items-center gap-2 text-sm text-ink-soft">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Loading the activity…
            </p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-ink-soft">Nothing yet.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {entries.map((e) => (
                <li key={e.id} className="border-l-2 border-line pl-3">
                  <p className="text-sm text-ink">{describeActivity(e.action, e.before, e.after)}</p>
                  <p className="text-xs text-muted">
                    {e.actorName ?? 'Automatic'} · {formatEventDateTime(e.createdAt, timeZone)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </aside>
    </div>
  )
}
