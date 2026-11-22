// Keep in step with Supabase: Authentication > Providers > Email > Minimum password length.
export const MIN_PASSWORD_LENGTH = 8

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A message for the first problem with the email, or null when it looks fine. */
export function validateEmail(value: string): string | null {
  const email = value.trim()
  if (!email) return 'Enter your email address.'
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address, like name@example.com.'
  return null
}

/** Sign-in only needs something typed; creating an account enforces the minimum length. */
export function validatePassword(value: string, mode: 'signin' | 'signup'): string | null {
  if (!value) return 'Enter your password.'
  if (mode === 'signup' && value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}
