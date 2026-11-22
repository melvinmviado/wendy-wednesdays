import { Link } from 'react-router'
import { Database, LogIn } from 'lucide-react'
import { UserMenu } from '@/components/auth/UserMenu'
import { WebsiteLogo } from '@/components/WebsiteLogo'
import { btnBrand, btnQuiet } from '@/components/appStyles'

interface AppNavProps {
  isConfigured: boolean
  isSignedIn: boolean
  onOpenAuth: () => void
  onProfile: () => void
  onAdminDashboard: () => void
  onSignOut: () => void
}

/** The sticky top bar: logo, connection status, rules link and the account menu. */
export function AppNav({ isConfigured, isSignedIn, onOpenAuth, onProfile, onAdminDashboard, onSignOut }: AppNavProps) {
  return (
    <nav className="w-full border-b border-line bg-ground sticky top-0 z-30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-3 min-w-0">
          <WebsiteLogo size="sm" />
          <span className="font-bold text-ink hidden sm:inline">Wendy Wednesdays</span>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface border border-line text-ink-soft">
            <Database className={`w-3.5 h-3.5 ${isConfigured ? 'text-ok' : 'text-brand-hover'}`} aria-hidden="true" />
            <span role="status">{isConfigured ? 'Supabase Connected' : 'Demo Mode'}</span>
          </span>
          {!isConfigured && (
            <button
              onClick={onOpenAuth}
              className="hidden sm:inline-block text-brand-hover hover:text-ink underline underline-offset-2 cursor-pointer"
            >
              Connect Database
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link to="/rules" className={btnQuiet}>
            Rules
          </Link>
          {isSignedIn ? (
            <UserMenu onProfile={onProfile} onAdminDashboard={onAdminDashboard} onSignOut={onSignOut} />
          ) : (
            <button onClick={onOpenAuth} className={btnBrand}>
              <LogIn className="w-4 h-4" aria-hidden="true" />
              <span>Sign in</span>
            </button>
          )}
        </div>
      </div>
    </nav>
  )
}
