import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TrainingDelegation } from '../delegation';
import { PredictiveStudioStorage } from '../../storage/ps-storage-provider';
import { FakeFilesTable, MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders, TestUser } from '../../__tests__/fakes/storage-fakes';

const log: string[] = [];
const bucket = new MemoryStorageAccount('bucket', log);
RegisterMemoryStorage('PS Delegation Storage Test Bucket', bucket);
const bucketRow = ProviderRow('1A7F6C8B-93A4-45B6-80C1-3C4D5E6F7081', 'Delegation Bucket', 'PS Delegation Storage Test Bucket', false);

describe('TrainingDelegation.BuildTrainingDeps storage', () => {
  let savedEnv: string | undefined;
  beforeEach(() => {
    savedEnv = process.env[PredictiveStudioStorage.ENV_VAR];
    process.env[PredictiveStudioStorage.ENV_VAR] = 'Delegation Bucket';
    log.length = 0;
    bucket.Reset();
    ServeStorageProviders([bucketRow]);
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env[PredictiveStudioStorage.ENV_VAR];
    else process.env[PredictiveStudioStorage.ENV_VAR] = savedEnv;
  });

  it('shares one storage provider resolution between the snapshot store and the artifact store', async () => {
    const deps = await TrainingDelegation.BuildTrainingDeps(new FakeFilesTable(log).Provider(), TestUser);
    await deps.artifactStore.AssertWritable();
    expect(await deps.snapshotFiles?.ProviderID()).toBe(bucketRow.ID);
    expect(bucket.Initializations).toBe(1);
  });

  it('refuses through the artifact store when the configured provider is not configured on this server', async () => {
    bucket.Configured = false;
    const deps = await TrainingDelegation.BuildTrainingDeps(new FakeFilesTable(log).Provider(), TestUser);
    await expect(deps.artifactStore.AssertWritable()).rejects.toThrow(/"Delegation Bucket" is not configured on this server.*PS_STORAGE_PROVIDER/);
  });
});
