import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import * as mime from 'mime-types';
import { 
  CreatePreAuthUploadUrlPayload, 
  FileStorageBase, 
  StorageListResult, 
  StorageObjectMetadata, 
  UnsupportedOperationError 
} from '../generic/FileStorageBase';

/**
 * Simple implementation of AuthenticationProvider that uses client credentials flow
 */
class ClientCredentialsAuthProvider implements AuthenticationProvider {
  private clientId: string;
  private clientSecret: string;
  private tenantId: string;
  private tokenEndpoint: string;
  private accessToken: string | null = null;
  private tokenExpiration: Date | null = null;

  constructor(clientId: string, clientSecret: string, tenantId: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tenantId = tenantId;
    this.tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  }

  /**
   * Get access token for the specified resource
   */
  public async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiration && this.tokenExpiration > new Date()) {
      return this.accessToken;
    }

    const data = new URLSearchParams({
      client_id: this.clientId,
      scope: 'https://graph.microsoft.com/.default',
      client_secret: this.clientSecret,
      grant_type: 'client_credentials'
    });

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: data
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const json = await response.json();
    this.accessToken = json.access_token;
    
    // Set token expiration time (subtract 5 minutes as a buffer)
    const expiresIn = json.expires_in || 3600;
    this.tokenExpiration = new Date(Date.now() + (expiresIn - 300) * 1000);
    
    return this.accessToken;
  }
}

@RegisterClass(FileStorageBase, 'SharePoint Storage')
export class SharePointFileStorage extends FileStorageBase {
  protected readonly providerName = 'SharePoint';
  private _client: Client;
  private _driveId: string;
  private _siteId: string;
  private _rootFolderId?: string;
  
  constructor() {
    super();
    
    const clientId = env.get('STORAGE_SHAREPOINT_CLIENT_ID').required().asString();
    const clientSecret = env.get('STORAGE_SHAREPOINT_CLIENT_SECRET').required().asString();
    const tenantId = env.get('STORAGE_SHAREPOINT_TENANT_ID').required().asString();
    this._siteId = env.get('STORAGE_SHAREPOINT_SITE_ID').required().asString();
    this._driveId = env.get('STORAGE_SHAREPOINT_DRIVE_ID').required().asString();
    
    // Optionally set a root folder within the SharePoint drive
    this._rootFolderId = env.get('STORAGE_SHAREPOINT_ROOT_FOLDER_ID').asString();
    
    // Initialize Graph client with auth provider
    const authProvider = new ClientCredentialsAuthProvider(clientId, clientSecret, tenantId);
    this._client = Client.initWithMiddleware({
      authProvider: authProvider
    });
  }
  
  /**
   * Get the parent item ID for a given path
   * 
   * @param path The path to get the parent folder for
   * @returns The parent folder ID
   */
  private async _getParentFolderIdByPath(path: string): Promise<string> {
    if (!path || path === '/' || path === '') {
      return this._rootFolderId || 'root';
    }
    
    const pathParts = path.split('/').filter(p => p);
    let currentFolderId = this._rootFolderId || 'root';
    
    for (let i = 0; i < pathParts.length; i++) {
      const folderName = pathParts[i];
      const result = await this._client.api(`/drives/${this._driveId}/items/${currentFolderId}/children`)
        .filter(`name eq '${folderName}' and folder ne null`)
        .get();
      
      if (!result.value || result.value.length === 0) {
        throw new Error(`Folder not found: ${folderName}`);
      }
      
      currentFolderId = result.value[0].id;
    }
    
    return currentFolderId;
  }
  
  /**
   * Get an item by path
   * 
   * @param path The path of the item
   * @returns The item
   */
  private async _getItemByPath(path: string): Promise<any> {
    if (!path || path === '/' || path === '') {
      const itemId = this._rootFolderId || 'root';
      return this._client.api(`/drives/${this._driveId}/items/${itemId}`).get();
    }
    
    // Normalize path
    const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
    
    try {
      // Try to get the item directly by path
      const driveRoot = this._rootFolderId ? 
        `/drives/${this._driveId}/items/${this._rootFolderId}` : 
        `/drives/${this._driveId}/root`;
      
      return await this._client.api(`${driveRoot}:/${normalizedPath}`).get();
    } catch (error) {
      console.error('Error getting item by path', { path, error });
      throw error;
    }
  }
  
  /**
   * Convert a SharePoint item to a StorageObjectMetadata object
   */
  private _itemToMetadata(item: any): StorageObjectMetadata {
    const isDirectory = !!item.folder;
    const parentPath = item.parentReference?.path?.split(':').pop() || '';
    
    // Remove any root folder prefix from the parent path if present
    let path = parentPath;
    if (this._rootFolderId && path.startsWith(`/drives/${this._driveId}/items/${this._rootFolderId}`)) {
      path = path.replace(`/drives/${this._driveId}/items/${this._rootFolderId}`, '');
    }
    
    // Ensure path starts with / and remove leading slash for storage format
    path = path.startsWith('/') ? path.substring(1) : path;
    
    // For full paths, combine parent path with name
    const fullPath = path ? `${path}/${item.name}` : item.name;
    
    return {
      name: item.name,
      path,
      fullPath,
      size: item.size || 0,
      contentType: item.file?.mimeType || mime.lookup(item.name) || 'application/octet-stream',
      lastModified: new Date(item.lastModifiedDateTime),
      isDirectory,
      etag: item.eTag,
      customMetadata: {}
    };
  }
  
  /**
   * Create a pre-authenticated upload URL is not directly supported in SharePoint/OneDrive
   */
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    // SharePoint doesn't provide a way to get pre-authenticated upload URLs like S3
    // Instead, we'll use the PutObject method for actual uploads
    this.throwUnsupportedOperationError('CreatePreAuthUploadUrl');
  }
  
  /**
   * Create a pre-authenticated download URL for an object
   */
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    try {
      const item = await this._getItemByPath(objectName);
      
      // Request a download URL - this is a time-limited URL
      const downloadUrl = await this._client.api(`/drives/${this._driveId}/items/${item.id}/createLink`)
        .post({
          type: 'view',
          scope: 'anonymous',
          expirationDateTime: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
        });
      
      return downloadUrl.link.webUrl;
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
      // Get the old item
      const item = await this._getItemByPath(oldObjectName);
      
      // Parse the new path to get the new parent folder and name
      const newPathParts = newObjectName.split('/');
      const newName = newPathParts.pop() || '';
      const newParentPath = newPathParts.join('/');
      
      // Get the new parent folder ID
      const parentFolderId = await this._getParentFolderIdByPath(newParentPath);
      
      // Move the item
      await this._client.api(`/drives/${this._driveId}/items/${item.id}`)
        .update({
          name: newName,
          parentReference: {
            id: parentFolderId
          }
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
      const item = await this._getItemByPath(objectName);
      
      // Delete the item
      await this._client.api(`/drives/${this._driveId}/items/${item.id}`)
        .delete();
      
      return true;
    } catch (error) {
      // Check if it's a "not found" error, which we'll consider a success for idempotency
      if (error.statusCode === 404) {
        return true;
      }
      
      console.error('Error deleting object', { objectName, error });
      return false;
    }
  }
  
  /**
   * List objects in a given directory
   */
  public async ListObjects(prefix: string, delimiter?: string): Promise<StorageListResult> {
    try {
      // Get the folder ID
      const folder = await this._getItemByPath(prefix);
      
      // List children
      const children = await this._client.api(`/drives/${this._driveId}/items/${folder.id}/children`).get();
      
      const objects: StorageObjectMetadata[] = [];
      const prefixes: string[] = [];
      
      for (const item of children.value) {
        if (item.folder) {
          // This is a folder/directory
          const folderPath = prefix ? 
            (prefix.endsWith('/') ? `${prefix}${item.name}` : `${prefix}/${item.name}`) : 
            item.name;
          
          prefixes.push(`${folderPath}/`);
        }
        
        // Add all items as objects (including folders)
        objects.push(this._itemToMetadata(item));
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
      const normalizedPath = directoryPath.endsWith('/') ? 
        directoryPath.substring(0, directoryPath.length - 1) : 
        directoryPath;
      
      // Parse the path to get the parent folder and new folder name
      const pathParts = normalizedPath.split('/');
      const folderName = pathParts.pop() || '';
      const parentPath = pathParts.join('/');
      
      // Get the parent folder ID
      const parentFolderId = await this._getParentFolderIdByPath(parentPath);
      
      // Create the folder
      await this._client.api(`/drives/${this._driveId}/items/${parentFolderId}/children`)
        .post({
          name: folderName,
          folder: {},
          '@microsoft.graph.conflictBehavior': 'fail'
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
      const normalizedPath = directoryPath.endsWith('/') ? 
        directoryPath.substring(0, directoryPath.length - 1) : 
        directoryPath;
      
      const folder = await this._getItemByPath(normalizedPath);
      
      if (!recursive) {
        // Check if folder is empty
        const children = await this._client.api(`/drives/${this._driveId}/items/${folder.id}/children`).get();
        
        if (children.value && children.value.length > 0) {
          throw new Error('Directory is not empty');
        }
      }
      
      // Delete the folder (SharePoint will delete recursively by default)
      await this._client.api(`/drives/${this._driveId}/items/${folder.id}`)
        .delete();
      
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
      const item = await this._getItemByPath(objectName);
      return this._itemToMetadata(item);
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
      const item = await this._getItemByPath(objectName);
      
      // Get the content
      const response = await fetch(item['@microsoft.graph.downloadUrl']);
      
      if (!response.ok) {
        throw new Error(`Failed to download item: ${response.statusText}`);
      }
      
      // Convert response to buffer
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Error getting object', { objectName, error });
      throw new Error(`Failed to get object: ${objectName}`);
    }
  }
  
  /**
   * Upload an object directly
   */
  public async PutObject(
    objectName: string, 
    data: Buffer, 
    contentType?: string, 
    metadata?: Record<string, string>
  ): Promise<boolean> {
    try {
      // Parse the path to get the parent folder and filename
      const pathParts = objectName.split('/');
      const fileName = pathParts.pop() || '';
      const parentPath = pathParts.join('/');
      
      // Get the parent folder ID
      const parentFolderId = await this._getParentFolderIdByPath(parentPath);
      
      // Determine content type
      const effectiveContentType = contentType || mime.lookup(objectName) || 'application/octet-stream';
      
      if (data.length < 4 * 1024 * 1024) {
        // For small files (< 4MB), use simple upload
        await this._client.api(`/drives/${this._driveId}/items/${parentFolderId}:/${fileName}:/content`)
          .put(data);
      } else {
        // For larger files, use upload session
        // Create upload session
        const uploadSession = await this._client.api(`/drives/${this._driveId}/items/${parentFolderId}:/${fileName}:/createUploadSession`)
          .post({
            item: {
              '@microsoft.graph.conflictBehavior': 'replace'
            }
          });
        
        // Upload the file in chunks (could be improved with parallel uploads)
        const maxChunkSize = 60 * 1024 * 1024; // 60 MB chunks
        for (let i = 0; i < data.length; i += maxChunkSize) {
          const chunk = data.slice(i, Math.min(i + maxChunkSize, data.length));
          const contentRange = `bytes ${i}-${i + chunk.length - 1}/${data.length}`;
          
          await fetch(uploadSession.uploadUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': chunk.length.toString(),
              'Content-Range': contentRange
            },
            body: chunk
          });
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
      // Get source item
      const sourceItem = await this._getItemByPath(sourceObjectName);
      
      // Parse destination path
      const destPathParts = destinationObjectName.split('/');
      const destName = destPathParts.pop() || '';
      const destParentPath = destPathParts.join('/');
      
      // Get destination parent folder ID
      const destParentId = await this._getParentFolderIdByPath(destParentPath);
      
      // Create a copy
      await this._client.api(`/drives/${this._driveId}/items/${sourceItem.id}/copy`)
        .post({
          parentReference: {
            id: destParentId
          },
          name: destName
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
      if (error.statusCode === 404) {
        return false;
      }
      
      console.error('Error checking if object exists', { objectName, error });
      return false;
    }
  }
  
  /**
   * Check if a directory exists
   */
  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    try {
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/') ? 
        directoryPath.substring(0, directoryPath.length - 1) : 
        directoryPath;
      
      const item = await this._getItemByPath(normalizedPath);
      return !!item.folder;
    } catch (error) {
      if (error.statusCode === 404) {
        return false;
      }
      
      console.error('Error checking if directory exists', { directoryPath, error });
      return false;
    }
  }
}