import { Storage } from '@google-cloud/storage';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import { CreatePreAuthUploadUrlPayload, FileStorageBase } from '../generic/FileStorageBase';



@RegisterClass(FileStorageBase, 'Google Cloud Storage')
export class GoogleFileStorage extends FileStorageBase {
  private _bucket: string;
  private _client: Storage;

  constructor() {
    super();
    const credentials = env.get('STORAGE_GOOGLE_KEY_JSON').required().asJsonObject();
    this._client = new Storage({ credentials });
    this._bucket = env.get('STORAGE_GOOGLE_BUCKET_NAME').required().asString();
  }

  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    const file = this._client.bucket(this._bucket).file(objectName);
    const options = {
      version: 'v4',
      action: 'write',
      expires: Date.now() + 10 * 60 * 1000, // 10 mins
    } as const;

     const [UploadUrl] = await file.getSignedUrl(options);

     return { UploadUrl };
  }

  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    const file = this._client.bucket(this._bucket).file(objectName);
    const options = {
      version: 'v4',
      action: 'read',
      expires: Date.now() + 10 * 60 * 1000, // 10 mins
    } as const;

    const [url] = await file.getSignedUrl(options);

    return url;
  }

  public async DeleteObject(objectName: string): Promise<boolean> {
    try {
      const [response] = await this._client.bucket(this._bucket).file(objectName).delete();
      return /^2\d{2}/.test(String(response.statusCode));
    } catch (e) {
      console.error('Error deleting object from Google storage', { file: objectName, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }
}
