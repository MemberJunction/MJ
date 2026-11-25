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
 *
 * The production loader is `StorageProviderArtifactLoader`
 * (`scoring/storage-provider-artifact-loader`).
 */

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';

import type { ArtifactBytesRead, IArtifactLoader } from './types';

/**
 * In-memory {@link IArtifactLoader} for unit tests. Holds artifact bytes keyed by
 * file id and returns them on {@link load} (`absent` for an id it does not hold). No database, no MJStorage.
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

  /** @inheritdoc A file id with no bytes registered is `absent`. */
  public async load(fileId: string, _contextUser: UserInfo, _provider: IMetadataProvider): Promise<ArtifactBytesRead> {
    const bytes = this.store.get(fileId);
    return bytes ? { Kind: 'read', Bytes: bytes } : { Kind: 'absent', FileID: fileId };
  }
}
