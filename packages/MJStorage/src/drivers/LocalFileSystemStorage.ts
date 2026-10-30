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
 * With neither set, {@link LocalFileSystemStorage.IsConfigured} is `false` and every operation throws
 * {@link StorageRootNotConfiguredError}, which names `STORAGE_LOCAL_ROOT` and `rootPath`.
 *
 * ## What a key can address
 * Every key passes these checks, in order; a key that fails one throws {@link StorageRootEscapeError} with its
 * {@link StorageKeyRefusalReason}:
 * 1. {@link IsSafeStorageObjectKey}: a `.`/`..` segment, a backslash, a meaning-changing percent encoding or a control
 *    character is refused.
 * 2. An absolute key (`/etc/passwd`) is refused, so no caller can believe it addressed a host path. A key made only of
 *    `/` names the root, which directory listings accept and object operations and `DeleteDirectory` refuse.
 * 3. {@link NormalizeStorageObjectKey} canonicalizes the key — the same form the base class's `NormalizeObjectKey`
 *    returns, so the storage access checks compare the key this driver addresses — and the lexically resolved path
 *    must be the root or lie beneath it.
 * 4. Real-path containment: the real path of the deepest existing ancestor of the target (plus the not-yet-existing
 *    rest) must lie inside the real path of the root, so a symlink inside the root cannot lead reads, writes, copies,
 *    moves or listings outside it. A dangling symlink on the way is refused.
 * 5. A symbolic link is neither an object nor a directory for this driver: `GetObject`, `GetObjectMetadata` and
 *    `ListObjects` refuse one by `lstat`, and listings omit symlinked entries.
 *
 * The checks run before each operation; a process on the host that swaps a directory for a symlink between the check
 * and the operation is outside what this driver can prevent (the host's own users are trusted with its disk).
 *
 * ## Writes and content type
 * `PutObject` writes to a temporary file in the target's directory and renames it over the key, so a reader sees
 * either the previous bytes or the new ones, never a torn file. A plain file system stores no content type: this
 * driver ignores the `contentType` it is given and always reports `application/octet-stream`.
 */
import { randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
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

/** Why {@link LocalFileSystemStorage} refused a key. */
export type StorageKeyRefusalReason =
  /** {@link IsSafeStorageObjectKey} rejected it. */
  | 'UnsafeKey'
  /** It is an absolute path. */
  | 'AbsoluteKey'
  /** It names the root where an object (or a deletable directory) is required. */
  | 'EmptyKey'
  /** It resolves, lexically or through a symlink, outside the storage root. */
  | 'OutsideRoot'
  /** It addresses a symbolic link (or passes through a dangling one). */
  | 'SymbolicLink';

/**
 * A key this driver refuses to address (see the module doc for the checks). Typed, with a {@link Reason}, so callers
 * and tests never match message text.
 */
export class StorageRootEscapeError extends Error {
  constructor(
    public readonly ObjectName: string,
    public readonly Reason: StorageKeyRefusalReason,
  ) {
    super(`LocalFileSystemStorage: refused key '${ObjectName}' (${Reason})`);
    this.name = 'StorageRootEscapeError';
  }
}

/** No root directory is configured: neither `STORAGE_LOCAL_ROOT` nor a `rootPath` passed to `initialize`. */
export class StorageRootNotConfiguredError extends Error {
  constructor() {
    super('LocalFileSystemStorage: no root directory is configured (set STORAGE_LOCAL_ROOT or pass rootPath to initialize)');
    this.name = 'StorageRootNotConfiguredError';
  }
}

/**
 * What a key must name: `Object` — a file under the root, never the root itself; `Directory` — a directory that may be
 * deleted, never the root; `Location` — any directory, the root included (listing, creating, existence checks).
 */
type KeyScope = 'Object' | 'Directory' | 'Location';

/** The `code` of a Node.js system error, or undefined for anything else. */
function errnoCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

/** Whether `candidate` is `parent` or lies beneath it. */
function isWithin(parent: string, candidate: string): boolean {
  return candidate === parent || candidate.startsWith(parent.endsWith(sep) ? parent : parent + sep);
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

  /** The absolute path a key addresses, after every containment check in the module doc. */
  private async pathOf(objectName: string, scope: KeyScope): Promise<string> {
    const full = this.lexicalPathOf(objectName, scope);
    const [realRoot, realFull] = await Promise.all([this.realPathOf(this.root, objectName), this.realPathOf(full, objectName)]);
    if (!isWithin(realRoot, realFull)) {
      throw new StorageRootEscapeError(objectName, 'OutsideRoot');
    }
    return full;
  }

  /** Checks 1–3 of the module doc: safe key, not absolute, non-empty where the scope needs it, lexically inside. */
  private lexicalPathOf(objectName: string, scope: KeyScope): string {
    if (!this.IsConfigured) {
      throw new StorageRootNotConfiguredError();
    }
    if (!IsSafeStorageObjectKey(objectName)) {
      throw new StorageRootEscapeError(objectName, 'UnsafeKey');
    }
    const normalized = NormalizeStorageObjectKey(objectName);
    if (normalized.length === 0) {
      if (scope !== 'Location') {
        throw new StorageRootEscapeError(objectName, 'EmptyKey');
      }
      return this.root;
    }
    if (isAbsolute(objectName.trim())) {
      throw new StorageRootEscapeError(objectName, 'AbsoluteKey');
    }
    const full = resolve(this.root, normalized);
    // No key that passes the checks above can resolve outside the root; this stays as a line of defence.
    if (!isWithin(this.root, full)) {
      throw new StorageRootEscapeError(objectName, 'OutsideRoot');
    }
    return full;
  }

  /**
   * The real path of `target`: the real path of its deepest existing ancestor joined with the rest, which does not
   * exist yet and so holds no symlink. A dangling symlink on the way is refused.
   */
  private async realPathOf(target: string, objectName: string): Promise<string> {
    const missing: string[] = [];
    let current = target;
    for (;;) {
      try {
        return join(await realpath(current), ...missing.reverse());
      } catch (error) {
        const code = errnoCode(error);
        if (code !== 'ENOENT' && code !== 'ENOTDIR') {
          throw error;
        }
        if (await this.isSymbolicLink(current)) {
          throw new StorageRootEscapeError(objectName, 'SymbolicLink');
        }
      }
      const parent = dirname(current);
      if (parent === current) {
        return target;
      }
      missing.push(basename(current));
      current = parent;
    }
  }

  /** Whether `full` exists as a symbolic link itself (not followed). */
  private async isSymbolicLink(full: string): Promise<boolean> {
    try {
      return (await lstat(full)).isSymbolicLink();
    } catch (error) {
      if (errnoCode(error) === 'ENOENT' || errnoCode(error) === 'ENOTDIR') {
        return false;
      }
      throw error;
    }
  }

  /** Refuses a key whose final path is a symbolic link: for this driver a symlink is neither an object nor a directory. */
  private async assertNotSymbolicLink(full: string, objectName: string): Promise<void> {
    if (await this.isSymbolicLink(full)) {
      throw new StorageRootEscapeError(objectName, 'SymbolicLink');
    }
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
    return pathToFileURL(await this.pathOf(objectName, 'Object')).href;
  }

  public async MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean> {
    const [from, to] = await Promise.all([this.pathOf(oldObjectName, 'Object'), this.pathOf(newObjectName, 'Object')]);
    await mkdir(dirname(to), { recursive: true });
    await rename(from, to);
    return true;
  }

  public async DeleteObject(objectName: string): Promise<boolean> {
    await rm(await this.pathOf(objectName, 'Object'), { force: true });
    return true;
  }

  /**
   * The files and sub-directories directly under `prefix` (`''` or `'/'` for the root), in ordinal name order (stable
   * and locale-independent). Symlinked entries are omitted; a symlinked `prefix` is refused.
   */
  public async ListObjects(prefix: string, _delimiter?: string): Promise<StorageListResult> {
    const dir = await this.pathOf(prefix, 'Location');
    if (!existsSync(dir)) {
      return { objects: [], prefixes: [] };
    }
    await this.assertNotSymbolicLink(dir, prefix);
    const base = NormalizeStorageObjectKey(prefix);
    const childPrefix = base.length > 0 ? `${base}/` : '';
    const entries = await readdir(dir, { withFileTypes: true });
    const objects: StorageObjectMetadata[] = [];
    const prefixes: string[] = [];
    for (const entry of entries.sort((a, b) => OrdinalCompare(a.name, b.name))) {
      if (entry.isSymbolicLink()) {
        continue;
      }
      if (entry.isDirectory()) {
        prefixes.push(`${childPrefix}${entry.name}/`);
      } else {
        objects.push(await this.metadataOf(join(dir, entry.name)));
      }
    }
    return { objects, prefixes };
  }

  public async CreateDirectory(directoryPath: string): Promise<boolean> {
    await mkdir(await this.pathOf(directoryPath, 'Location'), { recursive: true });
    return true;
  }

  /**
   * Deletes a directory below the root (the root itself is refused). Non-recursive removes only an empty directory —
   * a non-empty one surfaces the OS error (`ENOTEMPTY`); recursive removes the whole tree. A missing directory counts
   * as deleted either way.
   */
  public async DeleteDirectory(directoryPath: string, recursive?: boolean): Promise<boolean> {
    const full = await this.pathOf(directoryPath, 'Directory');
    if (recursive === true) {
      await rm(full, { recursive: true, force: true });
      return true;
    }
    try {
      await rmdir(full);
    } catch (error) {
      if (errnoCode(error) !== 'ENOENT') {
        throw error;
      }
    }
    return true;
  }

  /**
   * Keys are paths here, so `objectId` and `fullPath` address the same thing; `fullPath` wins when both are given.
   * `contentType` is always `application/octet-stream`: a plain file system stores no content type.
   */
  public async GetObjectMetadata(params: GetObjectMetadataParams): Promise<StorageObjectMetadata> {
    const key = params.fullPath || params.objectId || '';
    const full = await this.pathOf(key, 'Object');
    await this.assertNotSymbolicLink(full, key);
    return this.metadataOf(full);
  }

  /** Keys are paths here, so `objectId` and `fullPath` address the same thing; `fullPath` wins when both are given. */
  public async GetObject(params: GetObjectParams): Promise<Buffer> {
    const key = params.fullPath || params.objectId || '';
    const full = await this.pathOf(key, 'Object');
    await this.assertNotSymbolicLink(full, key);
    return readFile(full);
  }

  /**
   * Writes the bytes atomically (a temporary file in the same directory, renamed over the key), creating parent
   * directories. The content type and metadata are not stored: a plain file system has nowhere to keep them.
   */
  public async PutObject(objectName: string, data: Buffer, _contentType?: string, _metadata?: Record<string, string>): Promise<boolean> {
    const full = await this.pathOf(objectName, 'Object');
    await mkdir(dirname(full), { recursive: true });
    const temp = join(dirname(full), `.${basename(full)}.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, data, { flag: 'wx' });
      await rename(temp, full);
    } catch (error) {
      await rm(temp, { force: true });
      throw error;
    }
    return true;
  }

  public async CopyObject(sourceObjectName: string, destinationObjectName: string): Promise<boolean> {
    const [from, to] = await Promise.all([this.pathOf(sourceObjectName, 'Object'), this.pathOf(destinationObjectName, 'Object')]);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    return true;
  }

  public async ObjectExists(objectName: string): Promise<boolean> {
    return existsSync(await this.pathOf(objectName, 'Object'));
  }

  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    const full = await this.pathOf(directoryPath, 'Location');
    return existsSync(full) && (await stat(full)).isDirectory();
  }

  /** Not supported: a local directory has no search index. */
  public async SearchFiles(_query: string): Promise<FileSearchResultSet> {
    throw new UnsupportedOperationError('SearchFiles', this.providerName);
  }
}
