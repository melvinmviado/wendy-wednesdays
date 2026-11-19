import { useCallback, useRef, useState } from 'react'

export interface Toast {
  id: number
  kind: 'success' | 'error'
  message: string
}

export interface ToastApi {
  toasts: Toast[]
  push: (kind: Toast['kind'], message: string) => void
  dismiss: (id: number) => void
}

/** Minimal toast state. Errors stay a little longer than successes. */
export function useToasts(): ToastApi {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id))
  }, [])

  const push = useCallback(
    (kind: Toast['kind'], message: string) => {
      const id = ++nextId.current
      setToasts((list) => [...list, { id, kind, message }])
      setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 3500)
    },
    [dismiss]
  )

  return { toasts, push, dismiss }
}
