import { useCallback, useEffect, useRef, useState } from 'react'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  fetchEventSettings,
  updateEventSettings,
  type EventSettings,
  type EventSettingsError,
  type EventSettingsInput,
  type EventSettingsResult,
} from '../lib/eventSettings'

const CHANGED = 'event-settings-changed'
const REFRESH_MS = 60_000

/**
 * The event settings row. `settings` is null while loading, when there is no row, and when there is
 * no database, in which case callers use the built-in weekly schedule (see utils/rsvpSchedule.ts).
 * Refetches every minute while the tab is visible, when it becomes visible, and whenever any other
 * instance of this hook saves, so the RSVP bar follows an admin's change.
 */
export function useEventSettings() {
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)
  const [error, setError] = useState<EventSettingsError | null>(null)
  const [saving, setSaving] = useState(false)
  const latest = useRef(0) // a slower, older read must not overwrite a newer one

  const refetch = useCallback(async () => {
    if (!isSupabaseConfigured) return
    const mine = ++latest.current
    const result = await fetchEventSettings()
    if (mine !== latest.current) return
    if (result.ok) {
      setSettings(result.data)
      setError(null)
    } else {
      setError(result.error) // keep showing the last good settings
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void refetch()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refetch()
    }
    const onChanged = () => void refetch()
    const id = setInterval(onVisible, REFRESH_MS)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener(CHANGED, onChanged)
    window.addEventListener('focus', onVisible) // an admin may have changed the cutoff while this tab sat in the background
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener(CHANGED, onChanged)
      window.removeEventListener('focus', onVisible)
    }
  }, [refetch])

  const update = useCallback(
    async (input: EventSettingsInput): Promise<EventSettingsResult<EventSettings>> => {
      setSaving(true)
      const result = await updateEventSettings(input)
      setSaving(false)
      if (result.ok) {
        setSettings(result.data)
        setError(null)
        await refetch() // confirm what the database actually holds
        window.dispatchEvent(new Event(CHANGED)) // other mounted instances (the RSVP bar) refetch too
      }
      return result
    },
    [refetch],
  )

  return { settings, loading, error, saving, refetch, update }
}
