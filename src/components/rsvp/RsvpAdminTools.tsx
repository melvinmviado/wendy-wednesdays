import React, { useEffect, useRef, useState } from 'react'
import { Check, UserPlus } from 'lucide-react'
import type { useAdminRsvpPanel } from '../../hooks/useAdminRsvpPanel'
import type { PlayerScore } from '../../types/leaderboard'
import { AdminAddGuestForm } from './AdminAddGuestForm'
import { AdminAddPlayerPicker } from './AdminAddPlayerPicker'

interface RsvpAdminToolsProps {
  panel: ReturnType<typeof useAdminRsvpPanel>
  candidates: PlayerScore[]
  busy: boolean
}

type Mode = 'player' | 'guest' | null

const openBtn =
  'inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-raised px-4 text-sm font-bold text-ink hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50'

/** Admin-only strip above the list: the Add player / Add guest controls and the outcome of the last change. */
export const RsvpAdminTools: React.FC<RsvpAdminToolsProps> = ({ panel, candidates, busy }) => {
  const [mode, setMode] = useState<Mode>(null)
  const lastMode = useRef<Exclude<Mode, null>>('player')
  const playerRef = useRef<HTMLButtonElement>(null)
  const guestRef = useRef<HTMLButtonElement>(null)
  const restoreFocus = useRef(false)
  const { notice, add, addGuest, clearNotice } = panel

  useEffect(() => {
    if (mode === null && restoreFocus.current) {
      restoreFocus.current = false
      const target = lastMode.current === 'guest' ? guestRef : playerRef
      target.current?.focus()
    }
  }, [mode])

  const close = () => {
    restoreFocus.current = true
    setMode(null)
  }
  const openMode = (m: Exclude<Mode, null>) => {
    clearNotice()
    lastMode.current = m
    setMode(m)
  }

  return (
    <section aria-label="Manage the list" className="flex flex-col gap-3 border-b border-line p-4">
      {mode === 'player' ? (
        <AdminAddPlayerPicker candidates={candidates} busy={busy} onAdd={add} onClose={close} />
      ) : mode === 'guest' ? (
        <AdminAddGuestForm busy={busy} onAdd={addGuest} onClose={close} />
      ) : (
        <div className="flex gap-2">
          <button ref={playerRef} type="button" disabled={busy} onClick={() => openMode('player')} className={openBtn}>
            <UserPlus className="h-5 w-5" aria-hidden="true" /> Add player
          </button>
          <button ref={guestRef} type="button" disabled={busy} onClick={() => openMode('guest')} className={openBtn}>
            <UserPlus className="h-5 w-5" aria-hidden="true" /> Add guest
          </button>
        </div>
      )}
      {/* Both live regions stay mounted so a message is announced when it appears. */}
      <p role="status" aria-live="polite" className={notice?.kind === 'success' ? 'flex items-center gap-2 text-sm font-semibold text-ink [overflow-wrap:anywhere]' : 'sr-only'}>
        {notice?.kind === 'success' && (
          <>
            <Check className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
            {notice.text}
          </>
        )}
      </p>
      <div role="alert" className={notice?.kind === 'error' ? 'text-sm text-brand-hover [overflow-wrap:anywhere]' : 'sr-only'}>
        {notice?.kind === 'error' && notice.text}
      </div>
    </section>
  )
}
