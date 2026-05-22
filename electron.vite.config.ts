import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@pinecall/sdk', 'tciv-client'] })],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        external: ['sql.js']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve('src/ui'),
    plugins: [react()],
    resolve: {
      alias: {
        '@ui': resolve('src/ui/src'),
        '@shared': resolve('src/shared'),
      }
    },
    build: {
      rollupOptions: {
        input: resolve('src/ui/index.html'),
      }
    }
  }
})
