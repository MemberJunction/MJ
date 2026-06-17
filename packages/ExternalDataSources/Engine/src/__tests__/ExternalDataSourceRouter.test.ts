import { describe, it, expect, beforeEach } from 'vitest';
import { ExternalDataSourceRouter } from '../ExternalDataSourceRouter';

describe('ExternalDataSourceRouter', () => {
  beforeEach(() => {
    ExternalDataSourceRouter.Instance.clearCache();
  });

  it('is a process-wide singleton', () => {
    expect(ExternalDataSourceRouter.Instance).toBe(ExternalDataSourceRouter.Instance);
  });

  it('throws when no metadata provider is available and none is passed', async () => {
    // In the unit-test environment no global provider is configured, so
    // Metadata.Provider is undefined and resolve() should fail fast.
    await expect(
      ExternalDataSourceRouter.Instance.resolve('00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/No metadata provider available/);
  });

  it('clearCache is a no-op on an empty cache (with and without an id)', () => {
    expect(() => ExternalDataSourceRouter.Instance.clearCache()).not.toThrow();
    expect(() => ExternalDataSourceRouter.Instance.clearCache('00000000-0000-0000-0000-000000000000')).not.toThrow();
  });
});
