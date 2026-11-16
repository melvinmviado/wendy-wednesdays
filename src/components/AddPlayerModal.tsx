import React, { useState } from 'react'
import { X, UserPlus } from 'lucide-react'
import { PlayerScore } from '../types/leaderboard'

interface AddPlayerModalProps {
  isOpen: boolean
  onClose: () => void
  onAddPlayer: (player: Omit<PlayerScore, 'id'>) => void
}

export const AddPlayerModal: React.FC<AddPlayerModalProps> = ({
  isOpen,
  onClose,
  onAddPlayer,
}) => {
  const [name, setName] = useState('')
  const [weeksPlayed, setWeeksPlayed] = useState('1')
  const [totalPoints, setTotalPoints] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Player name is required')
      return
    }

    const weeks = parseInt(weeksPlayed, 10)
    const points = parseInt(totalPoints, 10)

    if (isNaN(weeks) || weeks < 1) {
      setError('Weeks played must be at least 1')
      return
    }

    if (isNaN(points) || points < 0) {
      setError('Total points must be 0 or higher')
      return
    }

    onAddPlayer({
      name: name.trim(),
      weeksPlayed: weeks,
      totalPoints: points,
    })

    setName('')
    setWeeksPlayed('1')
    setTotalPoints('')
    setError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <UserPlus className="w-5 h-5 text-cyan-400" />
            <span>Add / Record Player</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3 text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Player Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Weeks Played
              </label>
              <input
                type="number"
                min="1"
                max="52"
                value={weeksPlayed}
                onChange={(e) => setWeeksPlayed(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Total Points
              </label>
              <input
                type="number"
                min="0"
                step="5"
                placeholder="e.g. 850"
                value={totalPoints}
                onChange={(e) => setTotalPoints(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition cursor-pointer shadow-md shadow-cyan-500/20"
            >
              Add Player
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
