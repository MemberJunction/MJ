/**
 * @module scoring/storage-provider-artifact-loader
 *
 * The production {@link IArtifactLoader}: reads a model artifact through the provider its `MJ: Files` row names (never
 * the one `PS_STORAGE_PROVIDER` configures today), so a model trained on one provider still loads after the setting
 * changes. A row with an empty `ProviderKey` was written before model files went through the storage provider; its
 * bytes are read from local disk at `LocalArtifactPath(ResolveLocalArtifactBaseDir(), fileId)` (`PS_ARTIFACT_DIR`).
 */
import { readFile } from 'node:fs/promises';

import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { IsSafeStorageObjectKey } from '@memberjunction/storage';

import { PredictiveStudioStorage } from '../storage/ps-storage-provider';
import { LocalArtifactPath, ResolveLocalArtifactBaseDir } from '../training/artifact-store';
import type { IArtifactLoader } from './types';

/** {@link IArtifactLoader} over the storage providers `MJ: Files` rows name. Stateless: each load reads through its own provider and user. */
export class StorageProviderArtifactLoader implements IArtifactLoader {
  /**
   * The artifact's bytes, or null when there is no such file row or its bytes are gone.
   *
   * @throws Error when the file's key is not safe, or its provider cannot be read on this server
   */
  public async load(fileId: string, contextUser: UserInfo, provider: IMetadataProvider): Promise<Uint8Array | null> {
    const storage = new PredictiveStudioStorage(provider, contextUser);
    const location = await storage.LocationOf(fileId);
    if (!location) return null;
    if (!location.ProviderKey) return StorageProviderArtifactLoader.readLegacy(fileId);
    if (!IsSafeStorageObjectKey(location.ProviderKey)) {
      throw new Error(`Predictive Studio model artifacts: artifact file ${fileId} has an unsafe storage key "${location.ProviderKey}"`);
    }
    const { Driver } = await storage.DriverFor(location.ProviderID);
    if (!(await Driver.ObjectExists(location.ProviderKey))) return null;
    return new Uint8Array(await Driver.GetObject({ fullPath: location.ProviderKey }));
  }

  /** A file written before model files went through the storage provider: its local bytes, or null when they are gone. */
  private static async readLegacy(fileId: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(LocalArtifactPath(ResolveLocalArtifactBaseDir(), fileId)));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }
}
