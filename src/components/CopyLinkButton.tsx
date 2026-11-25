import React, { useEffect, useRef, useState } from 'react'
import { Check, Link as LinkIcon, TriangleAlert, type LucideIcon } from 'lucide-react'

type CopyState = 'idle' | 'copied' | 'failed'

const FEEDBACK_MS = 2000

/** Clipboard API first; hidden textarea + execCommand for non-secure or older contexts. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fall through to the legacy path
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  area.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none'
  document.body.appendChild(area)
  try {
    area.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(area)
  }
}

interface CopyLinkButtonProps {
  /** What is copied: a link, or any text. */
  url: string
  label?: string // idle label
  copiedLabel?: string
  icon?: LucideIcon
}

/** Copies `url` to the clipboard and shows "Link copied" / "Couldn't copy" for a couple of seconds. */
export const CopyLinkButton: React.FC<CopyLinkButtonProps> = ({ url, label = 'Share', copiedLabel = 'Link copied', icon = LinkIcon }) => {
  const [state, setState] = useState<CopyState>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    const ok = await copyText(url)
    setState(ok ? 'copied' : 'failed')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState('idle'), FEEDBACK_MS)
  }

  const Icon = state === 'copied' ? Check : state === 'failed' ? TriangleAlert : icon
  const text = state === 'copied' ? copiedLabel : state === 'failed' ? "Couldn't copy" : label

  return (
    <>
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-raised cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover"
      >
        <Icon className={`h-4 w-4 ${state === 'copied' ? 'text-ok' : ''}`} aria-hidden="true" />
        <span aria-hidden={state !== 'idle'}>{text}</span>
      </button>
      {/* Announces the result; the button text is hidden from assistive tech while it shows feedback */}
      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? copiedLabel : state === 'failed' ? "Couldn't copy" : ''}
      </span>
    </>
  )
}
