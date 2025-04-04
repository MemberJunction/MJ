import { GetSignedUrlConfig, Storage } from '@google-cloud/storage';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import * as mime from 'mime-types';
import { 
  CreatePreAuthUploadUrlPayload, 
  FileStorageBase, 
  StorageListResult, 
  StorageObjectMetadata 
} from '../generic/FileStorageBase';

@RegisterClass(FileStorageBase, 'Google Cloud Storage')
export class GoogleFileStorage extends FileStorageBase {
  protected readonly providerName = 'Google Cloud Storage';
  private _bucket: string;
  private _client: Storage;

  constructor() {
    super();
    const credentials = env.get('STORAGE_GOOGLE_KEY_JSON').required().asJsonObject();
    this._client = new Storage({ credentials });
    this._bucket = env.get('STORAGE_GOOGLE_BUCKET_NAME').required().asString();
  }

  /**
   * Normalizes directory paths to ensure they end with a slash
   */
  private _normalizeDirectoryPath(path: string): string {
    return path.endsWith('/') ? path : path + '/';
  }
  
  /**
   * Converts metadata to a string map for consistent handling
   */
  private _convertMetadataToStringMap(metadata: any): Record<string, string> {
    if (!metadata) return {};
    
    const result: Record<string, string> = {};
    for (const key in metadata) {
      result[key] = String(metadata[key]);
    }
    return result;
  }

  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    const file = this._client.bucket(this._bucket).file(objectName);
    const options = {
      version: 'v4',
      action: 'write',
      expires: Date.now() + 10 * 60 * 1000, // 10 mins
      contentType: mime.lookup(objectName) || 'application/octet-stream'
    } as const;

    const [UploadUrl] = await file.getSignedUrl(options);

    return { UploadUrl };
  }

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

  public async ListObjects(prefix: string, delimiter = '/'): Promise<StorageListResult> {
    try {
      const options = {
        prefix: prefix,
        delimiter: delimiter
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
          customMetadata: this._convertMetadataToStringMap(metadata.metadata)
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

  public async CreateDirectory(directoryPath: string): Promise<boolean> {
    try {
      directoryPath = this._normalizeDirectoryPath(directoryPath);
      
      // GCS doesn't have real directories, so we create a zero-byte file with the directory name
      const file = this._client.bucket(this._bucket).file(directoryPath);
      await file.save('', {
        metadata: {
          contentType: 'application/x-directory'
        }
      });
      
      return true;
    } catch (e) {
      console.error('Error creating directory in Google storage', { directoryPath, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  public async DeleteDirectory(directoryPath: string, recursive = false): Promise<boolean> {
    try {
      directoryPath = this._normalizeDirectoryPath(directoryPath);
      
      if (!recursive) {
        // Just delete the directory placeholder
        return this.DeleteObject(directoryPath);
      }
      
      // For recursive delete, list all files under this prefix and delete them
      const options = {
        prefix: directoryPath
      };
      
      const [files] = await this._client.bucket(this._bucket).getFiles(options);
      
      // Delete all files concurrently
      const deletePromises = files.map(file => file.delete());
      await Promise.all(deletePromises);
      
      return true;
    } catch (e) {
      console.error('Error deleting directory from Google storage', { directoryPath, recursive, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

  public async GetObjectMetadata(objectName: string): Promise<StorageObjectMetadata> {
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
        customMetadata: this._convertMetadataToStringMap(metadata.metadata)
      };
    } catch (e) {
      console.error('Error getting object metadata from Google storage', { objectName, bucket: this._bucket });
      console.error(e);
      throw new Error(`Object not found: ${objectName}`);
    }
  }

  public async GetObject(objectName: string): Promise<Buffer> {
    try {
      const file = this._client.bucket(this._bucket).file(objectName);
      const [bufferContent] = await file.download();
      return bufferContent;
    } catch (e) {
      console.error('Error getting object from Google storage', { objectName, bucket: this._bucket });
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
    try {
      const file = this._client.bucket(this._bucket).file(objectName);
      
      // Determine content type based on file extension if not provided
      const effectiveContentType = contentType || mime.lookup(objectName) || 'application/octet-stream';
      
      await file.save(data, {
        metadata: {
          contentType: effectiveContentType,
          metadata
        }
      });
      
      return true;
    } catch (e) {
      console.error('Error putting object to Google storage', { objectName, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }

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
        bucket: this._bucket 
      });
      console.error(e);
      return false;
    }
  }

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
        maxResults: 1
      };
      
      const [files] = await this._client.bucket(this._bucket).getFiles(options);
      return files.length > 0;
    } catch (e) {
      console.error('Error checking if directory exists in Google storage', { directoryPath, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }
}
