import { lazy, Suspense, type ComponentProps } from 'react'
import { Loader2 } from 'lucide-react'
import type { PhotoCropModal as PhotoCropModalType } from './PhotoCropModal'

const PhotoCropModal = lazy(() => import('./PhotoCropModal').then((m) => ({ default: m.PhotoCropModal })))

/** The cropper, and react-easy-crop with it, is downloaded only when someone actually crops a photo. */
export function LazyPhotoCropModal(props: ComponentProps<typeof PhotoCropModalType>) {
  return (
    <Suspense
      fallback={
        <div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 text-sm text-ink">
          <Loader2 className="mr-2 h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
          Opening the photo editor…
        </div>
      }
    >
      <PhotoCropModal {...props} />
    </Suspense>
  )
}
