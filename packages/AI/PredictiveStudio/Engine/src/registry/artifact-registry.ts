/**
 * @module registry/artifact-registry
 *
 * The one place model artifacts are stored and loaded (§5.2). A store is write-once and returns the SHA-256 of the
 * bytes it wrote (`IArtifactStore.save`). A load re-verifies the bytes against the model's registered `ArtifactSha256`
 * every time and returns an {@link ArtifactLoad}: `verified` with the bytes, or `missing`, `hash-mismatch` (both hashes
 * named) or `unverified` (no registered hash) as values, never a quiet null (S7.1).
 *
 * A legacy `MJ: Files` row (empty `ProviderKey`, bytes on local disk) is verified exactly like a provider object: the
 * loader reads its bytes and the same hash check decides.
 */
import type { MJMLModelEntity } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import type { ArtifactLoad, StoredFile } from '@memberjunction/predictive-studio-core';

import { SnapshotHash } from '../snapshot/snapshot-hash';
import { PredictiveStudioStorage } from '../storage/ps-storage-provider';
import { MetadataEntityFactory } from '../training/seams';
import { StorageProviderArtifactStore } from '../training/storage-provider-artifact-store';
import type { IArtifactStore } from '../training/types';
import type { IArtifactLoader } from '../scoring/types';
import type { RegistryContext } from './registry-context';

/** Write-once provider storage plus verification on every load. */
export interface IArtifactRegistry {
  /** ObjectExists → throws ArtifactAlreadyStoredError; else PutObject; returns the SHA-256 of the stored bytes. */
  Store(bytes: Uint8Array, name: string, ctx: RegistryContext): Promise<StoredFile>;
  /** Re-verifies the SHA-256 on every load; `missing` / `hash-mismatch` are values, never a quiet null. */
  Load(model: Pick<MJMLModelEntity, 'ID' | 'ArtifactFileID' | 'ArtifactSha256'>, ctx: RegistryContext): Promise<ArtifactLoad>;
}

/**
 * Thrown when a registry built for one request ({@link ArtifactRegistry.ForContext}) is called with another request's
 * context: a different acting user or a different provider. Its store writes as the user it was built for, so such a
 * call would write or read as the wrong user.
 */
export class RegistryContextMismatchError extends Error {
  constructor(public readonly Operation: 'Store' | 'Load', public readonly BoundUserID: string, public readonly CallerUserID: string) {
    super(
      `Predictive Studio artifact registry: ${Operation} was called with a context (user '${CallerUserID}') other than the ` +
        `one the registry was built for (user '${BoundUserID}', or another provider instance)`,
    );
    this.name = 'RegistryContextMismatchError';
  }
}

/**
 * {@link IArtifactRegistry} over an artifact store and an artifact loader.
 *
 * A registry built by {@link ForContext} is bound to that context: its store writes as the context's user on the
 * context's provider, so {@link Store} and {@link Load} refuse ({@link RegistryContextMismatchError}) a context with a
 * different `ContextUser.ID` or another `Provider` instance. A registry built with the constructor (tests, over in-memory
 * doubles) is bound to no context and skips the check.
 */
export class ArtifactRegistry implements IArtifactRegistry {
  /** The context {@link ForContext} built this registry for; null for a registry built with the constructor. */
  private boundContext: RegistryContext | null = null;

  /**
   * @param store where {@link Store} writes; it writes as the user it was built for
   * @param loader what {@link Load} reads the stored bytes through
   */
  constructor(private readonly store: IArtifactStore, private readonly loader: IArtifactLoader) {}

  /**
   * The production registry for one request: the storage-provider store built for the context's provider and user, over
   * `loader`, bound to `ctx`. This is the only production construction path. Building it does no I/O (the store resolves
   * its provider on its first write).
   *
   * @param ctx the request's user and provider; {@link Store} and {@link Load} accept only this context
   * @param loader the artifact loader (production: `StorageProviderArtifactLoader`; a scoring run passes its deps' loader)
   */
  public static ForContext(ctx: RegistryContext, loader: IArtifactLoader): ArtifactRegistry {
    const store = new StorageProviderArtifactStore(new MetadataEntityFactory(ctx.Provider), new PredictiveStudioStorage(ctx.Provider, ctx.ContextUser));
    const registry = new ArtifactRegistry(store, loader);
    registry.boundContext = ctx;
    return registry;
  }

  /**
   * The model's `ArtifactStatus` for a load. Every load status is a value of the column, so a status the column cannot
   * hold is a compile error here.
   */
  public static ArtifactStatusOf(load: ArtifactLoad): MJMLModelEntity['ArtifactStatus'] {
    return load.Status;
  }

  /**
   * @inheritdoc The store writes as the user it was built for.
   * @throws RegistryContextMismatchError when the registry is bound to another context
   */
  public async Store(bytes: Uint8Array, name: string, ctx: RegistryContext): Promise<StoredFile> {
    this.assertBoundTo(ctx, 'Store');
    return this.store.save(bytes, name);
  }

  /**
   * Loads the model's artifact and verifies it, in this order: a file row or object that is gone is `missing`; a model
   * with no registered hash is `unverified`; bytes whose SHA-256 differs from the registered one are `hash-mismatch`;
   * otherwise `verified`. The registered hash is compared case-insensitively (a hex digest in either case is the same
   * digest).
   *
   * @throws Error when the model has no artifact file: a model that was never trained has nothing to load, and its
   *   callers refuse it as "needs training" before loading
   * @throws RegistryContextMismatchError when the registry is bound to another context
   */
  public async Load(model: Pick<MJMLModelEntity, 'ID' | 'ArtifactFileID' | 'ArtifactSha256'>, ctx: RegistryContext): Promise<ArtifactLoad> {
    this.assertBoundTo(ctx, 'Load');
    const fileId = model.ArtifactFileID;
    if (!fileId) throw new Error(`Predictive Studio model artifacts: ML Model '${model.ID}' has no artifact file to load (it was never trained)`);
    const read = await this.loader.load(fileId, ctx.ContextUser, ctx.Provider);
    if (read.Kind === 'absent') return { Status: 'missing', FileID: read.FileID };
    const registered = model.ArtifactSha256?.trim();
    if (!registered) return { Status: 'unverified', ModelID: model.ID };
    const actual = SnapshotHash.Sha256Hex(read.Bytes);
    if (actual !== registered.toLowerCase()) return { Status: 'hash-mismatch', Expected: registered, Actual: actual };
    return { Status: 'verified', Sha256: actual, Bytes: read.Bytes };
  }

  /** Refuses a context other than the bound one (same `ContextUser.ID`, same `Provider` instance); no-op when unbound. */
  private assertBoundTo(ctx: RegistryContext, operation: 'Store' | 'Load'): void {
    const bound = this.boundContext;
    if (bound === null || bound === ctx) return;
    if (bound.Provider !== ctx.Provider || !UUIDsEqual(bound.ContextUser?.ID, ctx.ContextUser?.ID)) {
      throw new RegistryContextMismatchError(operation, bound.ContextUser?.ID || '', ctx.ContextUser?.ID || '');
    }
  }
}
