import React, { useEffect, useRef, useState } from 'react'
import { CheckSquare, LogOut, ShieldCheck, User as UserIcon, UserCheck } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../Avatar'

interface UserMenuProps {
  onProfile: () => void
  onAdminTools: () => void
  onClaims?: () => void // admins only; omit to hide the item
  pendingClaims?: number
  onSignOut: () => void
}

const item =
  'flex w-full items-center gap-2.5 min-h-10 px-3 rounded-lg text-sm text-ink hover:bg-raised focus:bg-raised outline-none transition-colors cursor-pointer text-left'

/** Avatar button that opens Profile / Admin tools (admins only) / Sign out. */
export const UserMenu: React.FC<UserMenuProps> = ({ onProfile, onAdminTools, onClaims, pendingClaims = 0, onSignOut }) => {
  const { user, profile, isAdmin } = useAuth()
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const label = profile?.displayName || user?.email || 'Account'

  useEffect(() => {
    if (!open) return
    const items = () => [...(wrapRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    items()[0]?.focus()

    const onPointer = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setOpen(false)
        buttonRef.current?.focus()
      } else if (e.key === 'Tab') {
        setOpen(false)
      } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
        e.preventDefault()
        const list = items()
        const at = list.indexOf(document.activeElement as HTMLElement)
        const next =
          e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length
        list[next]?.focus()
      }
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choose = (action: () => void) => () => {
    setOpen(false)
    action()
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${label}`}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-center rounded-full p-0.5 border border-line hover:border-ink-soft transition-colors cursor-pointer"
      >
        <Avatar avatarUrl={profile?.avatarUrl} name={label} size={36} eager />
      </button>

      {open && (
        <div role="menu" aria-label="Account" className="absolute right-0 mt-2 w-60 z-40 rounded-xl border border-line bg-surface p-1.5 shadow-lg">
          <div className="px-3 py-2 border-b border-line mb-1.5">
            <p className="text-sm font-semibold text-ink truncate">{label}</p>
            {user?.email && label !== user.email && <p className="text-xs text-muted truncate">{user.email}</p>}
            {isAdmin && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink bg-brand-soft border border-brand px-2 py-0.5 rounded-full">
                <ShieldCheck className="w-3 h-3 text-brand-hover" aria-hidden="true" /> Admin
              </p>
            )}
          </div>
          <button role="menuitem" tabIndex={-1} className={item} onClick={choose(onProfile)}>
            <UserIcon className="w-4 h-4 text-ink-soft" aria-hidden="true" /> Profile
          </button>
          {isAdmin && (
            <button role="menuitem" tabIndex={-1} className={item} onClick={choose(onAdminTools)}>
              <CheckSquare className="w-4 h-4 text-ink-soft" aria-hidden="true" /> Admin tools
            </button>
          )}
          {isAdmin && onClaims && (
            <button role="menuitem" tabIndex={-1} className={item} onClick={choose(onClaims)}>
              <UserCheck className="w-4 h-4 text-ink-soft" aria-hidden="true" /> Player claims
              {pendingClaims > 0 && (
                <span className="ml-auto rounded-full bg-brand px-2 text-xs font-bold text-brand-ink" aria-label={`${pendingClaims} pending`}>
                  {pendingClaims}
                </span>
              )}
            </button>
          )}
          <button role="menuitem" tabIndex={-1} className={item} onClick={choose(onSignOut)}>
            <LogOut className="w-4 h-4 text-ink-soft" aria-hidden="true" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}
