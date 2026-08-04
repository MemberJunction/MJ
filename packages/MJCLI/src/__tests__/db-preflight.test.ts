/**
 * Tests for the database connection preflight. The SQL driver is mocked via the
 * `openConnection` helper, so no real database is touched — we drive it with the
 * error messages real drivers produce and assert the classification + suggestion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Lazy reference (mirrors createBundle.test.ts) so the hoisted mock factory can
// resolve the spy that's defined just below.
const openConnectionMock = vi.fn();
vi.mock('../baseline/connection', () => ({
  openConnection: (...args: unknown[]) => openConnectionMock(...args),
}));

import { verifyDatabaseConnection, type DbConnectionConfig } from '../lib/db-preflight';

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
  });

  it('returns Ok and closes the connection on success', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    openConnectionMock.mockResolvedValue(fakeRunner(close));

    const result = await verifyDatabaseConnection(baseConfig);

    expect(result.Ok).toBe(true);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('passes the configured encrypt/trust settings through to the connection', async () => {
    openConnectionMock.mockResolvedValue(fakeRunner());

    await verifyDatabaseConnection(baseConfig);

    expect(openConnectionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        dialect: 'mssql',
        host: 'localhost',
        user: 'MJ_CodeGen',
        encrypt: true,
        trustServerCertificate: false,
      }),
    );
  });

  it('maps postgresql platform to the postgres dialect', async () => {
    openConnectionMock.mockResolvedValue(fakeRunner());

    await verifyDatabaseConnection({ ...baseConfig, dbPlatform: 'postgresql' });

    expect(openConnectionMock).toHaveBeenCalledWith(expect.objectContaining({ dialect: 'postgres' }));
  });

  it('classifies a self-signed cert error and suggests trusting the cert when trust is off', async () => {
    openConnectionMock.mockRejectedValue(new Error('Failed to connect to localhost:1433 - self-signed certificate'));

    const result = await verifyDatabaseConnection(baseConfig);

    expect(result.Ok).toBe(false);
    expect(result.Reason).toBe('tls-untrusted-cert');
    expect(result.Suggestion).toContain('DB_TRUST_SERVER_CERTIFICATE');
  });

  it('omits the trust suggestion when the cert is already trusted', async () => {
    openConnectionMock.mockRejectedValue(new Error('self-signed certificate'));

    const result = await verifyDatabaseConnection({ ...baseConfig, dbTrustServerCertificate: true });

    expect(result.Reason).toBe('tls-untrusted-cert');
    expect(result.Suggestion).toBeUndefined();
  });

  it('classifies a login failure as auth', async () => {
    openConnectionMock.mockRejectedValue(new Error("Login failed for user 'MJ_CodeGen'."));

    const result = await verifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('auth');
  });

  it('classifies a refused connection as unreachable', async () => {
    openConnectionMock.mockRejectedValue(new Error('Failed to connect to localhost:1433 - ECONNREFUSED 127.0.0.1:1433'));

    const result = await verifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('unreachable');
  });

  it('falls back to "other" for an unrecognized error', async () => {
    openConnectionMock.mockRejectedValue(new Error('something unexpected'));

    const result = await verifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('other');
    expect(result.Suggestion).toBeUndefined();
  });

  it('still returns the classified failure when close() throws after a query failure', async () => {
    const close = vi.fn().mockRejectedValue(new Error('close boom'));
    const runner = fakeRunner(close);
    runner.query = vi.fn().mockRejectedValue(new Error('self-signed certificate'));
    openConnectionMock.mockResolvedValue(runner);

    const result = await verifyDatabaseConnection(baseConfig);

    expect(result.Reason).toBe('tls-untrusted-cert');
    expect(close).toHaveBeenCalled();
  });
});
