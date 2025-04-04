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
  protected readonly providerName = 'Box';
  
  private _accessToken: string;
  private _refreshToken: string;
  private _clientId: string;
  private _clientSecret: string;
  private _tokenExpiresAt: number = 0;
  private _baseApiUrl: string = 'https://api.box.com/2.0';
  private _uploadApiUrl: string = 'https://upload.box.com/api/2.0';
  private _rootFolderId: string;

  constructor() {
    super();
    
    // Box auth can be via access token or refresh token
    this._accessToken = env.get('STORAGE_BOX_ACCESS_TOKEN').asString();
    this._refreshToken = env.get('STORAGE_BOX_REFRESH_TOKEN').asString();
    this._clientId = env.get('STORAGE_BOX_CLIENT_ID').asString();
    this._clientSecret = env.get('STORAGE_BOX_CLIENT_SECRET').asString();
    
    if (!this._refreshToken && !this._accessToken) {
      throw new Error('Box storage requires either STORAGE_BOX_ACCESS_TOKEN or STORAGE_BOX_REFRESH_TOKEN with CLIENT_ID and CLIENT_SECRET');
    }
    
    if (this._refreshToken && (!this._clientId || !this._clientSecret)) {
      throw new Error('Box storage with refresh token requires STORAGE_BOX_CLIENT_ID and STORAGE_BOX_CLIENT_SECRET');
    }
    
    // Root folder ID, optional (defaults to '0' which is root)
    this._rootFolderId = env.get('STORAGE_BOX_ROOT_FOLDER_ID').default('0').asString();
  }
  
  /**
   * Ensures we have a valid access token
   */
  private async _ensureValidToken(): Promise<string> {
    // If we have a valid token, use it
    if (this._accessToken && Date.now() < this._tokenExpiresAt) {
      return this._accessToken;
    }
    
    // If we have refresh token, try to get a new access token
    if (this._refreshToken && this._clientId && this._clientSecret) {
      try {
        const response = await fetch('https://api.box.com/oauth2/token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: this._refreshToken,
            client_id: this._clientId,
            client_secret: this._clientSecret
          })
        });
        
        if (!response.ok) {
          throw new Error(`Failed to refresh token: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        this._accessToken = data.access_token;
        this._refreshToken = data.refresh_token || this._refreshToken;
        this._tokenExpiresAt = Date.now() + (data.expires_in * 1000) - 60000; // Subtract 1 minute for safety
        
        return this._accessToken;
      } catch (error) {
        console.error('Error refreshing Box access token', error);
        throw new Error('Failed to authenticate with Box: ' + error.message);
      }
    }
    
    // If we have an access token but it's expired and we can't refresh it
    if (this._accessToken) {
      console.warn('Using expired Box access token as no refresh token is available');
      return this._accessToken;
    }
    
    throw new Error('No valid Box access token available');
  }
  
  /**
   * Make an authenticated API request to Box
   */
  private async _apiRequest(
    endpoint: string, 
    method: string = 'GET', 
    body?: any, 
    headers: Record<string, string> = {},
    baseUrl: string = this._baseApiUrl
  ): Promise<any> {
    const token = await this._ensureValidToken();
    
    const requestHeaders: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      ...headers
    };
    
    if (body && typeof body !== 'string' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
      requestHeaders['Content-Type'] = 'application/json';
      body = JSON.stringify(body);
    }
    
    const url = `${baseUrl}${endpoint}`;
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body
    });
    
    if (response.status === 204 || response.status === 202) {
      return null; // No content response
    }
    
    // For downloading files, return the response directly
    if (endpoint.startsWith('/files/') && endpoint.includes('/content') && response.ok) {
      return response;
    }
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Box API error', { status: response.status, data });
      throw new Error(`Box API error: ${response.status} - ${data.message || JSON.stringify(data)}`);
    }
    
    return data;
  }
  
  /**
   * Parse a Box API path into folder ID and name components
   */
  private _parsePath(path: string): { id: string, name: string, parent: string } {
    // Default to root folder
    if (!path || path === '/' || path === '') {
      return { id: this._rootFolderId, name: '', parent: '' };
    }
    
    // Remove leading and trailing slashes
    let normalizedPath = path;
    if (normalizedPath.startsWith('/')) {
      normalizedPath = normalizedPath.substring(1);
    }
    if (normalizedPath.endsWith('/')) {
      normalizedPath = normalizedPath.substring(0, normalizedPath.length - 1);
    }
    
    // Parse the name from the path
    const parts = normalizedPath.split('/');
    const name = parts[parts.length - 1];
    
    // Parse the parent path
    const parentParts = parts.slice(0, parts.length - 1);
    const parent = parentParts.join('/');
    
    return { id: '', name, parent };
  }
  
  /**
   * Get item ID by path
   */
  private async _getIdFromPath(path: string): Promise<string> {
    const parsedPath = this._parsePath(path);
    
    // If we already have the ID, return it
    if (parsedPath.id) {
      return parsedPath.id;
    }
    
    // If it's the root, return the root folder ID
    if (!parsedPath.name) {
      return this._rootFolderId;
    }
    
    // Get the parent folder ID
    let parentId = this._rootFolderId;
    if (parsedPath.parent) {
      parentId = await this._getIdFromPath(parsedPath.parent);
    }
    
    // Search for the item in the parent folder
    const result = await this._apiRequest(`/folders/${parentId}/items`, 'GET', null, {
      'fields': 'id,name,type'
    });
    
    const item = result.entries.find(entry => entry.name === parsedPath.name);
    if (!item) {
      throw new Error(`Item not found: ${path}`);
    }
    
    return item.id;
  }
  
  /**
   * Convert Box item to StorageObjectMetadata
   */
  private _convertToMetadata(item: any, parentPath: string = ''): StorageObjectMetadata {
    const isDirectory = item.type === 'folder';
    const name = item.name;
    
    // Construct full path
    const path = parentPath || '';
    const fullPath = path ? `${path}/${name}` : name;
    
    return {
      name,
      path,
      fullPath,
      size: isDirectory ? 0 : (item.size || 0),
      contentType: isDirectory ? 
        'application/x-directory' : 
        (item.content_type || mime.lookup(name) || 'application/octet-stream'),
      lastModified: new Date(item.modified_at || item.created_at || Date.now()),
      isDirectory,
      etag: item.etag,
      customMetadata: {
        id: item.id,
        sequence_id: item.sequence_id
      }
    };
  }
  
  /**
   * Create a pre-authenticated upload URL
   */
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    try {
      // Get the parent folder ID and file name
      const parsedPath = this._parsePath(objectName);
      let parentId = this._rootFolderId;
      
      if (parsedPath.parent) {
        try {
          parentId = await this._getIdFromPath(parsedPath.parent);
        } catch (error) {
          // If parent folder doesn't exist, create it recursively
          if (parsedPath.parent) {
            await this.CreateDirectory(parsedPath.parent);
            parentId = await this._getIdFromPath(parsedPath.parent);
          }
        }
      }
      
      // Create a file upload session
      const data = await this._apiRequest('/files/upload_sessions', 'POST', {
        folder_id: parentId,
        file_name: parsedPath.name,
        file_size: 0 // We'll use this later for chunked uploads
      }, {}, this._uploadApiUrl);
      
      // Return the upload URL with the session ID as the provider key
      return {
        UploadUrl: data.session_endpoints.upload_part,
        ProviderKey: `session:${data.id}:${objectName}`
      };
    } catch (error) {
      console.error('Error creating pre-auth upload URL', { objectName, error });
      throw new Error(`Failed to create upload URL for: ${objectName}`);
    }
  }
  
  /**
   * Create a pre-authenticated download URL
   */
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    try {
      // Check if this is a session upload that hasn't been completed
      if (objectName.startsWith('session:')) {
        throw new Error('Cannot create download URL for incomplete upload session');
      }
      
      // Get the file ID
      const fileId = await this._getIdFromPath(objectName);
      
      // Create a download URL that's good for 60 minutes
      const data = await this._apiRequest(`/files/${fileId}?fields=download_url`, 'GET');
      
      if (!data.download_url) {
        throw new Error(`No download URL available for: ${objectName}`);
      }
      
      return data.download_url;
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
      // Get source info
      const sourceId = await this._getIdFromPath(oldObjectName);
      const sourceInfo = await this._apiRequest(`/items/${sourceId}`);
      
      // Get destination info
      const destPath = this._parsePath(newObjectName);
      let destParentId = this._rootFolderId;
      
      if (destPath.parent) {
        try {
          destParentId = await this._getIdFromPath(destPath.parent);
        } catch (error) {
          // Create parent folder if it doesn't exist
          await this.CreateDirectory(destPath.parent);
          destParentId = await this._getIdFromPath(destPath.parent);
        }
      }
      
      // Move the item
      const endpoint = sourceInfo.type === 'folder' ? '/folders/' : '/files/';
      await this._apiRequest(`${endpoint}${sourceId}`, 'PUT', {
        parent: { id: destParentId },
        name: destPath.name
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
      // Handle session objects specially
      if (objectName.startsWith('session:')) {
        const [, sessionId] = objectName.split(':');
        await this._apiRequest(`/files/upload_sessions/${sessionId}`, 'DELETE');
        return true;
      }
      
      const itemId = await this._getIdFromPath(objectName);
      const itemInfo = await this._apiRequest(`/items/${itemId}`);
      
      // Delete the item
      const endpoint = itemInfo.type === 'folder' ? '/folders/' : '/files/';
      await this._apiRequest(`${endpoint}${itemId}`, 'DELETE');
      
      return true;
    } catch (error) {
      // If the error is a 404, consider it already deleted
      if (error.message && error.message.includes('404')) {
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
      let folderId;
      try {
        folderId = await this._getIdFromPath(prefix);
      } catch (error) {
        // If folder doesn't exist, return empty result
        return { objects: [], prefixes: [] };
      }
      
      // Get folder contents
      const result = await this._apiRequest(`/folders/${folderId}/items`, 'GET', null, {
        'fields': 'id,name,type,size,content_type,modified_at,created_at,etag,sequence_id'
      });
      
      const objects: StorageObjectMetadata[] = [];
      const prefixes: string[] = [];
      
      // Process entries
      for (const entry of result.entries) {
        objects.push(this._convertToMetadata(entry, prefix));
        
        // If it's a folder, add to prefixes
        if (entry.type === 'folder') {
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
        ? directoryPath.substring(0, directoryPath.length - 1) 
        : directoryPath;
      
      // Check if directory already exists
      try {
        await this._getIdFromPath(normalizedPath);
        return true; // Directory already exists
      } catch (error) {
        // Directory doesn't exist, create it
      }
      
      // Get parent folder info
      const parsedPath = this._parsePath(normalizedPath);
      let parentId = this._rootFolderId;
      
      if (parsedPath.parent) {
        try {
          parentId = await this._getIdFromPath(parsedPath.parent);
        } catch (error) {
          // Create parent directory recursively
          await this.CreateDirectory(parsedPath.parent);
          parentId = await this._getIdFromPath(parsedPath.parent);
        }
      }
      
      // Create the folder
      await this._apiRequest('/folders', 'POST', {
        name: parsedPath.name,
        parent: { id: parentId }
      });
      
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
      
      // Get folder ID
      let folderId;
      try {
        folderId = await this._getIdFromPath(normalizedPath);
      } catch (error) {
        // If folder doesn't exist, consider it success
        return true;
      }
      
      // Check if folder is empty if not recursive
      if (!recursive) {
        const contents = await this._apiRequest(`/folders/${folderId}/items`, 'GET', null, {
          'limit': '1'
        });
        
        if (contents.entries.length > 0) {
          throw new Error('Directory is not empty');
        }
      }
      
      // Delete the folder
      await this._apiRequest(`/folders/${folderId}`, 'DELETE', null, {
        'recursive': recursive ? 'true' : 'false'
      });
      
      return true;
    } catch (error) {
      // If the error is a 404, consider it already deleted
      if (error.message && error.message.includes('404')) {
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
      const itemId = await this._getIdFromPath(objectName);
      
      // Determine if it's a file or folder
      const itemInfo = await this._apiRequest(`/items/${itemId}`);
      const fullEndpoint = itemInfo.type === 'folder' ? `/folders/${itemId}` : `/files/${itemId}`;
      
      // Get full metadata
      const metadata = await this._apiRequest(fullEndpoint, 'GET', null, {
        'fields': 'id,name,type,size,content_type,modified_at,created_at,etag,sequence_id'
      });
      
      // Parse path to get parent path
      const parsedPath = this._parsePath(objectName);
      
      return this._convertToMetadata(metadata, parsedPath.parent);
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
      const fileId = await this._getIdFromPath(objectName);
      
      // Download the file
      const response = await this._apiRequest(`/files/${fileId}/content`, 'GET');
      
      // Convert response to buffer
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
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
      // Get the parent folder ID and file name
      const parsedPath = this._parsePath(objectName);
      let parentId = this._rootFolderId;
      
      if (parsedPath.parent) {
        try {
          parentId = await this._getIdFromPath(parsedPath.parent);
        } catch (error) {
          // If parent folder doesn't exist, create it recursively
          await this.CreateDirectory(parsedPath.parent);
          parentId = await this._getIdFromPath(parsedPath.parent);
        }
      }
      
      // Check if file already exists
      let fileId = null;
      try {
        fileId = await this._getIdFromPath(objectName);
      } catch (error) {
        // File doesn't exist, will create new
      }
      
      // Use multipart upload for small files (<50MB)
      if (data.length < 50 * 1024 * 1024) {
        const formData = new FormData();
        
        // Add file metadata
        const fileMetadata = {
          name: parsedPath.name,
          parent: { id: parentId }
        };
        
        formData.append('attributes', JSON.stringify(fileMetadata));
        
        // Create a file blob with the correct content type
        const fileBlob = new Blob([data], { type: contentType || 'application/octet-stream' });
        formData.append('file', fileBlob, parsedPath.name);
        
        // Upload the file
        const endpoint = fileId ? `/files/${fileId}/content` : '/files/content';
        await this._apiRequest(endpoint, 'POST', formData, {}, this._uploadApiUrl);
      } else {
        // Use chunked upload for larger files
        // Create upload session
        const session = await this._apiRequest('/files/upload_sessions', 'POST', {
          folder_id: parentId,
          file_name: parsedPath.name,
          file_size: data.length
        }, {}, this._uploadApiUrl);
        
        const sessionId = session.id;
        const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB chunks
        let offset = 0;
        const totalSize = data.length;
        const parts = [];
        
        // Upload chunks
        while (offset < totalSize) {
          const chunkEnd = Math.min(offset + CHUNK_SIZE, totalSize);
          const chunkSize = chunkEnd - offset;
          const chunk = data.slice(offset, chunkEnd);
          
          const headers = {
            'Content-Type': 'application/octet-stream',
            'Digest': `sha=1234`, // Replace with actual SHA-1 digest
            'Content-Range': `bytes ${offset}-${chunkEnd - 1}/${totalSize}`
          };
          
          const uploadResponse = await this._apiRequest(
            `/files/upload_sessions/${sessionId}`, 
            'PUT', 
            chunk, 
            headers, 
            this._uploadApiUrl
          );
          
          parts.push({
            part_id: uploadResponse.part.part_id,
            offset,
            size: chunkSize,
            sha1: uploadResponse.part.sha1
          });
          
          offset = chunkEnd;
        }
        
        // Commit the upload session
        await this._apiRequest(
          `/files/upload_sessions/${sessionId}/commit`, 
          'POST', 
          { parts }, 
          { 'Content-Type': 'application/json' }, 
          this._uploadApiUrl
        );
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
      // Get source info
      const sourceId = await this._getIdFromPath(sourceObjectName);
      const sourceInfo = await this._apiRequest(`/items/${sourceId}`);
      
      if (sourceInfo.type !== 'file') {
        throw new Error('Only files can be copied with CopyObject');
      }
      
      // Get destination info
      const destPath = this._parsePath(destinationObjectName);
      let destParentId = this._rootFolderId;
      
      if (destPath.parent) {
        try {
          destParentId = await this._getIdFromPath(destPath.parent);
        } catch (error) {
          // Create parent folder if it doesn't exist
          await this.CreateDirectory(destPath.parent);
          destParentId = await this._getIdFromPath(destPath.parent);
        }
      }
      
      // Copy the file
      await this._apiRequest(`/files/${sourceId}/copy`, 'POST', {
        parent: { id: destParentId },
        name: destPath.name
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
      await this._getIdFromPath(objectName);
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
      
      const itemId = await this._getIdFromPath(normalizedPath);
      const itemInfo = await this._apiRequest(`/items/${itemId}`);
      
      return itemInfo.type === 'folder';
    } catch (error) {
      return false;
    }
  }
}