import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { BoardMeta, CourtSettings, GenerateSummary } from '@/lib/courtSettings'
import { CourtRangeForm } from './CourtRangeForm'
import { describeGenerated } from '@/utils/courtActivity'
import { GenerateBoardSection } from './GenerateBoardSection'

const saved: CourtSettings = { sessionDate: '2026-11-25', top: 10, bottom: 7, autoPublish: false }

describe('CourtRangeForm', () => {
  const setup = (settings: CourtSettings | null = saved, inherited = false) => {
    const save = vi.fn(async (input: Omit<CourtSettings, 'sessionDate'>) => ({ ok: true as const, data: { ...saved, ...input } }))
    const toast = vi.fn()
    render(<CourtRangeForm settings={settings} inherited={inherited} save={save} toast={toast} />)
    return { save, toast, user: userEvent.setup() }
  }

  it('previews the saved courts top to bottom', () => {
    setup()
    expect(screen.getByRole('status')).toHaveTextContent('4 courts: 10, 9, 8, 7 (top → bottom)')
    expect(screen.getByRole('button', { name: 'Save courts' })).toBeDisabled() // nothing changed
  })

  it('updates the preview live, in either direction', async () => {
    const { user } = setup()
    await user.clear(screen.getByLabelText('Bottom court number'))
    await user.type(screen.getByLabelText('Bottom court number'), '12')
    expect(screen.getByRole('status')).toHaveTextContent('3 courts: 10, 11, 12 (top → bottom)')
  })

  it('shows an inline error and does not save an invalid court', async () => {
    const { save, user } = setup(null)
    await user.type(screen.getByLabelText('Top court number'), '0')
    await user.type(screen.getByLabelText('Bottom court number'), '4')
    await user.click(screen.getByRole('button', { name: 'Save courts' }))
    expect(screen.getByText('Enter a court number of 1 or more.')).toBeInTheDocument()
    expect(screen.getByLabelText('Top court number')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('status')).toHaveTextContent('Enter both court numbers to see the courts.')
    expect(save).not.toHaveBeenCalled()
  })

  it('saves the numbers and auto-publish, then confirms with a toast', async () => {
    const { save, toast, user } = setup()
    await user.clear(screen.getByLabelText('Top court number'))
    await user.type(screen.getByLabelText('Top court number'), '4')
    await user.click(screen.getByRole('checkbox', { name: /Auto-publish on generate/ }))
    await user.click(screen.getByRole('button', { name: 'Save courts' }))
    expect(save).toHaveBeenCalledWith({ top: 4, bottom: 7, autoPublish: true })
    expect(toast).toHaveBeenCalledWith('success', 'Court settings saved.')
  })

  it('says where carried-forward settings come from', () => {
    setup({ ...saved, sessionDate: '2026-11-18' }, true)
    expect(screen.getByText(/These are from Wed, Nov 18/)).toBeInTheDocument()
  })
})

describe('GenerateBoardSection', () => {
  // Cutoff Wed Nov 25, 6 PM EST (23:00 UTC).
  const lockAt = new Date('2026-11-25T23:00:00Z')
  const afterLock = new Date('2026-11-25T23:30:00Z')
  const done: GenerateSummary = { skipped: false, action: 'generate', state: 'draft', courts: 4, sittingOut: 2, convertedGuests: 1 }
  const draft: BoardMeta = { state: 'draft', generatedAt: '2026-11-25T23:05:00Z', publishedAt: null, manuallyEdited: false }

  const setup = (o: { meta?: BoardMeta | null; now?: Date; hasRange?: boolean; databaseReady?: boolean } = {}) => {
    const generate = vi.fn(async () => ({ ok: true as const, data: done }))
    const toast = vi.fn()
    render(
      <GenerateBoardSection
        meta={o.meta ?? null}
        hasRange={o.hasRange ?? true}
        autoPublish={false}
        lockAt={lockAt}
        now={o.now ?? afterLock}
        timeZone="America/Toronto"
        databaseReady={o.databaseReady ?? true}
        generate={generate}
        toast={toast}
      />,
    )
    return { generate, toast, user: userEvent.setup() }
  }

  it('generates at once when there is no board, and reports the result', async () => {
    const { generate, toast, user } = setup()
    expect(screen.getByText('No board for this run yet.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Generate now' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(generate).toHaveBeenCalledWith(false)
    expect(toast).toHaveBeenCalledWith('success', describeGenerated(done))
  })

  it('asks before replacing a board, and can be cancelled', async () => {
    const { generate, user } = setup({ meta: draft })
    expect(screen.getByText('Draft generated Wed, Nov 25, 6:05 PM EST. Only admins can see it.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Generate now' }))
    expect(screen.getByRole('dialog', { name: 'Replace the current board?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Keep current board' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(generate).not.toHaveBeenCalled()
  })

  it('forces the regeneration of a board changed by hand, after warning about it', async () => {
    const { generate, user } = setup({ meta: { ...draft, state: 'published', publishedAt: '2026-11-25T23:10:00Z', manuallyEdited: true } })
    await user.click(screen.getByRole('button', { name: 'Generate now' }))
    expect(screen.getByText('It was changed by hand, and those changes will be lost.')).toBeInTheDocument()
    expect(screen.getByText(/players stop seeing courts until it is published again/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Replace board' }))
    expect(generate).toHaveBeenCalledWith(true)
  })

  it('is disabled before the cutoff, and says when it opens', () => {
    setup({ now: new Date('2026-11-25T20:00:00Z') })
    expect(screen.getByRole('button', { name: 'Generate now' })).toBeDisabled()
    expect(screen.getByText(/RSVPs close Wed, Nov 25, 6:00 PM EST/)).toBeInTheDocument()
  })

  it('is disabled without a court range or a database', () => {
    setup({ hasRange: false })
    expect(screen.getByText('Save the court numbers first.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate now' })).toBeDisabled()
  })

  it('shows a refusal from the server as an error toast', async () => {
    const { generate, toast, user } = setup()
    generate.mockResolvedValueOnce({ ok: false, error: { code: 'CA010', message: 'The guest "Sam" has the same name as a player on the roster.' } } as never)
    await user.click(screen.getByRole('button', { name: 'Generate now' }))
    expect(toast).toHaveBeenCalledWith('error', 'The guest "Sam" has the same name as a player on the roster.')
  })

  it('describes the result in words', () => {
    expect(describeGenerated(done)).toBe('Board generated: 4 courts, 2 sitting out. Saved as a draft for you to review. 1 guest was added to the roster.')
    expect(describeGenerated({ ...done, action: 'regenerate', state: 'published', courts: 1, sittingOut: 0, convertedGuests: 0 }))
      .toBe('Board regenerated: 1 court. Published: players can see it now.')
  })
})
