import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    /*
     * Mismo alias que `paths` en tsconfig. Va con `fileURLToPath` y no con
     * `.pathname`: en Windows, con espacios en la ruta del repo, `.pathname`
     * devuelve "/C:/.../Pick%20commerce" y el build falla con os error 123.
     */
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: { port: 5273 },
});
