import React, { useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import type { ClaimQueue } from '../../hooks/useClaimQueue'
import { ModalShell, modalBtn, modalBtnDanger, modalBtnQuiet } from '../admin/ModalShell'

interface ClaimRequestsDialogProps {
  queue: ClaimQueue
  onClose: () => void
}

const who = (name: string | null) => name || 'Unnamed account'
const heading = 'text-sm font-semibold text-ink-soft'

/** Admin-only: approve or reject pending claims, and unlink players that already have an account. */
export const ClaimRequestsDialog: React.FC<ClaimRequestsDialogProps> = ({ queue, onClose }) => {
  const { requests, linked, loading, error, actionError, busyId, approve, reject, unlink, reload } = queue
  const [confirmUnlink, setConfirmUnlink] = useState<string | null>(null)
  const empty = !loading && !error && requests.length === 0

  return (
    <ModalShell title="Player claims" onClose={onClose}>
      <div className="mt-4 flex max-h-[65dvh] flex-col gap-5 overflow-y-auto pr-1" aria-live="polite">
        {actionError && (
          <p role="alert" className="text-sm text-brand-hover [overflow-wrap:anywhere]">
            {actionError}
          </p>
        )}
        {loading && requests.length === 0 && linked.length === 0 ? (
          <p role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-muted">
            <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> Loading claims...
          </p>
        ) : error ? (
          <div role="alert" className="flex flex-col items-start gap-2 text-sm">
            <p className="text-brand-hover [overflow-wrap:anywhere]">{error}</p>
            <button type="button" onClick={() => void reload()} className={modalBtnQuiet}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <section aria-label="Pending requests" className="flex flex-col gap-2">
              <h3 className={heading}>Pending requests ({requests.length})</h3>
              {empty && <p className="text-sm text-muted">No requests waiting.</p>}
              {requests.map((r) => (
                <div key={r.id} className="rounded-xl border border-line bg-raised p-3">
                  <p className="text-sm text-ink [overflow-wrap:anywhere]">
                    <strong>{who(r.requesterName)}</strong> wants to claim <strong>{r.playerName}</strong>
                  </p>
                  {r.requesterEmail ? (
                    <p className="mt-1 text-sm text-ink-soft [overflow-wrap:anywhere]">
                      Email: <a href={`mailto:${r.requesterEmail}`} className="underline underline-offset-2 hover:text-ink">{r.requesterEmail}</a>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-muted">Email unavailable (apply the claim emails migration).</p>
                  )}
                  {r.message && <p className="mt-1 text-sm text-ink-soft [overflow-wrap:anywhere]">"{r.message}"</p>}
                  <p className="mt-1 text-xs text-muted">{new Date(r.createdAt).toLocaleDateString()}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={busyId !== null} onClick={() => void approve(r.id)} className={`${modalBtn} bg-brand text-brand-ink hover:bg-brand-hover`}>
                      {busyId === r.id ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <Check className="w-4 h-4" aria-hidden="true" />}
                      Approve{" "}<span className="sr-only">{who(r.requesterName)} for {r.playerName}</span>
                    </button>
                    <button type="button" disabled={busyId !== null} onClick={() => void reject(r.id)} className={modalBtnQuiet}>
                      <X className="w-4 h-4" aria-hidden="true" />
                      Reject{" "}<span className="sr-only">{who(r.requesterName)} for {r.playerName}</span>
                    </button>
                  </div>
                </div>
              ))}
            </section>

            <section aria-label="Linked players" className="flex flex-col gap-2">
              <h3 className={heading}>Linked players ({linked.length})</h3>
              {linked.length === 0 && <p className="text-sm text-muted">No players are linked to an account yet.</p>}
              {linked.map((p) => (
                <div key={p.playerId} className="flex items-center justify-between gap-2 rounded-xl border border-line p-3">
                  <p className="min-w-0 text-sm text-ink [overflow-wrap:anywhere]">
                    <strong>{p.playerName}</strong> <span className="text-muted">is {who(p.userName)}</span>
                  </p>
                  {confirmUnlink === p.playerId ? (
                    <span className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => {
                          setConfirmUnlink(null)
                          void unlink(p.playerId)
                        }}
                        className={modalBtnDanger}
                      >
                        Confirm{" "}<span className="sr-only">unlink {p.playerName}</span>
                      </button>
                      <button type="button" onClick={() => setConfirmUnlink(null)} className={modalBtnQuiet}>
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button type="button" disabled={busyId !== null} onClick={() => setConfirmUnlink(p.playerId)} className={`${modalBtnQuiet} shrink-0`}>
                      Unlink{" "}<span className="sr-only">{p.playerName}</span>
                    </button>
                  )}
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </ModalShell>
  )
}
