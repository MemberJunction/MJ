import { google, drive_v3 } from 'googleapis';
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
 * Google Drive implementation of the FileStorageBase interface.
 * 
 * This class provides methods for interacting with Google Drive as a file storage provider.
 * It implements most of the abstract methods defined in FileStorageBase and handles
 * Google Drive-specific authentication, authorization, and file operations.
 * 
 * Unlike other storage providers like S3 or Azure, Google Drive has native concepts of
 * folders and files with hierarchical paths, which makes some operations more natural
 * while others (like pre-authenticated upload URLs) are not directly supported.
 * 
 * It requires one of the following environment variables to be set:
 * - STORAGE_GDRIVE_KEY_FILE: Path to a service account key file with Drive permissions
 * - STORAGE_GDRIVE_CREDENTIALS_JSON: A JSON object containing service account credentials
 * 
 * Optionally, you can set:
 * - STORAGE_GDRIVE_ROOT_FOLDER_ID: ID of a folder to use as the root (for isolation)
 * 
 * @example
 * ```typescript
 * // Create an instance of GoogleDriveFileStorage
 * const driveStorage = new GoogleDriveFileStorage();
 * 
 * // Generate a pre-authenticated download URL
 * const downloadUrl = await driveStorage.CreatePreAuthDownloadUrl('documents/report.pdf');
 * 
 * // List files in a directory
 * const files = await driveStorage.ListObjects('documents/');
 * 
 * // Upload a file directly
 * const uploaded = await driveStorage.PutObject('documents/report.pdf', fileData);
 * ```
 */
@RegisterClass(FileStorageBase, 'Google Drive Storage')
export class GoogleDriveFileStorage extends FileStorageBase {
  /** The name of this storage provider, used in error messages */
  protected readonly providerName = 'Google Drive';
  
  /** The Google Drive API client */
  private _drive: drive_v3.Drive;
  
  /** Optional root folder ID to restrict operations to a specific folder */
  private _rootFolderId?: string;

  /**
   * Creates a new instance of GoogleDriveFileStorage.
   * 
   * Initializes the connection to Google Drive using either a service account 
   * key file or credentials provided directly in environment variables.
   * Throws an error if neither authentication method is properly configured.
   */
  constructor() {
    super();
    
    // Get credentials from environment
    const keyFile = env.get('STORAGE_GDRIVE_KEY_FILE').asString();
    const credentials = env.get('STORAGE_GDRIVE_CREDENTIALS_JSON').asJsonObject();
    
    // Initialize the Google Drive client
    if (keyFile) {
      // Using key file
      const auth = new google.auth.GoogleAuth({
        keyFile,
        scopes: ['https://www.googleapis.com/auth/drive']
      });
      this._drive = google.drive({ version: 'v3', auth });
    } else if (credentials) {
      // Using credentials directly
      const auth = new google.auth.JWT(
        (credentials as any).client_email,
        undefined,
        (credentials as any).private_key,
        ['https://www.googleapis.com/auth/drive']
      );
      this._drive = google.drive({ version: 'v3', auth });
    } else {
      throw new Error('Google Drive storage requires either STORAGE_GDRIVE_KEY_FILE or STORAGE_GDRIVE_CREDENTIALS_JSON to be set');
    }
    
    // Optionally set a root folder ID to restrict operations
    this._rootFolderId = env.get('STORAGE_GDRIVE_ROOT_FOLDER_ID').asString();
  }

  /**
   * Finds a file or folder by path.
   * 
   * This helper method navigates the Google Drive folder structure to find
   * a file or folder at the specified path. It starts from the root (or the
   * configured root folder) and traverses the path components one by one.
   * 
   * @param path - The path to the file or folder to find
   * @returns A Promise resolving to the Google Drive file object
   * @throws Error if the path cannot be found
   * @private
   */
  private async _getItemByPath(path: string): Promise<drive_v3.Schema$File> {
    if (!path || path === '/' || path === '') {
      // Return the root folder or the specified root folder
      return {
        id: this._rootFolderId || 'root',
        name: 'Root',
        mimeType: 'application/vnd.google-apps.folder'
      };
    }
    
    // Split path into parts
    const pathParts = path.split('/').filter(p => p);
    
    // Start with root folder or the specified root folder
    let currentParentId = this._rootFolderId || 'root';
    let currentItem: drive_v3.Schema$File | null = null;
    
    // Navigate through path parts
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isLastPart = i === pathParts.length - 1;
      
      // Query for the item
      const query = isLastPart 
        ? `name = '${part}' and '${currentParentId}' in parents and trashed = false` 
        : `name = '${part}' and '${currentParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      
      const response = await this._drive.files.list({
        q: query,
        fields: 'files(id, name, mimeType, size, modifiedTime, parents)',
        spaces: 'drive'
      });
      
      if (!response.data.files || response.data.files.length === 0) {
        throw new Error(`Path not found: ${path} (at part: ${part})`);
      }
      
      currentItem = response.data.files[0];
      currentParentId = currentItem.id!;
    }
    
    if (!currentItem) {
      throw new Error(`Path not found: ${path}`);
    }
    
    return currentItem;
  }
  
  /**
   * Finds a parent folder by path and creates it if it doesn't exist.
   * 
   * This helper method is used to ensure a folder path exists before
   * creating or moving files. It navigates through each path component,
   * creating folders as needed if they don't exist yet.
   * 
   * @param path - The path to the folder to find or create
   * @returns A Promise resolving to the ID of the folder
   * @private
   */
  private async _getOrCreateParentFolder(path: string): Promise<string> {
    if (!path || path === '/' || path === '') {
      return this._rootFolderId || 'root';
    }
    
    // Split path into parts
    const pathParts = path.split('/').filter(p => p);
    
    // Start with root folder or the specified root folder
    let currentParentId = this._rootFolderId || 'root';
    
    // Navigate through path parts, creating folders as needed
    for (const part of pathParts) {
      // Check if folder exists
      const query = `name = '${part}' and '${currentParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      
      const response = await this._drive.files.list({
        q: query,
        fields: 'files(id)',
        spaces: 'drive'
      });
      
      if (response.data.files && response.data.files.length > 0) {
        // Folder exists, use it
        currentParentId = response.data.files[0].id!;
      } else {
        // Create the folder
        const folderMetadata = {
          name: part,
          mimeType: 'application/vnd.google-apps.folder',
          parents: [currentParentId]
        };
        
        const folder = await this._drive.files.create({
          requestBody: folderMetadata,
          fields: 'id'
        });
        
        currentParentId = folder.data.id!;
      }
    }
    
    return currentParentId;
  }
  
  /**
   * Helper method to convert Google Drive file objects to StorageObjectMetadata.
   * 
   * This method transforms the Google Drive API's file representation into
   * the standardized StorageObjectMetadata format used by the FileStorageBase
   * interface. It handles special properties like folder detection and paths.
   * 
   * @param file - The Google Drive file object to convert
   * @param parentPath - The parent path to use for constructing the full path
   * @returns A StorageObjectMetadata representation of the file
   * @private
   */
  private _fileToMetadata(file: drive_v3.Schema$File, parentPath: string = ''): StorageObjectMetadata {
    const isDirectory = file.mimeType === 'application/vnd.google-apps.folder';
    const fullPath = parentPath ? `${parentPath}/${file.name}` : file.name!;
    
    return {
      name: file.name!,
      path: parentPath,
      fullPath,
      size: parseInt(file.size || '0'),
      contentType: file.mimeType || mime.lookup(file.name!) || 'application/octet-stream',
      lastModified: new Date(file.modifiedTime || Date.now()),
      isDirectory,
      etag: (file as any).etag || undefined,
      customMetadata: {
        fileId: file.id!
      }
    };
  }
  
  /**
   * Creates a pre-authenticated upload URL for an object in Google Drive.
   * 
   * Google Drive doesn't directly support pre-signed upload URLs in the same
   * way as other storage providers like S3 or Azure. Instead, uploads
   * should be performed using the PutObject method.
   * 
   * @param objectName - The name of the object to upload
   * @throws UnsupportedOperationError as this operation is not supported
   */
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    // Google Drive doesn't support pre-signed upload URLs in the same way as S3
    // Instead, use PutObject method for uploads
    this.throwUnsupportedOperationError('CreatePreAuthUploadUrl');
  }
  
  /**
   * Creates a pre-authenticated download URL for an object in Google Drive.
   * 
   * This method creates a temporary, public sharing link for a file that allows
   * anyone with the link to access the file for a limited time (10 minutes).
   * It uses Google Drive's permissions system to create a temporary reader
   * permission for 'anyone' with an expiration time.
   * 
   * @param objectName - The path to the file to download
   * @returns A Promise resolving to the download URL
   * @throws Error if the file cannot be found or the URL creation fails
   * 
   * @example
   * ```typescript
   * // Generate a pre-authenticated download URL for a PDF file
   * const downloadUrl = await driveStorage.CreatePreAuthDownloadUrl('documents/report.pdf');
   * 
   * // The URL can be shared with users or used in applications for direct download
   * console.log(downloadUrl);
   * ```
   */
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    try {
      // Get the file by path
      const file = await this._getItemByPath(objectName);
      
      if (!file.id) {
        throw new Error(`File not found: ${objectName}`);
      }
      
      // Create a temporary web view link
      const permission = await this._drive.permissions.create({
        fileId: file.id,
        requestBody: {
          role: 'reader',
          type: 'anyone',
          expirationTime: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
        }
      });
      
      // Get web view link
      const fileInfo = await this._drive.files.get({
        fileId: file.id,
        fields: 'webViewLink, webContentLink'
      });
      
      // Prefer direct download link if available
      return fileInfo.data.webContentLink || fileInfo.data.webViewLink!;
    } catch (error) {
      console.error('Error creating pre-auth download URL', { objectName, error });
      throw new Error(`Failed to create download URL for: ${objectName}`);
    }
  }
  
  /**
   * Moves an object from one location to another within Google Drive.
   * 
   * This method first locates the file to be moved, then gets or creates the
   * destination folder, and finally updates the file's name and parent folder.
   * Google Drive has native support for moving files between folders.
   * 
   * @param oldObjectName - The current path of the object
   * @param newObjectName - The new path for the object
   * @returns A Promise resolving to a boolean indicating success
   * 
   * @example
   * ```typescript
   * // Move a file from drafts to published folder
   * const success = await driveStorage.MoveObject(
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
      // Get the file to move
      const file = await this._getItemByPath(oldObjectName);
      
      if (!file.id) {
        throw new Error(`File not found: ${oldObjectName}`);
      }
      
      // Parse new path to get parent folder and new name
      const newPathParts = newObjectName.split('/');
      const newName = newPathParts.pop() || '';
      const newParentPath = newPathParts.join('/');
      
      // Get or create the destination folder
      const newParentId = await this._getOrCreateParentFolder(newParentPath);
      
      // Move the file by updating parent and name
      await this._drive.files.update({
        fileId: file.id,
        requestBody: {
          name: newName
        }
      });
      
      // Update parents (remove old parents and add new parent)
      await this._drive.files.update({
        fileId: file.id,
        removeParents: file.parents?.join(','),
        addParents: newParentId,
        fields: 'id, parents'
      });
      
      return true;
    } catch (error) {
      console.error('Error moving object', { oldObjectName, newObjectName, error });
      return false;
    }
  }
  
  /**
   * Deletes an object from Google Drive.
   * 
   * This method locates the specified file by path and deletes it from Google Drive.
   * By default, this moves the file to the trash rather than permanently deleting it,
   * unless your Drive settings are configured for immediate permanent deletion.
   * 
   * @param objectName - The path to the file to delete
   * @returns A Promise resolving to a boolean indicating success
   * 
   * @example
   * ```typescript
   * // Delete a temporary file
   * const deleted = await driveStorage.DeleteObject('temp/report-draft.pdf');
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
      // Get the file to delete
      const file = await this._getItemByPath(objectName);
      
      if (!file.id) {
        // If file doesn't exist, consider it success for idempotency
        return true;
      }
      
      // Delete the file (move to trash)
      await this._drive.files.delete({
        fileId: file.id
      });
      
      return true;
    } catch (error) {
      // If file not found, consider it success
      if (error.code === 404) {
        return true;
      }
      
      console.error('Error deleting object', { objectName, error });
      return false;
    }
  }
  
  /**
   * Lists objects in a directory in Google Drive.
   * 
   * This method retrieves all files and folders directly inside the specified
   * folder path. It handles Google Drive's native folder structure and converts
   * the Drive API responses to the standardized StorageListResult format.
   * 
   * @param prefix - The path to the directory to list
   * @param delimiter - Delimiter character (unused in Google Drive implementation)
   * @returns A Promise resolving to a StorageListResult containing objects and prefixes
   * 
   * @example
   * ```typescript
   * // List all files and directories in the documents folder
   * const result = await driveStorage.ListObjects('documents/');
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
      // Get the folder
      const folder = await this._getItemByPath(prefix);
      
      if (!folder.id) {
        throw new Error(`Folder not found: ${prefix}`);
      }
      
      // List files in the folder
      const response = await this._drive.files.list({
        q: `'${folder.id}' in parents and trashed = false`,
        fields: 'files(id, name, mimeType, size, modifiedTime, parents)',
        spaces: 'drive'
      });
      
      const objects: StorageObjectMetadata[] = [];
      const prefixes: string[] = [];
      
      if (response.data.files && response.data.files.length > 0) {
        for (const file of response.data.files) {
          // Add to objects list
          objects.push(this._fileToMetadata(file, prefix));
          
          // If it's a folder, add to prefixes
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            const folderPath = prefix 
              ? (prefix.endsWith('/') ? `${prefix}${file.name}` : `${prefix}/${file.name}`)
              : file.name!;
              
            prefixes.push(`${folderPath}/`);
          }
        }
      }
      
      return { objects, prefixes };
    } catch (error) {
      console.error('Error listing objects', { prefix, error });
      return { objects: [], prefixes: [] };
    }
  }
  
  /**
   * Creates a directory in Google Drive.
   * 
   * This method creates a folder at the specified path, creating parent
   * folders as needed if they don't exist. Google Drive natively supports
   * folders as a special file type with the 'application/vnd.google-apps.folder'
   * MIME type.
   * 
   * @param directoryPath - The path of the directory to create
   * @returns A Promise resolving to a boolean indicating success
   * 
   * @example
   * ```typescript
   * // Create a new directory structure
   * const created = await driveStorage.CreateDirectory('documents/reports/annual/');
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
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/')
        ? directoryPath.substring(0, directoryPath.length - 1)
        : directoryPath;
      
      // Parse path
      const pathParts = normalizedPath.split('/');
      const folderName = pathParts.pop() || '';
      const parentPath = pathParts.join('/');
      
      // Get parent folder
      const parentId = await this._getOrCreateParentFolder(parentPath);
      
      // Create the folder
      const folderMetadata = {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentId]
      };
      
      await this._drive.files.create({
        requestBody: folderMetadata,
        fields: 'id'
      });
      
      return true;
    } catch (error) {
      console.error('Error creating directory', { directoryPath, error });
      return false;
    }
  }
  
  /**
   * Deletes a directory and optionally its contents from Google Drive.
   * 
   * This method deletes a folder at the specified path. If recursive is false,
   * it will fail if the folder has any contents. If recursive is true, it
   * deletes the folder and all its contents.
   * 
   * @param directoryPath - The path of the directory to delete
   * @param recursive - If true, deletes all contents recursively (default: false)
   * @returns A Promise resolving to a boolean indicating success
   * 
   * @example
   * ```typescript
   * // Delete an empty directory
   * const deleted = await driveStorage.DeleteDirectory('documents/temp/');
   * 
   * // Delete a directory and all its contents
   * const recursivelyDeleted = await driveStorage.DeleteDirectory('documents/old_projects/', true);
   * ```
   */
  public async DeleteDirectory(directoryPath: string, recursive = false): Promise<boolean> {
    try {
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/')
        ? directoryPath.substring(0, directoryPath.length - 1)
        : directoryPath;
      
      // Get the folder
      const folder = await this._getItemByPath(normalizedPath);
      
      if (!folder.id) {
        // If folder doesn't exist, consider it success
        return true;
      }
      
      if (!recursive) {
        // Check if folder is empty
        const response = await this._drive.files.list({
          q: `'${folder.id}' in parents and trashed = false`,
          fields: 'files(id)',
          spaces: 'drive'
        });
        
        if (response.data.files && response.data.files.length > 0) {
          throw new Error('Directory is not empty');
        }
      }
      
      // Delete the folder
      await this._drive.files.delete({
        fileId: folder.id
      });
      
      return true;
    } catch (error) {
      console.error('Error deleting directory', { directoryPath, recursive, error });
      return false;
    }
  }
  
  /**
   * Retrieves metadata for a specific object in Google Drive.
   * 
   * This method fetches the file information without downloading its content,
   * which is more efficient for checking file attributes like size, type,
   * and last modified date.
   * 
   * @param objectName - The path to the file to get metadata for
   * @returns A Promise resolving to a StorageObjectMetadata object
   * @throws Error if the file doesn't exist or cannot be accessed
   * 
   * @example
   * ```typescript
   * try {
   *   const metadata = await driveStorage.GetObjectMetadata('documents/report.pdf');
   *   console.log(`File: ${metadata.name}`);
   *   console.log(`Size: ${metadata.size} bytes`);
   *   console.log(`Last modified: ${metadata.lastModified}`);
   * } catch (error) {
   *   console.error('File does not exist or cannot be accessed');
   * }
   * ```
   */
  public async GetObjectMetadata(objectName: string): Promise<StorageObjectMetadata> {
    try {
      // Get the file
      const file = await this._getItemByPath(objectName);
      
      if (!file.id) {
        throw new Error(`File not found: ${objectName}`);
      }
      
      // Parse path to get parent path
      const pathParts = objectName.split('/');
      pathParts.pop(); // Remove filename
      const parentPath = pathParts.join('/');
      
      return this._fileToMetadata(file, parentPath);
    } catch (error) {
      console.error('Error getting object metadata', { objectName, error });
      throw new Error(`Object not found: ${objectName}`);
    }
  }
  
  /**
   * Downloads an object's content from Google Drive.
   * 
   * This method retrieves the full content of a file and returns it
   * as a Buffer for processing in memory.
   * 
   * @param objectName - The path to the file to download
   * @returns A Promise resolving to a Buffer containing the file's data
   * @throws Error if the file doesn't exist or cannot be downloaded
   * 
   * @example
   * ```typescript
   * try {
   *   const content = await driveStorage.GetObject('documents/config.json');
   *   // Parse the JSON content
   *   const config = JSON.parse(content.toString('utf8'));
   *   console.log('Configuration loaded:', config);
   * } catch (error) {
   *   console.error('Failed to download file:', error.message);
   * }
   * ```
   */
  public async GetObject(objectName: string): Promise<Buffer> {
    try {
      // Get the file
      const file = await this._getItemByPath(objectName);
      
      if (!file.id) {
        throw new Error(`File not found: ${objectName}`);
      }
      
      // Download the file
      const response = await this._drive.files.get({
        fileId: file.id,
        alt: 'media'
      }, {
        responseType: 'arraybuffer'
      });
      
      return Buffer.from(response.data as ArrayBuffer);
    } catch (error) {
      console.error('Error getting object', { objectName, error });
      throw new Error(`Failed to get object: ${objectName}`);
    }
  }
  
  /**
   * Uploads data to an object in Google Drive.
   * 
   * This method directly uploads a Buffer of data to a file with the specified path.
   * It will create any necessary parent folders if they don't exist, and will update
   * the file if it already exists or create a new one if it doesn't.
   * 
   * @param objectName - The path to the file to upload
   * @param data - The Buffer containing the data to upload
   * @param contentType - Optional MIME type for the file (inferred from name if not provided)
   * @param metadata - Optional key-value pairs of custom metadata (not supported in current implementation)
   * @returns A Promise resolving to a boolean indicating success
   * 
   * @example
   * ```typescript
   * // Upload a text file
   * const content = Buffer.from('Hello, World!', 'utf8');
   * const uploaded = await driveStorage.PutObject(
   *   'documents/hello.txt',
   *   content,
   *   'text/plain'
   * );
   * 
   * if (uploaded) {
   *   console.log('File uploaded successfully');
   * } else {
   *   console.log('Failed to upload file');
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
      // Parse path
      const pathParts = objectName.split('/');
      const fileName = pathParts.pop() || '';
      const parentPath = pathParts.join('/');
      
      // Get or create parent folder
      const parentId = await this._getOrCreateParentFolder(parentPath);
      
      // Determine content type
      const effectiveContentType = contentType || mime.lookup(objectName) || 'application/octet-stream';
      
      // Check if file already exists to decide whether to create or update
      let existingFileId: string | null = null;
      try {
        const existingFile = await this._getItemByPath(objectName);
        existingFileId = existingFile.id || null;
      } catch (error) {
        // File doesn't exist, will create new
      }
      
      if (existingFileId) {
        // Update existing file
        await this._drive.files.update({
          fileId: existingFileId,
          media: {
            body: data,
            mimeType: effectiveContentType
          }
        });
      } else {
        // Create new file
        await this._drive.files.create({
          requestBody: {
            name: fileName,
            parents: [parentId]
          },
          media: {
            body: data,
            mimeType: effectiveContentType
          },
          fields: 'id'
        });
      }
      
      return true;
    } catch (error) {
      console.error('Error putting object', { objectName, error });
      return false;
    }
  }
  
  /**
   * Copies an object within Google Drive.
   * 
   * This method creates a copy of a file at a new location without removing the original.
   * It uses the Google Drive API's native file copying capabilities.
   * 
   * @param sourceObjectName - The path to the file to copy
   * @param destinationObjectName - The path where the copy should be created
   * @returns A Promise resolving to a boolean indicating success
   * 
   * @example
   * ```typescript
   * // Create a backup copy of an important file
   * const copied = await driveStorage.CopyObject(
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
      // Get source file
      const sourceFile = await this._getItemByPath(sourceObjectName);
      
      if (!sourceFile.id) {
        throw new Error(`Source file not found: ${sourceObjectName}`);
      }
      
      // Parse destination path
      const destPathParts = destinationObjectName.split('/');
      const destFileName = destPathParts.pop() || '';
      const destParentPath = destPathParts.join('/');
      
      // Get or create destination parent folder
      const destParentId = await this._getOrCreateParentFolder(destParentPath);
      
      // Copy the file
      await this._drive.files.copy({
        fileId: sourceFile.id,
        requestBody: {
          name: destFileName,
          parents: [destParentId]
        }
      });
      
      return true;
    } catch (error) {
      console.error('Error copying object', { sourceObjectName, destinationObjectName, error });
      return false;
    }
  }
  
  /**
   * Checks if an object exists in Google Drive.
   * 
   * This method verifies the existence of a file at the specified path
   * without downloading its content.
   * 
   * @param objectName - The path to the file to check
   * @returns A Promise resolving to a boolean indicating if the file exists
   * 
   * @example
   * ```typescript
   * // Check if a file exists before attempting to use it
   * const exists = await driveStorage.ObjectExists('documents/report.pdf');
   * 
   * if (exists) {
   *   console.log('File exists, proceeding with download');
   *   const content = await driveStorage.GetObject('documents/report.pdf');
   *   // Process the content...
   * } else {
   *   console.log('File does not exist');
   * }
   * ```
   */
  public async ObjectExists(objectName: string): Promise<boolean> {
    try {
      await this._getItemByPath(objectName);
      return true;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Checks if a directory exists in Google Drive.
   * 
   * This method verifies the existence of a folder at the specified path.
   * It also checks that the item is actually a folder (has the correct MIME type),
   * not a file with the same name.
   * 
   * @param directoryPath - The path of the directory to check
   * @returns A Promise resolving to a boolean indicating if the directory exists
   * 
   * @example
   * ```typescript
   * // Check if a directory exists before trying to save files to it
   * const exists = await driveStorage.DirectoryExists('documents/reports/');
   * 
   * if (!exists) {
   *   console.log('Directory does not exist, creating it first');
   *   await driveStorage.CreateDirectory('documents/reports/');
   * }
   * 
   * // Now safe to use the directory
   * await driveStorage.PutObject('documents/reports/new-report.pdf', fileData);
   * ```
   */
  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    try {
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/')
        ? directoryPath.substring(0, directoryPath.length - 1)
        : directoryPath;
      
      const item = await this._getItemByPath(normalizedPath);
      return item.mimeType === 'application/vnd.google-apps.folder';
    } catch (error) {
      return false;
    }
  }
}