import { createClient, SupabaseClient } from '@supabase/supabase-js'

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Also check localStorage for quick testing without rebuilding
const storedUrl = typeof window !== 'undefined' ? localStorage.getItem('supabase_url') || '' : ''
const storedKey = typeof window !== 'undefined' ? localStorage.getItem('supabase_anon_key') || '' : ''

export const supabaseUrl = envUrl || storedUrl || ''
export const supabaseAnonKey = envKey || storedKey || ''

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseAnonKey.includes('your-anon-public-key')
)

// Fallback dummy client if credentials aren't provided yet so app doesn't crash on import
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseAnonKey || 'placeholder-anon-key'
    )
