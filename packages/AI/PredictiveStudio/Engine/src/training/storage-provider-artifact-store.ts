/**
 * @module training/storage-provider-artifact-store
 *
 * Trained model files in the MJ storage provider every Predictive Studio file is written to
 * ({@link PredictiveStudioStorage}: `PS_STORAGE_PROVIDER`, default "Local File System"). Each artifact is an object
 * under `predictive-studio/model-artifacts/<fresh UUID>/<name>` and an `MJ: Files` row naming its provider and key.
 *
 * Every save gets a fresh key, so no other save shares its object: a save whose `MJ: Files` row fails removes the
 * object it just wrote, and a rollback ({@link StorageProviderArtifactStore.delete}) removes the object, then the row.
 *
 * A model `MJ: Files` row with an empty `ProviderKey` was written before model files went through the storage provider:
 * its bytes are on local disk at `LocalArtifactPath(ResolveLocalArtifactBaseDir(), fileId)` (`PS_ARTIFACT_DIR`), and
 * `delete` removes that file with the row.
 */
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { LogError, type UserInfo } from '@memberjunction/core';
import type { MJFileEntity } from '@memberjunction/core-entities';
import { IsSafeStorageObjectKey } from '@memberjunction/storage';

import { PredictiveStudioStorage, type StorageDriverBinding } from '../storage/ps-storage-provider';
import { LocalArtifactPath, ResolveLocalArtifactBaseDir } from './artifact-store';
import type { IArtifactStore, IEntityFactory } from './types';

/** {@link IArtifactStore} over the configured MJ storage provider. */
export class StorageProviderArtifactStore implements IArtifactStore {
  /** The key prefix every model artifact object is stored under. */
  public static readonly KEY_PREFIX = 'predictive-studio/model-artifacts';

  /**
   * @param entityFactory creates and loads the `MJ: Files` rows
   * @param storage the storage provider the objects are written to and the providers stored rows name
   */
  constructor(private readonly entityFactory: IEntityFactory, private readonly storage: PredictiveStudioStorage) {}

  /**
   * Stores the bytes under a fresh key and records the `MJ: Files` row.
   *
   * @throws Error when the name is not one safe key segment (before anything is stored), when storage refuses the
   *   object, or when the row cannot be saved (the object is removed first)
   */
  public async save(bytes: Uint8Array, name: string, _contextUser?: UserInfo): Promise<string> {
    const objectKey = StorageProviderArtifactStore.objectKeyFor(name);
    const contentType = name.toLowerCase().endsWith('.json') ? 'application/json' : 'application/octet-stream';
    const binding = await this.storage.ConfiguredDriver();
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
    return row.ID;
  }

  /**
   * Removes an artifact: its object (through the provider its row names), then its row. A legacy row's local file is
   * removed after the row.
   *
   * @throws Error when the row is not found, the object cannot be removed (the row is kept), or the row cannot be deleted
   */
  public async delete(fileId: string, contextUser?: UserInfo): Promise<void> {
    const file = await this.entityFactory.getEntityObject<MJFileEntity>('MJ: Files', contextUser);
    if (!(await file.Load(fileId))) throw new Error(`Predictive Studio model artifacts: artifact file ${fileId} not found`);
    const objectKey = file.ProviderKey;
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

  /** Removes an object whose row could not be saved; a failure is logged, since the row's error is the one thrown. */
  private static async removeUnrecordedObject(binding: StorageDriverBinding, objectKey: string): Promise<void> {
    if (!(await binding.Driver.DeleteObject(objectKey))) {
      LogError(`Predictive Studio model artifacts: could not delete ${objectKey} from "${binding.Provider.Name}" after its MJ: Files row failed to save`);
    }
  }
}
