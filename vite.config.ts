import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE ?? '/',
  // OneDrive can lock Vite's temporary dependency folders during cache swaps.
  cacheDir: join(tmpdir(), `resume-workshop-vite-${createHash('sha256').update(process.cwd()).digest('hex').slice(0, 12)}`),
  plugins: [react()],
  test: {
    environment: 'node',
  },
})
