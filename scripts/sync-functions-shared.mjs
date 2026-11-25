// Copies code the Edge Functions share with the app into supabase/functions/_shared, where a
// deployed function can import it. A copy rather than a symlink: Git for Windows checks symlinks
// out as plain text files by default, and the copy is what `supabase functions deploy` bundles.
//
//   npm run sync:functions             write the copies
//   npm run sync:functions -- --check  exit 1 if a copy is out of date (src/lib/courtAssignment.sync.test.ts
//                                      checks the same thing on every `npm test`)
//
// Only import-free modules belong here: Deno needs explicit file extensions, the app does not.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SHARED = [['src/lib/courtAssignment.ts', 'supabase/functions/_shared/courtAssignment.ts']]

const header = (source) =>
  `// GENERATED from ${source} by scripts/sync-functions-shared.mjs. Do not edit this copy:\n` +
  `// edit the source, then run \`npm run sync:functions\`.\n\n`

const check = process.argv.includes('--check')
let stale = 0
for (const [source, target] of SHARED) {
  const want = header(source) + readFileSync(path.join(root, source), 'utf8').replace(/\r\n/g, '\n')
  let have = null
  try {
    have = readFileSync(path.join(root, target), 'utf8').replace(/\r\n/g, '\n')
  } catch {
    // missing: written below, or reported as stale with --check
  }
  if (have === want) continue
  if (check) {
    console.error(`Out of date: ${target} (run npm run sync:functions)`)
    stale++
  } else {
    writeFileSync(path.join(root, target), want)
    console.log(`Wrote ${target}`)
  }
}
process.exit(stale ? 1 : 0)
