import { FileStorageProviderEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import mime from 'mime-types';
import { FileStorageBase } from './generic/FileStorageBase';

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
 *   }
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
export const createUploadUrl = async <
  TInput extends { ID: string; Name: string; ProviderID: string; ContentType?: string; ProviderKey?: string }
>(
  providerEntity: FileStorageProviderEntity,
  input: TInput
): Promise<{
  updatedInput: TInput & { Status: string; ContentType: string };
  UploadUrl: string;
}> => {
  const { Name, ProviderID } = input;

  const ContentType = input.ContentType ?? mime.lookup(input.Name) ?? 'application/octet-stream';
  const Status = 'Uploading';

  await providerEntity.Load(ProviderID);
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

  // Initialize driver with config if available
  const configJson = providerEntity.Get('Configuration') as string | null;
  if (configJson) {
    const config = JSON.parse(configJson);
    await driver.initialize(config);
  }

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
 * @returns A promise that resolves to the pre-authenticated download URL as a string
 * 
 * @example
 * ```typescript
 * // Get a pre-authenticated download URL for a file
 * const fileStorageProvider = await entityMgr.FindById('FileStorageProvider', 'azure-main');
 * 
 * // Using the file name
 * const downloadUrl = await createDownloadUrl(fileStorageProvider, 'reports/annual-report.pdf');
 * 
 * // Or using the provider key if returned during upload
 * const downloadUrl = await createDownloadUrl(fileStorageProvider, file.ProviderKey);
 * 
 * // The download URL can be provided to clients for direct download
 * console.log(downloadUrl);
 * ```
 */
export const createDownloadUrl = async (providerEntity: FileStorageProviderEntity, providerKeyOrName: string): Promise<string> => {
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

  // Initialize driver with config if available
  const configJson = providerEntity.Get('Configuration') as string | null;
  if (configJson) {
    const config = JSON.parse(configJson);
    await driver.initialize(config);
  }

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
export const moveObject = async (
  providerEntity: FileStorageProviderEntity,
  oldProviderKeyOrName: string,
  newProviderKeyOrName: string
): Promise<boolean> => {
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

  // Initialize driver with config if available
  const configJson = providerEntity.Get('Configuration') as string | null;
  if (configJson) {
    const config = JSON.parse(configJson);
    await driver.initialize(config);
  }

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
 * @returns A promise that resolves to a boolean indicating whether the copy was successful
 *
 * @example
 * ```typescript
 * const success = await copyObject(
 *   providerEntity,
 *   'documents/report.pdf',
 *   'documents/archive/report-2024.pdf'
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
  providerEntity: FileStorageProviderEntity,
  sourceProviderKeyOrName: string,
  destinationProviderKeyOrName: string
): Promise<boolean> => {
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

  // Initialize driver with config if available
  const configJson = providerEntity.Get('Configuration') as string | null;
  if (configJson) {
    const config = JSON.parse(configJson);
    await driver.initialize(config);
  }

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
 * @returns A promise that resolves to a boolean indicating whether the deletion was successful
 * 
 * @example
 * ```typescript
 * // Delete a file from storage
 * const fileStorageProvider = await entityMgr.FindById('FileStorageProvider', 'azure-main');
 * 
 * // Delete using the file name
 * const deleted = await deleteObject(fileStorageProvider, 'temp/obsolete-document.pdf');
 * 
 * // Or using the provider key if returned during upload
 * const deleted = await deleteObject(fileStorageProvider, file.ProviderKey);
 * 
 * if (deleted) {
 *   console.log('File successfully deleted');
 * } else {
 *   console.log('Failed to delete file - it may not exist or there was an error');
 * }
 * ```
 */
export const deleteObject = async (
  providerEntity: FileStorageProviderEntity,
  providerKeyOrName: string
): Promise<boolean> => {
  console.log('[deleteObject] Called with:', {
    providerName: providerEntity.Name,
    providerID: providerEntity.ID,
    serverDriverKey: providerEntity.ServerDriverKey,
    providerKeyOrName
  });

  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

  console.log('[deleteObject] Driver created:', {
    driverType: driver.constructor.name,
    hasDeleteMethod: typeof driver.DeleteObject === 'function'
  });

  // Initialize driver with config if available
  const configJson = providerEntity.Get('Configuration') as string | null;
  if (configJson) {
    const config = JSON.parse(configJson);
    await driver.initialize(config);
    console.log('[deleteObject] Driver initialized with config');
  }

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
 * @returns A promise that resolves to a StorageListResult containing:
 *          - objects: Array of file metadata (name, size, contentType, lastModified, etc.)
 *          - prefixes: Array of directory/folder path strings
 *
 * @example
 * ```typescript
 * // List contents of the root directory
 * const fileStorageProvider = await entityMgr.FindById('FileStorageProvider', 'aws-s3-main');
 * const result = await listObjects(fileStorageProvider, '/');
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
 * const docsResult = await listObjects(fileStorageProvider, 'documents/');
 * ```
 */
export const listObjects = async (
  providerEntity: FileStorageProviderEntity,
  prefix: string,
  delimiter: string = '/'
): Promise<import('./generic/FileStorageBase').StorageListResult> => {
  console.log('[listObjects] Starting with:', {
    providerName: providerEntity.Name,
    serverDriverKey: providerEntity.ServerDriverKey,
    prefix,
    delimiter
  });

  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

  console.log('[listObjects] Driver created:', {
    driverType: driver.constructor.name,
    isConfigured: driver.IsConfigured
  });

  // If the provider entity has configuration, parse it and pass to initialize
  // Use Get() method to access Configuration field dynamically (until CodeGen runs)

  // Debug: Log all available fields on the entity
  const allFields = providerEntity.GetAll();
  console.log('[listObjects] All entity fields:', Object.keys(allFields));
  console.log('[listObjects] Has Configuration key?', 'Configuration' in allFields);

  const configJson = providerEntity.Get('Configuration') as string | null;
  console.log('[listObjects] Configuration:', {
    hasConfig: !!configJson,
    configLength: configJson?.length,
    configValue: configJson ? configJson.substring(0, 100) + '...' : null
  });

  if (configJson) {
    try {
      const config = JSON.parse(configJson);
      console.log('[listObjects] Parsed config keys:', Object.keys(config));
      await driver.initialize(config);
      console.log('[listObjects] Driver initialized, isConfigured:', driver.IsConfigured);
    } catch (error) {
      console.error('[listObjects] Failed to parse config:', error);
      throw new Error(`Failed to parse provider configuration: ${error.message}`);
    }
  }

  const result = await driver.ListObjects(prefix, delimiter);
  console.log('[listObjects] Result:', {
    objectsCount: result.objects.length,
    prefixesCount: result.prefixes.length
  });

  return result;
};