import { GetSignedUrlConfig, Storage } from '@google-cloud/storage';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import * as mime from 'mime-types';
import {
  CreatePreAuthUploadUrlPayload,
  FileStorageBase,
  FileSearchOptions,
  FileSearchResultSet,
  GetObjectParams,
  GetObjectMetadataParams,
  StorageListResult,
  StorageObjectMetadata,
  StorageProviderConfig,
} from '../generic/FileStorageBase';
import { getProviderConfig } from '../config';

/**
 * Google Cloud Storage implementation of the FileStorageBase interface.
 *
 * This class provides methods for interacting with Google Cloud Storage as a file storage provider.
 * It implements all the abstract methods defined in FileStorageBase and handles Google-specific
 * authentication, authorization, and file operations.
 *
 * It requires the following environment variables to be set:
 * - STORAGE_GOOGLE_KEY_JSON: A JSON object containing Google Cloud service account credentials
 * - STORAGE_GOOGLE_BUCKET_NAME: The GCS bucket name
 *
 * @example
 * ```typescript
 * // Create an instance of GoogleFileStorage
 * const gcsStorage = new GoogleFileStorage();
 *
 * // Generate a pre-authenticated upload URL
 * const { UploadUrl } = await gcsStorage.CreatePreAuthUploadUrl('documents/report.pdf');
 *
 * // Generate a pre-authenticated download URL
 * const downloadUrl = await gcsStorage.CreatePreAuthDownloadUrl('documents/report.pdf');
 *
 * // List files in a directory
 * const files = await gcsStorage.ListObjects('documents/');
 * ```
 */
@RegisterClass(FileStorageBase, 'Google Cloud Storage')
export class GoogleFileStorage extends FileStorageBase {
  /** The name of this storage provider, used in error messages */
  protected readonly providerName = 'Google Cloud Storage';

  /** The GCS bucket name */
  private _bucket: string;

  /** The Google Cloud Storage client instance */
  private _client: Storage;

  /**
   * Creates a new instance of GoogleFileStorage.
   *
   * Initializes the connection to Google Cloud Storage using environment variables.
   * Throws an error if any required environment variables are missing.
   */
  constructor() {
    super();

    // Try to get config from centralized configuration
    const config = getProviderConfig('googleCloud');

    // Handle credentials from config or env vars
    let credentials;
    if (config?.keyJSON) {
      // If keyJSON is a string, parse it
      credentials = typeof config.keyJSON === 'string' ? JSON.parse(config.keyJSON) : config.keyJSON;
    } else if (config?.keyFilename) {
      // If keyFilename is provided, use it
      this._client = new Storage({ keyFilename: config.keyFilename });
      this._bucket = config?.defaultBucket || env.get('STORAGE_GOOGLE_BUCKET_NAME').required().asString();
      return;
    } else {
      // Fall back to env vars
      credentials = env.get('STORAGE_GOOGLE_KEY_JSON').required().asJsonObject();
    }

    // Initialize with credentials
    const storageOptions: { credentials?: object; projectId?: string } = { credentials };
    if (config?.projectID) {
      storageOptions.projectId = config.projectID;
    }

    this._client = new Storage(storageOptions);
    this._bucket = config?.defaultBucket || env.get('STORAGE_GOOGLE_BUCKET_NAME').required().asString();
  }

  /**
   * Initialize Google Cloud Storage provider.
   *
   * **Always call this method** after creating an instance.
   *
   * @example Simple Deployment (Environment Variables)
   * const storage = new GoogleFileStorage(); // Constructor loads env vars
   * await storage.initialize(); // No config - uses env vars
   * await storage.ListObjects('/');
   *
   * @example Multi-Tenant (Database Credentials)
   * const storage = new GoogleFileStorage();
   * await storage.initialize({
   *   accountId: '12345',
   *   accountName: 'GCS Account',
   *   keyJSON: '{"type":"service_account",...}',
   *   projectID: 'my-project',
   *   defaultBucket: 'my-bucket'
   * });
   *
   * @param config - Optional. Omit to use env vars, provide to override with database creds.
   */
  public async initialize(config?: StorageProviderConfig): Promise<void> {
    await super.initialize(config);

    if (!config) {
      return; // Constructor already handled config from env/file
    }

    // Override with provided values
    const gcsConfig = config as any;
    let credentials;

    if (gcsConfig.keyJSON) {
      credentials = typeof gcsConfig.keyJSON === 'string' ? JSON.parse(gcsConfig.keyJSON) : gcsConfig.keyJSON;
    } else if (gcsConfig.keyFilename) {
      this._client = new Storage({ keyFilename: gcsConfig.keyFilename });
      if (gcsConfig.defaultBucket) {
        this._bucket = gcsConfig.defaultBucket;
      }
      return;
    }

    if (credentials) {
      const storageOptions: { credentials?: object; projectId?: string } = { credentials };
      if (gcsConfig.projectID) {
        storageOptions.projectId = gcsConfig.projectID;
      }
      this._client = new Storage(storageOptions);
    }

    if (gcsConfig.defaultBucket) {
      this._bucket = gcsConfig.defaultBucket;
    }
  }

  /**
   * Checks if Google Cloud Storage provider is properly configured.
   * Returns true if service account credentials and bucket name are present.
   * Logs detailed error messages if configuration is incomplete.
   */
  public get IsConfigured(): boolean {
    const hasClient = !!this._client;
    const hasBucket = !!this._bucket;

    const isConfigured = hasClient && hasBucket;

    if (!isConfigured) {
      const missing: string[] = [];
      if (!hasClient) missing.push('Service Account Credentials');
      if (!hasBucket) missing.push('Bucket Name');

      console.error(
        `❌ Google Cloud Storage provider not configured. Missing: ${missing.join(', ')}\n\n` +
        `Configuration Options:\n\n` +
        `Option 1: Environment Variables\n` +
        `  export STORAGE_GOOGLE_KEY_JSON='{"type":"service_account",...}'\n` +
        `  export STORAGE_GOOGLE_BUCKET_NAME="my-bucket"\n` +
        `  const storage = new GoogleFileStorage();\n` +
        `  await storage.initialize(); // No config needed\n\n` +
        `Option 2: Database Credentials (Multi-Tenant)\n` +
        `  const storage = new GoogleFileStorage();\n` +
        `  await storage.initialize({\n` +
        `    accountId: "...",\n` +
        `    keyJSON: '{"type":"service_account",...}',\n` +
        `    projectID: "my-project",\n` +
        `    defaultBucket: "my-bucket"\n` +
        `  });\n`
      );
    }

    return isConfigured;
  }

  /**
   * Normalizes directory paths to ensure they end with a slash.
   *
   * This is a helper method used internally to ensure consistency in
   * directory path representation. Google Cloud Storage doesn't have actual
   * directories, so we use a trailing slash to simulate them.
   *
   * @param path - The directory path to normalize
   * @returns The normalized path with a trailing slash
   * @private
   */
  private _normalizeDirectoryPath(path: string): string {
    return path.endsWith('/') ? path : path + '/';
  }

  /**
   * Converts metadata to a string map for consistent handling.
   *
   * This is a helper method used internally to ensure that all metadata
   * values are strings, as required by the StorageObjectMetadata type.
   *
   * @param metadata - The metadata object to convert
   * @returns A record with string keys and string values
   * @private
   */
  private _convertMetadataToStringMap(metadata: any): Record<string, string> {
    if (!metadata) return {};

    const result: Record<string, string> = {};
    for (const key in metadata) {
      result[key] = String(metadata[key]);
    }
    return result;
  }

  /**
   * Creates a pre-authenticated upload URL for an object in Google Cloud Storage.
   *
   * This method generates a signed URL that allows for uploading an object
   * to GCS without needing Google Cloud credentials. The URL is valid for
   * 10 minutes and includes the content type based on the file extension.
   *
   * @param objectName - The name of the object to upload (including any path/directory)
   * @returns A Promise resolving to an object with the upload URL
   *
   * @example
   * ```typescript
   * // Generate a pre-authenticated upload URL for a PDF file
   * const { UploadUrl } = await gcsStorage.CreatePreAuthUploadUrl('documents/report.pdf');
   *
   * // The URL can be used with fetch or other HTTP clients to upload the file
   * console.log(UploadUrl);
   * ```
   */
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    const file = this._client.bucket(this._bucket).file(objectName);
    const options = {
      version: 'v4',
      action: 'write',
      expires: Date.now() + 10 * 60 * 1000, // 10 mins
      contentType: mime.lookup(objectName) || 'application/octet-stream',
    } as const;

    const [UploadUrl] = await file.getSignedUrl(options);

    return { UploadUrl };
  }

  /**
   * Creates a pre-authenticated download URL for an object in Google Cloud Storage.
   *
   * This method generates a signed URL that allows for downloading an object
   * from GCS without needing Google Cloud credentials. The URL is valid for
   * 10 minutes and can be shared with clients.
   *
   * @param objectName - The name of the object to download (including any path/directory)
   * @returns A Promise resolving to the download URL
   *
   * @example
   * ```typescript
   * // Generate a pre-authenticated download URL for a PDF file
   * const downloadUrl = await gcsStorage.CreatePreAuthDownloadUrl('documents/report.pdf');
   *
   * // The URL can be shared with users or used in applications for direct download
   * console.log(downloadUrl);
   * ```
   */
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    const file = this._client.bucket(this._bucket).file(objectName);
    const options = {
      version: 'v4',
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000, // 10 mins
    } as GetSignedUrlConfig;

    const [url] = await file.getSignedUrl(options);

    return url;
  }

  /**
   * Moves an object from one location to another within Google Cloud Storage.
   *
   * Unlike some other storage providers, GCS has a native rename operation
   * that can be used to efficiently move objects without needing to copy
   * and delete. This method leverages that capability.
   *
   * @param oldObjectName - The current name/path of the object
   * @param newObjectName - The new name/path for the object
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Move a file from drafts to published folder
   * const success = await gcsStorage.MoveObject(
   *   'drafts/report.docx',
   *   'published/final-report.docx'
   * );
   *
   * if (success) {
   *   console.log('File successfully moved');
   * } else {
   *   console.log('Failed to move file');
   * }
   * ```
   */
  public async MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean> {
    try {
      const response = await this._client.bucket(this._bucket).file(oldObjectName).rename(newObjectName);
      return true;
    } catch (e) {
      console.error('Error renaming file in Google storage', { oldObjectName, newObjectName, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Deletes an object from Google Cloud Storage.
   *
   * This method attempts to delete the specified object. It uses the
   * ignoreNotFound option to ensure it returns true even if the object
   * didn't exist.
   *
   * @param objectName - The name of the object to delete (including any path/directory)
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Delete a temporary file
   * const deleted = await gcsStorage.DeleteObject('temp/report-draft.pdf');
   *
   * if (deleted) {
   *   console.log('File successfully deleted');
   * } else {
   *   console.log('Failed to delete file');
   * }
   * ```
   */
  public async DeleteObject(objectName: string): Promise<boolean> {
    try {
      await this._client.bucket(this._bucket).file(objectName).delete({ ignoreNotFound: true });
      return true; // ignoreNotFound ensures this returns true even if the file doesn't exist
    } catch (e) {
      console.error('Error deleting object from Google storage', { file: objectName, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Lists objects with the specified prefix in Google Cloud Storage.
   *
   * This method returns a list of objects (files) and prefixes (directories)
   * under the specified path prefix. It uses the GCS getFiles API which
   * supports delimiter-based hierarchy simulation.
   *
   * Note: This implementation fetches metadata for each file, which can be
   * inefficient for directories with many files. In a production environment,
   * you might want to optimize this for large directories.
   *
   * @param prefix - The path prefix to list objects from (e.g., 'documents/')
   * @param delimiter - The character used to simulate directory structure, defaults to '/'
   * @returns A Promise resolving to a StorageListResult containing objects and prefixes
   *
   * @example
   * ```typescript
   * // List all files and directories in the documents folder
   * const result = await gcsStorage.ListObjects('documents/');
   *
   * // Process files
   * for (const file of result.objects) {
   *   console.log(`File: ${file.name}, Size: ${file.size}, Type: ${file.contentType}`);
   * }
   *
   * // Process subdirectories
   * for (const dir of result.prefixes) {
   *   console.log(`Directory: ${dir}`);
   * }
   * ```
   */
  public async ListObjects(prefix: string, delimiter = '/'): Promise<StorageListResult> {
    try {
      const options = {
        prefix: prefix,
        delimiter: delimiter,
      };

      const [files, , apiResponse] = await this._client.bucket(this._bucket).getFiles(options);

      const objects: StorageObjectMetadata[] = [];
      let prefixes: string[] = [];

      // Process files (objects)
      for (const file of files) {
        const [metadata] = await file.getMetadata();

        // Skip directory placeholders when listing their contents
        if (file.name === prefix) continue;

        const pathParts = file.name.split('/');
        const name = pathParts[pathParts.length - 1];
        const path = pathParts.slice(0, -1).join('/');

        objects.push({
          name,
          path,
          fullPath: file.name,
          size: parseInt(String(metadata.size)) || 0,
          contentType: metadata.contentType || mime.lookup(file.name) || 'application/octet-stream',
          lastModified: new Date(metadata.updated),
          isDirectory: file.name.endsWith('/'),
          etag: String(metadata.etag),
          cacheControl: String(metadata.cacheControl || ''),
          customMetadata: this._convertMetadataToStringMap(metadata.metadata),
        });
      }

      // Extract directory prefixes
      if (apiResponse && (apiResponse as any).prefixes) {
        prefixes = (apiResponse as any).prefixes;
      }

      return { objects, prefixes };
    } catch (e) {
      console.error('Error listing objects in Google storage', { prefix, bucket: this._bucket });
      console.error(e);
      return { objects: [], prefixes: [] };
    }
  }

  /**
   * Creates a directory (virtual) in Google Cloud Storage.
   *
   * Since GCS doesn't have a native directory concept, this method creates
   * a zero-byte object with a trailing slash to simulate a directory.
   * The object has a special content type to indicate it's a directory.
   *
   * @param directoryPath - The path of the directory to create
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Create a new directory structure
   * const created = await gcsStorage.CreateDirectory('documents/reports/annual/');
   *
   * if (created) {
   *   console.log('Directory created successfully');
   * } else {
   *   console.log('Failed to create directory');
   * }
   * ```
   */
  public async CreateDirectory(directoryPath: string): Promise<boolean> {
    try {
      directoryPath = this._normalizeDirectoryPath(directoryPath);

      // GCS doesn't have real directories, so we create a zero-byte file with the directory name
      const file = this._client.bucket(this._bucket).file(directoryPath);
      await file.save('', {
        metadata: {
          contentType: 'application/x-directory',
        },
      });

      return true;
    } catch (e) {
      console.error('Error creating directory in Google storage', { directoryPath, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Deletes a directory (virtual) and optionally its contents from Google Cloud Storage.
   *
   * For non-recursive deletion, this method simply deletes the directory
   * placeholder object. For recursive deletion, it lists all objects with
   * the directory path as prefix and deletes them in parallel.
   *
   * @param directoryPath - The path of the directory to delete
   * @param recursive - If true, deletes all contents recursively (default: false)
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Delete an empty directory
   * const deleted = await gcsStorage.DeleteDirectory('documents/temp/');
   *
   * // Delete a directory and all its contents
   * const recursivelyDeleted = await gcsStorage.DeleteDirectory('documents/old_projects/', true);
   * ```
   */
  public async DeleteDirectory(directoryPath: string, recursive = false): Promise<boolean> {
    try {
      directoryPath = this._normalizeDirectoryPath(directoryPath);

      if (!recursive) {
        // Just delete the directory placeholder
        return this.DeleteObject(directoryPath);
      }

      // For recursive delete, list all files under this prefix and delete them
      const options = {
        prefix: directoryPath,
      };

      const [files] = await this._client.bucket(this._bucket).getFiles(options);

      // Delete all files concurrently
      const deletePromises = files.map((file) => file.delete());
      await Promise.all(deletePromises);

      return true;
    } catch (e) {
      console.error('Error deleting directory from Google storage', { directoryPath, recursive, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Retrieves metadata for a specific object in Google Cloud Storage.
   *
   * This method fetches the properties of an object without downloading its content,
   * which is more efficient for checking file attributes like size, content type,
   * and last modified date.
   *
   * @param params - Object identifier (objectId and fullPath are equivalent for GCS)
   * @returns A Promise resolving to a StorageObjectMetadata object
   * @throws Error if the object doesn't exist or cannot be accessed
   *
   * @example
   * ```typescript
   * try {
   *   // For GCS, objectId and fullPath are the same (both are the object name)
   *   const metadata = await gcsStorage.GetObjectMetadata({ fullPath: 'documents/report.pdf' });
   *   // Or equivalently:
   *   const metadata2 = await gcsStorage.GetObjectMetadata({ objectId: 'documents/report.pdf' });
   *
   *   console.log(`File: ${metadata.name}`);
   *   console.log(`Size: ${metadata.size} bytes`);
   *   console.log(`Last modified: ${metadata.lastModified}`);
   * } catch (error) {
   *   console.error('File does not exist or cannot be accessed');
   * }
   * ```
   */
  public async GetObjectMetadata(params: GetObjectMetadataParams): Promise<StorageObjectMetadata> {
    // Validate params
    if (!params.objectId && !params.fullPath) {
      throw new Error('Either objectId or fullPath must be provided');
    }

    // For GCS, objectId and fullPath are the same (both are the object name/path)
    const objectName = params.objectId || params.fullPath!;

    try {
      const file = this._client.bucket(this._bucket).file(objectName);
      const [metadata] = await file.getMetadata();

      const pathParts = objectName.split('/');
      const name = pathParts[pathParts.length - 1];
      const path = pathParts.slice(0, -1).join('/');

      return {
        name,
        path,
        fullPath: objectName,
        size: parseInt(String(metadata.size)) || 0,
        contentType: metadata.contentType || mime.lookup(objectName) || 'application/octet-stream',
        lastModified: new Date(metadata.updated),
        isDirectory: objectName.endsWith('/'),
        etag: String(metadata.etag || ''),
        cacheControl: String(metadata.cacheControl || ''),
        customMetadata: this._convertMetadataToStringMap(metadata.metadata),
      };
    } catch (e) {
      console.error('Error getting object metadata from Google storage', { objectName, bucket: this._bucket });
      console.error(e);
      throw new Error(`Object not found: ${params.objectId || params.fullPath}`);
    }
  }

  /**
   * Downloads an object's content from Google Cloud Storage.
   *
   * This method retrieves the full content of an object and returns it
   * as a Buffer for processing in memory.
   *
   * @param params - Object identifier (objectId and fullPath are equivalent for GCS)
   * @returns A Promise resolving to a Buffer containing the object's data
   * @throws Error if the object doesn't exist or cannot be downloaded
   *
   * @example
   * ```typescript
   * try {
   *   // For GCS, objectId and fullPath are the same (both are the object name)
   *   const content = await gcsStorage.GetObject({ fullPath: 'documents/config.json' });
   *   // Or equivalently:
   *   const content2 = await gcsStorage.GetObject({ objectId: 'documents/config.json' });
   *
   *   // Parse the JSON content
   *   const config = JSON.parse(content.toString('utf8'));
   *   console.log('Configuration loaded:', config);
   * } catch (error) {
   *   console.error('Failed to download file:', error.message);
   * }
   * ```
   */
  public async GetObject(params: GetObjectParams): Promise<Buffer> {
    // Validate params
    if (!params.objectId && !params.fullPath) {
      throw new Error('Either objectId or fullPath must be provided');
    }

    // For GCS, objectId and fullPath are the same (both are the object name/path)
    const objectName = params.objectId || params.fullPath!;

    try {
      const file = this._client.bucket(this._bucket).file(objectName);
      const [bufferContent] = await file.download();
      return bufferContent;
    } catch (e) {
      console.error('Error getting object from Google storage', { objectName, bucket: this._bucket });
      console.error(e);
      throw new Error(`Failed to get object: ${params.objectId || params.fullPath}`);
    }
  }

  /**
   * Uploads data to an object in Google Cloud Storage.
   *
   * This method directly uploads a Buffer of data to an object with the specified name.
   * It's useful for server-side operations where you already have the data in memory.
   *
   * @param objectName - The name to assign to the uploaded object
   * @param data - The Buffer containing the data to upload
   * @param contentType - Optional MIME type for the object (inferred from name if not provided)
   * @param metadata - Optional key-value pairs of custom metadata to associate with the object
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Upload a text file
   * const content = Buffer.from('Hello, World!', 'utf8');
   * const uploaded = await gcsStorage.PutObject(
   *   'documents/hello.txt',
   *   content,
   *   'text/plain',
   *   { author: 'John Doe', department: 'Engineering' }
   * );
   *
   * if (uploaded) {
   *   console.log('File uploaded successfully');
   * } else {
   *   console.log('Failed to upload file');
   * }
   * ```
   */
  public async PutObject(objectName: string, data: Buffer, contentType?: string, metadata?: Record<string, string>): Promise<boolean> {
    try {
      const file = this._client.bucket(this._bucket).file(objectName);

      // Determine content type based on file extension if not provided
      const effectiveContentType = contentType || mime.lookup(objectName) || 'application/octet-stream';

      await file.save(data, {
        metadata: {
          contentType: effectiveContentType,
          metadata,
        },
      });

      return true;
    } catch (e) {
      console.error('Error putting object to Google storage', { objectName, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Copies an object within Google Cloud Storage.
   *
   * This method creates a copy of an object at a new location without removing the original.
   * It uses the GCS copy API, which allows for efficient copying within the same bucket.
   *
   * @param sourceObjectName - The name of the object to copy
   * @param destinationObjectName - The name to assign to the copied object
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Create a backup copy of an important file
   * const copied = await gcsStorage.CopyObject(
   *   'documents/contract.pdf',
   *   'backups/contract_2024-05-16.pdf'
   * );
   *
   * if (copied) {
   *   console.log('File copied successfully');
   * } else {
   *   console.log('Failed to copy file');
   * }
   * ```
   */
  public async CopyObject(sourceObjectName: string, destinationObjectName: string): Promise<boolean> {
    try {
      const sourceFile = this._client.bucket(this._bucket).file(sourceObjectName);
      const destinationFile = this._client.bucket(this._bucket).file(destinationObjectName);

      await sourceFile.copy(destinationFile);
      return true;
    } catch (e) {
      console.error('Error copying object in Google storage', {
        sourceObjectName,
        destinationObjectName,
        bucket: this._bucket,
      });
      console.error(e);
      return false;
    }
  }

  /**
   * Checks if an object exists in Google Cloud Storage.
   *
   * This method verifies the existence of an object without downloading
   * its content. This is efficient for validation purposes.
   *
   * @param objectName - The name of the object to check
   * @returns A Promise resolving to a boolean indicating if the object exists
   *
   * @example
   * ```typescript
   * // Check if a file exists before attempting to use it
   * const exists = await gcsStorage.ObjectExists('documents/report.pdf');
   *
   * if (exists) {
   *   console.log('File exists, proceeding with download');
   *   const content = await gcsStorage.GetObject('documents/report.pdf');
   *   // Process the content...
   * } else {
   *   console.log('File does not exist');
   * }
   * ```
   */
  public async ObjectExists(objectName: string): Promise<boolean> {
    try {
      const file = this._client.bucket(this._bucket).file(objectName);
      const [exists] = await file.exists();
      return exists;
    } catch (e) {
      console.error('Error checking if object exists in Google storage', { objectName, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Checks if a directory (virtual) exists in Google Cloud Storage.
   *
   * Since GCS doesn't have a native directory concept, this method checks for either:
   * 1. The existence of a directory placeholder object (zero-byte object with trailing slash)
   * 2. The existence of any objects with the directory path as a prefix
   *
   * @param directoryPath - The path of the directory to check
   * @returns A Promise resolving to a boolean indicating if the directory exists
   *
   * @example
   * ```typescript
   * // Check if a directory exists before trying to save files to it
   * const exists = await gcsStorage.DirectoryExists('documents/reports/');
   *
   * if (!exists) {
   *   console.log('Directory does not exist, creating it first');
   *   await gcsStorage.CreateDirectory('documents/reports/');
   * }
   *
   * // Now safe to use the directory
   * await gcsStorage.PutObject('documents/reports/new-report.pdf', fileData);
   * ```
   */
  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    try {
      directoryPath = this._normalizeDirectoryPath(directoryPath);

      // Method 1: Check if directory placeholder exists
      const placeholderExists = await this.ObjectExists(directoryPath);
      if (placeholderExists) {
        return true;
      }

      // Method 2: Check if any objects with this prefix exist
      const options = {
        prefix: directoryPath,
        maxResults: 1,
      };

      const [files] = await this._client.bucket(this._bucket).getFiles(options);
      return files.length > 0;
    } catch (e) {
      console.error('Error checking if directory exists in Google storage', { directoryPath, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Search is not supported by Google Cloud Storage.
   * GCS is an object storage service without built-in search capabilities.
   *
   * To search GCS objects, consider:
   * - Using BigQuery to query GCS data
   * - Maintaining a separate search index (Elasticsearch, etc.)
   * - Using object metadata for filtering with ListObjects
   * - Using Cloud Data Loss Prevention API for content discovery
   *
   * @param query - The search query (not used)
   * @param options - Search options (not used)
   * @throws UnsupportedOperationError always
   */
  public async SearchFiles(query: string, options?: FileSearchOptions): Promise<FileSearchResultSet> {
    this.throwUnsupportedOperationError('SearchFiles');
  }
}
