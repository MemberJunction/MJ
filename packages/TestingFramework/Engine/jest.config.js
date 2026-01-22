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
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/index.ts',
  ],
  moduleNameMapper: {
    '^@memberjunction/global$': '<rootDir>/../../MJGlobal/src',
    '^@memberjunction/testing-engine-base$': '<rootDir>/../EngineBase/src',
    '^@memberjunction/core$': '<rootDir>/../../MJCore/src',
    '^@memberjunction/core-entities$': '<rootDir>/../../MJCoreEntities/src',
    '^@memberjunction/(.*)$': '<rootDir>/../../$1/src',
  },
  testTimeout: 30000,
};
