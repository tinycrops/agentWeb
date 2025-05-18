module.exports = {
  'env': {
    'node': true,
    'commonjs': true,
    'es2021': true
  },
  'extends': 'eslint:recommended',
  'parserOptions': {
    'ecmaVersion': 'latest'
  },
  'rules': {
    'no-unused-vars': 'warn',
    'no-console': 'off',
    'semi': ['error', 'always'],
    'quotes': ['error', 'single', { 'avoidEscape': true }]
  },
  'overrides': [
    {
      'files': ['test/**/*.js'],
      'env': {
        'jest': true
      }
    },
    {
      'files': ['src/frontend/**/*.js'],
      'env': {
        'browser': true
      },
      'parserOptions': {
        'sourceType': 'module'
      }
    }
  ]
}; 