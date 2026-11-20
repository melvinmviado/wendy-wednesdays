import { isSupabaseConfigured } from '../lib/supabase'
import type { RsvpApi } from '../types/rsvp'
import { createDemoRsvpApi } from './rsvpDemo'
import { supabaseRsvpApi } from './rsvps'

/** The RSVP backend for this run: Supabase when configured, otherwise the in-memory demo. */
export const rsvpApi: RsvpApi = isSupabaseConfigured ? supabaseRsvpApi : createDemoRsvpApi()
