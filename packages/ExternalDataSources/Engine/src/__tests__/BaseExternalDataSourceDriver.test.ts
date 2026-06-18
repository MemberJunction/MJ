import { describe, it, expect } from 'vitest';
import { BaseExternalDataSourceDriver } from '../BaseExternalDataSourceDriver';
import type { MJExternalDataSourceEntity } from '@memberjunction/core-entities';
import type {
  ExternalConnectionTestResult,
  ExternalSchemaDescriptor,
  ExternalViewResult,
  ExternalQueryResult,
  ExternalRow,
} from '../types';

/**
 * Minimal concrete driver that stubs the abstract contract and exposes the
 * protected helpers so we can exercise them directly.
 */
class TestExternalDriver extends BaseExternalDataSourceDriver<{ fake: true }> {
  async TestConnection(): Promise<ExternalConnectionTestResult> {
    return { success: true, message: 'ok', testedAt: new Date() };
  }
  async IntrospectSchema(): Promise<ExternalSchemaDescriptor> {
    return { objects: [] };
  }
  async RunView<TRow extends ExternalRow = ExternalRow>(): Promise<ExternalViewResult<TRow>> {
    return { success: true, rows: [], executionTimeMs: 0 };
  }
  async LoadSingle<TRow extends ExternalRow = ExternalRow>(): Promise<TRow | null> {
    return null;
  }
  async RunNativeQuery<TRow extends ExternalRow = ExternalRow>(): Promise<ExternalQueryResult<TRow>> {
    return { success: true, rows: [], rowCount: 0, executionTimeMs: 0 };
  }
  protected async getConnection(): Promise<{ fake: true }> {
    return { fake: true };
  }

  /** Tracks invalidateConnection calls so tests can assert self-heal behavior. */
  public invalidateCalls: string[] = [];
  protected async invalidateConnection(dataSourceId: string): Promise<void> {
    this.invalidateCalls.push(dataSourceId);
  }

  // Public passthroughs to the protected helpers under test.
  public exposeParseConnectionConfig(ds: MJExternalDataSourceEntity) {
    return this.parseConnectionConfig(ds);
  }
  public exposeResolveCredential(ds: MJExternalDataSourceEntity) {
    return this.resolveCredential(ds);
  }
  public exposeWithConnectionRetry<T>(ds: MJExternalDataSourceEntity, op: () => Promise<T>): Promise<T> {
    return this.withConnectionRetry(ds, op);
  }
  public exposeIsAuthError(e: unknown): boolean {
    return this.isAuthError(e);
  }
}

// Test fixture — only the fields the helpers read. Cast through unknown is the
// accepted pattern for entity fixtures in unit tests (no provider available).
const makeDataSource = (over: Partial<MJExternalDataSourceEntity>): MJExternalDataSourceEntity =>
  ({ Name: 'Test Source', ConnectionConfig: null, CredentialID: null, ...over } as unknown as MJExternalDataSourceEntity);

describe('BaseExternalDataSourceDriver', () => {
  const driver = new TestExternalDriver();

  describe('parseConnectionConfig', () => {
    it('returns an empty object when ConnectionConfig is null', () => {
      expect(driver.exposeParseConnectionConfig(makeDataSource({ ConnectionConfig: null }))).toEqual({});
    });

    it('parses a valid JSON config blob', () => {
      const ds = makeDataSource({ ConnectionConfig: '{"host":"db.example.com","port":5432}' });
      expect(driver.exposeParseConnectionConfig(ds)).toEqual({ host: 'db.example.com', port: 5432 });
    });

    it('throws a clear error on malformed JSON', () => {
      const ds = makeDataSource({ ConnectionConfig: '{not valid json' });
      expect(() => driver.exposeParseConnectionConfig(ds)).toThrow(/invalid ConnectionConfig JSON/);
    });
  });

  describe('resolveCredential', () => {
    it('returns null when the data source has no CredentialID (no Credential Engine call)', async () => {
      await expect(driver.exposeResolveCredential(makeDataSource({ CredentialID: null }))).resolves.toBeNull();
    });
  });

  describe('isAuthError', () => {
    it('flags auth/credential failures', () => {
      for (const m of [
        'password authentication failed for user "x"',
        'Authentication failed.',
        'not authorized on db to execute command',
        'invalid credential',
        'login failed for user',
        'permission denied for relation foo',
        'SQLSTATE 28P01',
      ]) {
        expect(driver.exposeIsAuthError(new Error(m))).toBe(true);
      }
    });

    it('does not flag query / network errors', () => {
      for (const m of [
        'relation "foo" does not exist',
        'syntax error at or near "SELCT"',
        'connection timeout',
        'ECONNREFUSED 127.0.0.1:5432',
      ]) {
        expect(driver.exposeIsAuthError(new Error(m))).toBe(false);
      }
    });
  });

  describe('withConnectionRetry (auth self-heal)', () => {
    const ds = makeDataSource({ ID: 'ds-1' });

    it('returns the result with no retry on success', async () => {
      const d = new TestExternalDriver();
      let calls = 0;
      const r = await d.exposeWithConnectionRetry(ds, async () => { calls++; return 'ok'; });
      expect(r).toBe('ok');
      expect(calls).toBe(1);
      expect(d.invalidateCalls).toEqual([]);
    });

    it('rethrows a non-auth error immediately — no invalidate, no retry', async () => {
      const d = new TestExternalDriver();
      let calls = 0;
      await expect(d.exposeWithConnectionRetry(ds, async () => { calls++; throw new Error('syntax error'); }))
        .rejects.toThrow('syntax error');
      expect(calls).toBe(1);
      expect(d.invalidateCalls).toEqual([]);
    });

    it('on an auth error, invalidates the connection and retries once (recovers)', async () => {
      const d = new TestExternalDriver();
      let calls = 0;
      const r = await d.exposeWithConnectionRetry(ds, async () => {
        calls++;
        if (calls === 1) throw new Error('password authentication failed');
        return 'recovered';
      });
      expect(r).toBe('recovered');
      expect(calls).toBe(2);
      expect(d.invalidateCalls).toEqual(['ds-1']);
    });

    it('retries only once — a persistent auth error still throws after one retry', async () => {
      const d = new TestExternalDriver();
      let calls = 0;
      await expect(d.exposeWithConnectionRetry(ds, async () => { calls++; throw new Error('authentication failed'); }))
        .rejects.toThrow(/authentication failed/);
      expect(calls).toBe(2); // original attempt + exactly one retry
      expect(d.invalidateCalls).toEqual(['ds-1']);
    });
  });
});
