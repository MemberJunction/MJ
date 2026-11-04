import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StorageProviderArtifactStore } from '../storage-provider-artifact-store';
import { LocalArtifactPath } from '../artifact-store';
import { PredictiveStudioStorage } from '../../storage/ps-storage-provider';
import { ConsoleCapture } from '../../__tests__/fakes/console-capture';
import { FakeFilesTable, MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders, TestUser } from '../../__tests__/fakes/storage-fakes';

const log: string[] = [];
const local = new MemoryStorageAccount('local', log);
RegisterMemoryStorage('PS Artifact Store Test Local', local);
const localRow = ProviderRow('7C3B2E4D-5F60-4172-8C8D-9E0F1A2B3C4D', 'Local File System', 'PS Artifact Store Test Local', true);
const bytes = new TextEncoder().encode('{"model":"bytes"}');

describe('StorageProviderArtifactStore', () => {
  let files: FakeFilesTable;
  let store: StorageProviderArtifactStore;
  let baseDir = '';
  let savedArtifactDir: string | undefined;
  beforeEach(() => {
    log.length = 0;
    local.Reset();
    ServeStorageProviders([localRow]);
    files = new FakeFilesTable(log);
    store = new StorageProviderArtifactStore(files, new PredictiveStudioStorage(files.Provider(), TestUser, 'Local File System'));
    baseDir = mkdtempSync(join(tmpdir(), 'ps-legacy-artifacts-'));
    savedArtifactDir = process.env.PS_ARTIFACT_DIR;
    process.env.PS_ARTIFACT_DIR = baseDir;
  });
  afterEach(() => {
    if (savedArtifactDir === undefined) delete process.env.PS_ARTIFACT_DIR;
    else process.env.PS_ARTIFACT_DIR = savedArtifactDir;
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('save puts the bytes under predictive-studio/model-artifacts/<uuid>/<name> and records ProviderID, ProviderKey and Status Uploaded', async () => {
    const fileId = await store.save(bytes, 'trainer-r1-c1.json', TestUser);
    const row = files.Rows.Get(fileId);
    expect(row?.ProviderKey).toMatch(/^predictive-studio\/model-artifacts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/trainer-r1-c1\.json$/i);
    expect(row?.ProviderID).toBe(localRow.ID);
    expect(row?.Status).toBe('Uploaded');
    expect(local.Objects.get(row?.ProviderKey || '')).toEqual(bytes);
  });

  it('two saves of identical bytes get different keys', async () => {
    const first = files.Rows.Get(await store.save(bytes, 'trainer-r1-c1.json', TestUser));
    const second = files.Rows.Get(await store.save(bytes, 'trainer-r1-c1.json', TestUser));
    expect(first?.ProviderKey).not.toBe(second?.ProviderKey);
    expect(local.Objects.size).toBe(2);
  });

  it('refuses an unsafe artifact name', async () => {
    await expect(store.save(bytes, 'trainer-r-../x.json', TestUser)).rejects.toThrow(/not a safe/);
    await expect(store.save(bytes, 'trainer-r-..\\x.json', TestUser)).rejects.toThrow(/not a safe/);
    expect(log.filter((e) => e.startsWith('local.put'))).toEqual([]);
    expect(files.Rows.Size).toBe(0);
  });

  it('a failed row save deletes the object it just wrote and throws with CompleteMessage', async () => {
    files.SaveFailure = 'the MJ: Files table is unavailable';
    await expect(store.save(bytes, 'trainer-r1-c1.json', TestUser)).rejects.toThrow(/the MJ: Files table is unavailable/);
    expect(log.map((e) => e.split(' ')[0])).toEqual(['local.put', 'local.delete']);
    expect(local.Objects.size).toBe(0);
  });

  it('a refused PutObject throws and saves no row', async () => {
    local.RefusePut = true;
    await expect(store.save(bytes, 'trainer-r1-c1.json', TestUser)).rejects.toThrow(/refused/);
    expect(files.Rows.Size).toBe(0);
  });

  it('rollback deletes object then row', async () => {
    const fileId = await store.save(bytes, 'trainer-r1-c1.json', TestUser);
    const key = files.Rows.Get(fileId)?.ProviderKey || '';
    log.length = 0;
    await store.delete(fileId, TestUser);
    expect(log).toEqual([`local.delete ${key}`, `row.delete ${fileId}`]);
    expect(local.Objects.size).toBe(0);
    expect(files.Rows.Size).toBe(0);

    const kept = await store.save(bytes, 'trainer-r1-c2.json', TestUser);
    const keptKey = files.Rows.Get(kept)?.ProviderKey || '';
    local.RefuseDelete = true;
    await expect(store.delete(kept, TestUser)).rejects.toThrow(keptKey);
    expect(files.Rows.Get(kept)).toBeDefined();
  });

  it('delete of a legacy row removes the row and the local file', async () => {
    const legacyId = '8D4C3F5E-6071-4283-9D9E-0F1A2B3C4D5E';
    files.Insert({ ID: legacyId, Name: 'model.bin', ContentType: 'application/octet-stream', ProviderID: localRow.ID, ProviderKey: null, Status: 'Pending', Description: null });
    writeFileSync(LocalArtifactPath(baseDir, legacyId), bytes);
    await store.delete(legacyId, TestUser);
    expect(files.Rows.Get(legacyId)).toBeUndefined();
    expect(existsSync(LocalArtifactPath(baseDir, legacyId))).toBe(false);
    expect(log.filter((e) => e.startsWith('local.'))).toEqual([]);
  });

  it('logs the object it could not remove after a failed row save', async () => {
    files.SaveFailure = 'the MJ: Files table is unavailable';
    local.RefuseDelete = true;
    const errors = ConsoleCapture.Errors();
    await expect(store.save(bytes, 'trainer-r1-c1.json', TestUser)).rejects.toThrow(/the MJ: Files table is unavailable/);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringMatching(/could not delete .*predictive-studio\/model-artifacts\//)]);
  });
});
