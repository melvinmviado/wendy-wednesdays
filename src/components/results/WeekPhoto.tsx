import React, { useRef, useState } from 'react'
import { ImageOff, ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { removeWeekPhoto, uploadWeekPhoto } from '../../data/weeklyResults'
import { PhotoCropModal } from './PhotoCropModal'

interface WeekPhotoProps {
  weekNumber: number
  photoUrl: string | null
  isAdmin: boolean
  onChanged: () => void
}

const MAX_BYTES = 10 * 1024 * 1024
const btn =
  'inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-lg text-sm font-semibold border border-line bg-surface text-ink hover:bg-raised transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'

// Podium photo for a week. Everyone sees it; admins can add, replace or remove it.
export const WeekPhoto: React.FC<WeekPhotoProps> = ({ weekNumber, photoUrl, isAdmin, onChanged }) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      onChanged()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > MAX_BYTES) {
      setError('Image must be 10 MB or smaller')
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file')
      return
    }
    setError(null)
    setPendingFile(file) // crop first; upload happens on confirm
  }

  const handleCropped = (blob: Blob) => {
    setPendingFile(null)
    run(() => uploadWeekPhoto(weekNumber, new File([blob], 'podium.jpg', { type: 'image/jpeg' })))
  }

  return (
    <div className="flex flex-col gap-3 w-full max-w-md">
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={`Week ${weekNumber} podium`}
          loading="lazy"
          className="w-full aspect-square object-cover rounded-xl border border-line bg-surface"
        />
      ) : (
        <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-surface text-sm text-muted">
          <ImageOff className="w-6 h-6" aria-hidden="true" />
          <span>No podium photo yet</span>
        </div>
      )}

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            aria-label={`Upload week ${weekNumber} podium photo`}
            onChange={(e) => {
              handleFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          <button type="button" className={btn} disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? (
              <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <ImagePlus className="w-4 h-4" aria-hidden="true" />
            )}
            <span>{photoUrl ? 'Replace photo' : 'Add photo'}</span>
          </button>
          {photoUrl && (
            <button type="button" className={btn} disabled={busy} onClick={() => run(() => removeWeekPhoto(weekNumber))}>
              <Trash2 className="w-4 h-4" aria-hidden="true" />
              <span>Remove</span>
            </button>
          )}
        </div>
      )}
      {pendingFile && (
        <PhotoCropModal file={pendingFile} onCancel={() => setPendingFile(null)} onConfirm={handleCropped} />
      )}
      {error && (
        <p role="alert" className="text-sm text-brand-hover">
          {error}
        </p>
      )}
    </div>
  )
}
