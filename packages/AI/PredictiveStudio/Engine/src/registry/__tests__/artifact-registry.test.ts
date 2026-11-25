import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ArtifactLoad } from '@memberjunction/predictive-studio-core';
import type { UserInfo } from '@memberjunction/core';

import { ArtifactRegistry, RegistryContextMismatchError } from '../artifact-registry';
import type { RegistryContext } from '../registry-context';
import { InMemoryArtifactLoader } from '../../scoring/artifact-loader';
import { StorageProviderArtifactLoader } from '../../scoring/storage-provider-artifact-loader';
import { InMemoryArtifactStore, LocalArtifactPath } from '../../training/artifact-store';
import { SnapshotHash } from '../../snapshot/snapshot-hash';
import { FakeFilesTable, MemoryStorageAccount, ProviderRow, RegisterMemoryStorage, ServeStorageProviders, TestUser } from '../../__tests__/fakes/storage-fakes';

const Sha256Hex = (b: Uint8Array): string => SnapshotHash.Sha256Hex(b);
const bytes = new TextEncoder().encode('{"model":"bytes"}');
const otherBytes = new TextEncoder().encode('{"model":"another model"}');
const modelId = '5B0C6D7E-0000-4000-8000-0000000000B1';
const fileId = 'A1B2C3D4-0000-4000-8000-0000000000B2';

describe('ArtifactRegistry.Load over the in-memory loader', () => {
  let loader: InMemoryArtifactLoader;
  let registry: ArtifactRegistry;
  const files = new FakeFilesTable([]);
  const ctx: RegistryContext = { ContextUser: TestUser, Provider: files.Provider() };
  beforeEach(() => {
    loader = new InMemoryArtifactLoader();
    registry = new ArtifactRegistry(new InMemoryArtifactStore(), loader);
  });

  it('returns verified with the bytes when the hash matches', async () => {
    loader.Set(fileId, bytes);
    expect(await registry.Load({ ID: modelId, ArtifactFileID: fileId, ArtifactSha256: Sha256Hex(bytes) }, ctx))
      .toEqual({ Status: 'verified', Sha256: Sha256Hex(bytes), Bytes: bytes });
  });

  it('returns missing, never null, when the object is gone', async () => {
    expect(await registry.Load({ ID: modelId, ArtifactFileID: fileId, ArtifactSha256: Sha256Hex(bytes) }, ctx))
      .toEqual({ Status: 'missing', FileID: fileId });
  });

  it('names both hashes when the stored bytes changed', async () => {
    loader.Set(fileId, otherBytes);
    expect(await registry.Load({ ID: modelId, ArtifactFileID: fileId, ArtifactSha256: Sha256Hex(bytes) }, ctx))
      .toEqual({ Status: 'hash-mismatch', Expected: Sha256Hex(bytes), Actual: Sha256Hex(otherBytes) });
  });

  it('refuses a model with no registered hash as unverified', async () => {
    loader.Set(fileId, bytes);
    expect(await registry.Load({ ID: modelId, ArtifactFileID: fileId, ArtifactSha256: null }, ctx)).toEqual({ Status: 'unverified', ModelID: modelId });
    expect(await registry.Load({ ID: modelId, ArtifactFileID: fileId, ArtifactSha256: '' }, ctx)).toEqual({ Status: 'unverified', ModelID: modelId });
  });

  it('compares the registered hash case-insensitively (a hex digest written in upper case is the same digest)', async () => {
    loader.Set(fileId, bytes);
    expect(await registry.Load({ ID: modelId, ArtifactFileID: fileId, ArtifactSha256: Sha256Hex(bytes).toUpperCase() }, ctx))
      .toEqual({ Status: 'verified', Sha256: Sha256Hex(bytes), Bytes: bytes });
  });

  it('throws for a model with no artifact file (a never-trained model is refused as needs training before any load)', async () => {
    await expect(registry.Load({ ID: modelId, ArtifactFileID: null, ArtifactSha256: null }, ctx)).rejects.toThrow(`ML Model '${modelId}' has no artifact file to load`);
  });

  it('stores through its store and returns the stored file with the SHA-256 of the bytes', async () => {
    const store = new InMemoryArtifactStore();
    const stored = await new ArtifactRegistry(store, loader).Store(bytes, 'model.json', ctx);
    expect(stored).toMatchObject({ sha256: Sha256Hex(bytes), sizeBytes: bytes.byteLength, writeOnce: true });
    expect(store.Saved.get(stored.fileId)?.Bytes).toEqual(bytes);
  });
});

describe('ArtifactRegistry.Load over the storage-provider loader', () => {
  const log: string[] = [];
  const local = new MemoryStorageAccount('local', log);
  RegisterMemoryStorage('PS Artifact Registry Test Local', local);
  const localRow = ProviderRow('7C4D3B2A-1908-4F6E-8D5C-4B3A29180706', 'Local File System', 'PS Artifact Registry Test Local', true);
  const key = 'predictive-studio/model-artifacts/2A3B4C5D-0000-4000-8000-000000000001/trainer-r1-c1.json';
  const registry = new ArtifactRegistry(new InMemoryArtifactStore(), new StorageProviderArtifactLoader());
  let files: FakeFilesTable;
  let baseDir = '';
  let savedArtifactDir: string | undefined;
  const insert = (providerKey: string | null): void =>
    files.Insert({ ID: fileId, Name: 'trainer-r1-c1.json', ContentType: 'application/json', ProviderID: localRow.ID, ProviderKey: providerKey, Status: 'Uploaded', Description: null });
  const ctx = (): RegistryContext => ({ ContextUser: TestUser, Provider: files.Provider() });
  beforeEach(() => {
    log.length = 0;
    local.Reset();
    ServeStorageProviders([localRow]);
    files = new FakeFilesTable(log);
    baseDir = mkdtempSync(join(tmpdir(), 'ps-registry-legacy-'));
    savedArtifactDir = process.env.PS_ARTIFACT_DIR;
    process.env.PS_ARTIFACT_DIR = baseDir;
  });
  afterEach(() => {
    if (savedArtifactDir === undefined) delete process.env.PS_ARTIFACT_DIR;
    else process.env.PS_ARTIFACT_DIR = savedArtifactDir;
    rmSync(baseDir, { recursive: true, force: true });
  });

  it('hashes a legacy local file like a provider object', async () => {
    insert('');
    writeFileSync(LocalArtifactPath(baseDir, fileId), bytes);
    expect(await registry.Load({ ID: modelId, ArtifactFileID: fileId, ArtifactSha256: Sha256Hex(bytes) }, ctx()))
      .toEqual({ Status: 'verified', Sha256: Sha256Hex(bytes), Bytes: new Uint8Array(bytes) });
    writeFileSync(LocalArtifactPath(baseDir, fileId), otherBytes);
    expect(await registry.Load({ ID: modelId, ArtifactFileID: fileId, ArtifactSha256: Sha256Hex(bytes) }, ctx()))
      .toEqual({ Status: 'hash-mismatch', Expected: Sha256Hex(bytes), Actual: Sha256Hex(otherBytes) });
  });

  it('returns missing when the file row is gone', async () => {
    local.Objects.set(key, bytes);
    expect(await registry.Load({ ID: modelId, ArtifactFileID: fileId, ArtifactSha256: Sha256Hex(bytes) }, ctx())).toEqual({ Status: 'missing', FileID: fileId });
  });

  it('returns missing when the provider object is gone and its row remains', async () => {
    insert(key);
    expect(await registry.Load({ ID: modelId, ArtifactFileID: fileId, ArtifactSha256: Sha256Hex(bytes) }, ctx())).toEqual({ Status: 'missing', FileID: fileId });
  });
});

describe('ArtifactRegistry.ArtifactStatusOf', () => {
  it("is each load's own status, so the model row records exactly what the load found", () => {
    const loads: ArtifactLoad[] = [
      { Status: 'verified', Sha256: 'a', Bytes: bytes },
      { Status: 'missing', FileID: fileId },
      { Status: 'hash-mismatch', Expected: 'a', Actual: 'b' },
      { Status: 'unverified', ModelID: modelId },
    ];
    expect(loads.map((l) => ArtifactRegistry.ArtifactStatusOf(l))).toEqual(['verified', 'missing', 'hash-mismatch', 'unverified']);
  });
});

describe('ArtifactRegistry.ForContext binds the registry to its context', () => {
  const loader = new InMemoryArtifactLoader();
  loader.Set(fileId, bytes);
  const files = new FakeFilesTable([]);
  const ctx: RegistryContext = { ContextUser: TestUser, Provider: files.Provider() };
  const model = { ID: modelId, ArtifactFileID: fileId, ArtifactSha256: Sha256Hex(bytes) };
  const otherUser = { ID: 'D2E3F4A5-0000-4000-8000-000000000002', Email: 'other@example.com' } as UserInfo;

  it('loads for the context it was built for, and for an equal one (same user ID in any case, same provider)', async () => {
    const registry = ArtifactRegistry.ForContext(ctx, loader);
    expect((await registry.Load(model, ctx)).Status).toBe('verified');
    const sameUser = { ID: TestUser.ID.toLowerCase() } as UserInfo;
    expect((await registry.Load(model, { ContextUser: sameUser, Provider: ctx.Provider })).Status).toBe('verified');
  });

  it('refuses Load and Store for another user or another provider instance', async () => {
    const registry = ArtifactRegistry.ForContext(ctx, loader);
    await expect(registry.Load(model, { ContextUser: otherUser, Provider: ctx.Provider })).rejects.toBeInstanceOf(RegistryContextMismatchError);
    await expect(registry.Load(model, { ContextUser: TestUser, Provider: new FakeFilesTable([]).Provider() })).rejects.toMatchObject({ Operation: 'Load' });
    await expect(registry.Store(bytes, 'model.json', { ContextUser: otherUser, Provider: ctx.Provider })).rejects.toMatchObject({
      Operation: 'Store', BoundUserID: TestUser.ID, CallerUserID: otherUser.ID,
    });
  });

  it('a registry built with the constructor is bound to no context and accepts any', async () => {
    const registry = new ArtifactRegistry(new InMemoryArtifactStore(), loader);
    expect((await registry.Load(model, { ContextUser: otherUser, Provider: ctx.Provider })).Status).toBe('verified');
  });
});
