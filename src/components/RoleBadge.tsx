import React from 'react'
import { ClipboardList, Code, type LucideIcon } from 'lucide-react'
import { roleInfo, type PlayerRole } from '../types/roles'

// Record<PlayerRole, …> makes the compiler flag a new role that has no icon yet.
const ICONS: Record<PlayerRole, LucideIcon> = {
  developer: Code,
  organizer: ClipboardList,
}

interface RoleBadgeProps {
  role: PlayerRole
  /** Show the role's icon before the label. Default true. */
  icon?: boolean
}

/** Cosmetic role pill. Carries no permissions. Screen readers hear "Role: Developer". */
export const RoleBadge: React.FC<RoleBadgeProps> = ({ role, icon = true }) => {
  const { label, badge } = roleInfo(role)
  const Icon = ICONS[role]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${badge}`}>
      {icon && <Icon className="h-3 w-3" aria-hidden="true" />}
      <span className="sr-only">Role: </span>
      {label}
    </span>
  )
}

/** Inline, wrapping group of role pills. Renders nothing at all when there are none. */
export const RoleBadges: React.FC<{ roles: readonly PlayerRole[]; icon?: boolean; className?: string }> = ({
  roles,
  icon,
  className = '',
}) => {
  if (roles.length === 0) return null
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {roles.map((r) => (
        <RoleBadge key={r} role={r} icon={icon} />
      ))}
    </span>
  )
}
