import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/*.generated.ts',
      '**/dist/**',
      '**/.astro/**',
      '**/.wrangler/**',
      '**/node_modules/**',
      '**/*.d.ts',
      // Referencia de diseño exportada por la herramienta del diseñador: no es
      // código del producto y no se mantiene acá. Se recrea, no se importa.
      'design_handoff_pick_commerce/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/admin/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      /*
       * Apagada con motivo: **el compilador de React no está activo** en el Admin.
       * `@vitejs/plugin-react` lo trae apagado y `vite.config.ts` lo usa sin
       * opciones; verificado sobre el artefacto, no hay rastro del runtime del
       * compilador en ningún chunk. Esta regla avisa que el compilador «saltea»
       * `ListaProductos` por TanStack Table, y el aviso salía en cada corrida
       * hablando de algo que no corre. Las demás reglas de `react-hooks` siguen
       * prendidas porque valen solas —el `setState` dentro de un efecto encadena
       * renders con o sin compilador—.
       *
       * Si algún día se activa el compilador, esta línea se borra: ahí el aviso
       * pasa a decir algo cierto.
       */
      'react-hooks/incompatible-library': 'off',
    },
  },
  {
    files: ['**/*.config.{js,ts,mjs}', '**/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
);
