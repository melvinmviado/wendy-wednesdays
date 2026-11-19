import React, { useCallback, useEffect, useState } from 'react'
import Cropper from 'react-easy-crop'
import { Loader2, Minus, Plus } from 'lucide-react'
import { CropArea, getCroppedBlob } from '../../utils/cropImage'

interface PhotoCropModalProps {
  file: File
  onCancel: () => void
  onConfirm: (blob: Blob) => void
}

const btn =
  'inline-flex items-center justify-center gap-2 min-h-10 px-4 rounded-lg text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'

// Square (1:1) crop box: drag to reposition, slider to zoom, then export a 1080 px JPEG.
export const PhotoCropModal: React.FC<PhotoCropModalProps> = ({ file, onCancel, onConfirm }) => {
  const [src, setSrc] = useState<string | null>(null)
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<CropArea | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  const onCropComplete = useCallback((_: unknown, pixels: CropArea) => setArea(pixels), [])

  const handleSave = async () => {
    if (!src || !area) return
    setBusy(true)
    setError(null)
    try {
      onConfirm(await getCroppedBlob(src, area))
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not crop the image')
      setBusy(false)
    }
  }

  const step = (delta: number) => setZoom((z) => Math.min(3, Math.max(1, Number((z + delta).toFixed(2)))))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ground/90" onClick={() => !busy && onCancel()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Crop podium photo"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md max-h-full overflow-y-auto rounded-2xl border border-line bg-surface p-4 sm:p-5 flex flex-col gap-4"
      >
        <h2 className="text-lg font-black text-ink">Crop podium photo</h2>

        <div className="relative w-full aspect-square overflow-hidden rounded-xl bg-ground touch-none">
          {src && (
            <Cropper
              image={src}
              crop={crop}
              zoom={zoom}
              minZoom={1}
              maxZoom={3}
              aspect={1}
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <button type="button" aria-label="Zoom out" className={`${btn} border border-line bg-raised text-ink px-3`} onClick={() => step(-0.1)}>
            <Minus className="w-4 h-4" aria-hidden="true" />
          </button>
          <input
            type="range"
            aria-label="Zoom"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 min-w-0 accent-brand h-10 cursor-pointer"
          />
          <button type="button" aria-label="Zoom in" className={`${btn} border border-line bg-raised text-ink px-3`} onClick={() => step(0.1)}>
            <Plus className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <p className="text-sm text-muted">Drag to reposition. Use the slider or pinch to zoom.</p>

        {error && (
          <p role="alert" className="text-sm text-brand-hover wrap-break-word">
            {error}
          </p>
        )}

        <div className="flex gap-2">
          <button type="button" className={`${btn} flex-1 border border-line bg-surface text-ink hover:bg-raised`} onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className={`${btn} flex-1 bg-brand text-brand-ink hover:bg-brand-hover`} onClick={handleSave} disabled={busy || !area}>
            {busy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />}
            <span>Save photo</span>
          </button>
        </div>
      </div>
    </div>
  )
}
