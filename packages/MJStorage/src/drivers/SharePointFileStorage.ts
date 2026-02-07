import { Client } from '@microsoft/microsoft-graph-client';
import { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import * as mime from 'mime-types';
import {
  CreatePreAuthUploadUrlPayload,
  FileSearchOptions,
  FileSearchResult,
  FileSearchResultSet,
  FileStorageBase,
  GetObjectParams,
  GetObjectMetadataParams,
  StorageListResult,
  StorageObjectMetadata,
  UnsupportedOperationError,
} from '../generic/FileStorageBase';
import { getProviderConfig } from '../config';

// Define types for Microsoft OAuth token response
interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  ext_expires_in?: number;
  token_type: string;
}

/**
 * Callback type for persisting refreshed tokens to the database.
 * This is called when a new refresh token is obtained (some providers issue new refresh tokens on each refresh).
 */
type TokenRefreshCallback = (newRefreshToken: string, newAccessToken?: string) => Promise<void>;

import { StorageProviderConfig } from '../generic/FileStorageBase';

/**
 * Configuration interface for SharePoint storage provider with OAuth2 refresh token flow.
 * Used when initializing the provider with user-specific OAuth credentials.
 * Extends StorageProviderConfig to include accountId and accountName.
 */
interface SharePointOAuthConfig extends StorageProviderConfig {
  /** OAuth2 Client ID (from Azure AD app registration) */
  clientID?: string;
  /** OAuth2 Client Secret (from Azure AD app registration) */
  clientSecret?: string;
  /** OAuth2 Refresh Token (obtained from OAuth flow, used to get new access tokens) */
  refreshToken?: string;
  /** Azure AD Tenant ID (use 'common' for multi-tenant or 'consumers' for personal accounts) */
  tenantID?: string;
  /** SharePoint Site ID (optional - can be determined from user's OneDrive if not specified) */
  siteID?: string;
  /** Drive ID (document library ID - optional, defaults to user's OneDrive) */
  driveID?: string;
  /** Optional root folder ID to restrict operations to a specific folder */
  rootFolderID?: string;
  /** Callback to persist new tokens when they are refreshed */
  onTokenRefresh?: TokenRefreshCallback;
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
      grant_type: 'client_credentials',
    });

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: data,
    });

    if (!response.ok) {
      throw new Error(`Failed to get access token: ${response.statusText}`);
    }

    const json = (await response.json()) as MicrosoftTokenResponse;
    this.accessToken = json.access_token;

    // Set token expiration time (subtract 5 minutes as a buffer)
    const expiresIn = json.expires_in || 3600;
    this.tokenExpiration = new Date(Date.now() + (expiresIn - 300) * 1000);

    return this.accessToken;
  }
}

/**
 * Implementation of the Microsoft Graph API AuthenticationProvider interface
 * that uses the OAuth2 refresh token flow for per-user authentication.
 *
 * This provider handles token acquisition using a refresh token, enabling
 * users to access their own OneDrive/SharePoint files rather than a shared
 * service account.
 *
 * @remarks
 * This class is designed for scenarios where each user authenticates with
 * their own Microsoft account via OAuth. The refresh token is obtained
 * through the OAuth authorization code flow and stored per-user.
 */
class RefreshTokenAuthProvider implements AuthenticationProvider {
  /**
   * Azure AD application (client) ID
   */
  private clientId: string;

  /**
   * Azure AD application client secret
   */
  private clientSecret: string;

  /**
   * OAuth2 refresh token for obtaining new access tokens
   */
  private refreshToken: string;

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
   * Callback to persist new tokens when they are refreshed
   */
  private onTokenRefresh?: TokenRefreshCallback;

  /**
   * Creates a new RefreshTokenAuthProvider instance
   *
   * @param clientId - The Azure AD application (client) ID
   * @param clientSecret - The Azure AD application client secret
   * @param refreshToken - The OAuth2 refresh token
   * @param tenantId - The Azure AD tenant ID (use 'common' for multi-tenant)
   * @param onTokenRefresh - Optional callback to persist new tokens
   */
  constructor(clientId: string, clientSecret: string, refreshToken: string, tenantId: string = 'common', onTokenRefresh?: TokenRefreshCallback) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.tokenEndpoint = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    this.onTokenRefresh = onTokenRefresh;
  }

  /**
   * Gets an access token for Microsoft Graph API using the refresh token.
   *
   * This method implements the AuthenticationProvider interface required by the
   * Microsoft Graph client. It uses the refresh token to obtain a new access token
   * when needed, and caches the token until it expires.
   *
   * @returns A Promise that resolves to the access token string
   * @throws Error if token acquisition fails
   */
  public async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiration && this.tokenExpiration > new Date()) {
      return this.accessToken;
    }

    console.log('[SharePoint RefreshTokenAuth] Refreshing access token...');

    const data = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/Files.ReadWrite.All offline_access',
    });

    const response = await fetch(this.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: data,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SharePoint RefreshTokenAuth] Token refresh failed:', errorText);
      throw new Error(`Failed to refresh access token: ${response.statusText}`);
    }

    const json = (await response.json()) as MicrosoftTokenResponse;
    this.accessToken = json.access_token;

    // Set token expiration time (subtract 5 minutes as a buffer)
    const expiresIn = json.expires_in || 3600;
    this.tokenExpiration = new Date(Date.now() + (expiresIn - 300) * 1000);

    console.log('[SharePoint RefreshTokenAuth] Token refreshed successfully, expires:', this.tokenExpiration);

    // Microsoft may return a new refresh token - if so, persist it
    if (json.refresh_token && json.refresh_token !== this.refreshToken) {
      console.log('[SharePoint RefreshTokenAuth] New refresh token received, persisting...');
      this.refreshToken = json.refresh_token;

      if (this.onTokenRefresh) {
        try {
          await this.onTokenRefresh(json.refresh_token, json.access_token);
          console.log('[SharePoint RefreshTokenAuth] New tokens persisted successfully');
        } catch (callbackError) {
          console.error('[SharePoint RefreshTokenAuth] Failed to persist new tokens:', callbackError);
        }
      }
    }

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
  private _client!: Client;

  /**
   * The ID of the SharePoint document library (drive)
   */
  private _driveId!: string;

  /**
   * The ID of the SharePoint site
   */
  private _siteId!: string;

  /**
   * Optional ID of a subfolder to use as the root folder (if specified)
   */
  private _rootFolderId?: string;

  /**
   * OAuth2 Client ID (for per-user OAuth flow)
   */
  private _clientID?: string;

  /**
   * OAuth2 Client Secret (for per-user OAuth flow)
   */
  private _clientSecret?: string;

  /**
   * OAuth2 Refresh Token (for per-user OAuth flow)
   */
  private _refreshToken?: string;

  /**
   * Azure AD Tenant ID
   */
  private _tenantID?: string;

  /**
   * Callback for persisting refreshed tokens
   */
  private _onTokenRefresh?: TokenRefreshCallback;

  /**
   * Creates a new SharePointFileStorage instance
   *
   * This constructor reads configuration from environment variables if available.
   * If no environment variables are set, the provider can be initialized later
   * via the initialize() method with OAuth credentials from the database.
   */
  constructor() {
    super();

    // Try to get config from centralized configuration
    const config = getProviderConfig('sharePoint');

    // Extract values from config, fall back to env vars (don't require them - initialize() may be called later)
    const clientId = config?.clientID || env.get('STORAGE_SHAREPOINT_CLIENT_ID').asString();
    const clientSecret = config?.clientSecret || env.get('STORAGE_SHAREPOINT_CLIENT_SECRET').asString();
    const tenantId = config?.tenantID || env.get('STORAGE_SHAREPOINT_TENANT_ID').asString();
    const siteId = config?.siteID || env.get('STORAGE_SHAREPOINT_SITE_ID').asString();
    const driveId = config?.driveID || env.get('STORAGE_SHAREPOINT_DRIVE_ID').asString();

    // Store OAuth credentials for IsConfigured check
    this._clientID = clientId;
    this._clientSecret = clientSecret;
    this._tenantID = tenantId;

    // Only initialize if we have all required credentials (env/config-based setup)
    if (clientId && clientSecret && tenantId && siteId && driveId) {
      this._siteId = siteId;
      this._driveId = driveId;

      // Optionally set a root folder within the SharePoint drive
      this._rootFolderId = config?.rootFolderID || env.get('STORAGE_SHAREPOINT_ROOT_FOLDER_ID').asString();

      // Initialize Graph client with client credentials auth provider (service account)
      const authProvider = new ClientCredentialsAuthProvider(clientId, clientSecret, tenantId);
      this._client = Client.initWithMiddleware({
        authProvider: authProvider,
      });
    }
    // If credentials not available, initialize() must be called with OAuth config
  }

  /**
   * Checks if SharePoint provider is properly configured.
   * Returns true if the Graph client is initialized and has required IDs.
   * Logs detailed error messages if configuration is incomplete.
   */
  public get IsConfigured(): boolean {
    const hasClient = !!this._client;
    const hasDriveId = !!this._driveId;

    const isConfigured = hasClient && hasDriveId;

    if (!isConfigured) {
      const missing: string[] = [];
      if (!hasClient) missing.push('Graph Client (credentials)');
      if (!hasDriveId) missing.push('Drive ID');

      console.error(
        `❌ SharePoint provider not configured. Missing: ${missing.join(', ')}\n\n` +
        `Configuration Options:\n\n` +
        `Option 1: Environment Variables\n` +
        `  export STORAGE_SHAREPOINT_TENANT_ID="..."\n` +
        `  export STORAGE_SHAREPOINT_CLIENT_ID="..."\n` +
        `  export STORAGE_SHAREPOINT_CLIENT_SECRET="..."\n` +
        `  export STORAGE_SHAREPOINT_SITE_URL="https://tenant.sharepoint.com/sites/sitename"\n` +
        `  const storage = new SharePointFileStorage();\n` +
        `  await storage.initialize(); // No config needed\n\n` +
        `Option 2: Database Credentials (Multi-Tenant)\n` +
        `  const storage = new SharePointFileStorage();\n` +
        `  await storage.initialize({\n` +
        `    accountId: "...",\n` +
        `    tenantID: "...",\n` +
        `    clientID: "...",\n` +
        `    clientSecret: "...",\n` +
        `    siteUrl: "https://tenant.sharepoint.com/sites/sitename"\n` +
        `  });\n`
      );
    }

    return isConfigured;
  }

  /**
   * Initialize SharePoint storage provider with optional configuration.
   *
   * ## Standard Usage Pattern
   *
   * **ALWAYS call this method** after creating a provider instance.
   *
   * ### Simple Deployment (Environment Variables)
   * Constructor loads credentials from environment variables, then call
   * initialize() with no config to complete setup:
   *
   * @example
   * ```typescript
   * const storage = new SharePointFileStorage(); // Constructor loads env vars
   * await storage.initialize(); // No config - uses env vars
   * await storage.ListObjects('/'); // Ready to use
   * ```
   *
   * ### Multi-Tenant Enterprise (Database)
   * Use infrastructure utility which handles credential decryption automatically:
   *
   * @example
   * ```typescript
   * const storage = await initializeDriverWithAccountCredentials({
   *   accountEntity: accountWithProvider.account,
   *   providerEntity: accountWithProvider.provider,
   *   contextUser
   * });
   * await storage.ListObjects('/'); // Credentials already decrypted and initialized
   * ```
   *
   * @param config - Configuration object containing OAuth2 credentials from database
   */
  public async initialize(config?: SharePointOAuthConfig): Promise<void> {
    // Always call super to store accountId and accountName
    await super.initialize(config);

    if (!config) {
      return; // Nothing to do, constructor already handled config from env/file
    }

    console.log('[SharePoint] Initializing with OAuth config...');

    // Update OAuth2 credentials
    this._clientID = config.clientID || this._clientID;
    this._clientSecret = config.clientSecret || this._clientSecret;
    this._refreshToken = config.refreshToken || this._refreshToken;
    this._tenantID = config.tenantID || this._tenantID || 'common';
    this._onTokenRefresh = config.onTokenRefresh;

    // Update site/drive IDs if provided
    if (config.siteID) {
      this._siteId = config.siteID;
    }
    if (config.driveID) {
      this._driveId = config.driveID;
    }
    if (config.rootFolderID) {
      this._rootFolderId = config.rootFolderID;
    }

    // Validate we have required OAuth credentials
    if (!this._clientID || !this._clientSecret || !this._refreshToken) {
      throw new Error('SharePoint OAuth requires clientID, clientSecret, and refreshToken');
    }

    // Initialize the Graph client with refresh token auth provider (per-user OAuth)
    const authProvider = new RefreshTokenAuthProvider(this._clientID, this._clientSecret, this._refreshToken, this._tenantID, this._onTokenRefresh);

    this._client = Client.initWithMiddleware({
      authProvider: authProvider,
    });

    // If no driveID provided, get the user's default OneDrive
    if (!this._driveId) {
      console.log("[SharePoint] No driveID provided, getting user's OneDrive...");
      try {
        const driveResponse = await this._client.api('/me/drive').get();
        this._driveId = driveResponse.id;
        console.log("[SharePoint] Using user's OneDrive:", this._driveId);
      } catch (error) {
        console.error("[SharePoint] Failed to get user's OneDrive:", error);
        throw new Error("Failed to get user's OneDrive. Ensure the refresh token has Files.ReadWrite.All scope.");
      }
    }

    console.log('[SharePoint] Initialized successfully with driveId:', this._driveId);
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

    const pathParts = path.split('/').filter((p) => p);
    let currentFolderId = this._rootFolderId || 'root';

    for (let i = 0; i < pathParts.length; i++) {
      const folderName = pathParts[i];
      const result = await this._client
        .api(`/drives/${this._driveId}/items/${currentFolderId}/children`)
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
      const driveRoot = this._rootFolderId ? `/drives/${this._driveId}/items/${this._rootFolderId}` : `/drives/${this._driveId}/root`;

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
      customMetadata: {},
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
      const downloadUrl = await this._client.api(`/drives/${this._driveId}/items/${item.id}/createLink`).post({
        type: 'view',
        scope: 'anonymous',
        expirationDateTime: new Date(Date.now() + 10 * 60 * 1000).toISOString(), // 10 minutes
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
      await this._client.api(`/drives/${this._driveId}/items/${item.id}`).update({
        name: newName,
        parentReference: {
          id: parentFolderId,
        },
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
      await this._client.api(`/drives/${this._driveId}/items/${item.id}`).delete();

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
          const folderPath = prefix ? (prefix.endsWith('/') ? `${prefix}${item.name}` : `${prefix}/${item.name}`) : item.name;

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
      const normalizedPath = directoryPath.endsWith('/') ? directoryPath.substring(0, directoryPath.length - 1) : directoryPath;

      // Parse the path to get the parent folder and new folder name
      const pathParts = normalizedPath.split('/');
      const folderName = pathParts.pop() || '';
      const parentPath = pathParts.join('/');

      // Get the parent folder ID
      const parentFolderId = await this._getParentFolderIdByPath(parentPath);

      // Create the folder
      await this._client.api(`/drives/${this._driveId}/items/${parentFolderId}/children`).post({
        name: folderName,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'fail',
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
      const normalizedPath = directoryPath.endsWith('/') ? directoryPath.substring(0, directoryPath.length - 1) : directoryPath;

      const folder = await this._getItemByPath(normalizedPath);

      if (!recursive) {
        // Check if folder is empty
        const children = await this._client.api(`/drives/${this._driveId}/items/${folder.id}/children`).get();

        if (children.value && children.value.length > 0) {
          throw new Error('Directory is not empty');
        }
      }

      // Delete the folder (SharePoint will delete recursively by default)
      await this._client.api(`/drives/${this._driveId}/items/${folder.id}`).delete();

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
   * @param params - Object identifier (prefer objectId for performance, fallback to fullPath)
   * @returns A Promise that resolves to a StorageObjectMetadata object
   * @throws Error if the object doesn't exist or cannot be accessed
   *
   * @example
   * ```typescript
   * try {
   *   // Fast path: Use objectId (SharePoint item ID)
   *   const metadata = await storage.GetObjectMetadata({ objectId: '01BYE5RZ6QN3VYRVNHHFDK2QJODWDDFR4E' });
   *
   *   // Slow path: Use path
   *   const metadata2 = await storage.GetObjectMetadata({ fullPath: 'presentations/quarterly-update.pptx' });
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
  public async GetObjectMetadata(params: GetObjectMetadataParams): Promise<StorageObjectMetadata> {
    try {
      // Validate params
      if (!params.objectId && !params.fullPath) {
        throw new Error('Either objectId or fullPath must be provided');
      }

      let item: any;

      // Fast path: Use objectId if provided
      if (params.objectId) {
        console.log(`⚡ Fast path: Using Object ID directly: ${params.objectId}`);
        item = await this._client.api(`/drives/${this._driveId}/items/${params.objectId}`).get();
      } else {
        // Slow path: Resolve path to item
        console.log(`🐌 Slow path: Resolving path "${params.fullPath}" to ID`);
        item = await this._getItemByPath(params.fullPath!);
      }

      return this._itemToMetadata(item);
    } catch (error) {
      console.error('Error getting object metadata', { params, error });
      throw new Error(`Object not found: ${params.objectId || params.fullPath}`);
    }
  }

  /**
   * Downloads a file's contents
   *
   * This method retrieves the raw content of a file as a Buffer.
   *
   * @param params - Object identifier (prefer objectId for performance, fallback to fullPath)
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
   *   // Fast path: Use objectId (SharePoint item ID)
   *   const fileContent = await storage.GetObject({ objectId: '01BYE5RZ6QN3VYRVNHHFDK2QJODWDDFR4E' });
   *
   *   // Slow path: Use path
   *   const fileContent2 = await storage.GetObject({ fullPath: 'documents/notes.txt' });
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
  public async GetObject(params: GetObjectParams): Promise<Buffer> {
    try {
      // Validate params
      if (!params.objectId && !params.fullPath) {
        throw new Error('Either objectId or fullPath must be provided');
      }

      let item: any;

      // Fast path: Use objectId if provided
      if (params.objectId) {
        console.log(`⚡ Fast path: Using Object ID directly: ${params.objectId}`);
        item = await this._client.api(`/drives/${this._driveId}/items/${params.objectId}`).get();
      } else {
        // Slow path: Resolve path to item
        console.log(`🐌 Slow path: Resolving path "${params.fullPath}" to ID`);
        item = await this._getItemByPath(params.fullPath!);
      }

      // Get the content
      const response = await fetch(item['@microsoft.graph.downloadUrl']);

      if (!response.ok) {
        throw new Error(`Failed to download item: ${response.statusText}`);
      }

      // Convert response to buffer
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Error getting object', { params, error });
      throw new Error(`Failed to get object: ${params.objectId || params.fullPath}`);
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
  public async PutObject(objectName: string, data: Buffer, contentType?: string, metadata?: Record<string, string>): Promise<boolean> {
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
        await this._client.api(`/drives/${this._driveId}/items/${parentFolderId}:/${fileName}:/content`).put(data);
      } else {
        // For larger files, use upload session
        // Create upload session
        const uploadSession = await this._client.api(`/drives/${this._driveId}/items/${parentFolderId}:/${fileName}:/createUploadSession`).post({
          item: {
            '@microsoft.graph.conflictBehavior': 'replace',
          },
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
              'Content-Range': contentRange,
            },
            body: chunk as BodyInit,
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
      await this._client.api(`/drives/${this._driveId}/items/${sourceItem.id}/copy`).post({
        parentReference: {
          id: destParentId,
        },
        name: destName,
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
      const normalizedPath = directoryPath.endsWith('/') ? directoryPath.substring(0, directoryPath.length - 1) : directoryPath;

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

  /**
   * Search files in SharePoint using Microsoft Graph Search API.
   *
   * This method provides powerful search capabilities using KQL (Keyword Query Language),
   * SharePoint's native query language. The search can target file names, metadata, and
   * optionally file contents.
   *
   * @param query - The search query string. Can be plain text or use KQL syntax for advanced queries.
   * @param options - Optional search configuration including filters, limits, and content search
   * @returns A Promise resolving to FileSearchResultSet with matched files and pagination info
   *
   * @remarks
   * **KQL Query Syntax Examples:**
   * - Simple text: `"quarterly report"` - searches for files containing these terms
   * - Boolean operators: `"budget AND 2024"`, `"draft OR final"`, `"report NOT internal"`
   * - Wildcards: `"proj*"` matches "project", "projection", etc.
   * - Property filters: `"FileType:pdf"`, `"Author:John Smith"`, `"Size>1000000"`
   * - Date filters: `"Created>=2024-01-01"`, `"LastModifiedTime<2024-12-31"`
   * - Proximity: `"project NEAR report"` - finds terms near each other
   * - Exact phrases: `"\"annual budget report\""` - exact phrase match
   *
   * **Additional Filtering:**
   * The method automatically adds KQL filters based on the provided options:
   * - `fileTypes`: Adds FileType filters (e.g., `FileType:pdf OR FileType:docx`)
   * - `modifiedAfter`/`modifiedBefore`: Adds LastModifiedTime filters
   * - `pathPrefix`: Adds Path filter to restrict search to a directory
   * - `searchContent`: When false, restricts search to filename only
   *
   * @example
   * ```typescript
   * // Simple text search in filenames
   * const results = await storage.SearchFiles('quarterly report', {
   *   maxResults: 20
   * });
   *
   * // Search for PDFs only
   * const pdfResults = await storage.SearchFiles('budget', {
   *   fileTypes: ['pdf'],
   *   maxResults: 50
   * });
   *
   * // Search with date range
   * const recentResults = await storage.SearchFiles('meeting notes', {
   *   modifiedAfter: new Date('2024-01-01'),
   *   modifiedBefore: new Date('2024-12-31'),
   *   searchContent: true
   * });
   *
   * // Search within specific directory
   * const folderResults = await storage.SearchFiles('presentation', {
   *   pathPrefix: 'documents/reports',
   *   fileTypes: ['pptx', 'pdf']
   * });
   *
   * // Advanced KQL query
   * const advancedResults = await storage.SearchFiles(
   *   'FileType:xlsx AND Created>=2024-01-01 AND Author:"John Smith"',
   *   { maxResults: 100 }
   * );
   * ```
   */
  public async SearchFiles(query: string, options?: FileSearchOptions): Promise<FileSearchResultSet> {
    try {
      const maxResults = options?.maxResults || 100;

      // Build KQL query from options
      const kqlQuery = this.buildKQLQuery(query, options);

      // Prepare the search request payload
      const searchRequest = {
        requests: [
          {
            entityTypes: ['driveItem'],
            query: {
              queryString: kqlQuery,
            },
            from: 0,
            size: maxResults,
            fields: ['name', 'path', 'size', 'lastModifiedDateTime', 'fileSystemInfo', 'webUrl', 'id', 'contentType'],
          },
        ],
      };

      // Execute the search
      const response = await this._client.api('/search/query').post(searchRequest);

      // Transform results
      return this.transformSearchResults(response, maxResults);
    } catch (error) {
      console.error('Error searching files in SharePoint', { query, options, error });
      // Throw error so caller knows search failed
      throw new Error(`SharePoint search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Builds a KQL (Keyword Query Language) query string from the base query and search options.
   *
   * This helper method constructs a properly formatted KQL query by combining the user's
   * search query with filters derived from FileSearchOptions. It handles file type filters,
   * date range filters, path restrictions, and content search options.
   *
   * @param baseQuery - The user's search query (plain text or KQL)
   * @param options - Optional search options to convert into KQL filters
   * @returns A complete KQL query string
   * @private
   */
  private buildKQLQuery(baseQuery: string, options?: FileSearchOptions): string {
    const queryParts: string[] = [];

    // Add base query if provided
    if (baseQuery && baseQuery.trim()) {
      queryParts.push(`(${baseQuery})`);
    }

    // Restrict to this specific drive
    queryParts.push(`(Path:"${this._siteId}/${this._driveId}")`);

    // Add path prefix filter if specified
    if (options?.pathPrefix) {
      const normalizedPrefix = options.pathPrefix.startsWith('/') ? options.pathPrefix.substring(1) : options.pathPrefix;
      queryParts.push(`(Path:"${this._siteId}/${this._driveId}/${normalizedPrefix}*")`);
    }

    // Add file type filters if specified
    if (options?.fileTypes && options.fileTypes.length > 0) {
      const fileTypeFilters = options.fileTypes
        .map((fileType) => {
          // Handle both extensions (pdf) and MIME types (application/pdf)
          if (fileType.includes('/')) {
            // It's a MIME type
            return `ContentType:"${fileType}"`;
          } else {
            // It's a file extension
            const extension = fileType.startsWith('.') ? fileType.substring(1) : fileType;
            return `FileType:${extension}`;
          }
        })
        .join(' OR ');

      queryParts.push(`(${fileTypeFilters})`);
    }

    // Add date filters if specified
    if (options?.modifiedAfter) {
      const dateString = options.modifiedAfter.toISOString().split('T')[0];
      queryParts.push(`(LastModifiedTime>=${dateString})`);
    }

    if (options?.modifiedBefore) {
      const dateString = options.modifiedBefore.toISOString().split('T')[0];
      queryParts.push(`(LastModifiedTime<=${dateString})`);
    }

    // Restrict to filename search if content search is disabled
    if (options?.searchContent === false && baseQuery && baseQuery.trim()) {
      // Remove the base query and add it as a filename-only search
      queryParts.shift(); // Remove the base query we added earlier
      queryParts.unshift(`(filename:${baseQuery})`);
    }

    // Combine all parts with AND
    return queryParts.join(' AND ');
  }

  /**
   * Transforms Microsoft Graph Search API response into FileSearchResultSet format.
   *
   * This helper method processes the raw search response from the Graph API,
   * extracting relevant file information and converting it to the standard
   * FileSearchResult format. It handles pagination info and calculates relevance scores.
   *
   * @param response - The raw response from Microsoft Graph Search API
   * @param maxResults - The maximum number of results requested
   * @returns A FileSearchResultSet with transformed results
   * @private
   */
  private transformSearchResults(response: any, maxResults: number): FileSearchResultSet {
    const results: FileSearchResult[] = [];
    let totalMatches = 0;
    let hasMore = false;

    // Navigate the response structure
    if (response.value && response.value.length > 0) {
      const searchResponse = response.value[0];

      if (searchResponse.hitsContainers && searchResponse.hitsContainers.length > 0) {
        const hitsContainer = searchResponse.hitsContainers[0];
        totalMatches = hitsContainer.total || 0;
        hasMore = hitsContainer.moreResultsAvailable || false;

        if (hitsContainer.hits && hitsContainer.hits.length > 0) {
          for (const hit of hitsContainer.hits) {
            const resource = hit.resource;

            // Skip if not a file (e.g., folders)
            if (!resource || resource.folder) {
              continue;
            }

            // Extract file information
            const result: FileSearchResult = {
              path: this.extractPathFromResource(resource),
              name: resource.name || '',
              size: resource.size || 0,
              contentType: resource.file?.mimeType || mime.lookup(resource.name) || 'application/octet-stream',
              lastModified: resource.lastModifiedDateTime ? new Date(resource.lastModifiedDateTime) : new Date(),
              objectId: resource.id || '', // SharePoint item ID for direct access
              relevance: hit.rank ? hit.rank / 100.0 : undefined,
              excerpt: hit.summary || undefined,
              matchInFilename: this.determineMatchLocation(hit),
              providerData: {
                id: resource.id,
                webUrl: resource.webUrl,
                driveId: this._driveId,
                siteId: this._siteId,
              },
            };

            results.push(result);
          }
        }
      }
    }

    return {
      results,
      totalMatches,
      hasMore,
    };
  }

  /**
   * Extracts the file path from a SharePoint resource object.
   *
   * This helper method processes the path information from a Graph API resource,
   * removing the drive and site prefixes to return just the file path relative
   * to the configured root folder.
   *
   * @param resource - The resource object from Graph API search results
   * @returns The relative file path
   * @private
   */
  private extractPathFromResource(resource: any): string {
    // Try to get path from parentReference
    if (resource.parentReference?.path) {
      let path = resource.parentReference.path;

      // Remove the drive/site prefix
      const pathParts = path.split(':');
      if (pathParts.length > 1) {
        path = pathParts[1];
      }

      // Remove leading slash
      path = path.startsWith('/') ? path.substring(1) : path;

      // Remove root folder prefix if configured
      if (this._rootFolderId && path.startsWith(this._rootFolderId)) {
        path = path.substring(this._rootFolderId.length);
        path = path.startsWith('/') ? path.substring(1) : path;
      }

      // Combine with filename
      return path ? `${path}/${resource.name}` : resource.name;
    }

    // Fallback to just the filename
    return resource.name || '';
  }

  /**
   * Determines whether the search match was in the filename or content.
   *
   * This helper method analyzes the hit metadata to determine if the search
   * term was found in the filename versus the file content.
   *
   * @param hit - The search hit object from Graph API
   * @returns True if match was in filename, false if in content, undefined if unknown
   * @private
   */
  private determineMatchLocation(hit: any): boolean | undefined {
    // Check if summary exists (indicates content match)
    if (hit.summary && hit.summary.length > 0) {
      return false; // Match in content
    }

    // If no summary but we have a hit, likely a filename match
    if (hit.resource?.name) {
      return true; // Match in filename
    }

    return undefined;
  }
}
