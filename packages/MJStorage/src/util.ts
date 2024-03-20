import { FileStorageProviderEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
import mime from 'mime-types';
import { FileStorageBase } from './generic/FileStorageBase';

/**
 * Creates an upload URL for a file in the specified file storage provider.
 * 
 * @param providerEntity - The file storage provider entity.
 * @param input - The input object containing the file details.
 * @returns A promise that resolves to an object with the updated input and the upload URL.
 */
export const createUploadUrl = async <TInput extends { ID: number; Name: string; ProviderID: number; ContentType?: string; ProviderKey?: string }>(
  providerEntity: FileStorageProviderEntity,
  input: TInput
): Promise<{
  updatedInput: TInput & { Status: string; ContentType: string; };
  UploadUrl: string;
}> => {
  const { ID, ProviderID } = input;

  const ContentType = input.ContentType ?? mime.lookup(input.Name) ?? 'application/octet-stream';
  const Status = 'Uploading';

  await providerEntity.Load(ProviderID);
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);

  const { UploadUrl, ...maybeProviderKey } = await driver.CreatePreAuthUploadUrl(String(ID));
  const updatedInput = { ...input, ...maybeProviderKey, ContentType, Status };

  return { updatedInput, UploadUrl };
};

/**
 * Creates a pre-authorized download URL for a file from the specified file storage provider.
 * 
 * @param {FileStorageProviderEntity} providerEntity - The file storage provider entity.
 * @param {string | number} providerKeyOrID - The provider key or ID.
 * @returns {Promise<string>} - The pre-authorized download URL.
 */
export const createDownloadUrl = async (providerEntity: FileStorageProviderEntity, providerKeyOrID: string | number): Promise<string> => {
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, providerEntity.ServerDriverKey);
  return driver.CreatePreAuthDownloadUrl(String(providerKeyOrID));
};
