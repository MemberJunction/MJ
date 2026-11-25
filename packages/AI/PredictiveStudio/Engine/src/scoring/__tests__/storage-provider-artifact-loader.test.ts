import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageProviderArtifactLoader } from '../storage-provider-artifact-loader';
import { LocalArtifactPath } from '../../training/artifact-store';
import { FakeFilesTable, MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders, TestUser } from '../../__tests__/fakes/storage-fakes';

const log: string[] = [];
const local = new MemoryStorageAccount('local', log);
const cloud = new MemoryStorageAccount('cloud', log);
RegisterMemoryStorage('PS Artifact Loader Test Local', local);
RegisterMemoryStorage('PS Artifact Loader Test Cloud', cloud);
const localRow = ProviderRow('9E5D4A6F-7182-4394-8EAF-1A2B3C4D5E6F', 'Local File System', 'PS Artifact Loader Test Local', true);
const cloudRow = ProviderRow('0F6E5B7A-8293-44A5-9FB0-2B3C4D5E6F70', 'Cloud Bucket', 'PS Artifact Loader Test Cloud', false);
const bytes = new TextEncoder().encode('{"model":"bytes"}');
const fileId = 'A1B2C3D4-0000-4000-8000-0000000000AA';
const key = `predictive-studio/model-artifacts/1F2E3D4C-0000-4000-8000-000000000001/trainer-r1-c1.json`;

describe('StorageProviderArtifactLoader', () => {
  let files: FakeFilesTable;
  let baseDir = '';
  let savedArtifactDir: string | undefined;
  let savedProvider: string | undefined;
  const loader = new StorageProviderArtifactLoader();
  const insert = (providerId: string, providerKey: string | null): void =>
    files.Insert({ ID: fileId, Name: 'trainer-r1-c1.json', ContentType: 'application/json', ProviderID: providerId, ProviderKey: providerKey, Status: 'Uploaded', Description: null });
  beforeEach(() => {
    log.length = 0;
    local.Reset();
    cloud.Reset();
    ServeStorageProviders([localRow, cloudRow]);
    files = new FakeFilesTable(log);
    baseDir = mkdtempSync(join(tmpdir(), 'ps-legacy-artifacts-'));
    savedArtifactDir = process.env.PS_ARTIFACT_DIR;
    savedProvider = process.env.PS_STORAGE_PROVIDER;
    process.env.PS_ARTIFACT_DIR = baseDir;
    delete process.env.PS_STORAGE_PROVIDER;
  });
  afterEach(() => {
    for (const [name, value] of [['PS_ARTIFACT_DIR', savedArtifactDir], ['PS_STORAGE_PROVIDER', savedProvider]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(baseDir, { recursive: true, force: true });
  });

  it("loads through the row's provider", async () => {
    insert(localRow.ID, key);
    local.Objects.set(key, bytes);
    expect(await loader.load(fileId, TestUser, files.Provider())).toEqual({ Kind: 'read', Bytes: bytes });
  });

  it("reads through the row's provider, not the configured one", async () => {
    process.env.PS_STORAGE_PROVIDER = 'Local File System';
    insert(cloudRow.ID, key);
    cloud.Objects.set(key, bytes);
    expect(await loader.load(fileId, TestUser, files.Provider())).toEqual({ Kind: 'read', Bytes: bytes });
    expect(log).toEqual([`cloud.get ${key}`]);
    expect(local.Initializations).toBe(0);
  });

  it('loads a legacy file from local disk', async () => {
    insert(localRow.ID, '');
    writeFileSync(LocalArtifactPath(baseDir, fileId), bytes);
    expect(await loader.load(fileId, TestUser, files.Provider())).toEqual({ Kind: 'read', Bytes: bytes });
    expect(log).toEqual([]);
  });

  it('returns absent, naming the file, for an unknown file id', async () => {
    expect(await loader.load(fileId, TestUser, files.Provider())).toEqual({ Kind: 'absent', FileID: fileId });
  });

  it('returns absent for a legacy file whose bytes are gone', async () => {
    insert(localRow.ID, null);
    expect(await loader.load(fileId, TestUser, files.Provider())).toEqual({ Kind: 'absent', FileID: fileId });
  });

  it('returns absent for a stored object that is gone', async () => {
    insert(localRow.ID, key);
    expect(await loader.load(fileId, TestUser, files.Provider())).toEqual({ Kind: 'absent', FileID: fileId });
  });

  it('reads the file row as the acting user it is given (the user is a required parameter, not refused at runtime)', async () => {
    insert(localRow.ID, key);
    local.Objects.set(key, bytes);
    expect(await loader.load(fileId, TestUser, files.Provider())).toEqual({ Kind: 'read', Bytes: bytes });
    expect(files.ReadUsers).toEqual([TestUser]);
  });
});
