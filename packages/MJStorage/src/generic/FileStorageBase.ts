/**
 * Represents the payload returned by the CreatePreAuthUploadUrl method.
 * This type contains the necessary information for uploading a file to a storage provider.
 *
 * @property UploadUrl - The pre-authenticated URL to which the file should be uploaded
 * @property ProviderKey - Optional. Some storage providers assign their own unique key to the object
 *                         that should be used for future operations instead of the original object name
 */
export type CreatePreAuthUploadUrlPayload = {
  UploadUrl: string;
  ProviderKey?: string | undefined;
};

/**
 * Parameters for GetObject operation.
 * Either objectId or fullPath must be provided (objectId is preferred for performance).
 *
 * @property objectId - Provider-specific object ID (Box: file ID, Google Drive: file ID, etc.)
 *                      Bypasses path resolution for significantly faster access
 * @property fullPath - Full path to the object (e.g., 'documents/report.pdf')
 *                      Requires path resolution which may involve multiple API calls
 */
export type GetObjectParams = {
  objectId?: string;
  fullPath?: string;
};

/**
 * Parameters for GetObjectMetadata operation.
 * Either objectId or fullPath must be provided (objectId is preferred for performance).
 *
 * @property objectId - Provider-specific object ID
 * @property fullPath - Full path to the object
 */
export type GetObjectMetadataParams = {
  objectId?: string;
  fullPath?: string;
};

/**
 * Represents metadata information about a stored object or file.
 * This comprehensive type includes common file metadata properties available across different storage providers.
 *
 * @property name - The name of the object (typically the filename without path)
 * @property path - The directory path where the object is stored, without the object name
 * @property fullPath - The complete path to the object including both path and name
 * @property size - The size of the object in bytes
 * @property contentType - The MIME type of the object
 * @property lastModified - The date when the object was last modified
 * @property isDirectory - Boolean flag indicating whether the object is a directory/folder
 * @property etag - Optional. Entity tag used for cache validation and conditional operations
 * @property cacheControl - Optional. Cache control directives for the object
 * @property customMetadata - Optional. Additional custom metadata as key-value pairs
 */
export type StorageObjectMetadata = {
  name: string;
  path: string;
  fullPath: string;
  size: number;
  contentType: string;
  lastModified: Date;
  isDirectory: boolean;
  etag?: string;
  cacheControl?: string;
  customMetadata?: Record<string, string>;
};

/**
 * Represents the result of a ListObjects operation.
 * Contains both the objects (files) and prefixes (directories) found in the storage provider.
 *
 * @property objects - Array of StorageObjectMetadata for all objects/files found in the specified path
 * @property prefixes - Array of directory path strings found in the specified path
 */
export type StorageListResult = {
  objects: StorageObjectMetadata[];
  prefixes: string[];
};

/**
 * Options for configuring a file search operation.
 * These options allow for flexible, provider-agnostic search capabilities
 * while still leveraging native provider search features where available.
 */
export type FileSearchOptions = {
  /**
   * Maximum number of results to return.
   * Defaults to 100 if not specified.
   */
  maxResults?: number;

  /**
   * File types to include in search results.
   * Examples: ['pdf', 'docx', 'xlsx'], ['image/*'], ['text/plain']
   * Can use MIME types or file extensions.
   */
  fileTypes?: string[];

  /**
   * Only return files modified after this date.
   */
  modifiedAfter?: Date;

  /**
   * Only return files modified before this date.
   */
  modifiedBefore?: Date;

  /**
   * Restrict search to files within this path prefix.
   * Example: 'documents/reports/' would only search within that directory.
   */
  pathPrefix?: string;

  /**
   * Whether to search file contents in addition to names and metadata.
   * Not all providers support content search.
   * Defaults to false.
   */
  searchContent?: boolean;

  /**
   * Additional provider-specific search parameters.
   * This allows providers to expose advanced features not covered by common options.
   * Example: { 'trashed': false } for Google Drive, { 'scope': 'personal' } for SharePoint
   */
  providerSpecific?: Record<string, unknown>;
};

/**
 * Represents a single search result from a file storage provider.
 * Combines file metadata with search-specific information like relevance and excerpts.
 */
export type FileSearchResult = {
  /**
   * Full path to the file including directory and filename.
   */
  path: string;

  /**
   * Filename without the directory path.
   */
  name: string;

  /**
   * File size in bytes.
   */
  size: number;

  /**
   * MIME type of the file.
   */
  contentType: string;

  /**
   * When the file was last modified.
   */
  lastModified: Date;

  /**
   * Relevance score from the search provider (0.0 to 1.0).
   * Higher scores indicate better matches.
   * May be undefined if provider doesn't return relevance scores.
   */
  relevance?: number;

  /**
   * Text excerpt showing the search term in context (for content searches).
   * May contain HTML highlighting tags from the provider.
   * Undefined if content search was not performed or no match in content.
   */
  excerpt?: string;

  /**
   * Whether the match was found in the filename (true) or content (false).
   * Undefined if this information is not available from the provider.
   */
  matchInFilename?: boolean;

  /**
   * Provider-specific object ID that can be used for direct access.
   * This ID can be passed to GetObject/GetMetadata to bypass path resolution.
   * Examples: Box file ID, Google Drive file ID, SharePoint item ID, Dropbox id.
   * Provides significant performance improvement by avoiding path traversal.
   */
  objectId?: string;

  /**
   * Custom metadata associated with the file.
   */
  customMetadata?: Record<string, string>;

  /**
   * Provider-specific additional data.
   * Example: Google Drive file ID, SharePoint list item ID, etc.
   */
  providerData?: Record<string, unknown>;
};

/**
 * The complete result set from a search operation.
 */
export type FileSearchResultSet = {
  /**
   * Array of matching files.
   */
  results: FileSearchResult[];

  /**
   * Total number of matches found (may be greater than results.length if limited by maxResults).
   * Undefined if provider doesn't return total count.
   */
  totalMatches?: number;

  /**
   * Whether there are more results available beyond maxResults.
   */
  hasMore: boolean;

  /**
   * Token or cursor for fetching the next page of results.
   * Undefined if hasMore is false or provider doesn't support pagination.
   */
  nextPageToken?: string;
};

/**
 * Error thrown when a storage provider does not support a particular operation.
 * This custom error provides clear information about which operation was attempted
 * and which provider doesn't support it.
 */
export class UnsupportedOperationError extends Error {
  /**
   * Creates a new UnsupportedOperationError instance.
   *
   * @param methodName - The name of the method that is not supported
   * @param providerName - The name of the storage provider that doesn't support the method
   */
  constructor(methodName: string, providerName: string) {
    super(`Operation '${methodName}' is not supported by the ${providerName} provider`);
    this.name = 'UnsupportedOperationError';
  }
}

/**
 * Configuration options for initializing a storage provider.
 * This interface defines the standard configuration that can be passed to initialize().
 *
 * ## Usage Patterns
 *
 * ### Simple Deployment (Environment Variables)
 * - Omit accountId when using environment variables
 * - Constructor loads credentials automatically
 * - Call initialize() with no config or empty object
 *
 * ### Multi-Tenant Enterprise (Database)
 * - Provide accountId to link driver to FileStorageAccount
 * - Include decrypted credentials from database
 * - Or use initializeDriverWithAccountCredentials() utility
 */
export interface StorageProviderConfig {
  /**
   * The ID of the FileStorageAccount entity this driver instance is operating for.
   * This links the driver to a specific organizational storage account.
   *
   * **Optional**: Provide for multi-tenant mode to track account association.
   * Omit for simple deployment using environment variables.
   */
  accountId?: string;

  /**
   * The name of the account (for logging/display purposes).
   *
   * **Optional**: Useful for logging and debugging in multi-tenant scenarios.
   */
  accountName?: string;

  /**
   * Provider-specific configuration values (e.g., API keys, bucket names, etc.).
   *
   * **Simple Deployment**: Not needed - constructor loads from environment variables.
   * **Multi-Tenant**: Provide decrypted credentials from Credential entity.
   *
   * If provided, these values override the constructor defaults.
   * If omitted, uses credentials already loaded by constructor.
   */
  [key: string]: unknown;
}

/**
 * Represents an abstract base class for file storage operations.
 *
 * This class defines a common interface for interacting with various cloud storage providers,
 * allowing for consistent file operations regardless of the underlying storage system.
 * Each storage provider implementation extends this base class and provides
 * concrete implementations for all abstract methods.
 *
 * The class provides methods for:
 * - Generating pre-authenticated upload and download URLs
 * - Managing files (creating, copying, moving, deleting)
 * - Managing directories (creating, deleting, listing contents)
 * - Retrieving file metadata and content
 * - Checking for file and directory existence
 *
 * Implementation notes:
 * - All methods are designed to be provider-agnostic
 * - Error handling should be implemented in derived classes to provide consistent behavior
 * - Methods return Promises to support asynchronous operations across various providers
 * - When a storage provider doesn't support a particular operation, implementations should throw UnsupportedOperationError
 * - Each instance operates on behalf of a specific FileStorageAccount (identified by accountId)
 */
export abstract class FileStorageBase {
  /**
   * The name of this storage provider, used in error messages and logging.
   * Each implementation must define this property with a descriptive name.
   */
  protected abstract readonly providerName: string;

  /**
   * The ID of the FileStorageAccount this driver instance is operating for.
   * Set during initialization via the config parameter.
   */
  protected _accountId: string | undefined;

  /**
   * The name of the FileStorageAccount (for logging/display purposes).
   */
  protected _accountName: string | undefined;

  /**
   * Gets the account ID this driver instance is operating for.
   * Returns undefined if the driver was not initialized with an account.
   */
  public get AccountId(): string | undefined {
    return this._accountId;
  }

  /**
   * Gets the account name this driver instance is operating for.
   * Returns undefined if the driver was not initialized with an account.
   */
  public get AccountName(): string | undefined {
    return this._accountName;
  }

  /**
   * Helper method to throw an UnsupportedOperationError with appropriate context.
   * This method simplifies implementation of methods not supported by specific providers.
   *
   * @param methodName - The name of the method that is not supported
   * @throws UnsupportedOperationError with information about the unsupported method and provider
   */
  protected throwUnsupportedOperationError(methodName: string): never {
    throw new UnsupportedOperationError(methodName, this.providerName);
  }

  /**
   * Generates a pre-authenticated URL for uploading files to a storage provider.
   *
   * This method abstracts over different storage providers, allowing for a unified interface
   * to obtain upload URLs, regardless of the underlying provider's specifics. The method
   * takes the name of the file (or object) you wish to upload as input and returns a Promise.
   * This Promise, when resolved, provides a payload containing two key pieces of information:
   *
   * 1. `UploadUrl`: The URL to which the file should be uploaded. This URL is pre-authenticated,
   *    meaning it includes any necessary authentication tokens or signatures. The URL's format
   *    and the authentication method depend on the storage provider being used.
   *
   * 2. `ProviderKey` (optional): Some storage providers assign their own unique key or name to
   *    the uploaded object instead of using the name provided by the user. If the provider you
   *    are using does this, the `ProviderKey` will be included in the payload. This key can be
   *    useful for future reference to the object within the storage provider's system.
   *
   * @example
   * ```typescript
   * const uploadPayload = await CreatePreAuthUploadUrl("photo.jpg");
   * console.log(uploadPayload.UploadUrl); // Use this URL to upload your file
   * if (uploadPayload.ProviderKey) {
   *   // If this is returned, use it as the `objectName` for `CreatePreAuthDownloadUrl` or `DeleteObject`
   *   console.log(uploadPayload.ProviderKey);
   * }
   * ```
   *
   * Note: This method is abstract and must be implemented by a subclass that specifies the logic
   * for interacting with a specific storage provider.
   *
   * @param objectName - The name of the object or file to be uploaded. This name is used by the
   *                     storage provider and may also be included in the pre-authenticated URL.
   * @returns A Promise that resolves to a payload containing the upload URL and, optionally, the
   *          provider's object key. This payload allows you to proceed with uploading your file
   *          to the storage provider.
   */
  public abstract CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload>;

  /**
   * Generates a pre-authenticated URL for downloading files from a storage provider.
   *
   * This method abstracts the process of generating download URLs across different storage providers,
   * offering a unified interface for obtaining these URLs. When called with the name of the file
   * or object to download, it creates a URL that includes necessary authentication tokens directly
   * in the URL, allowing for secure access without requiring additional authentication at download time.
   *
   * @example
   * ```typescript
   * const downloadUrl = await CreatePreAuthDownloadUrl("report.pdf");
   * console.log(downloadUrl); // Use this URL to download your file directly
   * ```
   *
   * If a `ProviderKey` was previously returned by `CreatePreAuthUploadUrl`, use that as the
   * `objectName` instead of the object's natural name:
   *
   * ```typescript
   * const downloadUrl = await CreatePreAuthDownloadUrl(file.ProviderKey);
   * console.log(downloadUrl); // Use this URL to download your file directly
   * ```
   *
   * This method simplifies the process of securely sharing or accessing files stored in cloud storage
   * by providing a direct, pre-authenticated link to the file. It's particularly useful in applications
   * where files need to be accessed or shared without navigating through the storage provider's standard
   * authentication flow each time.
   *
   * @param objectName - The name of the object or file for which you want to generate a download URL.
   *                     This is the name as it is known to the storage provider, and it will be used
   *                     to locate the file and generate the URL.
   * @returns A Promise that resolves to a string, which is the pre-authenticated download URL for the
   *          specified object or file. This URL can be used immediately for downloading the file
   *          without further authentication.
   */
  public abstract CreatePreAuthDownloadUrl(objectName: string): Promise<string>;

  /**
   * Moves an object or file from one location to another within a storage provider's system.
   *
   * This method provides a unified interface for moving objects across different storage providers.
   * It takes the original object name and the new desired name/location, and handles the
   * appropriate operations to move the object while preserving its content.
   *
   * Some implementations may perform this as a copy followed by a delete operation,
   * while others might use native move capabilities of the underlying storage system.
   *
   * @example
   * ```typescript
   * const moved = await storage.MoveObject('documents/draft.docx', 'documents/final/report.docx');
   * if (moved) {
   *   console.log('File successfully moved');
   * } else {
   *   console.log('Failed to move file');
   * }
   * ```
   *
   * @param oldObjectName - The current name/path of the object to be moved. This is the identifier
   *                      used by the storage provider to locate the object for moving.
   * @param newObjectName - The new name/path where you want to move the object. This should match
   *                      exactly as it is expected to be known to the storage provider after moving.
   * @returns A Promise that resolves to a boolean value. `true` indicates that the object was
   *          successfully moved, while `false` indicates a failure in the move process.
   */
  public abstract MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean>;

  /**
   * Deletes an object or file from a storage provider's system.
   *
   * This method provides a unified interface for object deletion across different storage providers.
   * It takes the name of the object to delete and handles the provider-specific operations to
   * remove it from storage.
   *
   * @example
   * ```typescript
   * const deleted = await storage.DeleteObject('documents/old_report.pdf');
   * if (deleted) {
   *   console.log('File successfully deleted');
   * } else {
   *   console.log('Failed to delete file - it may not exist or there was an error');
   * }
   * ```
   *
   * If a `ProviderKey` was previously returned by `CreatePreAuthUploadUrl`, use that as the
   * `objectName` instead of the object's natural name:
   *
   * ```typescript
   * const deleted = await storage.DeleteObject(file.ProviderKey);
   * if (deleted) {
   *   console.log('File successfully deleted');
   * } else {
   *   console.log('Failed to delete file');
   * }
   * ```
   *
   * @param objectName - The name of the object or file to be deleted. This is the identifier
   *                   used by the storage provider to locate the object for deletion.
   * @returns A Promise that resolves to a boolean value. `true` indicates that the object was
   *          successfully deleted, while `false` indicates a failure in the deletion process.
   */
  public abstract DeleteObject(objectName: string): Promise<boolean>;

  /**
   * Lists objects in a storage provider's system with the given prefix path.
   *
   * This method returns a list of objects (files) and prefixes (directories) under the specified path.
   * It supports a hierarchical directory-like structure through the use of prefixes that can represent
   * "folders" within the storage, even for providers that don't natively support directories.
   *
   * @example
   * ```typescript
   * // List all objects in the "documents" directory
   * const result = await storage.ListObjects('documents/');
   *
   * // Access the files
   * for (const file of result.objects) {
   *   console.log(`File: ${file.name}, Size: ${file.size}, Type: ${file.contentType}`);
   * }
   *
   * // Access the subdirectories
   * for (const dir of result.prefixes) {
   *   console.log(`Directory: ${dir}`);
   * }
   * ```
   *
   * @param prefix - The path prefix to list objects from. Use "/" for the root, or paths like
   *                 "documents/" for specific directories.
   * @param delimiter - The character used to group keys. Typically "/" is used to simulate
   *                    directory structure. Defaults to "/".
   * @returns A Promise that resolves to a StorageListResult containing both objects and
   *          prefixes (directories).
   */
  public abstract ListObjects(prefix: string, delimiter?: string): Promise<StorageListResult>;

  /**
   * Creates a directory in the storage system.
   *
   * For storage systems that don't natively support directories (like AWS S3 or Google Cloud Storage),
   * this may create a zero-byte object with a trailing delimiter to simulate a directory. For systems
   * with native directory support, this will create an actual directory.
   *
   * @example
   * ```typescript
   * // Create a "reports" directory inside "documents"
   * const created = await storage.CreateDirectory('documents/reports/');
   * if (created) {
   *   console.log('Directory created successfully');
   * } else {
   *   console.log('Failed to create directory');
   * }
   * ```
   *
   * @param directoryPath - The path of the directory to create. Should typically end with a
   *                       delimiter (typically "/").
   * @returns A Promise that resolves to a boolean indicating success of the directory creation.
   */
  public abstract CreateDirectory(directoryPath: string): Promise<boolean>;

  /**
   * Deletes a directory and optionally all of its contents recursively.
   *
   * This method can be used to remove empty directories or, with the recursive flag set to true,
   * to delete entire directory trees including all contained files and subdirectories.
   *
   * @example
   * ```typescript
   * // Delete an empty directory
   * const deleted = await storage.DeleteDirectory('documents/temp/');
   *
   * // Delete a directory and all its contents
   * const deletedRecursively = await storage.DeleteDirectory('documents/old_project/', true);
   * ```
   *
   * @param directoryPath - The path of the directory to delete.
   * @param recursive - If true, deletes all contents recursively. If false and the directory
   *                   is not empty, the operation will fail. Defaults to false.
   * @returns A Promise that resolves to a boolean indicating success of the deletion operation.
   */
  public abstract DeleteDirectory(directoryPath: string, recursive?: boolean): Promise<boolean>;

  /**
   * Retrieves metadata for a specific object without downloading its contents.
   *
   * This method allows for checking properties of an object such as its size, content type,
   * and last modified date without transferring the actual data, which can be efficient
   * for large files.
   *
   * @example
   * ```typescript
   * try {
   *   const metadata = await storage.GetObjectMetadata('documents/large_file.zip');
   *   console.log(`File size: ${metadata.size} bytes`);
   *   console.log(`Last modified: ${metadata.lastModified}`);
   *   console.log(`Content type: ${metadata.contentType}`);
   * } catch (error) {
   *   console.error('File not found or error retrieving metadata', error);
   * }
   * ```
   *
   * @param params - Object identifier (prefer objectId for performance, fallback to fullPath)
   * @returns A Promise that resolves to a StorageObjectMetadata object containing the metadata.
   *          If the object does not exist, the promise will be rejected.
   */
  public abstract GetObjectMetadata(params: GetObjectMetadataParams): Promise<StorageObjectMetadata>;

  /**
   * Downloads an object's content as a Buffer.
   *
   * This method retrieves the full content of an object from the storage provider
   * and returns it as a Buffer for processing in memory.
   *
   * @example
   * ```typescript
   * try {
   *   const fileContent = await storage.GetObject('documents/config.json');
   *   // Parse the JSON content
   *   const config = JSON.parse(fileContent.toString('utf8'));
   *   console.log('Loaded configuration:', config);
   * } catch (error) {
   *   console.error('Error downloading file', error);
   * }
   * ```
   *
   * @param params - Object identifier (prefer objectId for performance, fallback to fullPath)
   * @returns A Promise that resolves to a Buffer containing the object's data.
   *          If the object does not exist, the promise will be rejected.
   */
  public abstract GetObject(params: GetObjectParams): Promise<Buffer>;

  /**
   * Uploads object data to the storage provider.
   *
   * This is a direct upload method that doesn't use a pre-authorized URL. Instead,
   * it takes the data as a Buffer and handles the upload directly, making it suitable
   * for server-side operations where you already have the data in memory.
   *
   * @example
   * ```typescript
   * // Upload a text file
   * const content = Buffer.from('Hello, World!', 'utf8');
   * const uploaded = await storage.PutObject(
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
   *
   * @param objectName - The name to assign to the uploaded object.
   * @param data - The Buffer containing the data to upload.
   * @param contentType - Optional MIME type of the content. If not provided,
   *                     it may be inferred from the object name or set to a default.
   * @param metadata - Optional custom metadata to associate with the object.
   * @returns A Promise that resolves to a boolean indicating success of the upload.
   */
  public abstract PutObject(objectName: string, data: Buffer, contentType?: string, metadata?: Record<string, string>): Promise<boolean>;

  /**
   * Copies an object within the storage system.
   *
   * Unlike MoveObject which removes the source object, this creates a copy while
   * leaving the original intact. This is useful for creating backups or versions
   * of files.
   *
   * @example
   * ```typescript
   * // Create a backup copy of a file
   * const copied = await storage.CopyObject(
   *   'documents/important.docx',
   *   'documents/backups/important_backup.docx'
   * );
   *
   * if (copied) {
   *   console.log('File copied successfully');
   * } else {
   *   console.log('Failed to copy file');
   * }
   * ```
   *
   * @param sourceObjectName - The name of the object to copy.
   * @param destinationObjectName - The name to assign to the copied object.
   * @returns A Promise that resolves to a boolean indicating success of the copy operation.
   */
  public abstract CopyObject(sourceObjectName: string, destinationObjectName: string): Promise<boolean>;

  /**
   * Checks if an object exists in the storage system.
   *
   * This method provides a way to verify the existence of an object without
   * transferring its data or metadata, which can be more efficient when you only
   * need to know if something exists.
   *
   * @example
   * ```typescript
   * const exists = await storage.ObjectExists('documents/may_not_exist.pdf');
   * if (exists) {
   *   console.log('The file exists');
   * } else {
   *   console.log('The file does not exist');
   * }
   * ```
   *
   * @param objectName - The name of the object to check.
   * @returns A Promise that resolves to a boolean indicating if the object exists.
   */
  public abstract ObjectExists(objectName: string): Promise<boolean>;

  /**
   * Checks if a directory exists in the storage system.
   *
   * For storage systems that don't natively support directories, this may check for
   * the existence of a directory placeholder object or for any objects with the given
   * prefix.
   *
   * @example
   * ```typescript
   * const exists = await storage.DirectoryExists('documents/reports/');
   * if (exists) {
   *   console.log('The directory exists');
   * } else {
   *   console.log('The directory does not exist');
   * }
   * ```
   *
   * @param directoryPath - The path of the directory to check.
   * @returns A Promise that resolves to a boolean indicating if the directory exists.
   */
  public abstract DirectoryExists(directoryPath: string): Promise<boolean>;

  /**
   * Initialize storage provider with optional configuration.
   *
   * ## Standard Usage Pattern
   *
   * **ALWAYS call this method** after creating a provider instance.
   *
   * ### Simple Deployment (Environment Variables)
   * Constructor loads credentials from environment variables, then call
   * initialize() with no config to complete setup:
   *
   * ```typescript
   * // Set environment variables:
   * // STORAGE_AWS_ACCESS_KEY_ID=...
   * // STORAGE_AWS_SECRET_ACCESS_KEY=...
   * // STORAGE_AWS_BUCKET_NAME=...
   * // STORAGE_AWS_REGION=...
   *
   * const storage = new AWSFileStorage(); // Constructor loads env vars
   * await storage.initialize(); // No config - uses env vars
   * await storage.ListObjects('/'); // Ready to use
   * ```
   *
   * ### Multi-Tenant Enterprise (Database)
   * Constructor loads defaults, then call initialize() with configuration
   * to override with database credentials and track account:
   *
   * ```typescript
   * // Preferred: Use infrastructure utility
   * const storage = await initializeDriverWithAccountCredentials({
   *   accountEntity,
   *   providerEntity,
   *   contextUser
   * });
   *
   * // Alternative: Manual initialization
   * const storage = new AWSFileStorage();
   * await storage.initialize({
   *   accountId: account.id,
   *   accountName: account.name,
   *   accessKeyID: creds.accessKeyID,
   *   secretAccessKey: creds.secretAccessKey,
   *   region: creds.region,
   *   defaultBucket: creds.bucket
   * });
   * ```
   *
   * ## How It Works
   *
   * - **No config**: Uses credentials already loaded by constructor from environment variables
   * - **With config**: Overrides constructor credentials with provided values
   * - **accountId**: Optional - provide for multi-tenant tracking
   *
   * ## Implementation Notes for Subclasses
   *
   * Subclass implementations should:
   * 1. Call super.initialize(config) first to set accountId and accountName
   * 2. Check if config is provided before attempting to override credentials
   * 3. Only override values that are present in config
   * 4. Reinitialize client/connection if credentials changed
   *
   * @param config - Optional configuration object
   *                 - Omit for simple deployment (uses env vars from constructor)
   *                 - Provide for multi-tenant (overrides with database credentials)
   * @returns A Promise that resolves when initialization is complete
   */
  public async initialize(config?: StorageProviderConfig): Promise<void> {
    // Extract and store account information from the config if provided
    if (config) {
      this._accountId = config.accountId;
      this._accountName = config.accountName;
    }
  }

  /**
   * Checks whether this storage provider is properly configured and ready to use.
   *
   * This abstract getter must be implemented by each provider to verify that all
   * required configuration parameters (API keys, credentials, endpoints, etc.) are
   * present and valid. This allows the system to determine which providers are
   * actually available before attempting to use them.
   *
   * **Implementation Guidelines:**
   * - Check for presence of all required configuration values
   * - Do NOT make network calls or expensive operations
   * - Return true only if the provider can be used immediately
   * - Return false if any required configuration is missing or invalid
   *
   * **Examples by Provider:**
   * - Google Drive: Check for clientID, clientSecret, and refreshToken
   * - AWS S3: Check for accessKeyId, secretAccessKey, and bucketName
   * - SharePoint: Check for tenantId, clientId, clientSecret, siteUrl
   * - Azure Blob: Check for connectionString or account credentials
   *
   * @example
   * ```typescript
   * // In Google Drive provider:
   * public get IsConfigured(): boolean {
   *   return !!(this._clientID && this._clientSecret && this._refreshToken);
   * }
   *
   * // In AWS S3 provider:
   * public get IsConfigured(): boolean {
   *   return !!(this._accessKeyId && this._secretAccessKey && this._bucketName);
   * }
   *
   * // Usage:
   * const storage = new GoogleDriveFileStorage();
   * if (storage.IsConfigured) {
   *   // Safe to use this provider
   *   await storage.SearchFiles('query');
   * } else {
   *   console.log('Provider not configured, skipping');
   * }
   * ```
   *
   * @returns true if the provider is fully configured and ready to use, false otherwise
   */
  public abstract get IsConfigured(): boolean;

  /**
   * Searches for files across the storage system using the provider's native search capabilities.
   *
   * This method leverages each provider's built-in search APIs to find files matching
   * the specified query. The search can include filenames, file content, and metadata
   * depending on the provider's capabilities and the options specified.
   *
   * **Provider Support:**
   * - **Google Drive**: Full support via Drive API search with content indexing
   * - **SharePoint**: Full support via Microsoft Graph Search API
   * - **Dropbox**: Full support via search_v2 API with content search
   * - **Box**: Full support via Box Search API
   * - **AWS S3**: Not supported - throws UnsupportedOperationError
   * - **Azure Blob**: Not supported - throws UnsupportedOperationError
   * - **Google Cloud Storage**: Not supported - throws UnsupportedOperationError
   *
   * **Query Syntax:**
   * The query parameter accepts natural language search terms. Advanced query syntax
   * (like boolean operators, exact phrases, wildcards) varies by provider:
   * - Google Drive supports: "exact phrase", OR, -, wildcards
   * - SharePoint supports: KQL (Keyword Query Language)
   * - Dropbox supports: exact phrases in quotes
   * - Box supports: boolean AND/OR/NOT operators
   *
   * Implementations should document their specific query syntax support.
   *
   * @example
   * ```typescript
   * // Simple filename search
   * const results = await storage.SearchFiles('quarterly report');
   * for (const file of results.results) {
   *   console.log(`Found: ${file.path} (${file.size} bytes)`);
   * }
   *
   * // Search with filters
   * const pdfResults = await storage.SearchFiles('budget', {
   *   fileTypes: ['pdf'],
   *   modifiedAfter: new Date('2024-01-01'),
   *   pathPrefix: 'documents/finance/',
   *   maxResults: 50
   * });
   *
   * // Content search (if supported)
   * const contentResults = await storage.SearchFiles('machine learning algorithm', {
   *   searchContent: true,
   *   fileTypes: ['docx', 'pdf', 'txt']
   * });
   *
   * // Check if there are more results
   * if (contentResults.hasMore) {
   *   console.log(`Found ${contentResults.totalMatches} total matches`);
   *   console.log(`Use nextPageToken to fetch more results`);
   * }
   * ```
   *
   * @param query - The search query string. Can be a simple term, phrase, or provider-specific
   *                advanced query syntax.
   * @param options - Optional search configuration parameters.
   * @returns A Promise that resolves to a FileSearchResultSet containing matching files.
   * @throws UnsupportedOperationError if the provider doesn't support search operations.
   */
  public abstract SearchFiles(query: string, options?: FileSearchOptions): Promise<FileSearchResultSet>;
}
