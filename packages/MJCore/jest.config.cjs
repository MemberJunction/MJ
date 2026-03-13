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
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': ['ts-jest', { useESM: false }],
  },
  // Transform ESM packages that Jest can't parse natively
  // Uses full path pattern to match hoisted node_modules at repo root
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid|lodash)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
  ],
  moduleNameMapper: {
    '^@memberjunction/global$': '<rootDir>/../MJGlobal/src',
    '^@memberjunction/(.*)$': '<rootDir>/../$1/src',
  },
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testTimeout: 30000, // Metadata operations can be slow
};
