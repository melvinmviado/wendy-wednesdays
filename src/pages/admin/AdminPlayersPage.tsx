import { AddPlayerForm } from '../../components/admin/AddPlayerForm'
import { PlayerAdminDialogs } from '../../components/admin/PlayerAdminDialogs'
import { PlayerList } from '../../components/admin/PlayerList'
import { ClaimRequestsPanel } from '../../components/claims/ClaimRequestsPanel'
import { usePlayersAdmin } from '../../hooks/usePlayersAdmin'
import { useAdminContext } from './adminContext'

const heading = 'text-lg font-bold text-ink'

/** Players: add, search / rename / archive / restore / delete, and claim review. */
export function AdminPlayersPage() {
  const { toasts, claimQueue } = useAdminContext()
  const p = usePlayersAdmin(toasts)
  const pending = claimQueue.unavailable ? 0 : claimQueue.requests.length

  return (
    <>
      <section aria-labelledby="add-heading" className="flex flex-col gap-3">
        <h2 id="add-heading" className={heading}>Add player</h2>
        <AddPlayerForm onAdd={p.add} />
      </section>

      <section aria-labelledby="players-heading" className="flex flex-col gap-3">
        <h2 id="players-heading" className={heading}>Players ({p.activeCount})</h2>
        <PlayerList rows={p.rows} admin={p.admin} query={p.query} onQuery={p.setQuery} loading={p.loading} error={p.error} onRetry={p.retry} />
      </section>

      <section aria-labelledby="claims-heading" className="flex flex-col gap-3">
        <h2 id="claims-heading" className={`${heading} flex items-center gap-2`}>
          Claims
          {pending > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-ink" aria-label={`${pending} pending`}>
              {pending}
            </span>
          )}
        </h2>
        <ClaimRequestsPanel queue={claimQueue} />
      </section>

      <PlayerAdminDialogs admin={p.admin} roles={p.roles} />
    </>
  )
}
