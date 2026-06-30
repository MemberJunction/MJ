/**
 * @module training/artifact-store
 *
 * Implementations of the {@link IArtifactStore} seam (plan §11). The serialized
 * model artifact is kept out of the `MJ: ML Models` row and referenced by file
 * id; this module provides:
 *
 * - {@link MJFilesArtifactStore} — the single coherent store: it records a real
 *   `MJ: Files` row (so `MLModel.ArtifactFileID` satisfies its FK to `__mj.File`)
 *   AND writes the serialized bytes to local disk at `<baseDir>/<file.ID>.bin`. It
 *   returns the real File row id, which the matching loader uses to read the bytes
 *   back. Kept dependency-light: it does not import MJStorage cloud drivers.
 * - {@link InMemoryArtifactStore} — an in-memory map used by unit tests (no DB).
 *
 * ## The real-File-id + local-bytes convention (dev / on-prem)
 *
 * `MLModel.ArtifactFileID` is a FK to `__mj.File`, so the fileId MUST be a genuine
 * `MJ: Files` row id — a bare random UUID would violate `FK_MLModel_ArtifactFile`.
 * Therefore the store ALWAYS creates the File row (stamped with the active storage
 * `ProviderID`) and returns `file.ID`. For this dev / on-prem mode the bytes are
 * persisted to **local disk** keyed by that same id (`<baseDir>/<file.ID>.bin`,
 * {@link resolveLocalArtifactBaseDir}); the scoring loader reads them back by id.
 *
 * **Production follow-up**: replace the local `writeFile` with a real storage
 * `PutObject` against the provider (and the loader with a `GetObject`); the File
 * row + id contract is unchanged, so only the byte transport moves to the cloud.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { RunView, LogError, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import type { MJFileEntity } from '@memberjunction/core-entities';
import type { IArtifactStore, IEntityFactory } from './types';

/**
 * Resolve the base directory artifact bytes are written to: env `PS_ARTIFACT_DIR`
 * when set, else `<os.tmpdir()>/mj-ps-artifacts`. Centralized so the store (write)
 * and the loader (read) agree on the location (bytes live at `<baseDir>/<file.ID>.bin`).
 */
export function resolveLocalArtifactBaseDir(): string {
  const fromEnv = process.env.PS_ARTIFACT_DIR;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  return join(tmpdir(), 'mj-ps-artifacts');
}

/**
 * Build the absolute path an artifact with the given File-row fileId lives at:
 * `<baseDir>/<fileId>.bin`. Shared by the store (write) and the loader (read) so
 * they agree on the on-disk layout.
 *
 * @param baseDir the resolved artifact base directory
 * @param fileId the `MJ: Files` row id the artifact was stored under
 */
export function localArtifactPath(baseDir: string, fileId: string): string {
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
}

/**
 * Options for {@link MJFilesArtifactStore}.
 */
export interface MJFilesArtifactStoreOptions {
  /**
   * Storage-provider id to stamp on the `MJ: Files` row (`ProviderID`). Required in
   * practice — the column is NOT NULL — and supplied by {@link buildArtifactStore}
   * from the active `MJ: File Storage Providers` row.
   */
  providerId?: string;
  /** MIME content type recorded on the file (defaults to `application/octet-stream`). */
  contentType?: string;
  /**
   * Base directory the serialized bytes are written to. Defaults to
   * {@link resolveLocalArtifactBaseDir} (env `PS_ARTIFACT_DIR`, else
   * `<os.tmpdir()>/mj-ps-artifacts`). Injectable so tests target a scratch dir.
   */
  baseDir?: string;
}

/**
 * The single coherent {@link IArtifactStore}: it creates a real `MJ: Files` row
 * (through the injected {@link IEntityFactory}, stamped with the active storage
 * `ProviderID`) AND persists the serialized artifact bytes to local disk at
 * `<baseDir>/<file.ID>.bin`. It returns the real File row id so
 * `MLModel.ArtifactFileID` satisfies its FK to `__mj.File`, and the matching
 * {@link LocalArtifactLoader} reads the bytes back by that id.
 *
 * Why both halves: the FK forces a genuine File row id, but `MJ: Files.Save()` only
 * records the metadata row — it never moves bytes — so for this dev / on-prem mode
 * we write the bytes ourselves, keyed by the File id. **Production follow-up**:
 * swap the local `writeFile` for a real provider `PutObject`; the id contract is
 * unchanged.
 */
export class MJFilesArtifactStore implements IArtifactStore {
  private readonly baseDir: string;

  constructor(
    private readonly entityFactory: IEntityFactory,
    private readonly options: MJFilesArtifactStoreOptions = {},
  ) {
    this.baseDir = options.baseDir ?? resolveLocalArtifactBaseDir();
  }

  /** @inheritdoc */
  public async save(bytes: Uint8Array, name: string, contextUser?: UserInfo): Promise<string> {
    const file = await this.entityFactory.getEntityObject<MJFileEntity>('MJ: Files', contextUser);
    file.Name = name;
    file.ContentType = this.options.contentType ?? 'application/octet-stream';
    if (this.options.providerId) {
      file.ProviderID = this.options.providerId;
    }
    file.Description = `Predictive Studio model artifact (${bytes.byteLength} bytes)`;

    const saved = await file.Save();
    if (!saved) {
      const message = file.LatestResult?.CompleteMessage ?? 'unknown error';
      LogError(`MJFilesArtifactStore: failed to persist artifact file row '${name}': ${message}`);
      throw new Error(`Failed to persist model artifact file: ${message}`);
    }

    // The File row exists but holds no bytes; persist them locally keyed by the real
    // File id (dev/on-prem). Production follow-up: a provider PutObject instead.
    try {
      await mkdir(this.baseDir, { recursive: true });
      await writeFile(localArtifactPath(this.baseDir, file.ID), bytes);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      LogError(`MJFilesArtifactStore: persisted File row '${file.ID}' but failed to write bytes under '${this.baseDir}': ${message}`);
      throw new Error(`Failed to persist model artifact bytes: ${message}`);
    }

    return file.ID;
  }
}

// ----- Store wiring (shared by every training wiring site) ---------------------

/**
 * Resolve the id of the first **active** `MJ: File Storage Providers` row, or
 * `null` when none is active. The provider id is stamped on every artifact's
 * `MJ: Files` row (its `ProviderID` is NOT NULL); a seeded active provider (e.g.
 * "Local Storage") is what lets {@link MJFilesArtifactStore} create a valid File row
 * in dev / on-prem deployments.
 *
 * @param contextUser the acting user (server-side data access is user-scoped)
 * @param provider optional provider for multi-provider correctness
 * @returns the active provider id, or `null` when none is active
 */
export async function resolveActiveFileStorageProviderId(
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

/**
 * Build the training-side {@link IArtifactStore}, stamping the resolved active
 * storage `providerId` on every File row. The store creates a real `MJ: Files` row
 * (FK-valid `ArtifactFileID`) and writes the bytes to local disk keyed by that id
 * (dev / on-prem). When no active provider exists the File row's NOT-NULL
 * `ProviderID` cannot be set and `Save()` will fail with a clear error — seed an
 * active provider (e.g. "Local Storage") to enable artifact persistence.
 *
 * @param providerId the active storage-provider id (or `null` when none is active)
 * @param entityFactory the entity-creation seam the store records the File row through
 */
export function buildArtifactStore(providerId: string | null, entityFactory: IEntityFactory): IArtifactStore {
  return new MJFilesArtifactStore(entityFactory, { providerId: providerId ?? undefined });
}
