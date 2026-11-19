import React, { useState } from 'react'

interface AvatarProps {
  /** Display name or email, used for the initials fallback. */
  name: string
  avatarUrl?: string | null
  /** Width and height in px. Fixed on the wrapper and the image so nothing shifts while it loads. */
  size?: number
  /** Load immediately instead of lazily. Use for avatars that are on screen as soon as the page is. */
  eager?: boolean
  /** Replaces the default look of the initials circle (background, border, text colour). */
  fallbackClassName?: string
}

const DEFAULT_FALLBACK = 'bg-brand-soft border border-brand text-ink'

/** Up to two initials: "Ada Lovelace" -> "AL", "ada@x.com" -> "A". */
export function initialsOf(name: string): string {
  const words = name.split(/[\s@._-]+/).filter(Boolean)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0]?.slice(0, 1) ?? '?')
  return letters.toUpperCase()
}

/** A round photo, or initials when there is no photo or it fails to load. Decorative: the name is always shown next to it. */
export const Avatar: React.FC<AvatarProps> = ({ name, avatarUrl, size = 32, eager = false, fallbackClassName }) => {
  // Remember which URL failed, so a new URL (a re-uploaded photo) gets a fresh attempt.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const showImage = Boolean(avatarUrl) && failedUrl !== avatarUrl
  const box = { width: size, height: size }

  return (
    <span aria-hidden="true" style={box} className="inline-flex shrink-0 select-none">
      {showImage ? (
        <img
          src={avatarUrl!}
          alt=""
          width={size}
          height={size}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onError={() => setFailedUrl(avatarUrl!)}
          style={box}
          className="rounded-full object-cover border border-line bg-surface"
        />
      ) : (
        <span
          style={{ ...box, fontSize: Math.max(10, Math.round(size * 0.38)) }}
          className={`rounded-full inline-flex items-center justify-center font-bold ${fallbackClassName ?? DEFAULT_FALLBACK}`}
        >
          {initialsOf(name)}
        </span>
      )}
    </span>
  )
}
