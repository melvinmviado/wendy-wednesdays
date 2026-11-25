import React, { useMemo } from 'react'
import { encodeQr } from '@/lib/qr'

interface QrCodeProps {
  text: string
  /** Rendered width and height in CSS pixels. */
  size?: number
  label: string
}

const QUIET_ZONE = 4 // modules of white around the code, as the standard asks

/** A QR code as one SVG path: black on white whatever the page theme, so phones can read it. */
export const QrCode: React.FC<QrCodeProps> = ({ text, size = 192, label }) => {
  const matrix = useMemo(() => {
    try {
      return encodeQr(text)
    } catch {
      return null // too long for this encoder: the link is still shown beside it
    }
  }, [text])
  if (!matrix) return null

  const dim = matrix.size + QUIET_ZONE * 2
  let d = ''
  matrix.modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`
    }),
  )
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${dim} ${dim}`} width={size} height={size} shapeRendering="crispEdges">
      <rect width={dim} height={dim} fill="#fff" />
      <path d={d} fill="#000" />
    </svg>
  )
}
