import React, { useState } from 'react'
import { AlertCircle, CheckCircle2, Loader2, LogOut, Mail, ShieldCheck, User as UserIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { useProfileEditor, type EditorResult } from '../../hooks/useProfileEditor'
import {
  AVATAR_OUTPUT_SIZE,
  DISPLAY_NAME_MAX,
  validateAvatarFile,
  validateDisplayName,
} from '../../utils/profileValidation'
import { ModalShell, modalBtn, modalBtnQuiet } from '../admin/ModalShell'
import { LazyPhotoCropModal } from '../results/LazyPhotoCropModal'
import { AuthField } from './AuthField'
import { AvatarEditor } from './AvatarEditor'

interface ProfileDialogProps {
  onClose: () => void
  onSignOut: () => void
}

type Notice = { ok: boolean; text: string } | null

/** Edit your display name and photo; see your email and role; sign out. */
export const ProfileDialog: React.FC<ProfileDialogProps> = ({ onClose, onSignOut }) => {
  const { user, profile, isAdmin } = useAuth()
  const editor = useProfileEditor()
  const saved = profile?.displayName ?? ''
  const [name, setName] = useState(saved || user?.email?.split('@')[0] || '')
  const [nameError, setNameError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)

  const report = (r: EditorResult, success: string) => setNotice(r.ok ? { ok: true, text: success } : { ok: false, text: r.error })

  const handlePick = (file: File) => {
    const problem = validateAvatarFile(file)
    if (problem) return setNotice({ ok: false, text: problem })
    setNotice(null)
    setCropFile(file) // crop first; the upload happens when the crop is confirmed
  }

  const handleCropped = async (blob: Blob) => {
    setCropFile(null)
    report(await editor.saveAvatar(blob), 'Photo updated.')
  }

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    const problem = validateDisplayName(name)
    setNameError(problem)
    if (problem) return
    const result = await editor.saveName(name)
    report(result, 'Name saved.')
    if (result.ok) setName(name.trim())
  }

  // The cropper is a full-screen dialog of its own, so show it instead of (not on top of) this one.
  // The draft name lives here, so nothing is lost when this dialog comes back.
  if (cropFile) {
    return (
      <LazyPhotoCropModal
        file={cropFile}
        title="Crop your photo"
        saveLabel="Use photo"
        outputSize={AVATAR_OUTPUT_SIZE}
        cropShape="round"
        onCancel={() => setCropFile(null)}
        onConfirm={handleCropped}
      />
    )
  }

  const displayName = saved || user?.email || 'Player'
  const nameBusy = editor.busy === 'name'
  const unchanged = name.trim() === saved

  return (
    <ModalShell title="Your profile" onClose={onClose}>
      <div className="mt-5 space-y-5">
        <AvatarEditor
          name={displayName}
          avatarUrl={profile?.avatarUrl}
          busy={editor.busy === 'avatar'}
          onPick={handlePick}
          onRemove={async () => report(await editor.clearAvatar(), 'Photo removed.')}
        />

        <form onSubmit={handleSaveName} noValidate className="space-y-3">
          <AuthField
            label="Display name"
            icon={UserIcon}
            value={name}
            maxLength={DISPLAY_NAME_MAX}
            autoComplete="nickname"
            onChange={(e) => setName(e.target.value)}
            error={nameError}
            disabled={nameBusy}
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted">{name.trim().length}/{DISPLAY_NAME_MAX}</span>
            <button type="submit" disabled={nameBusy || unchanged} className={`${modalBtn} bg-brand text-brand-ink hover:bg-brand-hover`}>
              {nameBusy && <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" />}
              <span>{nameBusy ? 'Saving…' : 'Save name'}</span>
            </button>
          </div>
        </form>

        {notice && (
          <p role={notice.ok ? 'status' : 'alert'} className="pl-4 border-l-2 border-brand text-sm text-ink flex items-center gap-2">
            {notice.ok ? (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-ok" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0 text-brand-hover" aria-hidden="true" />
            )}
            <span className="min-w-0 wrap-break-word">{notice.text}</span>
          </p>
        )}

        <dl className="text-sm border-t border-line pt-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-ink-soft"><Mail className="w-4 h-4" aria-hidden="true" /> Email</dt>
            <dd className="text-ink truncate">{user?.email ?? 'Not set'}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-ink-soft"><ShieldCheck className="w-4 h-4" aria-hidden="true" /> Role</dt>
            <dd className="text-ink">{isAdmin ? 'Admin' : 'Member'}</dd>
          </div>
        </dl>

        <button type="button" onClick={() => { onSignOut(); onClose() }} className={`${modalBtnQuiet} w-full`}>
          <LogOut className="w-4 h-4" aria-hidden="true" />
          <span>Sign out</span>
        </button>
      </div>
    </ModalShell>
  )
}
