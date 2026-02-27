import { MJFileStorageProviderEntity, MJFileStorageAccountEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import { LogStatus, UserInfo } from '@memberjunction/core';
import { CredentialEngine } from '@memberjunction/credentials';
import mime from 'mime-types';
import { FileStorageBase, FileSearchOptions, FileSearchResult, StorageProviderConfig } from './generic/FileStorageBase';

/**
 * Callback function called when a new refresh token is issued.
 * This is important for providers like Box that issue new refresh tokens with each refresh.
 */
export type TokenRefreshCallback = (newRefreshToken: string, newAccessToken?: string) => Promise<void>;

/**
 * Configuration for OAuth-enabled storage providers.
 * This is the format expected by the Google Drive and similar OAuth-based drivers.
 */
export interface OAuthStorageConfig {
  /** OAuth2 Client ID (from app registration) */
  clientID: string;
  /** OAuth2 Client Secret (from app registration) */
  clientSecret: string;
  /** User's OAuth refresh token (long-lived) */
  refreshToken: string;
  /** Optional root folder ID to restrict operations */
  rootFolderID?: string;
  /**
   * Callback called when a new refresh token is issued.
   * Required for providers like Box that issue new refresh tokens with each token refresh.
   */
  onTokenRefresh?: TokenRefreshCallback;
}

/**
 * Options for initializing a storage driver with user-specific credentials.
 */
export interface UserStorageDriverOptions {
  /** The file storage provider entity */
  providerEntity: MJFileStorageProviderEntity;
  /** The user's ID for loading their OAuth tokens */
  userID: string;
  /** Context user for database operations */
  contextUser: UserInfo;
}

/**
 * @deprecated This function is being replaced by the enterprise file storage model.
 * Use FileStorageAccount with Credential Engine instead.
 *
 * Initializes a storage driver with user-specific OAuth credentials.
 * NOTE: This function currently only supports non-OAuth providers.
 * OAuth provider support will be added via the Credential Engine integration.
 *
 * @param options - Configuration options including provider, user ID, and context
 * @returns A promise resolving to an initialized FileStorageBase driver
 * @throws Error if the provider requires OAuth (not yet supported in enterprise model)
 */
export async function initializeDriverWithUserCredentials(options: UserStorageDriverOptions): Promise<FileStorageBase> {
  const { providerEntity } = options;

  // Create the driver instance
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

  // Check if this provider requires OAuth authentication
  if (providerEntity.RequiresOAuth) {
    // TODO: Implement Credential Engine integration for OAuth providers
    // This will load credentials from FileStorageAccount -> Credential
    throw new Error(
      `Provider "${providerEntity.Name}" requires OAuth authentication. ` + `Enterprise OAuth support via Credential Engine is not yet implemented.`,
    );
  } else {
    // Provider doesn't require OAuth - use admin/global configuration
    const configJson = providerEntity.Configuration;
    if (configJson) {
      const config = JSON.parse(configJson);
      await driver.initialize(config);
      console.log(`[initializeDriverWithUserCredentials] Initialized ${providerEntity.Name} with admin configuration`);
    }
  }

  return driver;
}

// TODO: This will be replaced with Credential Engine integration
// The loadUserOAuthCredentials function has been removed as part of the
// enterprise file storage refactoring. Credentials will be loaded from
// the FileStorageAccount -> Credential relationship using the Credential Engine.

/**
 * Options for user context in storage operations.
 * Required for OAuth providers to access user-specific credentials.
 */
export interface UserContextOptions {
  /** The user's ID for loading their OAuth tokens */
  userID: string;
  /** Context user for database operations */
  contextUser: UserInfo;
}

/**
 * Options for initializing a storage driver with account-based credentials.
 * This is the new enterprise model where credentials are stored in FileStorageAccount.
 */
export interface AccountStorageDriverOptions {
  /** The file storage account entity (contains CredentialID) */
  accountEntity: MJFileStorageAccountEntity;
  /** The file storage provider entity (contains driver configuration) */
  providerEntity: MJFileStorageProviderEntity;
  /** Context user for database operations and credential access */
  contextUser: UserInfo;
}

/**
 * Initializes a storage driver using account-based credentials from the Credential Engine.
 * This is the enterprise model where credentials are stored in the Credential entity
 * and decrypted at runtime.
 *
 * For providers that issue new refresh tokens on each token refresh (like Box.com),
 * this function automatically configures a callback to persist the new tokens back
 * to the Credential entity in the database.
 *
 * @param options - Configuration options including account, provider, and context user
 * @returns A promise resolving to an initialized FileStorageBase driver
 *
 * @example
 * ```typescript
 * const driver = await initializeDriverWithAccountCredentials({
 *   accountEntity,
 *   providerEntity,
 *   contextUser
 * });
 *
 * // Driver is now ready to use
 * const objects = await driver.ListObjects('/');
 * ```
 */
export async function initializeDriverWithAccountCredentials(options: AccountStorageDriverOptions): Promise<FileStorageBase> {
  const { accountEntity, providerEntity, contextUser } = options;

  // Create the driver instance using the provider's driver key
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

  if (!driver) {
    throw new Error(`Failed to create storage driver for provider "${providerEntity.Name}" ` + `with driver key "${providerEntity.ServerDriverKey}"`);
  }

  // Build the base config with account information (required in enterprise model)
  const baseConfig: StorageProviderConfig = {
    accountId: accountEntity.ID,
    accountName: accountEntity.Name,
  };

  // Check if the account has a credential configured
  if (accountEntity.CredentialID) {
    // Initialize the Credential Engine if not already done
    await CredentialEngine.Instance.Config(false, contextUser);

    // Get the credential by ID and decrypt it
    const credentialEntity = CredentialEngine.Instance.getCredentialById(accountEntity.CredentialID);

    if (!credentialEntity) {
      throw new Error(`Credential with ID ${accountEntity.CredentialID} not found for account "${accountEntity.Name}"`);
    }

    // Resolve the credential to get decrypted values
    const resolved = await CredentialEngine.Instance.getCredential(credentialEntity.Name, {
      credentialId: accountEntity.CredentialID,
      contextUser,
      subsystem: 'FileStorage',
    });

    LogStatus(`[initializeDriverWithAccountCredentials] Decrypted credential "${credentialEntity.Name}" for account "${accountEntity.Name}"`);

    // Create a token refresh callback to persist new tokens back to the database
    // This is critical for providers like Box.com that issue new refresh tokens on each refresh
    const onTokenRefresh: TokenRefreshCallback = async (newRefreshToken: string, newAccessToken?: string) => {
      try {
        LogStatus(`[initializeDriverWithAccountCredentials] Token refresh callback invoked for account "${accountEntity.Name}"`);

        // Get the current credential values and update with new tokens
        const updatedValues: Record<string, string> = { ...resolved.values };
        updatedValues.refreshToken = newRefreshToken;
        if (newAccessToken) {
          updatedValues.accessToken = newAccessToken;
        }

        // Update the credential in the database using the Credential Engine
        await CredentialEngine.Instance.updateCredential(accountEntity.CredentialID, updatedValues, contextUser);

        LogStatus(`[initializeDriverWithAccountCredentials] Successfully persisted new tokens for account "${accountEntity.Name}"`);
      } catch (error) {
        // Log the error but don't throw - the driver still has the tokens in memory
        // and can continue operating. However, the next server restart will fail.
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[initializeDriverWithAccountCredentials] Failed to persist new tokens for account "${accountEntity.Name}": ${errorMessage}`);
        console.error(`[initializeDriverWithAccountCredentials] WARNING: Authentication may fail after server restart!`);
      }
    };

    // Add the token refresh callback to the config
    baseConfig.onTokenRefresh = onTokenRefresh;

    // Initialize the driver with account info + decrypted credential values + token refresh callback
    await driver.initialize({
      ...baseConfig,
      ...resolved.values,
    });
  } else {
    // No credential configured - fall back to provider's static configuration
    const configJson = providerEntity.Configuration;
    if (configJson) {
      const config = JSON.parse(configJson);
      // Merge account info with provider configuration
      await driver.initialize({
        ...baseConfig,
        ...config,
      });
      LogStatus(`[initializeDriverWithAccountCredentials] Initialized "${accountEntity.Name}" with provider configuration (no credential)`);
    } else {
      // Initialize with just account info (driver may use env vars or other config)
      await driver.initialize(baseConfig);
      LogStatus(`[initializeDriverWithAccountCredentials] Warning: No credential or configuration for account "${accountEntity.Name}"`);
    }
  }

  return driver;
}

/**
 * Extended user context options that can also include account information
 * for the enterprise credential model.
 */
export interface ExtendedUserContextOptions extends UserContextOptions {
  /** Optional account entity for enterprise credential model */
  accountEntity?: MJFileStorageAccountEntity;
}

/**
 * Internal helper to initialize a storage driver with appropriate credentials.
 *
 * Supports two modes:
 * 1. Enterprise model (preferred): When accountEntity is provided in userContext,
 *    uses the Credential Engine to decrypt credentials from the account's CredentialID.
 * 2. Legacy model: Uses provider configuration or throws for OAuth providers.
 *
 * @param providerEntity - The file storage provider entity
 * @param userContext - Optional user context, may include accountEntity for enterprise model
 * @returns An initialized FileStorageBase driver
 */
async function initializeDriver(providerEntity: MJFileStorageProviderEntity, userContext?: ExtendedUserContextOptions): Promise<FileStorageBase> {
  // Enterprise model: Use account-based credentials if accountEntity is provided
  if (userContext?.accountEntity) {
    return initializeDriverWithAccountCredentials({
      accountEntity: userContext.accountEntity,
      providerEntity,
      contextUser: userContext.contextUser,
    });
  }

  // Legacy model: Use the deprecated user credentials approach
  if (userContext) {
    return initializeDriverWithUserCredentials({
      providerEntity,
      userID: userContext.userID,
      contextUser: userContext.contextUser,
    });
  }

  // No user context - use admin/legacy initialization
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

  // Check if this provider requires OAuth but no user context was provided
  if (providerEntity.RequiresOAuth) {
    throw new Error(`Provider "${providerEntity.Name}" requires OAuth authentication. ` + `Please provide userContext parameter with userID and contextUser.`);
  }

  // Initialize with admin configuration
  const configJson = providerEntity.Get('Configuration') as string | null;
  if (configJson) {
    const config = JSON.parse(configJson);
    await driver.initialize(config);
  }

  return driver;
}

/**
 * Creates a pre-authenticated upload URL for a file in the specified file storage provider.
 *
 * This utility function simplifies the process of creating upload URLs by handling common
 * tasks such as:
 * - Setting the content type based on the file extension if not provided
 * - Setting the file status to 'Uploading'
 * - Managing the provider key if returned by the storage provider
 *
 * The function returns both the updated input object (with additional metadata) and the
 * pre-authenticated upload URL that can be used by clients to upload the file directly
 * to the storage provider.
 *
 * @param providerEntity - The file storage provider entity containing connection details
 * @param input - The input object containing the file details:
 *               - ID: A unique identifier for the file
 *               - Name: The filename to use for storage
 *               - ProviderID: The ID of the storage provider to use
 *               - ContentType: (Optional) The MIME type of the file
 *               - ProviderKey: (Optional) Provider-specific key for the file
 * @param userContext - Optional user context for OAuth providers (required if provider.RequiresOAuth is true)
 * @returns A promise that resolves to an object containing:
 *         - updatedInput: The input object with additional metadata (Status, ContentType, and possibly ProviderKey)
 *         - UploadUrl: The pre-authenticated URL for uploading the file
 *
 * @example
 * ```typescript
 * // Create a pre-authenticated upload URL for a PDF document
 * const fileStorageProvider = await entityMgr.FindById('FileStorageProvider', 'azure-main');
 * const result = await createUploadUrl(
 *   fileStorageProvider,
 *   {
 *     ID: '123',
 *     Name: 'report.pdf',
 *     ProviderID: fileStorageProvider.ID
 *   },
 *   { userID: currentUser.ID, contextUser } // Required for OAuth providers
 * );
 *
 * // The content type is automatically determined from the file extension
 * console.log(result.updatedInput.ContentType); // 'application/pdf'
 *
 * // The status is set to 'Uploading'
 * console.log(result.updatedInput.Status); // 'Uploading'
 *
 * // The upload URL can be sent to the client for direct upload
 * console.log(result.UploadUrl);
 * ```
 */
export const createUploadUrl = async <TInput extends { ID: string; Name: string; ProviderID: string; ContentType?: string; ProviderKey?: string }>(
  providerEntity: MJFileStorageProviderEntity,
  input: TInput,
  userContext?: UserContextOptions,
): Promise<{
  updatedInput: TInput & { Status: string; ContentType: string };
  UploadUrl: string;
}> => {
  const { Name, ProviderID } = input;

  const ContentType = input.ContentType ?? mime.lookup(input.Name) ?? 'application/octet-stream';
  const Status = 'Uploading';

  await providerEntity.Load(ProviderID);

  // Initialize driver with user credentials if available, otherwise use admin config
  const driver = await initializeDriver(providerEntity, userContext);

  const { UploadUrl, ...maybeProviderKey } = await driver.CreatePreAuthUploadUrl(Name);
  const updatedInput = { ...input, ...maybeProviderKey, ContentType, Status };

  return { updatedInput, UploadUrl };
};

/**
 * Creates a pre-authenticated download URL for a file from the specified file storage provider.
 *
 * This utility function simplifies the process of generating download URLs by instantiating
 * the appropriate storage provider driver and delegating to its CreatePreAuthDownloadUrl method.
 * The returned URL can be provided directly to clients for downloading the file without
 * requiring additional authentication.
 *
 * @param providerEntity - The file storage provider entity containing connection details
 * @param providerKeyOrName - The provider key or name of the file to download
 *                           (use the ProviderKey if it was returned during upload, otherwise use the file Name)
 * @param userContext - Optional user context for OAuth providers (required if provider.RequiresOAuth is true)
 * @returns A promise that resolves to the pre-authenticated download URL as a string
 *
 * @example
 * ```typescript
 * // Get a pre-authenticated download URL for a file
 * const fileStorageProvider = await entityMgr.FindById('FileStorageProvider', 'azure-main');
 *
 * // Using the file name
 * const downloadUrl = await createDownloadUrl(fileStorageProvider, 'reports/annual-report.pdf', userContext);
 *
 * // Or using the provider key if returned during upload
 * const downloadUrl = await createDownloadUrl(fileStorageProvider, file.ProviderKey, userContext);
 *
 * // The download URL can be provided to clients for direct download
 * console.log(downloadUrl);
 * ```
 */
export const createDownloadUrl = async (
  providerEntity: MJFileStorageProviderEntity,
  providerKeyOrName: string,
  userContext?: UserContextOptions,
): Promise<string> => {
  const driver = await initializeDriver(providerEntity, userContext);
  return driver.CreatePreAuthDownloadUrl(providerKeyOrName);
};

/**
 * Moves an object from one location to another within the specified file storage provider.
 *
 * This utility function handles moving files by instantiating the appropriate storage
 * provider driver and delegating to its MoveObject method. It can be used to rename files
 * or move them to different directories within the same storage provider.
 *
 * @param providerEntity - The file storage provider entity containing connection details
 * @param oldProviderKeyOrName - The key or name of the object's current location
 *                              (use the ProviderKey if it was returned during upload, otherwise use the file Name)
 * @param newProviderKeyOrName - The key or name for the object's new location
 * @param userContext - Optional user context for OAuth providers (required if provider.RequiresOAuth is true)
 * @returns A promise that resolves to a boolean indicating whether the move operation was successful
 *
 * @example
 * ```typescript
 * // Move a file from one location to another
 * const fileStorageProvider = await entityMgr.FindById('FileStorageProvider', 'azure-main');
 *
 * // Move a file to a different directory
 * const success = await moveObject(
 *   fileStorageProvider,
 *   'drafts/report.docx',
 *   'published/final-report.docx',
 *   userContext
 * );
 *
 * if (success) {
 *   console.log('File successfully moved');
 * } else {
 *   console.log('Failed to move file');
 * }
 * ```
 */
export const moveObject = async (
  providerEntity: MJFileStorageProviderEntity,
  oldProviderKeyOrName: string,
  newProviderKeyOrName: string,
  userContext?: UserContextOptions,
): Promise<boolean> => {
  const driver = await initializeDriver(providerEntity, userContext);
  return driver.MoveObject(oldProviderKeyOrName, newProviderKeyOrName);
};

/**
 * Copies an object from one location to another within the specified file storage provider.
 *
 * This utility function handles copying files by instantiating the appropriate storage
 * provider driver and delegating to its CopyObject method. It can be used to duplicate files
 * within the same storage provider, either in the same folder with a different name or to
 * a different folder.
 *
 * @param providerEntity - The file storage provider entity containing connection details
 * @param sourceProviderKeyOrName - The key or name of the source file to copy
 * @param destinationProviderKeyOrName - The key or name for the destination copy
 * @param userContext - Optional user context for OAuth providers (required if provider.RequiresOAuth is true)
 * @returns A promise that resolves to a boolean indicating whether the copy was successful
 *
 * @example
 * ```typescript
 * const success = await copyObject(
 *   providerEntity,
 *   'documents/report.pdf',
 *   'documents/archive/report-2024.pdf',
 *   userContext
 * );
 *
 * if (success) {
 *   console.log('File successfully copied');
 * } else {
 *   console.log('Failed to copy file');
 * }
 * ```
 */
export const copyObject = async (
  providerEntity: MJFileStorageProviderEntity,
  sourceProviderKeyOrName: string,
  destinationProviderKeyOrName: string,
  userContext?: UserContextOptions,
): Promise<boolean> => {
  const driver = await initializeDriver(providerEntity, userContext);
  return driver.CopyObject(sourceProviderKeyOrName, destinationProviderKeyOrName);
};

/**
 * Deletes a file from the specified file storage provider.
 *
 * This utility function handles file deletion by instantiating the appropriate storage
 * provider driver and delegating to its DeleteObject method. It provides a simple way
 * to remove files that are no longer needed.
 *
 * @param providerEntity - The file storage provider entity containing connection details
 * @param providerKeyOrName - The key or name of the file to delete
 *                           (use the ProviderKey if it was returned during upload, otherwise use the file Name)
 * @param userContext - Optional user context for OAuth providers (required if provider.RequiresOAuth is true)
 * @returns A promise that resolves to a boolean indicating whether the deletion was successful
 *
 * @example
 * ```typescript
 * // Delete a file from storage
 * const fileStorageProvider = await entityMgr.FindById('FileStorageProvider', 'azure-main');
 *
 * // Delete using the file name
 * const deleted = await deleteObject(fileStorageProvider, 'temp/obsolete-document.pdf', userContext);
 *
 * // Or using the provider key if returned during upload
 * const deleted = await deleteObject(fileStorageProvider, file.ProviderKey, userContext);
 *
 * if (deleted) {
 *   console.log('File successfully deleted');
 * } else {
 *   console.log('Failed to delete file - it may not exist or there was an error');
 * }
 * ```
 */
export const deleteObject = async (
  providerEntity: MJFileStorageProviderEntity,
  providerKeyOrName: string,
  userContext?: UserContextOptions,
): Promise<boolean> => {
  console.log('[deleteObject] Called with:', {
    providerName: providerEntity.Name,
    providerID: providerEntity.ID,
    serverDriverKey: providerEntity.ServerDriverKey,
    providerKeyOrName,
  });

  const driver = await initializeDriver(providerEntity, userContext);

  console.log('[deleteObject] Driver initialized:', {
    driverType: driver.constructor.name,
    hasDeleteMethod: typeof driver.DeleteObject === 'function',
  });

  console.log('[deleteObject] Calling driver.DeleteObject...');
  const result = await driver.DeleteObject(providerKeyOrName);
  console.log('[deleteObject] Result:', result);

  return result;
};

/**
 * Lists objects (files) and prefixes (directories) in a storage provider at the specified path.
 *
 * This utility function provides access to the storage provider's file and folder listing
 * functionality. It returns both files and directories found at the specified path prefix,
 * allowing for hierarchical navigation through the storage provider's contents.
 *
 * @param providerEntity - The file storage provider entity containing connection details
 * @param prefix - The path prefix to list objects from (e.g., "/" for root, "documents/" for a specific folder)
 * @param delimiter - The character used to group keys into a hierarchy (defaults to "/")
 * @param userContext - Optional user context for OAuth providers (required if provider.RequiresOAuth is true)
 * @returns A promise that resolves to a StorageListResult containing:
 *          - objects: Array of file metadata (name, size, contentType, lastModified, etc.)
 *          - prefixes: Array of directory/folder path strings
 *
 * @example
 * ```typescript
 * // List contents of the root directory
 * const fileStorageProvider = await entityMgr.FindById('FileStorageProvider', 'aws-s3-main');
 * const result = await listObjects(fileStorageProvider, '/', '/', userContext);
 *
 * // Display files
 * for (const file of result.objects) {
 *   console.log(`File: ${file.name} (${file.size} bytes)`);
 * }
 *
 * // Display folders
 * for (const folder of result.prefixes) {
 *   console.log(`Folder: ${folder}`);
 * }
 *
 * // List contents of a specific folder
 * const docsResult = await listObjects(fileStorageProvider, 'documents/', '/', userContext);
 * ```
 */
export const listObjects = async (
  providerEntity: MJFileStorageProviderEntity,
  prefix: string,
  delimiter: string = '/',
  userContext?: UserContextOptions,
): Promise<import('./generic/FileStorageBase').StorageListResult> => {
  console.log('[listObjects] Starting with:', {
    providerName: providerEntity.Name,
    serverDriverKey: providerEntity.ServerDriverKey,
    prefix,
    delimiter,
    hasUserContext: !!userContext,
  });

  const driver = await initializeDriver(providerEntity, userContext);

  console.log('[listObjects] Driver initialized:', {
    driverType: driver.constructor.name,
    isConfigured: driver.IsConfigured,
  });

  const result = await driver.ListObjects(prefix, delimiter);
  console.log('[listObjects] Result:', {
    objectsCount: result.objects.length,
    prefixesCount: result.prefixes.length,
  });

  return result;
};

/**
 * Result of a cross-provider copy operation
 */
export interface CopyBetweenProvidersResult {
  success: boolean;
  message: string;
  bytesTransferred?: number;
  sourceProvider: string;
  destinationProvider: string;
  sourcePath: string;
  destinationPath: string;
}

/**
 * Options for cross-provider copy operations.
 */
export interface CopyBetweenProvidersOptions {
  /** User context for the source provider (required if source provider.RequiresOAuth is true). Can include accountEntity for enterprise credential model. */
  sourceUserContext?: ExtendedUserContextOptions;
  /** User context for the destination provider (required if destination provider.RequiresOAuth is true). Can include accountEntity for enterprise credential model. */
  destinationUserContext?: ExtendedUserContextOptions;
}

/**
 * Copies a file from one storage provider to another.
 *
 * This utility function enables transferring files between different storage providers
 * (e.g., from Dropbox to Google Drive, or from S3 to Azure). The transfer happens
 * server-side, so the file data flows: Source Provider → Server → Destination Provider.
 *
 * @param sourceProviderEntity - The source file storage provider entity
 * @param destinationProviderEntity - The destination file storage provider entity
 * @param sourcePath - The path to the file in the source provider
 * @param destinationPath - The path where the file should be saved in the destination provider
 * @param options - Optional user context for OAuth providers
 * @returns A promise that resolves to a CopyBetweenProvidersResult
 *
 * @example
 * ```typescript
 * // Copy a file from Dropbox to Google Drive
 * const sourceProvider = await entityMgr.FindById('FileStorageProvider', 'dropbox-id');
 * const destProvider = await entityMgr.FindById('FileStorageProvider', 'gdrive-id');
 *
 * const result = await copyObjectBetweenProviders(
 *   sourceProvider,
 *   destProvider,
 *   'documents/report.pdf',
 *   'imported/report.pdf',
 *   {
 *     sourceUserContext: { userID: currentUser.ID, contextUser },
 *     destinationUserContext: { userID: currentUser.ID, contextUser }
 *   }
 * );
 *
 * if (result.success) {
 *   console.log(`Transferred ${result.bytesTransferred} bytes`);
 * }
 * ```
 */
export const copyObjectBetweenProviders = async (
  sourceProviderEntity: MJFileStorageProviderEntity,
  destinationProviderEntity: MJFileStorageProviderEntity,
  sourcePath: string,
  destinationPath: string,
  options?: CopyBetweenProvidersOptions,
): Promise<CopyBetweenProvidersResult> => {
  console.log('[copyObjectBetweenProviders] Starting transfer:', {
    sourceProvider: sourceProviderEntity.Name,
    destinationProvider: destinationProviderEntity.Name,
    sourcePath,
    destinationPath,
  });

  const result: CopyBetweenProvidersResult = {
    success: false,
    message: '',
    sourceProvider: sourceProviderEntity.Name,
    destinationProvider: destinationProviderEntity.Name,
    sourcePath,
    destinationPath,
  };

  try {
    // Initialize source driver with user credentials if available
    const sourceDriver = await initializeDriver(sourceProviderEntity, options?.sourceUserContext);

    // Initialize destination driver with user credentials if available
    const destDriver = await initializeDriver(destinationProviderEntity, options?.destinationUserContext);

    console.log('[copyObjectBetweenProviders] Drivers initialized, fetching file from source...');

    // Normalize source path: remove leading/trailing slashes and collapse multiple slashes
    // This ensures consistent path handling across different storage providers
    const normalizedSourcePath = sourcePath.replace(/^\/+|\/+$/g, '').replace(/\/+/g, '/');
    console.log('[copyObjectBetweenProviders] Path normalization:', {
      original: sourcePath,
      normalized: normalizedSourcePath,
    });

    // Get the file from source provider
    const fileData = await sourceDriver.GetObject({ fullPath: normalizedSourcePath });

    if (!fileData || fileData.length === 0) {
      result.message = `Failed to retrieve file from source: ${normalizedSourcePath}`;
      console.error('[copyObjectBetweenProviders]', result.message);
      return result;
    }

    console.log('[copyObjectBetweenProviders] File retrieved, size:', fileData.length, 'bytes');

    // Get metadata for content type
    let contentType = 'application/octet-stream';
    try {
      const metadata = await sourceDriver.GetObjectMetadata({ fullPath: normalizedSourcePath });
      if (metadata.contentType) {
        contentType = metadata.contentType;
      }
    } catch {
      // Use mime-types to guess content type from filename
      const mimeType = mime.lookup(sourcePath);
      if (mimeType) {
        contentType = mimeType;
      }
    }

    console.log('[copyObjectBetweenProviders] Uploading to destination with contentType:', contentType);

    // Upload to destination provider
    const uploadSuccess = await destDriver.PutObject(destinationPath, fileData, contentType);

    if (uploadSuccess) {
      result.success = true;
      result.bytesTransferred = fileData.length;
      result.message = `Successfully copied ${fileData.length} bytes from ${sourceProviderEntity.Name} to ${destinationProviderEntity.Name}`;
      console.log('[copyObjectBetweenProviders]', result.message);
    } else {
      result.message = `Failed to upload file to destination: ${destinationPath}`;
      console.error('[copyObjectBetweenProviders]', result.message);
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    result.message = `Transfer failed: ${errorMessage}`;
    console.error('[copyObjectBetweenProviders] Error:', error);
    return result;
  }
};

/**
 * Result from a single provider's search attempt
 */
export interface ProviderSearchResult {
  /** Provider ID */
  providerID: string;
  /** Provider name for display */
  providerName: string;
  /** Whether this provider's search succeeded */
  success: boolean;
  /** Error message if search failed or provider doesn't support search */
  errorMessage?: string;
  /** Search results (empty array if failed) */
  results: FileSearchResult[];
  /** Total matches from this provider */
  totalMatches?: number;
  /** Whether there are more results available */
  hasMore: boolean;
  /** Pagination token for this provider */
  nextPageToken?: string;
}

/**
 * Aggregated results from searching across multiple providers
 */
export interface MultiProviderSearchResult {
  /** Results grouped by provider */
  providerResults: ProviderSearchResult[];
  /** Total results across all providers */
  totalResultsReturned: number;
  /** Number of providers that succeeded */
  successfulProviders: number;
  /** Number of providers that failed */
  failedProviders: number;
}

/**
 * Options for multi-provider search
 */
export interface SearchAcrossProvidersOptions {
  /** Maximum results per provider (default: 50) */
  maxResultsPerProvider?: number;
  /** File types to filter by (e.g., ['pdf', 'docx']) */
  fileTypes?: string[];
  /** Whether to search file contents (default: false) */
  searchContent?: boolean;
  /** User context for OAuth providers - maps provider ID to user context */
  providerUserContexts?: Map<string, UserContextOptions>;
}

/**
 * Searches for files across multiple storage providers in parallel.
 *
 * This utility function enables searching for files across multiple storage providers
 * simultaneously. Each provider is queried in parallel using Promise.allSettled,
 * ensuring that failures in one provider don't affect results from others.
 *
 * Providers that don't support search (SupportsSearch = false) will return a result
 * with success=false and an appropriate error message rather than being silently skipped.
 *
 * @param providerEntities - Array of provider entities to search
 * @param query - Search query string
 * @param options - Optional search configuration including user contexts for OAuth providers
 * @returns A promise that resolves to aggregated results grouped by provider
 *
 * @example
 * ```typescript
 * // Search across Google Drive and Dropbox
 * const providers = [googleDriveProvider, dropboxProvider];
 * const userContexts = new Map([
 *   [googleDriveProvider.ID, { userID: currentUser.ID, contextUser }],
 *   [dropboxProvider.ID, { userID: currentUser.ID, contextUser }]
 * ]);
 *
 * const result = await searchAcrossProviders(providers, 'quarterly report', {
 *   maxResultsPerProvider: 25,
 *   fileTypes: ['pdf', 'docx'],
 *   providerUserContexts: userContexts
 * });
 *
 * // Process results by provider
 * for (const providerResult of result.providerResults) {
 *   if (providerResult.success) {
 *     console.log(`${providerResult.providerName}: ${providerResult.results.length} results`);
 *   } else {
 *     console.log(`${providerResult.providerName}: ${providerResult.errorMessage}`);
 *   }
 * }
 * ```
 */
export const searchAcrossProviders = async (
  providerEntities: MJFileStorageProviderEntity[],
  query: string,
  options?: SearchAcrossProvidersOptions,
): Promise<MultiProviderSearchResult> => {
  console.log('[searchAcrossProviders] Starting search:', {
    providerCount: providerEntities.length,
    providers: providerEntities.map((p) => p.Name),
    query,
    options: { ...options, providerUserContexts: options?.providerUserContexts ? '[Map]' : undefined },
  });

  const maxResults = options?.maxResultsPerProvider ?? 50;
  const searchOptions: FileSearchOptions = {
    maxResults,
    fileTypes: options?.fileTypes,
    searchContent: options?.searchContent ?? false,
  };

  // Create search promises for each provider
  const searchPromises = providerEntities.map(async (providerEntity): Promise<ProviderSearchResult> => {
    const providerResult: ProviderSearchResult = {
      providerID: providerEntity.ID,
      providerName: providerEntity.Name,
      success: false,
      results: [],
      hasMore: false,
    };

    try {
      // Check if provider supports search
      if (!providerEntity.SupportsSearch) {
        providerResult.errorMessage = 'This provider does not support search';
        console.log(`[searchAcrossProviders] ${providerEntity.Name}: Does not support search`);
        return providerResult;
      }

      // Get user context for this provider if available
      const userContext = options?.providerUserContexts?.get(providerEntity.ID);

      // Initialize driver with user credentials if available
      const driver = await initializeDriver(providerEntity, userContext);

      // Execute search
      console.log(`[searchAcrossProviders] ${providerEntity.Name}: Executing search...`);
      const searchResult = await driver.SearchFiles(query, searchOptions);

      providerResult.success = true;
      providerResult.results = searchResult.results;
      providerResult.totalMatches = searchResult.totalMatches;
      providerResult.hasMore = searchResult.hasMore;
      providerResult.nextPageToken = searchResult.nextPageToken;

      console.log(`[searchAcrossProviders] ${providerEntity.Name}: Found ${searchResult.results.length} results`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      providerResult.errorMessage = errorMessage;
      console.error(`[searchAcrossProviders] ${providerEntity.Name}: Error -`, errorMessage);
    }

    return providerResult;
  });

  // Execute all searches in parallel
  const settledResults = await Promise.allSettled(searchPromises);

  // Aggregate results
  const providerResults: ProviderSearchResult[] = [];
  let totalResultsReturned = 0;
  let successfulProviders = 0;
  let failedProviders = 0;

  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      const result = settled.value;
      providerResults.push(result);

      if (result.success) {
        successfulProviders++;
        totalResultsReturned += result.results.length;
      } else {
        failedProviders++;
      }
    } else {
      // Promise rejected (shouldn't happen with our try/catch, but handle it)
      failedProviders++;
      console.error('[searchAcrossProviders] Promise rejected:', settled.reason);
    }
  }

  const aggregatedResult: MultiProviderSearchResult = {
    providerResults,
    totalResultsReturned,
    successfulProviders,
    failedProviders,
  };

  console.log('[searchAcrossProviders] Search complete:', {
    totalResultsReturned,
    successfulProviders,
    failedProviders,
  });

  return aggregatedResult;
};

/**
 * Information needed to search a single account
 */
export interface AccountSearchInput {
  /** The file storage account entity */
  accountEntity: MJFileStorageAccountEntity;
  /** The file storage provider entity for this account */
  providerEntity: MJFileStorageProviderEntity;
}

/**
 * Result from a single account's search attempt
 */
export interface AccountSearchResult {
  /** Account ID */
  accountID: string;
  /** Account name for display */
  accountName: string;
  /** Provider ID */
  providerID: string;
  /** Provider name for display */
  providerName: string;
  /** Whether this account's search succeeded */
  success: boolean;
  /** Error message if search failed or provider doesn't support search */
  errorMessage?: string;
  /** Search results (empty array if failed) */
  results: FileSearchResult[];
  /** Total matches from this account */
  totalMatches?: number;
  /** Whether there are more results available */
  hasMore: boolean;
  /** Pagination token for this account */
  nextPageToken?: string;
}

/**
 * Aggregated results from searching across multiple accounts
 */
export interface MultiAccountSearchResult {
  /** Results grouped by account */
  accountResults: AccountSearchResult[];
  /** Total results across all accounts */
  totalResultsReturned: number;
  /** Number of accounts that succeeded */
  successfulAccounts: number;
  /** Number of accounts that failed */
  failedAccounts: number;
}

/**
 * Options for multi-account search
 */
export interface SearchAcrossAccountsOptions {
  /** Maximum results per account (default: 50) */
  maxResultsPerAccount?: number;
  /** File types to filter by (e.g., ['pdf', 'docx']) */
  fileTypes?: string[];
  /** Whether to search file contents (default: false) */
  searchContent?: boolean;
  /** Context user for credential decryption */
  contextUser: UserInfo;
}

/**
 * Searches for files across multiple storage accounts in parallel.
 *
 * This is the enterprise version of search that uses the account-based credential model.
 * Each account is searched independently, allowing multiple accounts from the same
 * provider type to be searched (e.g., two different Dropbox accounts).
 *
 * @param accounts - Array of account/provider pairs to search
 * @param query - Search query string
 * @param options - Search configuration including context user for credentials
 * @returns A promise that resolves to aggregated results grouped by account
 *
 * @example
 * ```typescript
 * const accounts = [
 *   { accountEntity: researchDropbox, providerEntity: dropboxProvider },
 *   { accountEntity: marketingDropbox, providerEntity: dropboxProvider },
 *   { accountEntity: engineeringGDrive, providerEntity: gdriveProvider }
 * ];
 *
 * const result = await searchAcrossAccounts(accounts, 'quarterly report', {
 *   maxResultsPerAccount: 25,
 *   fileTypes: ['pdf', 'docx'],
 *   contextUser: currentUser
 * });
 *
 * for (const accountResult of result.accountResults) {
 *   if (accountResult.success) {
 *     console.log(`${accountResult.accountName}: ${accountResult.results.length} results`);
 *   }
 * }
 * ```
 */
export const searchAcrossAccounts = async (
  accounts: AccountSearchInput[],
  query: string,
  options: SearchAcrossAccountsOptions,
): Promise<MultiAccountSearchResult> => {
  console.log('[searchAcrossAccounts] Starting search:', {
    accountCount: accounts.length,
    accounts: accounts.map((a) => ({ account: a.accountEntity.Name, provider: a.providerEntity.Name })),
    query,
    maxResultsPerAccount: options.maxResultsPerAccount,
    fileTypes: options.fileTypes,
    searchContent: options.searchContent,
  });

  const maxResults = options.maxResultsPerAccount ?? 50;
  const searchOptions: FileSearchOptions = {
    maxResults,
    fileTypes: options.fileTypes,
    searchContent: options.searchContent ?? false,
  };

  // Create search promises for each account
  const searchPromises = accounts.map(async ({ accountEntity, providerEntity }): Promise<AccountSearchResult> => {
    const accountResult: AccountSearchResult = {
      accountID: accountEntity.ID,
      accountName: accountEntity.Name,
      providerID: providerEntity.ID,
      providerName: providerEntity.Name,
      success: false,
      results: [],
      hasMore: false,
    };

    try {
      // Check if provider supports search
      if (!providerEntity.SupportsSearch) {
        accountResult.errorMessage = 'This provider does not support search';
        console.log(`[searchAcrossAccounts] ${accountEntity.Name}: Provider does not support search`);
        return accountResult;
      }

      // Initialize driver with account-based credentials
      const driver = await initializeDriverWithAccountCredentials({
        accountEntity,
        providerEntity,
        contextUser: options.contextUser,
      });

      // Execute search
      console.log(`[searchAcrossAccounts] ${accountEntity.Name}: Executing search...`);
      const searchResult = await driver.SearchFiles(query, searchOptions);

      accountResult.success = true;
      accountResult.results = searchResult.results;
      accountResult.totalMatches = searchResult.totalMatches;
      accountResult.hasMore = searchResult.hasMore;
      accountResult.nextPageToken = searchResult.nextPageToken;

      console.log(`[searchAcrossAccounts] ${accountEntity.Name}: Found ${searchResult.results.length} results`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      accountResult.errorMessage = errorMessage;
      console.error(`[searchAcrossAccounts] ${accountEntity.Name}: Error -`, errorMessage);
    }

    return accountResult;
  });

  // Execute all searches in parallel
  const settledResults = await Promise.allSettled(searchPromises);

  // Aggregate results
  const accountResults: AccountSearchResult[] = [];
  let totalResultsReturned = 0;
  let successfulAccounts = 0;
  let failedAccounts = 0;

  for (const settled of settledResults) {
    if (settled.status === 'fulfilled') {
      const result = settled.value;
      accountResults.push(result);

      if (result.success) {
        successfulAccounts++;
        totalResultsReturned += result.results.length;
      } else {
        failedAccounts++;
      }
    } else {
      // Promise rejected (shouldn't happen with our try/catch, but handle it)
      failedAccounts++;
      console.error('[searchAcrossAccounts] Promise rejected:', settled.reason);
    }
  }

  const aggregatedResult: MultiAccountSearchResult = {
    accountResults,
    totalResultsReturned,
    successfulAccounts,
    failedAccounts,
  };

  console.log('[searchAcrossAccounts] Search complete:', {
    totalResultsReturned,
    successfulAccounts,
    failedAccounts,
  });

  return aggregatedResult;
};
