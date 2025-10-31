import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      '984447bcc03c.ngrok-free.app' // domínio do ngrok que você está usando
    ]
  }
})
