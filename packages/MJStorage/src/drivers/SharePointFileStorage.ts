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

// Define types for Microsoft OAuth token response
interface MicrosoftTokenResponse {
  access_token: string;
  expires_in: number;
  ext_expires_in?: number;
  token_type: string;
}

/**
 * Implementation of the Microsoft Graph API AuthenticationProvider interface 
 * that uses the OAuth2 client credentials flow for authentication.
 * 
 * This provider handles token acquisition, caching, and automatic token refresh
 * when tokens expire, providing seamless authentication for SharePoint operations.
 * 
 * @remarks
 * This class is designed for server-to-server authentication scenarios where
 * user interaction isn't possible. It requires an Azure AD application with
 * appropriate permissions to access SharePoint/OneDrive resources.
 */
class ClientCredentialsAuthProvider implements AuthenticationProvider {
  /**
   * Azure AD application (client) ID
   */
  private clientId: string;
  
  /**
   * Azure AD application client secret
   */
  private clientSecret: string;
  
  /**
   * Azure AD tenant ID
   */
  private tenantId: string;
  
  /**
   * OAuth2 token endpoint URL
   */
  private tokenEndpoint: string;
  
  /**
   * Cached access token
   */
  private accessToken: string | null = null;
  
  /**
   * Expiration timestamp for the cached token
   */
  private tokenExpiration: Date | null = null;

  /**
   * Creates a new ClientCredentialsAuthProvider instance
   * 
   * @param clientId - The Azure AD application (client) ID
   * @param clientSecret - The Azure AD application client secret
   * @param tenantId - The Azure AD tenant ID
   */
  constructor(clientId: string, clientSecret: string, tenantId: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.tenantId = tenantId;
    this.tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  }

  /**
   * Gets an access token for Microsoft Graph API
   * 
   * This method implements the AuthenticationProvider interface required by the
   * Microsoft Graph client. It acquires a new token or returns a cached token
   * if it's still valid.
   * 
   * @returns A Promise that resolves to the access token string
   * @throws Error if token acquisition fails
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

    const json = await response.json() as MicrosoftTokenResponse;
    this.accessToken = json.access_token;
    
    // Set token expiration time (subtract 5 minutes as a buffer)
    const expiresIn = json.expires_in || 3600;
    this.tokenExpiration = new Date(Date.now() + (expiresIn - 300) * 1000);
    
    return this.accessToken;
  }
}

/**
 * FileStorageBase implementation for Microsoft SharePoint using the Microsoft Graph API
 * 
 * This provider allows working with files stored in SharePoint document libraries.
 * It uses the Microsoft Graph API and client credentials authentication flow to
 * securely access and manipulate SharePoint files and folders.
 * 
 * @remarks
 * This implementation requires the following environment variables:
 * - STORAGE_SHAREPOINT_CLIENT_ID - Azure AD application (client) ID
 * - STORAGE_SHAREPOINT_CLIENT_SECRET - Azure AD application client secret
 * - STORAGE_SHAREPOINT_TENANT_ID - Azure AD tenant ID
 * - STORAGE_SHAREPOINT_SITE_ID - The SharePoint site ID
 * - STORAGE_SHAREPOINT_DRIVE_ID - The ID of the document library (drive)
 * - STORAGE_SHAREPOINT_ROOT_FOLDER_ID (optional) - ID of a subfolder to use as the root
 * 
 * To use this provider, you need to:
 * 1. Register an Azure AD application with appropriate Microsoft Graph API permissions
 *    (typically Files.ReadWrite.All and Sites.ReadWrite.All)
 * 2. Create a client secret for the application
 * 3. Grant admin consent for the permissions
 * 4. Find your SharePoint site ID and document library (drive) ID using the Microsoft Graph Explorer
 * 
 * @example
 * ```typescript
 * // Set required environment variables before creating the provider
 * process.env.STORAGE_SHAREPOINT_CLIENT_ID = 'your-client-id';
 * process.env.STORAGE_SHAREPOINT_CLIENT_SECRET = 'your-client-secret';
 * process.env.STORAGE_SHAREPOINT_TENANT_ID = 'your-tenant-id';
 * process.env.STORAGE_SHAREPOINT_SITE_ID = 'your-site-id';
 * process.env.STORAGE_SHAREPOINT_DRIVE_ID = 'your-drive-id';
 * 
 * // Create the provider
 * const storage = new SharePointFileStorage();
 * 
 * // Upload a file
 * const fileContent = Buffer.from('Hello, SharePoint!');
 * await storage.PutObject('documents/hello.txt', fileContent, 'text/plain');
 * 
 * // Download a file
 * const downloadedContent = await storage.GetObject('documents/hello.txt');
 * 
 * // Get a temporary download URL
 * const downloadUrl = await storage.CreatePreAuthDownloadUrl('documents/hello.txt');
 * ```
 */
@RegisterClass(FileStorageBase, 'SharePoint Storage')
export class SharePointFileStorage extends FileStorageBase {
  /**
   * The name of this storage provider
   */
  protected readonly providerName = 'SharePoint';
  
  /**
   * Microsoft Graph API client
   */
  private _client: Client;
  
  /**
   * The ID of the SharePoint document library (drive)
   */
  private _driveId: string;
  
  /**
   * The ID of the SharePoint site
   */
  private _siteId: string;
  
  /**
   * Optional ID of a subfolder to use as the root folder (if specified)
   */
  private _rootFolderId?: string;
  
  /**
   * Creates a new SharePointFileStorage instance
   * 
   * This constructor reads required configuration from environment variables
   * and initializes the Microsoft Graph client.
   * 
   * @throws Error if required environment variables are missing
   */
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
   * Gets the SharePoint item ID for a folder at the specified path
   * 
   * This helper method navigates the folder hierarchy in SharePoint to find
   * the folder specified by the path, returning its item ID.
   * 
   * @param path - The path to get the parent folder for (e.g., 'documents/reports')
   * @returns A Promise that resolves to the parent folder ID
   * @throws Error if any folder in the path doesn't exist
   * @private
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
   * Gets a SharePoint item by its path
   * 
   * This helper method retrieves a SharePoint item (file or folder) using
   * its path. It handles path normalization and root folder redirection.
   * 
   * @param path - The path of the item to retrieve (e.g., 'documents/reports/report.docx')
   * @returns A Promise that resolves to the SharePoint item
   * @throws Error if the item doesn't exist or cannot be accessed
   * @private
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
   * Converts a SharePoint item to a StorageObjectMetadata object
   * 
   * This helper method transforms the Microsoft Graph API item representation
   * into the standard StorageObjectMetadata format used by the FileStorageBase interface.
   * 
   * @param item - The SharePoint item from the Microsoft Graph API
   * @returns A StorageObjectMetadata object representing the item
   * @private
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
   * Creates a pre-authenticated upload URL (not supported in SharePoint)
   * 
   * This method is not supported for SharePoint storage as SharePoint doesn't provide
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
   *     console.log('Pre-authenticated upload URLs are not supported in SharePoint.');
   *     // Use PutObject instead
   *     await storage.PutObject('documents/report.docx', fileContent, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
   *   }
   * }
   * ```
   */
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    // SharePoint doesn't provide a way to get pre-authenticated upload URLs like S3
    // Instead, we'll use the PutObject method for actual uploads
    this.throwUnsupportedOperationError('CreatePreAuthUploadUrl');
  }
  
  /**
   * Creates a pre-authenticated download URL for an object
   * 
   * This method generates a time-limited, publicly accessible URL that can be used
   * to download a file without authentication. The URL expires after 10 minutes.
   * 
   * @param objectName - Path to the object to create a download URL for (e.g., 'documents/report.pdf')
   * @returns A Promise that resolves to the pre-authenticated download URL
   * @throws Error if the object doesn't exist or the URL creation fails
   * 
   * @example
   * ```typescript
   * // Generate a pre-authenticated download URL that will work for 10 minutes
   * const downloadUrl = await storage.CreatePreAuthDownloadUrl('presentations/quarterly-update.pptx');
   * console.log(`Download the file using this URL: ${downloadUrl}`);
   * 
   * // You can share this URL with users who don't have SharePoint access
   * // The URL will expire after 10 minutes
   * ```
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
   * Moves an object from one location to another
   * 
   * This method moves a file or folder from one location in SharePoint to another.
   * It handles both renaming and changing the parent folder.
   * 
   * @param oldObjectName - Current path of the object (e.g., 'old-folder/document.docx')
   * @param newObjectName - New path for the object (e.g., 'new-folder/renamed-document.docx')
   * @returns A Promise that resolves to true if successful, false otherwise
   * 
   * @example
   * ```typescript
   * // Move a file to a different folder
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
   * Deletes an object (file) from SharePoint
   * 
   * This method permanently deletes a file from SharePoint storage.
   * Note that deleted files may be recoverable from the SharePoint recycle bin
   * depending on your SharePoint configuration.
   * 
   * @param objectName - Path to the object to delete (e.g., 'documents/old-report.docx')
   * @returns A Promise that resolves to true if successful, false if an error occurs
   * 
   * @remarks
   * - Returns true if the object doesn't exist (for idempotency)
   * - Handles 404 errors by returning true since the end result is the same
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
   * Lists objects in a given directory (folder)
   * 
   * This method retrieves all files and subfolders in the specified directory.
   * It returns both a list of object metadata and a list of directory prefixes.
   * 
   * @param prefix - Path to the directory to list (e.g., 'documents/reports')
   * @param delimiter - Optional delimiter character (not used in this implementation)
   * @returns A Promise that resolves to a StorageListResult containing objects and prefixes
   * 
   * @remarks
   * - The `objects` array in the result includes both files and folders
   * - The `prefixes` array includes only folder paths (with trailing slashes)
   * - Returns empty arrays if the directory doesn't exist or an error occurs
   * 
   * @example
   * ```typescript
   * // List all files and folders in the 'documents' directory
   * const result = await storage.ListObjects('documents');
   * 
   * // Process files
   * for (const obj of result.objects) {
   *   console.log(`Name: ${obj.name}, Size: ${obj.size}, Type: ${obj.isDirectory ? 'Folder' : 'File'}`);
   * }
   * 
   * // Process subfolders
   * for (const prefix of result.prefixes) {
   *   console.log(`Subfolder: ${prefix}`);
   * }
   * ```
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
   * Creates a directory (folder) in SharePoint
   * 
   * This method creates a new folder at the specified path. The parent directory
   * must already exist.
   * 
   * @param directoryPath - Path where the directory should be created (e.g., 'documents/new-folder')
   * @returns A Promise that resolves to true if successful, false if an error occurs
   * 
   * @remarks
   * - If a folder with the same name already exists, the operation will fail
   * - The parent directory must exist for the operation to succeed
   * - Trailing slashes in the path are automatically removed
   * 
   * @example
   * ```typescript
   * // Create a new folder
   * const createResult = await storage.CreateDirectory('documents/2024-reports');
   * 
   * if (createResult) {
   *   console.log('Folder created successfully');
   *   
   *   // Now we can put files in this folder
   *   await storage.PutObject(
   *     'documents/2024-reports/q1-results.xlsx',
   *     fileContent,
   *     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
   *   );
   * } else {
   *   console.error('Failed to create folder');
   * }
   * ```
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
   * Deletes a directory (folder) and optionally its contents
   * 
   * This method deletes a folder from SharePoint. By default, it will only delete
   * empty folders unless the recursive parameter is set to true.
   * 
   * @param directoryPath - Path to the directory to delete (e.g., 'archive/old-reports')
   * @param recursive - If true, delete the directory and all its contents; if false, only delete if empty
   * @returns A Promise that resolves to true if successful, false if an error occurs
   * 
   * @remarks
   * - If recursive=false and the directory contains files, the operation will fail
   * - SharePoint deleted items may be recoverable from the recycle bin depending on site settings
   * - Trailing slashes in the path are automatically removed
   * 
   * @example
   * ```typescript
   * // Attempt to delete an empty folder
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
   *   console.log(`Size: ${metadata.size} bytes`);
   *   console.log(`Content Type: ${metadata.contentType}`);
   *   console.log(`Last Modified: ${metadata.lastModified}`);
   *   console.log(`Is Directory: ${metadata.isDirectory}`);
   * } catch (error) {
   *   console.error('Error getting metadata:', error.message);
   * }
   * ```
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
   * Downloads a file's contents
   * 
   * This method retrieves the raw content of a file as a Buffer.
   * 
   * @param objectName - Path to the file to download (e.g., 'documents/report.pdf')
   * @returns A Promise that resolves to a Buffer containing the file's contents
   * @throws Error if the file doesn't exist or cannot be downloaded
   * 
   * @remarks
   * - This method uses the Graph API's download URL to retrieve the file contents
   * - The method will throw an error if the object is a folder
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
   *   // For binary files, you can write the buffer to a local file
   *   // or process it as needed
   * } catch (error) {
   *   console.error('Error downloading file:', error.message);
   * }
   * ```
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
   * Uploads a file to SharePoint
   * 
   * This method uploads a file to SharePoint at the specified path. It automatically
   * determines whether to use a simple upload or a chunked upload based on file size.
   * 
   * @param objectName - Path where the file should be uploaded (e.g., 'documents/report.pdf')
   * @param data - Buffer containing the file content
   * @param contentType - Optional MIME type of the file (if not provided, it will be guessed from the filename)
   * @param metadata - Optional metadata to associate with the file (not used in SharePoint implementation)
   * @returns A Promise that resolves to true if successful, false if an error occurs
   * 
   * @remarks
   * - Files smaller than 4MB use a simple upload
   * - Files 4MB or larger use a chunked upload session for better reliability
   * - Automatically creates the parent folder structure if it doesn't exist
   * - If a file with the same name exists, it will be replaced
   * 
   * @example
   * ```typescript
   * // Create a text file
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
   * - The parent folder of the destination must exist
   * - Both files and folders can be copied
   * - The operation is asynchronous in SharePoint and may not complete immediately
   * 
   * @example
   * ```typescript
   * // Copy a file to a new location with a different name
   * const copyResult = await storage.CopyObject(
   *   'templates/financial-report.xlsx',
   *   'reports/2024/q1-financial-report.xlsx'
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