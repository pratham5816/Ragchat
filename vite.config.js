import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/chat': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('error', (err, _req, res) => {
            // Gracefully catch backend connection failure without crashing Vite terminal
            if (res && !res.headersSent && typeof res.writeHead === 'function') {
              res.writeHead(503, { 'Content-Type': 'application/json' })
              res.end(
                JSON.stringify({
                  error: 'Spring Boot backend is offline on port 8080',
                  message: err.message,
                })
              )
            }
          })
        },
      },
    },
  },
})
