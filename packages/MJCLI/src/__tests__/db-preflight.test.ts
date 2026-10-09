/**
 * Tests for the database connection preflight. The SQL driver is mocked via the
 * `openConnection` helper, so no real database is touched — we drive it with the
 * error messages real drivers produce and assert the classification + suggestion.
 * The `master` probe that follows a SQL Server login failure talks to `mssql`
 * directly, so that module is mocked too.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Lazy reference (mirrors createBundle.test.ts) so the hoisted mock factory can
// resolve the spy that's defined just below.
const openConnectionMock = vi.fn();
vi.mock('../baseline/connection', () => ({
  OpenConnection: (...args: unknown[]) => openConnectionMock(...args),
    get openConnection() { return this.OpenConnection; },
}));

/** What the probe's `mssql` pool did: the config it was built with, the bound inputs, the SQL it ran. */
const probe = {
  construct: vi.fn(),
  connect: vi.fn(),
  query: vi.fn(),
  close: vi.fn(),
  inputs: [] as Array<[string, string]>,
};
vi.mock('mssql', () => ({
  default: {
    ConnectionPool: class {
      constructor(config: unknown) {
        probe.construct(config);
      }
      connect() {
        return probe.connect();
      }
      request() {
        const request = {
          input: (name: string, value: string) => {
            probe.inputs.push([name, value]);
            return request;
          },
          query: (command: string) => probe.query(command),
        };
        return request;
      }
      close() {
        return probe.close();
      }
    },
  },
}));

import { VerifyDatabaseConnection, type DbConnectionConfig } from '../lib/db-preflight';

const baseConfig: DbConnectionConfig = {
  dbPlatform: 'sqlserver',
  dbHost: 'localhost',
  dbPort: 1433,
  dbDatabase: 'TestDB',
  codeGenLogin: 'MJ_CodeGen',
  codeGenPassword: 'secret',
  dbEncrypt: true,
  dbTrustServerCertificate: false,
};

function fakeRunner(close = vi.fn().mockResolvedValue(undefined)) {
  return {
    query: vi.fn().mockResolvedValue([{ value: 1 }]),
    close,
    stream: vi.fn(),
    dialect: 'mssql' as const,
    database: 'TestDB',
  };
}

describe('verifyDatabaseConnection', () => {
  beforeEach(() => {
    openConnectionMock.mockReset();
    // By default the master probe cannot log in either — the wrong-password case.
    probe.construct.mockReset();
    probe.connect.mockReset().mockRejectedValue(new Error("Login failed for user 'MJ_CodeGen'."));
    probe.query.mockReset();
    probe.close.mockReset().mockResolvedValue(undefined);
    probe.inputs = [];
  });

  it('returns Ok and closes the connection on success', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    openConnectionMock.mockResolvedValue(fakeRunner(close));

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Ok).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('passes the configured encrypt/trust settings through to the connection', async () => {
    openConnectionMock.mockResolvedValue(fakeRunner());

    await VerifyDatabaseConnection(baseConfig);

    expect(openConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        Dialect: 'mssql',
        Host: 'localhost',
        User: 'MJ_CodeGen',
        encrypt: true,
        trustServerCertificate: false,
      }),
    );
  });

  it('maps postgresql platform to the postgres dialect', async () => {
    openConnectionMock.mockResolvedValue(fakeRunner());

    await VerifyDatabaseConnection({ ...baseConfig, dbPlatform: 'postgresql' });

    expect(openConnectionMock).toHaveBeenCalledWith(expect.objectContaining({ Dialect: 'postgres' }));
  });

  it('classifies a self-signed cert error and suggests trusting the cert when trust is off', async () => {
    openConnectionMock.mockRejectedValue(new Error('Failed to connect to localhost:1433 - self-signed certificate'));

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Ok).toBe(false);
    expect(result.Reason).toBe('tls-untrusted-cert');
    expect(result.Suggestion).toContain('DB_TRUST_SERVER_CERTIFICATE');
  });

  it('omits the trust suggestion when the cert is already trusted', async () => {
    openConnectionMock.mockRejectedValue(new Error('self-signed certificate'));

    const result = await VerifyDatabaseConnection({ ...baseConfig, dbTrustServerCertificate: true });

    expect(result.Reason).toBe('tls-untrusted-cert');
    expect(result.Suggestion).toBeUndefined();
  });

  it('classifies a login failure as auth when the master probe cannot log in either', async () => {
    openConnectionMock.mockRejectedValue(new Error("Login failed for user 'MJ_CodeGen'."));

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('auth');
    expect(result.Message).toBe("Login failed for user 'MJ_CodeGen'.");
    expect(result.Suggestion).toContain('codeGenLogin / codeGenPassword');
    expect(probe.close).toHaveBeenCalledTimes(1);
  });

  it('classifies a refused connection as unreachable', async () => {
    openConnectionMock.mockRejectedValue(new Error('Failed to connect to localhost:1433 - ECONNREFUSED 127.0.0.1:1433'));

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('unreachable');
  });

  it('falls back to "other" for an unrecognized error', async () => {
    openConnectionMock.mockRejectedValue(new Error('something unexpected'));

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('other');
    expect(result.Suggestion).toBeUndefined();
  });

  it('still returns the classified failure when close() throws after a query failure', async () => {
    const close = vi.fn().mockRejectedValue(new Error('close boom'));
    const runner = fakeRunner(close);
    runner.query = vi.fn().mockRejectedValue(new Error('self-signed certificate'));
    openConnectionMock.mockResolvedValue(runner);

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('tls-untrusted-cert');
    expect(close).toHaveBeenCalled();
  });
});

describe('verifyDatabaseConnection — missing database behind a SQL Server login failure', () => {
  const loginFailed = new Error("Login failed for user 'sa'.");

  beforeEach(() => {
    openConnectionMock.mockReset().mockRejectedValue(loginFailed);
    probe.construct.mockReset();
    probe.connect.mockReset().mockResolvedValue(undefined);
    probe.query.mockReset().mockResolvedValue({ recordset: [{ DatabaseId: null }] });
    probe.close.mockReset().mockResolvedValue(undefined);
    probe.inputs = [];
  });

  it('reports the database as missing when the login works against master but DB_ID is NULL', async () => {
    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Ok).toBe(false);
    expect(result.Reason).toBe('database-missing');
    expect(result.Message).toContain("Database 'TestDB' does not exist on localhost:1433");
    expect(result.Message).toContain("Login failed for user 'sa'.");
    expect(result.Suggestion).toContain('CREATE DATABASE [TestDB];');
    expect(result.Suggestion).toContain('mj-db-setup.sql');
    expect(result.Suggestion).not.toContain('codeGenPassword');
  });

  it('probes master with the same login and TLS settings, a short timeout, and a bound parameter', async () => {
    await VerifyDatabaseConnection(baseConfig);

    expect(probe.construct).toHaveBeenCalledTimes(1);
    const config = probe.construct.mock.calls[0][0] as {
      server: string; port: number; user: string; password: string; database: string;
      connectionTimeout: number; requestTimeout: number; options: { encrypt: boolean; trustServerCertificate: boolean };
    };
    expect(config).toMatchObject({
      server: 'localhost',
      port: 1433,
      user: 'MJ_CodeGen',
      password: 'secret',
      database: 'master',
      options: { encrypt: true, trustServerCertificate: false },
    });
    expect(config.connectionTimeout).toBeLessThanOrEqual(10_000);
    expect(config.requestTimeout).toBeLessThanOrEqual(10_000);
    expect(probe.inputs).toEqual([['db', 'TestDB']]);
    const sql = String(probe.query.mock.calls[0][0]);
    expect(sql).toContain('DB_ID(@db)');
    expect(sql).not.toContain('TestDB');
  });

  it('always closes the probe connection', async () => {
    await VerifyDatabaseConnection(baseConfig);
    expect(probe.close).toHaveBeenCalledTimes(1);
  });

  it('says the login cannot open an existing database instead of blaming the credentials', async () => {
    probe.query.mockResolvedValue({ recordset: [{ DatabaseId: 7 }] });

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('auth');
    expect(result.Message).toBe("Login failed for user 'sa'.");
    expect(result.Suggestion).toContain("database 'TestDB' exists");
    expect(result.Suggestion).not.toContain('codeGenPassword');
  });

  it('falls back to the credentials message when the probe query fails, and still closes', async () => {
    probe.query.mockRejectedValue(new Error('The SELECT permission was denied'));

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('auth');
    expect(result.Suggestion).toContain('codeGenLogin / codeGenPassword');
    expect(probe.close).toHaveBeenCalledTimes(1);
  });

  it('falls back when the probe returns no row', async () => {
    probe.query.mockResolvedValue({ recordset: [] });

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('auth');
    expect(result.Suggestion).toContain('codeGenLogin / codeGenPassword');
  });

  it('falls back, rather than throwing, when the probe pool cannot even be created', async () => {
    probe.construct.mockImplementation(() => {
      throw new Error('bad config');
    });

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('auth');
    expect(probe.close).not.toHaveBeenCalled();
  });

  it('keeps the original result when closing the probe connection fails', async () => {
    probe.close.mockRejectedValue(new Error('close boom'));

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('database-missing');
  });

  it('escapes a closing bracket in the suggested CREATE DATABASE', async () => {
    const result = await VerifyDatabaseConnection({ ...baseConfig, dbDatabase: 'My]DB' });

    expect(result.Suggestion).toContain('CREATE DATABASE [My]]DB];');
  });

  it('does not probe when the configured database is master', async () => {
    const result = await VerifyDatabaseConnection({ ...baseConfig, dbDatabase: 'master' });

    expect(result.Reason).toBe('auth');
    expect(probe.construct).not.toHaveBeenCalled();
  });

  it('does not probe a PostgreSQL login failure', async () => {
    openConnectionMock.mockRejectedValue(new Error('password authentication failed for user "MJ_CodeGen"'));

    const result = await VerifyDatabaseConnection({ ...baseConfig, dbPlatform: 'postgresql' });

    expect(result.Reason).toBe('auth');
    expect(probe.construct).not.toHaveBeenCalled();
  });

  it('does not probe a failure that is not a login failure', async () => {
    openConnectionMock.mockRejectedValue(new Error('Failed to connect to localhost:1433 - ECONNREFUSED 127.0.0.1:1433'));

    const result = await VerifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('unreachable');
    expect(probe.construct).not.toHaveBeenCalled();
  });
});
