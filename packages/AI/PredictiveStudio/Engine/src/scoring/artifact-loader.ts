/**
 * @module scoring/artifact-loader
 *
 * Implementations of the {@link IArtifactLoader} seam (plan §11) — the read-side
 * counterpart to the training `IArtifactStore`. The serialized model artifact is
 * kept out of the `MJ: ML Models` row and referenced by file id; this module
 * provides:
 *
 * - {@link InMemoryArtifactLoader} — for unit tests (no DB, no MJStorage), which
 *   can also bridge a training-time `InMemoryArtifactStore.Saved` map so a model
 *   trained in-memory can be scored in-memory in the same test.
 * - {@link LocalArtifactLoader} — the read-side inverse of `MJFilesArtifactStore`.
 *   The fileId is the real `MJ: Files` row id and the bytes live on local disk at
 *   `<baseDir>/<fileId>.bin` (dev / on-prem); this reads that path and returns its
 *   bytes, or `null` when absent. **Production follow-up**: a provider `GetObject`
 *   keyed by the File id replaces the local `readFile`.
 */

import { readFile } from 'node:fs/promises';

import { LogError, type UserInfo } from '@memberjunction/core';

import { resolveLocalArtifactBaseDir, localArtifactPath } from '../training/artifact-store';
import type { IArtifactLoader } from './types';

/**
 * In-memory {@link IArtifactLoader} for unit tests. Holds artifact bytes keyed by
 * file id and returns them on {@link load}. No database, no MJStorage.
 *
 * Bridges the training-side `InMemoryArtifactStore`: pass its `Saved` map (keyed
 * by the returned file id, with `{ Bytes }`) so a model trained in-memory is
 * directly loadable for scoring in the same test.
 */
export class InMemoryArtifactLoader implements IArtifactLoader {
  private readonly store: Map<string, Uint8Array>;

  /**
   * @param initial optional seed: either a plain `fileId → bytes` map, or a
   *   training `InMemoryArtifactStore.Saved`-shaped map (`fileId → { Bytes }`).
   */
  constructor(initial?: Map<string, Uint8Array> | Map<string, { Bytes: Uint8Array }>) {
    this.store = new Map();
    if (initial) {
      for (const [id, value] of initial.entries()) {
        this.store.set(id, value instanceof Uint8Array ? value : value.Bytes);
      }
    }
  }

  /** Register artifact bytes under a file id (test setup convenience). */
  public set(fileId: string, bytes: Uint8Array): void {
    this.store.set(fileId, bytes);
  }

  /** @inheritdoc */
  public async load(fileId: string, _contextUser?: UserInfo): Promise<Uint8Array | null> {
    return this.store.get(fileId) ?? null;
  }
}

/**
 * The single production {@link IArtifactLoader} — the read-side inverse of
 * {@link MJFilesArtifactStore}. Given a fileId (= the real `MJ: Files` row id the
 * artifact was stored under), it reads the bytes from local disk at
 * `<baseDir>/<fileId>.bin` and returns them, or `null` when the file is absent.
 *
 * A missing file is a normal, expected `null` (the model has no persisted artifact);
 * only a genuine I/O failure (permissions, corruption) is logged.
 *
 * **NOT for multi-host production** — it can only read paths on the machine the
 * artifact was written to. **Production follow-up**: replace the local `readFile`
 * with a provider `GetObject` keyed by the File id; the id contract is unchanged.
 */
export class LocalArtifactLoader implements IArtifactLoader {
  private readonly baseDir: string;

  /**
   * @param baseDir optional base-directory override (defaults to
   *   {@link resolveLocalArtifactBaseDir}); must match the store's base dir
   */
  constructor(baseDir: string = resolveLocalArtifactBaseDir()) {
    this.baseDir = baseDir;
  }

  /** @inheritdoc */
  public async load(fileId: string, _contextUser?: UserInfo): Promise<Uint8Array | null> {
    const absolutePath = localArtifactPath(this.baseDir, fileId);
    try {
      const buffer = await readFile(absolutePath);
      return new Uint8Array(buffer);
    } catch (error) {
      // ENOENT is the expected "no persisted artifact" signal — return null quietly.
      // Log only real I/O failures.
      if (!isFileNotFoundError(error)) {
        const message = error instanceof Error ? error.message : String(error);
        LogError(`LocalArtifactLoader: failed to read artifact at '${absolutePath}': ${message}`);
      }
      return null;
    }
  }
}

/** Whether a caught error is a Node "file not found" (`ENOENT`) error. */
function isFileNotFoundError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
