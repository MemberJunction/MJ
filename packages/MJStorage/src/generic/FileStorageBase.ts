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
 */
export abstract class FileStorageBase {
  /**
   * The name of this storage provider, used in error messages and logging.
   * Each implementation must define this property with a descriptive name.
   */
  protected abstract readonly providerName: string;
  
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
   * @param objectName - The name of the object to retrieve metadata for.
   * @returns A Promise that resolves to a StorageObjectMetadata object containing the metadata.
   *          If the object does not exist, the promise will be rejected.
   */
  public abstract GetObjectMetadata(objectName: string): Promise<StorageObjectMetadata>;

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
   * @param objectName - The name of the object to download.
   * @returns A Promise that resolves to a Buffer containing the object's data.
   *          If the object does not exist, the promise will be rejected.
   */
  public abstract GetObject(objectName: string): Promise<Buffer>;

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
  public abstract PutObject(
    objectName: string, 
    data: Buffer, 
    contentType?: string, 
    metadata?: Record<string, string>
  ): Promise<boolean>;

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
   * Optional initialization method for storage providers that require async setup.
   * 
   * This method can be overridden by subclasses that need to perform async initialization
   * after construction, such as setting up access tokens, establishing connections,
   * or verifying permissions.
   * 
   * The default implementation does nothing and resolves immediately. Storage provider
   * implementations should override this method if they need to perform async setup.
   * 
   * @example
   * ```typescript
   * // In a specific provider implementation:
   * public async initialize(): Promise<void> {
   *   // Set up OAuth tokens or other async initialization
   *   await this.refreshAccessToken();
   *   await this.verifyBucketAccess();
   * }
   * 
   * // Usage:
   * const storage = new MyStorageProvider();
   * await storage.initialize();
   * // Now the provider is ready to use
   * ```
   * 
   * @returns A Promise that resolves when initialization is complete.
   */
  public async initialize(): Promise<void> {
    // Default implementation does nothing
  }
}