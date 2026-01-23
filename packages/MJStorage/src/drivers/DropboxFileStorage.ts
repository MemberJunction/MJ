import { Dropbox, DropboxOptions, files } from 'dropbox';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import * as mime from 'mime-types';
import {
  CreatePreAuthUploadUrlPayload,
  FileSearchOptions,
  FileSearchResult,
  FileSearchResultSet,
  FileStorageBase,
  GetObjectParams,
  GetObjectMetadataParams,
  StorageListResult,
  StorageObjectMetadata,
} from '../generic/FileStorageBase';
import { getProviderConfig } from '../config';

import { StorageProviderConfig } from '../generic/FileStorageBase';

/**
 * Configuration interface for Dropbox file storage.
 * Extends StorageProviderConfig to include accountId and accountName.
 * Supports both standard OAuth naming (clientID/clientSecret) and Dropbox naming (appKey/appSecret).
 */
interface DropboxConfig extends StorageProviderConfig {
  accessToken?: string;
  refreshToken?: string;
  /** OAuth client ID (standard naming) */
  clientID?: string;
  /** OAuth client secret (standard naming) */
  clientSecret?: string;
  /** Dropbox app key (alternative to clientID) */
  appKey?: string;
  /** Dropbox app secret (alternative to clientSecret) */
  appSecret?: string;
  selectUser?: string;
  rootPath?: string;
}

/**
 * Extended type for filesDownload response that includes the fileBinary property
 * The Dropbox SDK TypeScript definitions don't include this property, but it's present in the actual response
 */
interface DropboxDownloadResponse extends files.FileMetadata {
  fileBinary: ArrayBuffer;
}

/**
 * FileStorageBase implementation for Dropbox cloud storage
 *
 * This provider allows working with files stored in Dropbox. It supports
 * authentication via access token or refresh token with app credentials.
 *
 * @remarks
 * This implementation requires one of the following authentication methods:
 *
 * 1. Access Token:
 *    - STORAGE_DROPBOX_ACCESS_TOKEN - A valid Dropbox API access token
 *
 * 2. Refresh Token:
 *    - STORAGE_DROPBOX_REFRESH_TOKEN - A valid Dropbox API refresh token
 *    - STORAGE_DROPBOX_APP_KEY - Your Dropbox application key (client ID)
 *    - STORAGE_DROPBOX_APP_SECRET - Your Dropbox application secret
 *
 * Optional configuration:
 * - STORAGE_DROPBOX_ROOT_PATH - Path within Dropbox to use as the root (defaults to empty which is the root)
 *
 * @example
 * ```typescript
 * // Set required environment variables
 * process.env.STORAGE_DROPBOX_ACCESS_TOKEN = 'your-access-token';
 *
 * // Create the provider
 * const storage = new DropboxFileStorage();
 *
 * // Upload a file
 * const fileContent = Buffer.from('Hello, Dropbox!');
 * await storage.PutObject('documents/hello.txt', fileContent, 'text/plain');
 *
 * // Download a file
 * const downloadedContent = await storage.GetObject('documents/hello.txt');
 *
 * // Get a temporary download URL
 * const downloadUrl = await storage.CreatePreAuthDownloadUrl('documents/hello.txt');
 * ```
 */
@RegisterClass(FileStorageBase, 'Dropbox Storage')
export class DropboxFileStorage extends FileStorageBase {
  /**
   * The name of this storage provider
   */
  protected readonly providerName = 'Dropbox';

  /**
   * Dropbox API client instance
   */
  private _client: Dropbox;

  /**
   * Access token for Dropbox authentication
   */
  private _accessToken: string | undefined;

  /**
   * Root path within Dropbox to use as the storage root
   */
  private _rootPath: string;

  /**
   * Creates a new DropboxFileStorage instance
   *
   * This constructor initializes the Dropbox client using the provided credentials
   * from environment variables.
   *
   * @throws Error if neither access token nor refresh token with app credentials are provided
   */
  constructor() {
    super();

    // Try to get config from centralized configuration
    const config = getProviderConfig('dropbox');

    // Dropbox auth can be via access token or refresh token
    const accessToken = config?.accessToken || env.get('STORAGE_DROPBOX_ACCESS_TOKEN').asString();
    const refreshToken = config?.refreshToken || env.get('STORAGE_DROPBOX_REFRESH_TOKEN').asString();
    const appKey = config?.clientID || env.get('STORAGE_DROPBOX_APP_KEY').asString();
    const appSecret = config?.clientSecret || env.get('STORAGE_DROPBOX_APP_SECRET').asString();

    if (accessToken) {
      // Use access token directly
      this._accessToken = accessToken;
      const dropboxConfig: DropboxOptions = { accessToken };

      // For Dropbox Business/Team accounts, specify the team member
      if (config && 'selectUser' in config && config.selectUser) {
        dropboxConfig.selectUser = config.selectUser as string;
      }

      this._client = new Dropbox(dropboxConfig);
    } else if (refreshToken && appKey && appSecret) {
      // Use refresh token with app credentials
      const dropboxConfig: DropboxOptions = {
        refreshToken,
        clientId: appKey,
        clientSecret: appSecret,
      };

      // For Dropbox Business/Team accounts, specify the team member
      if (config && 'selectUser' in config && config.selectUser) {
        dropboxConfig.selectUser = config.selectUser as string;
      }

      this._client = new Dropbox(dropboxConfig);
    }
    // Note: If no credentials are available, client will be initialized in initialize() method
    // This allows for database-driven configuration to be passed after construction

    // Root path, optional (defaults to empty which is root)
    this._rootPath = config?.rootPath || env.get('STORAGE_DROPBOX_ROOT_PATH').default('').asString();

    // Ensure root path starts with / if not empty
    if (this._rootPath && !this._rootPath.startsWith('/')) {
      this._rootPath = '/' + this._rootPath;
    }
  }

  /**
   * Initialize the Dropbox client with configuration from database or other runtime source.
   * This allows configuration to be passed after construction, overriding environment variables.
   *
   * @param config - Optional configuration object with accessToken, refreshToken, etc.
   */
  public async initialize(config?: DropboxConfig): Promise<void> {
    // Always call super to store accountId and accountName
    await super.initialize(config);

    if (!config) {
      return; // Nothing to do, constructor already handled config from env/file
    }

    // If config is provided, reinitialize the client with it
    const accessToken = config.accessToken;
    const refreshToken = config.refreshToken;
    // Support both naming conventions: clientID/clientSecret (standard) and appKey/appSecret (Dropbox terminology)
    const appKey = config.clientID || config.appKey;
    const appSecret = config.clientSecret || config.appSecret;

    // Prefer refresh token over access token when both are available
    // Access tokens expire (4 hours), refresh tokens are long-lived and auto-refresh
    if (refreshToken && appKey && appSecret) {
      // Use refresh token with app credentials - this is the preferred method
      const dropboxConfig: DropboxOptions = {
        refreshToken,
        clientId: appKey,
        clientSecret: appSecret,
      };

      // For Dropbox Business/Team accounts, specify the team member
      if (config.selectUser) {
        dropboxConfig.selectUser = config.selectUser;
      }

      this._client = new Dropbox(dropboxConfig);
      // Set a placeholder for IsConfigured check - the SDK will get a real token on first API call
      this._accessToken = 'refresh-token-mode';
    } else if (accessToken) {
      // Fall back to access token if no refresh token available
      // Note: This will fail when the access token expires (typically 4 hours)
      this._accessToken = accessToken;
      const dropboxConfig: DropboxOptions = { accessToken };

      // For Dropbox Business/Team accounts, specify the team member
      if (config.selectUser) {
        dropboxConfig.selectUser = config.selectUser;
      }

      this._client = new Dropbox(dropboxConfig);
    }

    // Update root path if provided
    if (config.rootPath) {
      this._rootPath = config.rootPath;
      // Ensure root path starts with / if not empty
      if (this._rootPath && !this._rootPath.startsWith('/')) {
        this._rootPath = '/' + this._rootPath;
      }
    }
  }

  /**
   * Checks if Dropbox provider is properly configured.
   * Returns true if access token is present.
   */
  public get IsConfigured(): boolean {
    return !!this._accessToken;
  }

  /**
   * Normalizes a path to be compatible with Dropbox API
   *
   * This helper method ensures paths are formatted correctly for the Dropbox API,
   * including proper handling of the root path prefix.
   *
   * @private
   * @param path - The path to normalize
   * @returns A normalized path string suitable for Dropbox API calls
   */
  private _normalizePath(path: string): string {
    console.log('[DropboxFileStorage._normalizePath] Input:', {
      path,
      rootPath: this._rootPath,
    });

    // Combine root path with the given path
    let fullPath = path;
    if (this._rootPath) {
      fullPath = path ? (path.startsWith('/') ? this._rootPath + path : this._rootPath + '/' + path) : this._rootPath;
    } else if (!fullPath.startsWith('/') && fullPath !== '') {
      fullPath = '/' + fullPath;
    }

    console.log('[DropboxFileStorage._normalizePath] After combining root path:', { fullPath });

    // For root, Dropbox uses empty string instead of "/"
    if (fullPath === '/') {
      console.log('[DropboxFileStorage._normalizePath] Converted root "/" to empty string');
      return '';
    }

    console.log('[DropboxFileStorage._normalizePath] Final result:', { fullPath });
    return fullPath;
  }

  /**
   * Gets metadata for a file or folder from Dropbox
   *
   * This helper method retrieves metadata for a file or folder using the Dropbox API.
   *
   * @private
   * @param path - The path to get metadata for
   * @returns A Promise that resolves to the Dropbox metadata object
   * @throws Error if the item doesn't exist or cannot be accessed
   */
  private async _getMetadata(path: string): Promise<any> {
    const normalizedPath = this._normalizePath(path);

    try {
      const response = await this._client.filesGetMetadata({
        path: normalizedPath,
        include_media_info: false,
      });

      return response.result;
    } catch (error) {
      throw new Error(`Item not found: ${path} (${error.message})`);
    }
  }

  /**
   * Converts a Dropbox file/folder to StorageObjectMetadata
   *
   * This helper method transforms Dropbox-specific metadata into the
   * standard StorageObjectMetadata format used by FileStorageBase.
   *
   * @private
   * @param item - The Dropbox item metadata
   * @param parentPath - Optional parent path string
   * @returns A StorageObjectMetadata object
   */
  private _convertToMetadata(item: files.FileMetadataReference | files.FolderMetadataReference, parentPath: string = ''): StorageObjectMetadata {
    const isDirectory = item['.tag'] === 'folder';
    const name = item.name;

    console.log('[DropboxFileStorage._convertToMetadata] Processing item:', {
      name,
      path_display: item.path_display,
      rootPath: this._rootPath,
      parentPath,
    });

    // Extract path from item.path_display
    let path = '';
    if (item.path_display) {
      // Remove file name from path
      const pathParts = item.path_display.split('/');
      pathParts.pop();
      path = pathParts.join('/');

      console.log('[DropboxFileStorage._convertToMetadata] After extracting directory:', { path });

      // Remove root path if present
      if (this._rootPath && path.startsWith(this._rootPath)) {
        const oldPath = path;
        path = path.substring(this._rootPath.length);
        console.log('[DropboxFileStorage._convertToMetadata] Removed root path:', {
          oldPath,
          newPath: path,
          rootPath: this._rootPath,
        });
      }

      // Remove leading slash
      if (path.startsWith('/')) {
        path = path.substring(1);
        console.log('[DropboxFileStorage._convertToMetadata] Removed leading slash:', { path });
      }
    }

    // Use parentPath if provided
    if (parentPath) {
      console.log('[DropboxFileStorage._convertToMetadata] Using parentPath:', { parentPath });
      path = parentPath;
    }

    // Construct full path - ensure no double slashes
    let fullPath = name;
    if (path) {
      // Remove trailing slash from path and leading slash from name
      const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
      const cleanName = name.startsWith('/') ? name.slice(1) : name;
      fullPath = `${cleanPath}/${cleanName}`;
    }

    console.log('[DropboxFileStorage._convertToMetadata] Final result:', {
      name,
      path,
      fullPath,
    });

    return {
      name,
      path,
      fullPath,
      size: isDirectory ? 0 : item.size || 0,
      contentType: isDirectory ? 'application/x-directory' : mime.lookup(name) || 'application/octet-stream',
      lastModified: isDirectory ? new Date() : new Date(item.server_modified || Date.now()),
      isDirectory,
      customMetadata: {
        id: item.id,
        rev: isDirectory ? undefined : (item as files.FileMetadataReference).rev,
      },
    };
  }

  /**
   * Creates a pre-authenticated upload URL (not supported in Dropbox)
   *
   * This method is not supported for Dropbox storage as Dropbox doesn't provide
   * a way to generate pre-authenticated upload URLs like object storage services.
   * Instead, use the PutObject method for file uploads.
   *
   * @param objectName - The object name (path) to create a pre-auth URL for
   * @throws UnsupportedOperationError always, as this operation is not supported
   * @example
   * ```typescript
   * // This will throw an UnsupportedOperationError
   * try {
   *   await storage.CreatePreAuthUploadUrl('documents/report.docx');
   * } catch (error) {
   *   if (error instanceof UnsupportedOperationError) {
   *     console.log('Pre-authenticated upload URLs are not supported in Dropbox.');
   *     // Use PutObject instead
   *     await storage.PutObject('documents/report.docx', fileContent);
   *   }
   * }
   * ```
   */
  /**
   * Creates a pre-authenticated upload URL for a file
   *
   * This method generates a time-limited URL that can be used to upload
   * a file directly to Dropbox without additional authentication.
   *
   * @param objectName - Path where the file should be uploaded (e.g., 'documents/report.pdf')
   * @returns A Promise that resolves to an object containing the upload URL and provider key
   * @throws Error if URL creation fails
   *
   * @remarks
   * - Dropbox temporary upload links typically expire after 4 hours
   * - Maximum file size for upload via temporary link is 150MB
   * - The upload must use Content-Type: application/octet-stream
   * - The URL is for one-time use only
   *
   * @example
   * ```typescript
   * try {
   *   // Generate a pre-authenticated upload URL
   *   const uploadPayload = await storage.CreatePreAuthUploadUrl('documents/financial-report.pdf');
   *
   *   console.log(`Upload the file to this URL: ${uploadPayload.UploadUrl}`);
   *
   *   // Use the URL to upload file directly from client
   *   // POST request with Content-Type: application/octet-stream
   * } catch (error) {
   *   console.error('Error creating upload URL:', error.message);
   * }
   * ```
   */
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    try {
      console.log('[DropboxFileStorage.CreatePreAuthUploadUrl] Input:', {
        objectName,
        rootPath: this._rootPath,
      });

      const normalizedPath = this._normalizePath(objectName);

      console.log('[DropboxFileStorage.CreatePreAuthUploadUrl] After normalization:', {
        normalizedPath,
      });

      // Create a temporary upload link
      // Note: commit_info is optional, defaults to overwrite mode
      const response = await this._client.filesGetTemporaryUploadLink({
        commit_info: {
          path: normalizedPath,
          mode: { '.tag': 'overwrite' },
          autorename: false,
          mute: true,
        },
      });

      console.log('[DropboxFileStorage.CreatePreAuthUploadUrl] Success:', {
        link: response.result.link,
      });

      return {
        UploadUrl: response.result.link,
        ProviderKey: normalizedPath,
      };
    } catch (error) {
      console.error('[DropboxFileStorage.CreatePreAuthUploadUrl] Error:', {
        objectName,
        rootPath: this._rootPath,
        error: error.message || error,
        errorDetails: error.error || error,
        errorStatus: error.status,
        fullError: JSON.stringify(error, null, 2),
      });
      const errorMsg = error.error?.error_summary || error.message || JSON.stringify(error);
      throw new Error(`Failed to create upload URL for: ${objectName} - ${errorMsg}`);
    }
  }

  /**
   * Creates a pre-authenticated download URL for a file
   *
   * This method generates a time-limited URL that can be used to download
   * a file without authentication.
   *
   * @param objectName - Path to the file to download (e.g., 'documents/report.pdf')
   * @returns A Promise that resolves to the download URL string
   * @throws Error if the file doesn't exist or URL creation fails
   *
   * @remarks
   * - Dropbox temporary download links typically expire after 4 hours
   * - Generated URLs can be shared with users who don't have Dropbox access
   *
   * @example
   * ```typescript
   * try {
   *   // Generate a pre-authenticated download URL
   *   const downloadUrl = await storage.CreatePreAuthDownloadUrl('documents/financial-report.pdf');
   *
   *   console.log(`Download the file using this URL: ${downloadUrl}`);
   *
   *   // The URL can be shared or used in a browser to download the file
   *   // without requiring Dropbox authentication
   * } catch (error) {
   *   console.error('Error creating download URL:', error.message);
   * }
   * ```
   */
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    try {
      console.log('[DropboxFileStorage.CreatePreAuthDownloadUrl] Input:', {
        objectName,
        rootPath: this._rootPath,
      });

      const normalizedPath = this._normalizePath(objectName);

      console.log('[DropboxFileStorage.CreatePreAuthDownloadUrl] After normalization:', {
        normalizedPath,
      });

      // Create a temporary download link
      const response = await this._client.filesGetTemporaryLink({
        path: normalizedPath,
      });

      console.log('[DropboxFileStorage.CreatePreAuthDownloadUrl] Success:', {
        link: response.result.link,
      });

      return response.result.link;
    } catch (error) {
      console.error('[DropboxFileStorage.CreatePreAuthDownloadUrl] Error:', {
        objectName,
        rootPath: this._rootPath,
        error: error.message || error,
      });
      throw new Error(`Failed to create download URL for: ${objectName}`);
    }
  }

  /**
   * Moves a file or folder from one location to another
   *
   * This method moves a file or folder to a new location in Dropbox.
   * It handles both renaming and changing the parent folder.
   *
   * @param oldObjectName - Current path of the object (e.g., 'old-folder/document.docx')
   * @param newObjectName - New path for the object (e.g., 'new-folder/renamed-document.docx')
   * @returns A Promise that resolves to true if successful, false otherwise
   *
   * @remarks
   * - Works with both files and folders
   * - For folders, all contents will move with the folder
   * - If the destination already exists, the operation will fail
   *
   * @example
   * ```typescript
   * // Move a file to a different folder and rename it
   * const moveResult = await storage.MoveObject(
   *   'documents/old-report.pdf',
   *   'archive/2023/annual-report.pdf'
   * );
   *
   * if (moveResult) {
   *   console.log('File moved successfully');
   * } else {
   *   console.error('Failed to move file');
   * }
   * ```
   */
  public async MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean> {
    try {
      const fromPath = this._normalizePath(oldObjectName);
      const toPath = this._normalizePath(newObjectName);

      await this._client.filesMoveV2({
        from_path: fromPath,
        to_path: toPath,
        autorename: false,
      });

      return true;
    } catch (error) {
      console.error('Error moving object', { oldObjectName, newObjectName, error });
      return false;
    }
  }

  /**
   * Deletes a file or folder from Dropbox
   *
   * This method permanently deletes a file or folder from Dropbox storage.
   *
   * @param objectName - Path to the object to delete (e.g., 'documents/old-report.docx')
   * @returns A Promise that resolves to true if successful, false if an error occurs
   *
   * @remarks
   * - Returns true if the object doesn't exist (for idempotency)
   * - Dropbox puts deleted items in the trash, where they can be recovered for a limited time
   * - For deleting folders with contents, use DeleteDirectory with recursive=true
   *
   * @example
   * ```typescript
   * // Delete a file
   * const deleteResult = await storage.DeleteObject('temp/draft-document.docx');
   *
   * if (deleteResult) {
   *   console.log('File deleted successfully or already didn\'t exist');
   * } else {
   *   console.error('Failed to delete file');
   * }
   * ```
   */
  public async DeleteObject(objectName: string): Promise<boolean> {
    try {
      // Remove trailing slash if present (Dropbox doesn't accept trailing slashes for folder deletion)
      const normalizedPath = objectName.endsWith('/') ? this._normalizePath(objectName.substring(0, objectName.length - 1)) : this._normalizePath(objectName);

      console.log('[DropboxFileStorage] DeleteObject called:', {
        objectName,
        normalizedPath,
        rootPath: this._rootPath,
        hadTrailingSlash: objectName.endsWith('/'),
      });

      const result = await this._client.filesDeleteV2({
        path: normalizedPath,
      });

      console.log('[DropboxFileStorage] filesDeleteV2 result:', result);

      return true;
    } catch (error) {
      // If the path doesn't exist, consider it success for idempotency
      if (error.status === 409 && error.error?.error?.['.tag'] === 'path_lookup') {
        console.log('[DropboxFileStorage] Path not found (already deleted):', objectName);
        return true;
      }

      console.error('[DropboxFileStorage] Error deleting object', {
        objectName,
        normalizedPath: objectName.endsWith('/') ? this._normalizePath(objectName.substring(0, objectName.length - 1)) : this._normalizePath(objectName),
        error,
      });
      return false;
    }
  }

  /**
   * Lists files and folders in a given directory
   *
   * This method retrieves all files and subfolders in the specified directory.
   * It returns both a list of object metadata and a list of directory prefixes.
   *
   * @param prefix - Path to the directory to list (e.g., 'documents/reports')
   * @param delimiter - Optional delimiter character (default: '/')
   * @returns A Promise that resolves to a StorageListResult containing objects and prefixes
   *
   * @remarks
   * - The `objects` array includes both files and folders
   * - The `prefixes` array includes only folder paths (with trailing slashes)
   * - Returns empty arrays if the directory doesn't exist or an error occurs
   * - The delimiter parameter is included for interface compatibility but not used internally
   *
   * @example
   * ```typescript
   * // List all files and folders in the 'documents' directory
   * const result = await storage.ListObjects('documents');
   *
   * // Process files and folders
   * console.log(`Found ${result.objects.length} items:`);
   * for (const obj of result.objects) {
   *   console.log(`- ${obj.name} (${obj.isDirectory ? 'Folder' : 'File'}, ${obj.size} bytes)`);
   * }
   *
   * // List subfolders only
   * console.log(`Found ${result.prefixes.length} subfolders:`);
   * for (const prefix of result.prefixes) {
   *   console.log(`- ${prefix}`);
   * }
   * ```
   */
  public async ListObjects(prefix: string, delimiter = '/'): Promise<StorageListResult> {
    try {
      const normalizedPath = this._normalizePath(prefix);

      console.log('[DropboxFileStorage] ListObjects called:', {
        prefix,
        normalizedPath,
        delimiter,
        hasClient: !!this._client,
        isConfigured: this.IsConfigured,
        rootPath: this._rootPath,
      });

      // Debug: Try to get current account info to understand access type
      try {
        const accountInfo = await this._client.usersGetCurrentAccount();
        console.log('[DropboxFileStorage] Account info:', {
          accountId: accountInfo.result.account_id,
          email: accountInfo.result.email,
          name: accountInfo.result.name.display_name,
        });
      } catch (error) {
        console.log('[DropboxFileStorage] Could not get account info:', error?.message);
      }

      const response = await this._client.filesListFolder({
        path: normalizedPath,
        recursive: false,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false,
      });

      console.log('[DropboxFileStorage] filesListFolder response:', {
        entriesCount: response.result.entries.length,
        entries: response.result.entries.map((e) => ({ name: e.name, tag: e['.tag'] })),
        has_more: response.result.has_more,
        cursor: response.result.cursor,
      });

      // Check if we're in an app folder scenario
      if (response.result.entries.length === 0 && normalizedPath === '') {
        console.log('[DropboxFileStorage] Empty root - this might be an app-folder-only token');
        console.log('[DropboxFileStorage] Note: If using app folder access, files are in /Apps/[YourAppName]/');
        console.log('[DropboxFileStorage] You can set rootPath in configuration to point to your app folder');

        // Try to list a few common app folder paths to help diagnose
        const testPaths = ['/Apps', '/Apps/MJ-Files-Test', '/MJ-FileTest'];
        for (const testPath of testPaths) {
          try {
            console.log(`[DropboxFileStorage] Testing path: ${testPath}`);
            const testResponse = await this._client.filesListFolder({ path: testPath, recursive: false });
            console.log(
              `[DropboxFileStorage] Found ${testResponse.result.entries.length} items at ${testPath}:`,
              testResponse.result.entries.map((e) => ({ name: e.name, tag: e['.tag'] })),
            );
          } catch (testError) {
            const errorMsg = testError.error?.error_summary || testError.message;
            console.log(`[DropboxFileStorage] Cannot access ${testPath}: ${errorMsg}`);
          }
        }
      }

      const objects: StorageObjectMetadata[] = [];
      const prefixes: string[] = [];

      // Process entries
      for (const entry of response.result.entries) {
        // Skip deleted entries
        if (entry['.tag'] === 'deleted') {
          continue;
        }

        objects.push(this._convertToMetadata(entry, prefix));

        // If it's a folder, add to prefixes
        if (entry['.tag'] === 'folder') {
          const folderPath = prefix ? (prefix.endsWith('/') ? `${prefix}${entry.name}` : `${prefix}/${entry.name}`) : entry.name;

          console.log('[DropboxFileStorage] Adding folder prefix:', folderPath);
          prefixes.push(`${folderPath}/`);
        }
      }

      console.log('[DropboxFileStorage] Final result:', {
        objectsCount: objects.length,
        prefixesCount: prefixes.length,
        prefixes,
      });

      return { objects, prefixes };
    } catch (error) {
      console.error('[DropboxFileStorage] Error listing objects:', { prefix, error, errorMessage: error?.message, errorStatus: error?.status });
      return { objects: [], prefixes: [] };
    }
  }

  /**
   * Creates a new directory (folder) in Dropbox
   *
   * This method creates a folder at the specified path.
   *
   * @param directoryPath - Path where the directory should be created (e.g., 'documents/reports/2023')
   * @returns A Promise that resolves to true if successful, false if an error occurs
   *
   * @remarks
   * - Returns true if the directory already exists (idempotent operation)
   * - Trailing slashes in the path are automatically removed
   * - Parent directories must already exist; this method doesn't create them recursively
   *
   * @example
   * ```typescript
   * // Create a new folder
   * const createResult = await storage.CreateDirectory('documents/reports/2023');
   *
   * if (createResult) {
   *   console.log('Directory created successfully');
   *
   *   // Now we can put files in this directory
   *   await storage.PutObject(
   *     'documents/reports/2023/annual-summary.xlsx',
   *     fileContent,
   *     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
   *   );
   * } else {
   *   console.error('Failed to create directory');
   * }
   * ```
   */
  public async CreateDirectory(directoryPath: string): Promise<boolean> {
    try {
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/')
        ? this._normalizePath(directoryPath.substring(0, directoryPath.length - 1))
        : this._normalizePath(directoryPath);

      await this._client.filesCreateFolderV2({
        path: normalizedPath,
        autorename: false,
      });

      return true;
    } catch (error) {
      // If folder already exists, consider it success
      if (error.status === 409 && error.error?.error?.['.tag'] === 'path') {
        return true;
      }

      console.error('Error creating directory', { directoryPath, error });
      return false;
    }
  }

  /**
   * Deletes a directory from Dropbox
   *
   * This method deletes a folder and optionally ensures it's empty first.
   * Note that Dropbox API always deletes folders recursively, so we perform
   * an additional check when recursive=false to protect against accidental deletion.
   *
   * @param directoryPath - Path to the directory to delete (e.g., 'documents/old-reports')
   * @param recursive - If true, delete the directory and all its contents; if false, only delete if empty
   * @returns A Promise that resolves to true if successful, false if an error occurs
   *
   * @remarks
   * - Returns true if the directory doesn't exist (idempotent operation)
   * - If recursive=false and the directory contains files, the operation will fail
   * - Dropbox puts deleted folders in the trash, where they can be recovered for a limited time
   * - Trailing slashes in the path are automatically removed
   *
   * @example
   * ```typescript
   * // Attempt to delete an empty folder
   * const deleteResult = await storage.DeleteDirectory('temp/empty-folder', false);
   *
   * // Delete a folder and all its contents
   * const recursiveDeleteResult = await storage.DeleteDirectory('archive/old-data', true);
   *
   * if (recursiveDeleteResult) {
   *   console.log('Folder and all its contents deleted successfully');
   * } else {
   *   console.error('Failed to delete folder');
   * }
   * ```
   */
  public async DeleteDirectory(directoryPath: string, recursive = true): Promise<boolean> {
    try {
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/')
        ? this._normalizePath(directoryPath.substring(0, directoryPath.length - 1))
        : this._normalizePath(directoryPath);

      // Note: Dropbox API always deletes directories recursively
      // If we want to prevent deleting non-empty dirs, we'd need to check contents first
      if (!recursive) {
        // Check if directory is empty first
        const listing = await this._client.filesListFolder({
          path: normalizedPath,
          recursive: false,
        });

        if (listing.result.entries.length > 0) {
          throw new Error('Directory is not empty');
        }
      }

      await this._client.filesDeleteV2({
        path: normalizedPath,
      });

      return true;
    } catch (error) {
      // If the path doesn't exist, consider it success for idempotency
      if (error.status === 409 && error.error?.error?.['.tag'] === 'path_lookup') {
        return true;
      }

      console.error('Error deleting directory', { directoryPath, recursive, error });
      return false;
    }
  }

  /**
   * Gets metadata for a file or folder
   *
   * This method retrieves metadata information about a file or folder, such as
   * its name, size, content type, and last modified date.
   *
   * @param params - Object identifier (prefer objectId for performance, fallback to fullPath)
   * @returns A Promise that resolves to a StorageObjectMetadata object
   * @throws Error if the object doesn't exist or cannot be accessed
   *
   * @example
   * ```typescript
   * try {
   *   // Fast path: Use objectId (Dropbox file ID)
   *   const metadata = await storage.GetObjectMetadata({ objectId: 'id:a4ayc_80_OEAAAAAAAAAXw' });
   *
   *   // Slow path: Use path
   *   const metadata2 = await storage.GetObjectMetadata({ fullPath: 'presentations/quarterly-update.pptx' });
   *
   *   console.log(`Name: ${metadata.name}`);
   *   console.log(`Path: ${metadata.path}`);
   *   console.log(`Size: ${metadata.size} bytes`);
   *   console.log(`Content Type: ${metadata.contentType}`);
   *   console.log(`Last Modified: ${metadata.lastModified}`);
   *   console.log(`Is Directory: ${metadata.isDirectory}`);
   *
   *   // Dropbox-specific metadata is available in customMetadata
   *   console.log(`Dropbox ID: ${metadata.customMetadata.id}`);
   *   console.log(`Revision: ${metadata.customMetadata.rev}`);
   * } catch (error) {
   *   console.error('Error getting metadata:', error.message);
   * }
   * ```
   */
  public async GetObjectMetadata(params: GetObjectMetadataParams): Promise<StorageObjectMetadata> {
    try {
      // Validate params
      if (!params.objectId && !params.fullPath) {
        throw new Error('Either objectId or fullPath must be provided');
      }

      let path: string;
      let parentPath = '';

      // Fast path: Use objectId if provided
      if (params.objectId) {
        // Dropbox IDs must be prefixed with "id:"
        path = params.objectId.startsWith('id:') ? params.objectId : `id:${params.objectId}`;
        console.log(`⚡ Fast path: Using Object ID directly: ${path}`);
      } else {
        // Slow path: Use normalized path
        path = this._normalizePath(params.fullPath!);
        console.log(`🐌 Slow path: Using path: ${path}`);

        // Parse path to get parent path
        const pathParts = params.fullPath!.split('/');
        pathParts.pop(); // Remove filename/foldername
        parentPath = pathParts.join('/');
      }

      const response = await this._client.filesGetMetadata({
        path: path,
        include_media_info: false,
      });

      // Check if the result is a deleted entry
      if (response.result['.tag'] === 'deleted') {
        throw new Error(`Object not found (deleted): ${params.objectId || params.fullPath}`);
      }

      return this._convertToMetadata(response.result, parentPath);
    } catch (error) {
      console.error('Error getting object metadata', { params, error });
      throw new Error(`Object not found: ${params.objectId || params.fullPath}`);
    }
  }

  /**
   * Downloads a file's contents
   *
   * This method retrieves the raw content of a file as a Buffer.
   *
   * @param params - Object identifier (prefer objectId for performance, fallback to fullPath)
   * @returns A Promise that resolves to a Buffer containing the file's contents
   * @throws Error if the file doesn't exist or cannot be downloaded
   *
   * @remarks
   * - This method will throw an error if the object is a folder
   * - For large files, consider using CreatePreAuthDownloadUrl instead
   *
   * @example
   * ```typescript
   * try {
   *   // Fast path: Use objectId (Dropbox file ID)
   *   const fileContent = await storage.GetObject({ objectId: 'id:a4ayc_80_OEAAAAAAAAAXw' });
   *
   *   // Slow path: Use path
   *   const fileContent2 = await storage.GetObject({ fullPath: 'documents/notes.txt' });
   *
   *   // Convert Buffer to string for text files
   *   const textContent = fileContent.toString('utf8');
   *   console.log('File content:', textContent);
   *
   *   // For binary files, you can write the buffer to disk
   *   // or process it as needed
   * } catch (error) {
   *   console.error('Error downloading file:', error.message);
   * }
   * ```
   */
  public async GetObject(params: GetObjectParams): Promise<Buffer> {
    try {
      // Validate params
      if (!params.objectId && !params.fullPath) {
        throw new Error('Either objectId or fullPath must be provided');
      }

      let path: string;

      // Fast path: Use objectId if provided
      if (params.objectId) {
        // Dropbox IDs must be prefixed with "id:"
        path = params.objectId.startsWith('id:') ? params.objectId : `id:${params.objectId}`;
        console.log(`⚡ Fast path: Using Object ID directly: ${path}`);
      } else {
        // Slow path: Use normalized path
        path = this._normalizePath(params.fullPath!);
        console.log(`🐌 Slow path: Using path: ${path}`);
      }

      const response = await this._client.filesDownload({
        path: path,
      });

      // Extract file content as Buffer
      // Note: In Dropbox SDK, the file content is in response.result.fileBinary
      // The TypeScript definitions don't include fileBinary, but it's present in the actual response
      return Buffer.from((response.result as DropboxDownloadResponse).fileBinary);
    } catch (error) {
      console.error('Error getting object', { params, error });
      throw new Error(`Failed to get object: ${params.objectId || params.fullPath}`);
    }
  }

  /**
   * Uploads a file to Dropbox
   *
   * This method uploads a file to the specified path in Dropbox. It automatically
   * determines whether to use a simple upload or chunked upload based on file size.
   *
   * @param objectName - Path where the file should be uploaded (e.g., 'documents/report.pdf')
   * @param data - Buffer containing the file content
   * @param contentType - Optional MIME type of the file (not used in Dropbox implementation)
   * @param metadata - Optional metadata to associate with the file (not used in Dropbox implementation)
   * @returns A Promise that resolves to true if successful, false if an error occurs
   *
   * @remarks
   * - Files smaller than 150MB use a simple upload
   * - Files 150MB or larger use a chunked upload process
   * - If a file with the same name exists, it will be overwritten
   * - Parent folders must exist before uploading files to them
   *
   * @example
   * ```typescript
   * // Upload a simple text file
   * const textContent = Buffer.from('This is a sample document', 'utf8');
   * const uploadResult = await storage.PutObject('documents/sample.txt', textContent);
   *
   * // Upload a large file using chunked upload
   * const largeFileBuffer = fs.readFileSync('/path/to/large-presentation.pptx');
   * const largeUploadResult = await storage.PutObject(
   *   'presentations/quarterly-results.pptx',
   *   largeFileBuffer
   * );
   *
   * if (largeUploadResult) {
   *   console.log('Large file uploaded successfully');
   * } else {
   *   console.error('Failed to upload large file');
   * }
   * ```
   */
  public async PutObject(objectName: string, data: Buffer, contentType?: string, metadata?: Record<string, string>): Promise<boolean> {
    try {
      const normalizedPath = this._normalizePath(objectName);

      // For smaller files (<150MB), use simple upload
      if (data.length < 150 * 1024 * 1024) {
        await this._client.filesUpload({
          path: normalizedPath,
          contents: data,
          mode: { '.tag': 'overwrite' },
          autorename: false,
          mute: true,
        });
      } else {
        // For larger files, use session upload
        const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks

        // Start upload session
        const sessionStart = await this._client.filesUploadSessionStart({
          close: false,
          contents: data.slice(0, CHUNK_SIZE),
        });

        const sessionId = sessionStart.result.session_id;
        let offset = CHUNK_SIZE;

        // Upload the remaining chunks
        while (offset < data.length) {
          const chunk = data.slice(offset, Math.min(offset + CHUNK_SIZE, data.length));
          const isLastChunk = offset + chunk.length >= data.length;

          if (isLastChunk) {
            // Finish the session with the last chunk
            await this._client.filesUploadSessionFinish({
              cursor: {
                session_id: sessionId,
                offset: offset,
              },
              commit: {
                path: normalizedPath,
                mode: { '.tag': 'overwrite' },
                autorename: false,
                mute: true,
              },
              contents: chunk,
            });
          } else {
            // Append chunk to session
            await this._client.filesUploadSessionAppendV2({
              cursor: {
                session_id: sessionId,
                offset: offset,
              },
              close: false,
              contents: chunk,
            });
          }

          offset += chunk.length;
        }
      }

      return true;
    } catch (error) {
      console.error('Error putting object', { objectName, error });
      return false;
    }
  }

  /**
   * Copies a file or folder from one location to another
   *
   * This method creates a copy of a file or folder at a new location.
   * The original file or folder remains unchanged.
   *
   * @param sourceObjectName - Path to the source object (e.g., 'templates/report-template.docx')
   * @param destinationObjectName - Path where the copy should be created (e.g., 'documents/new-report.docx')
   * @returns A Promise that resolves to true if successful, false if an error occurs
   *
   * @remarks
   * - Works with both files and folders
   * - If the destination already exists, the operation will fail
   * - Parent directories must exist in the destination path
   *
   * @example
   * ```typescript
   * // Copy a template file to a new location with a different name
   * const copyResult = await storage.CopyObject(
   *   'templates/financial-report.xlsx',
   *   'reports/2023/q1-financial-report.xlsx'
   * );
   *
   * if (copyResult) {
   *   console.log('File copied successfully');
   * } else {
   *   console.error('Failed to copy file');
   * }
   * ```
   */
  public async CopyObject(sourceObjectName: string, destinationObjectName: string): Promise<boolean> {
    try {
      const fromPath = this._normalizePath(sourceObjectName);
      const toPath = this._normalizePath(destinationObjectName);

      await this._client.filesCopyV2({
        from_path: fromPath,
        to_path: toPath,
        autorename: false,
      });

      return true;
    } catch (error) {
      console.error('Error copying object', { sourceObjectName, destinationObjectName, error });
      return false;
    }
  }

  /**
   * Checks if a file or folder exists
   *
   * This method verifies whether an object (file or folder) exists at the specified path.
   *
   * @param objectName - Path to check (e.g., 'documents/report.pdf')
   * @returns A Promise that resolves to true if the object exists, false otherwise
   *
   * @example
   * ```typescript
   * // Check if a file exists before attempting to download it
   * const exists = await storage.ObjectExists('presentations/quarterly-update.pptx');
   *
   * if (exists) {
   *   // File exists, proceed with download
   *   const fileContent = await storage.GetObject('presentations/quarterly-update.pptx');
   *   // Process the file...
   * } else {
   *   console.log('File does not exist');
   * }
   * ```
   */
  public async ObjectExists(objectName: string): Promise<boolean> {
    try {
      await this._getMetadata(objectName);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Checks if a directory exists
   *
   * This method verifies whether a folder exists at the specified path.
   * Unlike ObjectExists, this method also checks that the item is a folder.
   *
   * @param directoryPath - Path to check (e.g., 'documents/reports')
   * @returns A Promise that resolves to true if the directory exists, false otherwise
   *
   * @remarks
   * - Returns false if the path exists but points to a file instead of a folder
   * - Trailing slashes in the path are automatically removed
   *
   * @example
   * ```typescript
   * // Check if a directory exists before creating a file in it
   * const dirExists = await storage.DirectoryExists('documents/reports');
   *
   * if (!dirExists) {
   *   // Create the directory first
   *   await storage.CreateDirectory('documents/reports');
   * }
   *
   * // Now we can safely put a file in this directory
   * await storage.PutObject('documents/reports/annual-summary.pdf', fileContent);
   * ```
   */
  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    try {
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/') ? directoryPath.substring(0, directoryPath.length - 1) : directoryPath;

      const item = await this._getMetadata(normalizedPath);
      return item['.tag'] === 'folder';
    } catch (error) {
      return false;
    }
  }

  /**
   * Search files in Dropbox using Dropbox Search API v2.
   *
   * Dropbox provides full-text search capabilities across file names and content.
   * The search API supports natural language queries and can search both filenames
   * and file content based on the searchContent option.
   *
   * @param query - The search query string (supports natural language and quoted phrases)
   * @param options - Search options for filtering and limiting results
   * @returns A Promise resolving to search results
   *
   * @remarks
   * - Content search (searchContent: true) searches both filename and file content
   * - Filename search (searchContent: false, default) searches only filenames
   * - File type filtering converts extensions to Dropbox file categories
   * - Date filters use server_modified timestamp
   * - Path prefix restricts search to a specific folder and its subfolders
   *
   * @example
   * ```typescript
   * // Simple filename search
   * const results = await storage.SearchFiles('quarterly report');
   *
   * // Search with file type filter
   * const pdfResults = await storage.SearchFiles('budget', {
   *   fileTypes: ['pdf'],
   *   modifiedAfter: new Date('2024-01-01')
   * });
   *
   * // Content search within a specific folder
   * const contentResults = await storage.SearchFiles('machine learning', {
   *   searchContent: true,
   *   pathPrefix: 'documents/research',
   *   maxResults: 50
   * });
   * ```
   */
  public async SearchFiles(query: string, options?: FileSearchOptions): Promise<FileSearchResultSet> {
    try {
      const maxResults = options?.maxResults || 100;

      // Build Dropbox search options
      const searchOptions: files.SearchV2Arg = {
        query,
        options: {
          max_results: Math.min(maxResults, 1000), // Dropbox max is 1000
          path: options?.pathPrefix ? this._normalizePath(options.pathPrefix) : undefined,
          file_status: { '.tag': 'active' }, // Exclude deleted files
          filename_only: !options?.searchContent, // Search filename only or filename + content
        },
      };

      // Add file extension filter if fileTypes provided
      if (options?.fileTypes && options.fileTypes.length > 0) {
        const extensions = this._extractFileExtensions(options.fileTypes);
        if (extensions.length > 0) {
          searchOptions.options.file_extensions = extensions;
        }
      }

      // Execute search using Dropbox Search API v2
      const response = await this._client.filesSearchV2(searchOptions);

      const results: FileSearchResult[] = [];

      // Process search results
      for (const match of response.result.matches || []) {
        // The metadata field is MetadataV2, which can be MetadataV2Metadata or MetadataV2Other
        // We only want MetadataV2Metadata which has the actual file/folder metadata
        if (match.metadata['.tag'] !== 'metadata') {
          continue;
        }

        const metadataV2 = match.metadata as files.MetadataV2Metadata;

        // Skip deleted entries
        if (metadataV2.metadata['.tag'] === 'deleted') {
          continue;
        }

        const metadata = metadataV2.metadata;

        // Skip if not a file (could be folder or other type)
        if (metadata['.tag'] !== 'file') {
          continue;
        }

        // Apply date filters client-side (Dropbox search doesn't support date filters directly)
        if (options?.modifiedAfter || options?.modifiedBefore) {
          const modifiedDate = new Date(metadata.server_modified);

          if (options.modifiedAfter && modifiedDate < options.modifiedAfter) {
            continue;
          }
          if (options.modifiedBefore && modifiedDate > options.modifiedBefore) {
            continue;
          }
        }

        // Extract path information
        const fullPath = this._extractRelativePath(metadata.path_display || metadata.path_lower);
        const pathParts = fullPath.split('/');
        const fileName = pathParts.pop() || metadata.name;

        results.push({
          path: fullPath,
          name: fileName,
          size: metadata.size || 0,
          contentType: mime.lookup(fileName) || 'application/octet-stream',
          lastModified: new Date(metadata.server_modified),
          objectId: metadata.id || '', // Dropbox file ID for direct access
          matchInFilename: this._checkFilenameMatch(fileName, query),
          customMetadata: {
            id: metadata.id,
            rev: metadata.rev,
          },
          providerData: {
            dropboxId: metadata.id,
            pathLower: metadata.path_lower,
          },
        });
      }

      // Check if there are more results available
      const hasMore = response.result.has_more || false;

      return {
        results,
        totalMatches: undefined, // Dropbox doesn't provide total count
        hasMore,
        nextPageToken: hasMore ? 'continue' : undefined, // Dropbox uses continue endpoint for pagination
      };
    } catch (error) {
      console.error('Error searching files in Dropbox', { query, options, error });
      throw new Error(`Dropbox search failed: ${error.message || 'Unknown error'}`);
    }
  }

  /**
   * Extracts file extensions from fileTypes array.
   * Converts MIME types to extensions and removes duplicates.
   *
   * @private
   * @param fileTypes - Array of file types (extensions or MIME types)
   * @returns Array of file extensions without leading dots
   */
  private _extractFileExtensions(fileTypes: string[]): string[] {
    const extensions = new Set<string>();

    for (const fileType of fileTypes) {
      if (fileType.includes('/')) {
        // It's a MIME type, convert to extension
        const ext = mime.extension(fileType);
        if (ext) {
          extensions.add(ext);
        }
      } else {
        // It's already an extension, remove leading dot if present
        extensions.add(fileType.startsWith('.') ? fileType.substring(1) : fileType);
      }
    }

    return Array.from(extensions);
  }

  /**
   * Extracts the relative path from a Dropbox absolute path.
   * Removes the root path prefix if configured.
   *
   * @private
   * @param dropboxPath - The absolute Dropbox path
   * @returns The relative path without root prefix
   */
  private _extractRelativePath(dropboxPath: string): string {
    let relativePath = dropboxPath;

    // Remove root path if present
    if (this._rootPath && relativePath.startsWith(this._rootPath)) {
      relativePath = relativePath.substring(this._rootPath.length);
    }

    // Remove leading slash
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }

    return relativePath;
  }

  /**
   * Checks if a filename contains the search query.
   * Performs case-insensitive matching.
   *
   * @private
   * @param filename - The filename to check
   * @param query - The search query
   * @returns True if the filename contains the query
   */
  private _checkFilenameMatch(filename: string, query: string): boolean {
    return filename.toLowerCase().includes(query.toLowerCase());
  }
}
