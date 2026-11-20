/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    environment: 'jsdom',
    // Tests must never reach a real Supabase project, even though .env configures one for dev.
    // Blank credentials make lib/supabase.ts report "not configured", so data code falls back to demo/none.
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_ANON_KEY: '' },
    setupFiles: ['./src/test/setup.ts'],
  },
})
