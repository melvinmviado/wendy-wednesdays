export const DISPLAY_NAME_MAX = 60
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp'
export const AVATAR_INPUT_MAX_BYTES = 5 * 1024 * 1024 // what a user may pick, before cropping
export const AVATAR_UPLOAD_MAX_BYTES = 2 * 1024 * 1024 // the avatars bucket's own cap, checked after cropping
// Largest avatar on screen is 80 px; 256 px covers 3x displays at a quarter of 512's bytes.
export const AVATAR_OUTPUT_SIZE = 256

const ALLOWED_TYPES = AVATAR_ACCEPT.split(',')

/** A message for the first problem with the name (matches the database check: 1-60 characters), or null. */
export function validateDisplayName(value: string): string | null {
  const name = value.trim()
  if (!name) return 'Enter a display name.'
  if (name.length > DISPLAY_NAME_MAX) return `Keep it to ${DISPLAY_NAME_MAX} characters or fewer.`
  return null
}

/** Checks the file the user picked, before it is cropped. */
export function validateAvatarFile(file: { type: string; size: number }): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Choose a JPEG, PNG or WebP image.'
  if (file.size > AVATAR_INPUT_MAX_BYTES) return 'Image must be 5 MB or smaller.'
  return null
}

/** Checks the cropped result against the bucket's limit. */
export function validateAvatarBlob(blob: { size: number }): string | null {
  return blob.size > AVATAR_UPLOAD_MAX_BYTES ? 'That photo is too large after cropping. Try a different one.' : null
}
