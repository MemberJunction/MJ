import BoxSDK from 'box-node-sdk';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import * as mime from 'mime-types';
import { 
  CreatePreAuthUploadUrlPayload, 
  FileStorageBase, 
  StorageListResult, 
  StorageObjectMetadata 
} from '../generic/FileStorageBase';

@RegisterClass(FileStorageBase, 'Box.com Storage')
export class BoxFileStorage extends FileStorageBase {
  protected readonly providerName = 'Box.com';
  private _client: any; // Box client doesn't have good TypeScript definitions
  private _rootFolderId: string;

  constructor() {
    super();
    
    const clientId = env.get('STORAGE_BOX_CLIENT_ID').required().asString();
    const clientSecret = env.get('STORAGE_BOX_CLIENT_SECRET').required().asString();
    const enterpriseId = env.get('STORAGE_BOX_ENTERPRISE_ID').asString();
    const userId = env.get('STORAGE_BOX_USER_ID').asString();
    
    // Configuration for Box SDK
    const config = {
      boxAppSettings: {
        clientID: clientId,
        clientSecret: clientSecret
      }
    };
    
    // Private key auth or app token auth
    if (env.get('STORAGE_BOX_PRIVATE_KEY').asString()) {
      // Using JWT auth
      const privateKey = env.get('STORAGE_BOX_PRIVATE_KEY').required().asString();
      const passphrase = env.get('STORAGE_BOX_PASSPHRASE').asString();
      
      (config.boxAppSettings as any).appAuth = {
        publicKeyID: env.get('STORAGE_BOX_PUBLIC_KEY_ID').required().asString(),
        privateKey: privateKey,
        passphrase: passphrase
      };
      
      const sdk = BoxSDK.getPreconfiguredInstance(config);
      
      // Get client using JWT auth
      if (enterpriseId) {
        // Enterprise auth
        this._client = sdk.getAppAuthClient('enterprise', enterpriseId);
      } else if (userId) {
        // User auth
        this._client = sdk.getAppAuthClient('user', userId);
      } else {
        throw new Error('Either STORAGE_BOX_ENTERPRISE_ID or STORAGE_BOX_USER_ID must be provided when using JWT authentication');
      }
    } else {
      // Using developer token
      const developerToken = env.get('STORAGE_BOX_DEVELOPER_TOKEN').required().asString();
      const sdk = new BoxSDK({
        clientID: clientId,
        clientSecret: clientSecret
      });
      
      this._client = sdk.getBasicClient(developerToken);
    }
    
    // Set root folder ID, defaults to '0' which is the root of Box
    this._rootFolderId = env.get('STORAGE_BOX_ROOT_FOLDER_ID').default('0').asString();
  }
  
  /**
   * Find a file or folder by path
   */
  private async _getItemByPath(path: string): Promise<any> {
    if (!path || path === '/' || path === '') {
      // Return the root folder
      try {
        return await this._client.folders.get(this._rootFolderId);
      } catch (error) {
        throw new Error(`Root folder not found: ${this._rootFolderId}`);
      }
    }
    
    // Split path into parts
    const pathParts = path.split('/').filter(p => p);
    let currentId = this._rootFolderId;
    let currentItem = null;
    let isFolder = true;
    
    // Traverse the path
    for (let i = 0; i < pathParts.length; i++) {
      const part = pathParts[i];
      const isLastPart = i === pathParts.length - 1;
      
      // Get folder items
      const items = await this._client.folders.getItems(currentId, {
        fields: 'name,type,id,size,modified_at,parent'
      });
      
      // Find the matching item
      const matchingItem = items.entries.find(item => item.name === part);
      
      if (!matchingItem) {
        throw new Error(`Path not found: ${path} (at part: ${part})`);
      }
      
      currentItem = matchingItem;
      currentId = matchingItem.id;
      isFolder = matchingItem.type === 'folder';
      
      // If not the last part, it must be a folder
      if (!isLastPart && !isFolder) {
        throw new Error(`Path not found: ${path} (at part: ${part}, expected folder but got file)`);
      }
    }
    
    // Return either the file or folder object
    if (isFolder) {
      return await this._client.folders.get(currentId);
    } else {
      return await this._client.files.get(currentId);
    }
  }
  
  /**
   * Ensures a folder exists at the given path, creating it if necessary
   */
  private async _getOrCreateFolder(path: string): Promise<string> {
    if (!path || path === '/' || path === '') {
      return this._rootFolderId;
    }
    
    // Split path into parts
    const pathParts = path.split('/').filter(p => p);
    let currentId = this._rootFolderId;
    
    // Traverse/create the path
    for (const part of pathParts) {
      // Check if folder exists
      try {
        const items = await this._client.folders.getItems(currentId, {
          fields: 'name,type,id'
        });
        
        const matchingFolder = items.entries.find(
          item => item.name === part && item.type === 'folder'
        );
        
        if (matchingFolder) {
          currentId = matchingFolder.id;
        } else {
          // Create the folder
          const newFolder = await this._client.folders.create(currentId, part);
          currentId = newFolder.id;
        }
      } catch (error) {
        throw new Error(`Error creating folder path: ${path} (at part: ${part}): ${error.message}`);
      }
    }
    
    return currentId;
  }
  
  /**
   * Converts a Box item to StorageObjectMetadata
   */
  private _convertToMetadata(item: any, parentPath: string = ''): StorageObjectMetadata {
    const isDirectory = item.type === 'folder';
    const fullPath = parentPath ? `${parentPath}/${item.name}` : item.name;
    const modifiedDate = new Date(item.modified_at || Date.now());
    
    return {
      name: item.name,
      path: parentPath,
      fullPath,
      size: parseInt(item.size || '0'),
      contentType: item.type === 'file' ? 
        (mime.lookup(item.name) || 'application/octet-stream') : 
        'application/x-directory',
      lastModified: modifiedDate,
      isDirectory,
      etag: item.etag,
      customMetadata: {
        id: item.id
      }
    };
  }
  
  /**
   * Box doesn't support pre-auth upload URLs directly
   */
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    // Box doesn't support pre-signed URLs for uploads in the same way as S3
    // Instead, use PutObject method for uploads
    this.throwUnsupportedOperationError('CreatePreAuthUploadUrl');
  }
  
  /**
   * Create a pre-authenticated download URL
   */
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    try {
      // Get the file
      const file = await this._getItemByPath(objectName);
      
      if (file.type !== 'file') {
        throw new Error(`Not a file: ${objectName}`);
      }
      
      // Create a temporary download URL
      const downloadUrl = await this._client.files.getDownloadURL(file.id);
      
      return downloadUrl;
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
      // Get the source file/folder
      const sourceItem = await this._getItemByPath(oldObjectName);
      
      // Parse destination path
      const destPathParts = newObjectName.split('/');
      const destName = destPathParts.pop() || '';
      const destParentPath = destPathParts.join('/');
      
      // Get or create destination parent folder
      const destParentId = await this._getOrCreateFolder(destParentPath);
      
      // Move the item
      if (sourceItem.type === 'file') {
        await this._client.files.move(sourceItem.id, destParentId, { name: destName });
      } else {
        await this._client.folders.move(sourceItem.id, destParentId, { name: destName });
      }
      
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
      // Get the file/folder
      const item = await this._getItemByPath(objectName);
      
      // Delete the item
      if (item.type === 'file') {
        await this._client.files.delete(item.id);
      } else {
        // For folders, this will fail if not empty and recursive=false
        await this._client.folders.delete(item.id);
      }
      
      return true;
    } catch (error) {
      // If item not found, consider it success for idempotency
      if (error.statusCode === 404) {
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
      
      if (folder.type !== 'folder') {
        throw new Error(`Not a folder: ${prefix}`);
      }
      
      // List items in the folder
      const items = await this._client.folders.getItems(folder.id, {
        fields: 'name,type,id,size,modified_at,parent'
      });
      
      const objects: StorageObjectMetadata[] = [];
      const prefixes: string[] = [];
      
      // Process items
      for (const item of items.entries) {
        // Add to objects list
        objects.push(this._convertToMetadata(item, prefix));
        
        // If it's a folder, add to prefixes
        if (item.type === 'folder') {
          const folderPath = prefix 
            ? (prefix.endsWith('/') ? `${prefix}${item.name}` : `${prefix}/${item.name}`) 
            : item.name;
            
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
        ? directoryPath.substring(0, directoryPath.length - 1) 
        : directoryPath;
      
      // Parse the path
      const pathParts = normalizedPath.split('/');
      const folderName = pathParts.pop() || '';
      const parentPath = pathParts.join('/');
      
      // Get the parent folder
      const parentId = await this._getOrCreateFolder(parentPath);
      
      // Create the folder
      await this._client.folders.create(parentId, folderName);
      
      return true;
    } catch (error) {
      console.error('Error creating directory', { directoryPath, error });
      return false;
    }
  }
  
  /**
   * Delete a directory
   */
  public async DeleteDirectory(directoryPath: string, recursive = false): Promise<boolean> {
    try {
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/') 
        ? directoryPath.substring(0, directoryPath.length - 1) 
        : directoryPath;
      
      // Get the folder
      const folder = await this._getItemByPath(normalizedPath);
      
      if (folder.type !== 'folder') {
        throw new Error(`Not a folder: ${normalizedPath}`);
      }
      
      // Delete the folder
      await this._client.folders.delete(folder.id, {
        recursive: recursive
      });
      
      return true;
    } catch (error) {
      // If folder not found, consider it success
      if (error.statusCode === 404) {
        return true;
      }
      
      // If trying to delete non-empty folder without recursive flag
      if (error.statusCode === 400 && !recursive) {
        throw new Error('Directory is not empty');
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
      // Get the file/folder
      const item = await this._getItemByPath(objectName);
      
      // Parse path to get parent path
      const pathParts = objectName.split('/');
      pathParts.pop(); // Remove filename/foldername
      const parentPath = pathParts.join('/');
      
      return this._convertToMetadata(item, parentPath);
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
      // Get the file
      const file = await this._getItemByPath(objectName);
      
      if (file.type !== 'file') {
        throw new Error(`Not a file: ${objectName}`);
      }
      
      // Get download stream
      const stream = await this._client.files.getReadStream(file.id);
      
      // Convert stream to buffer
      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        
        stream.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
        });
        
        stream.on('end', () => {
          resolve(Buffer.concat(chunks));
        });
        
        stream.on('error', (err: Error) => {
          reject(err);
        });
      });
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
      const parentId = await this._getOrCreateFolder(parentPath);
      
      // Check if file already exists
      let existingFileId: string | null = null;
      try {
        const existingFile = await this._getItemByPath(objectName);
        if (existingFile.type === 'file') {
          existingFileId = existingFile.id;
        }
      } catch (error) {
        // File doesn't exist, will create new
      }
      
      // Determine content type if not provided
      const effectiveContentType = contentType || mime.lookup(objectName) || 'application/octet-stream';
      
      if (existingFileId) {
        // Update existing file
        await this._client.files.uploadNewFileVersion(existingFileId, data);
      } else {
        // Create new file
        await this._client.files.uploadFile(parentId, fileName, data);
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
      
      if (sourceFile.type !== 'file') {
        throw new Error(`Not a file: ${sourceObjectName}`);
      }
      
      // Parse destination path
      const destPathParts = destinationObjectName.split('/');
      const destFileName = destPathParts.pop() || '';
      const destParentPath = destPathParts.join('/');
      
      // Get or create destination parent folder
      const destParentId = await this._getOrCreateFolder(destParentPath);
      
      // Copy the file
      await this._client.files.copy(sourceFile.id, destParentId, { name: destFileName });
      
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
      return item.type === 'folder';
    } catch (error) {
      return false;
    }
  }
}