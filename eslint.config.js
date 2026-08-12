import typescriptEslint from '@typescript-eslint/eslint-plugin';
import config from 'ultracite/eslint/core';

export default [
  ...config,
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parserOptions: {
        project: false,
      },
    },
    rules: {
      ...typescriptEslint.configs['flat/disable-type-checked'].rules,
    },
  },
  {
    files: ['src/**/*.ts', 'tests/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'unicorn/consistent-arrow-return-style': 'off',
    },
  },
  {
    files: [
      'src/index.ts',
      'src/plugins/index.ts',
      'src/proxy/index.ts',
      'src/scanner/index.ts',
      'stylelint.config.mjs',
    ],
    rules: {
      'unicorn/no-barrel-files': 'off',
    },
  },
  {
    ignores: ['package.json', 'tsconfig.json'],
  },
];
