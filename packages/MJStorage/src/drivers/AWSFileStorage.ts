import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import { CreatePreAuthUploadUrlPayload, FileStorageBase } from '../generic/FileStorageBase';

@RegisterClass(FileStorageBase, 'AWS S3 Storage')
export class AWSFileStorage extends FileStorageBase {
  private _bucket: string;
  private _keyPrefix: string;
  private _client: S3Client;

  constructor() {
    super();

    const region = env.get('STORAGE_AWS_REGION').required().asString();
    this._bucket = env.get('STORAGE_AWS_BUCKET_NAME').required().asString();

    const keyPrefix = env.get('STORAGE_AWS_KEY_PREFIX').default('/').asString();
    this._keyPrefix = keyPrefix.endsWith('/') ? keyPrefix : `${keyPrefix}/`;

    const credentials = {
      accessKeyId: env.get('STORAGE_AWS_ACCESS_KEY_ID').required().asString(),
      secretAccessKey: env.get('STORAGE_AWS_SECRET_ACCESS_KEY').required().asString(),
    };

    this._client = new S3Client({ region, credentials })
  }

  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    const key = `${this._keyPrefix}${objectName}`;
    const command = new PutObjectCommand({ Bucket: this._bucket, Key: key });

    const UploadUrl = await getSignedUrl(this._client, command, { expiresIn: 10 * 60 }); // 10 minutes
    return Promise.resolve({ UploadUrl });
  }

  public CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    const key = `${this._keyPrefix}${objectName}`;
    const command = new GetObjectCommand({ Bucket: this._bucket, Key: key });

    return getSignedUrl(this._client, command, { expiresIn: 10 * 60 }); // 10 minutes
  }

  public async DeleteObject(objectName: string): Promise<boolean> {
    const key = `${this._keyPrefix}${objectName}`;
    const command = new DeleteObjectCommand({ Bucket: this._bucket, Key: key });
    try {
      await this._client.send(command);
      return true;
    } catch (e) {
      console.error('Error deleting object from S3 storage', { key, bucket: this._bucket });
      console.error(e);
      return false;
    }
  }
}
