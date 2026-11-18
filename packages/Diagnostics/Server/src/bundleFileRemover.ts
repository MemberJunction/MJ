import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { MJFileEntity } from '@memberjunction/core-entities';
import { UUIDMap } from '@memberjunction/global';
import { FileStorageBase } from '@memberjunction/storage';
import { LoadStorageDriver } from './intakeStorageBridge.js';

/**
 * Removes a bundle's stored file: the storage object first, then its `MJ: Files` row.
 * `MJ: Files` `Delete()` removes only the row, so the object is deleted through the storage driver.
 * Drivers are loaded once per storage provider.
 */
export class BundleFileRemover {
  private readonly drivers = new UUIDMap<FileStorageBase>();
  private readonly contextUser: UserInfo;
  private readonly provider: IMetadataProvider;

  public constructor(contextUser: UserInfo, provider: IMetadataProvider) {
    this.contextUser = contextUser;
    this.provider = provider;
  }

  /** Deletes the file's object and row. Returns `null` on success, or why it failed. */
  public async Remove(fileId: string): Promise<string | null> {
    const file = await this.provider.GetEntityObject<MJFileEntity>('MJ: Files', this.contextUser);
    if (!(await file.Load(fileId))) {
      return `MJ: Files ${fileId}: could not be loaded`;
    }
    const objectError = await this.deleteObject(file);
    if (objectError) {
      return objectError;
    }
    if (!(await file.Delete())) {
      return `MJ: Files ${fileId}: ${file.LatestResult?.CompleteMessage ?? 'unknown error'}`;
    }
    return null;
  }

  private async deleteObject(file: MJFileEntity): Promise<string | null> {
    const key = file.ProviderKey || file.Name;
    try {
      const driver = await this.driverFor(file.ProviderID);
      if (await driver.DeleteObject(key)) {
        return null;
      }
      // Some drivers return false when the object is already gone; a missing object counts as deleted.
      if (!(await driver.ObjectExists(key))) {
        return null;
      }
      return `MJ: Files ${file.ID}: storage object '${key}' was not deleted`;
    } catch (err) {
      return `MJ: Files ${file.ID}: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async driverFor(storageProviderId: string): Promise<FileStorageBase> {
    const cached = this.drivers.Get(storageProviderId);
    if (cached) {
      return cached;
    }
    const driver = await LoadStorageDriver(storageProviderId, this.contextUser, this.provider);
    this.drivers.Set(storageProviderId, driver);
    return driver;
  }
}
