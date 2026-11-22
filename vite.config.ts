/// <reference types="vitest/config" />
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Production builds only:
 *  - Refuse to build without real Supabase credentials. Otherwise the site silently ships in demo
 *    mode, where any 6-character password signs in as a demo admin. Set ALLOW_DEMO_BUILD=1 to
 *    build the demo on purpose.
 *  - Fill this project's Supabase origin into the Content-Security-Policy in dist/_headers
 *    (public/_headers holds %SUPABASE_ORIGIN% / %SUPABASE_WS_ORIGIN% placeholders), so the CSP
 *    pins API calls and images to this project without hard-coding it in the repo.
 */
function supabaseBuildGuard(): Plugin {
  let outDir = 'dist'
  let origin = ''
  return {
    name: 'wendy-supabase-build-guard',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
      const env = loadEnv(config.mode, config.envDir || config.root, '')
      const url = env.VITE_SUPABASE_URL ?? ''
      const key = env.VITE_SUPABASE_ANON_KEY ?? ''
      const configured = url && key && !url.includes('your-project-id') && !key.includes('your-anon-public-key')
      if (configured) {
        origin = new URL(url).origin
      } else if (!env.ALLOW_DEMO_BUILD) {
        throw new Error(
          'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set, so this build would run in demo mode. ' +
            'Set them (Cloudflare Pages: Settings > Environment variables, for Production AND Preview), ' +
            'or set ALLOW_DEMO_BUILD=1 to build the demo on purpose.'
        )
      }
    },
    closeBundle() {
      const file = path.join(outDir, '_headers')
      if (!existsSync(file)) return
      const wsOrigin = origin.replace(/^http/, 'ws')
      const text = readFileSync(file, 'utf8')
        .replaceAll('%SUPABASE_WS_ORIGIN%', wsOrigin)
        .replaceAll('%SUPABASE_ORIGIN%', origin)
      writeFileSync(file, text)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    supabaseBuildGuard(),
  ],
  resolve: {
    // "@/x" imports "src/x" (CLAUDE.md convention; tsconfig.app.json has the matching paths entry)
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      output: {
        // Libraries change far less often than the app: in their own chunks, a deploy that only
        // touches app code doesn't make every visitor download React and Supabase again.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (/node_modules[\\/](react|react-dom|scheduler|react-router)[\\/]/.test(id)) return 'vendor-react'
          if (/node_modules[\\/]@supabase[\\/]/.test(id)) return 'vendor-supabase'
          return undefined
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    // Tests must never reach a real Supabase project, even though .env configures one for dev.
    // Blank credentials make lib/supabase.ts report "not configured", so data code falls back to demo/none.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    setupFiles: ['./src/test/setup.ts'],
  },
})
