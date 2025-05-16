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
        include_media_info: false
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
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    // Dropbox doesn't support pre-signed URLs for uploads in the same way as S3
    // Use PutObject method for uploads instead
    this.throwUnsupportedOperationError('CreatePreAuthUploadUrl');
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
        autorename: false
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
   * Gets metadata for a file or folder
   * 
   * This method retrieves metadata information about a file or folder, such as
   * its name, size, content type, and last modified date.
   * 
   * @param objectName - Path to the object to get metadata for (e.g., 'documents/report.pdf')
   * @returns A Promise that resolves to a StorageObjectMetadata object
   * @throws Error if the object doesn't exist or cannot be accessed
   * 
   * @example
   * ```typescript
   * try {
   *   // Get metadata for a file
   *   const metadata = await storage.GetObjectMetadata('presentations/quarterly-update.pptx');
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
   * Downloads a file's contents
   * 
   * This method retrieves the raw content of a file as a Buffer.
   * 
   * @param objectName - Path to the file to download (e.g., 'documents/report.pdf')
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
   *   // Download a text file
   *   const fileContent = await storage.GetObject('documents/notes.txt');
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
        autorename: false
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