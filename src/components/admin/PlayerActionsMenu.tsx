import React, { useCallback, useEffect, useRef, useState } from 'react'
import { MoreVertical, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react'

interface PlayerActionsMenuProps {
  playerName: string
  onRename: () => void
  onArchive: () => void
  /** Set for an archived player: the menu then offers Restore in place of Archive. */
  onRestore?: () => void
  onDelete: () => void
}

const ITEM =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-raised focus-visible:bg-raised focus-visible:outline-none cursor-pointer'
const MENU_WIDTH = 176
const MENU_HEIGHT = 140

/** Admin-only row menu. Positioned `fixed` so the table's overflow clipping can't cut it off. */
export const PlayerActionsMenu: React.FC<PlayerActionsMenuProps> = ({ playerName, onRename, onArchive, onRestore, onDelete }) => {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const close = useCallback((restoreFocus: boolean) => {
    setPos(null)
    if (restoreFocus) triggerRef.current?.focus()
  }, [])

  const open = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    if (!r) return
    const below = r.bottom + 4
    const top = below + MENU_HEIGHT > window.innerHeight ? Math.max(8, r.top - MENU_HEIGHT - 4) : below
    setPos({ top, left: Math.max(8, Math.min(r.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)) })
  }

  useEffect(() => {
    if (!pos) return
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        close(true)
      }
    }
    const dismiss = () => close(false)
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', dismiss, true)
    window.addEventListener('resize', dismiss)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', dismiss, true)
      window.removeEventListener('resize', dismiss)
    }
  }, [pos, close])

  const moveFocus = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    e.preventDefault()
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
    items[next]?.focus()
  }

  const choose = (action: () => void) => () => {
    close(false)
    action()
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Actions for ${playerName}`}
        aria-haspopup="menu"
        aria-expanded={pos !== null}
        onClick={(e) => {
          e.stopPropagation() // don't open the stats modal
          if (pos) close(false)
          else open()
        }}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-raised hover:text-ink cursor-pointer"
      >
        <MoreVertical className="w-5 h-5" aria-hidden="true" />
      </button>
      {pos && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${playerName}`}
          onKeyDown={moveFocus}
          onClick={(e) => e.stopPropagation()}
          style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}
          className="fixed z-40 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl"
        >
          <button role="menuitem" type="button" className={ITEM} onClick={choose(onRename)}>
            <Pencil className="w-4 h-4" aria-hidden="true" /> Rename
          </button>
          {onRestore ? (
            <button role="menuitem" type="button" className={ITEM} onClick={choose(onRestore)}>
              <ArchiveRestore className="w-4 h-4" aria-hidden="true" /> Restore
            </button>
          ) : (
            <button role="menuitem" type="button" className={ITEM} onClick={choose(onArchive)}>
              <Archive className="w-4 h-4" aria-hidden="true" /> Archive
            </button>
          )}
          <div role="separator" className="my-1 border-t border-line" />
          <button role="menuitem" type="button" className={`${ITEM} text-brand-hover`} onClick={choose(onDelete)}>
            <Trash2 className="w-4 h-4" aria-hidden="true" /> Delete
          </button>
        </div>
      )}
    </>
  )
}
