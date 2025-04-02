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

@RegisterClass(FileStorageBase, 'Google Drive Storage')
export class GoogleDriveFileStorage extends FileStorageBase {
  protected readonly providerName = 'Google Drive';
  private _drive: drive_v3.Drive;
  private _rootFolderId?: string;

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
   * Finds a file or folder by path
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
   * Finds a parent folder by path and creates it if it doesn't exist
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
   * Helper method to convert Google Drive file to StorageObjectMetadata
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
   * PreAuth upload URLs are not directly supported in Google Drive
   */
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    // Google Drive doesn't support pre-signed upload URLs in the same way as S3
    // Instead, use PutObject method for uploads
    this.throwUnsupportedOperationError('CreatePreAuthUploadUrl');
  }
  
  /**
   * Create a pre-authenticated download URL
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
   * Move an object from one location to another
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
   * Delete an object
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
   * List objects in a directory
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
   * Create a directory
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
   * Delete a directory and optionally its contents
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
   * Get object metadata
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
   * Get object contents
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
   * Upload an object
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
   * Copy an object
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
   * Check if an object exists
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
   * Check if a directory exists
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