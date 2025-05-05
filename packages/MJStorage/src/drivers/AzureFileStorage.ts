import {
  AccountSASPermissions,
  AccountSASResourceTypes,
  AccountSASServices,
  AccountSASSignatureValues,
  BlobClient,
  BlobGenerateSasUrlOptions,
  BlobSASPermissions,
  BlobServiceClient,
  ContainerClient,
  SASProtocol,
  StorageSharedKeyCredential,
  generateAccountSASQueryParameters,
} from '@azure/storage-blob';
import { RegisterClass } from '@memberjunction/global';
import * as env from 'env-var';
import * as mime from 'mime-types';
import { 
  CreatePreAuthUploadUrlPayload, 
  FileStorageBase, 
  StorageListResult, 
  StorageObjectMetadata 
} from '../generic/FileStorageBase';

@RegisterClass(FileStorageBase, 'Azure Blob Storage')
export class AzureFileStorage extends FileStorageBase {
  protected readonly providerName = 'Azure Blob Storage';
  private _sharedKeyCredential: StorageSharedKeyCredential;
  private _container: string;
  private _accountName: string;
  private _containerClient: ContainerClient;
  private _blobServiceClient: BlobServiceClient;

  constructor() {
    super();

    this._container = env.get('STORAGE_AZURE_CONTAINER').required().asString();
    this._accountName = env.get('STORAGE_AZURE_ACCOUNT_NAME').required().asString();
    const accountKey = env.get('STORAGE_AZURE_ACCOUNT_KEY').required().asString();

    this._sharedKeyCredential = new StorageSharedKeyCredential(this._accountName, accountKey);
    
    const blobServiceUrl = `https://${this._accountName}.blob.core.windows.net`;
    this._blobServiceClient = new BlobServiceClient(
      blobServiceUrl,
      this._sharedKeyCredential
    );
    
    this._containerClient = this._blobServiceClient.getContainerClient(this._container);
  }

  /**
   * Creates a BlobClient for the specified object
   */
  private _getBlobClient(objectName: string): BlobClient {
    return this._containerClient.getBlobClient(objectName);
  }

  /**
   * Normalize directory path to ensure it ends with a slash
   */
  private _normalizeDirectoryPath(path: string): string {
    return path.endsWith('/') ? path : path + '/';
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
    const now = new Date();
    const sasOptions: AccountSASSignatureValues = {
      services: AccountSASServices.parse('b').toString(), // blobs
      resourceTypes: AccountSASResourceTypes.parse('o').toString(), // object
      permissions: AccountSASPermissions.parse('r'), // read-only permissions
      protocol: SASProtocol.Https,
      startsOn: new Date(now.valueOf() - 60 * 1000), // now minus 1 minute
      expiresOn: new Date(now.valueOf() + 10 * 60 * 1000), // 10 minutes from now
    };

    const sasToken = generateAccountSASQueryParameters(sasOptions, this._sharedKeyCredential).toString();
    const queryString = sasToken[0] === '?' ? sasToken : `?${sasToken}`;
    const url = `https://${this._accountName}.blob.core.windows.net/${this._container}/${objectName}${queryString}`;

    return Promise.resolve(url);
  }

  public async MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean> {
    try {
      // Reuse CopyObject and DeleteObject for moving
      const copied = await this.CopyObject(oldObjectName, newObjectName);
      if (copied) {
        return this.DeleteObject(oldObjectName);
      }
      return false;
    } catch (error) {
      console.error('Error moving object in Azure Blob Storage', { oldObjectName, newObjectName });
      console.error(error);
      return false;
    }
  }

  public async DeleteObject(objectName: string): Promise<boolean> {
    try {
      const blobClient = this._getBlobClient(objectName);
      const { succeeded } = await blobClient.deleteIfExists();
      return succeeded;
    } catch (error) {
      console.error('Error deleting object from Azure Blob Storage', { objectName });
      console.error(error);
      return false;
    }
  }

  public async ListObjects(prefix: string, delimiter = '/'): Promise<StorageListResult> {
    try {
      // Azure doesn't support real directories, so we need to mimic the behavior
      const objects: StorageObjectMetadata[] = [];
      const prefixes = new Set<string>();
      
      // List all blobs under the prefix
      const listOptions = {
        prefix: prefix
      };
      
      // Get all blobs
      for await (const blob of this._containerClient.listBlobsFlat(listOptions)) {
        const blobName = blob.name;
        
        // Skip the directory placeholder blob itself
        if (blobName === prefix) continue;
        
        // Extract "directory" from path if using delimiter
        if (delimiter) {
          const pathAfterPrefix = blobName.slice(prefix.length);
          const delimiterIndex = pathAfterPrefix.indexOf(delimiter);
          
          // If there's a delimiter after the prefix, this is a "directory"
          if (delimiterIndex !== -1) {
            const directoryPath = prefix + pathAfterPrefix.substring(0, delimiterIndex + 1);
            prefixes.add(directoryPath);
            continue; // Skip adding as an object
          }
        }
        
        // Get the last part of the path as the name
        const pathParts = blobName.split('/');
        const name = pathParts[pathParts.length - 1];
        
        // Calculate the path
        const path = pathParts.slice(0, -1).join('/');
        
        objects.push({
          name,
          path,
          fullPath: blobName,
          size: blob.properties.contentLength || 0,
          contentType: blob.properties.contentType || mime.lookup(blobName) || 'application/octet-stream',
          lastModified: blob.properties.lastModified || new Date(),
          isDirectory: blobName.endsWith('/'),
          etag: blob.properties.etag
        });
      }
      
      return {
        objects,
        prefixes: Array.from(prefixes)
      };
    } catch (error) {
      console.error('Error listing objects in Azure Blob Storage', { prefix });
      console.error(error);
      return { objects: [], prefixes: [] };
    }
  }

  public async CreateDirectory(directoryPath: string): Promise<boolean> {
    try {
      // Azure Blob Storage doesn't have real directories
      // We create a zero-byte blob with a trailing slash to represent a directory
      directoryPath = this._normalizeDirectoryPath(directoryPath);
      
      const blobClient = this._getBlobClient(directoryPath);
      const blockBlobClient = blobClient.getBlockBlobClient();
      // Using proper typing for Azure's upload method
      await blockBlobClient.upload(Buffer.from('').valueOf(), 0, {
        blobHTTPHeaders: {
          blobContentType: 'application/x-directory'
        }
      });
      return true;
    } catch (error) {
      console.error('Error creating directory in Azure Blob Storage', { directoryPath });
      console.error(error);
      return false;
    }
  }

  public async DeleteDirectory(directoryPath: string, recursive = false): Promise<boolean> {
    try {
      directoryPath = this._normalizeDirectoryPath(directoryPath);
      
      if (!recursive) {
        // Just delete the directory placeholder
        return this.DeleteObject(directoryPath);
      }
      
      // For recursive delete, list all blobs under this directory and delete them
      const blobsToDelete = [];
      
      // List all blobs under the prefix
      const listOptions = {
        prefix: directoryPath
      };
      
      // Get all blobs to delete
      for await (const blob of this._containerClient.listBlobsFlat(listOptions)) {
        blobsToDelete.push(this._containerClient.getBlobClient(blob.name).delete());
      }
      
      // Delete all the blobs concurrently
      await Promise.all(blobsToDelete);
      
      return true;
    } catch (error) {
      console.error('Error deleting directory from Azure Blob Storage', { directoryPath, recursive });
      console.error(error);
      return false;
    }
  }

  public async GetObjectMetadata(objectName: string): Promise<StorageObjectMetadata> {
    try {
      const blobClient = this._getBlobClient(objectName);
      const properties = await blobClient.getProperties();
      
      const pathParts = objectName.split('/');
      const name = pathParts[pathParts.length - 1];
      const path = pathParts.slice(0, -1).join('/');
      
      return {
        name,
        path,
        fullPath: objectName,
        size: properties.contentLength || 0,
        contentType: properties.contentType || mime.lookup(objectName) || 'application/octet-stream',
        lastModified: properties.lastModified || new Date(),
        isDirectory: objectName.endsWith('/'),
        etag: properties.etag,
        cacheControl: properties.cacheControl,
        customMetadata: properties.metadata
      };
    } catch (error) {
      console.error('Error getting object metadata from Azure Blob Storage', { objectName });
      console.error(error);
      throw new Error(`Object not found: ${objectName}`);
    }
  }

  public async GetObject(objectName: string): Promise<Buffer> {
    try {
      const blobClient = this._getBlobClient(objectName);
      const downloadResponse = await blobClient.download();
      
      if (!downloadResponse.readableStreamBody) {
        throw new Error(`Empty response body for object: ${objectName}`);
      }
      
      // Read the stream into a buffer
      const chunks: Buffer[] = [];
      for await (const chunk of downloadResponse.readableStreamBody) {
        chunks.push(Buffer.from(chunk));
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      console.error('Error getting object from Azure Blob Storage', { objectName });
      console.error(error);
      throw new Error(`Failed to get object: ${objectName}`);
    }
  }

  public async PutObject(
    objectName: string, 
    data: Buffer, 
    contentType?: string, 
    metadata?: Record<string, string>
  ): Promise<boolean> {
    try {
      const blobClient = this._getBlobClient(objectName);
      const blockBlobClient = blobClient.getBlockBlobClient();
      
      // Determine content type based on file extension if not provided
      const effectiveContentType = contentType || mime.lookup(objectName) || 'application/octet-stream';
      
      // Convert buffer to correct type for Azure SDK
      await blockBlobClient.upload(data instanceof Buffer ? data.valueOf() : data, data.length, {
        blobHTTPHeaders: {
          blobContentType: effectiveContentType
        },
        metadata
      });
      
      return true;
    } catch (error) {
      console.error('Error putting object to Azure Blob Storage', { objectName });
      console.error(error);
      return false;
    }
  }

  public async CopyObject(sourceObjectName: string, destinationObjectName: string): Promise<boolean> {
    try {
      const sourceBlobClient = this._getBlobClient(sourceObjectName);
      const destinationBlobClient = this._getBlobClient(destinationObjectName);
      
      // Generate SAS URL for source blob
      const sasOptions: BlobGenerateSasUrlOptions = {
        permissions: BlobSASPermissions.parse('r'), // read-only permissions
        expiresOn: new Date(new Date().valueOf() + 10 * 60 * 1000), // 10 minutes
        protocol: SASProtocol.Https,
      };
      
      const sasUrl = await sourceBlobClient.generateSasUrl(sasOptions);
      
      // Copy the blob
      const copyResult = await destinationBlobClient.syncCopyFromURL(sasUrl);
      return copyResult.copyStatus === 'success';
    } catch (error) {
      console.error('Error copying object in Azure Blob Storage', { sourceObjectName, destinationObjectName });
      console.error(error);
      return false;
    }
  }

  public async ObjectExists(objectName: string): Promise<boolean> {
    try {
      const blobClient = this._getBlobClient(objectName);
      return await blobClient.exists();
    } catch (error) {
      console.error('Error checking if object exists in Azure Blob Storage', { objectName });
      console.error(error);
      return false;
    }
  }

  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    try {
      directoryPath = this._normalizeDirectoryPath(directoryPath);
      
      // Method 1: Check if the directory placeholder exists
      const placeholderExists = await this.ObjectExists(directoryPath);
      if (placeholderExists) {
        return true;
      }
      
      // Method 2: Check if any objects exist with this prefix
      const listOptions = {
        prefix: directoryPath,
        maxPageSize: 1
      };
      
      // Get just one blob to check if any exist
      const iterator = this._containerClient.listBlobsFlat(listOptions);
      const response = await iterator.next();
      
      return !response.done;
    } catch (error) {
      console.error('Error checking if directory exists in Azure Blob Storage', { directoryPath });
      console.error(error);
      return false;
    }
  }
}
