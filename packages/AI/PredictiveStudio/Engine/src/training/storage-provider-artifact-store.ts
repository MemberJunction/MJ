/**
 * @module training/storage-provider-artifact-store
 *
 * Trained model files in the MJ storage provider every Predictive Studio file is written to
 * ({@link PredictiveStudioStorage}: `PS_STORAGE_PROVIDER`, default "Local File System"). Each artifact is an object
 * under `predictive-studio/model-artifacts/<fresh UUID>/<name>` and an `MJ: Files` row naming its provider and key.
 *
 * Every save gets a fresh key, so no other save shares its object, and storage is write-once: a save refuses a key that
 * already holds an object, or that another save in this process is writing ({@link ObjectKeyReservations}), with
 * {@link ArtifactAlreadyStoredError} before writing anything, so stored bytes are never replaced. A save returns the
 * {@link StoredFile} it wrote, with the SHA-256 of the stored bytes. A save whose `MJ: Files` row fails removes the
 * object it just wrote, and a rollback ({@link StorageProviderArtifactStore.delete}) removes the object, then the row.
 * Rows are written and read as the user of the {@link PredictiveStudioStorage} the store is built over.
 *
 * A model `MJ: Files` row with an empty `ProviderKey` was written before model files went through the storage provider:
 * its bytes are on local disk at `LocalArtifactPath(ResolveLocalArtifactBaseDir(), fileId)` (`PS_ARTIFACT_DIR`), and
 * `Delete` removes that file with the row.
 */
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { LogError, LogWarning } from '@memberjunction/core';
import type { StoredFile } from '@memberjunction/predictive-studio-core';
import { IsSafeStorageObjectKey } from '@memberjunction/storage';

import { SnapshotHash } from '../snapshot/snapshot-hash';
import { PredictiveStudioStorage, type StorageDriverBinding } from '../storage/ps-storage-provider';
import { LocalArtifactPath, ResolveLocalArtifactBaseDir } from './artifact-store';
import { ObjectKeyReservations } from './object-key-reservations';
import { ArtifactAlreadyStoredError, type IArtifactStore, type IEntityFactory } from './types';

/** {@link IArtifactStore} over the configured MJ storage provider. */
export class StorageProviderArtifactStore implements IArtifactStore {
  /** The key prefix every model artifact object is stored under. */
  public static readonly KEY_PREFIX = 'predictive-studio/model-artifacts';
  /** The object name of the write probe {@link AssertWritable} puts and deletes. */
  private static readonly PROBE_NAME = '.probe';

  /**
   * @param entityFactory creates and loads the `MJ: Files` rows
   * @param storage the storage provider the objects are written to and the providers stored rows name
   */
  constructor(private readonly entityFactory: IEntityFactory, private readonly storage: PredictiveStudioStorage) {}

  /**
   * Proves the configured provider can write here: resolves its driver, puts a small probe object at
   * `<KEY_PREFIX>/<fresh UUID>/.probe`, then deletes it. A probe that is written but cannot be deleted does not refuse
   * (the provider can write); it is logged as a warning naming the object left behind.
   *
   * @throws Error naming the provider and `PS_STORAGE_PROVIDER` when no provider has that name, its driver is not
   *   configured here, or the probe write is refused or fails
   */
  public async AssertWritable(): Promise<void> {
    const binding = await this.storage.ConfiguredDriver();
    const probeKey = `${StorageProviderArtifactStore.KEY_PREFIX}/${randomUUID()}/${StorageProviderArtifactStore.PROBE_NAME}`;
    const failure = await StorageProviderArtifactStore.probeWriteFailure(binding, probeKey);
    if (failure !== null) {
      throw new Error(
        `Predictive Studio storage: storage provider "${binding.Provider.Name}" cannot write here (probe ${probeKey}: ${failure}) ` +
          `(${PredictiveStudioStorage.ENV_VAR} names the provider Predictive Studio files are written to)`,
      );
    }
    await StorageProviderArtifactStore.removeProbe(binding, probeKey);
  }

  /**
   * Stores the bytes under a fresh key, write-once, and records the `MJ: Files` row. Write-once is `ObjectExists` then
   * `PutObject` (`FileStorageBase` has no conditional put), so the save first reserves its key in this process
   * ({@link ObjectKeyReservations}) and holds it until the row is saved: a second save of the same key started meanwhile
   * is refused instead of passing the same `ObjectExists` and overwriting. Across processes, the fresh UUID in every key
   * is what keeps two saves off one key.
   *
   * @returns the stored file: its row, provider and key, and the SHA-256 and size of the bytes written
   * @throws ArtifactAlreadyStoredError when the key already holds an object, or another save in this process is writing
   *   it (nothing is written)
   * @throws Error when the name is not one safe key segment (before anything is stored), when storage refuses the
   *   object, or when the row cannot be saved (the object is removed first)
   */
  public async save(bytes: Uint8Array, name: string): Promise<StoredFile> {
    const objectKey = StorageProviderArtifactStore.objectKeyFor(name);
    const binding = await this.storage.ConfiguredDriver();
    const reservations = ObjectKeyReservations.Instance;
    if (!reservations.TryReserve(binding.Provider.ID, objectKey)) throw new ArtifactAlreadyStoredError(objectKey);
    try {
      return await this.writeOnce(binding, objectKey, bytes, name);
    } finally {
      reservations.Release(binding.Provider.ID, objectKey);
    }
  }

  /** The write-once write of a reserved key: refuse an existing object, put the bytes, record the row. */
  private async writeOnce(binding: StorageDriverBinding, objectKey: string, bytes: Uint8Array, name: string): Promise<StoredFile> {
    const contentType = name.toLowerCase().endsWith('.json') ? 'application/json' : 'application/octet-stream';
    if (await binding.Driver.ObjectExists(objectKey)) throw new ArtifactAlreadyStoredError(objectKey);
    const sha256 = SnapshotHash.Sha256Hex(bytes);
    if (!(await binding.Driver.PutObject(objectKey, Buffer.from(bytes), contentType))) {
      throw new Error(`Predictive Studio model artifacts: storage provider "${binding.Provider.Name}" refused ${objectKey}`);
    }
    const row = await this.storage.SaveFileRow(
      binding,
      { ObjectKey: objectKey, Name: name, ContentType: contentType, Detail: `Predictive Studio model artifact (${bytes.byteLength} bytes)` },
      this.entityFactory,
    );
    if (row.Saved === false) {
      await StorageProviderArtifactStore.removeUnrecordedObject(binding, objectKey);
      throw new Error(`Predictive Studio model artifacts: saving the MJ: Files row for ${objectKey} failed: ${row.Error}`);
    }
    return { fileId: row.ID, storageProviderId: binding.Provider.ID, providerKey: objectKey, sha256, sizeBytes: bytes.byteLength, writeOnce: true };
  }

  /**
   * Removes an artifact: its object (through the provider its row names), then its row. A legacy row's local file is
   * removed after the row.
   *
   * @throws Error when the row is not found, the object cannot be removed (the row is kept), or the row cannot be deleted
   */
  public async delete(fileId: string): Promise<void> {
    const file = await this.storage.LoadFileRow(fileId, this.entityFactory);
    if (!file) throw new Error(`Predictive Studio model artifacts: artifact file ${fileId} not found`);
    const objectKey = file.ProviderKey;
    if (objectKey && !IsSafeStorageObjectKey(objectKey)) {
      throw new Error(`Predictive Studio model artifacts: artifact file ${fileId} has an unsafe storage key "${objectKey}"`);
    }
    if (objectKey) await this.deleteObject(file.ProviderID, objectKey);
    if (!(await file.Delete())) {
      throw new Error(`Predictive Studio model artifacts: deleting artifact file ${fileId} failed: ${file.LatestResult?.CompleteMessage || 'unknown error'}`);
    }
    if (!objectKey) await rm(LocalArtifactPath(ResolveLocalArtifactBaseDir(), fileId), { force: true });
  }

  private async deleteObject(providerId: string, objectKey: string): Promise<void> {
    const { Driver, Provider } = await this.storage.DriverFor(providerId);
    if (!(await Driver.DeleteObject(objectKey))) {
      throw new Error(`Predictive Studio model artifacts: storage provider "${Provider.Name}" could not delete ${objectKey}`);
    }
  }

  /** `<KEY_PREFIX>/<fresh UUID>/<name>`; refuses a name that is not one safe key segment. */
  private static objectKeyFor(name: string): string {
    const objectKey = `${StorageProviderArtifactStore.KEY_PREFIX}/${randomUUID()}/${name}`;
    if (name.trim().length === 0 || name.includes('/') || !IsSafeStorageObjectKey(objectKey)) {
      throw new Error(`Predictive Studio model artifacts: "${name}" is not a safe artifact name`);
    }
    return objectKey;
  }

  /** Why the probe could not be written, or null when it was. */
  private static async probeWriteFailure(binding: StorageDriverBinding, probeKey: string): Promise<string | null> {
    try {
      const written = await binding.Driver.PutObject(probeKey, Buffer.from('predictive-studio write probe'), 'text/plain');
      return written ? null : 'the provider refused the object';
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  /** Deletes the write probe; a failure is logged as a warning, since the write it proved succeeded. */
  private static async removeProbe(binding: StorageDriverBinding, probeKey: string): Promise<void> {
    let reason: string | null;
    try {
      reason = (await binding.Driver.DeleteObject(probeKey)) ? null : 'the provider refused the delete';
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    if (reason !== null) {
      LogWarning(`Predictive Studio storage: could not delete the write probe ${probeKey} from "${binding.Provider.Name}" (${reason}); the provider can write, so the run goes ahead, but deletes (rollbacks) through it may fail too`);
    }
  }

  /** Removes an object whose row could not be saved; a failure is logged, since the row's error is the one thrown. */
  private static async removeUnrecordedObject(binding: StorageDriverBinding, objectKey: string): Promise<void> {
    let reason: string | null;
    try {
      reason = (await binding.Driver.DeleteObject(objectKey)) ? null : 'the provider refused the delete';
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    if (reason !== null) {
      LogError(`Predictive Studio model artifacts: could not delete ${objectKey} from "${binding.Provider.Name}" after its MJ: Files row failed to save (${reason})`);
    }
  }
}
