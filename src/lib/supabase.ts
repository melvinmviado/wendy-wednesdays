import { createClient, SupabaseClient } from '@supabase/supabase-js'

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const envKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Dev only: credentials saved from the demo-mode "Connect Supabase" form, for trying a project
// without rebuilding. Production builds ignore them, so nobody can point a deployed app at
// another backend from the browser (vite.config.ts also refuses a production build without
// the env vars, and the CSP in public/_headers only allows this project's host).
const canUseStored = import.meta.env.DEV && typeof window !== 'undefined'
const storedUrl = canUseStored ? localStorage.getItem('supabase_url') || '' : ''
const storedKey = canUseStored ? localStorage.getItem('supabase_anon_key') || '' : ''

export const supabaseUrl = envUrl || storedUrl || ''
export const supabaseAnonKey = envKey || storedKey || ''

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project-id') &&
  !supabaseAnonKey.includes('your-anon-public-key')
)

// Fallback dummy client if credentials aren't provided yet so app doesn't crash on import
// Auth options are spelled out (they match supabase-js's defaults, so behavior is unchanged).
// flowType stays 'implicit': magic links keep working when opened on another device.
// The placeholder client must stay inert: no stored session, no refresh timer, no URL parsing.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    })
  : createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseAnonKey || 'placeholder-anon-key',
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    )
