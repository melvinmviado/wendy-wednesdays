import type { GenerateSummary } from '@/lib/courtSettings'

// Words for court assignment events: the toast after generating, and the Activity drawer's lines.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** "Board generated: 4 courts, 2 sitting out. Saved as a draft for you to review." */
export function describeGenerated(s: GenerateSummary): string {
  const courts = plural(s.courts, 'court', 'courts') + (s.sittingOut ? `, ${s.sittingOut} sitting out` : '')
  const state = s.state === 'published' ? 'Published: players can see it now.' : 'Saved as a draft for you to review.'
  const guests = s.convertedGuests ? ` ${plural(s.convertedGuests, 'guest was', 'guests were')} added to the roster.` : ''
  return `Board ${s.action === 'regenerate' ? 'regenerated' : 'generated'}: ${courts}. ${state}${guests}`
}

export type AuditAction = 'generate' | 'regenerate' | 'swap' | 'move' | 'publish' | 'unpublish'

/** A player's place as the database logs it (court_assignment_place); null = not on the board. */
interface Place {
  name?: string
  status?: 'assigned' | 'sitting_out'
  court_number?: number | null
}

const isPlace = (v: unknown): v is Place => typeof v === 'object' && v !== null && !Array.isArray(v)
const asPlace = (v: unknown): Place | null => (isPlace(v) && typeof v.name === 'string' ? v : null)
const where = (p: Place) => (p.status === 'sitting_out' ? 'sitting out' : `court ${p.court_number ?? '?'}`)
const field = (v: unknown, key: string): unknown => (isPlace(v) ? (v as Record<string, unknown>)[key] : undefined)

/** One line of the Activity drawer, from an assignment_audit_log row. */
export function describeActivity(action: AuditAction, before: unknown, after: unknown): string {
  switch (action) {
    case 'generate':
      return 'Generated the board'
    case 'regenerate':
      return field(after, 'forced') === true ? 'Regenerated the board, replacing hand edits' : 'Regenerated the board'
    case 'publish':
      return field(after, 'auto_publish') === true ? 'Published automatically' : 'Published'
    case 'unpublish':
      return 'Unpublished'
    case 'swap': {
      const [a, b] = Array.isArray(before) ? before.map(asPlace) : []
      return a && b ? `Swapped ${a.name} (${where(a)}) and ${b.name} (${where(b)})` : 'Swapped two players'
    }
    case 'move': {
      const from = asPlace(before)
      const to = asPlace(after)
      if (from && to) return `Moved ${to.name} from ${where(from)} to ${where(to)}`
      if (to) return `Added ${to.name} to ${where(to)}`
      if (from) return `Took ${from.name} off the board`
      return 'Moved a player'
    }
  }
}
