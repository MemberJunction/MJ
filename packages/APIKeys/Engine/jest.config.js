/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/*.spec.ts', '**/*.test.ts'],
    moduleFileExtensions: ['ts', 'js', 'json'],
    collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/index.ts'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov', 'html'],
    verbose: true,
    // Transform ESM modules
    transformIgnorePatterns: [
        'node_modules/(?!(@memberjunction)/)'
    ],
    // Mock external dependencies
    moduleNameMapper: {
        '^@memberjunction/core$': '<rootDir>/src/__mocks__/core.ts',
        '^@memberjunction/core-entities$': '<rootDir>/src/__mocks__/core-entities.ts'
    }
};
