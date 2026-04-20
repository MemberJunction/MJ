/// <reference types="vitest/globals" />
/**
 * Vitest setup file for MJCore tests
 * Runs before each test file
 */

// Increase timeout for async operations
vi.setConfig({ testTimeout: 30000 });

// Mock console methods to reduce noise (can be enabled per test)
global.console = {
  ...console,
  // Uncomment to silence logs during tests
  // log: vi.fn(),
  // debug: vi.fn(),
  // info: vi.fn(),
  // warn: vi.fn(),
  // error: vi.fn(),
};
