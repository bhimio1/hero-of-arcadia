import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'src-tauri/target', 'src-tauri/gen'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js,mjs}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // The rules engine must stay plain TypeScript: no Phaser, no DOM, no browser storage.
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [{ name: 'phaser', message: 'src/core must not depend on Phaser.' }],
          patterns: [{ group: ['**/game/**', '../game/*'], message: 'src/core must not import from src/game.' }],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/core must not touch the DOM.' },
        { name: 'document', message: 'src/core must not touch the DOM.' },
        { name: 'localStorage', message: 'Pass a StorageLike instead.' },
      ],
    },
  },
);
