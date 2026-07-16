import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Flask JSON API — see app.py. Everything under /api proxies to the backend.
      '/api': 'http://127.0.0.1:5000',
    },
  },
})
