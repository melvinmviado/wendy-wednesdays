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
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
        <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl relative text-center">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>

          <h3 className="text-lg font-bold text-white mb-2">Administrator Access Required</h3>
          <p className="text-xs text-slate-400 leading-relaxed mb-6">
            Only authenticated administrators can add new players or record scores to the Wendy Wednesdays season leaderboard.
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => {
                onClose()
                onRequireAuth()
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-95 text-slate-950 font-bold text-sm transition cursor-pointer shadow-lg shadow-cyan-500/20"
            >
              Sign In as Administrator
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 px-4 text-xs text-slate-400 hover:text-white transition"
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
        // Insert record directly into Supabase database table
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
        // Demo/fallback mode
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl relative">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-bold text-lg">
            <UserPlus className="w-5 h-5 text-cyan-400" />
            <span>Add New Player</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Authenticated Admin Pill */}
        <div className="mt-3 px-3 py-1.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center justify-between">
          <span className="font-semibold flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-pulse" />
            Authenticated as Admin
          </span>
          <span className="text-slate-400 truncate max-w-[150px]">{user?.email}</span>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3 text-xs text-rose-300 bg-rose-950/50 border border-rose-800/60 rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0" />
              <span>{error}</span>
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
              placeholder="e.g. Jordan Hayes"
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
                placeholder="e.g. 950"
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
              disabled={loading}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition cursor-pointer shadow-md shadow-cyan-500/20 disabled:opacity-50"
            >
              {loading ? 'Saving to Supabase...' : 'Add Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
