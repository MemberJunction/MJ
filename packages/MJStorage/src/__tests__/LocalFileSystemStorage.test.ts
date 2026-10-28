import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalFileSystemStorage, StorageRootEscapeError } from '../drivers/LocalFileSystemStorage';
import { UnsupportedOperationError } from '../generic/FileStorageBase';

describe('LocalFileSystemStorage', () => {
  let root = '';
  let store: LocalFileSystemStorage;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'mj-local-storage-'));
    store = new LocalFileSystemStorage();
    await store.initialize({ rootPath: root });
  });

  it('round-trips bytes under the root and reports metadata', async () => {
    expect(store.IsConfigured).toBe(true);
    expect(await store.PutObject('a/b/matrix.jsonl', Buffer.from('{"x":1}\n'), 'application/x-ndjson')).toBe(true);
    expect((await store.GetObject({ fullPath: 'a/b/matrix.jsonl' })).toString('utf8')).toBe('{"x":1}\n');
    expect(await store.ObjectExists('a/b/matrix.jsonl')).toBe(true);
    expect((await store.GetObjectMetadata({ fullPath: 'a/b/matrix.jsonl' })).size).toBe(8);
    expect((await store.ListObjects('a/b/')).objects.map((o) => o.name)).toEqual(['matrix.jsonl']);
    expect(await store.CreatePreAuthDownloadUrl('a/b/matrix.jsonl')).toMatch(/^file:\/\/.*matrix\.jsonl$/);
    await rm(root, { recursive: true, force: true });
  });

  it('refuses a key that escapes the root', async () => {
    await expect(store.PutObject('../outside.txt', Buffer.from('x'))).rejects.toBeInstanceOf(StorageRootEscapeError);
  });

  it('does not support upload URLs or search', async () => {
    await expect(store.CreatePreAuthUploadUrl('x')).rejects.toBeInstanceOf(UnsupportedOperationError);
    await expect(store.SearchFiles('x')).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});
