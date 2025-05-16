# @memberjunction/storage

The `@memberjunction/storage` library provides a unified interface for interacting with various cloud storage providers. It abstracts the complexities of different storage services behind a consistent API, making it easy to work with files stored across different cloud platforms.

[![MemberJunction Logo](https://memberjunction.com/images/MJ_Dark_Logo_Transparent_tm.png)](https://memberjunction.com)

## Features

- **Unified API**: Consistent methods across all storage providers
- **Flexible Provider Selection**: Use any number of storage providers simultaneously based on your application needs
- **Commonly Supported Storage Providers**: 
  - [AWS S3](https://aws.amazon.com/s3/)
  - [Azure Blob Storage](https://azure.microsoft.com/en-us/products/storage/blobs)
  - [Google Cloud Storage](https://cloud.google.com/storage)
  - [Google Drive](https://developers.google.com/drive/api/guides/about-sdk)
  - [Microsoft SharePoint](https://learn.microsoft.com/en-us/sharepoint/dev/)
  - [Dropbox](https://www.dropbox.com/developers/documentation)
  - [Box](https://developer.box.com/guides/)
- **Common File Operations**:
  - Upload files (via pre-authenticated URLs)
  - Download files (via pre-authenticated URLs)
  - Copy and move files
  - Delete files and directories
  - List files and directories
  - Create and manage directories
  - Get file metadata
  - Check file/directory existence
- **Extensible**: Easy to add new storage providers

## Installation

```bash
npm install @memberjunction/storage
```

## Usage

### Basic Setup

First, configure the environment variables required for your chosen storage provider(s). You can implement multiple providers simultaneously and switch between them based on your application requirements.

Refer to the documentation for each storage provider for detailed configuration requirements (see the "Storage Provider Configuration" section below).

#### Azure Blob Storage Example
```bash
STORAGE_AZURE_CONTAINER=your-container-name
STORAGE_AZURE_ACCOUNT_NAME=your-account-name
STORAGE_AZURE_ACCOUNT_KEY=your-account-key
```

### Code Example

```typescript
import { AzureFileStorage, createUploadUrl, createDownloadUrl, deleteObject } from '@memberjunction/storage';
import { FileStorageProviderEntity } from '@memberjunction/core-entities';

// Assuming you have a FileStorageProviderEntity loaded from your database
async function fileOperationsExample(provider: FileStorageProviderEntity) {
  // Create pre-authenticated upload URL
  const { updatedInput, UploadUrl } = await createUploadUrl(
    provider, 
    { 
      ID: '123', 
      Name: 'document.pdf', 
      ProviderID: provider.ID 
    }
  );

  // The client can use the UploadUrl directly to upload the file
  console.log(`Upload URL: ${UploadUrl}`);
  
  // Later, create pre-authenticated download URL
  const downloadUrl = await createDownloadUrl(provider, updatedInput.Name);
  console.log(`Download URL: ${downloadUrl}`);
  
  // Delete the file when no longer needed
  const deleted = await deleteObject(provider, updatedInput.Name);
  console.log(`File deleted: ${deleted}`);
}
```

### Direct Provider Usage

You can also work directly with a storage provider:

```typescript
import { AzureFileStorage } from '@memberjunction/storage';

async function directProviderExample() {
  const storage = new AzureFileStorage();
  
  // List all files in a directory
  const result = await storage.ListObjects('documents/');
  console.log('Files:', result.objects);
  console.log('Directories:', result.prefixes);
  
  // Create a directory
  await storage.CreateDirectory('documents/reports/');
  
  // Upload a file directly
  const content = Buffer.from('Hello, World!');
  await storage.PutObject('documents/reports/hello.txt', content, 'text/plain');
  
  // Copy a file
  await storage.CopyObject('documents/reports/hello.txt', 'documents/archive/hello-copy.txt');
  
  // Check if a file exists
  const exists = await storage.ObjectExists('documents/reports/hello.txt');
}
```

## Architecture

The library uses a class hierarchy with `FileStorageBase` as the abstract base class that defines the common interface. Each storage provider implements this interface in its own way:

```
FileStorageBase (Abstract Base Class)
├── AWSFileStorage
├── AzureFileStorage
├── GoogleFileStorage
├── GoogleDriveFileStorage
├── SharePointFileStorage
├── DropboxFileStorage
└── BoxFileStorage
```

Utility functions provide a simplified interface for common operations.

## Storage Provider Configuration

Each storage provider requires specific environment variables. Please refer to the official documentation for each provider for detailed information on authentication and additional configuration options.

### AWS S3
- `STORAGE_AWS_BUCKET`: S3 bucket name
- `STORAGE_AWS_REGION`: AWS region (e.g., 'us-east-1')
- `STORAGE_AWS_ACCESS_KEY_ID`: AWS access key ID
- `STORAGE_AWS_SECRET_ACCESS_KEY`: AWS secret access key

For more information, see [AWS S3 Documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-started-nodejs.html).

### Azure Blob Storage
- `STORAGE_AZURE_CONTAINER`: Container name
- `STORAGE_AZURE_ACCOUNT_NAME`: Account name
- `STORAGE_AZURE_ACCOUNT_KEY`: Account key

For more information, see [Azure Blob Storage Documentation](https://learn.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs).

### Google Cloud Storage
- `STORAGE_GOOGLE_BUCKET`: GCS bucket name
- `STORAGE_GOOGLE_KEY_FILE_PATH`: Path to service account key file (JSON)

For more information, see [Google Cloud Storage Documentation](https://cloud.google.com/storage/docs/reference/libraries#client-libraries-install-nodejs).

### Google Drive
- `STORAGE_GOOGLE_DRIVE_CLIENT_ID`: OAuth client ID
- `STORAGE_GOOGLE_DRIVE_CLIENT_SECRET`: OAuth client secret
- `STORAGE_GOOGLE_DRIVE_REDIRECT_URI`: OAuth redirect URI
- `STORAGE_GOOGLE_DRIVE_REFRESH_TOKEN`: OAuth refresh token

For more information, see [Google Drive API Documentation](https://developers.google.com/drive/api/guides/about-sdk).

### SharePoint
- `STORAGE_SHAREPOINT_SITE_URL`: SharePoint site URL
- `STORAGE_SHAREPOINT_CLIENT_ID`: Azure AD client ID
- `STORAGE_SHAREPOINT_CLIENT_SECRET`: Azure AD client secret
- `STORAGE_SHAREPOINT_TENANT_ID`: Azure AD tenant ID

For more information, see [Microsoft Graph API Documentation](https://learn.microsoft.com/en-us/graph/api/resources/sharepoint).

### Dropbox
- `STORAGE_DROPBOX_ACCESS_TOKEN`: Dropbox access token
- `STORAGE_DROPBOX_REFRESH_TOKEN`: Dropbox refresh token (optional)
- `STORAGE_DROPBOX_APP_KEY`: Dropbox app key
- `STORAGE_DROPBOX_APP_SECRET`: Dropbox app secret

For more information, see [Dropbox API Documentation](https://www.dropbox.com/developers/documentation/javascript).

### Box
- `STORAGE_BOX_CLIENT_ID`: Box client ID
- `STORAGE_BOX_CLIENT_SECRET`: Box client secret
- `STORAGE_BOX_ENTERPRISE_ID`: Box enterprise ID
- `STORAGE_BOX_JWT_KEY_ID`: Box JWT key ID
- `STORAGE_BOX_PRIVATE_KEY`: Box private key (base64 encoded)
- `STORAGE_BOX_PRIVATE_KEY_PASSPHRASE`: Box private key passphrase (optional)

For more information, see [Box Platform Documentation](https://developer.box.com/guides/authentication/).

## Implementing Additional Providers

The library is designed to be extensible. You can implement new storage providers by:

1. Creating a new class that extends `FileStorageBase`
2. Implementing all required abstract methods
3. Registering the class using the `@RegisterClass` decorator from `@memberjunction/global`

Refer to the existing provider implementations for guidance on how to implement a new provider.

## Contributing

Contributions are welcome! To add a new storage provider:

1. Create a new class in the `src/drivers` directory
2. Extend the `FileStorageBase` class
3. Implement all required methods
4. Add exports to `src/index.ts`

## License

ISC

---

Part of the [MemberJunction](https://memberjunction.com) platform.