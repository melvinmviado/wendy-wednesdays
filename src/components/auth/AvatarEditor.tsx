import React, { useRef } from 'react'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { AVATAR_ACCEPT } from '../../utils/profileValidation'
import { modalBtnQuiet } from '../admin/ModalShell'
import { Avatar } from '../Avatar'

interface AvatarEditorProps {
  name: string
  avatarUrl: string | null | undefined
  busy: boolean
  onPick: (file: File) => void
  onRemove: () => void
}

/** Current photo with Add/Change and Remove. Picking a file hands it to the parent to validate and crop. */
export const AvatarEditor: React.FC<AvatarEditorProps> = ({ name, avatarUrl, busy, onPick, onRemove }) => {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="flex items-center gap-4">
      <Avatar avatarUrl={avatarUrl} name={name} size={80} eager />
      <div className="flex flex-wrap gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_ACCEPT}
          className="hidden"
          aria-label="Upload profile photo"
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = '' // so choosing the same file again still fires
            if (file) onPick(file)
          }}
        />
        <button type="button" disabled={busy} onClick={() => inputRef.current?.click()} className={modalBtnQuiet}>
          {busy ? (
            <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlus className="w-4 h-4" aria-hidden="true" />
          )}
          <span>{avatarUrl ? 'Change photo' : 'Add photo'}</span>
        </button>
        {avatarUrl && (
          <button type="button" disabled={busy} onClick={onRemove} className={modalBtnQuiet}>
            <Trash2 className="w-4 h-4" aria-hidden="true" />
            <span>Remove</span>
          </button>
        )}
      </div>
    </div>
  )
}
