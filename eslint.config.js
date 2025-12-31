import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactRefreshPlugin from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';

export default [
  {
    ignores: [
      'node_modules',
      'dist',
      'dist-ssr',
      'coverage',
      'playwright-report',
      'test-results',
      'public/assets'
    ]
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
      },
      globals: {
        ...globals.browser
      }
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      'react-refresh': reactRefreshPlugin
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react/react-in-jsx-scope': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react-hooks/exhaustive-deps': 'off'
    }
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: [
      'playwright.config.ts',
      'scripts/**/*.{js,mjs,cjs,ts}',
      'tests/**/*.{js,mjs,cjs,ts,tsx}'
    ],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: ['scripts/build-pref-features.mjs'],
    rules: {
      'no-unused-vars': 'off'
    }
  },
  {
    files: ['src/features/cat-matching/lib/descriptors.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off'
    }
  },
  prettierConfig
];
