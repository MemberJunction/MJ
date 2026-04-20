/**
 * Unit tests for the ComponentRegistry package.
 * Tests: config schema validation and loadConfig behavior.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockSearch } = vi.hoisted(() => {
  const defaultConfig = {
    databaseSettings: { connectionTimeout: 5000, requestTimeout: 10000 },
    dbHost: 'localhost',
    dbDatabase: 'TestDB',
    dbPort: 1433,
    dbUsername: 'admin',
    dbPassword: 'secret',
    dbTrustServerCertificate: false,
    mjCoreSchema: '__mj',
  };
  const mockSearch = vi.fn().mockReturnValue({
    config: defaultConfig,
    filepath: '/default/mj.config.cjs',
    isEmpty: false,
  });
  return { mockSearch };
});

vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
}));

vi.mock('cosmiconfig', () => ({
  cosmiconfigSync: vi.fn().mockReturnValue({
    search: mockSearch,
  }),
}));

vi.mock('@memberjunction/core', () => ({
  LogError: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { loadConfig, type ConfigInfo, type ComponentRegistrySettings } from '../config';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should throw when config file not found', () => {
    mockSearch.mockReturnValue(null);
    expect(() => loadConfig()).toThrow('Config file not found.');
  });

  it('should throw when config file is empty', () => {
    mockSearch.mockReturnValue({ config: {}, filepath: '/mj.config.cjs', isEmpty: true });
    expect(() => loadConfig()).toThrow('is empty or does not exist');
  });

  it('should parse a valid config', () => {
    mockSearch.mockReturnValue({
      config: {
        databaseSettings: { connectionTimeout: 5000, requestTimeout: 10000 },
        dbHost: 'db.example.com',
        dbDatabase: 'TestDB',
        dbPort: 1433,
        dbUsername: 'admin',
        dbPassword: 'secret',
        dbTrustServerCertificate: false,
        mjCoreSchema: '__mj',
      },
      filepath: '/mj.config.cjs',
      isEmpty: false,
    });

    const config = loadConfig();
    expect(config.dbHost).toBe('db.example.com');
    expect(config.dbDatabase).toBe('TestDB');
    expect(config.dbUsername).toBe('admin');
    expect(config.mjCoreSchema).toBe('__mj');
  });

  it('should parse componentRegistrySettings when present', () => {
    mockSearch.mockReturnValue({
      config: {
        databaseSettings: { connectionTimeout: 5000, requestTimeout: 10000 },
        dbHost: 'localhost',
        dbDatabase: 'TestDB',
        dbPort: 1433,
        dbUsername: 'admin',
        dbPassword: 'secret',
        mjCoreSchema: '__mj',
        componentRegistrySettings: {
          port: 3300,
          enableRegistry: true,
          requireAuth: true,
          corsOrigins: ['http://localhost:4200'],
        },
      },
      filepath: '/mj.config.cjs',
      isEmpty: false,
    });

    const config = loadConfig();
    expect(config.componentRegistrySettings).toBeDefined();
    expect(config.componentRegistrySettings!.port).toBe(3300);
    expect(config.componentRegistrySettings!.enableRegistry).toBe(true);
    expect(config.componentRegistrySettings!.requireAuth).toBe(true);
    expect(config.componentRegistrySettings!.corsOrigins).toEqual(['http://localhost:4200']);
  });

  it('should transform dbTrustServerCertificate boolean to Y/N', () => {
    mockSearch.mockReturnValue({
      config: {
        databaseSettings: { connectionTimeout: 5000, requestTimeout: 10000 },
        dbHost: 'localhost',
        dbDatabase: 'TestDB',
        dbPort: 1433,
        dbUsername: 'admin',
        dbPassword: 'secret',
        dbTrustServerCertificate: true,
        mjCoreSchema: '__mj',
      },
      filepath: '/mj.config.cjs',
      isEmpty: false,
    });

    const config = loadConfig();
    expect(config.dbTrustServerCertificate).toBe('Y');
  });
});
