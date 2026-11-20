import { useCallback, useRef, useState } from 'react'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  kind: 'success' | 'error'
  message: string
  action?: ToastAction
}

export interface ToastOptions {
  action?: ToastAction
  /** How long it stays. Defaults to 3.5s, or 7s for errors. */
  durationMs?: number
}

export interface ToastApi {
  toasts: Toast[]
  push: (kind: Toast['kind'], message: string, options?: ToastOptions) => number
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
    (kind: Toast['kind'], message: string, options: ToastOptions = {}) => {
      const id = ++nextId.current
      setToasts((list) => [...list, { id, kind, message, action: options.action }])
      setTimeout(() => dismiss(id), options.durationMs ?? (kind === 'error' ? 7000 : 3500))
      return id
    },
    [dismiss]
  )

  return { toasts, push, dismiss }
}
