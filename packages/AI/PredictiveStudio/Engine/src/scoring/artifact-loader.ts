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
 *   of `MJFilesArtifactStore`. The storage provider is the source of truth; each
 *   server keeps its own copy at `<baseDir>/<fileId>.bin`. The first load on a
 *   server downloads the bytes from the provider named on the `MJ: Files` row and
 *   writes that copy; later loads read it from disk (#4991).
 * - {@link LocalArtifactLoader} — reads `<baseDir>/<fileId>.bin` from local disk.
 */

import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';

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
   * Directory this server keeps its copies of downloaded artifacts in. Defaults to
   * {@link ResolveLocalArtifactBaseDir} (env `PS_ARTIFACT_DIR`, else
   * `<os.tmpdir()>/mj-ps-artifacts`). Set `PS_ARTIFACT_DIR` to a persistent path on
   * servers so a restart does not re-download every model.
   */
  CacheDir?: string;
}

/**
 * The production {@link IArtifactLoader} — the read-side inverse of
 * `MJFilesArtifactStore`. Given a fileId (the `MJ: Files` row id the artifact was
 * stored under):
 *
 * 1. If this server already has `<cacheDir>/<fileId>.bin`, return it. Trained
 *    artifacts are immutable, so the copy never goes stale. Models trained before
 *    #4991 also have their bytes here, on the host that trained them.
 * 2. Otherwise load the File row, download the bytes from its storage provider at
 *    its `ProviderKey`, save them to `<cacheDir>/<fileId>.bin`, and return them.
 *
 * The copy is written to a temp file and renamed into place, so a crash or two
 * concurrent first loads never leave a partial file. Failing to write the copy is
 * logged and does not fail the load. Returns `null` when the File row or the
 * object does not exist, or when no File Storage Account can read the row's
 * provider; the reason is logged.
 */
export class MJStorageArtifactLoader implements IArtifactLoader {
  private readonly cacheDir: string;
  private readonly localCopies: LocalArtifactLoader;

  constructor(private readonly options: MJStorageArtifactLoaderOptions = {}) {
    this.cacheDir = options.CacheDir ?? ResolveLocalArtifactBaseDir();
    this.localCopies = new LocalArtifactLoader(this.cacheDir);
  }

  /** @inheritdoc */
  public async load(fileId: string, contextUser?: UserInfo): Promise<Uint8Array | null> {
    const local = await this.localCopies.load(fileId, contextUser);
    if (local) {
      return local;
    }
    const file = await this.loadFileRow(fileId, contextUser);
    if (!file) {
      return null;
    }
    if (!file.ProviderKey) {
      LogError(
        `MJStorageArtifactLoader: artifact '${fileId}' was trained before model artifacts were stored in MJStorage, ` +
          `and its bytes are not on this host; retrain the model to make it scorable here`,
      );
      return null;
    }
    const bytes = await this.download(file, file.ProviderKey, contextUser);
    if (bytes) {
      await this.saveLocalCopy(fileId, bytes);
    }
    return bytes;
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

  /**
   * Save this server's copy of a downloaded artifact: write a temp file next to the
   * target, then rename it into place. A failure is logged, never thrown — the
   * caller already has the bytes, and the next load downloads them again.
   */
  private async saveLocalCopy(fileId: string, bytes: Uint8Array): Promise<void> {
    const target = LocalArtifactPath(this.cacheDir, fileId);
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      await mkdir(this.cacheDir, { recursive: true });
      await writeFile(temp, bytes);
      await rename(temp, target);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`MJStorageArtifactLoader: could not keep a local copy of artifact '${fileId}' under '${this.cacheDir}': ${message}`);
      await rm(temp, { force: true }).catch(() => undefined);
    }
  }
}

/**
 * Reads an artifact from local disk at `<baseDir>/<fileId>.bin` and returns its
 * bytes, or `null` when the file is absent. {@link MJStorageArtifactLoader} uses it
 * to read this server's copy before downloading.
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
