import React, { useEffect } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'

export interface SaveResult {
  status: 'success' | 'error'
  message: string
}

interface SaveResultModalProps {
  result: SaveResult | null
  weekNumber: number
  onClose: () => void
  onViewStandings: () => void
  onRetry: () => void
}

export const SaveResultModal: React.FC<SaveResultModalProps> = ({
  result,
  weekNumber,
  onClose,
  onViewStandings,
  onRetry,
}) => {
  useEffect(() => {
    if (!result) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [result, onClose])

  if (!result) return null
  const isSuccess = result.status === 'success'

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-md rounded-2xl bg-zinc-950 border p-6 shadow-2xl flex flex-col items-center gap-4 text-center ${
          isSuccess ? 'border-white/20' : 'border-red-700/80'
        }`}
      >
        {isSuccess ? (
          <CheckCircle2 className="w-12 h-12 text-red-500" />
        ) : (
          <AlertCircle className="w-12 h-12 text-red-400" />
        )}
        <h3 className="text-lg font-black text-white">
          {isSuccess ? `Week ${weekNumber} saved` : 'Save failed'}
        </h3>
        <p className={`text-sm ${isSuccess ? 'text-zinc-300' : 'text-red-200'}`}>
          {result.message}
        </p>
        <div className="flex w-full gap-2 pt-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white text-sm font-semibold cursor-pointer"
          >
            {isSuccess ? 'Stay Here' : 'Close'}
          </button>
          <button
            onClick={isSuccess ? onViewStandings : onRetry}
            className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-bold cursor-pointer"
          >
            {isSuccess ? 'View Standings' : 'Try Again'}
          </button>
        </div>
      </div>
    </div>
  )
}
