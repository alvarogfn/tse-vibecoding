import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/tse-vibecoding/',
  plugins: [tsconfigPaths(), UnoCSS(), react()],
  server: {
    port: 5173
  }
})
