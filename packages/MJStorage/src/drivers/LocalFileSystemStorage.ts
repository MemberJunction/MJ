/**
 * @module drivers/LocalFileSystemStorage
 *
 * A local file-system driver for development and CI: a {@link FileStorageBase} over one directory of the server's own
 * disk. For development machines, CI runners and single-host installs. The files are as durable as that disk, and only
 * processes on that host can read them (`CreatePreAuthDownloadUrl` returns a `file://` URL).
 *
 * ## Configuration
 * - `STORAGE_LOCAL_ROOT` (environment variable) names the root directory; it is created on the first write.
 * - `rootPath` in the account configuration passed to {@link LocalFileSystemStorage.initialize} overrides it.
 *
 * With neither set, {@link LocalFileSystemStorage.IsConfigured} is `false` and every operation throws an error that
 * names `STORAGE_LOCAL_ROOT` and `rootPath`, so a missing root is reported as a configuration problem.
 *
 * ## Object keys
 * Every key is checked with {@link IsSafeStorageObjectKey} (a `.`/`..` segment, a backslash, a meaning-changing
 * percent encoding or a control character is refused), canonicalized with {@link NormalizeStorageObjectKey} (the same
 * form the base class's `NormalizeObjectKey` returns, so the storage access checks compare the key this driver
 * addresses), and the resolved path must still lie inside the root. A key that fails either check throws
 * {@link StorageRootEscapeError}.
 */
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { OrdinalCompare, RegisterClass } from '@memberjunction/global';
import {
  FileStorageBase,
  UnsupportedOperationError,
  type CreatePreAuthUploadUrlPayload,
  type FileSearchResultSet,
  type GetObjectMetadataParams,
  type GetObjectParams,
  type StorageListResult,
  type StorageObjectMetadata,
  type StorageProviderConfig,
} from '../generic/FileStorageBase';
import { IsSafeStorageObjectKey, NormalizeStorageObjectKey } from '../generic/ObjectKeys';

/**
 * A key this driver refuses to address: one {@link IsSafeStorageObjectKey} rejects, or one that resolves outside the
 * storage root (path traversal). Typed so callers and tests never match message text.
 */
export class StorageRootEscapeError extends Error {
  constructor(public readonly ObjectName: string) {
    super(`LocalFileSystemStorage: '${ObjectName}' is not a safe object key or escapes the storage root`);
    this.name = 'StorageRootEscapeError';
  }
}

/** A {@link FileStorageBase} driver over one directory of the server's file system. */
@RegisterClass(FileStorageBase, 'Local File System Storage')
export class LocalFileSystemStorage extends FileStorageBase {
  protected readonly providerName = 'Local File System Storage';
  private root: string;

  constructor() {
    super();
    const fromEnv = process.env.STORAGE_LOCAL_ROOT;
    this.root = fromEnv ? resolve(fromEnv) : '';
  }

  /**
   * Records the account (base behaviour) and, when the configuration carries a non-empty `rootPath`, uses it as the
   * root in place of `STORAGE_LOCAL_ROOT`.
   */
  public override async initialize(config?: StorageProviderConfig): Promise<void> { // case-violation-ok-legacy-back-compat: contracts.ts wire name
    await super.initialize(config);
    const configured = config?.rootPath;
    if (typeof configured === 'string' && configured.length > 0) {
      this.root = resolve(configured);
    }
  }

  /** True when a root directory is known (`STORAGE_LOCAL_ROOT` or `rootPath`). */
  public get IsConfigured(): boolean {
    return this.root.length > 0;
  }

  /** The absolute path a key addresses, after the safety check, canonicalization and the inside-the-root check. */
  private pathOf(objectName: string): string {
    if (!this.IsConfigured) {
      throw new Error('LocalFileSystemStorage: no root directory is configured (set STORAGE_LOCAL_ROOT or pass rootPath to initialize)');
    }
    if (!IsSafeStorageObjectKey(objectName)) {
      throw new StorageRootEscapeError(objectName);
    }
    const full = resolve(this.root, NormalizeStorageObjectKey(objectName));
    // Second line of defence: whatever the key, the resolved path must be the root or lie beneath it.
    if (full !== this.root && !full.startsWith(this.root + sep)) {
      throw new StorageRootEscapeError(objectName);
    }
    return full;
  }

  /** Metadata for an absolute path under the root, with `/`-separated paths relative to the root. */
  private async metadataOf(full: string): Promise<StorageObjectMetadata> {
    const s = await stat(full);
    const rel = relative(this.root, full).split(sep).join('/');
    const slash = rel.lastIndexOf('/');
    return {
      name: slash >= 0 ? rel.slice(slash + 1) : rel,
      path: slash >= 0 ? rel.slice(0, slash) : '',
      fullPath: rel,
      size: s.size,
      contentType: 'application/octet-stream',
      lastModified: s.mtime,
      isDirectory: s.isDirectory(),
    };
  }

  /** Not supported: a local directory has no upload endpoint. */
  public async CreatePreAuthUploadUrl(_objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    throw new UnsupportedOperationError('CreatePreAuthUploadUrl', this.providerName);
  }

  /** A `file://` URL to the object, readable only by processes on this host. */
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    return pathToFileURL(this.pathOf(objectName)).href;
  }

  public async MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean> {
    const from = this.pathOf(oldObjectName);
    const to = this.pathOf(newObjectName);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    return true;
  }

  public async DeleteObject(objectName: string): Promise<boolean> {
    await rm(this.pathOf(objectName), { force: true });
    return true;
  }

  /** The files and sub-directories directly under `prefix`, in ordinal name order (stable and locale-independent). */
  public async ListObjects(prefix: string, _delimiter?: string): Promise<StorageListResult> {
    const dir = this.pathOf(prefix);
    if (!existsSync(dir)) {
      return { objects: [], prefixes: [] };
    }
    const base = NormalizeStorageObjectKey(prefix);
    const childPrefix = base.length > 0 ? `${base}/` : '';
    const entries = await readdir(dir, { withFileTypes: true });
    const objects: StorageObjectMetadata[] = [];
    const prefixes: string[] = [];
    for (const entry of entries.sort((a, b) => OrdinalCompare(a.name, b.name))) {
      if (entry.isDirectory()) {
        prefixes.push(`${childPrefix}${entry.name}/`);
      } else {
        objects.push(await this.metadataOf(join(dir, entry.name)));
      }
    }
    return { objects, prefixes };
  }

  public async CreateDirectory(directoryPath: string): Promise<boolean> {
    await mkdir(this.pathOf(directoryPath), { recursive: true });
    return true;
  }

  public async DeleteDirectory(directoryPath: string, recursive?: boolean): Promise<boolean> {
    await rm(this.pathOf(directoryPath), { recursive: recursive === true, force: true });
    return true;
  }

  /** Keys are paths here, so `objectId` and `fullPath` address the same thing; `fullPath` wins when both are given. */
  public async GetObjectMetadata(params: GetObjectMetadataParams): Promise<StorageObjectMetadata> {
    return this.metadataOf(this.pathOf(params.fullPath || params.objectId || ''));
  }

  /** Keys are paths here, so `objectId` and `fullPath` address the same thing; `fullPath` wins when both are given. */
  public async GetObject(params: GetObjectParams): Promise<Buffer> {
    return readFile(this.pathOf(params.fullPath || params.objectId || ''));
  }

  /** Writes the bytes, creating parent directories. Content type and metadata are not stored by a plain file system. */
  public async PutObject(objectName: string, data: Buffer, _contentType?: string, _metadata?: Record<string, string>): Promise<boolean> {
    const full = this.pathOf(objectName);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return true;
  }

  public async CopyObject(sourceObjectName: string, destinationObjectName: string): Promise<boolean> {
    const from = this.pathOf(sourceObjectName);
    const to = this.pathOf(destinationObjectName);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    return true;
  }

  public async ObjectExists(objectName: string): Promise<boolean> {
    return existsSync(this.pathOf(objectName));
  }

  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    const full = this.pathOf(directoryPath);
    return existsSync(full) && (await stat(full)).isDirectory();
  }

  /** Not supported: a local directory has no search index. */
  public async SearchFiles(_query: string): Promise<FileSearchResultSet> {
    throw new UnsupportedOperationError('SearchFiles', this.providerName);
  }
}
