import { useCallback, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { removeAvatar, replaceAvatar } from '../data/avatars'
import { updateOwnProfile } from '../data/profiles'
import { errorMessage } from '../utils/errorMessage'
import { validateAvatarBlob, validateDisplayName } from '../utils/profileValidation'

export type EditorResult = { ok: true } | { ok: false; error: string }
export type EditorBusy = 'name' | 'avatar' | null

const ok: EditorResult = { ok: true }
const fail = (error: string): EditorResult => ({ ok: false, error })

const toDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('Could not read the image'))
    reader.readAsDataURL(blob)
  })

/**
 * Profile edits for the signed-in user. Against Supabase each action writes to the database
 * (and storage) and then refreshes the profile; in demo mode it only updates local state.
 */
export function useProfileEditor() {
  const { user, profile, isConfigured, refreshProfile, applyProfile } = useAuth()
  const [busy, setBusy] = useState<EditorBusy>(null)
  const userId = user?.id ?? null

  const run = useCallback(
    async (kind: Exclude<EditorBusy, null>, action: () => Promise<void>, fallback: string): Promise<EditorResult> => {
      if (!userId) return fail('You need to be signed in.')
      setBusy(kind)
      try {
        await action()
        return ok
      } catch (e: unknown) {
        return fail(errorMessage(e, fallback))
      } finally {
        setBusy(null)
      }
    },
    [userId]
  )

  const saveName = useCallback(
    (name: string) => {
      const problem = validateDisplayName(name)
      if (problem) return Promise.resolve(fail(problem))
      const clean = name.trim()
      return run('name', async () => {
        if (!isConfigured) return applyProfile({ displayName: clean })
        await updateOwnProfile(userId!, { display_name: clean })
        await refreshProfile()
      }, 'Could not save your name.')
    },
    [run, isConfigured, applyProfile, refreshProfile, userId]
  )

  const saveAvatar = useCallback(
    (blob: Blob) => {
      const problem = validateAvatarBlob(blob)
      if (problem) return Promise.resolve(fail(problem))
      return run('avatar', async () => {
        if (!isConfigured) return applyProfile({ avatarUrl: await toDataUrl(blob) })
        await replaceAvatar(userId!, blob, profile?.avatarUrl ?? null)
        await refreshProfile()
      }, 'Could not save your photo.')
    },
    [run, isConfigured, applyProfile, refreshProfile, userId, profile?.avatarUrl]
  )

  const clearAvatar = useCallback(
    () =>
      run('avatar', async () => {
        if (!isConfigured) return applyProfile({ avatarUrl: null })
        await removeAvatar(userId!)
        await refreshProfile()
      }, 'Could not remove your photo.'),
    [run, isConfigured, applyProfile, refreshProfile, userId]
  )

  return { busy, saveName, saveAvatar, clearAvatar }
}
