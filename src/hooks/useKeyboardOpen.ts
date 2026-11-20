import { useEffect, useState } from 'react'

const TEXT_INPUT = 'input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select, [contenteditable=""], [contenteditable="true"]'
const KEYBOARD_PX = 150 // the visual viewport losing this much height means a software keyboard

/**
 * True while the on-screen keyboard is probably up: a text field has focus, or the visual
 * viewport shrank. A fixed bottom bar either rides on top of the keyboard (Android) or hides
 * behind it (iOS), and both jump around, so the dock steps out of the way instead.
 */
export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const focused = () => document.activeElement instanceof Element && document.activeElement.matches(TEXT_INPUT)
    const shrunk = () => {
      const vv = window.visualViewport
      return !!vv && window.innerHeight - vv.height > KEYBOARD_PX
    }
    const update = () => setOpen(focused() || shrunk())
    // focusout fires before focus lands on the next field: wait a tick so tabbing between inputs does not flash the dock.
    const onFocusOut = () => setTimeout(update, 0)

    document.addEventListener('focusin', update)
    document.addEventListener('focusout', onFocusOut)
    window.visualViewport?.addEventListener('resize', update)
    return () => {
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', onFocusOut)
      window.visualViewport?.removeEventListener('resize', update)
    }
  }, [])

  return open
}
