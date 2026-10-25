import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vite'

export default defineConfig({
  base: '/tse-vibecoding/',
  plugins: [tsconfigPaths(), UnoCSS(), react()],
  // O bundle do Worker não herda os plugins do app (Vite 6): sem o resolver
  // de paths do tsconfig, os imports `@/...` do preditor não resolvem.
  worker: {
    format: 'es',
    plugins: () => [tsconfigPaths()]
  },
  server: {
    port: 5173
  }
})
