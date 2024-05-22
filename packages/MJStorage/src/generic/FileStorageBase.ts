export type CreatePreAuthUploadUrlPayload = {
  UploadUrl: string;
  ProviderKey?: string | undefined;
};

/**
 * Represents an abstract base class for file storage. Provides methods for creating pre-authorized upload and download URLs, as well as deleting objects. This
 * interface is implemented in specific driver classes for each storage provider.
 */
export abstract class FileStorageBase {
  /**
   * This method is designed to generate a pre-authenticated URL for uploading files to a storage provider. It abstracts over different storage providers,
   * allowing for a unified interface to obtain upload URLs, regardless of the underlying provider's specifics. The method takes the name of the file (or
   * object) you wish to upload as input and returns a Promise. This Promise, when resolved, provides a payload containing two key pieces of information:
   *
   * 1. `UploadUrl`: The URL to which the file should be uploaded. This URL is pre-authenticated, meaning it includes any necessary authentication tokens or
   *    signatures. The URL's format and the authentication method depend on the storage provider being used.
   *
   * 2. `ProviderKey` (optional): Some storage providers assign their own unique key or name to the uploaded object instead of using the name provided by the
   *    user. If the provider you are using does this, the `ProviderKey` will be included in the payload. This key can be useful for future reference to the
   *    object within the storage provider's system.
   *
   * @usage
   *
   * Suppose you have a file named "photo.jpg" that you want to upload to your storage provider. You would call this method with the object name "photo.jpg".
   * After the Promise resolves, you will receive the upload URL and, if applicable, the provider's object key. You can then use this URL to upload your file
   * directly to the storage provider.
   *
   * ```typescript
   * const uploadPayload = await CreatePreAuthUploadUrl("photo.jpg");
   * console.log(uploadPayload.UploadUrl); // Use this URL to upload your file
   * if (uploadPayload.ProviderKey) {
   *   // If this is returned, use it as the `objectName` for `CreatePreAuthDownloadUrl` or `DeleteObject`
   *   console.log(uploadPayload.ProviderKey);
   * }
   * ```
   *
   * Note: This method is abstract and must be implemented by a subclass that specifies the logic for interacting with a specific storage provider.
   *
   * @param objectName - The name of the object or file to be uploaded. This name is used by the storage provider and may also be included in the
   *                     pre-authenticated URL.
   * @returns A Promise that resolves to a payload containing the upload URL and, optionally, the provider's object key. This payload allows you to proceed with
   *          uploading your file to the storage provider.
   */
  public abstract CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload>;

  /**
   * This abstract method is designed to generate a pre-authenticated URL that allows for the downloading of files or objects from a storage provider. Being
   * abstract, it requires implementation in a subclass tailored to the specifics of the storage provider you're using. This method abstracts the process of
   * generating download URLs across different storage providers, offering a unified interface for obtaining these URLs.
   *
   * When you call this method with the name of the file or object you wish to download, it initiates a process to create a URL. This URL is not just any link;
   * it is pre-authenticated. This means it includes any necessary authentication tokens or signatures directly in the URL, allowing for secure access without
   * requiring additional authentication steps at the time of download. The format of the URL and the authentication method depend on the storage provider.
   *
   * @usage
   *
   * Suppose you have a file named "report.pdf" stored in your cloud storage, and you want to generate a URL to download this file. You would call this method
   * with the object name "report.pdf". After the Promise resolves, you will receive a URL that is ready to use for downloading the file.
   *
   * ```typescript
   * const downloadUrl = await CreatePreAuthDownloadUrl("report.pdf");
   * console.log(downloadUrl); // Use this URL to download your file directly
   * ```
   *
   * If a `ProviderKey` was previously returned by `CreatePreAuthUploadUrl`, use that as the `objectName` instead of the object's natural name.
   *
   * ```typescript
   * const downloadUrl = await CreatePreAuthDownloadUrl(file.ProviderKey);
   * console.log(downloadUrl); // Use this URL to download your file directly
   * ```
   *
   * This method simplifies the process of securely sharing or accessing files stored in cloud storage by providing a direct, pre-authenticated link to the
   * file. It's particularly useful in applications where files need to be accessed or shared without navigating through the storage provider's standard
   * authentication flow each time.
   *
   * Note: Since this method is abstract, you must implement it in a subclass that defines the specific interactions with your chosen storage provider.
   *
   * @param objectName - The name of the object or file for which you want to generate a download URL. This is the name as it is known to the storage provider,
   *                     and it will be used to locate the file and generate the URL.
   * @returns A Promise that resolves to a string, which is the pre-authenticated download URL for the specified object or file. This URL can be used
   *          immediately for downloading the file without further authentication.
   */
  public abstract CreatePreAuthDownloadUrl(objectName: string): Promise<string>;

  /**
   * This abstract method is designed to move an object or file from one location to another within a storage provider's system. Being abstract, it requires concrete implementation in subclasses that are tailored to interact with specific storage providers. The method aims to provide a unified interface for moving objects across different storage providers, simplifying the process regardless of the underlying provider's specifics.
   *
   * When invoking this method, you need to specify the name of the object you wish to move (`oldObjectName`) and the new name or location where you want to move the object (`newObjectName`). These names should match exactly as they are known to the storage provider, ensuring the correct object is targeted for the move operation.
   *
   * The method returns a Promise that, when resolved, indicates the success or failure of the move operation. A resolved value of `true` means the object was successfully moved, while `false` indicates a failure to move the object. It's important to handle both outcomes to ensure your application can respond appropriately to the move operation's result.
   *
   * @param oldObjectName - The name of the object or file to be moved. This is the identifier used by the storage provider to locate the object for moving.
   * @param newObjectName - The new name or location where you want to move the object. This name should match exactly as it is known to the storage provider.
   * @returns A Promise that resolves to a boolean value. `true` indicates that the object was successfully moved, while `false` indicates a failure in the move process.
   */
  public abstract MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean>;

  /**
   * This abstract method is designed for deleting an object or file from a storage provider's system. Being abstract, it requires concrete implementation in
   * subclasses that are tailored to interact with specific storage providers. The method aims to provide a unified interface for object deletion across
   * different storage providers, simplifying the deletion process regardless of the underlying provider's specifics.
   *
   * When invoking this method, you need to specify the name of the object you wish to delete. This name should match exactly as it is known to the storage
   * provider, ensuring the correct object is targeted for deletion.
   *
   * The method returns a Promise that, when resolved, indicates the success or failure of the deletion operation. A resolved value of `true` means the object
   * was successfully deleted, while `false` indicates a failure to delete the object. It's important to handle both outcomes to ensure your application can
   * respond appropriately to the deletion operation's result.
   *
   * @usage
   *
   * Suppose you have a file named "old_report.pdf" that is no longer needed and you want to delete it from your cloud storage. You would call this method with
   * the object name "old_report.pdf". After the Promise resolves, you can check the result to confirm the deletion.
   *
   * ```typescript
   * DeleteObject("old_report.pdf").then((isDeleted) => {
   *   if (isDeleted) {
   *     console.log("The file was successfully deleted.");
   *   } else {
   *     console.log("Failed to delete the file. It may not exist or there was an error in the deletion process.");
   *   }
   * });
   * ```
   *
   * If a `ProviderKey` was previously returned by `CreatePreAuthUploadUrl`, use that as the `objectName` instead of the object's natural name.
   *
   * ```typescript
   * DeleteObject(file.ProviderKey).then((isDeleted) => {
   *   if (isDeleted) {
   *     console.log("The file was successfully deleted.");
   *   } else {
   *     console.log("Failed to delete the file. It may not exist or there was an error in the deletion process.");
   *   }
   * });
   * ```
   *
   * Note: Since this method is abstract, it must be implemented in a subclass that defines the specific logic for interacting with your chosen storage
   * provider. This implementation should handle the intricacies of the deletion process, including any authentication and authorization required by the storage
   * provider.
   *
   * @param objectName - The name of the object or file to be deleted. This is the identifier used by the storage provider to locate the object for deletion.
   * @returns A Promise that resolves to a boolean value. `true` indicates that the object was successfully deleted, while `false` indicates a failure in the
   * deletion process.
   */
  public abstract DeleteObject(objectName: string): Promise<boolean>;
}
