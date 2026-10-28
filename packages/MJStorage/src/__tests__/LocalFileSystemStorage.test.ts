import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LocalFileSystemStorage,
  StorageRootEscapeError,
  StorageRootNotConfiguredError,
} from '../drivers/LocalFileSystemStorage';
import { UnsupportedOperationError } from '../generic/FileStorageBase';

/** Every temp directory a test creates; the shared afterEach removes them all. */
const tempDirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'mj-local-storage-'));
  tempDirs.push(dir);
  return dir;
}

describe('LocalFileSystemStorage', () => {
  let root = '';
  let store: LocalFileSystemStorage;
  beforeEach(async () => {
    root = await tempDir();
    store = new LocalFileSystemStorage();
    await store.initialize({ rootPath: root });
  });
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });

  it('round-trips bytes under the root and reports metadata', async () => {
    expect(store.IsConfigured).toBe(true);
    expect(await store.PutObject('a/b/matrix.jsonl', Buffer.from('{"x":1}\n'), 'application/x-ndjson')).toBe(true);
    expect((await store.GetObject({ fullPath: 'a/b/matrix.jsonl' })).toString('utf8')).toBe('{"x":1}\n');
    expect(await store.ObjectExists('a/b/matrix.jsonl')).toBe(true);
    const metadata = await store.GetObjectMetadata({ fullPath: 'a/b/matrix.jsonl' });
    expect(metadata.size).toBe(8);
    expect(metadata.contentType).toBe('application/octet-stream');
    expect((await store.ListObjects('a/b/')).objects.map((o) => o.name)).toEqual(['matrix.jsonl']);
    expect(await store.CreatePreAuthDownloadUrl('a/b/matrix.jsonl')).toMatch(/^file:\/\/.*matrix\.jsonl$/);
  });

  it('writes atomically: the bytes read back exactly and no temp file remains', async () => {
    const bytes = Buffer.from([0, 1, 2, 250, 251, 252, 10, 13]);
    await store.PutObject('snap/features.bin', bytes);
    await store.PutObject('snap/features.bin', bytes);
    expect((await store.GetObject({ fullPath: 'snap/features.bin' })).equals(bytes)).toBe(true);
    expect(await readdir(join(root, 'snap'))).toEqual(['features.bin']);
  });

  it('refuses a key that escapes the root', async () => {
    await expect(store.PutObject('../outside.txt', Buffer.from('x'))).rejects.toBeInstanceOf(StorageRootEscapeError);
  });

  it('refuses an absolute key, a backslash key and a percent-encoded slash', async () => {
    await expect(store.GetObject({ fullPath: '/etc/passwd' })).rejects.toMatchObject({ Reason: 'AbsoluteKey' });
    await expect(store.GetObject({ fullPath: 'a\\b.txt' })).rejects.toMatchObject({ Reason: 'UnsafeKey' });
    await expect(store.GetObject({ fullPath: 'a%2Fb.txt' })).rejects.toMatchObject({ Reason: 'UnsafeKey' });
    for (const key of ['/etc/passwd', 'a\\..\\..\\outside.txt', 'a%2F..%2Foutside.txt']) {
      await expect(store.GetObject({ fullPath: key })).rejects.toBeInstanceOf(StorageRootEscapeError);
      await expect(store.PutObject(key, Buffer.from('x'))).rejects.toBeInstanceOf(StorageRootEscapeError);
    }
  });

  it('refuses an escaping destination in MoveObject and CopyObject', async () => {
    await store.PutObject('in.txt', Buffer.from('x'));
    await expect(store.MoveObject('in.txt', '../moved.txt')).rejects.toBeInstanceOf(StorageRootEscapeError);
    await expect(store.CopyObject('in.txt', '../copied.txt')).rejects.toBeInstanceOf(StorageRootEscapeError);
    expect(await store.ObjectExists('in.txt')).toBe(true);
  });

  it('refuses an empty key for object operations and the root for DeleteDirectory', async () => {
    await expect(store.GetObject({ fullPath: '' })).rejects.toBeInstanceOf(StorageRootEscapeError);
    await expect(store.GetObject({ fullPath: '' })).rejects.toMatchObject({ Reason: 'EmptyKey' });
    await expect(store.PutObject('/', Buffer.from('x'))).rejects.toBeInstanceOf(StorageRootEscapeError);
    await expect(store.DeleteObject('')).rejects.toBeInstanceOf(StorageRootEscapeError);
    await expect(store.ObjectExists('/')).rejects.toBeInstanceOf(StorageRootEscapeError);
    await expect(store.DeleteDirectory('/', true)).rejects.toBeInstanceOf(StorageRootEscapeError);
    expect(existsSync(root)).toBe(true);
    // The root is still listable.
    await store.PutObject('top.txt', Buffer.from('x'));
    expect((await store.ListObjects('/')).objects.map((o) => o.name)).toEqual(['top.txt']);
  });

  it('refuses a symlink inside the root that points at a file outside it', async () => {
    const outside = await tempDir();
    await writeFile(join(outside, 'secret.txt'), 'secret');
    await symlink(join(outside, 'secret.txt'), join(root, 'link.txt'));
    await expect(store.GetObject({ fullPath: 'link.txt' })).rejects.toBeInstanceOf(StorageRootEscapeError);
    await expect(store.GetObjectMetadata({ fullPath: 'link.txt' })).rejects.toBeInstanceOf(StorageRootEscapeError);
    // Real-path containment refuses it before the symlink check is reached.
    await expect(store.GetObject({ fullPath: 'link.txt' })).rejects.toMatchObject({ Reason: 'OutsideRoot' });
  });

  it('refuses a symlinked directory inside the root as a write target', async () => {
    const outside = await tempDir();
    await symlink(outside, join(root, 'linked-dir'));
    await expect(store.PutObject('linked-dir/x.txt', Buffer.from('x'))).rejects.toMatchObject({ Reason: 'OutsideRoot' });
    expect(await readdir(outside)).toEqual([]);
  });

  it('treats a symlink that stays inside the root as neither an object nor a listed entry', async () => {
    await store.PutObject('real.txt', Buffer.from('x'));
    await symlink(join(root, 'real.txt'), join(root, 'alias.txt'));
    await expect(store.GetObject({ fullPath: 'alias.txt' })).rejects.toMatchObject({ Reason: 'SymbolicLink' });
    expect((await store.ListObjects('')).objects.map((o) => o.name)).toEqual(['real.txt']);
  });

  it('removes an empty directory non-recursively and refuses a non-empty one', async () => {
    await store.CreateDirectory('empty/');
    expect(await store.DeleteDirectory('empty/')).toBe(true);
    expect(await store.DirectoryExists('empty/')).toBe(false);
    await store.PutObject('full/a.txt', Buffer.from('x'));
    await expect(store.DeleteDirectory('full/')).rejects.toMatchObject({ code: 'ENOTEMPTY' });
    expect(await store.DeleteDirectory('full/', true)).toBe(true);
    expect(await store.DirectoryExists('full/')).toBe(false);
  });

  it('does not support upload URLs or search', async () => {
    await expect(store.CreatePreAuthUploadUrl('x')).rejects.toBeInstanceOf(UnsupportedOperationError);
    await expect(store.SearchFiles('x')).rejects.toBeInstanceOf(UnsupportedOperationError);
  });
});

describe('LocalFileSystemStorage without a root', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.STORAGE_LOCAL_ROOT;
    delete process.env.STORAGE_LOCAL_ROOT;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.STORAGE_LOCAL_ROOT;
    else process.env.STORAGE_LOCAL_ROOT = saved;
  });

  it('is not configured and refuses every operation with a typed error', async () => {
    const store = new LocalFileSystemStorage();
    await store.initialize();
    expect(store.IsConfigured).toBe(false);
    await expect(store.PutObject('a.txt', Buffer.from('x'))).rejects.toBeInstanceOf(StorageRootNotConfiguredError);
    await expect(store.ListObjects('/')).rejects.toBeInstanceOf(StorageRootNotConfiguredError);
  });
});
