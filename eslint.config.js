// Configuration ESLint (format « flat », ESLint 9).
//
// Objectif : figer le style déjà écrit, pas en imposer un autre. Les règles de
// mise en forme sont donc laissées à Prettier — `eslint-config-prettier` est
// appliqué en dernier et désactive tout ce qui pourrait entrer en conflit — et
// ESLint ne garde que ce qui attrape des erreurs réelles.
//
// Le typage strict de `tsconfig.json` (`strict`, `noUnusedLocals`,
// `noUnusedParameters`, `noFallthroughCasesInSwitch`) couvre déjà beaucoup :
// on n'active pas les jeux `type-checked` de typescript-eslint, qui
// demanderaient un programme TypeScript complet à chaque passage du linter
// pour un gain marginal sur ce dépôt.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', '.vercel', '*.tsbuildinfo'] },

  // ------------------------------------------------------------------------
  // Application React (src/)
  // ------------------------------------------------------------------------
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Le Fast Refresh de Vite ne recharge un module que s'il n'exporte que
      // des composants. Avertissement et non erreur : plusieurs modules du
      // projet exportent volontairement un composant et son hook côté.
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Le projet préfixe par `_` ce qu'il garde sans l'utiliser ; même
      // convention que `noUnusedLocals` côté TypeScript.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      // `any` explicite : à signaler, sans bloquer une passe de lint.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Interdit `==` sauf contre `null`, qui est la forme courte et lisible
      // pour « null ou undefined ».
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },

  // ------------------------------------------------------------------------
  // Tests : Vitest injecte ses globales, et un `console.log` de diagnostic y
  // est légitime.
  // ------------------------------------------------------------------------
  {
    files: ['src/**/__tests__/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    rules: { 'no-console': 'off' },
  },

  // ------------------------------------------------------------------------
  // Outillage : scripts Node et fichiers de configuration.
  // ------------------------------------------------------------------------
  {
    files: ['scripts/**/*.{js,mjs}', '*.config.js', 'eslint.config.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // Ces scripts s'adressent à un humain dans un terminal : leur sortie
      // console est leur raison d'être.
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-var': 'error',
      'prefer-const': 'error',
    },
  },

  // ------------------------------------------------------------------------
  // Fichiers de configuration écrits en TypeScript (vite.config.ts) : côté
  // Node, mais il leur faut le parseur TypeScript.
  // ------------------------------------------------------------------------
  {
    files: ['*.config.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'no-console': 'off',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },

  // Toujours en dernier : neutralise les règles qui se battraient avec Prettier.
  prettier,
);
