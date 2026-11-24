import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { InMemoryArtifactStore } from '../artifact-store';
import { ArtifactAlreadyStoredError } from '../types';

const bytes = new TextEncoder().encode('{"model":"bytes"}');

describe('InMemoryArtifactStore', () => {
  it('returns the stored file with the SHA-256 and size of the bytes, under a fresh key per save', async () => {
    const store = new InMemoryArtifactStore();
    const first = await store.save(bytes, 'model.json');
    const second = await store.save(bytes, 'model.json');
    expect(first).toEqual({
      fileId: 'mem-file-1',
      storageProviderId: InMemoryArtifactStore.StorageProviderID,
      providerKey: 'in-memory-artifacts/mem-file-1/model.json',
      sha256: createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.byteLength,
      writeOnce: true,
    });
    expect(second.providerKey).not.toBe(first.providerKey);
    expect(store.Saved.get(first.fileId)?.Bytes).toEqual(bytes);
  });

  it('refuses a save whose key already holds an artifact, as production storage does, and writes nothing', async () => {
    const store = new InMemoryArtifactStore();
    const earlier = new TextEncoder().encode('earlier');
    store.Saved.set('seeded', { Name: 'model.json', Key: 'in-memory-artifacts/mem-file-1/model.json', Bytes: earlier });
    const refusal = store.save(bytes, 'model.json');
    await expect(refusal).rejects.toBeInstanceOf(ArtifactAlreadyStoredError);
    await expect(refusal).rejects.toMatchObject({ ProviderKey: 'in-memory-artifacts/mem-file-1/model.json' });
    expect([store.Saved.size, store.Saved.get('seeded')?.Bytes]).toEqual([1, earlier]);
  });
});
