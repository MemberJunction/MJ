/**
 * @module snapshot/snapshot-file-store
 *
 * Write-once Training Snapshot files through an MJ storage provider. MJ is the system of record: every file written
 * here is an `MJ: Files` row whose `ProviderKey` names the stored object.
 *
 * The provider is the `MJ: File Storage Providers` row named by `PS_SNAPSHOT_STORAGE_PROVIDER` (default
 * "Local File System"), read from `FileStorageEngine`'s cached providers. It is selected by name whatever its
 * `IsActive` flag: an inactive provider is never picked by automatic provider selection, which is exactly why a
 * caller that needs it names it. Its driver is resolved by `ServerDriverKey` and initialised from the server's
 * environment configuration; a driver that is not configured on this server is refused. Predictive Studio has no
 * storage accounts, so the driver is used directly, as the conversation-attachment blob store does for a provider
 * without an account.
 */
import { RunView, type IMetadataProvider, type UserInfo } from '@memberjunction/core';
import { EscapeSQLString } from '@memberjunction/global';
import type { MJFileEntity, MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { FileStorageEngine, IsSafeStorageObjectKey, ResolveStorageDriver, type FileStorageBase } from '@memberjunction/storage';
import { SnapshotHash } from './snapshot-hash';
import type { IEntityFactory } from '../training/types';

/** One stored snapshot file: its `MJ: Files` row, where it is stored, and its fingerprint. */
export interface StoredSnapshotFile {
  readonly FileID: string;
  readonly ProviderID: string;
  readonly ProviderKey: string;
  readonly Sha256: string;
  readonly SizeBytes: number;
}

/** Where Training Snapshot files are written and read. */
export interface ISnapshotFileStore {
  /** Upload once (an existing key is refused) and record the `MJ: Files` row. */
  Put(objectKey: string, name: string, bytes: Uint8Array, contentType: string): Promise<StoredSnapshotFile>;
  Get(fileId: string): Promise<Uint8Array>;
  /** The provider the files are stored with (`MJ: File Storage Providers.ID`). */
  ProviderID(): Promise<string>;
}

/** A stored in-memory snapshot file: its object key and bytes. */
export interface InMemorySnapshotFile {
  readonly Key: string;
  readonly Bytes: Uint8Array;
}

/** An in-process snapshot file store, for tests and tools: the same write-once rule, no storage provider. */
export class InMemorySnapshotFileStore implements ISnapshotFileStore {
  /** The stored files, by file ID. */
  public readonly Saved = new Map<string, InMemorySnapshotFile>();
  constructor(private readonly providerId: string) {}

  public async Put(objectKey: string, _name: string, bytes: Uint8Array): Promise<StoredSnapshotFile> {
    SnapshotObjectKeys.AssertSafe(objectKey);
    if ([...this.Saved.values()].some((f) => f.Key === objectKey)) throw new SnapshotFileExistsError(objectKey);
    const id = `mem-snapshot-file-${this.Saved.size + 1}`;
    this.Saved.set(id, { Key: objectKey, Bytes: bytes });
    return { FileID: id, ProviderID: this.providerId, ProviderKey: objectKey, Sha256: SnapshotHash.Sha256Hex(bytes), SizeBytes: bytes.byteLength };
  }

  public async Get(fileId: string): Promise<Uint8Array> {
    const f = this.Saved.get(fileId);
    if (!f) throw new Error(`Training snapshots: file ${fileId} not found`);
    return f.Bytes;
  }

  public async ProviderID(): Promise<string> {
    return this.providerId;
  }
}

/** A snapshot object key that already exists: snapshot files are written once and never overwritten. */
export class SnapshotFileExistsError extends Error {
  constructor(public readonly ObjectKey: string) {
    super(`Training snapshots: ${ObjectKey} already exists; snapshot files are write-once`);
    this.name = 'SnapshotFileExistsError';
  }
}

/** The object-key rule every snapshot store applies before a key reaches storage. */
export class SnapshotObjectKeys {
  /** Refuses an empty key and one whose meaning depends on the provider (`..` segments, backslashes, encoded separators). */
  public static AssertSafe(objectKey: string): void {
    if (objectKey.trim().length === 0 || !IsSafeStorageObjectKey(objectKey)) {
      throw new Error(`Training snapshots: "${objectKey}" is not a safe storage key`);
    }
  }
}

/** The snapshot storage provider row and its initialised driver. */
export interface SnapshotStorageDriver {
  readonly Driver: FileStorageBase;
  readonly Provider: MJFileStorageProviderEntity;
}

/** Snapshot files in an MJ storage provider, each recorded as an `MJ: Files` row. */
export class StorageProviderSnapshotFileStore implements ISnapshotFileStore {
  private driverPromise: Promise<SnapshotStorageDriver> | null = null;

  constructor(
    private readonly entityFactory: IEntityFactory,
    private readonly provider: IMetadataProvider,
    private readonly contextUser: UserInfo | undefined,
    // An empty PS_SNAPSHOT_STORAGE_PROVIDER means "not set" as well, hence `||`.
    private readonly providerName: string = process.env.PS_SNAPSHOT_STORAGE_PROVIDER || 'Local File System',
  ) {}

  public async ProviderID(): Promise<string> {
    return (await this.driver()).Provider.ID;
  }

  /** Check-then-write: an existing object is refused, then the bytes are stored and their `MJ: Files` row saved. */
  public async Put(objectKey: string, name: string, bytes: Uint8Array, contentType: string): Promise<StoredSnapshotFile> {
    SnapshotObjectKeys.AssertSafe(objectKey);
    const { Driver, Provider } = await this.driver();
    if (await Driver.ObjectExists(objectKey)) throw new SnapshotFileExistsError(objectKey);
    if (!(await Driver.PutObject(objectKey, Buffer.from(bytes), contentType))) throw new Error(`Training snapshots: storage refused ${objectKey}`);
    const sha256 = SnapshotHash.Sha256Hex(bytes);
    const file = await this.saveFileRow(Driver, Provider, objectKey, name, contentType, `${bytes.byteLength} bytes, sha256 ${sha256}`);
    return { FileID: file.ID, ProviderID: Provider.ID, ProviderKey: objectKey, Sha256: sha256, SizeBytes: bytes.byteLength };
  }

  public async Get(fileId: string): Promise<Uint8Array> {
    const [{ Driver }, key] = await Promise.all([this.driver(), this.providerKeyOf(fileId)]);
    SnapshotObjectKeys.AssertSafe(key);
    return new Uint8Array(await Driver.GetObject({ fullPath: key }));
  }

  /** The provider row and its initialised driver, resolved once per store (a lazy promise, so concurrent Puts share it). */
  private driver(): Promise<SnapshotStorageDriver> {
    this.driverPromise ||= this.resolveDriver();
    return this.driverPromise;
  }

  private async resolveDriver(): Promise<SnapshotStorageDriver> {
    const engine = FileStorageEngine.Instance;
    await engine.Config(false, this.contextUser, this.provider);
    const wanted = this.providerName.trim().toLowerCase();
    const row = engine.Providers.find((p) => p.Name.trim().toLowerCase() === wanted);
    if (!row) throw new Error(`Training snapshots: no File Storage Provider named "${this.providerName}" (PS_SNAPSHOT_STORAGE_PROVIDER)`);
    const driver = ResolveStorageDriver(row);
    await driver.initialize();
    if (!driver.IsConfigured) throw new Error(`Training snapshots: storage provider "${this.providerName}" is not configured on this server`);
    return { Driver: driver, Provider: row };
  }

  /** Records the stored object as an `MJ: Files` row; when the row cannot be saved the object is removed again. */
  private async saveFileRow(driver: FileStorageBase, provider: MJFileStorageProviderEntity, objectKey: string, name: string, contentType: string, detail: string): Promise<MJFileEntity> {
    const file = await this.entityFactory.getEntityObject<MJFileEntity>('MJ: Files', this.contextUser);
    file.Name = name;
    file.ContentType = contentType;
    file.ProviderID = provider.ID;
    file.ProviderKey = objectKey;
    file.Status = 'Uploaded';
    file.Description = `Predictive Studio training snapshot file (${detail})`;
    if (await file.Save()) return file;
    // Undo the upload so a retry can write the same key; a failed undo is reported in the same error, never silent.
    const removed = await driver.DeleteObject(objectKey);
    const undo = removed ? '' : `; the stored object could not be removed`;
    throw new Error(`Training snapshots: saving the MJ: Files row for ${objectKey} failed: ${file.LatestResult?.CompleteMessage || 'unknown error'}${undo}`);
  }

  /** The storage key of a snapshot's `MJ: Files` row (read-only: `'simple'`, one field). */
  private async providerKeyOf(fileId: string): Promise<string> {
    const r = await RunView.FromMetadataProvider(this.provider).RunView<Pick<MJFileEntity, 'ProviderKey'>>(
      { EntityName: 'MJ: Files', ExtraFilter: `ID='${EscapeSQLString(fileId)}'`, Fields: ['ProviderKey'], ResultType: 'simple' },
      this.contextUser,
    );
    const key = r.Success ? r.Results[0]?.ProviderKey : undefined;
    if (!key) throw new Error(`Training snapshots: file ${fileId} has no storage key`);
    return key;
  }
}
