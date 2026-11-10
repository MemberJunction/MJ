import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PredictiveStudioStorage } from '../ps-storage-provider';
import { FakeFilesTable, MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders, TestUser } from '../../__tests__/fakes/storage-fakes';

const log: string[] = [];
const local = new MemoryStorageAccount('local', log);
const archive = new MemoryStorageAccount('archive', log);
RegisterMemoryStorage('PS Storage Test Local', local);
RegisterMemoryStorage('PS Storage Test Archive', archive);
const localRow = ProviderRow('5A1F0C2B-3D4E-4F50-8A6B-7C8D9E0F1A2B', 'Local File System', 'PS Storage Test Local', true);
const archiveRow = ProviderRow('6B2A1D3C-4E5F-4061-9B7C-8D9E0F1A2B3C', 'Archive Bucket', 'PS Storage Test Archive', false);

describe('PredictiveStudioStorage', () => {
  let savedEnv: string | undefined;
  const storage = (providerName?: string): PredictiveStudioStorage => new PredictiveStudioStorage(new FakeFilesTable(log).Provider(), TestUser, providerName);
  beforeEach(() => {
    savedEnv = process.env[PredictiveStudioStorage.ENV_VAR];
    delete process.env[PredictiveStudioStorage.ENV_VAR];
    log.length = 0;
    local.Reset();
    archive.Reset();
    ServeStorageProviders([localRow, archiveRow]);
  });
  afterEach(() => {
    if (savedEnv === undefined) delete process.env[PredictiveStudioStorage.ENV_VAR];
    else process.env[PredictiveStudioStorage.ENV_VAR] = savedEnv;
  });

  it('resolves the provider named by PS_STORAGE_PROVIDER', async () => {
    process.env.PS_STORAGE_PROVIDER = 'archive bucket';
    expect((await storage().ConfiguredDriver()).Provider.ID).toBe(archiveRow.ID);
  });

  it('defaults to Local File System', async () => {
    expect(PredictiveStudioStorage.DEFAULT_PROVIDER_NAME).toBe('Local File System');
    expect((await storage().ConfiguredDriver()).Provider.ID).toBe(localRow.ID);
  });

  it('an empty PS_STORAGE_PROVIDER means the default', async () => {
    process.env.PS_STORAGE_PROVIDER = '';
    expect((await storage().ConfiguredDriver()).Provider.ID).toBe(localRow.ID);
  });

  it('selects an inactive provider by name', async () => {
    const binding = await storage('Archive Bucket').ConfiguredDriver();
    expect(binding.Provider.IsActive).toBe(false);
    expect(binding.Provider.ID).toBe(archiveRow.ID);
  });

  it('refuses an unknown provider name', async () => {
    await expect(storage('Missing Bucket').ConfiguredDriver()).rejects.toThrow(/"Missing Bucket".*PS_STORAGE_PROVIDER/);
  });

  it('refuses an unconfigured provider', async () => {
    local.Configured = false;
    await expect(storage().ConfiguredDriver()).rejects.toThrow(/"Local File System" is not configured on this server.*PS_STORAGE_PROVIDER/);
  });

  it('resolves each read provider once', async () => {
    const s = storage();
    const first = await s.DriverFor(archiveRow.ID);
    const second = await s.DriverFor(archiveRow.ID.toLowerCase());
    expect(second.Driver).toBe(first.Driver);
    expect(archive.Initializations).toBe(1);
  });
});
