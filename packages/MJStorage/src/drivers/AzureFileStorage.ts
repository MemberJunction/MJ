import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  AccountSASSignatureValues,
  BlobClient,
  BlobGenerateSasUrlOptions,
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateAccountSASQueryParameters,
} from '@azure/storage-blob';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import * as mime from 'mime-types';
import {
  CreatePreAuthUploadUrlPayload,
  FileSearchOptions,
  FileSearchResultSet,
  FileStorageBase,
  GetObjectParams,
  GetObjectMetadataParams,
  StorageListResult,
  StorageObjectMetadata,
  StorageProviderConfig,
} from '../generic/FileStorageBase';
import { getProviderConfig } from '../config';

/**
 * Azure Blob Storage implementation of the FileStorageBase interface.
 *
 * This class provides methods for interacting with Azure Blob Storage as a file storage provider.
 * It implements all the abstract methods defined in FileStorageBase and handles Azure-specific
 * authentication, authorization, and file operations.
 *
 * It requires the following environment variables to be set:
 * - STORAGE_AZURE_CONTAINER: The name of the Azure Storage container
 * - STORAGE_AZURE_ACCOUNT_NAME: The Azure Storage account name
 * - STORAGE_AZURE_ACCOUNT_KEY: The Azure Storage account key
 *
 * @example
 * ```typescript
 * // Create an instance of AzureFileStorage
 * const azureStorage = new AzureFileStorage();
 *
 * // Generate a pre-authenticated upload URL
 * const { UploadUrl } = await azureStorage.CreatePreAuthUploadUrl('documents/report.pdf');
 *
 * // Generate a pre-authenticated download URL
 * const downloadUrl = await azureStorage.CreatePreAuthDownloadUrl('documents/report.pdf');
 *
 * // List files in a directory
 * const files = await azureStorage.ListObjects('documents/');
 * ```
 */
@RegisterClass(FileStorageBase, 'Azure Blob Storage')
export class AzureFileStorage extends FileStorageBase {
  /** The name of this storage provider, used in error messages */
  protected readonly providerName = 'Azure Blob Storage';

  /** Azure Storage SharedKeyCredential for authentication */
  private _sharedKeyCredential: StorageSharedKeyCredential;

  /** The Azure Storage container name */
  private _container: string;

  /** The Azure Storage account name */
  private _azureAccountName: string;

  /** ContainerClient for the specified container */
  private _containerClient: ContainerClient;

  /** BlobServiceClient for the Azure Storage account */
  private _blobServiceClient: BlobServiceClient;

  /**
   * Creates a new instance of AzureFileStorage.
   *
   * Initializes the connection to Azure Blob Storage using environment variables.
   * Throws an error if any required environment variables are missing.
   */
  constructor() {
    super();

    // Try to get config from centralized configuration
    const config = getProviderConfig('azure');

    // Extract values from config, fall back to env vars
    this._container = config?.defaultContainer || env.get('STORAGE_AZURE_CONTAINER').required().asString();
    this._azureAccountName = config?.accountName || env.get('STORAGE_AZURE_ACCOUNT_NAME').required().asString();
    const accountKey = config?.accountKey || env.get('STORAGE_AZURE_ACCOUNT_KEY').required().asString();

    this._sharedKeyCredential = new StorageSharedKeyCredential(this._azureAccountName, accountKey);

    const blobServiceUrl = `https://${this._azureAccountName}.blob.core.windows.net`;
    this._blobServiceClient = new BlobServiceClient(blobServiceUrl, this._sharedKeyCredential);

    this._containerClient = this._blobServiceClient.getContainerClient(this._container);
  }

  /**
   * Initialize Azure Blob Storage provider.
   *
   * **Always call this method** after creating an instance.
   *
   * @example Simple Deployment (Environment Variables)
   * const storage = new AzureFileStorage(); // Constructor loads env vars
   * await storage.initialize(); // No config - uses env vars
   * await storage.ListObjects('/');
   *
   * @example Multi-Tenant (Database Credentials)
   * const storage = new AzureFileStorage();
   * await storage.initialize({
   *   accountId: '12345',
   *   accountName: 'Azure Account',
   *   accountName: 'myaccount',
   *   accountKey: '...',
   *   defaultContainer: 'my-container'
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
    const azureConfig = config as any;
    if (azureConfig.defaultContainer) {
      this._container = azureConfig.defaultContainer;
    }
    if (azureConfig.accountName) {
      this._azureAccountName = azureConfig.accountName;
    }
    if (azureConfig.accountKey) {
      this._sharedKeyCredential = new StorageSharedKeyCredential(this._azureAccountName, azureConfig.accountKey);
      const blobServiceUrl = `https://${this._azureAccountName}.blob.core.windows.net`;
      this._blobServiceClient = new BlobServiceClient(blobServiceUrl, this._sharedKeyCredential);
      this._containerClient = this._blobServiceClient.getContainerClient(this._container);
    }
  }

  /**
   * Checks if Azure Blob provider is properly configured.
   * Returns true if account name, account key, and container name are present.
   * Logs detailed error messages if configuration is incomplete.
   */
  public get IsConfigured(): boolean {
    const hasAccountName = !!this._azureAccountName;
    const hasContainer = !!this._container;
    const hasCredential = !!this._sharedKeyCredential;

    const isConfigured = hasAccountName && hasContainer && hasCredential;

    if (!isConfigured) {
      const missing: string[] = [];
      if (!hasAccountName) missing.push('Account Name');
      if (!hasContainer) missing.push('Container');
      if (!hasCredential) missing.push('Account Key');

      console.error(
        `❌ Azure Blob Storage provider not configured. Missing: ${missing.join(', ')}\n\n` +
        `Configuration Options:\n\n` +
        `Option 1: Environment Variables\n` +
        `  export STORAGE_AZURE_ACCOUNT_NAME="myaccount"\n` +
        `  export STORAGE_AZURE_ACCOUNT_KEY="..."\n` +
        `  export STORAGE_AZURE_CONTAINER="my-container"\n` +
        `  const storage = new AzureFileStorage();\n` +
        `  await storage.initialize(); // No config needed\n\n` +
        `Option 2: Database Credentials (Multi-Tenant)\n` +
        `  const storage = new AzureFileStorage();\n` +
        `  await storage.initialize({\n` +
        `    accountId: "...",\n` +
        `    accountName: "myaccount",\n` +
        `    accountKey: "...",\n` +
        `    defaultContainer: "my-container"\n` +
        `  });\n`
      );
    }

    return isConfigured;
  }

  /**
   * Creates a BlobClient for the specified object.
   *
   * This is a helper method used internally to get a BlobClient instance
   * for a specific blob (file) in the container.
   *
   * @param objectName - The name of the blob for which to create a client
   * @returns A BlobClient instance for the specified blob
   * @private
   */
  private _getBlobClient(objectName: string): BlobClient {
    return this._containerClient.getBlobClient(objectName);
  }

  /**
   * Normalizes a directory path to ensure it ends with a slash.
   *
   * This is a helper method used internally to ensure consistency in
   * directory path representation. Azure Blob Storage doesn't have actual
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
   * Creates a pre-authenticated upload URL for a blob in Azure Blob Storage.
   *
   * This method generates a Shared Access Signature (SAS) URL that allows
   * for uploading a blob without needing the Azure Storage account credentials.
   * The URL is valid for 10 minutes and can only be used for writing the specified blob.
   *
   * @param objectName - The name of the blob to upload (including any path/directory)
   * @returns A Promise resolving to an object with the upload URL
   *
   * @example
   * ```typescript
   * // Generate a pre-authenticated upload URL for a PDF file
   * const { UploadUrl } = await azureStorage.CreatePreAuthUploadUrl('documents/report.pdf');
   *
   * // The URL can be used with tools like curl to upload the file
   * // curl -H "x-ms-blob-type: BlockBlob" --upload-file report.pdf --url "https://accountname.blob.core.windows.net/container/documents/report.pdf?sastoken"
   * console.log(UploadUrl);
   * ```
   */
  public CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    const now = new Date();
    const sasOptions: AccountSASSignatureValues = {
      services: AccountSASServices.parse('b').toString(), // blobs
      resourceTypes: AccountSASResourceTypes.parse('o').toString(), // object
      permissions: AccountSASPermissions.parse('w'), // write-only permissions
      protocol: SASProtocol.Https,
      startsOn: new Date(now.valueOf() - 60 * 1000), // now minus 1 minute
      expiresOn: new Date(now.valueOf() + 10 * 60 * 1000), // 10 minutes from now
    };

    // Using the SAS url to upload e.g.
    // curl -H "x-ms-blob-type: BlockBlob" --upload-file 1236.txt --url "https://bccdpfiles.blob.core.windows.net/ca-temp/1236.txt?sv=2023-11-03&ss=btqf&srt=sco&spr=https&st=2024-03-18T15%3A59%3A19Z&se=2024-03-18T16%3A09%3A19Z&sp=rwdlacupi&sig=Vu68WUzRmVDsTLXpFvRUKiZVQgjWtds1FFiRDXiwtug%3D"

    const sasToken = generateAccountSASQueryParameters(sasOptions, this._sharedKeyCredential).toString();
    const queryString = sasToken[0] === '?' ? sasToken : `?${sasToken}`;
    const UploadUrl = `https://${this._azureAccountName}.blob.core.windows.net/${this._container}/${objectName}${queryString}`;

    return Promise.resolve({ UploadUrl });
  }

  /**
   * Creates a pre-authenticated download URL for a blob in Azure Blob Storage.
   *
   * This method generates a Shared Access Signature (SAS) URL that allows
   * for downloading a blob without needing the Azure Storage account credentials.
   * The URL is valid for 10 minutes and can only be used for reading the specified blob.
   *
   * @param objectName - The name of the blob to download (including any path/directory)
   * @returns A Promise resolving to the download URL
   *
   * @example
   * ```typescript
   * // Generate a pre-authenticated download URL for a PDF file
   * const downloadUrl = await azureStorage.CreatePreAuthDownloadUrl('documents/report.pdf');
   *
   * // The URL can be shared with users or used in applications for direct download
   * console.log(downloadUrl);
   * ```
   */
  public CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    const now = new Date();
    const sasOptions: AccountSASSignatureValues = {
      services: AccountSASServices.parse('b').toString(), // blobs
      resourceTypes: AccountSASResourceTypes.parse('o').toString(), // object
      permissions: AccountSASPermissions.parse('r'), // read-only permissions
      protocol: SASProtocol.Https,
      startsOn: new Date(now.valueOf() - 60 * 1000), // now minus 1 minute
      expiresOn: new Date(now.valueOf() + 10 * 60 * 1000), // 10 minutes from now
    };

    const sasToken = generateAccountSASQueryParameters(sasOptions, this._sharedKeyCredential).toString();
    const queryString = sasToken[0] === '?' ? sasToken : `?${sasToken}`;
    const url = `https://${this._azureAccountName}.blob.core.windows.net/${this._container}/${objectName}${queryString}`;

    return Promise.resolve(url);
  }

  /**
   * Moves a blob from one location to another within Azure Blob Storage.
   *
   * Since Azure Blob Storage doesn't provide a native move operation,
   * this method implements move as a copy followed by a delete operation.
   * It first copies the blob to the new location, and if successful,
   * deletes the blob from the original location.
   *
   * @param oldObjectName - The current name/path of the blob
   * @param newObjectName - The new name/path for the blob
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Move a file from drafts to published folder
   * const success = await azureStorage.MoveObject(
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
      // Reuse CopyObject and DeleteObject for moving
      const copied = await this.CopyObject(oldObjectName, newObjectName);
      if (copied) {
        return this.DeleteObject(oldObjectName);
      }
      return false;
    } catch (error) {
      console.error('Error moving object in Azure Blob Storage', { oldObjectName, newObjectName });
      console.error(error);
      return false;
    }
  }

  /**
   * Deletes a blob from Azure Blob Storage.
   *
   * This method attempts to delete the specified blob if it exists.
   * It returns true if the blob was successfully deleted or if it didn't exist.
   *
   * @param objectName - The name of the blob to delete (including any path/directory)
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Delete a temporary file
   * const deleted = await azureStorage.DeleteObject('temp/report-draft.pdf');
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
      const blobClient = this._getBlobClient(objectName);
      const { succeeded } = await blobClient.deleteIfExists();
      return succeeded;
    } catch (error) {
      console.error('Error deleting object from Azure Blob Storage', { objectName });
      console.error(error);
      return false;
    }
  }

  /**
   * Lists blobs with the specified prefix in Azure Blob Storage.
   *
   * This method returns a list of blobs (files) and virtual directories under the
   * specified path prefix. Since Azure Blob Storage doesn't have actual directories,
   * this method simulates directory structure by looking at blob names with common
   * prefixes and using the delimiter to identify "directory" paths.
   *
   * @param prefix - The path prefix to list blobs from (e.g., 'documents/')
   * @param delimiter - The character used to simulate directory structure, defaults to '/'
   * @returns A Promise resolving to a StorageListResult containing objects and prefixes
   *
   * @example
   * ```typescript
   * // List all files and directories in the documents folder
   * const result = await azureStorage.ListObjects('documents/');
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
      // Azure doesn't support real directories, so we need to mimic the behavior
      const objects: StorageObjectMetadata[] = [];
      const prefixes = new Set<string>();

      // List all blobs under the prefix
      const listOptions = {
        prefix: prefix,
      };

      // Get all blobs
      for await (const blob of this._containerClient.listBlobsFlat(listOptions)) {
        const blobName = blob.name;

        // Skip the directory placeholder blob itself
        if (blobName === prefix) continue;

        // Extract "directory" from path if using delimiter
        if (delimiter) {
          const pathAfterPrefix = blobName.slice(prefix.length);
          const delimiterIndex = pathAfterPrefix.indexOf(delimiter);

          // If there's a delimiter after the prefix, this is a "directory"
          if (delimiterIndex !== -1) {
            const directoryPath = prefix + pathAfterPrefix.substring(0, delimiterIndex + 1);
            prefixes.add(directoryPath);
            continue; // Skip adding as an object
          }
        }

        // Get the last part of the path as the name
        const pathParts = blobName.split('/');
        const name = pathParts[pathParts.length - 1];

        // Calculate the path
        const path = pathParts.slice(0, -1).join('/');

        objects.push({
          name,
          path,
          fullPath: blobName,
          size: blob.properties.contentLength || 0,
          contentType: blob.properties.contentType || mime.lookup(blobName) || 'application/octet-stream',
          lastModified: blob.properties.lastModified || new Date(),
          isDirectory: blobName.endsWith('/'),
          etag: blob.properties.etag,
        });
      }

      return {
        objects,
        prefixes: Array.from(prefixes),
      };
    } catch (error) {
      console.error('Error listing objects in Azure Blob Storage', { prefix });
      console.error(error);
      return { objects: [], prefixes: [] };
    }
  }

  /**
   * Creates a directory (virtual) in Azure Blob Storage.
   *
   * Since Azure Blob Storage doesn't have a native directory concept,
   * this method creates a zero-byte blob with a trailing slash to
   * simulate a directory. The blob has a special content type to
   * indicate it's a directory.
   *
   * @param directoryPath - The path of the directory to create
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Create a new directory structure
   * const created = await azureStorage.CreateDirectory('documents/reports/annual/');
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
      // Azure Blob Storage doesn't have real directories
      // We create a zero-byte blob with a trailing slash to represent a directory
      directoryPath = this._normalizeDirectoryPath(directoryPath);

      const blobClient = this._getBlobClient(directoryPath);
      const blockBlobClient = blobClient.getBlockBlobClient();
      // Using proper typing for Azure's upload method
      await blockBlobClient.upload(Buffer.from('').valueOf(), 0, {
        blobHTTPHeaders: {
          blobContentType: 'application/x-directory',
        },
      });
      return true;
    } catch (error) {
      console.error('Error creating directory in Azure Blob Storage', { directoryPath });
      console.error(error);
      return false;
    }
  }

  /**
   * Deletes a directory (virtual) and optionally its contents from Azure Blob Storage.
   *
   * For non-recursive deletion, this method simply deletes the directory placeholder blob.
   * For recursive deletion, it lists all blobs with the directory path as prefix
   * and deletes them all, including the directory placeholder.
   *
   * @param directoryPath - The path of the directory to delete
   * @param recursive - If true, deletes all contents recursively (default: false)
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Delete an empty directory
   * const deleted = await azureStorage.DeleteDirectory('documents/temp/');
   *
   * // Delete a directory and all its contents
   * const recursivelyDeleted = await azureStorage.DeleteDirectory('documents/old_projects/', true);
   * ```
   */
  public async DeleteDirectory(directoryPath: string, recursive = false): Promise<boolean> {
    try {
      directoryPath = this._normalizeDirectoryPath(directoryPath);

      if (!recursive) {
        // Just delete the directory placeholder
        return this.DeleteObject(directoryPath);
      }

      // For recursive delete, list all blobs under this directory and delete them
      const blobsToDelete = [];

      // List all blobs under the prefix
      const listOptions = {
        prefix: directoryPath,
      };

      // Get all blobs to delete
      for await (const blob of this._containerClient.listBlobsFlat(listOptions)) {
        blobsToDelete.push(this._containerClient.getBlobClient(blob.name).delete());
      }

      // Delete all the blobs concurrently
      await Promise.all(blobsToDelete);

      return true;
    } catch (error) {
      console.error('Error deleting directory from Azure Blob Storage', { directoryPath, recursive });
      console.error(error);
      return false;
    }
  }

  /**
   * Retrieves metadata for a specific blob in Azure Blob Storage.
   *
   * This method fetches the properties of a blob without downloading its content,
   * which is more efficient for checking file attributes like size, content type,
   * and last modified date.
   *
   * @param params - Object identifier (objectId and fullPath are equivalent for Azure Blob)
   * @returns A Promise resolving to a StorageObjectMetadata object
   * @throws Error if the blob doesn't exist or cannot be accessed
   *
   * @example
   * ```typescript
   * try {
   *   // For Azure Blob, objectId and fullPath are the same (both are the blob name)
   *   const metadata = await azureStorage.GetObjectMetadata({ fullPath: 'documents/report.pdf' });
   *   // Or equivalently:
   *   const metadata2 = await azureStorage.GetObjectMetadata({ objectId: 'documents/report.pdf' });
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

    // For Azure Blob, objectId and fullPath are the same (both are the blob name/path)
    const objectName = params.objectId || params.fullPath!;

    try {
      const blobClient = this._getBlobClient(objectName);
      const properties = await blobClient.getProperties();

      const pathParts = objectName.split('/');
      const name = pathParts[pathParts.length - 1];
      const path = pathParts.slice(0, -1).join('/');

      return {
        name,
        path,
        fullPath: objectName,
        size: properties.contentLength || 0,
        contentType: properties.contentType || mime.lookup(objectName) || 'application/octet-stream',
        lastModified: properties.lastModified || new Date(),
        isDirectory: objectName.endsWith('/'),
        etag: properties.etag,
        cacheControl: properties.cacheControl,
        customMetadata: properties.metadata,
      };
    } catch (error) {
      console.error('Error getting object metadata from Azure Blob Storage', { objectName });
      console.error(error);
      throw new Error(`Object not found: ${params.objectId || params.fullPath}`);
    }
  }

  /**
   * Downloads a blob's content from Azure Blob Storage.
   *
   * This method retrieves the full content of a blob and returns it as a Buffer
   * for processing in memory.
   *
   * @param params - Object identifier (objectId and fullPath are equivalent for Azure Blob)
   * @returns A Promise resolving to a Buffer containing the blob's data
   * @throws Error if the blob doesn't exist or cannot be downloaded
   *
   * @example
   * ```typescript
   * try {
   *   // For Azure Blob, objectId and fullPath are the same (both are the blob name)
   *   const content = await azureStorage.GetObject({ fullPath: 'documents/config.json' });
   *   // Or equivalently:
   *   const content2 = await azureStorage.GetObject({ objectId: 'documents/config.json' });
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

    // For Azure Blob, objectId and fullPath are the same (both are the blob name/path)
    const objectName = params.objectId || params.fullPath!;

    try {
      const blobClient = this._getBlobClient(objectName);
      const downloadResponse = await blobClient.download();

      if (!downloadResponse.readableStreamBody) {
        throw new Error(`Empty response body for object: ${objectName}`);
      }

      // Read the stream into a buffer
      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk, 'utf8')); // or appropriate encoding
        } else {
          chunks.push(chunk); // already a Buffer
        }
      }

      return Buffer.concat(chunks as unknown as Uint8Array[]);
    } catch (error) {
      console.error('Error getting object from Azure Blob Storage', { objectName });
      console.error(error);
      throw new Error(`Failed to get object: ${params.objectId || params.fullPath}`);
    }
  }

  /**
   * Uploads data to a blob in Azure Blob Storage.
   *
   * This method directly uploads a Buffer of data to a blob with the specified name.
   * It's useful for server-side operations where you already have the data in memory.
   *
   * @param objectName - The name to assign to the uploaded blob
   * @param data - The Buffer containing the data to upload
   * @param contentType - Optional MIME type for the blob (inferred from name if not provided)
   * @param metadata - Optional key-value pairs of custom metadata to associate with the blob
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Upload a text file
   * const content = Buffer.from('Hello, World!', 'utf8');
   * const uploaded = await azureStorage.PutObject(
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
      const blobClient = this._getBlobClient(objectName);
      const blockBlobClient = blobClient.getBlockBlobClient();

      // Determine content type based on file extension if not provided
      const effectiveContentType = contentType || mime.lookup(objectName) || 'application/octet-stream';

      // Convert buffer to correct type for Azure SDK
      await blockBlobClient.upload(data instanceof Buffer ? data.valueOf() : data, data.length, {
        blobHTTPHeaders: {
          blobContentType: effectiveContentType,
        },
        metadata,
      });

      return true;
    } catch (error) {
      console.error('Error putting object to Azure Blob Storage', { objectName });
      console.error(error);
      return false;
    }
  }

  /**
   * Copies a blob within Azure Blob Storage.
   *
   * This method creates a copy of a blob at a new location without removing the original.
   * It uses a SAS URL to provide the source blob access for the copy operation.
   *
   * @param sourceObjectName - The name of the blob to copy
   * @param destinationObjectName - The name to assign to the copied blob
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Create a backup copy of an important file
   * const copied = await azureStorage.CopyObject(
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
      const sourceBlobClient = this._getBlobClient(sourceObjectName);
      const destinationBlobClient = this._getBlobClient(destinationObjectName);

      // Generate SAS URL for source blob
      const sasOptions: BlobGenerateSasUrlOptions = {
        permissions: BlobSASPermissions.parse('r'), // read-only permissions
        expiresOn: new Date(new Date().valueOf() + 10 * 60 * 1000), // 10 minutes
        protocol: SASProtocol.Https,
      };

      const sasUrl = await sourceBlobClient.generateSasUrl(sasOptions);

      // Copy the blob
      const copyResult = await destinationBlobClient.syncCopyFromURL(sasUrl);
      return copyResult.copyStatus === 'success';
    } catch (error) {
      console.error('Error copying object in Azure Blob Storage', { sourceObjectName, destinationObjectName });
      console.error(error);
      return false;
    }
  }

  /**
   * Checks if a blob exists in Azure Blob Storage.
   *
   * This method verifies the existence of a blob without downloading its content,
   * which is efficient for validation purposes.
   *
   * @param objectName - The name of the blob to check
   * @returns A Promise resolving to a boolean indicating if the blob exists
   *
   * @example
   * ```typescript
   * // Check if a file exists before attempting to use it
   * const exists = await azureStorage.ObjectExists('documents/report.pdf');
   *
   * if (exists) {
   *   console.log('File exists, proceeding with download');
   *   const content = await azureStorage.GetObject('documents/report.pdf');
   *   // Process the content...
   * } else {
   *   console.log('File does not exist');
   * }
   * ```
   */
  public async ObjectExists(objectName: string): Promise<boolean> {
    try {
      const blobClient = this._getBlobClient(objectName);
      return await blobClient.exists();
    } catch (error) {
      console.error('Error checking if object exists in Azure Blob Storage', { objectName });
      console.error(error);
      return false;
    }
  }

  /**
   * Checks if a directory (virtual) exists in Azure Blob Storage.
   *
   * Since Azure Blob Storage doesn't have a native directory concept,
   * this method checks for either:
   * 1. The existence of a directory placeholder blob (zero-byte blob with trailing slash)
   * 2. The existence of any blobs with the directory path as a prefix
   *
   * @param directoryPath - The path of the directory to check
   * @returns A Promise resolving to a boolean indicating if the directory exists
   *
   * @example
   * ```typescript
   * // Check if a directory exists before trying to save files to it
   * const exists = await azureStorage.DirectoryExists('documents/reports/');
   *
   * if (!exists) {
   *   console.log('Directory does not exist, creating it first');
   *   await azureStorage.CreateDirectory('documents/reports/');
   * }
   *
   * // Now safe to use the directory
   * await azureStorage.PutObject('documents/reports/new-report.pdf', fileData);
   * ```
   */
  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    try {
      directoryPath = this._normalizeDirectoryPath(directoryPath);

      // Method 1: Check if the directory placeholder exists
      const placeholderExists = await this.ObjectExists(directoryPath);
      if (placeholderExists) {
        return true;
      }

      // Method 2: Check if any objects exist with this prefix
      const listOptions = {
        prefix: directoryPath,
        maxPageSize: 1,
      };

      // Get just one blob to check if any exist
      const iterator = this._containerClient.listBlobsFlat(listOptions);
      const response = await iterator.next();

      return !response.done;
    } catch (error) {
      console.error('Error checking if directory exists in Azure Blob Storage', { directoryPath });
      console.error(error);
      return false;
    }
  }

  /**
   * Search is not supported by Azure Blob Storage.
   * Blob Storage is an object storage service without built-in search capabilities.
   *
   * To search Azure Blob Storage objects, consider:
   * - Using Azure Cognitive Search to index blob content
   * - Maintaining a separate search index (Azure Search, Elasticsearch, etc.)
   * - Using blob metadata and tags for filtering with ListObjects
   * - Using Azure Data Lake Analytics for complex queries
   *
   * @param query - The search query (not used)
   * @param options - Search options (not used)
   * @throws UnsupportedOperationError always
   */
  public async SearchFiles(query: string, options?: FileSearchOptions): Promise<FileSearchResultSet> {
    this.throwUnsupportedOperationError('SearchFiles');
  }
}
