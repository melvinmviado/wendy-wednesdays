import React, { useState } from 'react'

interface WebsiteLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  alt?: string
}

const SIZE_MAP = {
  sm: 'w-7 h-7',
  md: 'w-10 h-10',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24 sm:w-28 sm:h-28',
}

// Possible image files to try in public/logo/
const LOGO_CANDIDATES = [
  '/logo/logo.png',
  '/logo/logo.jpg',
  '/logo/logo.jpeg',
  '/logo/logo.webp',
  '/logo/logo.svg',
]

export const WebsiteLogo: React.FC<WebsiteLogoProps> = ({
  size = 'md',
  className = '',
  alt = 'Wendy Wednesdays Logo',
}) => {
  const [candidateIndex, setCandidateIndex] = useState(0)
  const [hasFailedAll, setHasFailedAll] = useState(false)

  const handleImageError = () => {
    if (candidateIndex < LOGO_CANDIDATES.length - 1) {
      setCandidateIndex((prev) => prev + 1)
    } else {
      setHasFailedAll(true)
    }
  }

  const dimensionClass = SIZE_MAP[size]

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 rounded-full overflow-hidden select-none bg-black border border-white/20 shadow-xl shadow-red-950/30 ring-2 ring-red-600/60 ${dimensionClass} ${className}`}
    >
      {!hasFailedAll ? (
        <img
          src={LOGO_CANDIDATES[candidateIndex]}
          alt={alt}
          onError={handleImageError}
          className="w-full h-full object-cover rounded-full"
          loading="eager"
        />
      ) : (
        /* Fallback stylized monogram circle in black, red & white */
        <div className="w-full h-full rounded-full bg-gradient-to-br from-red-600 via-red-800 to-black flex items-center justify-center text-white font-black tracking-tighter border border-white/30">
          <span className={size === 'sm' ? 'text-[10px]' : size === 'md' ? 'text-xs' : 'text-lg'}>
            WW
          </span>
        </div>
      )}
    </div>
  )
}
