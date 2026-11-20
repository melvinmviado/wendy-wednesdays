import React from 'react'
import type { PlayerAdmin } from '../../hooks/usePlayerAdmin'
import { RenamePlayerModal } from './RenamePlayerModal'
import { ArchivePlayerDialog } from './ArchivePlayerDialog'
import { DeletePlayerDialog } from './DeletePlayerDialog'
import { SetRoleModal } from './SetRoleModal'
import type { useSetPlayerRole } from '../../hooks/useSetPlayerRole'

/** Renders whichever admin dialog is open. */
export const PlayerAdminDialogs: React.FC<{ admin: PlayerAdmin; roles: ReturnType<typeof useSetPlayerRole> }> = ({ admin, roles }) => {
  const { dialog, closeDialog } = admin
  if (!dialog) return null
  const { kind, player } = dialog
  const isArchived = Boolean(player.archivedAt)

  if (kind === 'role') {
    // Use the live row so a rename/delete elsewhere is reflected; a missing row closes the modal.
    const live = [...admin.activePlayers, ...admin.archived].find((p) => p.id === player.id)
    return (
      <SetRoleModal
        key={player.id}
        player={live ?? player}
        exists={Boolean(live)}
        saving={roles.saving}
        error={roles.error}
        onSave={(role) => roles.setRole(live ?? player, role)}
        onClose={() => {
          roles.reset()
          closeDialog()
        }}
      />
    )
  }
  if (kind === 'rename') {
    return (
      <RenamePlayerModal
        player={player}
        activePlayers={admin.activePlayers}
        onSubmit={(name) => admin.rename(player, name)}
        onClose={closeDialog}
      />
    )
  }
  if (kind === 'archive') {
    return <ArchivePlayerDialog player={player} onConfirm={() => admin.archive(player)} onClose={closeDialog} />
  }
  return (
    <DeletePlayerDialog
      player={player}
      onConfirm={() => admin.remove(player)}
      onArchiveInstead={isArchived ? undefined : () => admin.openDialog('archive', player)}
      onClose={closeDialog}
    />
  )
}
