/**
 * Unit tests for AWSFileStorage's Dispose() override.
 *
 * Regression coverage for the memory-leak audit finding: FileStorageEngine.RefreshDriverCache()
 * used to drop every cached driver (including AWSFileStorage's live S3Client, holding a
 * keep-alive socket pool) with no disposal call. AWSFileStorage.Dispose() releases the client;
 * FileStorageEngine's own disposeCachedDrivers() plumbing is covered separately in
 * FileStorageEngine.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { S3Client } from '@aws-sdk/client-s3';

describe('AWSFileStorage.Dispose', () => {
  beforeEach(() => {
    // The AWS driver constructor reads required env vars. Provide dummy values so it can
    // construct; no real AWS calls are made in this test.
    process.env.STORAGE_AWS_REGION = 'us-east-1';
    process.env.STORAGE_AWS_BUCKET_NAME = 'unit-test-bucket';
    process.env.STORAGE_AWS_ACCESS_KEY_ID = 'AKIA_TEST';
    process.env.STORAGE_AWS_SECRET_ACCESS_KEY = 'secret_test';
  });

  it('destroys the underlying S3Client', async () => {
    const destroySpy = vi.spyOn(S3Client.prototype, 'destroy');
    const { AWSFileStorage } = await import('../drivers/AWSFileStorage');
    const driver = new AWSFileStorage();

    driver.Dispose();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    destroySpy.mockRestore();
  });

  it('is safe to call before the client would ever be used', async () => {
    const { AWSFileStorage } = await import('../drivers/AWSFileStorage');
    const driver = new AWSFileStorage();

    expect(() => driver.Dispose()).not.toThrow();
  });

  it('destroys the client created at construction time even without calling initialize()', async () => {
    // The constructor eagerly builds an S3Client from env/config; Dispose() must release
    // that instance even if initialize(config) - which rebuilds the client - was never called.
    const destroySpy = vi.spyOn(S3Client.prototype, 'destroy');
    const { AWSFileStorage } = await import('../drivers/AWSFileStorage');
    const driver = new AWSFileStorage();

    driver.Dispose();

    expect(destroySpy).toHaveBeenCalledTimes(1);
    destroySpy.mockRestore();
  });
});
