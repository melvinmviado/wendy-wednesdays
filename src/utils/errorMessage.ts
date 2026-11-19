/** Best-effort message from anything thrown: Error, Supabase PostgrestError (a plain object), or a string. */
export function errorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error && e.message) return e.message
  if (typeof e === 'string' && e) return e
  if (typeof e === 'object' && e !== null && 'message' in e) {
    const m = (e as { message: unknown }).message
    if (typeof m === 'string' && m) return m
  }
  return fallback
}
