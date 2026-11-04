/**
 * @module training/artifact-store
 *
 * The in-memory {@link IArtifactStore} for unit tests, and the local-disk layout model files trained before 6.3 were
 * written to. Those files' `MJ: Files` rows have an empty `ProviderKey`; their bytes are at
 * `<PS_ARTIFACT_DIR>/<fileId>.bin` ({@link ResolveLocalArtifactBaseDir}, {@link LocalArtifactPath}), where
 * `StorageProviderArtifactLoader` reads them and `StorageProviderArtifactStore.delete` removes them. Every model file
 * trained since is stored through the configured MJ storage provider (`StorageProviderArtifactStore`).
 */

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { IArtifactStore } from './types';

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
 * In-memory {@link IArtifactStore} for unit tests. Stores bytes in a map keyed by
 * a generated id and returns that id. No database, no MJStorage.
 */
export class InMemoryArtifactStore implements IArtifactStore {
  /** Saved artifacts, keyed by the returned file id. */
  public readonly Saved = new Map<string, { Name: string; Bytes: Uint8Array }>();
  private seq = 0;

  /** @inheritdoc */
  public async save(bytes: Uint8Array, name: string): Promise<string> {
    const id = `mem-file-${++this.seq}`;
    this.Saved.set(id, { Name: name, Bytes: bytes });
    return id;
  }

  /** @inheritdoc An in-memory store can always write. */
  public async AssertWritable(): Promise<void> {}

  /** @inheritdoc */
  public async delete(fileId: string): Promise<void> {
    if (!this.Saved.delete(fileId)) throw new Error(`InMemoryArtifactStore: no artifact ${fileId}`);
  }
}
