import { FileStorageProviderEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import mime from 'mime-types';
import { FileStorageBase } from './generic/FileStorageBase';

/**
 * Creates an upload URL for a file in the specified file storage provider. Infers ContentType based on the file name, enforces a specific `Status` and may set
 * the `ProviderKey` value, dependening on the underlying file storage provider.
 *
 * @param providerEntity - The file storage provider entity.
 * @param input - The input object containing the file details.
 * @returns A promise that resolves to an object with the updated input and the upload URL.
 */
export const createUploadUrl = async <
  TInput extends { ID: number; Name: string; ProviderID: number; ContentType?: string; ProviderKey?: string }
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

  const { UploadUrl, ...maybeProviderKey } = await driver.CreatePreAuthUploadUrl(Name);
  const updatedInput = { ...input, ...maybeProviderKey, ContentType, Status };

  return { updatedInput, UploadUrl };
};

/**
 * Creates a pre-authorized download URL for a file from the specified file storage provider.
 *
 * @param {FileStorageProviderEntity} providerEntity - The file storage provider entity.
 * @param {string} providerKeyOrName - The provider key or Name for the file to download.
 * @returns {Promise<string>} - The pre-authorized download URL.
 */
export const createDownloadUrl = async (providerEntity: FileStorageProviderEntity, providerKeyOrName: string): Promise<string> => {
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);
  return driver.CreatePreAuthDownloadUrl(providerKeyOrName);
};

/**
 * Moves an object from one location to another within the file storage provider.
 *
 * @param providerEntity - The file storage provider entity.
 * @param oldProviderKeyOrName - The key or name of the old location of the object.
 * @param newProviderKeyOrName - The key or name of the new location to move the object to.
 * @returns A promise that resolves to a boolean indicating whether the object was successfully moved.
 */
export const moveObject = async (providerEntity: FileStorageProviderEntity, oldProviderKeyOrName: string, newProviderKeyOrName: string) => {
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);
  return driver.MoveObject(oldProviderKeyOrName, newProviderKeyOrName);
};

/**
 * Delete a previously uploaded file from the specified file storage provider.
 *
 * @param {FileStorageProviderEntity} providerEntity - The file storage provider entity.
 * @param {string} providerKeyOrName - The provider key or Name of the file to delete.
 * @returns {Promise<boolean>} - The success of he delete operation.
 */
export const deleteObject = (providerEntity: FileStorageProviderEntity, providerKeyOrName: string) => {
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);
  return driver.DeleteObject(providerKeyOrName);
};
