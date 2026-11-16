import React, { useState } from 'react'
import { X, UserPlus, ShieldAlert, Lock } from 'lucide-react'
import { PlayerScore } from '../types/leaderboard'
import { useAuth } from '../context/AuthContext'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

interface AddPlayerModalProps {
  isOpen: boolean
  onClose: () => void
  onAddPlayer: (player: PlayerScore) => void
  onRequireAuth: () => void
}

export const AddPlayerModal: React.FC<AddPlayerModalProps> = ({
  isOpen,
  onClose,
  onAddPlayer,
  onRequireAuth,
}) => {
  const { isAdmin, user } = useAuth()
  const [name, setName] = useState('')
  const [weeksPlayed, setWeeksPlayed] = useState('1')
  const [totalPoints, setTotalPoints] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  // If user is not authenticated as admin, prompt them to sign in
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
        <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl relative text-center">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-red-950/60 border border-red-500/40 flex items-center justify-center text-red-500 mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>

          <h3 className="text-lg font-bold text-white mb-2">Administrator Access Required</h3>
          <p className="text-xs text-zinc-400 leading-relaxed mb-6">
            Only authenticated administrators can add new players or record scores to the Wendy Wednesdays season leaderboard.
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                onClose()
                onRequireAuth()
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-sm transition cursor-pointer shadow-lg shadow-red-600/30"
            >
              Sign In as Administrator
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 px-4 text-xs text-zinc-400 hover:text-white transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
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

    setLoading(true)
    setError('')

    try {
      if (isSupabaseConfigured) {
        const { data, error: supabaseError } = await supabase
          .from('players')
          .insert([
            {
              name: name.trim(),
              weeks_played: weeks,
              total_points: points,
            },
          ])
          .select()
          .single()

        if (supabaseError) {
          throw new Error(supabaseError.message)
        }

        if (data) {
          onAddPlayer({
            id: data.id,
            name: data.name,
            weeksPlayed: data.weeks_played,
            totalPoints: data.total_points,
          })
        }
      } else {
        onAddPlayer({
          id: Date.now().toString(),
          name: name.trim(),
          weeksPlayed: weeks,
          totalPoints: points,
        })
      }

      setName('')
      setWeeksPlayed('1')
      setTotalPoints('')
      setError('')
      onClose()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save player'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <UserPlus className="w-5 h-5 text-red-500" />
            <span>Add New Player</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Authenticated Admin Pill */}
        <div className="mt-3 px-3 py-1.5 rounded-lg bg-red-950/40 border border-red-500/30 text-[11px] text-red-300 flex items-center justify-between">
          <span className="font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block animate-pulse" />
            Authenticated as Admin
          </span>
          <span className="text-zinc-400 truncate max-w-[150px]">{user?.email}</span>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3 text-xs text-red-200 bg-red-950/60 border border-red-800/80 rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
              Player Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jordan Hayes"
              className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Weeks Played
              </label>
              <input
                type="number"
                min="1"
                max="52"
                value={weeksPlayed}
                onChange={(e) => setWeeksPlayed(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">
                Total Points
              </label>
              <input
                type="number"
                min="0"
                step="5"
                placeholder="e.g. 950"
                value={totalPoints}
                onChange={(e) => setTotalPoints(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-black border border-zinc-800 text-white placeholder-zinc-500 focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-900 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-bold text-white bg-red-600 hover:bg-red-500 rounded-xl transition cursor-pointer shadow-md shadow-red-600/30 disabled:opacity-50"
            >
              {loading ? 'Saving to Database...' : 'Add Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
