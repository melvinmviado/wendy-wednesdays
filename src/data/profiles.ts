import { supabase } from '../lib/supabase'
import type { Profile } from '../types/auth'
import { errorMessage } from '../utils/errorMessage'

interface ProfileRow {
  id: string
  display_name: string | null
  avatar_url: string | null
  role: string
  created_at: string
  updated_at: string
}

export type ProfileResult = { profile: Profile | null; error: string | null }

const toProfile = (row: ProfileRow): Profile => ({
  id: row.id,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  role: row.role === 'admin' ? 'admin' : 'user',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

/** The two columns a user may change themselves (the database refuses anything else, role included). */
export interface ProfilePatch {
  display_name?: string
  avatar_url?: string | null
}

/** Updates the caller's own profile row. Throws if the write fails or matched no row. */
export async function updateOwnProfile(userId: string, patch: ProfilePatch): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').update(patch).eq('id', userId).select().maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Your profile could not be found.')
  return toProfile(data as ProfileRow)
}

/**
 * The signed-in user's own profile row (RLS only returns your own). `profile` is null when it
 * does not exist or cannot be read, for example before the profiles migration is applied.
 */
export async function fetchOwnProfile(userId: string): Promise<ProfileResult> {
  try {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    if (error) throw error
    return { profile: data ? toProfile(data as ProfileRow) : null, error: null }
  } catch (e: unknown) {
    return { profile: null, error: errorMessage(e, 'Could not load your profile.') }
  }
}
