import { AlertTriangle, Loader2 } from 'lucide-react'
import { EventSettingsPanel } from '../../components/admin/EventSettingsPanel'
import { useEventSettings } from '../../hooks/useEventSettings'
import { useAdminContext } from './adminContext'

export function AdminSetupPage() {
  const { toasts } = useAdminContext()
  const { settings, loading, error, update, refetch } = useEventSettings()

  if (loading) {
    return (
      <p role="status" className="flex items-center gap-2 text-ink-soft">
        <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> Loading the saved settings…
      </p>
    )
  }
  return (
    <>
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-brand bg-brand-soft p-4 text-sm text-ink">
          <AlertTriangle className="h-5 w-5 shrink-0 text-brand-hover" aria-hidden="true" />
          <div className="flex-1">
            <p className="font-semibold">Couldn't load the saved settings.</p>
            <p className="text-ink-soft">{error.message}</p>
          </div>
          <button type="button" onClick={() => void refetch()} className="min-h-11 cursor-pointer rounded-lg border border-line px-3 font-semibold hover:bg-raised">
            Try again
          </button>
        </div>
      )}
      <EventSettingsPanel settings={settings} update={update} toast={toasts.push} />
    </>
  )
}
