import { Link } from 'react-router'
import { useAdminContext } from './adminContext'
import { ADMIN_TASKS } from './adminTasks'
import { useAdminBadges } from './useAdminBadges'

/** Compact hub: one card per admin group, each linking to its page. Driven by ADMIN_TASKS. */
export function AdminDashboard() {
  const { claimQueue } = useAdminContext()
  const badges = useAdminBadges(claimQueue)

  return (
    <ul className="grid grid-cols-1 gap-3">
      {ADMIN_TASKS.map(({ id, title, description, path, icon: Icon }) => (
        <li key={id}>
          <Link
            to={path}
            className="flex h-full min-h-11 items-start gap-3 rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-hover"
          >
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">{title}</span>
              <span className="mt-1 block text-sm text-ink-soft">{description}</span>
            </span>
            {badges[id] && <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-brand-ink">{badges[id]}</span>}
          </Link>
        </li>
      ))}
    </ul>
  )
}
