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
  const { isAdmin, isSignedIn, user } = useAuth()
  const [name, setName] = useState('')
  const [weeksPlayed, setWeeksPlayed] = useState('1')
  const [totalPoints, setTotalPoints] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  // If user is not authenticated as admin, prompt them to sign in
  if (!isAdmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ground/90">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 relative text-center">
          <button
            onClick={onClose}
            className="absolute right-4 top-4 p-1.5 rounded-lg text-ink-soft hover:text-ink hover:bg-raised transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-brand-soft border border-brand flex items-center justify-center text-brand-hover mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>

          <h3 className="text-lg font-bold text-ink mb-2">
            {isSignedIn ? 'Administrator Access Required' : 'Sign In Required'}
          </h3>
          <p className="text-sm text-ink-soft leading-relaxed mb-6">
            {isSignedIn
              ? "Your account doesn't have admin permissions, so it can't add players or record scores."
              : 'Only administrators can add new players or record scores. Sign in with an admin account to continue.'}
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              hidden={isSignedIn}
              onClick={() => {
                onClose()
                onRequireAuth()
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-brand hover:bg-brand-hover motion-safe:active:scale-[0.97] text-ink font-bold text-sm transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={onClose}
              className="w-full py-2 px-4 text-sm text-ink-soft hover:text-ink transition-colors cursor-pointer"
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ground/90">
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 relative">
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div className="flex items-center gap-2 text-ink font-bold text-lg">
            <UserPlus className="w-5 h-5 text-brand-hover" />
            <span>Add New Player</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-ink-soft hover:text-ink hover:bg-raised transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Authenticated Admin Pill */}
        <div className="mt-3 px-3 py-1.5 rounded-lg bg-brand-soft border border-brand text-sm text-ink flex items-center justify-between">
          <span className="font-semibold flex items-center gap-1.5">
            Authenticated as Admin
          </span>
          <span className="text-ink-soft truncate max-w-[150px]">{user?.email}</span>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {error && (
            <div className="p-3 text-sm text-ink bg-brand-soft border border-brand rounded-xl flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 text-brand-hover" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-ink-soft mb-1.5">
              Player Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Jordan Hayes"
              className="w-full px-3.5 py-2.5 rounded-xl bg-ground border border-line text-ink placeholder:text-muted text-sm"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-ink-soft mb-1.5">
                Weeks Played
              </label>
              <input
                type="number"
                min="1"
                max="52"
                value={weeksPlayed}
                onChange={(e) => setWeeksPlayed(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-ground border border-line text-ink placeholder:text-muted text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-ink-soft mb-1.5">
                Total Points
              </label>
              <input
                type="number"
                min="0"
                step="5"
                placeholder="e.g. 950"
                value={totalPoints}
                onChange={(e) => setTotalPoints(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-ground border border-line text-ink placeholder:text-muted text-sm"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm text-ink-soft hover:text-ink rounded-xl hover:bg-raised transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 text-sm font-bold text-ink bg-brand hover:bg-brand-hover rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Saving to Database...' : 'Add Player'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
