import { z } from 'zod';
import { cosmiconfigSync } from 'cosmiconfig';
import { LogError, LogStatus } from '@memberjunction/core';

const explorer = cosmiconfigSync('mj', { searchStrategy: 'global' });

/**
 * Configuration schema for file storage providers
 */
const storageProvidersSchema = z.object({
  /**
   * AWS S3 Configuration
   * Used by: AWSFileStorage driver
   */
  aws: z
    .object({
      accessKeyID: z.string().optional(),
      secretAccessKey: z.string().optional(),
      region: z.string().optional(),
      defaultBucket: z.string().optional(),
      keyPrefix: z.string().optional(),
    })
    .optional(),

  /**
   * Azure Blob Storage Configuration
   * Used by: AzureFileStorage driver
   */
  azure: z
    .object({
      accountName: z.string().optional(),
      accountKey: z.string().optional(),
      connectionString: z.string().optional(),
      defaultContainer: z.string().optional(),
    })
    .optional(),

  /**
   * Google Cloud Storage Configuration
   * Used by: GoogleFileStorage driver
   */
  googleCloud: z
    .object({
      projectID: z.string().optional(),
      keyFilename: z.string().optional(),
      keyJSON: z.string().optional(), // JSON string of service account credentials
      defaultBucket: z.string().optional(),
    })
    .optional(),

  /**
   * Google Drive Configuration
   * Used by: GoogleDriveFileStorage driver
   * Supports BOTH service account auth (keyFile, credentialsJSON) AND OAuth2 (clientID, etc.)
   */
  googleDrive: z
    .object({
      // Service Account Auth (legacy)
      keyFile: z.string().optional(),
      credentialsJSON: z.string().optional(), // JSON string of service account credentials
      // OAuth2 Auth (new)
      clientID: z.string().optional(),
      clientSecret: z.string().optional(),
      refreshToken: z.string().optional(),
      redirectURI: z.string().optional(),
      rootFolderID: z.string().optional(),
    })
    .optional(),

  /**
   * Dropbox Configuration
   * Used by: DropboxFileStorage driver
   */
  dropbox: z
    .object({
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
      clientID: z.string().optional(), // Also called appKey
      clientSecret: z.string().optional(), // Also called appSecret
      rootPath: z.string().optional(),
    })
    .optional(),

  /**
   * Box.com Configuration
   * Used by: BoxFileStorage driver
   * Supports access token, refresh token, AND JWT/client credentials auth
   */
  box: z
    .object({
      clientID: z.string().optional(),
      clientSecret: z.string().optional(),
      accessToken: z.string().optional(),
      refreshToken: z.string().optional(),
      enterpriseID: z.string().optional(), // For JWT/client credentials flow
      rootFolderID: z.string().optional(),
    })
    .optional(),

  /**
   * SharePoint Configuration
   * Used by: SharePointFileStorage driver
   */
  sharePoint: z
    .object({
      clientID: z.string().optional(),
      clientSecret: z.string().optional(),
      tenantID: z.string().optional(),
      siteID: z.string().optional(),
      driveID: z.string().optional(),
      rootFolderID: z.string().optional(),
    })
    .optional(),
});

/**
 * Complete configuration schema for MJStorage package
 */
const storageConfigSchema = z.object({
  /**
   * Storage provider configurations
   */
  storageProviders: storageProvidersSchema.optional().default({}),
});

export type StorageConfig = z.infer<typeof storageConfigSchema>;
export type StorageProvidersConfig = z.infer<typeof storageProvidersSchema>;

let _config: StorageConfig | null = null;

/**
 * Gets the MJStorage configuration, loading it from mj.config.cjs if not already loaded
 * @returns The MJStorage configuration object
 */
export function getStorageConfig(): StorageConfig {
  if (_config) {
    return _config;
  }

  try {
    const result = explorer.search();
    if (!result || result.isEmpty) {
      LogStatus('No mj.config.cjs found, using default MJStorage configuration');
      _config = storageConfigSchema.parse({});
      return _config;
    }

    // Extract storage-related fields from the config
    // This checks both the config object and environment variables
    // Environment variables follow the pattern: STORAGE_[PROVIDER]_[FIELD]
    const rawConfig = {
      storageProviders: {
        aws: {
          accessKeyID: result.config.awsAccessKeyID || process.env.STORAGE_AWS_ACCESS_KEY_ID,
          secretAccessKey: result.config.awsSecretAccessKey || process.env.STORAGE_AWS_SECRET_ACCESS_KEY,
          region: result.config.awsRegion || process.env.STORAGE_AWS_REGION,
          defaultBucket: result.config.awsDefaultBucket || process.env.STORAGE_AWS_DEFAULT_BUCKET,
          keyPrefix: result.config.awsKeyPrefix || process.env.STORAGE_AWS_KEY_PREFIX,
        },
        azure: {
          accountName: result.config.azureAccountName || process.env.STORAGE_AZURE_ACCOUNT_NAME,
          accountKey: result.config.azureAccountKey || process.env.STORAGE_AZURE_ACCOUNT_KEY,
          connectionString: result.config.azureConnectionString || process.env.STORAGE_AZURE_CONNECTION_STRING,
          defaultContainer: result.config.azureDefaultContainer || process.env.STORAGE_AZURE_DEFAULT_CONTAINER,
        },
        googleCloud: {
          projectID: result.config.googleCloudProjectID || process.env.STORAGE_GOOGLE_CLOUD_PROJECT_ID,
          keyFilename: result.config.googleCloudKeyFilename || process.env.STORAGE_GOOGLE_CLOUD_KEY_FILENAME,
          keyJSON: result.config.googleCloudKeyJSON || process.env.STORAGE_GOOGLE_KEY_JSON,
          defaultBucket: result.config.googleCloudDefaultBucket || process.env.STORAGE_GOOGLE_CLOUD_DEFAULT_BUCKET || process.env.STORAGE_GOOGLE_BUCKET_NAME,
        },
        googleDrive: {
          // Service account auth
          keyFile: result.config.googleDriveKeyFile || process.env.STORAGE_GDRIVE_KEY_FILE,
          credentialsJSON: result.config.googleDriveCredentialsJSON || process.env.STORAGE_GDRIVE_CREDENTIALS_JSON,
          // OAuth2 auth
          clientID: result.config.googleDriveClientID || process.env.STORAGE_GOOGLE_DRIVE_CLIENT_ID,
          clientSecret: result.config.googleDriveClientSecret || process.env.STORAGE_GOOGLE_DRIVE_CLIENT_SECRET,
          refreshToken: result.config.googleDriveRefreshToken || process.env.STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN,
          redirectURI: result.config.googleDriveRedirectURI || process.env.STORAGE_GOOGLE_DRIVE_REDIRECT_URI,
          rootFolderID: result.config.googleDriveRootFolderID || process.env.STORAGE_GDRIVE_ROOT_FOLDER_ID,
        },
        dropbox: {
          accessToken: result.config.dropboxAccessToken || process.env.STORAGE_DROPBOX_ACCESS_TOKEN,
          refreshToken: result.config.dropboxRefreshToken || process.env.STORAGE_DROPBOX_REFRESH_TOKEN,
          clientID: result.config.dropboxClientID || process.env.STORAGE_DROPBOX_CLIENT_ID || process.env.STORAGE_DROPBOX_APP_KEY,
          clientSecret: result.config.dropboxClientSecret || process.env.STORAGE_DROPBOX_CLIENT_SECRET || process.env.STORAGE_DROPBOX_APP_SECRET,
          rootPath: result.config.dropboxRootPath || process.env.STORAGE_DROPBOX_ROOT_PATH,
        },
        box: {
          clientID: result.config.boxClientID || process.env.STORAGE_BOX_CLIENT_ID,
          clientSecret: result.config.boxClientSecret || process.env.STORAGE_BOX_CLIENT_SECRET,
          accessToken: result.config.boxAccessToken || process.env.STORAGE_BOX_ACCESS_TOKEN,
          refreshToken: result.config.boxRefreshToken || process.env.STORAGE_BOX_REFRESH_TOKEN,
          enterpriseID: result.config.boxEnterpriseID || process.env.STORAGE_BOX_ENTERPRISE_ID,
          rootFolderID: result.config.boxRootFolderID || process.env.STORAGE_BOX_ROOT_FOLDER_ID,
        },
        sharePoint: {
          clientID: result.config.sharePointClientID || process.env.STORAGE_SHAREPOINT_CLIENT_ID,
          clientSecret: result.config.sharePointClientSecret || process.env.STORAGE_SHAREPOINT_CLIENT_SECRET,
          tenantID: result.config.sharePointTenantID || process.env.STORAGE_SHAREPOINT_TENANT_ID,
          siteID: result.config.sharePointSiteID || process.env.STORAGE_SHAREPOINT_SITE_ID,
          driveID: result.config.sharePointDriveID || process.env.STORAGE_SHAREPOINT_DRIVE_ID,
          rootFolderID: result.config.sharePointRootFolderID || process.env.STORAGE_SHAREPOINT_ROOT_FOLDER_ID,
        },
      },
    };

    _config = storageConfigSchema.parse(rawConfig);
    return _config;
  } catch (error) {
    LogError('Error loading MJStorage configuration', undefined, error);
    throw error;
  }
}

/**
 * Gets the storage providers configuration
 * @returns The storage providers configuration object
 */
export function getStorageProvidersConfig(): StorageProvidersConfig {
  const config = getStorageConfig();
  return config.storageProviders;
}

/**
 * Gets configuration for a specific storage provider
 * @param provider - The provider name ('aws', 'azure', 'googleCloud', etc.)
 * @returns The provider configuration or undefined if not configured
 */
export function getProviderConfig<T extends keyof StorageProvidersConfig>(provider: T): StorageProvidersConfig[T] {
  const config = getStorageProvidersConfig();
  return config[provider];
}

/**
 * Clears the cached configuration (useful for testing)
 */
export function clearStorageConfig(): void {
  _config = null;
}
