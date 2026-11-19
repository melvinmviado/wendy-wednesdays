import React, { useId, useState } from 'react'
import { BadgeCheck, Clock, Loader2, UserCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { claimErrorMessage, MAX_CLAIM_MESSAGE, submitClaim } from '../../data/claims'
import { useClaimStatus } from '../../hooks/useClaimStatus'
import { authBtnBrand, authBtnQuiet, authField } from '../auth/authStyles'

interface ClaimSectionProps {
  playerId: string
  playerName: string
}

const Box: React.FC<{ children: React.ReactNode; role?: string }> = ({ children, role }) => (
  <div role={role} className="mt-5 rounded-xl border border-line bg-raised p-3 text-sm text-ink-soft">
    {children}
  </div>
)

/** "Is this you?" box at the bottom of a player's stats dialog. Renders nothing when there is nothing to offer. */
export const ClaimSection: React.FC<ClaimSectionProps> = ({ playerId, playerName }) => {
  const { user, isSignedIn, isConfigured } = useAuth()
  const eligible = isConfigured && isSignedIn && !!user && !user.is_anonymous
  const { state, reload } = useClaimStatus(playerId, eligible && user ? user.id : null)
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const fieldId = useId()

  if (!eligible) return null
  if (state.phase === 'loading') {
    return (
      <Box>
        <span role="status" className="flex items-center gap-2 text-muted">
          <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> Checking your claim status...
        </span>
      </Box>
    )
  }
  if (state.phase === 'error') {
    return (
      <Box role="alert">
        <p className="[overflow-wrap:anywhere]">{state.message}</p>
        <button type="button" onClick={reload} className="mt-2 text-sm font-semibold text-brand-hover underline underline-offset-2 cursor-pointer">
          Try again
        </button>
      </Box>
    )
  }

  const { view } = state
  if (view.kind === 'hidden') return null
  if (view.kind === 'mine') {
    return (
      <Box>
        <p className="flex items-center gap-2 font-semibold text-ink">
          <BadgeCheck className="w-4 h-4 text-ok" aria-hidden="true" /> This is you
        </p>
      </Box>
    )
  }
  if (view.kind === 'pending-here' || view.kind === 'pending-elsewhere') {
    return (
      <Box>
        <p className="flex items-start gap-2">
          <Clock className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          {view.kind === 'pending-here'
            ? 'Your request to claim this player is waiting for an admin.'
            : `You already have a request waiting for ${view.playerName}. An admin needs to review it first.`}
        </p>
      </Box>
    )
  }

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return
    setBusy(true)
    setFormError(null)
    try {
      await submitClaim(playerId, user.id, message)
      setOpen(false)
      setMessage('')
      reload()
    } catch (err) {
      setFormError(claimErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Box>
      {view.kind === 'declined-here' && <p className="mb-2">An admin declined your last request for this player.</p>}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={authBtnQuiet}>
          <UserCheck className="w-4 h-4" aria-hidden="true" />
          {view.kind === 'declined-here' ? 'Request again' : 'This is me'}
        </button>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-2" noValidate>
          <p className="font-semibold text-ink">Claim {playerName}</p>
          <p>An admin will check this and link {playerName} to your account.</p>
          <label htmlFor={fieldId} className="font-medium text-ink">
            Message for the admin <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id={fieldId}
            value={message}
            maxLength={MAX_CLAIM_MESSAGE}
            rows={3}
            disabled={busy}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. I play on Wednesdays, court 2"
            className={`${authField} p-3 border-line`}
          />
          {formError && (
            <p role="alert" className="text-brand-hover [overflow-wrap:anywhere]">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className={authBtnBrand}>
              {busy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />}
              Send request
            </button>
            <button type="button" disabled={busy} onClick={() => setOpen(false)} className={authBtnQuiet}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Box>
  )
}
