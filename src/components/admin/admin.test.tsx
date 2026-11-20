import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { PlayerScore } from '../../types/leaderboard'

vi.mock('../../data/players', () => ({
  getPlayerScoreCount: vi.fn(async () => ({ ok: true, data: 3 })),
}))

import { RenamePlayerModal } from './RenamePlayerModal'
import { DeletePlayerDialog } from './DeletePlayerDialog'
import { PlayerActionsMenu } from './PlayerActionsMenu'
import { SetRoleModal } from './SetRoleModal'
import { RoleBadges } from '../RoleBadge'

const ann: PlayerScore = { id: '1', name: 'Ann', weeksPlayed: 3, totalPoints: 60 }
const bob: PlayerScore = { id: '2', name: 'Bob', weeksPlayed: 1, totalPoints: 10 }

describe('RenamePlayerModal', () => {
  it('shows a validation error for a duplicate and does not submit', async () => {
    const onSubmit = vi.fn()
    render(<RenamePlayerModal player={ann} activePlayers={[ann, bob]} onSubmit={onSubmit} onClose={() => {}} />)
    const input = screen.getByLabelText('Name')
    await userEvent.clear(input)
    await userEvent.type(input, 'bob{Enter}')
    expect(screen.getByRole('alert')).toHaveTextContent(/already exists/)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the trimmed name on Enter and closes on success', async () => {
    const onSubmit = vi.fn(async (name: string) => ({ ok: true as const, data: { ...ann, name } }))
    const onClose = vi.fn()
    render(<RenamePlayerModal player={ann} activePlayers={[ann, bob]} onSubmit={onSubmit} onClose={onClose} />)
    const input = screen.getByLabelText('Name')
    await userEvent.clear(input)
    await userEvent.type(input, '  Anna {Enter}')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onSubmit).toHaveBeenCalledWith('Anna')
  })

  it('keeps the modal open and shows the server error on failure', async () => {
    const onSubmit = vi.fn(async () => ({
      ok: false as const,
      error: { code: 'DUPLICATE_NAME' as const, message: 'Another active player already has that name.' },
    }))
    const onClose = vi.fn()
    render(<RenamePlayerModal player={ann} activePlayers={[ann]} onSubmit={onSubmit} onClose={onClose} />)
    const input = screen.getByLabelText('Name')
    await userEvent.clear(input)
    await userEvent.type(input, 'Anna{Enter}')
    expect(await screen.findByRole('alert')).toHaveTextContent(/already has that name/)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<RenamePlayerModal player={ann} activePlayers={[ann]} onSubmit={vi.fn()} onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })
})

describe('DeletePlayerDialog', () => {
  it('requires typing the exact name and explains the history', async () => {
    const onConfirm = vi.fn(async () => true)
    const onArchiveInstead = vi.fn()
    render(<DeletePlayerDialog player={ann} onConfirm={onConfirm} onArchiveInstead={onArchiveInstead} onClose={() => {}} />)

    expect(await screen.findByText(/3 recorded weeks/)).toBeInTheDocument()
    const del = screen.getByRole('button', { name: /delete permanently/i })
    expect(del).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/type/i), 'ann')
    expect(del).toBeDisabled() // wrong case

    await userEvent.clear(screen.getByLabelText(/type/i))
    await userEvent.type(screen.getByLabelText(/type/i), 'Ann')
    expect(del).toBeEnabled()
    await userEvent.click(screen.getByRole('button', { name: /archive instead/i }))
    expect(onArchiveInstead).toHaveBeenCalled()
    expect(onConfirm).not.toHaveBeenCalled()

    await userEvent.click(del)
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})

describe('PlayerActionsMenu', () => {
  it('opens a menu, runs the chosen action, and closes on Escape', async () => {
    const onRename = vi.fn()
    render(<PlayerActionsMenu playerName="Ann" onRename={onRename} onSetRole={() => {}} onArchive={() => {}} onDelete={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'Actions for Ann' })
    await userEvent.click(trigger)
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent?.trim())).toEqual(['Rename', 'Set role', 'Archive', 'Delete'])

    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()

    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole('menuitem', { name: /rename/i }))
    expect(onRename).toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})

describe('PlayerActionsMenu for an archived player', () => {
  it('offers Restore instead of Archive, and keeps Delete below a divider', async () => {
    const onRestore = vi.fn()
    render(<PlayerActionsMenu playerName="Bo" onRename={() => {}} onSetRole={() => {}} onArchive={() => {}} onRestore={onRestore} onDelete={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Actions for Bo' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent?.trim())).toEqual(['Rename', 'Set role', 'Restore', 'Delete'])
    const menu = screen.getByRole('menu')
    expect(menu.querySelector('[role="separator"]')?.nextElementSibling).toHaveTextContent('Delete')
    await userEvent.click(screen.getByRole('menuitem', { name: /restore/i }))
    expect(onRestore).toHaveBeenCalled()
  })
})

describe('SetRoleModal', () => {
  const player = { id: 'p1', name: 'Ann', weeksPlayed: 0, totalPoints: 0, role: null }
  const base = { player, exists: true, saving: false, error: null, onClose: () => {} }

  it('disables Save until the role changes, then saves the pick', async () => {
    const onSave = vi.fn().mockResolvedValue(true)
    const onClose = vi.fn()
    render(<SetRoleModal {...base} onSave={onSave} onClose={onClose} />)
    expect(screen.getByRole('dialog', { name: 'Set role for Ann' })).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    await userEvent.click(screen.getByRole('radio', { name: 'Organizer' }))
    await userEvent.click(save)
    expect(onSave).toHaveBeenCalledWith('organizer')
    expect(onClose).toHaveBeenCalled()
  })

  it('keeps the modal open and shows the error when saving fails', async () => {
    const onClose = vi.fn()
    render(<SetRoleModal {...base} error="Only admins can assign player roles" onSave={async () => false} onClose={onClose} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Only admins can assign player roles')
    await userEvent.click(screen.getByRole('radio', { name: 'Developer' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes itself if the player no longer exists', () => {
    const onClose = vi.fn()
    render(<SetRoleModal {...base} exists={false} onSave={async () => true} onClose={onClose} />)
    expect(onClose).toHaveBeenCalled()
  })
})

describe('RoleBadges', () => {
  it('announces the role and renders nothing when empty', () => {
    const { container, rerender } = render(<RoleBadges roles={[]} />)
    expect(container).toBeEmptyDOMElement()
    rerender(<RoleBadges roles={['developer']} />)
    expect(screen.getByText('Role:')).toHaveClass('sr-only')
    expect(container).toHaveTextContent('Role: Developer')
    rerender(<RoleBadges roles={['developer', 'organizer']} />)
    expect(container).toHaveTextContent('Role: DeveloperRole: Organizer')
  })
})
