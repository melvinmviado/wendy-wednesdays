import { supabase } from '../lib/supabase'
import type { Profile } from '../types/auth'
import { updateOwnProfile } from './profiles'

const BUCKET = 'avatars'

// The bucket's policies only allow {uid}/avatar.(jpg|png|webp). The cropper always exports
// JPEG, so every avatar lives at one fixed path and a new upload overwrites the old file.
const pathFor = (userId: string) => `${userId}/avatar.jpg`

/** A previous avatar's bytes, kept so a failed save can put them back. */
interface Backup {
  blob: Blob
}

/** Public URL with a version query so browsers and the CDN do not serve the replaced image. */
export function versionedAvatarUrl(userId: string, version = Date.now()): string {
  return `${supabase.storage.from(BUCKET).getPublicUrl(pathFor(userId)).data.publicUrl}?v=${version}`
}

/** Fetches the current avatar. Null if there is none (404); throws on any other failure. */
async function backupCurrent(url: string | null): Promise<Backup | null> {
  if (!url) return null
  const res = await fetch(url)
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok) throw new Error('Could not prepare your current photo for replacement.')
  return { blob: await res.blob() }
}

async function put(userId: string, blob: Blob): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(pathFor(userId), blob, { contentType: 'image/jpeg', upsert: true, cacheControl: '3600' })
  if (error) throw error
}

/** Removes every file in the user's folder except `keep` (e.g. an old avatar.png). Best effort. */
async function removeOthers(userId: string, keep: string | null): Promise<void> {
  const { data } = await supabase.storage.from(BUCKET).list(userId)
  const stale = (data ?? []).map((f) => `${userId}/${f.name}`).filter((p) => p !== keep)
  if (stale.length > 0) await supabase.storage.from(BUCKET).remove(stale)
}

/**
 * Replaces the avatar: upload the new file, then point the profile at it.
 * If the profile update fails after the upload succeeded, the storage change is undone so the
 * stored photo and profiles.avatar_url never disagree: the previous image is put back, or the
 * new file is removed if there was none. The original error is rethrown either way.
 */
export async function replaceAvatar(userId: string, blob: Blob, previousUrl: string | null): Promise<Profile> {
  const backup = await backupCurrent(previousUrl) // before anything changes, so we can roll back
  await put(userId, blob)
  try {
    const profile = await updateOwnProfile(userId, { avatar_url: versionedAvatarUrl(userId) })
    await removeOthers(userId, pathFor(userId)).catch(() => {}) // tidy-up must never fail the save
    return profile
  } catch (e: unknown) {
    try {
      if (backup) await put(userId, backup.blob)
      else await supabase.storage.from(BUCKET).remove([pathFor(userId)])
    } catch (rollbackError: unknown) {
      console.warn('[avatar] could not roll back the upload:', rollbackError)
    }
    throw e
  }
}

/** Clears the profile's photo first (so the UI is consistent), then deletes the file(s). */
export async function removeAvatar(userId: string): Promise<Profile> {
  const profile = await updateOwnProfile(userId, { avatar_url: null })
  await removeOthers(userId, null).catch((e: unknown) => console.warn('[avatar] file cleanup failed:', e))
  return profile
}
