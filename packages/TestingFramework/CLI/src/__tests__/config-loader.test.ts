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

  /**
   * Regression guard. This module used to call `dotenv.config({ override: true })`,
   * which overwrote variables already present in the environment. The effect was
   * that `DB_DATABASE=MJ_scratch mj test ...` was silently discarded and the suite
   * ran — including mutation tests — against whatever `.env` pointed at, making the
   * "one database per agent" rule unenforceable and diverging from every other `mj`
   * command. An explicitly-set variable must win.
   */
  describe('dotenv precedence', () => {
    it('does not pass override:true, so an explicit env var wins over .env', async () => {
      vi.resetModules();
      const configSpy = vi.fn();
      vi.doMock('dotenv', () => ({ default: { config: configSpy } }));

      await import('../utils/config-loader');

      expect(configSpy).toHaveBeenCalled();
      const options = configSpy.mock.calls[0]?.[0] as { override?: boolean } | undefined;
      expect(options?.override).not.toBe(true);
    });
  });
});
