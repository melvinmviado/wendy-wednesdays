import React from 'react'
import type { PlayerAdmin } from '../../hooks/usePlayerAdmin'
import { RenamePlayerModal } from './RenamePlayerModal'
import { ArchivePlayerDialog } from './ArchivePlayerDialog'
import { DeletePlayerDialog } from './DeletePlayerDialog'

/** Renders whichever admin dialog is open. */
export const PlayerAdminDialogs: React.FC<{ admin: PlayerAdmin }> = ({ admin }) => {
  const { dialog, closeDialog } = admin
  if (!dialog) return null
  const { kind, player } = dialog
  const isArchived = Boolean(player.archivedAt)

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
