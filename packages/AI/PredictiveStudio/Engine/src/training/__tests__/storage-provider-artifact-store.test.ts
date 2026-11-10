import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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
    const fileId = await store.save(bytes, 'trainer-r1-c1.json');
    const row = files.Rows.Get(fileId);
    expect(row?.ProviderKey).toMatch(/^predictive-studio\/model-artifacts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/trainer-r1-c1\.json$/i);
    expect(row?.ProviderID).toBe(localRow.ID);
    expect(row?.Status).toBe('Uploaded');
    expect(local.Objects.get(row?.ProviderKey || '')).toEqual(bytes);
  });

  it('two saves of identical bytes get different keys', async () => {
    const first = files.Rows.Get(await store.save(bytes, 'trainer-r1-c1.json'));
    const second = files.Rows.Get(await store.save(bytes, 'trainer-r1-c1.json'));
    expect(first?.ProviderKey).not.toBe(second?.ProviderKey);
    expect(local.Objects.size).toBe(2);
  });

  it('refuses an unsafe artifact name', async () => {
    await expect(store.save(bytes, 'trainer-r-../x.json')).rejects.toThrow(/not a safe/);
    await expect(store.save(bytes, 'trainer-r-..\\x.json')).rejects.toThrow(/not a safe/);
    expect(log.filter((e) => e.startsWith('local.put'))).toEqual([]);
    expect(files.Rows.Size).toBe(0);
  });

  it('a failed row save deletes the object it just wrote and throws with CompleteMessage', async () => {
    files.SaveFailure = 'the MJ: Files table is unavailable';
    await expect(store.save(bytes, 'trainer-r1-c1.json')).rejects.toThrow(/the MJ: Files table is unavailable/);
    expect(log.map((e) => e.split(' ')[0])).toEqual(['local.put', 'local.delete']);
    expect(local.Objects.size).toBe(0);
  });

  it('a refused PutObject throws and saves no row', async () => {
    local.RefusePut = true;
    await expect(store.save(bytes, 'trainer-r1-c1.json')).rejects.toThrow(/refused/);
    expect(files.Rows.Size).toBe(0);
  });

  it('rollback deletes object then row', async () => {
    const fileId = await store.save(bytes, 'trainer-r1-c1.json');
    const key = files.Rows.Get(fileId)?.ProviderKey || '';
    log.length = 0;
    await store.delete(fileId);
    expect(log).toEqual([`local.delete ${key}`, `row.delete ${fileId}`]);
    expect(local.Objects.size).toBe(0);
    expect(files.Rows.Size).toBe(0);

    const kept = await store.save(bytes, 'trainer-r1-c2.json');
    const keptKey = files.Rows.Get(kept)?.ProviderKey || '';
    local.RefuseDelete = true;
    await expect(store.delete(kept)).rejects.toThrow(keptKey);
    expect(files.Rows.Get(kept)).toBeDefined();
  });

  it('delete of a legacy row removes the row and the local file', async () => {
    const legacyId = '8D4C3F5E-6071-4283-9D9E-0F1A2B3C4D5E';
    files.Insert({ ID: legacyId, Name: 'model.bin', ContentType: 'application/octet-stream', ProviderID: localRow.ID, ProviderKey: null, Status: 'Pending', Description: null });
    writeFileSync(LocalArtifactPath(baseDir, legacyId), bytes);
    await store.delete(legacyId);
    expect(files.Rows.Get(legacyId)).toBeUndefined();
    expect(existsSync(LocalArtifactPath(baseDir, legacyId))).toBe(false);
    expect(log.filter((e) => e.startsWith('local.'))).toEqual([]);
  });

  it('AssertWritable refuses an unconfigured provider before anything is stored', async () => {
    await expect(store.AssertWritable()).resolves.toBeUndefined();
    log.length = 0;
    local.Reset();
    local.Configured = false;
    const fresh = new StorageProviderArtifactStore(files, new PredictiveStudioStorage(files.Provider(), TestUser, 'Local File System'));
    await expect(fresh.AssertWritable()).rejects.toThrow(/"Local File System" is not configured on this server.*PS_STORAGE_PROVIDER/);
    expect(log.filter((e) => e.startsWith('local.put'))).toEqual([]);
  });

  it('AssertWritable proves a write: it puts a probe object under the key prefix, then deletes it', async () => {
    await expect(store.AssertWritable()).resolves.toBeUndefined();
    const probe = /^predictive-studio\/model-artifacts\/[0-9a-f-]{36}\/\.probe$/i;
    expect(log.map((e) => e.split(' ')[0])).toEqual(['local.put', 'local.delete']);
    expect(log.map((e) => e.split(' ')[1]).every((k) => probe.test(k))).toBe(true);
    expect(log[0].split(' ')[1]).toBe(log[1].split(' ')[1]);
    expect(local.Objects.size).toBe(0);
    expect(files.Rows.Size).toBe(0);
  });

  it('AssertWritable refuses a configured provider that refuses the probe write, naming it and PS_STORAGE_PROVIDER', async () => {
    local.RefusePut = true;
    await expect(store.AssertWritable()).rejects.toThrow(/"Local File System" cannot write .*PS_STORAGE_PROVIDER/);
  });

  it('AssertWritable refuses a configured provider whose probe write throws, with the driver error', async () => {
    local.PutError = 'The AWS Access Key Id you provided does not exist in our records';
    await expect(store.AssertWritable()).rejects.toThrow(/"Local File System" cannot write .*Access Key Id.*PS_STORAGE_PROVIDER/);
  });

  it('AssertWritable does not refuse when only the probe delete fails: it logs a warning naming the probe', async () => {
    local.RefuseDelete = true;
    const errors = ConsoleCapture.Errors();
    await expect(store.AssertWritable()).resolves.toBeUndefined();
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringMatching(/WARNING.*could not delete the write probe predictive-studio\/model-artifacts\/.*\.probe from "Local File System"/)]);
  });

  it('AssertWritable refuses the real Local File System driver when STORAGE_LOCAL_ROOT is set but not writable', async () => {
    const realRow = ProviderRow('3A4B5C6D-7E8F-4091-8A2B-3C4D5E6F7081', 'Local File System', 'Local File System Storage', false);
    ServeStorageProviders([realRow]);
    const root = mkdtempSync(join(tmpdir(), 'ps-unwritable-root-'));
    chmodSync(root, 0o500);
    const savedRoot = process.env.STORAGE_LOCAL_ROOT;
    process.env.STORAGE_LOCAL_ROOT = root;
    try {
      const real = new StorageProviderArtifactStore(files, new PredictiveStudioStorage(files.Provider(), TestUser, 'Local File System'));
      await expect(real.AssertWritable()).rejects.toThrow(/"Local File System" cannot write here .*EACCES.*PS_STORAGE_PROVIDER/);
      chmodSync(root, 0o700);
      const writable = new StorageProviderArtifactStore(files, new PredictiveStudioStorage(files.Provider(), TestUser, 'Local File System'));
      await expect(writable.AssertWritable()).resolves.toBeUndefined();
      // The probe was written under the key prefix and deleted again: no file is left.
      expect(existsSync(join(root, StorageProviderArtifactStore.KEY_PREFIX))).toBe(true);
      expect(readdirSync(root, { recursive: true, withFileTypes: true }).filter((e) => e.isFile())).toEqual([]);
    } finally {
      if (savedRoot === undefined) delete process.env.STORAGE_LOCAL_ROOT;
      else process.env.STORAGE_LOCAL_ROOT = savedRoot;
      chmodSync(root, 0o700);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('Delete refuses a row whose stored key is unsafe, before the driver is asked and keeping the row', async () => {
    const tamperedId = '9E5D4A6F-0000-4000-8000-0000000000BB';
    files.Insert({ ID: tamperedId, Name: 'x.json', ContentType: 'application/json', ProviderID: localRow.ID, ProviderKey: '../../x', Status: 'Uploaded', Description: null });
    await expect(store.delete(tamperedId)).rejects.toThrow(/unsafe storage key "\.\.\/\.\.\/x"/);
    expect(log).toEqual([]);
    expect(files.Rows.Get(tamperedId)).toBeDefined();
  });

  it('logs the object it could not remove after a failed row save', async () => {
    files.SaveFailure = 'the MJ: Files table is unavailable';
    local.RefuseDelete = true;
    const errors = ConsoleCapture.Errors();
    await expect(store.save(bytes, 'trainer-r1-c1.json')).rejects.toThrow(/the MJ: Files table is unavailable/);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringMatching(/could not delete .*predictive-studio\/model-artifacts\//)]);
  });

  it('a cleanup delete that throws after a failed row save still throws the save error and logs the delete failure', async () => {
    files.SaveFailure = 'the MJ: Files table is unavailable';
    local.ThrowOnDelete = true;
    const errors = ConsoleCapture.Errors();
    await expect(store.save(bytes, 'trainer-r1-c1.json')).rejects.toThrow(/the MJ: Files table is unavailable/);
    expect(ConsoleCapture.Lines(errors)).toEqual([expect.stringMatching(/could not delete .*predictive-studio\/model-artifacts\/.*\(local: delete failed\)/)]);
  });
});
