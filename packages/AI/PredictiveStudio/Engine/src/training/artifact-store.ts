/**
 * @module training/artifact-store
 *
 * Implementations of the {@link IArtifactStore} seam (plan §11). The serialized
 * model artifact is kept out of the `MJ: ML Models` row and referenced by file
 * id; this module provides:
 *
 * - {@link MJFilesArtifactStore} — the production default, which records a
 *   `MJ: Files` row via the injected {@link IEntityFactory}. Kept dependency-light
 *   on purpose: it does not import MJStorage drivers, so the Engine package stays
 *   slim and the store is trivially mockable.
 * - {@link InMemoryArtifactStore} — an in-memory map used by unit tests (no DB).
 */

import type { UserInfo } from '@memberjunction/core';
import { LogError } from '@memberjunction/core';
import type { MJFileEntity } from '@memberjunction/core-entities';
import type { IArtifactStore, IEntityFactory } from './types';

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
   * Storage-provider id to stamp on the `MJ: Files` row (`ProviderID`). When
   * omitted, the file is recorded without a provider and the actual byte upload
   * is expected to be wired by a higher layer that owns the MJStorage binding.
   */
  providerId?: string;
  /** MIME content type recorded on the file (defaults to `application/octet-stream`). */
  contentType?: string;
}

/**
 * Production {@link IArtifactStore} backed by `MJ: Files`. Creates the file row
 * through the injected {@link IEntityFactory} (so it shares the engine's
 * entity-creation seam and stays testable). The serialized artifact bytes are
 * handed to MJStorage by the layer that supplies a real `providerId` + storage
 * binding; this store owns the metadata row + id contract (plan §11 — "stored in
 * MJStorage (MJ: Files), referenced by ArtifactFileID").
 */
export class MJFilesArtifactStore implements IArtifactStore {
  constructor(
    private readonly entityFactory: IEntityFactory,
    private readonly options: MJFilesArtifactStoreOptions = {},
  ) {}

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
      LogError(`MJFilesArtifactStore: failed to persist artifact file '${name}': ${message}`);
      throw new Error(`Failed to persist model artifact file: ${message}`);
    }
    return file.ID;
  }
}
