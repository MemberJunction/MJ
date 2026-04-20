import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock cosmiconfig
const mockSearch = vi.fn();
vi.mock('cosmiconfig', () => ({
  cosmiconfig: () => ({
    search: mockSearch,
  }),
}));

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

import { loadCLIConfig } from '../utils/config-loader';

describe('config-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loadCLIConfig', () => {
    it('should return defaults when no cached config exists', () => {
      const config = loadCLIConfig();
      expect(config.defaultFormat).toBe('console');
      expect(config.failFast).toBe(false);
      expect(config.parallel).toBe(false);
      expect(config.maxParallelTests).toBe(5);
      expect(config.timeout).toBe(300000);
    });

    it('should return a database configuration with defaults', () => {
      const config = loadCLIConfig();
      expect(config.database).toBeDefined();
      expect(config.database!.host).toBe('localhost');
      expect(config.database!.schema).toBe('__mj');
    });
  });
});
