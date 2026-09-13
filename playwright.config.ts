import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke de critical paths, no reemplazo de los tests unitarios
 * (ENGINEERING_HARNESS.md §7). Corre contra el build de producción servido por
 * workerd, no contra `astro dev`: es el artefacto que se despliega, y el dev
 * server tiene flakiness propia del optimizador de dependencias de Vite.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4321',
    trace: 'retain-on-failure',
  },
  projects: [
    /*
     * La demo, en el 4321. `testIgnore` porque `testDir` es `./e2e` entero y sin
     * eso estos dos proyectos también correrían los specs de Treeshop, contra el
     * servidor equivocado.
     */
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: '**/treeshop/**',
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: '**/treeshop/**' },

    /*
     * Treeshop, en el 4323.
     *
     * Es el único storefront en producción y era el único sin suite: lo que acá
     * se prueba es **su código** —encabezado, menú en teléfono, preset,
     * contenido— servido contra los datos de la demo. La tienda real no se toca:
     * ni un pedido, ni una unidad de stock.
     *
     * En Pixel 7 y no en escritorio porque la pieza que sólo existe acá, el menú
     * mobile, no se ve en escritorio.
     */
    {
      name: 'treeshop',
      use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:4323' },
      testMatch: '**/treeshop/**',
    },
  ],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
