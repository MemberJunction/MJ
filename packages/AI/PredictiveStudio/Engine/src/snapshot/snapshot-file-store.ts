/**
 * @module snapshot/snapshot-file-store
 *
 * Write-once Training Snapshot files through an MJ storage provider. MJ is the system of record: every file written
 * here is an `MJ: Files` row whose `ProviderKey` names the stored object.
 *
 * Write-once with byte-equal idempotence: a key that already holds an object is never overwritten. When the stored
 * bytes are identical to the new ones (equal SHA-256), the write succeeds without writing; different bytes are
 * refused with `SnapshotFileExistsError`. Snapshot keys are derived from the content hash (the provenance object's
 * also from its own SHA-256), so a build that failed after writing its files never blocks a later build of the same
 * content, and two builds racing on one content share the matrix and manifest objects. A lost race can leave one
 * unreferenced provenance object: provenance is outside the content hash, so the loser's may differ from the
 * winner's, and the snapshot row references the winner's. Readers resolve a file through its `MJ: Files` row's stored
 * `ProviderKey` (`Get(fileId)`), never by rebuilding a key.
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
  /**
   * Upload once and record the `MJ: Files` row. An existing key holding identical bytes succeeds without a write; an
   * existing key holding different bytes is refused (`SnapshotFileExistsError`).
   */
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
    const existing = [...this.Saved.entries()].find(([, f]) => f.Key === objectKey);
    if (existing) SnapshotWriteOnce.AcceptExisting(objectKey, existing[1].Bytes, bytes);
    const id = existing ? existing[0] : `mem-snapshot-file-${this.Saved.size + 1}`;
    if (!existing) this.Saved.set(id, { Key: objectKey, Bytes: bytes });
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

/** A snapshot object key that already holds different bytes: snapshot files are written once and never overwritten. */
export class SnapshotFileExistsError extends Error {
  constructor(public readonly ObjectKey: string) {
    super(`Training snapshots: ${ObjectKey} already exists with different bytes; snapshot files are write-once`);
    this.name = 'SnapshotFileExistsError';
  }
}

/** The write-once rule every snapshot store applies to a key that already holds an object. */
export class SnapshotWriteOnce {
  /**
   * Returns when the stored bytes equal the new ones (equal SHA-256: the write is already done); throws
   * `SnapshotFileExistsError` when they differ.
   */
  public static AcceptExisting(objectKey: string, stored: Uint8Array, bytes: Uint8Array): void {
    if (SnapshotHash.Sha256Hex(stored) !== SnapshotHash.Sha256Hex(bytes)) throw new SnapshotFileExistsError(objectKey);
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

/** What a snapshot file's `MJ: Files` row records. */
interface SnapshotFileRow {
  readonly ObjectKey: string;
  readonly Name: string;
  readonly ContentType: string;
  readonly Detail: string;
}

/** The outcome of saving a snapshot file's `MJ: Files` row. */
type SnapshotFileRowSave = { readonly Saved: true; readonly ID: string } | { readonly Saved: false; readonly Error: string };

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

  /**
   * Check-then-write. A key that already holds an object is read and compared: identical bytes succeed without a
   * write (reusing the object's `MJ: Files` row, or recording one when an earlier build left none), different bytes
   * are refused. A new object is stored and its `MJ: Files` row saved.
   */
  public async Put(objectKey: string, name: string, bytes: Uint8Array, contentType: string): Promise<StoredSnapshotFile> {
    SnapshotObjectKeys.AssertSafe(objectKey);
    const { Driver, Provider } = await this.driver();
    const sha256 = SnapshotHash.Sha256Hex(bytes);
    const row: SnapshotFileRow = { ObjectKey: objectKey, Name: name, ContentType: contentType, Detail: `${bytes.byteLength} bytes, sha256 ${sha256}` };
    const fileId = (await Driver.ObjectExists(objectKey))
      ? await this.acceptExisting(Driver, Provider, row, bytes)
      : await this.writeNew(Driver, Provider, row, bytes);
    return { FileID: fileId, ProviderID: Provider.ID, ProviderKey: objectKey, Sha256: sha256, SizeBytes: bytes.byteLength };
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

  /** An existing object: identical bytes reuse it (and its `MJ: Files` row when there is one); different bytes throw. */
  private async acceptExisting(driver: FileStorageBase, provider: MJFileStorageProviderEntity, row: SnapshotFileRow, bytes: Uint8Array): Promise<string> {
    const stored = new Uint8Array(await driver.GetObject({ fullPath: row.ObjectKey }));
    SnapshotWriteOnce.AcceptExisting(row.ObjectKey, stored, bytes);
    const recorded = await this.fileRowIdOf(provider, row.ObjectKey);
    if (recorded !== null) return recorded;
    const file = await this.saveFileRow(provider, row);
    // The object predates this write, so a failed row leaves it in place.
    if (file.Saved === false) throw new Error(`Training snapshots: saving the MJ: Files row for ${row.ObjectKey} failed: ${file.Error}`);
    return file.ID;
  }

  /** A new object: stored, then recorded; when the row cannot be saved the object is removed again. */
  private async writeNew(driver: FileStorageBase, provider: MJFileStorageProviderEntity, row: SnapshotFileRow, bytes: Uint8Array): Promise<string> {
    if (!(await driver.PutObject(row.ObjectKey, Buffer.from(bytes), row.ContentType))) throw new Error(`Training snapshots: storage refused ${row.ObjectKey}`);
    const file = await this.saveFileRow(provider, row);
    if (file.Saved === false) {
      // Undo the upload so a retry writes the object afresh; a failed undo is reported in the same error, never silent.
      const removed = await driver.DeleteObject(row.ObjectKey);
      const undo = removed ? '' : '; the stored object could not be removed';
      throw new Error(`Training snapshots: saving the MJ: Files row for ${row.ObjectKey} failed: ${file.Error}${undo}`);
    }
    return file.ID;
  }

  /** Records the stored object as an `MJ: Files` row: its ID, or the failed Save's CompleteMessage. */
  private async saveFileRow(provider: MJFileStorageProviderEntity, row: SnapshotFileRow): Promise<SnapshotFileRowSave> {
    const file = await this.entityFactory.getEntityObject<MJFileEntity>('MJ: Files', this.contextUser);
    file.Name = row.Name;
    file.ContentType = row.ContentType;
    file.ProviderID = provider.ID;
    file.ProviderKey = row.ObjectKey;
    file.Status = 'Uploaded';
    file.Description = `Predictive Studio training snapshot file (${row.Detail})`;
    if (await file.Save()) return { Saved: true, ID: file.ID };
    return { Saved: false, Error: file.LatestResult?.CompleteMessage || 'unknown error' };
  }

  /** The `MJ: Files` row already recording this provider's object, or null (read-only: `'simple'`, one field). */
  private async fileRowIdOf(provider: MJFileStorageProviderEntity, objectKey: string): Promise<string | null> {
    const r = await RunView.FromMetadataProvider(this.provider).RunView<Pick<MJFileEntity, 'ID'>>(
      {
        EntityName: 'MJ: Files',
        ExtraFilter: `ProviderID='${EscapeSQLString(provider.ID)}' AND ProviderKey='${EscapeSQLString(objectKey)}'`,
        Fields: ['ID'],
        ResultType: 'simple',
      },
      this.contextUser,
    );
    if (!r.Success) throw new Error(`Training snapshots: looking up the MJ: Files row for ${objectKey} failed: ${r.ErrorMessage}`);
    return r.Results[0]?.ID || null;
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
