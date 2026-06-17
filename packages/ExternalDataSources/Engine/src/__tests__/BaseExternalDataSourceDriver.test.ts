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

  // Public passthroughs to the protected helpers under test.
  public exposeParseConnectionConfig(ds: MJExternalDataSourceEntity) {
    return this.parseConnectionConfig(ds);
  }
  public exposeResolveCredential(ds: MJExternalDataSourceEntity) {
    return this.resolveCredential(ds);
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
});
