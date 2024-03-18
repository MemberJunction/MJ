export type CreatePreAuthUploadUrlPayload = {
  UploadUrl: string;
  ProviderKey?: string | undefined;
};

export abstract class FileStorageBase {
  public abstract CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload>;
}
