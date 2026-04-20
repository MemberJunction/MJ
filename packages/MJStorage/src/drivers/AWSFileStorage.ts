import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RegisterClass } from '@memberjunction/global';
import env from 'env-var';
import mime from 'mime-types';
import {
  CreatePreAuthUploadUrlPayload,
  FileSearchOptions,
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
 * Configuration interface for AWS S3 file storage.
 * Extends StorageProviderConfig to include accountId and accountName.
 */
interface AWSS3Config extends StorageProviderConfig {
  region?: string;
  accessKeyID?: string;
  secretAccessKey?: string;
  defaultBucket?: string;
  keyPrefix?: string;
}

/**
 * AWS S3 implementation of the FileStorageBase interface.
 *
 * This class provides methods for interacting with Amazon S3 as a file storage provider.
 * It implements all the abstract methods defined in FileStorageBase and handles AWS-specific
 * authentication, authorization, and file operations.
 *
 * It requires the following environment variables to be set:
 * - STORAGE_AWS_REGION: The AWS region (e.g., 'us-east-1')
 * - STORAGE_AWS_BUCKET_NAME: The S3 bucket name
 * - STORAGE_AWS_ACCESS_KEY_ID: The AWS access key ID
 * - STORAGE_AWS_SECRET_ACCESS_KEY: The AWS secret access key
 * - STORAGE_AWS_KEY_PREFIX: (Optional) Prefix for all object keys, defaults to '/'
 *
 * @example
 * ```typescript
 * // Create an instance of AWSFileStorage
 * const s3Storage = new AWSFileStorage();
 *
 * // Generate a pre-authenticated upload URL
 * const { UploadUrl } = await s3Storage.CreatePreAuthUploadUrl('documents/report.pdf');
 *
 * // Generate a pre-authenticated download URL
 * const downloadUrl = await s3Storage.CreatePreAuthDownloadUrl('documents/report.pdf');
 *
 * // List files in a directory
 * const files = await s3Storage.ListObjects('documents/');
 * ```
 */
@RegisterClass(FileStorageBase, 'AWS S3 Storage')
export class AWSFileStorage extends FileStorageBase {
  /** The name of this storage provider, used in error messages */
  protected readonly providerName = 'AWS S3';

  /** The S3 bucket name */
  private _bucket: string;

  /** The key prefix to prepend to all object keys */
  private _keyPrefix: string;

  /** The S3 client instance */
  private _client: S3Client;

  /** AWS access key ID */
  private _accessKeyId: string;

  /** AWS secret access key */
  private _secretAccessKey: string;

  /** S3 bucket name (for IsConfigured check) */
  private _bucketName: string;

  /**
   * Creates a new instance of AWSFileStorage.
   *
   * Initializes the connection to AWS S3 using environment variables.
   * Throws an error if any required environment variables are missing.
   */
  constructor() {
    super();

    // Try to get config from centralized configuration
    const config = getProviderConfig('aws');

    // Extract values from config, fall back to env vars
    const region = config?.region || env.get('STORAGE_AWS_REGION').required().asString();
    this._bucket = config?.defaultBucket || env.get('STORAGE_AWS_BUCKET_NAME').required().asString();
    this._bucketName = this._bucket;

    const keyPrefix = config?.keyPrefix || env.get('STORAGE_AWS_KEY_PREFIX').default('/').asString();
    this._keyPrefix = keyPrefix.endsWith('/') ? keyPrefix : `${keyPrefix}/`;

    this._accessKeyId = config?.accessKeyID || env.get('STORAGE_AWS_ACCESS_KEY_ID').required().asString();
    this._secretAccessKey = config?.secretAccessKey || env.get('STORAGE_AWS_SECRET_ACCESS_KEY').required().asString();

    const credentials = {
      accessKeyId: this._accessKeyId,
      secretAccessKey: this._secretAccessKey,
    };

    this._client = new S3Client({ region, credentials });
  }

  /**
   * Initialize AWS S3 storage provider.
   *
   * **Always call this method** after creating an instance.
   *
   * @example Simple Deployment (Environment Variables)
   * ```typescript
   * const storage = new AWSFileStorage(); // Constructor loads env vars
   * await storage.initialize(); // No config - uses env vars
   * await storage.ListObjects('/');
   * ```
   *
   * @example Multi-Tenant (Database Credentials)
   * ```typescript
   * const storage = new AWSFileStorage();
   * await storage.initialize({
   *   accountId: '12345',
   *   accountName: 'AWS Account',
   *   accessKeyID: '...',     // From database
   *   secretAccessKey: '...',
   *   region: 'us-east-1',
   *   defaultBucket: 'bucket'
   * });
   * await storage.ListObjects('/');
   * ```
   *
   * @param config - Optional. Omit to use env vars, provide to override with database creds.
   */
  public async initialize(config?: AWSS3Config): Promise<void> {
    // Always call super to store accountId and accountName
    await super.initialize(config);

    if (!config) {
      return; // Nothing to do, constructor already handled config from env/file
    }

    // Update configuration with provided values
    const region = config.region || (this._client.config.region as string);
    this._accessKeyId = config.accessKeyID || this._accessKeyId;
    this._secretAccessKey = config.secretAccessKey || this._secretAccessKey;
    this._bucketName = config.defaultBucket || this._bucketName;
    this._bucket = this._bucketName;

    if (config.keyPrefix) {
      this._keyPrefix = config.keyPrefix.endsWith('/') ? config.keyPrefix : `${config.keyPrefix}/`;
    }

    // Reinitialize the S3 client with new credentials
    const credentials = {
      accessKeyId: this._accessKeyId,
      secretAccessKey: this._secretAccessKey,
    };

    this._client = new S3Client({ region, credentials });
  }

  /**
   * Checks if AWS S3 provider is properly configured.
   * Returns true if access credentials and bucket name are present.
   * Logs detailed error messages if configuration is incomplete.
   */
  public get IsConfigured(): boolean {
    const hasAccessKey = !!this._accessKeyId;
    const hasSecretKey = !!this._secretAccessKey;
    const hasBucket = !!this._bucketName;
    const hasRegion = !!this._client?.config?.region;

    const isConfigured = hasAccessKey && hasSecretKey && hasBucket && hasRegion;

    if (!isConfigured) {
      const missing: string[] = [];
      if (!hasAccessKey) missing.push('Access Key ID');
      if (!hasSecretKey) missing.push('Secret Access Key');
      if (!hasBucket) missing.push('Bucket Name');
      if (!hasRegion) missing.push('Region');

      console.error(
        `❌ AWS S3 provider not configured. Missing: ${missing.join(', ')}\n\n` +
        `Configuration Options:\n\n` +
        `Option 1: Environment Variables\n` +
        `  export STORAGE_AWS_ACCESS_KEY_ID="AKIA..."\n` +
        `  export STORAGE_AWS_SECRET_ACCESS_KEY="..."\n` +
        `  export STORAGE_AWS_BUCKET_NAME="my-bucket"\n` +
        `  export STORAGE_AWS_REGION="us-east-1"\n` +
        `  const storage = new AWSFileStorage();\n` +
        `  await storage.initialize(); // No config needed\n\n` +
        `Option 2: Database Credentials (Multi-Tenant)\n` +
        `  const storage = new AWSFileStorage();\n` +
        `  await storage.initialize({\n` +
        `    accountId: "...",\n` +
        `    accessKeyID: "...",\n` +
        `    secretAccessKey: "...",\n` +
        `    region: "us-east-1",\n` +
        `    defaultBucket: "my-bucket"\n` +
        `  });\n`
      );
    }

    return isConfigured;
  }

  /**
   * Normalizes the object name by ensuring it has the proper key prefix.
   *
   * This is a helper method used internally to ensure all object keys have
   * the configured prefix. It handles cases where the object name already
   * includes the prefix or has leading slashes.
   *
   * @param objectName - The object name to normalize
   * @returns The normalized object name with the proper prefix
   * @private
   */
  private _normalizeKey(objectName: string): string {
    if (objectName.startsWith(this._keyPrefix)) {
      return objectName;
    }

    // Remove any leading slash from the object name to avoid double slashes
    const cleanObjectName = objectName.startsWith('/') ? objectName.substring(1) : objectName;
    return `${this._keyPrefix}${cleanObjectName}`;
  }

  /**
   * Removes the prefix from a key to get the relative object name.
   *
   * This is a helper method used internally to convert a full S3 key
   * (including the prefix) back to the relative object name that
   * clients will recognize.
   *
   * @param key - The full key including the prefix
   * @returns The object name without the prefix
   * @private
   */
  private _removePrefix(key: string): string {
    if (key.startsWith(this._keyPrefix)) {
      return key.substring(this._keyPrefix.length);
    }
    return key;
  }

  /**
   * Creates a pre-authenticated upload URL for an object in S3.
   *
   * This method generates a pre-signed URL that allows for uploading
   * an object to S3 without needing AWS credentials. The URL is valid
   * for 10 minutes and includes the content type based on the file extension.
   *
   * @param objectName - The name of the object to upload (including any path/directory)
   * @returns A Promise resolving to an object with the upload URL
   *
   * @example
   * ```typescript
   * // Generate a pre-authenticated upload URL for a PDF file
   * const { UploadUrl } = await s3Storage.CreatePreAuthUploadUrl('documents/report.pdf');
   *
   * // The URL can be used with fetch or other HTTP clients to upload the file
   * console.log(UploadUrl);
   * ```
   */
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    const key = this._normalizeKey(objectName);

    // Determine content type based on file extension
    const contentType = mime.lookup(objectName) || 'application/octet-stream';

    const command = new PutObjectCommand({
      Bucket: this._bucket,
      Key: key,
      ContentType: contentType,
    });

    const UploadUrl = await getSignedUrl(this._client, command, { expiresIn: 10 * 60 }); // 10 minutes
    return Promise.resolve({ UploadUrl });
  }

  /**
   * Creates a pre-authenticated download URL for an object in S3.
   *
   * This method generates a pre-signed URL that allows for downloading
   * an object from S3 without needing AWS credentials. The URL is valid
   * for 10 minutes and can be shared with clients.
   *
   * @param objectName - The name of the object to download (including any path/directory)
   * @returns A Promise resolving to the download URL
   *
   * @example
   * ```typescript
   * // Generate a pre-authenticated download URL for a PDF file
   * const downloadUrl = await s3Storage.CreatePreAuthDownloadUrl('documents/report.pdf');
   *
   * // The URL can be shared with users or used in applications for direct download
   * console.log(downloadUrl);
   * ```
   */
  public CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    const key = this._normalizeKey(objectName);
    const command = new GetObjectCommand({ Bucket: this._bucket, Key: key });

    return getSignedUrl(this._client, command, { expiresIn: 10 * 60 }); // 10 minutes
  }

  /**
   * Moves an object from one location to another within S3.
   *
   * Since S3 doesn't provide a native move operation, this method
   * implements move as a copy followed by a delete operation.
   * It first copies the object to the new location, and if successful,
   * deletes the object from the original location.
   *
   * @param oldObjectName - The current name/path of the object
   * @param newObjectName - The new name/path for the object
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Move a file from drafts to published folder
   * const success = await s3Storage.MoveObject(
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
    return this.CopyObject(oldObjectName, newObjectName).then((copied) => {
      if (copied) {
        return this.DeleteObject(oldObjectName);
      }
      return false;
    });
  }

  /**
   * Deletes an object from S3.
   *
   * This method attempts to delete the specified object. It returns true
   * if the operation was successful, false otherwise.
   *
   * @param objectName - The name of the object to delete (including any path/directory)
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Delete a temporary file
   * const deleted = await s3Storage.DeleteObject('temp/report-draft.pdf');
   *
   * if (deleted) {
   *   console.log('File successfully deleted');
   * } else {
   *   console.log('Failed to delete file');
   * }
   * ```
   */
  public async DeleteObject(objectName: string): Promise<boolean> {
    const key = this._normalizeKey(objectName);
    const command = new DeleteObjectCommand({ Bucket: this._bucket, Key: key });
    try {
      await this._client.send(command);
      return true;
    } catch (e) {
      console.error('Error deleting object from S3 storage', { key, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Lists objects with the specified prefix in S3.
   *
   * This method returns a list of objects (files) and common prefixes (directories)
   * under the specified path prefix. It uses the S3 ListObjectsV2 API which supports
   * delimiter-based hierarchy simulation.
   *
   * @param prefix - The path prefix to list objects from (e.g., 'documents/')
   * @param delimiter - The character used to simulate directory structure, defaults to '/'
   * @returns A Promise resolving to a StorageListResult containing objects and prefixes
   *
   * @example
   * ```typescript
   * // List all files and directories in the documents folder
   * const result = await s3Storage.ListObjects('documents/');
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
    const normalizedPrefix = this._normalizeKey(prefix);

    const command = new ListObjectsV2Command({
      Bucket: this._bucket,
      Prefix: normalizedPrefix,
      Delimiter: delimiter,
    });

    try {
      const response = await this._client.send(command);

      const objects: StorageObjectMetadata[] = [];
      const prefixes: string[] = [];

      // Process regular objects
      if (response.Contents) {
        for (const item of response.Contents) {
          if (!item.Key) continue;

          // Skip the directory placeholder object itself
          if (item.Key === normalizedPrefix) continue;

          const relativePath = this._removePrefix(item.Key);
          const pathParts = relativePath.split('/');
          const name = pathParts[pathParts.length - 1];
          const path = pathParts.slice(0, -1).join('/');

          objects.push({
            name,
            path,
            fullPath: relativePath,
            size: item.Size || 0,
            contentType: mime.lookup(item.Key) || 'application/octet-stream',
            lastModified: item.LastModified || new Date(),
            isDirectory: item.Key.endsWith('/'),
            etag: item.ETag,
          });
        }
      }

      // Process prefixes (directories)
      if (response.CommonPrefixes) {
        for (const item of response.CommonPrefixes) {
          if (item.Prefix) {
            const relativePrefix = this._removePrefix(item.Prefix);
            prefixes.push(relativePrefix);
          }
        }
      }

      return { objects, prefixes };
    } catch (e) {
      console.error('Error listing objects in S3 storage', { prefix: normalizedPrefix, bucket: this._bucket });
      console.error(e);
      return { objects: [], prefixes: [] };
    }
  }

  /**
   * Creates a directory (virtual) in S3.
   *
   * Since S3 doesn't have a native directory concept, this method creates
   * a zero-byte object with a trailing slash to simulate a directory.
   * The object has a special content type to indicate it's a directory.
   *
   * @param directoryPath - The path of the directory to create
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Create a new directory structure
   * const created = await s3Storage.CreateDirectory('documents/reports/annual/');
   *
   * if (created) {
   *   console.log('Directory created successfully');
   * } else {
   *   console.log('Failed to create directory');
   * }
   * ```
   */
  public async CreateDirectory(directoryPath: string): Promise<boolean> {
    // S3 doesn't have real directories, so we create a zero-byte object with a trailing slash
    if (!directoryPath.endsWith('/')) {
      directoryPath = `${directoryPath}/`;
    }

    const key = this._normalizeKey(directoryPath);
    const command = new PutObjectCommand({
      Bucket: this._bucket,
      Key: key,
      Body: '',
      ContentType: 'application/x-directory',
    });

    try {
      await this._client.send(command);
      return true;
    } catch (e) {
      console.error('Error creating directory in S3 storage', { key, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Deletes a directory (virtual) and optionally its contents from S3.
   *
   * For non-recursive deletion, this method simply deletes the directory
   * placeholder object. For recursive deletion, it lists all objects with
   * the directory path as prefix and deletes them using the DeleteObjects API,
   * which allows for deleting up to 1000 objects in a single request.
   *
   * Note: This implementation doesn't handle pagination for directories with
   * more than 1000 objects. In a production environment, you might want to
   * enhance this to handle such cases.
   *
   * @param directoryPath - The path of the directory to delete
   * @param recursive - If true, deletes all contents recursively (default: false)
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Delete an empty directory
   * const deleted = await s3Storage.DeleteDirectory('documents/temp/');
   *
   * // Delete a directory and all its contents
   * const recursivelyDeleted = await s3Storage.DeleteDirectory('documents/old_projects/', true);
   * ```
   */
  public async DeleteDirectory(directoryPath: string, recursive = false): Promise<boolean> {
    if (!directoryPath.endsWith('/')) {
      directoryPath = `${directoryPath}/`;
    }

    const key = this._normalizeKey(directoryPath);

    if (!recursive) {
      // Just delete the directory placeholder
      return this.DeleteObject(directoryPath);
    }

    // For recursive delete, we need to list all objects under this prefix and delete them
    try {
      const command = new ListObjectsV2Command({
        Bucket: this._bucket,
        Prefix: key,
      });

      const response = await this._client.send(command);

      if (!response.Contents || response.Contents.length === 0) {
        // Empty directory, just delete the directory placeholder
        return this.DeleteObject(directoryPath);
      }

      // Delete up to 1000 objects at a time (S3 limit)
      const deleteObjectsCommand = new DeleteObjectsCommand({
        Bucket: this._bucket,
        Delete: {
          Objects: response.Contents.filter((item) => item.Key).map((item) => ({ Key: item.Key! })),
        },
      });

      await this._client.send(deleteObjectsCommand);

      // If we have more than 1000 objects, we'll need pagination, but that's beyond this implementation
      // For a real-world implementation, you'd want to handle pagination for directories with more than 1000 objects

      return true;
    } catch (e) {
      console.error('Error deleting directory recursively from S3 storage', { key, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Retrieves metadata for a specific object in S3.
   *
   * This method fetches the properties of an object using the HeadObject API,
   * which doesn't download the object content. This is more efficient for
   * checking file attributes like size, content type, and last modified date.
   *
   * @param params - Object identifier (objectId and fullPath are equivalent for S3)
   * @returns A Promise resolving to a StorageObjectMetadata object
   * @throws Error if the object doesn't exist or cannot be accessed
   *
   * @example
   * ```typescript
   * try {
   *   // For S3, objectId and fullPath are the same (both are the S3 key)
   *   const metadata = await s3Storage.GetObjectMetadata({ fullPath: 'documents/report.pdf' });
   *   // Or equivalently:
   *   const metadata2 = await s3Storage.GetObjectMetadata({ objectId: 'documents/report.pdf' });
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

    // For S3, objectId and fullPath are the same (both are the key/path)
    const objectName = params.objectId || params.fullPath!;
    const key = this._normalizeKey(objectName);
    const command = new HeadObjectCommand({
      Bucket: this._bucket,
      Key: key,
    });

    try {
      const response = await this._client.send(command);

      const relativePath = this._removePrefix(key);
      const pathParts = relativePath.split('/');
      const name = pathParts[pathParts.length - 1];
      const path = pathParts.slice(0, -1).join('/');

      return {
        name,
        path,
        fullPath: relativePath,
        size: response.ContentLength || 0,
        contentType: response.ContentType || 'application/octet-stream',
        lastModified: response.LastModified || new Date(),
        isDirectory: key.endsWith('/'),
        etag: response.ETag,
        cacheControl: response.CacheControl,
        customMetadata: response.Metadata,
      };
    } catch (e) {
      console.error('Error getting object metadata from S3 storage', { key, bucket: this._bucket });
      console.error(e);
      throw new Error(`Object not found: ${params.objectId || params.fullPath}`);
    }
  }

  /**
   * Downloads an object's content from S3.
   *
   * This method retrieves the full content of an object using the GetObject API
   * and returns it as a Buffer for processing in memory.
   *
   * @param params - Object identifier (objectId and fullPath are equivalent for S3)
   * @returns A Promise resolving to a Buffer containing the object's data
   * @throws Error if the object doesn't exist or cannot be downloaded
   *
   * @example
   * ```typescript
   * try {
   *   // For S3, objectId and fullPath are the same (both are the S3 key)
   *   const content = await s3Storage.GetObject({ fullPath: 'documents/config.json' });
   *   // Or equivalently:
   *   const content2 = await s3Storage.GetObject({ objectId: 'documents/config.json' });
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

    // For S3, objectId and fullPath are the same (both are the key/path)
    const objectName = params.objectId || params.fullPath!;
    const key = this._normalizeKey(objectName);
    const command = new GetObjectCommand({
      Bucket: this._bucket,
      Key: key,
    });

    try {
      const response = await this._client.send(command);

      if (!response.Body) {
        throw new Error(`Empty response body for object: ${objectName}`);
      }

      // Convert readable stream to buffer
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (e) {
      console.error('Error getting object from S3 storage', { key, bucket: this._bucket });
      console.error(e);
      throw new Error(`Failed to get object: ${params.objectId || params.fullPath}`);
    }
  }

  /**
   * Uploads data to an object in S3.
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
   * const uploaded = await s3Storage.PutObject(
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
    const key = this._normalizeKey(objectName);

    // Determine content type based on file extension if not provided
    const effectiveContentType = contentType || mime.lookup(objectName) || 'application/octet-stream';

    const command = new PutObjectCommand({
      Bucket: this._bucket,
      Key: key,
      Body: data,
      ContentType: effectiveContentType,
      Metadata: metadata,
    });

    try {
      await this._client.send(command);
      return true;
    } catch (e) {
      console.error('Error putting object to S3 storage', { key, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Copies an object within S3.
   *
   * This method creates a copy of an object at a new location without removing the original.
   * It uses the CopyObject API, which allows for copying objects within the same bucket.
   *
   * @param sourceObjectName - The name of the object to copy
   * @param destinationObjectName - The name to assign to the copied object
   * @returns A Promise resolving to a boolean indicating success
   *
   * @example
   * ```typescript
   * // Create a backup copy of an important file
   * const copied = await s3Storage.CopyObject(
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
    const sourceKey = this._normalizeKey(sourceObjectName);
    const destinationKey = this._normalizeKey(destinationObjectName);

    const copyCommand = new CopyObjectCommand({
      Bucket: this._bucket,
      CopySource: `/${this._bucket}/${sourceKey}`,
      Key: destinationKey,
    });

    try {
      await this._client.send(copyCommand);
      return true;
    } catch (e) {
      console.error('Error copying object in S3 storage', {
        sourceKey,
        destinationKey,
        bucket: this._bucket,
      });
      console.error(e);
      return false;
    }
  }

  /**
   * Checks if an object exists in S3.
   *
   * This method verifies the existence of an object using the HeadObject API,
   * which doesn't download the object content. This is efficient for validation purposes.
   *
   * @param objectName - The name of the object to check
   * @returns A Promise resolving to a boolean indicating if the object exists
   *
   * @example
   * ```typescript
   * // Check if a file exists before attempting to use it
   * const exists = await s3Storage.ObjectExists('documents/report.pdf');
   *
   * if (exists) {
   *   console.log('File exists, proceeding with download');
   *   const content = await s3Storage.GetObject('documents/report.pdf');
   *   // Process the content...
   * } else {
   *   console.log('File does not exist');
   * }
   * ```
   */
  public async ObjectExists(objectName: string): Promise<boolean> {
    const key = this._normalizeKey(objectName);
    const command = new HeadObjectCommand({
      Bucket: this._bucket,
      Key: key,
    });

    try {
      await this._client.send(command);
      return true;
    } catch (e) {
      // If the object doesn't exist, HeadObject will throw an error
      return false;
    }
  }

  /**
   * Checks if a directory (virtual) exists in S3.
   *
   * Since S3 doesn't have a native directory concept, this method checks for either:
   * 1. The existence of a directory placeholder object (zero-byte object with trailing slash)
   * 2. The existence of any objects with the directory path as a prefix
   *
   * @param directoryPath - The path of the directory to check
   * @returns A Promise resolving to a boolean indicating if the directory exists
   *
   * @example
   * ```typescript
   * // Check if a directory exists before trying to save files to it
   * const exists = await s3Storage.DirectoryExists('documents/reports/');
   *
   * if (!exists) {
   *   console.log('Directory does not exist, creating it first');
   *   await s3Storage.CreateDirectory('documents/reports/');
   * }
   *
   * // Now safe to use the directory
   * await s3Storage.PutObject('documents/reports/new-report.pdf', fileData);
   * ```
   */
  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    if (!directoryPath.endsWith('/')) {
      directoryPath = `${directoryPath}/`;
    }

    const key = this._normalizeKey(directoryPath);

    // Method 1: Check if the directory placeholder exists
    const placeholderExists = await this.ObjectExists(directoryPath);
    if (placeholderExists) {
      return true;
    }

    // Method 2: Check if any objects exist with this prefix
    const command = new ListObjectsV2Command({
      Bucket: this._bucket,
      Prefix: key,
      MaxKeys: 1,
    });

    try {
      const response = await this._client.send(command);
      return !!(response.Contents && response.Contents.length > 0);
    } catch (e) {
      console.error('Error checking if directory exists in S3 storage', { key, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  /**
   * Search is not supported by AWS S3.
   * S3 is an object storage service without built-in search capabilities.
   *
   * To search S3 objects, consider:
   * - Using AWS Athena to query S3 data
   * - Maintaining a separate search index (Elasticsearch, OpenSearch, etc.)
   * - Using S3 Select for querying individual objects
   * - Using S3 Inventory for listing and filtering objects
   *
   * @param query - The search query (not used)
   * @param options - Search options (not used)
   * @throws UnsupportedOperationError always
   */
  public async SearchFiles(query: string, options?: FileSearchOptions): Promise<FileSearchResultSet> {
    this.throwUnsupportedOperationError('SearchFiles');
  }
}
