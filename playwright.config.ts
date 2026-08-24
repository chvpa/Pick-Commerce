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
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
});
