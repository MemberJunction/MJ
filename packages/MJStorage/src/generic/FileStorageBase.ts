export type CreatePreAuthUploadUrlPayload = {
  UploadUrl: string;
  ProviderKey?: string | undefined;
};

export abstract class FileStorageBase {
  public abstract CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload>;
  public abstract CreatePreAuthDownloadUrl(objectName: string): Promise<string>;
  public abstract DeleteObject(objectName: string): Promise<boolean>;
}
