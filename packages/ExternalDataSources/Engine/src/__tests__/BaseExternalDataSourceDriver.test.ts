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
  public exposeAssertSecureTransport(opts: { host?: string; tlsEnabled: boolean; allowInsecure?: boolean; dataSourceName: string }) {
    return this.assertSecureTransport(opts);
  }
  public exposeRedactConnectionSecrets(msg: string) {
    return this.redactConnectionSecrets(msg);
  }
  public exposeNormalizeValue(v: unknown) {
    return this.normalizeValue(v);
  }
  public exposeNormalizeRows<T extends Record<string, unknown>>(rows: T[]) {
    return this.normalizeRows(rows);
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
    it('flags auth/credential failures by message', () => {
      for (const m of [
        'password authentication failed for user "x"', // matched via 'authentic'
        'Authentication failed.',
        'not authorized on db to execute command',
        'invalid credential',
        'login failed for user',
        'access denied for user',
        'SQLSTATE 28P01',
      ]) {
        expect(driver.exposeIsAuthError(new Error(m))).toBe(true);
      }
    });

    it('flags auth failures by structured vendor error code (preferred over message text)', () => {
      expect(driver.exposeIsAuthError({ code: '28P01' })).toBe(true);     // PostgreSQL
      expect(driver.exposeIsAuthError({ errno: 1045 })).toBe(true);       // MySQL ER_ACCESS_DENIED_ERROR
      expect(driver.exposeIsAuthError({ number: 18456 })).toBe(true);     // SQL Server login failed
      expect(driver.exposeIsAuthError({ errorNum: 1017 })).toBe(true);    // Oracle invalid username/password
    });

    it('does not flag query / network errors', () => {
      for (const m of [
        'relation "foo" does not exist',
        'syntax error at or near "SELCT"',
        'connection timeout',
        'ECONNREFUSED 127.0.0.1:5432',
        // Object-level "permission denied" (not a credential failure) and a table literally named
        // "password_resets" must NOT be treated as auth errors — these are the false positives the
        // structured-code-first approach deliberately avoids.
        'permission denied for relation foo',
        'relation "password_resets" does not exist',
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

  describe('assertSecureTransport (secure-by-default)', () => {
    const call = (over: Partial<{ host: string; tlsEnabled: boolean; allowInsecure: boolean }>) =>
      () => driver.exposeAssertSecureTransport({ host: 'db.example.com', tlsEnabled: false, allowInsecure: false, dataSourceName: 'X', ...over });

    it('allows loopback hosts over plaintext (dev convenience)', () => {
      for (const host of ['localhost', 'db.localhost', '127.0.0.1', '127.0.0.5', '::1', '[::1]']) {
        expect(call({ host })).not.toThrow();
      }
    });

    it('fails closed on an empty / unparseable host (not assumed local)', () => {
      for (const host of ['', '   ', undefined as unknown as string]) {
        expect(call({ host })).toThrow(/unencrypted connection/);
      }
    });

    it('refuses a non-local host over plaintext with no opt-out', () => {
      expect(call({ host: 'db.example.com' })).toThrow(/unencrypted connection/);
    });

    it('allows a non-local host when TLS is enabled', () => {
      expect(call({ host: 'db.example.com', tlsEnabled: true })).not.toThrow();
    });

    it('allows a non-local plaintext host only with the explicit allowInsecureTransport opt-out', () => {
      expect(call({ host: 'db.example.com', allowInsecure: true })).not.toThrow();
    });

    it('requires a STRICT boolean true — a mistyped truthy string "false" does NOT disable the gate', () => {
      expect(() => driver.exposeAssertSecureTransport({
        host: 'db.example.com', tlsEnabled: false,
        allowInsecure: 'false' as unknown as boolean, dataSourceName: 'X',
      })).toThrow(/unencrypted connection/);
    });
  });

  describe('redactConnectionSecrets', () => {
    it('strips inline user:pass credentials from a connection URI in an error message', () => {
      const msg = 'failed to connect to mongodb://alice:s3cr3t@cluster0.example.com:27017/db';
      const out = driver.exposeRedactConnectionSecrets(msg);
      expect(out).toContain('mongodb://***@cluster0.example.com:27017/db');
      expect(out).not.toContain('s3cr3t');
      expect(out).not.toContain('alice');
    });

    it('redacts a token-only userinfo (no colon) too', () => {
      expect(driver.exposeRedactConnectionSecrets('postgres://TOKEN@host/db')).toBe('postgres://***@host/db');
    });

    it('leaves a URL with no credentials untouched', () => {
      expect(driver.exposeRedactConnectionSecrets('mongodb://cluster0.example.com:27017/db')).toBe('mongodb://cluster0.example.com:27017/db');
    });

    it('passes through a plain error message with no URI', () => {
      expect(driver.exposeRedactConnectionSecrets('ECONNREFUSED 10.0.0.1:5432')).toBe('ECONNREFUSED 10.0.0.1:5432');
    });
  });

  describe('normalizeValue', () => {
    it('passes null and undefined through untouched', () => {
      expect(driver.exposeNormalizeValue(null)).toBeNull();
      expect(driver.exposeNormalizeValue(undefined)).toBeUndefined();
    });

    it('stringifies a native bigint (lossless for values past 2^53)', () => {
      expect(driver.exposeNormalizeValue(9223372036854775807n)).toBe('9223372036854775807');
    });

    it('leaves plain primitives (number / string / boolean) as-is', () => {
      expect(driver.exposeNormalizeValue(42)).toBe(42);
      expect(driver.exposeNormalizeValue('hi')).toBe('hi');
      expect(driver.exposeNormalizeValue(true)).toBe(true);
    });

    it('preserves Date and Buffer instances by reference (not JSON-stringified)', () => {
      const d = new Date('2024-06-01T12:00:00Z');
      const b = Buffer.from([0xde, 0xad]);
      expect(driver.exposeNormalizeValue(d)).toBe(d);
      expect(driver.exposeNormalizeValue(b)).toBe(b);
    });

    it('JSON-stringifies a plain object (JSON/JSONB/VARIANT columns typed as text)', () => {
      expect(driver.exposeNormalizeValue({ k: 'v', n: 42 })).toBe('{"k":"v","n":42}');
      expect(driver.exposeNormalizeValue([1, 2, 3])).toBe('[1,2,3]');
    });

    it('unwraps a BSON Long / Decimal128 / ObjectId to its string form', () => {
      const long = { _bsontype: 'Long', toString: () => '9223372036854775807' };
      const dec = { _bsontype: 'Decimal128', toString: () => '12345678901234.5678' };
      const oid = { _bsontype: 'ObjectId', toString: () => '507f1f77bcf86cd799439011' };
      expect(driver.exposeNormalizeValue(long)).toBe('9223372036854775807');
      expect(driver.exposeNormalizeValue(dec)).toBe('12345678901234.5678');
      expect(driver.exposeNormalizeValue(oid)).toBe('507f1f77bcf86cd799439011');
    });

    it('unwraps a BSON Binary to its Buffer', () => {
      const buf = Buffer.from([1, 2, 3]);
      const bin = { _bsontype: 'Binary', buffer: buf };
      expect(driver.exposeNormalizeValue(bin)).toBe(buf);
    });

    it('unwraps a BSON Double / Int32 to a native number via valueOf', () => {
      expect(driver.exposeNormalizeValue({ _bsontype: 'Double', valueOf: () => 3.14 })).toBe(3.14);
      expect(driver.exposeNormalizeValue({ _bsontype: 'Int32', valueOf: () => 7 })).toBe(7);
    });
  });

  describe('normalizeRows', () => {
    it('normalizes every value across every row in place and returns the same array', () => {
      const rows = [
        { a: 10n, b: { k: 'v' }, c: 'text' },
        { a: 20n, b: [1, 2], c: null },
      ];
      const result = driver.exposeNormalizeRows(rows);
      expect(result).toBe(rows);
      expect(rows[0]).toEqual({ a: '10', b: '{"k":"v"}', c: 'text' });
      expect(rows[1]).toEqual({ a: '20', b: '[1,2]', c: null });
    });

    it('handles an empty row set', () => {
      expect(driver.exposeNormalizeRows([])).toEqual([]);
    });
  });
});
