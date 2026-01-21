import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd(), '')
  
  // Use env from file, or fallback to process.env (for CI/CD)
  const encryptionKey = env.VITE_ENCRYPTION_KEY || process.env.VITE_ENCRYPTION_KEY
  const clientId = env.VITE_TWITCH_CLIENT_ID || process.env.VITE_TWITCH_CLIENT_ID
  
  console.log('Building with encryption key:', encryptionKey ? 'SET' : 'NOT SET')
  console.log('Building with client ID:', clientId ? 'SET' : 'NOT SET')
  
  return {
    plugins: [
      react(),
      electron({
        main: {
          entry: 'electron/main.ts',
          vite: {
            define: {
              // Make environment variables available in Electron main process
              'process.env.VITE_ENCRYPTION_KEY': JSON.stringify(encryptionKey),
              'process.env.VITE_TWITCH_CLIENT_ID': JSON.stringify(clientId),
            },
            build: {
              rollupOptions: {
                external: [],
              },
            },
          },
        },
        preload: {
          input: 'electron/preload.ts',
        },
        renderer: {},
      }),
    ],
  }
})
