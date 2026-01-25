/**
 * Jest setup file for MJServer tests
 * Runs before each test file
 */

// Increase timeout for async operations
// Using globalThis for ESM compatibility
if (typeof jest !== 'undefined') {
  jest.setTimeout(30000);
}

// Mock console methods to reduce noise (can be enabled per test)
// Uncomment to silence logs during tests
// global.console = {
//   ...console,
//   log: jest.fn(),
//   debug: jest.fn(),
//   info: jest.fn(),
//   warn: jest.fn(),
//   error: jest.fn(),
// };
