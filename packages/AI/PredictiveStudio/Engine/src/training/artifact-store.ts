/**
 * @module training/artifact-store
 *
 * The in-memory {@link IArtifactStore} for unit tests, and the local-disk layout model files trained before 6.3 were
 * written to. Those files' `MJ: Files` rows have an empty `ProviderKey`; their bytes are at
 * `<PS_ARTIFACT_DIR>/<fileId>.bin` ({@link ResolveLocalArtifactBaseDir}, {@link LocalArtifactPath}), where
 * `StorageProviderArtifactLoader` reads them and `StorageProviderArtifactStore.Delete` removes them. Every model file
 * trained since is stored through the configured MJ storage provider (`StorageProviderArtifactStore`).
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { StoredFile } from '@memberjunction/predictive-studio-core';

import { SnapshotHash } from '../snapshot/snapshot-hash';
import { ArtifactAlreadyStoredError, type IArtifactStore } from './types';

/**
 * The base directory model files trained before 6.3 were written to: env `PS_ARTIFACT_DIR`
 * when set, else `<os.tmpdir()>/mj-ps-artifacts` (bytes at `<baseDir>/<file.ID>.bin`).
 */
export function ResolveLocalArtifactBaseDir(): string {
  const fromEnv = process.env.PS_ARTIFACT_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return join(tmpdir(), 'mj-ps-artifacts');
}

/**
 * The absolute path a model file trained before 6.3 lives at: `<baseDir>/<fileId>.bin`.
 *
 * @param baseDir the resolved artifact base directory
 * @param fileId the `MJ: Files` row id the artifact was stored under
 */
export function LocalArtifactPath(baseDir: string, fileId: string): string {
  return join(baseDir, `${fileId}.bin`);
}

/**
 * In-memory {@link IArtifactStore} for unit tests. Stores bytes in a map keyed by a generated file id, under the key
 * `in-memory-artifacts/<file id>/<name>` (a fresh key per save, as production's), write-once as production storage is:
 * a save whose key an entry of {@link Saved} already holds is refused with {@link ArtifactAlreadyStoredError} and
 * writes nothing. Returns the {@link StoredFile} with the SHA-256 of the bytes. No database, no MJStorage.
 */
export class InMemoryArtifactStore implements IArtifactStore {
  /** The storage provider id every file this store returns names. */
  public static readonly StorageProviderID = '00000000-0000-4000-8000-00000000A57E';
  /** Saved artifacts, keyed by the returned file id. */
  public readonly Saved = new Map<string, { Name: string; Key: string; Bytes: Uint8Array }>();
  private seq = 0;

  /** @inheritdoc */
  public async save(bytes: Uint8Array, name: string): Promise<StoredFile> {
    const id = `mem-file-${++this.seq}`;
    const key = `in-memory-artifacts/${id}/${name}`;
    if ([...this.Saved.values()].some((f) => f.Key === key)) throw new ArtifactAlreadyStoredError(key);
    this.Saved.set(id, { Name: name, Key: key, Bytes: bytes });
    return {
      fileId: id,
      storageProviderId: InMemoryArtifactStore.StorageProviderID,
      providerKey: key,
      sha256: SnapshotHash.Sha256Hex(bytes),
      sizeBytes: bytes.byteLength,
      writeOnce: true,
    };
  }

  /** @inheritdoc An in-memory store can always write. */
  public async AssertWritable(): Promise<void> {}

  /** @inheritdoc */
  public async delete(fileId: string): Promise<void> {
    if (!this.Saved.delete(fileId)) throw new Error(`InMemoryArtifactStore: no artifact ${fileId}`);
  }
}
