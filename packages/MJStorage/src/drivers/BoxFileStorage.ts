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
 * FileStorageBase implementation for Box.com cloud storage
 * 
 * This provider allows working with files stored in Box.com. It supports
 * authentication via access token, refresh token, or client credentials (JWT).
 * 
 * @remarks
 * This implementation requires at least one of the following authentication methods:
 * 
 * 1. Access Token:
 *    - STORAGE_BOX_ACCESS_TOKEN - A valid Box API access token
 *    
 * 2. Refresh Token:
 *    - STORAGE_BOX_REFRESH_TOKEN - A valid Box API refresh token
 *    - STORAGE_BOX_CLIENT_ID - Your Box application client ID
 *    - STORAGE_BOX_CLIENT_SECRET - Your Box application client secret
 *    
 * 3. Client Credentials (JWT):
 *    - STORAGE_BOX_CLIENT_ID - Your Box application client ID
 *    - STORAGE_BOX_CLIENT_SECRET - Your Box application client secret
 *    - STORAGE_BOX_ENTERPRISE_ID - Your Box enterprise ID
 * 
 * Optional configuration:
 * - STORAGE_BOX_ROOT_FOLDER_ID - ID of a Box folder to use as the root (defaults to '0' which is the root)
 * 
 * @example
 * ```typescript
 * // Set required environment variables for JWT auth
 * process.env.STORAGE_BOX_CLIENT_ID = 'your-client-id';
 * process.env.STORAGE_BOX_CLIENT_SECRET = 'your-client-secret';
 * process.env.STORAGE_BOX_ENTERPRISE_ID = 'your-enterprise-id';
 * 
 * // Create the provider
 * const storage = new BoxFileStorage();
 * await storage.initialize(); // Required for JWT auth
 * 
 * // Upload a file
 * const fileContent = Buffer.from('Hello, Box!');
 * await storage.PutObject('documents/hello.txt', fileContent, 'text/plain');
 * 
 * // Download a file
 * const downloadedContent = await storage.GetObject('documents/hello.txt');
 * 
 * // Get a temporary download URL
 * const downloadUrl = await storage.CreatePreAuthDownloadUrl('documents/hello.txt');
 * ```
 */
@RegisterClass(FileStorageBase, 'Box.com Storage')
export class BoxFileStorage extends FileStorageBase {
  /**
   * The name of this storage provider
   */
  protected readonly providerName = 'Box';
  
  /**
   * Box API access token
   */
  private _accessToken: string;
  
  /**
   * Box API refresh token
   */
  private _refreshToken: string;
  
  /**
   * Box application client ID
   */
  private _clientId: string;
  
  /**
   * Box application client secret
   */
  private _clientSecret: string;
  
  /**
   * Timestamp when current access token expires
   */
  private _tokenExpiresAt: number = 0;
  
  /**
   * Base URL for Box API
   */
  private _baseApiUrl: string = 'https://api.box.com/2.0';
  
  /**
   * Base URL for Box Upload API
   */
  private _uploadApiUrl: string = 'https://upload.box.com/api/2.0';
  
  /**
   * ID of the Box folder to use as root
   */
  private _rootFolderId: string;
  
  /**
   * Box enterprise ID for JWT auth
   */
  private _enterpriseId: string;

  /**
   * Creates a new BoxFileStorage instance
   * 
   * This constructor reads the required Box authentication configuration
   * from environment variables.
   * 
   * @throws Error if refresh token is provided without client ID and secret
   */
  constructor() {
    super();
    
    // Box auth can be via access token or refresh token
    this._accessToken = env.get('STORAGE_BOX_ACCESS_TOKEN').asString();
    this._refreshToken = env.get('STORAGE_BOX_REFRESH_TOKEN').asString();
    this._clientId = env.get('STORAGE_BOX_CLIENT_ID').asString();
    this._clientSecret = env.get('STORAGE_BOX_CLIENT_SECRET').asString();
    this._enterpriseId = env.get('STORAGE_BOX_ENTERPRISE_ID').asString();

    if (this._refreshToken && (!this._clientId || !this._clientSecret)) {
      throw new Error('Box storage with refresh token requires STORAGE_BOX_CLIENT_ID and STORAGE_BOX_CLIENT_SECRET');
    }
    
    // Root folder ID, optional (defaults to '0' which is root)
    this._rootFolderId = env.get('STORAGE_BOX_ROOT_FOLDER_ID').default('0').asString();
  }

  /**
   * Initializes the Box storage driver
   * 
   * This method must be called after creating a BoxFileStorage instance
   * when using client credentials (JWT) authentication. It obtains the
   * initial access token required for API calls.
   * 
   * @returns A Promise that resolves when initialization is complete
   * 
   * @example
   * ```typescript
   * const storage = new BoxFileStorage();
   * await storage.initialize();
   * // Now the storage provider is ready to use
   * ```
   */
  public async initialize(): Promise<void> {
    if (!this._accessToken && this._clientId && this._clientSecret && this._enterpriseId) {
      await this._setAccessToken();
    }
  }

  /**
   * Obtains an access token using client credentials flow
   * 
   * This method requests a new access token using the Box client credentials
   * flow (JWT) with the enterprise as the subject.
   * 
   * @private
   * @returns A Promise that resolves when the access token is obtained
   * @throws Error if token acquisition fails
   */
  private async _setAccessToken() {
    try {
      const response = await fetch('https://api.box.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: this._clientId,
          client_secret: this._clientSecret,
          grant_type: 'client_credentials',
          box_subject_type: 'enterprise',
          box_subject_id: this._enterpriseId
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to get access token: ${response.status} ${response.statusText}`);
      }
      
      const tokenData = await response.json();
      const { access_token, expires_in } = tokenData;
      this._accessToken = access_token;
      this._tokenExpiresAt = Date.now() + (expires_in * 1000) - 60000; // Subtract 1 minute for safety
    } catch (error) {
      console.error('Error getting Box access token', error);
      throw new Error('Failed to authenticate with Box: ' + error.message);
    }
  }

  
  /**
   * Ensures a valid access token is available for API requests
   * 
   * This method checks if the current token is valid, and if not, attempts
   * to refresh or obtain a new token using the configured authentication method.
   * 
   * @private
   * @returns A Promise that resolves to a valid access token
   * @throws Error if no valid token can be obtained
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
        // Fall through to client credentials if refresh fails
      }
    }
    
    // If we have client credentials, try to get a new access token
    if (this._clientId && this._clientSecret && this._enterpriseId) {
      try {
        await this._setAccessToken();
        return this._accessToken;
      } catch (error) {
        console.error('Error getting new access token via client credentials', error);
        throw new Error('Failed to authenticate with Box: ' + error.message);
      }
    }
    
    // If we have an access token but it's expired and we can't refresh it
    if (this._accessToken) {
      console.warn('Using expired Box access token as no refresh mechanism is available');
      return this._accessToken;
    }
    
    throw new Error('No valid Box access token available and no authentication method configured');
  }
  
  /**
   * Makes an authenticated API request to the Box API
   * 
   * This helper method handles authentication, request formatting, and
   * response parsing for all Box API calls.
   * 
   * @private
   * @param endpoint - The API endpoint to call (e.g., '/files/123')
   * @param method - The HTTP method to use (default: 'GET')
   * @param body - Optional request body (will be serialized as JSON unless it's FormData)
   * @param headers - Optional additional headers
   * @param baseUrl - Base URL to use (defaults to standard API URL)
   * @returns A Promise that resolves to the API response data
   * @throws Error if the API request fails
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
   * Parses a path string into Box API components
   * 
   * This helper method converts a standard path string (e.g., 'documents/reports/file.txt')
   * into components used by the Box API (folder ID, name, parent path).
   * 
   * @private
   * @param path - The path to parse
   * @returns An object containing the parsed components: id, name, and parent
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
   * Resolves a path string to a Box item ID
   * 
   * This helper method navigates the Box folder hierarchy to find
   * the item at the specified path, returning its Box ID.
   * 
   * @private
   * @param path - The path to resolve
   * @returns A Promise that resolves to the Box item ID
   * @throws Error if the item does not exist
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
   * Converts a Box API item to StorageObjectMetadata
   * 
   * This helper method transforms a Box API item representation into
   * the standard StorageObjectMetadata format used by FileStorageBase.
   * 
   * @private
   * @param item - The Box API item object
   * @param parentPath - The parent path string
   * @returns A StorageObjectMetadata object
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
   * Creates a pre-authenticated upload URL for a file
   * 
   * This method creates a Box upload session and returns a URL that can be used
   * to upload file content directly to Box without requiring authentication.
   * 
   * @param objectName - Path where the file should be uploaded (e.g., 'documents/report.pdf')
   * @returns A Promise that resolves to an object containing the upload URL and provider key
   * @throws Error if the URL creation fails
   * 
   * @remarks
   * - The parent folder structure will be created automatically if it doesn't exist
   * - The returned provider key contains the session ID needed to complete the upload
   * - Box upload sessions expire after a certain period (typically 1 hour)
   * 
   * @example
   * ```typescript
   * try {
   *   // Generate a pre-authenticated upload URL
   *   const uploadInfo = await storage.CreatePreAuthUploadUrl('presentations/quarterly-results.pptx');
   *   
   *   // The URL can be used to upload content directly
   *   console.log(`Upload URL: ${uploadInfo.UploadUrl}`);
   *   
   *   // Make sure to save the provider key, as it's needed to reference the upload
   *   console.log(`Provider Key: ${uploadInfo.ProviderKey}`);
   *   
   *   // You can use fetch or another HTTP client to upload to this URL
   *   await fetch(uploadInfo.UploadUrl, {
   *     method: 'PUT',
   *     headers: { 'Content-Type': 'application/octet-stream' },
   *     body: fileContent
   *   });
   * } catch (error) {
   *   console.error('Error creating upload URL:', error.message);
   * }
   * ```
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
   * Creates a pre-authenticated download URL for a file
   * 
   * This method generates a time-limited URL that can be used to download
   * a file without authentication. The URL typically expires after 60 minutes.
   * 
   * @param objectName - Path to the file to download (e.g., 'documents/report.pdf')
   * @returns A Promise that resolves to the download URL string
   * @throws Error if the file doesn't exist or URL creation fails
   * 
   * @remarks
   * - Cannot be used with upload sessions that haven't been completed
   * - Box download URLs typically expire after 60 minutes
   * - Generated URLs can be shared with users who don't have Box access
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
   *   // without requiring Box authentication
   * } catch (error) {
   *   console.error('Error creating download URL:', error.message);
   * }
   * ```
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
   * Moves a file or folder from one location to another
   * 
   * This method moves a file or folder to a new location in Box storage.
   * It handles both renaming and changing the parent folder.
   * 
   * @param oldObjectName - Current path of the object (e.g., 'old-folder/document.docx')
   * @param newObjectName - New path for the object (e.g., 'new-folder/renamed-document.docx')
   * @returns A Promise that resolves to true if successful, false otherwise
   * 
   * @remarks
   * - Parent folders will be created automatically if they don't exist
   * - Works with both files and folders
   * - For folders, all contents will move with the folder
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
   * Deletes a file or folder from Box storage
   * 
   * This method permanently deletes a file or folder. It can also
   * handle special cases like incomplete upload sessions.
   * 
   * @param objectName - Path to the object to delete (e.g., 'documents/old-report.docx')
   * @returns A Promise that resolves to true if successful, false if an error occurs
   * 
   * @remarks
   * - Returns true if the object doesn't exist (for idempotency)
   * - Can handle special provider keys like upload sessions
   * - Box puts deleted items in the trash, where they can be recovered for a limited time
   * - To permanently delete folder contents, use DeleteDirectory with recursive=true
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
   * 
   * // Delete an upload session
   * await storage.DeleteObject('session:1234567890:documents/large-file.zip');
   * ```
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
   * - Returns empty arrays if the directory doesn't exist
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
   * Creates a new directory (folder) in Box storage
   * 
   * This method creates a folder at the specified path, automatically
   * creating any parent folders that don't exist.
   * 
   * @param directoryPath - Path where the directory should be created (e.g., 'documents/reports/2023')
   * @returns A Promise that resolves to true if successful, false if an error occurs
   * 
   * @remarks
   * - Creates parent directories recursively if they don't exist
   * - Returns true if the directory already exists (idempotent operation)
   * - Trailing slashes in the path are automatically removed
   * 
   * @example
   * ```typescript
   * // Create a nested directory structure
   * const createResult = await storage.CreateDirectory('documents/reports/2023/Q1');
   * 
   * if (createResult) {
   *   console.log('Directory created successfully');
   *   
   *   // Now we can put files in this directory
   *   await storage.PutObject(
   *     'documents/reports/2023/Q1/financial-summary.xlsx',
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
   * Deletes a directory from Box storage
   * 
   * This method deletes a folder and optionally its contents. By default,
   * it will only delete empty folders unless recursive is set to true.
   * 
   * @param directoryPath - Path to the directory to delete (e.g., 'documents/old-reports')
   * @param recursive - If true, delete the directory and all its contents; if false, only delete if empty
   * @returns A Promise that resolves to true if successful, false if an error occurs
   * 
   * @remarks
   * - Returns true if the directory doesn't exist (idempotent operation)
   * - If recursive=false and the directory contains files, the operation will fail
   * - Box puts deleted folders in the trash, where they can be recovered for a limited time
   * - Trailing slashes in the path are automatically removed
   * 
   * @example
   * ```typescript
   * // Try to delete an empty folder
   * const deleteResult = await storage.DeleteDirectory('temp/empty-folder');
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
   * Gets metadata for a file or folder
   * 
   * This method retrieves metadata about a file or folder in Box storage,
   * such as size, type, and modification date.
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
   *   // Box-specific metadata is available in customMetadata
   *   console.log(`Box ID: ${metadata.customMetadata.id}`);
   * } catch (error) {
   *   console.error('Error getting metadata:', error.message);
   * }
   * ```
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
   * - For upload sessions that haven't been completed, this method will fail
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
   * Uploads a file to Box storage
   * 
   * This method uploads a file to the specified path in Box storage. It automatically
   * determines whether to use a simple upload or chunked upload based on file size.
   * 
   * @param objectName - Path where the file should be uploaded (e.g., 'documents/report.pdf')
   * @param data - Buffer containing the file content
   * @param contentType - Optional MIME type of the file (if not provided, it will be guessed from the filename)
   * @param metadata - Optional metadata to associate with the file (not used in Box implementation)
   * @returns A Promise that resolves to true if successful, false if an error occurs
   * 
   * @remarks
   * - Automatically creates parent directories if they don't exist
   * - Files smaller than 50MB use a simple upload
   * - Files 50MB or larger use a chunked upload process
   * - If a file with the same name exists, it will be replaced
   * 
   * @example
   * ```typescript
   * // Create a simple text file
   * const textContent = Buffer.from('This is a sample document', 'utf8');
   * const uploadResult = await storage.PutObject(
   *   'documents/sample.txt',
   *   textContent,
   *   'text/plain'
   * );
   * 
   * // Upload a large file using chunked upload
   * const largeFileBuffer = fs.readFileSync('/path/to/large-presentation.pptx');
   * const largeUploadResult = await storage.PutObject(
   *   'presentations/quarterly-results.pptx',
   *   largeFileBuffer,
   *   'application/vnd.openxmlformats-officedocument.presentationml.presentation'
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
   * Copies a file from one location to another
   * 
   * This method creates a copy of a file at a new location. The original file
   * remains unchanged.
   * 
   * @param sourceObjectName - Path to the source file (e.g., 'templates/report-template.docx')
   * @param destinationObjectName - Path where the copy should be created (e.g., 'documents/new-report.docx')
   * @returns A Promise that resolves to true if successful, false if an error occurs
   * 
   * @remarks
   * - Only files can be copied; folders cannot be copied with this method
   * - Parent directories in the destination path will be created automatically if they don't exist
   * - If a file with the same name exists at the destination, it will be replaced
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
      await this._getIdFromPath(objectName);
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
   * await storage.PutObject('documents/reports/annual-summary.pdf', fileContent, 'application/pdf');
   * ```
   */
  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    try {
      // Remove trailing slash if present
      const normalizedPath = directoryPath.endsWith('/') 
        ? directoryPath.substring(0, directoryPath.length - 1) 
        : directoryPath;
      
      const itemId = await this._getIdFromPath(normalizedPath);
      const itemInfo = await this._apiRequest(`/folders/${itemId}`);
      
      return itemInfo.type === 'folder';
    } catch (error) {
      return false;
    }
  }
}