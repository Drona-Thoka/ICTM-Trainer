import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/get_amc': 'http://127.0.0.1:5000',
      '/get_aime': 'http://127.0.0.1:5000',
      '/get_nsml': 'http://127.0.0.1:5000',
      '/get_ictm': 'http://127.0.0.1:5000',
      '/get_arml': 'http://127.0.0.1:5000',
    },
  },
})
