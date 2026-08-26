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
  /*
   * El `.env` vive en la raíz del monorepo, no en esta app: es el mismo que usan
   * el seed y los scripts de base. Sin esto, `pnpm dev` levantaría el Admin
   * mostrando "falta configuración" con las variables ya definidas.
   */
  envDir: fileURLToPath(new URL('../../', import.meta.url)),
  server: { port: 5273 },
});
