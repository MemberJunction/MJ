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
 * - {@link MJStorageArtifactLoader} — the production loader, the read-side inverse
 *   of `MJFilesArtifactStore`. The fileId is the real `MJ: Files` row id; it loads
 *   that row and downloads the bytes from the row's storage provider at its
 *   `ProviderKey`, so any host sharing the database and provider can score (#4991).
 * - {@link LocalArtifactLoader} — reads `<baseDir>/<fileId>.bin` from local disk.
 *   Only models trained before #4991 have bytes there (their File row has no
 *   `ProviderKey`); {@link MJStorageArtifactLoader} delegates those to it.
 */

import { readFile } from 'node:fs/promises';

import { LogError, Metadata, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine } from '@memberjunction/storage';

import { ResolveLocalArtifactBaseDir, LocalArtifactPath } from '../training/artifact-store';
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
  public Set(fileId: string, bytes: Uint8Array): void {
    this.store.set(fileId, bytes);
  }

  /** @deprecated Use {@link Set}. */
  public set(fileId: string, bytes: Uint8Array): void {
    return this.Set(fileId, bytes);
  }

  /** @inheritdoc */
  public async load(fileId: string, _contextUser?: UserInfo): Promise<Uint8Array | null> {
    return this.store.get(fileId) ?? null;
  }
}

/**
 * Options for {@link MJStorageArtifactLoader}.
 */
export interface MJStorageArtifactLoaderOptions {
  /** Metadata provider the File row is loaded through (defaults to `Metadata.Provider`). */
  Provider?: IMetadataProvider;
  /**
   * Loader for artifacts trained before #4991, whose File row has no `ProviderKey`
   * because the bytes were written to the training host's disk. Defaults to a
   * {@link LocalArtifactLoader}.
   */
  LegacyLoader?: IArtifactLoader;
}

/**
 * The production {@link IArtifactLoader} — the read-side inverse of
 * `MJFilesArtifactStore`. Given a fileId (the `MJ: Files` row id the artifact was
 * stored under), it loads the File row and downloads the bytes from that row's
 * storage provider at its `ProviderKey`. Every host that shares the database and
 * the storage provider gets the same bytes.
 *
 * Returns `null` when the File row or the object does not exist, or when no File
 * Storage Account can read the row's provider; the reason is logged.
 */
export class MJStorageArtifactLoader implements IArtifactLoader {
  private readonly legacyLoader: IArtifactLoader;

  constructor(private readonly options: MJStorageArtifactLoaderOptions = {}) {
    this.legacyLoader = options.LegacyLoader ?? new LocalArtifactLoader();
  }

  /** @inheritdoc */
  public async load(fileId: string, contextUser?: UserInfo): Promise<Uint8Array | null> {
    const file = await this.loadFileRow(fileId, contextUser);
    if (!file) {
      return null;
    }
    if (!file.ProviderKey) {
      // Trained before #4991: the bytes were written to the training host's disk.
      return this.legacyLoader.load(fileId, contextUser);
    }
    return this.download(file, file.ProviderKey, contextUser);
  }

  /** Load the `MJ: Files` row, or `null` when it does not exist. */
  private async loadFileRow(fileId: string, contextUser?: UserInfo): Promise<MJFileEntity | null> {
    const md = this.options.Provider ?? Metadata.Provider;
    const file = await md.GetEntityObject<MJFileEntity>('MJ: Files', contextUser);
    if (!(await file.Load(fileId))) {
      LogError(`MJStorageArtifactLoader: no MJ: Files row '${fileId}' for the model artifact`);
      return null;
    }
    return file;
  }

  /** Download the object a File row points at from the row's storage provider. */
  private async download(file: MJFileEntity, objectKey: string, contextUser?: UserInfo): Promise<Uint8Array | null> {
    if (!contextUser) {
      LogError(`MJStorageArtifactLoader: a context user is required to download artifact '${file.ID}' from storage`);
      return null;
    }
    try {
      const engine = FileStorageEngine.Instance;
      await engine.Config(false, contextUser, this.options.Provider);
      const accounts = engine.GetAccountsByProviderID(file.ProviderID);
      if (accounts.length === 0) {
        LogError(`MJStorageArtifactLoader: no File Storage Account for provider '${file.ProviderID}', so artifact '${file.ID}' cannot be read`);
        return null;
      }
      const driver = await engine.GetDriver(accounts[0].ID, contextUser);
      const content = await driver.GetObject({ fullPath: objectKey });
      return new Uint8Array(content);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`MJStorageArtifactLoader: failed to download artifact '${file.ID}' at '${objectKey}': ${message}`);
      return null;
    }
  }
}

/**
 * Reads an artifact from local disk at `<baseDir>/<fileId>.bin` and returns its
 * bytes, or `null` when the file is absent. Only models trained before #4991 have
 * bytes on disk; {@link MJStorageArtifactLoader} delegates those File rows here.
 *
 * A missing file is a normal, expected `null`; only a genuine I/O failure
 * (permissions, corruption) is logged. It can only read paths on the machine the
 * artifact was written to.
 */
export class LocalArtifactLoader implements IArtifactLoader {
  private readonly baseDir: string;

  /**
   * @param baseDir optional base-directory override (defaults to
   *   {@link resolveLocalArtifactBaseDir}); must match the store's base dir
   */
  constructor(baseDir: string = ResolveLocalArtifactBaseDir()) {
    this.baseDir = baseDir;
  }

  /** @inheritdoc */
  public async load(fileId: string, _contextUser?: UserInfo): Promise<Uint8Array | null> {
    const absolutePath = LocalArtifactPath(this.baseDir, fileId);
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
