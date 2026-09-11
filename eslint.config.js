const tseslint = require('typescript-eslint');
const prettier = require('eslint-plugin-prettier/recommended');
const reactHooks = require('eslint-plugin-react-hooks');

module.exports = tseslint.config(
  {
    ignores: [
      'node_modules/',
      'dist/',
      'build/',
      'dist-electron/',
      '*.js',
      '*.d.ts',
      '**/dist/',
      '**/dist-electron/',
      '.env',
      '.env.local',
      'data/*.db',
      '*.log',
      'old_project/',
    ],
  },
  ...tseslint.configs.recommended,
  prettier,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './packages/*/tsconfig.json'],
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Prettier rules
      'prettier/prettier': 'error',
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // React rules
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/rules-of-hooks': 'error',
      // General rules
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'no-debugger': 'error',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  }
);
