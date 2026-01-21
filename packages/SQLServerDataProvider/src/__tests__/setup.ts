/**
 * Jest setup file for SQLServerDataProvider tests
 * Runs before each test file
 */

// Increase timeout for async operations
jest.setTimeout(30000);

// Mock console methods to reduce noise (can be enabled per test)
global.console = {
  ...console,
  // Uncomment to silence logs during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};
