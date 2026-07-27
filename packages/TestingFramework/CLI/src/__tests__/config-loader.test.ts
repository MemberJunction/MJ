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

import { loadCLIConfig, resolveDbPlatform, defaultPortForPlatform } from '../utils/config-loader';

describe('config-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.DB_PLATFORM;
  });

  describe('resolveDbPlatform', () => {
    it('should default to sqlserver when nothing is configured', () => {
      expect(resolveDbPlatform(undefined)).toBe('sqlserver');
    });

    it('should read DB_PLATFORM when the config omits a platform', () => {
      process.env.DB_PLATFORM = 'postgresql';
      expect(resolveDbPlatform(undefined)).toBe('postgresql');
    });

    it('should let an explicit config value win over DB_PLATFORM', () => {
      process.env.DB_PLATFORM = 'postgresql';
      expect(resolveDbPlatform('sqlserver')).toBe('sqlserver');
    });

    it('should accept any casing', () => {
      expect(resolveDbPlatform('PostgreSQL')).toBe('postgresql');
      expect(resolveDbPlatform('  SQLSERVER  ')).toBe('sqlserver');
    });

    it('should treat an empty DB_PLATFORM as unset rather than invalid', () => {
      process.env.DB_PLATFORM = '';
      expect(resolveDbPlatform(undefined)).toBe('sqlserver');
    });

    it('should throw on an unrecognized platform instead of silently defaulting', () => {
      // Silently falling back to sqlserver would run the whole PG lane against
      // SQL Server and report a green that proves nothing.
      expect(() => resolveDbPlatform('postgres')).toThrow(/postgres/);
      expect(() => resolveDbPlatform('mysql')).toThrow(/sqlserver.*postgresql|postgresql.*sqlserver/i);
    });
  });

  describe('defaultPortForPlatform', () => {
    it('should use the well-known port for each platform', () => {
      expect(defaultPortForPlatform('sqlserver')).toBe(1433);
      expect(defaultPortForPlatform('postgresql')).toBe(5432);
    });
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
