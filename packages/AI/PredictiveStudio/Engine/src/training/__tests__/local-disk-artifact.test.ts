import { describe, it, expect, afterEach } from 'vitest';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

import type { BaseEntity, UserInfo } from '@memberjunction/core';
import type { MJFileEntity } from '@memberjunction/core-entities';

import {
  MJFilesArtifactStore,
  localArtifactPath,
  resolveLocalArtifactBaseDir,
} from '../artifact-store';
import { LocalArtifactLoader } from '../../scoring/artifact-loader';
import type { IEntityFactory } from '../types';

/**
 * Round-trip tests for the single coherent artifact store + loader (dev / on-prem
 * local-bytes mode). NO DB, NO sidecar — a fake entity factory hands back an
 * in-memory `MJ: Files` stand-in with a stable id, and bytes are written to a
 * scratch directory. These prove the store creates a real File ROW and persists the
 * bytes locally keyed by `file.ID`, and that the loader reads them back by that same
 * (real File) id — so `MLModel.ArtifactFileID` stays FK-valid.
 */

/** A minimal in-memory `MJ: Files` stand-in with a stable id and a no-op Save(). */
class FakeFile {
  public ID: string;
  public Name = '';
  public ContentType = '';
  public ProviderID: string | null = null;
  public Description = '';
  public LatestResult: { CompleteMessage: string } | null = null;
  private readonly saveOk: boolean;

  constructor(id: string, saveOk = true) {
    this.ID = id;
    this.saveOk = saveOk;
  }

  public async Save(): Promise<boolean> {
    this.LatestResult = { CompleteMessage: this.saveOk ? '' : 'forced save failure' };
    return this.saveOk;
  }
}

/** Entity-factory fake — hands back a File stand-in with the configured id. */
class FakeFileFactory implements IEntityFactory {
  public readonly Created: FakeFile[] = [];

  constructor(private readonly makeFile: () => FakeFile = () => new FakeFile(randomUUID())) {}

  async getEntityObject<T extends BaseEntity>(entityName: string, _contextUser?: UserInfo): Promise<T> {
    if (entityName !== 'MJ: Files') {
      throw new Error(`FakeFileFactory: unexpected entity ${entityName}`);
    }
    const f = this.makeFile();
    this.Created.push(f);
    return f as unknown as T;
  }
}

/** Cast a FakeFile to the typed entity the store expects (single test-boundary cast). */
function asFileEntity(f: FakeFile): MJFileEntity {
  return f as unknown as MJFileEntity;
}

describe('MJFilesArtifactStore + LocalArtifactLoader — round-trip', () => {
  const scratchDirs: string[] = [];

  afterEach(async () => {
    for (const dir of scratchDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  async function makeScratchDir(): Promise<string> {
    const dir = await mkdtemp(join(tmpdir(), 'mj-ps-artifact-test-'));
    scratchDirs.push(dir);
    return dir;
  }

  it('save() returns the real File row id and load() round-trips the exact bytes', async () => {
    const baseDir = await makeScratchDir();
    const fileId = randomUUID();
    const factory = new FakeFileFactory(() => new FakeFile(fileId));
    const store = new MJFilesArtifactStore(factory, { providerId: 'prov-1', baseDir });
    const loader = new LocalArtifactLoader(baseDir);

    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 42, 7]);
    const returnedId = await store.save(bytes, 'model-v1.bin');

    // The returned id IS the File row id (FK-valid ArtifactFileID).
    expect(returnedId).toBe(fileId);
    const created = factory.Created[0];
    expect(created.ProviderID).toBe('prov-1');
    expect(created.ContentType).toBe('application/octet-stream');

    const loaded = await loader.load(returnedId);
    expect(loaded).not.toBeNull();
    expect(Array.from(loaded as Uint8Array)).toEqual(Array.from(bytes));
  });

  it('writes the bytes to <baseDir>/<file.ID>.bin', async () => {
    const baseDir = await makeScratchDir();
    const fileId = randomUUID();
    const store = new MJFilesArtifactStore(new FakeFileFactory(() => new FakeFile(fileId)), {
      providerId: 'prov-1',
      baseDir,
    });

    await store.save(new Uint8Array([9]), 'm.bin');

    const onDisk = await stat(localArtifactPath(baseDir, fileId));
    expect(onDisk.isFile()).toBe(true);
    const files = await readdir(baseDir);
    expect(files).toEqual([`${fileId}.bin`]);
  });

  it('creates the base directory when missing', async () => {
    const parent = await makeScratchDir();
    const baseDir = join(parent, 'nested', 'does-not-exist-yet');
    const fileId = randomUUID();
    const store = new MJFilesArtifactStore(new FakeFileFactory(() => new FakeFile(fileId)), {
      providerId: 'prov-1',
      baseDir,
    });

    const returnedId = await store.save(new Uint8Array([1, 2, 3]), 'm.bin');

    const loaded = await new LocalArtifactLoader(baseDir).load(returnedId);
    expect(Array.from(loaded as Uint8Array)).toEqual([1, 2, 3]);
  });

  it('throws when the File row fails to save (no bytes written)', async () => {
    const baseDir = await makeScratchDir();
    const fileId = randomUUID();
    const store = new MJFilesArtifactStore(new FakeFileFactory(() => new FakeFile(fileId, false)), {
      providerId: 'prov-1',
      baseDir,
    });

    await expect(store.save(new Uint8Array([1]), 'm.bin')).rejects.toThrow(/persist model artifact file/i);
    const files = await readdir(baseDir).catch(() => [] as string[]);
    expect(files).toEqual([]);
  });

  it('keeps the fake-file cast honest (the stand-in satisfies the store contract)', () => {
    const f = new FakeFile('x');
    expect(asFileEntity(f).ID).toBe('x');
  });
});

describe('LocalArtifactLoader — missing files return null', () => {
  it('returns null for an id with no file in the base dir', async () => {
    const baseDir = await mkdtemp(join(tmpdir(), 'mj-ps-artifact-empty-'));
    try {
      const loaded = await new LocalArtifactLoader(baseDir).load('A1B2C3D4-0000-0000-0000-000000000000');
      expect(loaded).toBeNull();
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });

  it('returns null (not throws) when the base dir itself does not exist', async () => {
    const baseDir = join(tmpdir(), 'mj-ps-artifact-missing-dir', 'never-created');
    const loaded = await new LocalArtifactLoader(baseDir).load('A1B2C3D4-0000-0000-0000-000000000000');
    expect(loaded).toBeNull();
  });
});

describe('local artifact path + base dir resolution', () => {
  it('localArtifactPath builds <baseDir>/<fileId>.bin', () => {
    expect(localArtifactPath('/base', 'abc-123')).toBe(join('/base', 'abc-123.bin'));
  });

  it('resolveLocalArtifactBaseDir honors PS_ARTIFACT_DIR, else os tmpdir', () => {
    const prev = process.env.PS_ARTIFACT_DIR;
    try {
      process.env.PS_ARTIFACT_DIR = '/custom/ps/artifacts';
      expect(resolveLocalArtifactBaseDir()).toBe('/custom/ps/artifacts');

      delete process.env.PS_ARTIFACT_DIR;
      expect(resolveLocalArtifactBaseDir()).toBe(join(tmpdir(), 'mj-ps-artifacts'));
    } finally {
      if (prev === undefined) {
        delete process.env.PS_ARTIFACT_DIR;
      } else {
        process.env.PS_ARTIFACT_DIR = prev;
      }
    }
  });
});
