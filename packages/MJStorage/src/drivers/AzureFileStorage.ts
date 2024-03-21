import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  AccountSASSignatureValues,
  BlobClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateAccountSASQueryParameters
} from '@azure/storage-blob';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import { CreatePreAuthUploadUrlPayload, FileStorageBase } from '../generic/FileStorageBase';

@RegisterClass(FileStorageBase, 'Azure Blob Storage')
export class AzureFileStorage extends FileStorageBase {
  private _sharedKeyCredential: StorageSharedKeyCredential;
  private _container: string;
  private _accountName: string;

  constructor() {
    super();

    this._container = env.get('STORAGE_AZURE_CONTAINER').required().asString();
    this._accountName = env.get('STORAGE_AZURE_ACCOUNT_NAME').required().asString();
    const accountKey = env.get('STORAGE_AZURE_ACCOUNT_KEY').required().asString();

    this._sharedKeyCredential = new StorageSharedKeyCredential(this._accountName, accountKey);
  }

  public CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    const sasOptions: AccountSASSignatureValues = {
      services: AccountSASServices.parse('b').toString(), // blobs
      resourceTypes: AccountSASResourceTypes.parse('o').toString(), // object
      permissions: AccountSASPermissions.parse('w'), // write-only permissions
      protocol: SASProtocol.Https,
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 10 * 60 * 1000), // 10 minutes
    };

    // Using the SAS url to upload e.g.
    // curl -H "x-ms-blob-type: BlockBlob" --upload-file 1236.txt --url "https://bccdpfiles.blob.core.windows.net/ca-temp/1236.txt?sv=2023-11-03&ss=btqf&srt=sco&spr=https&st=2024-03-18T15%3A59%3A19Z&se=2024-03-18T16%3A09%3A19Z&sp=rwdlacupi&sig=Vu68WUzRmVDsTLXpFvRUKiZVQgjWtds1FFiRDXiwtug%3D"

    const sasToken = generateAccountSASQueryParameters(sasOptions, this._sharedKeyCredential).toString();
    const queryString = sasToken[0] === '?' ? sasToken : `?${sasToken}`;
    const UploadUrl = `https://${this._accountName}.blob.core.windows.net/${this._container}/${objectName}${queryString}`;

    return Promise.resolve({ UploadUrl });
  }

  public CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    const sasOptions: AccountSASSignatureValues = {
      services: AccountSASServices.parse('b').toString(), // blobs
      resourceTypes: AccountSASResourceTypes.parse('o').toString(), // object
      permissions: AccountSASPermissions.parse('r'), // read-only permissions
      protocol: SASProtocol.Https,
      startsOn: new Date(),
      expiresOn: new Date(new Date().valueOf() + 10 * 60 * 1000), // 10 minutes
    };

    const sasToken = generateAccountSASQueryParameters(sasOptions, this._sharedKeyCredential).toString();
    const queryString = sasToken[0] === '?' ? sasToken : `?${sasToken}`;
    const url = `https://${this._accountName}.blob.core.windows.net/${this._container}/${objectName}${queryString}`;

    return Promise.resolve(url);
  }

  public async DeleteObject(objectName: string): Promise<boolean> {
    const url = `https://${this._accountName}.blob.core.windows.net/${this._container}/${objectName}`;
    const blobClient = new BlobClient(url, this._sharedKeyCredential);
    const { succeeded } = await blobClient.deleteIfExists();
    return succeeded;
  }
}
