import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The Edge Function imports a generated copy of courtAssignment.ts (scripts/sync-functions-shared.mjs).
// If this fails, the copy is stale: run `npm run sync:functions` and commit both files.
const read = (relative: string) =>
  readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8').replace(/\r\n/g, '\n')

describe('supabase/functions/_shared/courtAssignment.ts', () => {
  it('is an up-to-date copy of src/lib/courtAssignment.ts (run `npm run sync:functions`)', () => {
    const source = read('./courtAssignment.ts')
    const copy = read('../../supabase/functions/_shared/courtAssignment.ts')
    expect(copy.startsWith('// GENERATED from src/lib/courtAssignment.ts')).toBe(true)
    expect(copy.endsWith(source)).toBe(true)
  })
})
