import { FileStorageProviderEntity } from '@memberjunction/core-entities';
import { MJGlobal } from '@memberjunction/global';
//import mime from 'mime';
import { FileStorageBase } from './generic/FileStorageBase';


export const createUploadUrl = async <TInput extends { Name: string; ProviderID: number; ContentType?: string; ProviderKey?: string }>(
  entity: FileStorageProviderEntity,
  input: TInput
): Promise<{
  updatedInput: TInput;
  UploadUrl: string;
}> => {
  const { Name, ProviderID } = input;
  const ContentType = input.ContentType; 
  //?? mime.getType(Name.split('.').pop()) ?? 'application/octet-stream';
  const Status = 'Uploading';

  await entity.Load(ProviderID);
  const driver = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(FileStorageBase, entity.ServerDriverKey);
  
  const { UploadUrl, ...maybeProviderKey } = await driver.CreatePreAuthUploadUrl(Name);
  const updatedInput = { ...input, ...maybeProviderKey, ContentType, Status };

  return { updatedInput, UploadUrl };
};
