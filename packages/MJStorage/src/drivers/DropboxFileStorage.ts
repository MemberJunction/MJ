import { Dropbox } from 'dropbox';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import * as mime from 'mime-types';
import { 
  CreatePreAuthUploadUrlPayload, 
  FileStorageBase, 
  StorageListResult, 
  StorageObjectMetadata 
} from '../generic/FileStorageBase';

@RegisterClass(FileStorageBase, 'Dropbox Storage')
export class DropboxFileStorage extends FileStorageBase {
  protected readonly providerName = 'Dropbox';
  private _client: Dropbox;
  private _rootPath: string;

  constructor() {
    super();
    
    // Dropbox auth can be via access token or refresh token
    const accessToken = env.get('STORAGE_DROPBOX_ACCESS_TOKEN').asString();
    const refreshToken = env.get('STORAGE_DROPBOX_REFRESH_TOKEN').asString();
    const appKey = env.get('STORAGE_DROPBOX_APP_KEY').asString();
    const appSecret = env.get('STORAGE_DROPBOX_APP_SECRET').asString();
    
    if (accessToken) {
      // Use access token directly
      this._client = new Dropbox({ accessToken });
    } else if (refreshToken && appKey && appSecret) {
      // Use refresh token with app credentials
      this._client = new Dropbox({
        refreshToken,
        clientId: appKey,
        clientSecret: appSecret
      });
    } else {
      throw new Error('Dropbox storage requires either STORAGE_DROPBOX_ACCESS_TOKEN or STORAGE_DROPBOX_REFRESH_TOKEN with APP_KEY and APP_SECRET');
    }
    
    // Root path, optional (defaults to empty which is root)
    this._rootPath = env.get('STORAGE_DROPBOX_ROOT_PATH').default('').asString();
    
    // Ensure root path starts with / if not empty
    if (this._rootPath && !this._rootPath.startsWith('/')) {
      this._rootPath = '/' + this._rootPath;
    }
  }
  
  /**
   * Normalize a path to be compatible with Dropbox API
   */
  private _normalizePath(path: string): string {
    // Combine root path with the given path
    let fullPath = path;
    if (this._rootPath) {
      fullPath = path ? 
        (path.startsWith('/') ? this._rootPath + path : this._rootPath + '/' + path) : 
        this._rootPath;
    } else if (!fullPath.startsWith('/') && fullPath !== '') {
      fullPath = '/' + fullPath;
    }
    
    // For root, Dropbox uses empty string instead of "/"
    if (fullPath === '/') {
      return '';
    }
    
    return fullPath;
  }
  
  /**
   * Get metadata for a file or folder
   */
  private async _getMetadata(path: string): Promise<any> {
    const normalizedPath = this._normalizePath(path);
    
    try {
      const response = await this._client.filesGetMetadata({
        path: normalizedPath,
        include_media_info: false
      });
      
      return response.result;
    } catch (error) {
      throw new Error(`Item not found: ${path} (${error.message})`);
    }
  }
  
  /**
   * Converts a Dropbox file/folder to StorageObjectMetadata
   */
  private _convertToMetadata(item: any, parentPath: string = ''): StorageObjectMetadata {
    const isDirectory = item['.tag'] === 'folder';
    const name = item.name;
    
    // Extract path from item.path_display
    let path = '';
    if (item.path_display) {
      // Remove file name from path
      const pathParts = item.path_display.split('/');
      pathParts.pop();
      path = pathParts.join('/');
      
      // Remove root path if present
      if (this._rootPath && path.startsWith(this._rootPath)) {
        path = path.substring(this._rootPath.length);
      }
      
      // Remove leading slash
      if (path.startsWith('/')) {
        path = path.substring(1);
      }
    }
    
    // Use parentPath if provided
    if (parentPath) {
      path = parentPath;
    }
    
    // Construct full path
    const fullPath = path ? `${path}/${name}` : name;
    
    return {
      name,
      path,
      fullPath,
      size: isDirectory ? 0 : (item.size || 0),
      contentType: isDirectory ? 
        'application/x-directory' : 
        (mime.lookup(name) || 'application/octet-stream'),
      lastModified: isDirectory ? new Date() : new Date(item.server_modified || Date.now()),
      isDirectory,
      customMetadata: {
        id: item.id,
        rev: item.rev
      }
    };
  }
  
  /**
   * Dropbox doesn't support pre-auth upload URLs directly
   */
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    // Dropbox doesn't support pre-signed URLs for uploads in the same way as S3
    // Use PutObject method for uploads instead
    this.throwUnsupportedOperationError('CreatePreAuthUploadUrl');
  }
  
  /**
   * Create a pre-authenticated download URL
   */
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    try {
      const normalizedPath = this._normalizePath(objectName);
      
      // Create a temporary download link
      const response = await this._client.filesGetTemporaryLink({
        path: normalizedPath
      });
      
      return response.result.link;
    } catch (error) {
      console.error('Error creating pre-auth download URL', { objectName, error });
      throw new Error(`Failed to create download URL for: ${objectName}`);
    }
  }
  
  /**
   * Move an object
   */
  public async MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean> {
    try {
      const fromPath = this._normalizePath(oldObjectName);
      const toPath = this._normalizePath(newObjectName);
      
      await this._client.filesMoveV2({
        from_path: fromPath,
        to_path: toPath,
        autorename: false
      });
      
      return true;
    } catch (error) {
      console.error('Error moving object', { oldObjectName, newObjectName, error });
      return false;
    }
  }
  
  /**
   * Delete an object
   */
  public async DeleteObject(objectName: string): Promise<boolean> {
    try {
      const normalizedPath = this._normalizePath(objectName);
      
      await this._client.filesDeleteV2({
        path: normalizedPath
      });
      
      return true;
    } catch (error) {
      // If the path doesn't exist, consider it success for idempotency
      if (error.status === 409 && error.error?.error?.['.tag'] === 'path_lookup') {
        return true;
      }
      
      console.error('Error deleting object', { objectName, error });
      return false;
    }
  }
  
  /**
   * List objects in a directory
   */
  public async ListObjects(prefix: string, delimiter = '/'): Promise<StorageListResult> {
    try {
      const normalizedPath = this._normalizePath(prefix);
      
      const response = await this._client.filesListFolder({
        path: normalizedPath,
        recursive: false,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false
      });
      
      const objects: StorageObjectMetadata[] = [];
      const prefixes: string[] = [];
      
      // Process entries
      for (const entry of response.result.entries) {
        objects.push(this._convertToMetadata(entry, prefix));
        
        // If it's a folder, add to prefixes
        if (entry['.tag'] === 'folder') {
          const folderPath = prefix 
            ? (prefix.endsWith('/') ? `${prefix}${entry.name}` : `${prefix}/${entry.name}`) 
            : entry.name;
            
          prefixes.push(`${folderPath}/`);
        }
      }
      
      return { objects, prefixes };
    } catch (error) {
      console.error('Error listing objects', { prefix, error });
      return { objects: [], prefixes: [] };
    }
  }
  
  /**
   * Create a directory
   */
  public async CreateDirectory(directoryPath: string): Promise<boolean> {
    try {
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/') 
        ? this._normalizePath(directoryPath.substring(0, directoryPath.length - 1)) 
        : this._normalizePath(directoryPath);
      
      await this._client.filesCreateFolderV2({
        path: normalizedPath,
        autorename: false
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
   * Delete a directory
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
          recursive: false
        });
        
        if (listing.result.entries.length > 0) {
          throw new Error('Directory is not empty');
        }
      }
      
      await this._client.filesDeleteV2({
        path: normalizedPath
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
   * Get object metadata
   */
  public async GetObjectMetadata(objectName: string): Promise<StorageObjectMetadata> {
    try {
      const metadata = await this._getMetadata(objectName);
      
      // Parse path to get parent path
      const pathParts = objectName.split('/');
      pathParts.pop(); // Remove filename/foldername
      const parentPath = pathParts.join('/');
      
      return this._convertToMetadata(metadata, parentPath);
    } catch (error) {
      console.error('Error getting object metadata', { objectName, error });
      throw new Error(`Object not found: ${objectName}`);
    }
  }
  
  /**
   * Get an object's contents
   */
  public async GetObject(objectName: string): Promise<Buffer> {
    try {
      const normalizedPath = this._normalizePath(objectName);
      
      const response = await this._client.filesDownload({
        path: normalizedPath
      });
      
      // Extract file content as Buffer
      // Note: In Dropbox SDK, the file content is in response.result.fileBinary
      return Buffer.from((response.result as any).fileBinary);
    } catch (error) {
      console.error('Error getting object', { objectName, error });
      throw new Error(`Failed to get object: ${objectName}`);
    }
  }
  
  /**
   * Upload an object
   */
  public async PutObject(
    objectName: string, 
    data: Buffer, 
    contentType?: string, 
    metadata?: Record<string, string>
  ): Promise<boolean> {
    try {
      const normalizedPath = this._normalizePath(objectName);
      
      // For smaller files (<150MB), use simple upload
      if (data.length < 150 * 1024 * 1024) {
        await this._client.filesUpload({
          path: normalizedPath,
          contents: data,
          mode: { '.tag': 'overwrite' },
          autorename: false,
          mute: true
        });
      } else {
        // For larger files, use session upload
        const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
        
        // Start upload session
        const sessionStart = await this._client.filesUploadSessionStart({
          close: false,
          contents: data.slice(0, CHUNK_SIZE)
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
                offset: offset
              },
              commit: {
                path: normalizedPath,
                mode: { '.tag': 'overwrite' },
                autorename: false,
                mute: true
              },
              contents: chunk
            });
          } else {
            // Append chunk to session
            await this._client.filesUploadSessionAppendV2({
              cursor: {
                session_id: sessionId,
                offset: offset
              },
              close: false,
              contents: chunk
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
   * Copy an object
   */
  public async CopyObject(sourceObjectName: string, destinationObjectName: string): Promise<boolean> {
    try {
      const fromPath = this._normalizePath(sourceObjectName);
      const toPath = this._normalizePath(destinationObjectName);
      
      await this._client.filesCopyV2({
        from_path: fromPath,
        to_path: toPath,
        autorename: false
      });
      
      return true;
    } catch (error) {
      console.error('Error copying object', { sourceObjectName, destinationObjectName, error });
      return false;
    }
  }
  
  /**
   * Check if an object exists
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
   * Check if a directory exists
   */
  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    try {
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/') 
        ? directoryPath.substring(0, directoryPath.length - 1) 
        : directoryPath;
      
      const item = await this._getMetadata(normalizedPath);
      return item['.tag'] === 'folder';
    } catch (error) {
      return false;
    }
  }
}