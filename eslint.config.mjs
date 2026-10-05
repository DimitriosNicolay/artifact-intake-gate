import airbnb from 'eslint-stylistic-airbnb'
import prettierConfig from 'eslint-config-prettier';

export default [
  { ignores: ['node_modules/**', 'cdk.out/**', '*.d.ts'] },
  ...airbnb.configs['flat/recommended'],
  ...prettierConfig,
];