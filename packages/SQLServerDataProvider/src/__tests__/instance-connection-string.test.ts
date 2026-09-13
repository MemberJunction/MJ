/**
 * Tests for SQLServerDataProvider.InstanceConnectionString.
 *
 * This getter is the identity key for anything scoped per-connection — most
 * critically the shared Redis result caches (RunView/RunQuery/dataset), whose
 * keys embed it to keep results from different databases apart.
 *
 * Regression context: the getter used to read the pool's private `_config`
 * member. In mssql v11+ `_config` is a method, so every `_config?.x` access
 * returned undefined and the getter degenerated to 'mssql://localhost:1433/'
 * for EVERY connection. Processes connected to different databases then
 * collided on the same shared-cache keys (2026-09-02 Skip prod incident).
 * The getter must read the public `config` property instead.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('mssql', async () => (await import('./helpers/mock-mssql')).createMockMssqlModule());

import { SQLServerDataProvider } from '../SQLServerDataProvider';

const instanceConnectionStringGetter = Object.getOwnPropertyDescriptor(
  SQLServerDataProvider.prototype,
  'InstanceConnectionString'
)!.get!;

function connectionStringFor(pool: unknown): string {
  return instanceConnectionStringGetter.call({ _pool: pool });
}

describe('SQLServerDataProvider.InstanceConnectionString', () => {
  it('builds the identity from the pool public config', () => {
    const pool = { config: { server: 'db.example.com', port: 1433, database: 'MJProd' } };
    expect(connectionStringFor(pool)).toBe('mssql://db.example.com:1433/MJProd');
  });

  it('includes the instance name when configured', () => {
    const pool = {
      config: { server: 'db.example.com', port: 1499, database: 'MJDev', options: { instanceName: 'SQL2022' } },
    };
    expect(connectionStringFor(pool)).toBe('mssql://db.example.com:1499/SQL2022/MJDev');
  });

  it('falls back to localhost defaults only when config carries no values', () => {
    expect(connectionStringFor({ config: {} })).toBe('mssql://localhost:1433/');
  });

  it('does not read the private _config member (a method in mssql v11+)', () => {
    // Mimics a real mssql v11+ pool: `config` is the public options object,
    // `_config` is a function. Reading `_config` would degenerate to the
    // localhost fallback and collapse every connection to one identity.
    const pool = {
      config: { server: 'prod-sql.database.windows.net', port: 1433, database: 'SkipProd' },
      _config: () => ({ server: 'wrong', port: 0, database: 'wrong' }),
    };
    expect(connectionStringFor(pool)).toBe('mssql://prod-sql.database.windows.net:1433/SkipProd');
    expect(connectionStringFor(pool)).not.toContain('localhost');
  });

  it('gives distinct identities to pools pointed at different databases', () => {
    const a = connectionStringFor({ config: { server: 'host-a', port: 1433, database: 'DbA' } });
    const b = connectionStringFor({ config: { server: 'host-b', port: 1433, database: 'DbB' } });
    expect(a).not.toBe(b);
  });
});
