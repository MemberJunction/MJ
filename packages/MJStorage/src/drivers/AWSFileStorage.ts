import { 
  CopyObjectCommand, 
  DeleteObjectCommand, 
  DeleteObjectsCommand, 
  GetObjectCommand, 
  HeadObjectCommand, 
  ListObjectsV2Command, 
  PutObjectCommand, 
  S3Client 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import * as mime from 'mime-types';
import { 
  CreatePreAuthUploadUrlPayload, 
  FileStorageBase, 
  StorageListResult, 
  StorageObjectMetadata 
} from '../generic/FileStorageBase';

@RegisterClass(FileStorageBase, 'AWS S3 Storage')
export class AWSFileStorage extends FileStorageBase {
  protected readonly providerName = 'AWS S3';
  private _bucket: string;
  private _keyPrefix: string;
  private _client: S3Client;

  constructor() {
    super();

    const region = env.get('STORAGE_AWS_REGION').required().asString();
    this._bucket = env.get('STORAGE_AWS_BUCKET_NAME').required().asString();

    const keyPrefix = env.get('STORAGE_AWS_KEY_PREFIX').default('/').asString();
    this._keyPrefix = keyPrefix.endsWith('/') ? keyPrefix : `${keyPrefix}/`;

    const credentials = {
      accessKeyId: env.get('STORAGE_AWS_ACCESS_KEY_ID').required().asString(),
      secretAccessKey: env.get('STORAGE_AWS_SECRET_ACCESS_KEY').required().asString(),
    };

    this._client = new S3Client({ region, credentials });
  }

  /**
   * Normalizes the object name by ensuring it has the proper key prefix
   * 
   * @param objectName The object name to normalize
   * @returns The normalized object name with the proper prefix
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
   * Removes the prefix from a key to get the relative object name
   * 
   * @param key The full key including the prefix
   * @returns The object name without the prefix
   */
  private _removePrefix(key: string): string {
    if (key.startsWith(this._keyPrefix)) {
      return key.substring(this._keyPrefix.length);
    }
    return key;
  }

  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    const key = this._normalizeKey(objectName);
    
    // Determine content type based on file extension
    const contentType = mime.lookup(objectName) || 'application/octet-stream';
    
    const command = new PutObjectCommand({ 
      Bucket: this._bucket, 
      Key: key,
      ContentType: contentType
    });

    const UploadUrl = await getSignedUrl(this._client, command, { expiresIn: 10 * 60 }); // 10 minutes
    return Promise.resolve({ UploadUrl });
  }

  public CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    const key = this._normalizeKey(objectName);
    const command = new GetObjectCommand({ Bucket: this._bucket, Key: key });

    return getSignedUrl(this._client, command, { expiresIn: 10 * 60 }); // 10 minutes
  }

  public async MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean> {
    return this.CopyObject(oldObjectName, newObjectName)
      .then(copied => {
        if (copied) {
          return this.DeleteObject(oldObjectName);
        }
        return false;
      });
  }

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

  public async ListObjects(prefix: string, delimiter = '/'): Promise<StorageListResult> {
    const normalizedPrefix = this._normalizeKey(prefix);
    
    const command = new ListObjectsV2Command({
      Bucket: this._bucket,
      Prefix: normalizedPrefix,
      Delimiter: delimiter
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
            etag: item.ETag
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
      ContentType: 'application/x-directory'
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
        Prefix: key
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
          Objects: response.Contents
            .filter(item => item.Key)
            .map(item => ({ Key: item.Key! }))
        }
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

  public async GetObjectMetadata(objectName: string): Promise<StorageObjectMetadata> {
    const key = this._normalizeKey(objectName);
    const command = new HeadObjectCommand({
      Bucket: this._bucket,
      Key: key
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
        customMetadata: response.Metadata
      };
    } catch (e) {
      console.error('Error getting object metadata from S3 storage', { key, bucket: this._bucket });
      console.error(e);
      throw new Error(`Object not found: ${objectName}`);
    }
  }

  public async GetObject(objectName: string): Promise<Buffer> {
    const key = this._normalizeKey(objectName);
    const command = new GetObjectCommand({
      Bucket: this._bucket,
      Key: key
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
      throw new Error(`Failed to get object: ${objectName}`);
    }
  }

  public async PutObject(
    objectName: string, 
    data: Buffer, 
    contentType?: string, 
    metadata?: Record<string, string>
  ): Promise<boolean> {
    const key = this._normalizeKey(objectName);
    
    // Determine content type based on file extension if not provided
    const effectiveContentType = contentType || mime.lookup(objectName) || 'application/octet-stream';
    
    const command = new PutObjectCommand({
      Bucket: this._bucket,
      Key: key,
      Body: data,
      ContentType: effectiveContentType,
      Metadata: metadata
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
        bucket: this._bucket
      });
      console.error(e);
      return false;
    }
  }

  public async ObjectExists(objectName: string): Promise<boolean> {
    const key = this._normalizeKey(objectName);
    const command = new HeadObjectCommand({
      Bucket: this._bucket,
      Key: key
    });

    try {
      await this._client.send(command);
      return true;
    } catch (e) {
      // If the object doesn't exist, HeadObject will throw an error
      return false;
    }
  }

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
      MaxKeys: 1
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
}
