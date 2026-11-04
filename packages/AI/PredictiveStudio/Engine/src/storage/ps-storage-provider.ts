/**
 * @module storage/ps-storage-provider
 *
 * Where every Predictive Studio file lives: Training Snapshot files and trained model files are written through one MJ
 * storage provider, the `MJ: File Storage Providers` row named by `PS_STORAGE_PROVIDER` (default "Local File System"),
 * and each is recorded as an `MJ: Files` row whose `ProviderID` and `ProviderKey` say where its object is.
 *
 * The provider is read from `FileStorageEngine`'s cached providers and selected by name whatever its `IsActive` flag:
 * an inactive provider is never picked by automatic provider selection, which is exactly why a caller that needs it
 * names it. Its driver is resolved by `ServerDriverKey` and initialised from the server's environment configuration; a
 * driver that is not configured on this server is refused. Predictive Studio has no storage accounts, so the driver is
 * used directly, as the conversation-attachment blob store does for a provider without an account.
 *
 * A stored file is read through the provider its own `MJ: Files` row names ({@link PredictiveStudioStorage.DriverFor}),
 * never the one configured today, so a file stays readable after `PS_STORAGE_PROVIDER` changes.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString, UUIDMap } from '@memberjunction/global';
import type { MJFileEntity, MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { FileStorageEngine, ResolveStorageDriver, type FileStorageBase } from '@memberjunction/storage';
import type { IEntityFactory } from '../training/types';

/** A storage provider row and its initialised driver. */
export interface StorageDriverBinding {
  readonly Driver: FileStorageBase;
  readonly Provider: MJFileStorageProviderEntity;
}

/** Where an `MJ: Files` row says its object is; a null or empty `ProviderKey` names no stored object. */
export interface StoredFileLocation {
  readonly ProviderID: string;
  readonly ProviderKey: string | null;
}

/** What a stored object's `MJ: Files` row records. */
export interface StoredFileRow {
  readonly ObjectKey: string;
  readonly Name: string;
  readonly ContentType: string;
  /** The row's `Description`. */
  readonly Detail: string;
}

/** The outcome of saving an `MJ: Files` row: its ID, or the failed Save's CompleteMessage. */
export type StoredFileRowSave = { readonly Saved: true; readonly ID: string } | { readonly Saved: false; readonly Error: string };

/** The storage provider Predictive Studio writes its files to, and the providers its stored files name. */
export class PredictiveStudioStorage {
  /** The environment variable naming the provider Predictive Studio files are written to. */
  public static readonly ENV_VAR = 'PS_STORAGE_PROVIDER';
  /** The provider used when {@link ENV_VAR} is unset or empty. */
  public static readonly DEFAULT_PROVIDER_NAME = 'Local File System';

  private configured: Promise<StorageDriverBinding> | null = null;
  /** Drivers for the providers stored files name, by provider ID, resolved once each. */
  private readonly readDrivers = new UUIDMap<Promise<StorageDriverBinding>>();

  /**
   * @param provider the provider the `MJ: Files` reads and the storage-provider cache load run on
   * @param contextUser the acting user
   * @param providerName the provider to write to (default: `PS_STORAGE_PROVIDER`, or "Local File System" when it is unset or empty)
   */
  constructor(
    private readonly provider: IMetadataProvider,
    private readonly contextUser: UserInfo | undefined,
    // An empty PS_STORAGE_PROVIDER means "not set" as well, hence `||`.
    private readonly providerName: string = process.env[PredictiveStudioStorage.ENV_VAR] || PredictiveStudioStorage.DEFAULT_PROVIDER_NAME,
  ) {}

  /**
   * The configured provider's row and initialised driver, resolved once (a lazy promise, so concurrent writers share it).
   *
   * @throws Error naming the provider and `PS_STORAGE_PROVIDER` when no provider has that name or its driver is not configured here
   */
  public ConfiguredDriver(): Promise<StorageDriverBinding> {
    this.configured ||= this.resolveConfigured();
    return this.configured;
  }

  /**
   * The row and initialised driver of the provider with this ID (the one a stored file's row names), resolved once per ID.
   *
   * @throws Error when no provider has the ID or its driver is not configured on this server
   */
  public DriverFor(providerId: string): Promise<StorageDriverBinding> {
    let binding = this.readDrivers.Get(providerId);
    if (!binding) {
      binding = this.resolveById(providerId);
      this.readDrivers.Set(providerId, binding);
    }
    return binding;
  }

  /**
   * Where the `MJ: Files` row with this ID says its object is, or null when there is no such row (read-only: `'simple'`).
   *
   * @throws Error when the read fails
   */
  public async LocationOf(fileId: string): Promise<StoredFileLocation | null> {
    const r = await RunView.FromMetadataProvider(this.provider).RunView<Pick<MJFileEntity, 'ID' | 'ProviderID' | 'ProviderKey'>>(
      { EntityName: 'MJ: Files', ExtraFilter: `ID='${EscapeSQLString(fileId)}'`, Fields: ['ID', 'ProviderID', 'ProviderKey'], ResultType: 'simple' },
      this.contextUser,
    );
    if (!r.Success) throw new Error(`Predictive Studio storage: reading the MJ: Files row ${fileId} failed: ${r.ErrorMessage}`);
    const row = r.Results[0];
    return row ? { ProviderID: row.ProviderID, ProviderKey: row.ProviderKey } : null;
  }

  /**
   * Records an object stored through `binding` as an `MJ: Files` row (`Status` "Uploaded"), created through `entityFactory`.
   *
   * @returns the row's ID, or the failed Save's CompleteMessage
   */
  public async SaveFileRow(binding: StorageDriverBinding, row: StoredFileRow, entityFactory: IEntityFactory): Promise<StoredFileRowSave> {
    const file = await entityFactory.getEntityObject<MJFileEntity>('MJ: Files', this.contextUser);
    file.Name = row.Name;
    file.ContentType = row.ContentType;
    file.ProviderID = binding.Provider.ID;
    file.ProviderKey = row.ObjectKey;
    file.Status = 'Uploaded';
    file.Description = row.Detail;
    if (await file.Save()) return { Saved: true, ID: file.ID };
    return { Saved: false, Error: file.LatestResult?.CompleteMessage || 'unknown error' };
  }

  private async resolveConfigured(): Promise<StorageDriverBinding> {
    const engine = await this.storageEngine();
    const wanted = this.providerName.trim().toLowerCase();
    const row = engine.Providers.find((p) => p.Name.trim().toLowerCase() === wanted);
    const setting = `${PredictiveStudioStorage.ENV_VAR} names the provider Predictive Studio files are written to`;
    if (!row) throw new Error(`Predictive Studio storage: no File Storage Provider named "${this.providerName}" (${setting})`);
    const driver = await PredictiveStudioStorage.initializedDriver(row);
    if (!driver.IsConfigured) throw new Error(`Predictive Studio storage: storage provider "${row.Name}" is not configured on this server (${setting})`);
    return { Driver: driver, Provider: row };
  }

  private async resolveById(providerId: string): Promise<StorageDriverBinding> {
    const engine = await this.storageEngine();
    const row = engine.GetProviderById(providerId);
    if (!row) throw new Error(`Predictive Studio storage: no File Storage Provider with ID ${providerId}`);
    const driver = await PredictiveStudioStorage.initializedDriver(row);
    if (!driver.IsConfigured) throw new Error(`Predictive Studio storage: storage provider "${row.Name}", which stores the file, is not configured on this server`);
    return { Driver: driver, Provider: row };
  }

  /** `FileStorageEngine`, its provider cache loaded through this storage's provider and user. */
  private async storageEngine(): Promise<FileStorageEngine> {
    const engine = FileStorageEngine.Instance;
    await engine.Config(false, this.contextUser, this.provider);
    return engine;
  }

  /** The provider's driver, initialised from this server's environment. */
  private static async initializedDriver(row: MJFileStorageProviderEntity): Promise<FileStorageBase> {
    const driver = ResolveStorageDriver(row);
    await driver.initialize();
    return driver;
  }
}
