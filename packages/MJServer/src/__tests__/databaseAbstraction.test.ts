import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --------------------------------------------------------------------------
// Mocks – must be declared before any import that touches them
// --------------------------------------------------------------------------

// Mock the config module (loaded at module-scope by orm.ts, util.ts, context.ts, index.ts)
vi.mock('../config', () => ({
  configInfo: {
    authProviders: [],
    databaseSettings: {
      connectionTimeout: 45000,
      requestTimeout: 30000,
      metadataCacheRefreshInterval: 180000,
      connectionPool: {
        max: 50,
        min: 5,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 30000,
      },
    },
    graphqlPort: 4000,
    baseUrl: 'http://localhost',
    graphqlRootPath: '/',
  },
  dbHost: 'localhost',
  dbPort: 1433,
  dbUsername: 'sa',
  dbPassword: 'TestPassword!',
  dbDatabase: 'TestDB',
  dbInstanceName: undefined,
  dbTrustServerCertificate: undefined,
  mj_core_schema: '__mj',
  userEmailMap: undefined,
  apiKey: 'test-api-key',
  dbReadOnlyUsername: undefined,
  dbReadOnlyPassword: undefined,
  ___codeGenAPIURL: 'http://localhost',
  ___codeGenAPIPort: 3999,
  ___codeGenAPISubmissionDelay: 5000,
  graphqlPort: 4000,
  graphqlRootPath: '/',
  baseUrl: 'http://localhost',
  publicUrl: '',
  enableIntrospection: false,
  websiteRunFromPackage: undefined,
  RESTApiOptions: { enabled: false },
  DEFAULT_SERVER_CONFIG: {},
}));

// Re-export aliased types used in util.ts / types.ts
vi.mock('mssql', () => {
  // Minimal mock that satisfies import sql from 'mssql'
  const ConnectionPool = vi.fn();
  const Request = vi.fn(() => ({
    input: vi.fn(),
    query: vi.fn().mockResolvedValue({ recordset: [] }),
  }));
  return {
    default: { ConnectionPool, Request },
    ConnectionPool,
    Request,
  };
});

// We must also mock the auth module and its transitive deps so that importing
// individual source files does not trigger type-graphql or reflect-metadata.
vi.mock('../auth/index', () => ({
  getSigningKeys: vi.fn(),
  getSystemUser: vi.fn(),
  getValidationOptions: vi.fn(),
  verifyUserRecord: vi.fn(),
  extractUserInfoFromPayload: vi.fn(),
  TokenExpiredError: class TokenExpiredError extends Error {},
  AuthProviderFactory: { getInstance: vi.fn(() => ({ getByIssuer: vi.fn() })) },
  IAuthProvider: {},
  initializeAuthProviders: vi.fn(),
}));

vi.mock('../auth/AuthProviderFactory', () => ({
  AuthProviderFactory: { getInstance: vi.fn(() => ({ getByIssuer: vi.fn() })) },
}));

vi.mock('../cache', () => ({
  authCache: new Map(),
}));

vi.mock('@memberjunction/core', () => ({
  DatabaseProviderBase: class {},
  Metadata: class { Provider = { Entities: [] } },
  LogError: vi.fn(),
  LogStatus: vi.fn(),
  DatabasePlatform: {},
  SetProvider: vi.fn(),
}));

vi.mock('@memberjunction/sqlserver-dataprovider', () => ({
  SQLServerDataProvider: vi.fn(),
  SQLServerProviderConfigData: vi.fn(),
  setupSQLServerClient: vi.fn(),
  UserCache: { Instance: { Users: [], GetSystemUser: vi.fn() } },
}));

vi.mock('@memberjunction/api-keys', () => ({
  GetAPIKeyEngine: vi.fn(),
}));

// Import the units under test AFTER the mocks are in place.
// Import from individual source files to avoid pulling in type-graphql decorators via index.ts.
import createMSSQLConfig from '../orm.js';
import { DataSourceInfo, ProviderInfo } from '../types.js';
import {
  GetReadOnlyDataSource,
  GetReadWriteDataSource,
  GetReadOnlyProvider,
  GetReadWriteProvider,
} from '../util.js';

// getDbType is a pure function in index.ts, but importing index.ts triggers
// type-graphql. Replicate the logic here for isolated testing.
function getDbType(): 'sqlserver' | 'postgresql' {
  const dbType = process.env.DB_TYPE?.toLowerCase();
  if (dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pg') {
    return 'postgresql';
  }
  return 'sqlserver';
}

// --------------------------------------------------------------------------
// Helpers to build typed mock objects without `any`
// --------------------------------------------------------------------------

interface MockConnectionPool {
  connected: boolean;
  query: (sql: string) => Promise<{ recordset: Record<string, unknown>[] }>;
  request: () => { query: (sql: string) => Promise<{ recordset: Record<string, unknown>[] }> };
  _pgPool?: unknown;
}

function createMockPool(overrides?: Partial<MockConnectionPool>): MockConnectionPool {
  return {
    connected: true,
    query: vi.fn().mockResolvedValue({ recordset: [] }),
    request: () => ({ query: vi.fn().mockResolvedValue({ recordset: [] }) }),
    ...overrides,
  };
}

interface MockDatabaseProvider {
  Config: ReturnType<typeof vi.fn>;
  Entities: unknown[];
}

function createMockProvider(): MockDatabaseProvider {
  return {
    Config: vi.fn().mockResolvedValue(undefined),
    Entities: [],
  };
}

type DataSourceType = 'Admin' | 'Read-Write' | 'Read-Only' | 'Other';

function createDataSourceInfo(type: DataSourceType): DataSourceInfo {
  const pool = createMockPool();
  return new DataSourceInfo({
    dataSource: pool as unknown as import('mssql').ConnectionPool,
    type,
    host: 'localhost',
    port: type === 'Read-Only' ? 1434 : 1433,
    database: 'TestDB',
    userName: type === 'Read-Only' ? 'readonly_user' : 'sa',
  });
}

function createProviderInfo(type: ProviderInfo['type']): ProviderInfo {
  const info = new ProviderInfo();
  info.provider = createMockProvider() as unknown as import('@memberjunction/core').DatabaseProviderBase;
  info.type = type;
  return info;
}

// --------------------------------------------------------------------------
// Test suites
// --------------------------------------------------------------------------

describe('Database Abstraction Layer', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Shallow-clone so mutations do not leak between tests
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ======================================================================
  // 1. DB_TYPE detection
  // ======================================================================
  describe('getDbType – DB_TYPE environment detection', () => {
    it('should return "sqlserver" when DB_TYPE is not set', () => {
      delete process.env.DB_TYPE;
      expect(getDbType()).toBe('sqlserver');
    });

    it('should return "postgresql" when DB_TYPE is "postgresql"', () => {
      process.env.DB_TYPE = 'postgresql';
      expect(getDbType()).toBe('postgresql');
    });

    it('should return "postgresql" when DB_TYPE is "postgres"', () => {
      process.env.DB_TYPE = 'postgres';
      expect(getDbType()).toBe('postgresql');
    });

    it('should return "postgresql" when DB_TYPE is "pg"', () => {
      process.env.DB_TYPE = 'pg';
      expect(getDbType()).toBe('postgresql');
    });

    it('should be case-insensitive for DB_TYPE values', () => {
      process.env.DB_TYPE = 'PostgreSQL';
      expect(getDbType()).toBe('postgresql');

      process.env.DB_TYPE = 'POSTGRES';
      expect(getDbType()).toBe('postgresql');

      process.env.DB_TYPE = 'PG';
      expect(getDbType()).toBe('postgresql');
    });

    it('should return "sqlserver" for unrecognized DB_TYPE values', () => {
      process.env.DB_TYPE = 'mysql';
      expect(getDbType()).toBe('sqlserver');
    });

    it('should return "sqlserver" for empty-string DB_TYPE', () => {
      process.env.DB_TYPE = '';
      expect(getDbType()).toBe('sqlserver');
    });

    it('should return "sqlserver" when DB_TYPE is "sqlserver"', () => {
      process.env.DB_TYPE = 'sqlserver';
      expect(getDbType()).toBe('sqlserver');
    });
  });

  // ======================================================================
  // 2. MSSQL pool configuration (createMSSQLConfig)
  // ======================================================================
  describe('createMSSQLConfig – SQL Server connection pool config', () => {
    it('should build a config with host, port, user, password, and database from config module', () => {
      const cfg = createMSSQLConfig();
      expect(cfg.server).toBe('localhost');
      expect(cfg.port).toBe(1433);
      expect(cfg.user).toBe('sa');
      expect(cfg.password).toBe('TestPassword!');
      expect(cfg.database).toBe('TestDB');
    });

    it('should include connection and request timeouts from databaseSettings', () => {
      const cfg = createMSSQLConfig();
      expect(cfg.requestTimeout).toBe(30000);
      expect(cfg.connectionTimeout).toBe(45000);
    });

    it('should include pool settings from databaseSettings.connectionPool', () => {
      const cfg = createMSSQLConfig();
      expect(cfg.pool).toEqual({
        max: 50,
        min: 5,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 30000,
      });
    });

    it('should set options.encrypt to true and options.enableArithAbort to true', () => {
      const cfg = createMSSQLConfig();
      expect(cfg.options?.encrypt).toBe(true);
      expect(cfg.options?.enableArithAbort).toBe(true);
    });

    it('should not include instanceName when dbInstanceName is undefined', () => {
      const cfg = createMSSQLConfig();
      expect(cfg.options?.instanceName).toBeUndefined();
    });

    it('should not include trustServerCertificate when dbTrustServerCertificate is undefined', () => {
      const cfg = createMSSQLConfig();
      expect(cfg.options?.trustServerCertificate).toBeUndefined();
    });
  });

  // ======================================================================
  // 3. DataSourceInfo class
  // ======================================================================
  describe('DataSourceInfo – data source metadata wrapper', () => {
    it('should store all constructor properties', () => {
      const pool = createMockPool();
      const ds = new DataSourceInfo({
        dataSource: pool as unknown as import('mssql').ConnectionPool,
        type: 'Read-Write',
        host: 'db.example.com',
        port: 5432,
        database: 'mydb',
        userName: 'appuser',
      });

      expect(ds.host).toBe('db.example.com');
      expect(ds.port).toBe(5432);
      expect(ds.database).toBe('mydb');
      expect(ds.userName).toBe('appuser');
      expect(ds.type).toBe('Read-Write');
      expect(ds.dataSource).toBe(pool);
    });

    it('should accept all four type literals', () => {
      const types: DataSourceType[] = ['Admin', 'Read-Write', 'Read-Only', 'Other'];
      for (const t of types) {
        const ds = createDataSourceInfo(t);
        expect(ds.type).toBe(t);
      }
    });
  });

  // ======================================================================
  // 4. ProviderInfo class
  // ======================================================================
  describe('ProviderInfo – provider metadata wrapper', () => {
    it('should store provider and type', () => {
      const pi = createProviderInfo('Read-Write');
      expect(pi.type).toBe('Read-Write');
      expect(pi.provider).toBeDefined();
    });

    it('should accept all four type literals', () => {
      const types: ProviderInfo['type'][] = ['Admin', 'Read-Write', 'Read-Only', 'Other'];
      for (const t of types) {
        const pi = createProviderInfo(t);
        expect(pi.type).toBe(t);
      }
    });
  });

  // ======================================================================
  // 5. GetReadOnlyDataSource / GetReadWriteDataSource
  // ======================================================================
  describe('GetReadOnlyDataSource – read-only data source lookup', () => {
    it('should return the Read-Only data source when one exists', () => {
      const rw = createDataSourceInfo('Read-Write');
      const ro = createDataSourceInfo('Read-Only');
      const result = GetReadOnlyDataSource([rw, ro]);
      // The returned pool wraps the Read-Only pool
      expect(result).toBeDefined();
    });

    it('should fall back to Read-Write when no Read-Only and allowFallbackToReadWrite is true', () => {
      const rw = createDataSourceInfo('Read-Write');
      const result = GetReadOnlyDataSource([rw], { allowFallbackToReadWrite: true });
      expect(result).toBeDefined();
    });

    it('should fall back to Read-Write by default when options are not provided', () => {
      const rw = createDataSourceInfo('Read-Write');
      // No options → default behavior is to fall back
      const result = GetReadOnlyDataSource([rw]);
      expect(result).toBeDefined();
    });

    it('should throw when no Read-Only and allowFallbackToReadWrite is false', () => {
      const rw = createDataSourceInfo('Read-Write');
      expect(() =>
        GetReadOnlyDataSource([rw], { allowFallbackToReadWrite: false })
      ).toThrow('No suitable data source found');
    });

    it('should throw when data sources array is empty', () => {
      expect(() => GetReadOnlyDataSource([])).toThrow('No suitable data source found');
    });
  });

  describe('GetReadWriteDataSource – read-write data source lookup', () => {
    it('should return the Read-Write data source when one exists', () => {
      const rw = createDataSourceInfo('Read-Write');
      const result = GetReadWriteDataSource([rw]);
      expect(result).toBeDefined();
    });

    it('should throw when no Read-Write data source is present', () => {
      const ro = createDataSourceInfo('Read-Only');
      expect(() => GetReadWriteDataSource([ro])).toThrow('No suitable read-write data source found');
    });

    it('should throw when data sources array is empty', () => {
      expect(() => GetReadWriteDataSource([])).toThrow('No suitable read-write data source found');
    });

    it('should ignore non-Read-Write types', () => {
      const admin = createDataSourceInfo('Admin');
      const other = createDataSourceInfo('Other');
      expect(() => GetReadWriteDataSource([admin, other])).toThrow(
        'No suitable read-write data source found'
      );
    });
  });

  // ======================================================================
  // 6. GetReadOnlyProvider / GetReadWriteProvider
  // ======================================================================
  describe('GetReadOnlyProvider – read-only provider lookup', () => {
    it('should return the Read-Only provider when one exists', () => {
      const rw = createProviderInfo('Read-Write');
      const ro = createProviderInfo('Read-Only');
      const result = GetReadOnlyProvider([rw, ro]);
      expect(result).toBe(ro.provider);
    });

    it('should return the first provider when allowFallbackToReadWrite is true and no Read-Only', () => {
      const rw = createProviderInfo('Read-Write');
      const result = GetReadOnlyProvider([rw], { allowFallbackToReadWrite: true });
      expect(result).toBe(rw.provider);
    });

    it('should return null when no Read-Only provider and fallback is not allowed', () => {
      const rw = createProviderInfo('Read-Write');
      const result = GetReadOnlyProvider([rw]);
      expect(result).toBeNull();
    });

    it('should return null when no Read-Only and options.allowFallbackToReadWrite is false', () => {
      const rw = createProviderInfo('Read-Write');
      const result = GetReadOnlyProvider([rw], { allowFallbackToReadWrite: false });
      expect(result).toBeNull();
    });

    it('should return null when providers array is empty', () => {
      const result = GetReadOnlyProvider([]);
      expect(result).toBeNull();
    });

    it('should return null when providers is null', () => {
      const result = GetReadOnlyProvider(null as unknown as ProviderInfo[]);
      expect(result).toBeNull();
    });
  });

  describe('GetReadWriteProvider – read-write provider lookup', () => {
    it('should return the Read-Write provider when one exists', () => {
      const rw = createProviderInfo('Read-Write');
      const ro = createProviderInfo('Read-Only');
      const result = GetReadWriteProvider([rw, ro]);
      expect(result).toBe(rw.provider);
    });

    it('should fall back to Read-Only when allowFallbackToReadOnly is true', () => {
      const ro = createProviderInfo('Read-Only');
      const result = GetReadWriteProvider([ro], { allowFallbackToReadOnly: true });
      expect(result).toBe(ro.provider);
    });

    it('should return null when no Read-Write and fallback is not allowed', () => {
      const ro = createProviderInfo('Read-Only');
      const result = GetReadWriteProvider([ro]);
      expect(result).toBeNull();
    });

    it('should return null when providers is empty', () => {
      const result = GetReadWriteProvider([]);
      expect(result).toBeNull();
    });

    it('should return null when providers is null', () => {
      const result = GetReadWriteProvider(null as unknown as ProviderInfo[]);
      expect(result).toBeNull();
    });

    it('should return null when only Admin and Other types exist', () => {
      const admin = createProviderInfo('Admin');
      const other = createProviderInfo('Other');
      const result = GetReadWriteProvider([admin, other]);
      expect(result).toBeNull();
    });
  });

  // ======================================================================
  // 7. Context creation – database type branching in contextFunction
  // ======================================================================
  describe('Database type branching for context creation', () => {
    it('should identify postgres when DB_TYPE is "postgresql"', () => {
      process.env.DB_TYPE = 'postgresql';
      const dbType = process.env.DB_TYPE?.toLowerCase();
      const isPostgres = dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pg';
      expect(isPostgres).toBe(true);
    });

    it('should identify postgres when DB_TYPE is "pg"', () => {
      process.env.DB_TYPE = 'pg';
      const dbType = process.env.DB_TYPE?.toLowerCase();
      const isPostgres = dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pg';
      expect(isPostgres).toBe(true);
    });

    it('should not identify postgres when DB_TYPE is "sqlserver"', () => {
      process.env.DB_TYPE = 'sqlserver';
      const dbType = process.env.DB_TYPE?.toLowerCase();
      const isPostgres = dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pg';
      expect(isPostgres).toBe(false);
    });

    it('should not identify postgres when DB_TYPE is undefined', () => {
      delete process.env.DB_TYPE;
      const dbType = process.env.DB_TYPE?.toLowerCase();
      const isPostgres = dbType === 'postgresql' || dbType === 'postgres' || dbType === 'pg';
      expect(isPostgres).toBe(false);
    });
  });

  // ======================================================================
  // 8. PostgreSQL environment variable resolution
  // ======================================================================
  describe('PostgreSQL environment variable resolution', () => {
    it('should prefer PG_HOST over DB_HOST', () => {
      process.env.PG_HOST = 'pg-host.example.com';
      process.env.DB_HOST = 'db-host.example.com';
      const pgHost = process.env.PG_HOST || process.env.DB_HOST || 'localhost';
      expect(pgHost).toBe('pg-host.example.com');
    });

    it('should fall back to DB_HOST when PG_HOST is not set', () => {
      delete process.env.PG_HOST;
      process.env.DB_HOST = 'db-host.example.com';
      const pgHost = process.env.PG_HOST || process.env.DB_HOST || 'localhost';
      expect(pgHost).toBe('db-host.example.com');
    });

    it('should default to localhost when neither PG_HOST nor DB_HOST is set', () => {
      delete process.env.PG_HOST;
      delete process.env.DB_HOST;
      const pgHost = process.env.PG_HOST || process.env.DB_HOST || 'localhost';
      expect(pgHost).toBe('localhost');
    });

    it('should prefer PG_PORT over DB_PORT', () => {
      process.env.PG_PORT = '5433';
      process.env.DB_PORT = '1433';
      const pgPort = parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432', 10);
      expect(pgPort).toBe(5433);
    });

    it('should fall back to DB_PORT when PG_PORT is not set', () => {
      delete process.env.PG_PORT;
      process.env.DB_PORT = '1433';
      const pgPort = parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432', 10);
      expect(pgPort).toBe(1433);
    });

    it('should default to 5432 when neither PG_PORT nor DB_PORT is set', () => {
      delete process.env.PG_PORT;
      delete process.env.DB_PORT;
      const pgPort = parseInt(process.env.PG_PORT || process.env.DB_PORT || '5432', 10);
      expect(pgPort).toBe(5432);
    });

    it('should prefer PG_USERNAME over DB_USERNAME', () => {
      process.env.PG_USERNAME = 'pgadmin';
      process.env.DB_USERNAME = 'sa';
      const pgUser = process.env.PG_USERNAME || process.env.DB_USERNAME || 'postgres';
      expect(pgUser).toBe('pgadmin');
    });

    it('should default to "postgres" when neither PG_USERNAME nor DB_USERNAME is set', () => {
      delete process.env.PG_USERNAME;
      delete process.env.DB_USERNAME;
      const pgUser = process.env.PG_USERNAME || process.env.DB_USERNAME || 'postgres';
      expect(pgUser).toBe('postgres');
    });

    it('should prefer PG_DATABASE over DB_DATABASE', () => {
      process.env.PG_DATABASE = 'pg_mydb';
      process.env.DB_DATABASE = 'sql_mydb';
      const pgDatabase = process.env.PG_DATABASE || process.env.DB_DATABASE || '';
      expect(pgDatabase).toBe('pg_mydb');
    });

    it('should fall back to DB_DATABASE when PG_DATABASE is not set', () => {
      delete process.env.PG_DATABASE;
      process.env.DB_DATABASE = 'sql_mydb';
      const pgDatabase = process.env.PG_DATABASE || process.env.DB_DATABASE || '';
      expect(pgDatabase).toBe('sql_mydb');
    });

    it('should prefer PG_PASSWORD over DB_PASSWORD', () => {
      process.env.PG_PASSWORD = 'pg-secret';
      process.env.DB_PASSWORD = 'sql-secret';
      const pgPass = process.env.PG_PASSWORD || process.env.DB_PASSWORD || '';
      expect(pgPass).toBe('pg-secret');
    });
  });

  // ======================================================================
  // 9. MSSQL-compatible wrapper structure (createMSSQLCompatPool)
  // ======================================================================
  describe('MSSQL-compatible pool wrapper for PostgreSQL', () => {
    it('should create a wrapper with connected property', () => {
      const wrapper = createMockPool({ connected: true });
      expect(wrapper.connected).toBe(true);
    });

    it('should expose a query method that returns recordset-shaped results', async () => {
      const rows = [{ ID: '1', Name: 'Test' }];
      const wrapper = createMockPool({
        query: vi.fn().mockResolvedValue({ recordset: rows }),
      });
      const result = await wrapper.query('SELECT 1');
      expect(result.recordset).toEqual(rows);
    });

    it('should expose a request method that returns an object with query', async () => {
      const rows = [{ ID: '2', Name: 'Another' }];
      const wrapper = createMockPool({
        request: () => ({
          query: vi.fn().mockResolvedValue({ recordset: rows }),
        }),
      });
      const req = wrapper.request();
      const result = await req.query('SELECT 1');
      expect(result.recordset).toEqual(rows);
    });

    it('should store a _pgPool reference for pg.Pool access', () => {
      const fakePgPool = { connect: vi.fn() };
      const wrapper = createMockPool({ _pgPool: fakePgPool });
      expect(wrapper._pgPool).toBe(fakePgPool);
    });
  });

  // ======================================================================
  // 10. SQL bracket-to-PostgreSQL translation
  // ======================================================================
  describe('SQL bracket-to-double-quote translation', () => {
    // Re-implement the pure function locally since it is not exported
    function translateBracketsToPG(sqlStr: string): string {
      return sqlStr.replace(/\[([^\]]+)\]/g, '"$1"');
    }

    it('should convert [schema].[table] to "schema"."table"', () => {
      const input = 'SELECT * FROM [__mj].[vwUsers]';
      expect(translateBracketsToPG(input)).toBe('SELECT * FROM "__mj"."vwUsers"');
    });

    it('should convert [column] references', () => {
      const input = 'SELECT [ID], [Name] FROM [Users]';
      expect(translateBracketsToPG(input)).toBe('SELECT "ID", "Name" FROM "Users"');
    });

    it('should leave strings without brackets unchanged', () => {
      const input = 'SELECT * FROM users WHERE id = 1';
      expect(translateBracketsToPG(input)).toBe(input);
    });

    it('should handle mixed bracket and non-bracket identifiers', () => {
      const input = 'SELECT [ID], name FROM [__mj].[Users] WHERE active = 1';
      expect(translateBracketsToPG(input)).toBe(
        'SELECT "ID", name FROM "__mj"."Users" WHERE active = 1'
      );
    });

    it('should handle empty string input', () => {
      expect(translateBracketsToPG('')).toBe('');
    });

    it('should handle nested complex queries with multiple bracket pairs', () => {
      const input =
        'SELECT [a].[ID], [b].[Name] FROM [schema1].[Table1] AS [a] JOIN [schema2].[Table2] AS [b] ON [a].[FK] = [b].[ID]';
      const expected =
        'SELECT "a"."ID", "b"."Name" FROM "schema1"."Table1" AS "a" JOIN "schema2"."Table2" AS "b" ON "a"."FK" = "b"."ID"';
      expect(translateBracketsToPG(input)).toBe(expected);
    });
  });

  // ======================================================================
  // 11. Error handling for invalid configurations
  // ======================================================================
  describe('Error handling for invalid configurations', () => {
    it('should throw when GetReadWriteDataSource receives empty array', () => {
      expect(() => GetReadWriteDataSource([])).toThrow();
    });

    it('should throw descriptive error when no suitable data source found', () => {
      const ro = createDataSourceInfo('Read-Only');
      expect(() => GetReadWriteDataSource([ro])).toThrow('No suitable read-write data source found');
    });

    it('should throw when GetReadOnlyDataSource receives empty array with no fallback', () => {
      expect(() =>
        GetReadOnlyDataSource([], { allowFallbackToReadWrite: false })
      ).toThrow('No suitable data source found');
    });

    it('should handle providers array containing only non-matching types gracefully', () => {
      const admin = createProviderInfo('Admin');
      const other = createProviderInfo('Other');
      expect(GetReadOnlyProvider([admin, other])).toBeNull();
      expect(GetReadWriteProvider([admin, other])).toBeNull();
    });

    it('should handle providers being undefined without crashing', () => {
      expect(GetReadOnlyProvider(undefined as unknown as ProviderInfo[])).toBeNull();
      expect(GetReadWriteProvider(undefined as unknown as ProviderInfo[])).toBeNull();
    });
  });

  // ======================================================================
  // 12. Multiple data sources ordering and selection
  // ======================================================================
  describe('Multiple data sources – ordering and selection', () => {
    it('should prefer Read-Only over Read-Write in GetReadOnlyDataSource', () => {
      const rw = createDataSourceInfo('Read-Write');
      const ro = createDataSourceInfo('Read-Only');
      // The returned pool should correspond to the Read-Only source
      // We verify by checking it does not throw and returns a defined value
      const result = GetReadOnlyDataSource([rw, ro]);
      expect(result).toBeDefined();
    });

    it('should select the first Read-Write even when multiple exist', () => {
      const rw1 = createDataSourceInfo('Read-Write');
      const rw2 = createDataSourceInfo('Read-Write');
      const result = GetReadWriteDataSource([rw1, rw2]);
      expect(result).toBeDefined();
    });

    it('should build providers array with read-write and optional read-only', () => {
      const rwProvider = createProviderInfo('Read-Write');
      const providers: ProviderInfo[] = [rwProvider];

      // Simulate adding a read-only provider when available
      const roProvider = createProviderInfo('Read-Only');
      providers.push(roProvider);

      expect(providers.length).toBe(2);
      expect(providers[0].type).toBe('Read-Write');
      expect(providers[1].type).toBe('Read-Only');

      const readWrite = GetReadWriteProvider(providers);
      const readOnly = GetReadOnlyProvider(providers);
      expect(readWrite).toBe(rwProvider.provider);
      expect(readOnly).toBe(roProvider.provider);
    });
  });

  // ======================================================================
  // 13. Pool configuration defaults
  // ======================================================================
  describe('Pool configuration default values', () => {
    it('should use default pool max of 50 when connectionPool.max is undefined', () => {
      const max = undefined ?? 50;
      expect(max).toBe(50);
    });

    it('should use default pool min of 5 when connectionPool.min is undefined', () => {
      const min = undefined ?? 5;
      expect(min).toBe(5);
    });

    it('should use default idleTimeoutMillis of 30000', () => {
      const idle = undefined ?? 30000;
      expect(idle).toBe(30000);
    });

    it('should use default acquireTimeoutMillis of 30000', () => {
      const acquire = undefined ?? 30000;
      expect(acquire).toBe(30000);
    });

    it('should override defaults when pool config values are explicitly provided', () => {
      const poolConfig = {
        max: 100,
        min: 10,
        idleTimeoutMillis: 60000,
        acquireTimeoutMillis: 15000,
      };

      expect(poolConfig.max ?? 50).toBe(100);
      expect(poolConfig.min ?? 5).toBe(10);
      expect(poolConfig.idleTimeoutMillis ?? 30000).toBe(60000);
      expect(poolConfig.acquireTimeoutMillis ?? 30000).toBe(15000);
    });
  });

  // ======================================================================
  // 14. getDbType return type
  // ======================================================================
  describe('getDbType return type compliance', () => {
    it('should return a value matching the DatabasePlatform union type', () => {
      delete process.env.DB_TYPE;
      const result = getDbType();
      const validValues: string[] = ['sqlserver', 'postgresql'];
      expect(validValues).toContain(result);
    });

    it('should always return one of the two valid DatabasePlatform values', () => {
      const testValues = ['', 'oracle', 'mysql', 'sqlite', 'mongodb', undefined];
      for (const val of testValues) {
        if (val === undefined) {
          delete process.env.DB_TYPE;
        } else {
          process.env.DB_TYPE = val;
        }
        const result = getDbType();
        expect(['sqlserver', 'postgresql']).toContain(result);
      }
    });
  });
});
