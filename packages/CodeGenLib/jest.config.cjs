/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  transform: {
    '^.+\\.ts$': ['ts-jest', { diagnostics: false }],
    '^.+\\.js$': ['ts-jest', { useESM: false, diagnostics: false }],
  },
  // Transform ESM packages that Jest can't parse natively
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid|lodash)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  // Module mappings not needed — tests mock MJ dependencies directly via jest.mock()
  testTimeout: 30000,
};
