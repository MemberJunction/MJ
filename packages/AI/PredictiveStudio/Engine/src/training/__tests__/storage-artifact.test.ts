import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { Metadata, type BaseEntity, type IMetadataProvider, type UserInfo } from '@memberjunction/core';

/**
 * Cross-host artifact round-trip (#4991). A model trained on one host must score on
 * another host that shares the database and the storage provider, and must keep
 * scoring after the training host's temp directory is cleared.
 *
 * Two shared backends stand in for what every host sees:
 *  - `bucket` — the storage provider's object store, reached only through the
 *    mocked `FileStorageEngine` driver;
 *  - `fileTable` — the `MJ: Files` table, written by the training side's entity
 *    factory and read by the scoring side through `Metadata.Provider`.
 *
 * Nothing else is shared: each "host" gets its own `PS_ARTIFACT_DIR`.
 */

const { bucket, putObjectMock, getObjectMock, deleteObjectMock, engineMock } = vi.hoisted(() => {
  const objects = new Map<string, Buffer>();
  const put = vi.fn(async (objectName: string, data: Buffer) => {
    objects.set(objectName, Buffer.from(data));
    return true;
  });
  const get = vi.fn(async (params: { fullPath?: string }) => {
    const data = params.fullPath ? objects.get(params.fullPath) : undefined;
    if (!data) {
      throw new Error(`object '${params.fullPath}' not found`);
    }
    return data;
  });
  const remove = vi.fn(async (objectName: string) => objects.delete(objectName));
  const driver = { PutObject: put, GetObject: get, DeleteObject: remove };
  // The preferred provider's account, and a different default account, so a test can tell which was used.
  const account = { ID: 'ACCOUNT-1', Name: 'Shared bucket', ProviderID: 'PROVIDER-1' };
  const provider = { ID: 'PROVIDER-1', Name: 'Shared provider', IsActive: true };
  const defaultAccount = { ID: 'ACCOUNT-DEFAULT', Name: 'Default bucket', ProviderID: 'PROVIDER-DEFAULT' };
  const defaultProvider = { ID: 'PROVIDER-DEFAULT', Name: 'Default provider', IsActive: true };
  const engine = {
    Config: vi.fn(async () => undefined),
    ResolveStorageAccount: vi.fn((): { account: typeof account; provider: typeof provider } | null => ({
      account: defaultAccount,
      provider: defaultProvider,
    })),
    GetAccountsByProviderID: vi.fn((providerId: string) => (providerId === provider.ID ? [account] : [])),
    GetDriver: vi.fn(async () => driver),
  };
  return { bucket: objects, putObjectMock: put, getObjectMock: get, deleteObjectMock: remove, engineMock: engine };
});

vi.mock('@memberjunction/storage', () => ({
  FileStorageEngine: { Instance: engineMock },
}));

import { ARTIFACT_OBJECT_PREFIX, BuildArtifactObjectKey, BuildArtifactStore, LocalArtifactPath, MJFilesArtifactStore } from '../artifact-store';
import { InMemoryArtifactLoader, MJStorageArtifactLoader } from '../../scoring/artifact-loader';
import { BuildProductionMLInferenceDeps } from '../../operations/delegation';
import type { IEntityFactory } from '../types';

type FileRecord = {
  ID: string;
  Name: string;
  ContentType: string | null;
  ProviderID: string | null;
  ProviderKey: string | null;
  Status: string;
  Description: string | null;
};

/** The shared `MJ: Files` table every host reads and writes. */
const fileTable = new Map<string, FileRecord>();

/** When true, the next {@link FakeFile.Save} fails (and resets the flag). */
let failNextSave = false;

/** A minimal `MJ: Files` stand-in backed by {@link fileTable}. */
class FakeFile {
  public ID = '';
  public Name = '';
  public ContentType: string | null = null;
  public ProviderID: string | null = null;
  public ProviderKey: string | null = null;
  public Status = 'Pending';
  public Description: string | null = null;
  public LatestResult: { CompleteMessage: string } | null = null;

  public NewRecord(): boolean {
    return true;
  }

  public async Save(): Promise<boolean> {
    if (failNextSave) {
      failNextSave = false;
      this.LatestResult = { CompleteMessage: 'forced save failure' };
      return false;
    }
    if (!this.ID) {
      this.ID = randomUUID().toUpperCase();
    }
    fileTable.set(this.ID, {
      ID: this.ID,
      Name: this.Name,
      ContentType: this.ContentType,
      ProviderID: this.ProviderID,
      ProviderKey: this.ProviderKey,
      Status: this.Status,
      Description: this.Description,
    });
    return true;
  }

  public async Load(id: string): Promise<boolean> {
    const row = fileTable.get(id);
    if (!row) {
      return false;
    }
    Object.assign(this, row);
    return true;
  }

  public async Delete(): Promise<boolean> {
    return fileTable.delete(this.ID);
  }
}

/** Training-side entity factory — creates File rows in the shared table. */
class SharedFileFactory implements IEntityFactory {
  async getEntityObject<T extends BaseEntity>(entityName: string, _contextUser?: UserInfo): Promise<T> {
    if (entityName !== 'MJ: Files') {
      throw new Error(`SharedFileFactory: unexpected entity ${entityName}`);
    }
    return new FakeFile() as unknown as T;
  }
}

/** Scoring-side metadata provider — reads File rows from the shared table. */
const sharedMetadataProvider = {
  GetEntityObject: async (entityName: string) => {
    if (entityName !== 'MJ: Files') {
      throw new Error(`sharedMetadataProvider: unexpected entity ${entityName}`);
    }
    return new FakeFile();
  },
} as unknown as IMetadataProvider;

const user = { ID: 'USER-1', Email: 'trainer@example.com' } as unknown as UserInfo;
const modelBytes = new Uint8Array([7, 1, 9, 9, 4, 2, 0, 255]);

describe('Predictive Studio model artifacts live in the storage provider (#4991)', () => {
  const scratchDirs: string[] = [];
  const previousArtifactDir = process.env.PS_ARTIFACT_DIR;
  let previousProvider: IMetadataProvider | undefined;

  async function newHostDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'ps-host-'));
    scratchDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    bucket.clear();
    fileTable.clear();
    failNextSave = false;
    vi.clearAllMocks();
    previousProvider = Metadata.Provider;
    Metadata.Provider = sharedMetadataProvider;
  });

  afterEach(async () => {
    Metadata.Provider = previousProvider as IMetadataProvider;
    if (previousArtifactDir === undefined) {
      delete process.env.PS_ARTIFACT_DIR;
    } else {
      process.env.PS_ARTIFACT_DIR = previousArtifactDir;
    }
    while (scratchDirs.length > 0) {
      const dir = scratchDirs.pop();
      if (dir) {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it('a model trained on one host scores on another host sharing the database and storage provider', async () => {
    // Host A trains.
    process.env.PS_ARTIFACT_DIR = await newHostDir();
    const fileId = await BuildArtifactStore('PROVIDER-1', new SharedFileFactory()).save(modelBytes, 'model-pipeline-v1.bin', user);

    // Host B scores: same DB, same provider, its own (empty) local disk.
    process.env.PS_ARTIFACT_DIR = await newHostDir();
    const loaded = await BuildProductionMLInferenceDeps().artifactLoader.load(fileId, user);

    expect(loaded).not.toBeNull();
    expect(Array.from(loaded ?? [])).toEqual(Array.from(modelBytes));
  });

  it("clearing the training host's temp directory does not break scoring", async () => {
    const hostDir = await newHostDir();
    process.env.PS_ARTIFACT_DIR = hostDir;
    const fileId = await BuildArtifactStore('PROVIDER-1', new SharedFileFactory()).save(modelBytes, 'model-pipeline-v1.bin', user);

    await rm(hostDir, { recursive: true, force: true });

    const loaded = await BuildProductionMLInferenceDeps().artifactLoader.load(fileId, user);
    expect(Array.from(loaded ?? [])).toEqual(Array.from(modelBytes));
  });

  it('the File row points at the uploaded object: ProviderKey set, Status Uploaded, bytes in the bucket', async () => {
    process.env.PS_ARTIFACT_DIR = await newHostDir();
    const fileId = await BuildArtifactStore('PROVIDER-1', new SharedFileFactory()).save(modelBytes, 'model-pipeline-v1.bin', user);

    const row = fileTable.get(fileId);
    expect(row?.ProviderID).toBe('PROVIDER-1');
    expect(row?.Status).toBe('Uploaded');
    expect(row?.ProviderKey).toBeTruthy();
    expect(Array.from(bucket.get(row?.ProviderKey ?? '') ?? [])).toEqual(Array.from(modelBytes));
  });

  describe('MJFilesArtifactStore', () => {
    const store = (): MJFilesArtifactStore => new MJFilesArtifactStore(new SharedFileFactory(), { providerId: 'PROVIDER-1' });

    it("uploads the exact bytes to the preferred provider's account before recording the row", async () => {
      const fileId = await store().save(modelBytes, 'model-p-v3.bin', user);

      expect(engineMock.GetDriver).toHaveBeenCalledWith('ACCOUNT-1', user);
      expect(engineMock.GetDriver).not.toHaveBeenCalledWith('ACCOUNT-DEFAULT', user);
      const [objectKey, data, contentType] = putObjectMock.mock.calls[0];
      expect(objectKey.startsWith(`${ARTIFACT_OBJECT_PREFIX}/`)).toBe(true);
      expect(objectKey.endsWith('/model-p-v3.bin')).toBe(true);
      expect(Array.from(data)).toEqual(Array.from(modelBytes));
      expect(contentType).toBe('application/octet-stream');
      expect(fileTable.get(fileId)).toMatchObject({
        Name: 'model-p-v3.bin',
        ContentType: 'application/octet-stream',
        ProviderID: 'PROVIDER-1',
        ProviderKey: objectKey,
        Status: 'Uploaded',
      });
    });

    it('passes the metadata provider through to the storage engine', async () => {
      const metadataProvider = {} as IMetadataProvider;
      await new MJFilesArtifactStore(new SharedFileFactory(), { providerId: 'PROVIDER-1', provider: metadataProvider }).save(modelBytes, 'm.bin', user);
      expect(engineMock.Config).toHaveBeenCalledWith(false, user, metadataProvider);
    });

    it("falls back to the engine's default account, stamping that account's provider, when the preferred provider has none", async () => {
      engineMock.GetAccountsByProviderID.mockReturnValueOnce([]);
      engineMock.ResolveStorageAccount.mockReturnValueOnce({
        account: { ID: 'ACCOUNT-2', Name: 'Other bucket', ProviderID: 'PROVIDER-2' },
        provider: { ID: 'PROVIDER-2', Name: 'Other provider', IsActive: true },
      });

      const fileId = await store().save(modelBytes, 'm.bin', user);

      expect(engineMock.GetDriver).toHaveBeenCalledWith('ACCOUNT-2', user);
      expect(fileTable.get(fileId)?.ProviderID).toBe('PROVIDER-2');
    });

    it('fails loudly, uploading nothing and recording no row, when no File Storage Account is configured', async () => {
      engineMock.GetAccountsByProviderID.mockReturnValueOnce([]);
      engineMock.ResolveStorageAccount.mockReturnValueOnce(null);

      await expect(store().save(modelBytes, 'm.bin', user)).rejects.toThrow(/no File Storage Account is configured/);
      expect(putObjectMock).not.toHaveBeenCalled();
      expect(fileTable.size).toBe(0);
    });

    it('records no row when storage refuses the upload', async () => {
      putObjectMock.mockResolvedValueOnce(false);

      await expect(store().save(modelBytes, 'm.bin', user)).rejects.toThrow(/storage refused the upload/);
      expect(fileTable.size).toBe(0);
    });

    it('deletes the uploaded object when the File row fails to save', async () => {
      failNextSave = true;

      await expect(store().save(modelBytes, 'm.bin', user)).rejects.toThrow(/persist model artifact file: forced save failure/);
      const uploadedKey = putObjectMock.mock.calls[0][0];
      expect(deleteObjectMock).toHaveBeenCalledWith(uploadedKey);
      expect(bucket.size).toBe(0);
      expect(fileTable.size).toBe(0);
    });

    it('refuses to save without a context user, uploading nothing', async () => {
      await expect(store().save(modelBytes, 'm.bin')).rejects.toThrow(/context user is required/);
      expect(putObjectMock).not.toHaveBeenCalled();
    });
  });

  describe('BuildArtifactObjectKey', () => {
    it('keeps the name as one path segment under the artifact prefix', () => {
      const key = BuildArtifactObjectKey('../evil/name\\x.bin');
      const segments = key.split('/');
      expect(segments.slice(0, 2).join('/')).toBe(ARTIFACT_OBJECT_PREFIX);
      expect(segments).toHaveLength(4);
      expect(segments[3]).toBe('_evil_name_x.bin');
    });

    it('gives two artifacts with the same name different keys', () => {
      expect(BuildArtifactObjectKey('m.bin')).not.toBe(BuildArtifactObjectKey('m.bin'));
    });
  });

  describe('MJStorageArtifactLoader', () => {
    /** Record a File row the way the pre-#4991 store did: no ProviderKey, still Pending. */
    function recordLegacyRow(id: string): void {
      fileTable.set(id, {
        ID: id,
        Name: 'model-old-v1.bin',
        ContentType: 'application/octet-stream',
        ProviderID: 'PROVIDER-1',
        ProviderKey: null,
        Status: 'Pending',
        Description: null,
      });
    }

    it('reads a pre-#4991 artifact from the local disk it was written to', async () => {
      const hostDir = await newHostDir();
      process.env.PS_ARTIFACT_DIR = hostDir;
      const legacyId = 'LEGACY-FILE-1';
      recordLegacyRow(legacyId);
      await writeFile(LocalArtifactPath(hostDir, legacyId), modelBytes);

      const loaded = await new MJStorageArtifactLoader().load(legacyId, user);

      expect(Array.from(loaded ?? [])).toEqual(Array.from(modelBytes));
      expect(engineMock.GetDriver).not.toHaveBeenCalled();
    });

    it('delegates a row with no ProviderKey to the injected legacy loader', async () => {
      recordLegacyRow('LEGACY-FILE-2');
      const legacyLoader = new InMemoryArtifactLoader(new Map([['LEGACY-FILE-2', modelBytes]]));

      const loaded = await new MJStorageArtifactLoader({ LegacyLoader: legacyLoader }).load('LEGACY-FILE-2', user);

      expect(Array.from(loaded ?? [])).toEqual(Array.from(modelBytes));
    });

    it('loads the File row through an injected metadata provider when one is given', async () => {
      process.env.PS_ARTIFACT_DIR = await newHostDir();
      const fileId = await BuildArtifactStore('PROVIDER-1', new SharedFileFactory()).save(modelBytes, 'm.bin', user);
      Metadata.Provider = { GetEntityObject: async () => ({ Load: async () => false }) } as unknown as IMetadataProvider;

      const loaded = await new MJStorageArtifactLoader({ Provider: sharedMetadataProvider }).load(fileId, user);

      expect(Array.from(loaded ?? [])).toEqual(Array.from(modelBytes));
    });

    it('returns null when the File row does not exist', async () => {
      expect(await new MJStorageArtifactLoader().load('NO-SUCH-FILE', user)).toBeNull();
    });

    it("returns null without reading when no account can read the row's provider", async () => {
      process.env.PS_ARTIFACT_DIR = await newHostDir();
      const fileId = await BuildArtifactStore('PROVIDER-1', new SharedFileFactory()).save(modelBytes, 'm.bin', user);
      engineMock.GetAccountsByProviderID.mockReturnValueOnce([]);

      expect(await new MJStorageArtifactLoader().load(fileId, user)).toBeNull();
      expect(getObjectMock).not.toHaveBeenCalled();
    });

    it('returns null when the object is missing from storage', async () => {
      process.env.PS_ARTIFACT_DIR = await newHostDir();
      const fileId = await BuildArtifactStore('PROVIDER-1', new SharedFileFactory()).save(modelBytes, 'm.bin', user);
      bucket.clear();

      expect(await new MJStorageArtifactLoader().load(fileId, user)).toBeNull();
    });

    it('returns null without a context user', async () => {
      process.env.PS_ARTIFACT_DIR = await newHostDir();
      const fileId = await BuildArtifactStore('PROVIDER-1', new SharedFileFactory()).save(modelBytes, 'm.bin', user);

      expect(await new MJStorageArtifactLoader().load(fileId)).toBeNull();
      expect(getObjectMock).not.toHaveBeenCalled();
    });

    it('is the loader production scoring is wired with', () => {
      expect(BuildProductionMLInferenceDeps().artifactLoader).toBeInstanceOf(MJStorageArtifactLoader);
    });
  });
});
