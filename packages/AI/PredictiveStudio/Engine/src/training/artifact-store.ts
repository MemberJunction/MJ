/**
 * @module training/artifact-store
 *
 * Implementations of the {@link IArtifactStore} seam (plan §11). The serialized
 * model artifact is kept out of the `MJ: ML Models` row and referenced by file
 * id; this module provides:
 *
 * - {@link MJFilesArtifactStore} — the production store: it uploads the serialized
 *   bytes to a File Storage Account through MJStorage (`FileStorageEngine`) and
 *   records the `MJ: Files` row that points at them (`ProviderID` + `ProviderKey`,
 *   `Status = 'Uploaded'`). It returns the real File row id, so
 *   `MLModel.ArtifactFileID` satisfies its FK to `__mj.File`, and the matching
 *   `MJStorageArtifactLoader` downloads the bytes back from that row's provider.
 * - {@link InMemoryArtifactStore} — an in-memory map used by unit tests (no DB).
 *
 * ## Why the bytes live in the storage provider
 *
 * A model trained on one host must score on any other host that shares the
 * database and the storage provider — a second MJAPI node, a redeployed container,
 * another developer's machine (#4991). Bytes written to the training host's disk
 * only exist there, and under the default `os.tmpdir()` location not even there
 * for long. The File row is the whole contract: whoever can read it can fetch the
 * bytes.
 *
 * Models trained before this change have a File row with no `ProviderKey`; their
 * bytes are still on the training host's disk at `<baseDir>/<file.ID>.bin`
 * ({@link ResolveLocalArtifactBaseDir}). The loader keeps reading those so existing
 * models do not stop scoring where they used to; retraining moves them to storage.
 */

import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RunView, LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFileEntity } from '@memberjunction/core-entities';
import { FileStorageEngine, type FileStorageBase } from '@memberjunction/storage';
import type { IArtifactStore, IEntityFactory } from './types';

/**
 * Resolve the base directory that artifacts trained before #4991 were written to:
 * env `PS_ARTIFACT_DIR` when set, else `<os.tmpdir()>/mj-ps-artifacts`. New
 * artifacts go to the storage provider; this is read only to keep scoring those
 * older models (bytes at `<baseDir>/<file.ID>.bin`).
 */
export function ResolveLocalArtifactBaseDir(): string {
  const fromEnv = process.env.PS_ARTIFACT_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return join(tmpdir(), 'mj-ps-artifacts');
}

/** @deprecated Use {@link ResolveLocalArtifactBaseDir}. */
export function resolveLocalArtifactBaseDir(): string {
  return ResolveLocalArtifactBaseDir();
}

/**
 * Build the absolute path a pre-#4991 artifact with the given File-row fileId lives
 * at: `<baseDir>/<fileId>.bin`.
 *
 * @param baseDir the resolved artifact base directory
 * @param fileId the `MJ: Files` row id the artifact was stored under
 */
export function LocalArtifactPath(baseDir: string, fileId: string): string {
  return join(baseDir, `${fileId}.bin`);
}

/** @deprecated Use {@link LocalArtifactPath}. */
export function localArtifactPath(baseDir: string, fileId: string): string {
  return LocalArtifactPath(baseDir, fileId);
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
}

/** Object-key prefix every model artifact is uploaded under in the storage provider. */
export const ARTIFACT_OBJECT_PREFIX = 'predictive-studio/model-artifacts';

/**
 * Build the storage object key for a new artifact:
 * `predictive-studio/model-artifacts/<uuid>/<name>`. The uuid keeps two artifacts
 * with the same name from overwriting each other; path separators in the name are
 * replaced so it stays one path segment.
 *
 * @param name the human-readable artifact name
 */
export function BuildArtifactObjectKey(name: string): string {
  const cleanName =
    name
      .replace(/[/\\]+/g, '_')
      .replace(/^\.+/, '')
      .trim() || 'model.bin';
  return `${ARTIFACT_OBJECT_PREFIX}/${randomUUID()}/${cleanName}`;
}

/**
 * Options for {@link MJFilesArtifactStore}.
 */
export interface MJFilesArtifactStoreOptions {
  /**
   * The preferred storage provider (the most-preferred active `MJ: File Storage
   * Providers` row, from {@link ResolveActiveFileStorageProviderId}). When a File
   * Storage Account exists for it, the artifact is uploaded there; otherwise the
   * engine's default account is used.
   */
  providerId?: string;
  /** MIME content type recorded on the file (defaults to `application/octet-stream`). */
  contentType?: string;
  /** Metadata provider the storage engine loads its accounts through (multi-provider correctness). */
  provider?: IMetadataProvider;
}

/** The account a save uploads to, and the provider its File row is stamped with. */
interface ArtifactStorageTarget {
  Driver: FileStorageBase;
  ProviderID: string;
}

/**
 * The production {@link IArtifactStore}. It uploads the serialized artifact bytes
 * to a File Storage Account through MJStorage, then records the `MJ: Files` row that
 * points at them (through the injected {@link IEntityFactory}). It returns the real
 * File row id so `MLModel.ArtifactFileID` satisfies its FK to `__mj.File`, and any
 * host that can read that row can download the bytes.
 *
 * Upload happens before the row is saved, and a failed save deletes the uploaded
 * object, so a failure never leaves a File row that points at nothing.
 */
export class MJFilesArtifactStore implements IArtifactStore {
  constructor(
    private readonly entityFactory: IEntityFactory,
    private readonly options: MJFilesArtifactStoreOptions = {},
  ) {}

  /** @inheritdoc */
  public async save(bytes: Uint8Array, name: string, contextUser?: UserInfo): Promise<string> {
    if (!contextUser) {
      throw new Error('MJFilesArtifactStore: a context user is required to upload a model artifact to storage');
    }
    const target = await this.resolveStorageTarget(contextUser);
    const objectKey = BuildArtifactObjectKey(name);
    const contentType = this.options.contentType ?? 'application/octet-stream';
    await this.uploadBytes(target.Driver, objectKey, bytes, contentType);
    return this.recordFileRow(target, objectKey, bytes.byteLength, name, contentType, contextUser);
  }

  /**
   * Pick the File Storage Account to upload to: an account for the preferred
   * provider when one exists, else the engine's default account. Throws when no
   * account is configured — without one there is nowhere other hosts can read from.
   */
  private async resolveStorageTarget(contextUser: UserInfo): Promise<ArtifactStorageTarget> {
    const engine = FileStorageEngine.Instance;
    await engine.Config(false, contextUser, this.options.provider);

    const preferred = this.options.providerId ? engine.GetAccountsByProviderID(this.options.providerId) : [];
    if (preferred.length > 0 && this.options.providerId) {
      return { Driver: await engine.GetDriver(preferred[0].ID, contextUser), ProviderID: this.options.providerId };
    }

    const fallback = engine.ResolveStorageAccount();
    if (!fallback) {
      const message =
        'no File Storage Account is configured. Model artifacts are stored in MJStorage so that any host sharing the ' +
        'database can score the model; configure a File Storage Account (MJ: File Storage Accounts) for an active provider.';
      LogError(`MJFilesArtifactStore: ${message}`);
      throw new Error(`Failed to persist model artifact: ${message}`);
    }
    return { Driver: await engine.GetDriver(fallback.account.ID, contextUser), ProviderID: fallback.provider.ID };
  }

  /** Upload the bytes, throwing when the driver reports failure. */
  private async uploadBytes(driver: FileStorageBase, objectKey: string, bytes: Uint8Array, contentType: string): Promise<void> {
    const uploaded = await driver.PutObject(objectKey, Buffer.from(bytes), contentType);
    if (!uploaded) {
      LogError(`MJFilesArtifactStore: storage refused the upload of '${objectKey}'`);
      throw new Error(`Failed to persist model artifact bytes: storage refused the upload of '${objectKey}'`);
    }
  }

  /**
   * Save the `MJ: Files` row for an uploaded object and return its id. On a failed
   * save the object is deleted again, so no orphan is left in storage.
   */
  private async recordFileRow(
    target: ArtifactStorageTarget,
    objectKey: string,
    byteLength: number,
    name: string,
    contentType: string,
    contextUser: UserInfo,
  ): Promise<string> {
    const file = await this.entityFactory.getEntityObject<MJFileEntity>('MJ: Files', contextUser);
    file.Name = name;
    file.ContentType = contentType;
    file.ProviderID = target.ProviderID;
    file.ProviderKey = objectKey;
    file.Status = 'Uploaded';
    file.Description = `Predictive Studio model artifact (${byteLength} bytes)`;

    if (await file.Save()) {
      return file.ID;
    }
    const message = file.LatestResult?.CompleteMessage ?? 'unknown error';
    LogError(`MJFilesArtifactStore: failed to persist artifact file row '${name}': ${message}`);
    await this.deleteOrphan(target.Driver, objectKey);
    throw new Error(`Failed to persist model artifact file: ${message}`);
  }

  /** Best-effort removal of an uploaded object whose File row could not be saved. */
  private async deleteOrphan(driver: FileStorageBase, objectKey: string): Promise<void> {
    try {
      if (await driver.DeleteObject(objectKey)) {
        return;
      }
    } catch (error) {
      LogError(`MJFilesArtifactStore: deleting orphaned object '${objectKey}' threw: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    LogError(`MJFilesArtifactStore: orphaned object '${objectKey}' — its File row failed to save and the delete also failed`);
  }
}

// ----- Store wiring (shared by every training wiring site) ---------------------

/**
 * Resolve the id of the most-preferred **active** `MJ: File Storage Providers` row,
 * or `null` when none is active. {@link MJFilesArtifactStore} uploads to an account
 * for this provider when one exists.
 *
 * @param contextUser the acting user (server-side data access is user-scoped)
 * @param provider optional provider for multi-provider correctness
 * @returns the active provider id, or `null` when none is active
 */
export async function ResolveActiveFileStorageProviderId(
  contextUser?: UserInfo,
  provider?: IMetadataProvider,
): Promise<string | null> {
  const rv = provider ? RunView.FromMetadataProvider(provider) : new RunView();
  const result = await rv.RunView<{ ID: string }>(
    {
      EntityName: 'MJ: File Storage Providers',
      ExtraFilter: 'IsActive = 1',
      Fields: ['ID'],
      // Priority is "lower numbers are preferred" — take the most-preferred active provider.
      OrderBy: 'Priority ASC',
      MaxRows: 1,
      ResultType: 'simple',
    },
    contextUser,
  );
  if (!result.Success || result.Results.length === 0) {
    return null;
  }
  return result.Results[0].ID ?? null;
}

/** @deprecated Use {@link ResolveActiveFileStorageProviderId}. */
export async function resolveActiveFileStorageProviderId(
  contextUser?: UserInfo,
  provider?: IMetadataProvider,
): Promise<string | null> {
  return ResolveActiveFileStorageProviderId(contextUser, provider);
}

/**
 * Build the training-side {@link IArtifactStore}. The store uploads the bytes to a
 * File Storage Account (preferring one for `providerId`) and records the
 * `MJ: Files` row that points at them, returning an FK-valid `ArtifactFileID`.
 * When no File Storage Account is configured, `save()` fails with an error that
 * says so.
 *
 * @param providerId the preferred storage-provider id (or `null` when none is active)
 * @param entityFactory the entity-creation seam the store records the File row through
 * @param provider optional metadata provider the storage engine loads accounts through
 */
export function BuildArtifactStore(providerId: string | null, entityFactory: IEntityFactory, provider?: IMetadataProvider): IArtifactStore {
  return new MJFilesArtifactStore(entityFactory, { providerId: providerId ?? undefined, provider });
}

/** @deprecated Use {@link BuildArtifactStore}. */
export function buildArtifactStore(providerId: string | null, entityFactory: IEntityFactory, provider?: IMetadataProvider): IArtifactStore {
  return BuildArtifactStore(providerId, entityFactory, provider);
}
