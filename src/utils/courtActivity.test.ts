import { describe, expect, it } from 'vitest'
import { describeActivity } from './courtActivity'

const seat = (name: string, court: number) => ({ player_id: 'x', name, status: 'assigned', court_number: court, slot: 0 })
const out = (name: string) => ({ player_id: 'x', name, status: 'sitting_out', court_number: null, slot: null })

describe('describeActivity', () => {
  it('describes generation and publishing', () => {
    expect(describeActivity('generate', null, { state: 'draft' })).toBe('Generated the board')
    expect(describeActivity('regenerate', {}, { forced: true })).toBe('Regenerated the board, replacing hand edits')
    expect(describeActivity('regenerate', {}, { forced: false })).toBe('Regenerated the board')
    expect(describeActivity('publish', {}, { state: 'published', auto_publish: true })).toBe('Published automatically')
    expect(describeActivity('publish', {}, { state: 'published' })).toBe('Published')
    expect(describeActivity('unpublish', {}, {})).toBe('Unpublished')
  })

  it('describes swaps and moves from the logged places', () => {
    expect(describeActivity('swap', [seat('Sam', 10), out('Alex')], [out('Sam'), seat('Alex', 10)]))
      .toBe('Swapped Sam (court 10) and Alex (sitting out)')
    expect(describeActivity('move', seat('Sam', 10), seat('Sam', 9))).toBe('Moved Sam from court 10 to court 9')
    expect(describeActivity('move', null, seat('Nina', 9))).toBe('Added Nina to court 9')
    expect(describeActivity('move', out('Nina'), null)).toBe('Took Nina off the board')
  })

  it('still says something when a log row is not shaped as expected', () => {
    expect(describeActivity('swap', 'odd', null)).toBe('Swapped two players')
    expect(describeActivity('move', null, null)).toBe('Moved a player')
  })
})
