import { IMetadataProvider, Metadata, UserInfo } from '@memberjunction/core';
import { MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { FileStorageBase, ResolveStorageDriver } from '@memberjunction/storage';
import { IDiagnosticStorageBridge } from './intakeService.js';

/**
 * Intake storage bridge backed by `MJ: File Storage Providers`.
 * Quarantined uploads go to the quarantine provider (or the verified provider when none is set);
 * verified archives go to the verified provider.
 */
export class MJStorageIntakeBridge implements IDiagnosticStorageBridge {
  private readonly quarantineDriver: FileStorageBase;
  private readonly verifiedDriver: FileStorageBase;

  private constructor(quarantineDriver: FileStorageBase, verifiedDriver: FileStorageBase) {
    this.quarantineDriver = quarantineDriver;
    this.verifiedDriver = verifiedDriver;
  }

  /** Loads both storage providers and returns a bridge over their drivers. Throws when a provider cannot be loaded. */
  public static async Create(
    verifiedProviderId: string,
    quarantineProviderId: string,
    contextUser?: UserInfo,
    provider?: IMetadataProvider
  ): Promise<MJStorageIntakeBridge> {
    const verifiedDriver = await loadDriver(verifiedProviderId, contextUser, provider);
    const quarantineDriver = quarantineProviderId
      ? await loadDriver(quarantineProviderId, contextUser, provider)
      : verifiedDriver;
    return new MJStorageIntakeBridge(quarantineDriver, verifiedDriver);
  }

  public async WriteQuarantineObject(referenceId: string, bytes: Uint8Array): Promise<string> {
    const objectName = `quarantine/${referenceId}.mjdiag.enc`;
    const ok = await this.quarantineDriver.PutObject(objectName, Buffer.from(bytes), 'application/octet-stream');
    if (!ok) throw new Error(`Failed to write quarantine object '${objectName}'.`);
    return objectName;
  }

  public async PromoteToVerifiedStorage(
    referenceId: string,
    _quarantinePath: string,
    verifiedZipBytes: Uint8Array
  ): Promise<string> {
    const day = new Date().toISOString().slice(0, 10);
    const objectName = `verified/${day}/${referenceId}.mjdiag`;
    const ok = await this.verifiedDriver.PutObject(objectName, Buffer.from(verifiedZipBytes), 'application/zip');
    if (!ok) throw new Error(`Failed to write verified object '${objectName}'.`);
    return objectName;
  }

  public async DeleteQuarantineObject(quarantinePath: string): Promise<void> {
    await this.quarantineDriver.DeleteObject(quarantinePath);
  }
}

async function loadDriver(
  storageProviderId: string,
  contextUser?: UserInfo,
  provider?: IMetadataProvider
): Promise<FileStorageBase> {
  const md = provider ?? Metadata.Provider;
  const entity = await md.GetEntityObject<MJFileStorageProviderEntity>('MJ: File Storage Providers', contextUser);
  if (!(await entity.Load(storageProviderId))) {
    throw new Error(`File storage provider '${storageProviderId}' could not be loaded.`);
  }
  const driver = ResolveStorageDriver(entity);
  await driver.initialize();
  return driver;
}
