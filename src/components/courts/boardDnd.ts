import type React from 'react'
import { useState } from 'react'

// Desktop drag and drop for the court board: an enhancement on top of tap-to-select, which is
// how the board works everywhere (and the only way on a phone). Native HTML5 drag events.

const TYPE = 'application/x-wendy-player'

/** True on a device with a mouse or trackpad. Read once: it does not change while the page is open. */
export function useCanDrag(): boolean {
  const [fine] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: fine)').matches)
  return fine
}

export function dragSource(playerId: string, enabled: boolean): React.HTMLAttributes<HTMLElement> & { draggable?: boolean } {
  if (!enabled) return {}
  return {
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData(TYPE, playerId)
      e.dataTransfer.effectAllowed = 'move'
    },
  }
}

/** Drop handlers for a player, a seat or the tray. The innermost target wins (no bubbling to the tray). */
export function dropTarget(onDrop: (draggedId: string) => void, enabled: boolean): React.HTMLAttributes<HTMLElement> {
  if (!enabled) return {}
  return {
    onDragOver: (e) => {
      if (!e.dataTransfer.types.includes(TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDrop: (e) => {
      const id = e.dataTransfer.getData(TYPE)
      if (!id) return
      e.preventDefault()
      e.stopPropagation()
      onDrop(id)
    },
  }
}
