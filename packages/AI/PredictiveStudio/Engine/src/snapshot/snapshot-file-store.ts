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
 * `ProviderID` and `ProviderKey` (`Get(fileId)`), never by rebuilding a key or assuming today's configured provider.
 *
 * A stored object is never deleted: when its `MJ: Files` row fails to save, the object stays. Two builds of one
 * content write the same bytes under the same key, so deleting "this build's" object could remove the object a
 * committed snapshot references; a leftover byte-equal object is harmless, and the next identical write records the
 * row it is missing.
 *
 * The provider is the one every Predictive Studio file is written to ({@link PredictiveStudioStorage}): the
 * `MJ: File Storage Providers` row named by `PS_STORAGE_PROVIDER` (default "Local File System"), selected by name
 * whatever its `IsActive` flag, whose driver must be configured on this server.
 *
 * A stored file is handed to the sidecar as a pre-authorised download issued by the file's own provider's driver. The
 * download states how long its URL lives ({@link PreAuthDownloads.LifetimeSecondsOf}): the sidecar refuses an expired
 * URL only when the download states an expiry, so a driver whose URLs do not expire states none.
 */
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJFileStorageProviderEntity } from '@memberjunction/core-entities';
import { IsSafeStorageObjectKey } from '@memberjunction/storage';
import type { PreAuthDownload } from '@memberjunction/predictive-studio-core';
import { SnapshotHash } from './snapshot-hash';
import { PredictiveStudioStorage, type StorageDriverBinding, type StoredFileRow } from '../storage/ps-storage-provider';
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
  /**
   * A download of the stored file the stateless sidecar can open: a URL issued by the file's own provider, the file's
   * stored SHA-256 (`sha256`, which the sidecar verifies before parsing) and the URL's lifetime. `now` is the issue
   * time (default: the current time).
   */
  CreatePreAuthDownload(fileId: string, sha256: string, now?: Date): Promise<PreAuthDownload>;
}

/**
 * Builds pre-authorised downloads. `FileStorageBase.CreatePreAuthDownloadUrl` states no
 * lifetime, so the lifetime of each driver's URLs is recorded here, keyed by the provider's `ServerDriverKey`, from
 * what each driver's code fixes: the local file-system driver returns `file://` URLs that do not expire; the AWS S3,
 * Azure Blob, Google Cloud Storage and SharePoint drivers sign their URLs for 10 minutes. Any other driver states no
 * lifetime in its code (Dropbox, Box and Google Drive URLs expire on the service's own terms), so its downloads state
 * none and the sidecar does not refuse them as expired; such a URL that has expired fails as a download instead.
 */
export class PreAuthDownloads {
  private static readonly lifetimeSecondsByDriverKey: ReadonlyMap<string, number | null> = new Map<string, number | null>([
    ['local file system storage', null],
    ['aws s3 storage', 600],
    ['azure blob storage', 600],
    ['google cloud storage', 600],
    ['sharepoint storage', 600],
  ]);

  /** The URL lifetime in seconds of a driver's downloads; null when its URLs do not expire or it states no lifetime. */
  public static LifetimeSecondsOf(serverDriverKey: MJFileStorageProviderEntity['ServerDriverKey']): number | null {
    const lifetime = PreAuthDownloads.lifetimeSecondsByDriverKey.get(serverDriverKey.trim().toLowerCase());
    return lifetime === undefined ? null : lifetime;
  }

  /** A download issued at `now`: it expires `lifetimeSeconds` later, or never (null expiry) when the lifetime is null. */
  public static IssuedDownload(fileId: string, url: string, sha256: string, lifetimeSeconds: number | null, now: Date = new Date()): PreAuthDownload {
    return {
      fileId,
      url,
      issuedAt: now.toISOString(),
      driverLifetimeSeconds: lifetimeSeconds,
      expiresAt: lifetimeSeconds === null ? null : new Date(now.getTime() + lifetimeSeconds * 1000).toISOString(),
      sha256,
    };
  }
}

/** A stored in-memory snapshot file: its object key and bytes. */
export interface InMemorySnapshotFile {
  readonly Key: string;
  readonly Bytes: Uint8Array;
}

/**
 * An in-process snapshot file store, for tests: the same write-once rule, no storage provider. Its downloads are
 * `data:` URLs carrying the bytes, which only test trainers read: the sidecar opens `http`, `https` and `file` URLs
 * and refuses a `data:` URL.
 */
export class InMemorySnapshotFileStore implements ISnapshotFileStore {
  /** The stored files, by file ID. */
  public readonly Saved = new Map<string, InMemorySnapshotFile>();
  /**
   * @param providerId the provider ID the stored files report
   * @param downloadLifetimeSeconds the lifetime its downloads state; null (the default) for downloads that do not expire
   */
  constructor(private readonly providerId: string, private readonly downloadLifetimeSeconds: number | null = null) {}

  public async Put(objectKey: string, _name: string, bytes: Uint8Array): Promise<StoredSnapshotFile> {
    SnapshotObjectKeys.AssertSafe(objectKey);
    const existing = [...this.Saved.entries()].find(([, f]) => f.Key === objectKey);
    if (existing) SnapshotWriteOnce.AcceptExisting(objectKey, existing[1].Bytes, bytes);
    // A UUID-shaped ID, as an `MJ: Files` row has: the trainer's request schema validates file IDs as UUIDs.
    const id = existing ? existing[0] : `00000000-0000-4000-9000-${String(this.Saved.size + 1).padStart(12, '0')}`;
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

  public async CreatePreAuthDownload(fileId: string, sha256: string, now?: Date): Promise<PreAuthDownload> {
    const f = this.Saved.get(fileId);
    if (!f) throw new Error(`Training snapshots: snapshot file ${fileId} not found`);
    const url = `data:application/x-ndjson;base64,${Buffer.from(f.Bytes).toString('base64')}`;
    return PreAuthDownloads.IssuedDownload(fileId, url, sha256, this.downloadLifetimeSeconds, now);
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

/** Snapshot files in an MJ storage provider, each recorded as an `MJ: Files` row. */
export class StorageProviderSnapshotFileStore implements ISnapshotFileStore {
  /**
   * @param entityFactory creates the `MJ: Files` rows
   * @param storage the storage the files are written to and read through; its provider and user run every `MJ: Files`
   *   read, so a run's snapshot store and artifact store built over one storage resolve one provider once
   */
  constructor(private readonly entityFactory: IEntityFactory, private readonly storage: PredictiveStudioStorage) {}

  /**
   * A store over its own {@link PredictiveStudioStorage}.
   *
   * @param entityFactory creates the `MJ: Files` rows
   * @param provider the provider the `MJ: Files` reads and the storage-provider cache load run on
   * @param contextUser the acting user
   * @param providerName the provider to write to (default: `PS_STORAGE_PROVIDER`, or "Local File System" when it is unset or empty)
   */
  public static ForProviderName(entityFactory: IEntityFactory, provider: IMetadataProvider, contextUser: UserInfo | undefined, providerName?: string): StorageProviderSnapshotFileStore {
    return new StorageProviderSnapshotFileStore(entityFactory, new PredictiveStudioStorage(provider, contextUser, providerName));
  }

  public async ProviderID(): Promise<string> {
    return (await this.storage.ConfiguredDriver()).Provider.ID;
  }

  /**
   * Check-then-write. A key that already holds an object is read and compared: identical bytes succeed without a
   * write (reusing the object's `MJ: Files` row, or recording one when an earlier build left none), different bytes
   * are refused. A new object is stored and its `MJ: Files` row saved.
   */
  public async Put(objectKey: string, name: string, bytes: Uint8Array, contentType: string): Promise<StoredSnapshotFile> {
    SnapshotObjectKeys.AssertSafe(objectKey);
    const binding = await this.storage.ConfiguredDriver();
    const sha256 = SnapshotHash.Sha256Hex(bytes);
    const row: StoredFileRow = {
      ObjectKey: objectKey, Name: name, ContentType: contentType,
      Detail: `Predictive Studio training snapshot file (${bytes.byteLength} bytes, sha256 ${sha256})`,
    };
    const fileId = (await binding.Driver.ObjectExists(objectKey))
      ? await this.acceptExisting(binding, row, bytes)
      : await this.writeNew(binding, row, bytes);
    return { FileID: fileId, ProviderID: binding.Provider.ID, ProviderKey: objectKey, Sha256: sha256, SizeBytes: bytes.byteLength };
  }

  /** The file's bytes, read through the provider its `MJ: Files` row names (not necessarily the configured one). */
  public async Get(fileId: string): Promise<Uint8Array> {
    const location = await this.fileLocationOf(fileId);
    const { Driver } = await this.storage.DriverFor(location.ProviderID);
    return new Uint8Array(await Driver.GetObject({ fullPath: location.ProviderKey }));
  }

  /**
   * A download issued by the provider the file's `MJ: Files` row names (as `Get` reads it, never the configured
   * provider), stating that provider's URL lifetime.
   */
  public async CreatePreAuthDownload(fileId: string, sha256: string, now?: Date): Promise<PreAuthDownload> {
    const location = await this.fileLocationOf(fileId);
    const { Driver, Provider } = await this.storage.DriverFor(location.ProviderID);
    const url = await Driver.CreatePreAuthDownloadUrl(location.ProviderKey);
    return PreAuthDownloads.IssuedDownload(fileId, url, sha256, PreAuthDownloads.LifetimeSecondsOf(Provider.ServerDriverKey), now);
  }

  /** An existing object: identical bytes reuse it (and its `MJ: Files` row when there is one); different bytes throw. */
  private async acceptExisting(binding: StorageDriverBinding, row: StoredFileRow, bytes: Uint8Array): Promise<string> {
    const stored = new Uint8Array(await binding.Driver.GetObject({ fullPath: row.ObjectKey }));
    SnapshotWriteOnce.AcceptExisting(row.ObjectKey, stored, bytes);
    // The earliest-created row recording this provider's object, so every writer picks the same one.
    const recorded = await this.storage.FileRowIDFor(binding.Provider.ID, row.ObjectKey);
    if (recorded !== null) return recorded;
    const file = await this.storage.SaveFileRow(binding, row, this.entityFactory);
    // The object predates this write, so a failed row leaves it in place.
    if (file.Saved === false) throw new Error(`Training snapshots: saving the MJ: Files row for ${row.ObjectKey} failed: ${file.Error}`);
    return file.ID;
  }

  /**
   * A new object: stored, then recorded. When the row cannot be saved the object stays (never deleted: another build
   * of the same content may have written, and committed a snapshot over, the same bytes under this key); the next
   * identical write records the missing row.
   */
  private async writeNew(binding: StorageDriverBinding, row: StoredFileRow, bytes: Uint8Array): Promise<string> {
    if (!(await binding.Driver.PutObject(row.ObjectKey, Buffer.from(bytes), row.ContentType))) throw new Error(`Training snapshots: storage refused ${row.ObjectKey}`);
    const file = await this.storage.SaveFileRow(binding, row, this.entityFactory);
    if (file.Saved === false) throw new Error(`Training snapshots: saving the MJ: Files row for ${row.ObjectKey} failed: ${file.Error}`);
    return file.ID;
  }

  /** Where a snapshot's `MJ: Files` row says its object is: the provider and the stored key, which must be safe. */
  private async fileLocationOf(fileId: string): Promise<{ readonly ProviderID: string; readonly ProviderKey: string }> {
    const location = await this.storage.LocationOf(fileId);
    if (!location?.ProviderKey) throw new Error(`Training snapshots: file ${fileId} has no storage key`);
    SnapshotObjectKeys.AssertSafe(location.ProviderKey);
    return { ProviderID: location.ProviderID, ProviderKey: location.ProviderKey };
  }
}
