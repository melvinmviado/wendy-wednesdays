import React, { useState } from 'react'
import { ClipboardList, Printer, QrCode as QrIcon, Tv } from 'lucide-react'
import { CopyLinkButton } from '../CopyLinkButton'
import { QrCode } from '../QrCode'

const quiet =
  'inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover'

/** Copy link, copy as text (for the group chat), a QR code to this page, TV mode and print. */
export const ShareTools: React.FC<{ url: string; text: string; tvHref: string }> = ({ url, text, tvHref }) => {
  const [qr, setQr] = useState(false)
  return (
    <section aria-labelledby="share-heading" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 print:hidden">
      <h2 id="share-heading" className="text-base font-bold text-ink">Share the courts</h2>
      <div className="flex flex-wrap gap-2">
        <CopyLinkButton url={url} label="Copy link" />
        <CopyLinkButton url={text} label="Copy as text" copiedLabel="Courts copied" icon={ClipboardList} />
        <button type="button" onClick={() => setQr((v) => !v)} aria-expanded={qr} className={quiet}>
          <QrIcon className="h-4 w-4" aria-hidden="true" /> {qr ? 'Hide QR code' : 'QR code'}
        </button>
        <a href={tvHref} className={quiet}>
          <Tv className="h-4 w-4" aria-hidden="true" /> TV mode
        </a>
        <button type="button" onClick={() => window.print()} className={quiet}>
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </button>
      </div>
      {qr && (
        <figure className="flex flex-col items-center gap-2 self-start">
          <QrCode text={url} label="QR code: scan to open the courts on your phone" />
          <figcaption className="max-w-48 text-center text-xs text-ink-soft [overflow-wrap:anywhere]">{url}</figcaption>
        </figure>
      )}
    </section>
  )
}
