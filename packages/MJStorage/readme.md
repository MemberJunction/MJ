# @memberjunction/storage

The `@memberjunction/storage` library provides a unified interface for interacting with various cloud storage providers. It abstracts the complexities of different storage services behind a consistent API, making it easy to work with files stored across different cloud platforms.

[![MemberJunction Logo](https://memberjunction.com/images/MJ_Dark_Logo_Transparent_tm.png)](https://memberjunction.com)

## Overview

This library is a key component of the MemberJunction platform, providing seamless file storage operations across multiple cloud providers. It offers a provider-agnostic approach to file management, allowing applications to switch between storage providers without code changes.

## Features

- **Unified API**: Consistent methods across all storage providers via the `FileStorageBase` abstract class
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Flexible Provider Selection**: Use any number of storage providers simultaneously based on your application needs
- **Pre-authenticated URLs**: Secure upload and download operations using time-limited URLs
- **Metadata Support**: Store and retrieve custom metadata with your files
- **Error Handling**: Provider-specific errors are normalized with clear error messages
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
  - List files and directories with metadata
  - Create and manage directories
  - Get detailed file metadata
  - Check file/directory existence
  - Direct upload/download via Buffer
  - **Search files** using native provider search APIs
- **Extensible**: Easy to add new storage providers by extending `FileStorageBase`

## Installation

```bash
npm install @memberjunction/storage
```

## Dependencies

This package depends on:
- `@memberjunction/core` - Core MemberJunction functionality
- `@memberjunction/core-entities` - Entity definitions including `FileStorageProviderEntity`
- `@memberjunction/global` - Global utilities and class registration
- Provider-specific SDKs (installed as dependencies)

## Usage

### Standard Usage Pattern

**CRITICAL**: Always follow these steps when using storage providers:

1. Create provider instance
2. **Call `initialize()`** (with or without config)
3. Use provider

The `initialize()` method is smart enough to handle both simple deployments (environment variables) and multi-tenant deployments (database credentials).

### Basic Setup - Simple Deployment (Environment Variables)

For single-tenant applications, development, testing, or simple production deployments:

```bash
# Example: Azure Blob Storage
export STORAGE_AZURE_CONTAINER=your-container-name
export STORAGE_AZURE_ACCOUNT_NAME=your-account-name
export STORAGE_AZURE_ACCOUNT_KEY=your-account-key
```

```typescript
import { AzureFileStorage } from '@memberjunction/storage';

// Constructor loads environment variables
const storage = new AzureFileStorage();

// ALWAYS call initialize() - no config needed for env var deployments
await storage.initialize();

// Provider is now ready to use
await storage.ListObjects('/');
```

### Multi-Tenant Enterprise (Database Credentials)

For enterprise applications managing multiple storage accounts:

```typescript
import { FileStorageEngine } from '@memberjunction/core-entities';
import { initializeDriverWithAccountCredentials } from '@memberjunction/storage/util';

// Load account from database
const engine = FileStorageEngine.Instance;
await engine.Config(false, contextUser);

const accountWithProvider = engine.GetAccountWithProvider(accountId);

// Infrastructure utility handles credential decryption and initialization
const storage = await initializeDriverWithAccountCredentials({
  accountEntity: accountWithProvider.account,
  providerEntity: accountWithProvider.provider,
  contextUser
});

// Provider is ready - credentials were automatically decrypted and initialized
await storage.ListObjects('/');
```

**Key Advantage**: The `initializeDriverWithAccountCredentials()` utility:
- Automatically retrieves the credential by ID
- Decrypts it using CredentialEngine
- Calls `initialize()` with the decrypted values
- Returns a fully configured provider instance

### Using Utility Functions (Recommended)

The library provides high-level utility functions that work with MemberJunction's entity system:

```typescript
import { createUploadUrl, createDownloadUrl, deleteObject, moveObject } from '@memberjunction/storage';
import { FileStorageProviderEntity } from '@memberjunction/core-entities';
import { Metadata } from '@memberjunction/core';

// Load a FileStorageProviderEntity from the database
async function fileOperationsExample() {
  const md = new Metadata();
  const provider = await md.GetEntityObject<FileStorageProviderEntity>('File Storage Providers');
  await provider.Load('your-provider-id');
  
  // Create pre-authenticated upload URL
  const { updatedInput, UploadUrl } = await createUploadUrl(
    provider, 
    { 
      ID: '123', 
      Name: 'documents/report.pdf', 
      ProviderID: provider.ID 
    }
  );

  // The client can use the UploadUrl directly to upload the file
  console.log(`Upload URL: ${UploadUrl}`);
  console.log(`File status: ${updatedInput.Status}`); // 'Uploading'
  console.log(`Content type: ${updatedInput.ContentType}`); // 'application/pdf'
  
  // If a ProviderKey was returned, use it for future operations
  const fileIdentifier = updatedInput.ProviderKey || updatedInput.Name;
  
  // Later, create pre-authenticated download URL
  const downloadUrl = await createDownloadUrl(provider, fileIdentifier);
  console.log(`Download URL: ${downloadUrl}`);
  
  // Move the file to a new location
  const moved = await moveObject(
    provider,
    fileIdentifier,
    'documents/archived/report_2024.pdf'
  );
  console.log(`File moved: ${moved}`);
  
  // Delete the file when no longer needed
  const deleted = await deleteObject(provider, 'documents/archived/report_2024.pdf');
  console.log(`File deleted: ${deleted}`);
}
```

### Direct Provider Usage

You can work directly with a storage provider by instantiating it:

```typescript
import { FileStorageBase } from '@memberjunction/storage';
import { MJGlobal } from '@memberjunction/global';

async function directProviderExample() {
  // Method 1: Direct instantiation (simple deployment with env vars)
  const storage = new AzureFileStorage(); // Constructor loads env vars
  await storage.initialize(); // ALWAYS call initialize()

  // Method 2: Using class factory (dynamic provider selection)
  const storage2 = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
    FileStorageBase,
    'Azure Blob Storage'
  );
  await storage2.initialize(); // ALWAYS call initialize()

  // Method 3: Multi-tenant with manual initialization
  const storage3 = new AzureFileStorage();
  await storage3.initialize({
    accountId: '12345',
    accountName: 'Azure Account',
    accountName: 'myaccount',
    accountKey: '...',
    defaultContainer: 'my-container'
  });

  // Now you can use any of the storage methods:

  // List all files in a directory
  const result = await storage.ListObjects('documents/');
  console.log('Files:', result.objects);
  console.log('Directories:', result.prefixes);

  // Display detailed metadata for each file
  for (const file of result.objects) {
    console.log(`\nFile: ${file.name}`);
    console.log(`  Path: ${file.path}`);
    console.log(`  Full Path: ${file.fullPath}`);
    console.log(`  Size: ${file.size} bytes`);
    console.log(`  Type: ${file.contentType}`);
    console.log(`  Modified: ${file.lastModified}`);
    console.log(`  Is Directory: ${file.isDirectory}`);
  }

  // Create a directory
  const dirCreated = await storage.CreateDirectory('documents/reports/');
  console.log(`Directory created: ${dirCreated}`);

  // Upload a file directly with metadata
  const content = Buffer.from('Hello, World!');
  const uploaded = await storage.PutObject(
    'documents/reports/hello.txt',
    content,
    'text/plain',
    {
      author: 'John Doe',
      department: 'Engineering',
      version: '1.0'
    }
  );
  console.log(`File uploaded: ${uploaded}`);

  // Get file metadata without downloading content
  const metadata = await storage.GetObjectMetadata('documents/reports/hello.txt');
  console.log('File metadata:', metadata);

  // Download file content
  const fileContent = await storage.GetObject('documents/reports/hello.txt');
  console.log('File content:', fileContent.toString('utf8'));

  // Copy a file
  const copied = await storage.CopyObject(
    'documents/reports/hello.txt',
    'documents/archive/hello-backup.txt'
  );
  console.log(`File copied: ${copied}`);

  // Check if a file exists
  const exists = await storage.ObjectExists('documents/reports/hello.txt');
  console.log(`File exists: ${exists}`);

  // Check if a directory exists
  const dirExists = await storage.DirectoryExists('documents/reports/');
  console.log(`Directory exists: ${dirExists}`);

  // Delete a directory and all its contents
  const dirDeleted = await storage.DeleteDirectory('documents/reports/', true);
  console.log(`Directory deleted: ${dirDeleted}`);
}
```

### Key Principle

**Always call `initialize()`** after creating a provider instance. It's smart enough to:
- Use environment variables when called with no config
- Override with database credentials when called with config
- Handle both simple and multi-tenant deployments seamlessly

### Searching Files

Providers with native search capabilities support the `SearchFiles` method for finding files by name, content, and metadata:

```typescript
import { FileStorageBase, FileSearchOptions, UnsupportedOperationError } from '@memberjunction/storage';
import { MJGlobal } from '@memberjunction/global';

async function searchExample() {
  const storage = MJGlobal.Instance.ClassFactory.CreateInstance<FileStorageBase>(
    FileStorageBase,
    'Google Drive Storage'
  );

  try {
    // Simple search for files matching a query
    const results = await storage.SearchFiles('quarterly report');

    console.log(`Found ${results.results.length} files`);
    for (const file of results.results) {
      console.log(`  ${file.path} (${file.size} bytes)`);
      if (file.excerpt) {
        console.log(`    Excerpt: ${file.excerpt}`);
      }
    }

    // Advanced search with filters
    const pdfResults = await storage.SearchFiles('budget 2024', {
      fileTypes: ['pdf', 'docx'],
      modifiedAfter: new Date('2024-01-01'),
      pathPrefix: 'documents/finance/',
      maxResults: 50
    });

    // Content search (searches inside files)
    const contentResults = await storage.SearchFiles('machine learning', {
      searchContent: true,
      fileTypes: ['pdf', 'docx', 'txt']
    });

    // Check for more results
    if (contentResults.hasMore) {
      console.log(`Total matches: ${contentResults.totalMatches}`);
      console.log(`Next page token: ${contentResults.nextPageToken}`);
    }

  } catch (error) {
    if (error instanceof UnsupportedOperationError) {
      console.log('This provider does not support file search');
      // Fall back to ListObjects or other approaches
    } else {
      throw error;
    }
  }
}
```

**Provider Search Support:**
- ✅ **Google Drive**: Full support with content search
- ✅ **SharePoint**: Full support via Microsoft Graph Search
- ✅ **Dropbox**: Full support with content search
- ✅ **Box**: Full support with metadata search
- ❌ **AWS S3**: Not supported (throws UnsupportedOperationError)
- ❌ **Azure Blob**: Not supported (throws UnsupportedOperationError)
- ❌ **Google Cloud Storage**: Not supported (throws UnsupportedOperationError)

For providers without native search, consider using `ListObjects` with client-side filtering or implementing an external search index.

## API Reference

### Core Types

#### `CreatePreAuthUploadUrlPayload`
```typescript
type CreatePreAuthUploadUrlPayload = {
  UploadUrl: string;      // Pre-authenticated URL for upload
  ProviderKey?: string;   // Optional provider-specific key
};
```

#### `StorageObjectMetadata`
```typescript
type StorageObjectMetadata = {
  name: string;           // Object name (filename)
  path: string;           // Directory path
  fullPath: string;       // Complete path including name
  size: number;           // Size in bytes
  contentType: string;    // MIME type
  lastModified: Date;     // Last modification date
  isDirectory: boolean;   // Whether this is a directory
  etag?: string;          // Entity tag for caching
  cacheControl?: string;  // Cache control directives
  customMetadata?: Record<string, string>; // Custom metadata
};
```

#### `StorageListResult`
```typescript
type StorageListResult = {
  objects: StorageObjectMetadata[];  // Files found
  prefixes: string[];                // Directories found
};
```

#### `FileSearchOptions`
```typescript
type FileSearchOptions = {
  maxResults?: number;              // Maximum results (default: 100)
  fileTypes?: string[];             // Filter by MIME types or extensions
  modifiedAfter?: Date;             // Only files modified after this date
  modifiedBefore?: Date;            // Only files modified before this date
  pathPrefix?: string;              // Search within specific directory
  searchContent?: boolean;          // Search file contents (default: false)
  providerSpecific?: Record<string, any>; // Provider-specific options
};
```

#### `FileSearchResult`
```typescript
type FileSearchResult = {
  path: string;                     // Full path to file
  name: string;                     // Filename only
  size: number;                     // Size in bytes
  contentType: string;              // MIME type
  lastModified: Date;               // Last modification date
  relevance?: number;               // Relevance score (0.0-1.0)
  excerpt?: string;                 // Text excerpt with match context
  matchInFilename?: boolean;        // Whether match is in filename
  customMetadata?: Record<string, string>; // Custom metadata
  providerData?: Record<string, any>;      // Provider-specific data
};
```

#### `FileSearchResultSet`
```typescript
type FileSearchResultSet = {
  results: FileSearchResult[];      // Array of matching files
  totalMatches?: number;            // Total matches (if available)
  hasMore: boolean;                 // More results available?
  nextPageToken?: string;           // Token for next page
};
```

### FileStorageBase Methods

All storage providers implement these methods:

- **`initialize(config?: StorageProviderConfig): Promise<void>`** - **REQUIRED**: Always call after creating instance. Omit config for env vars, provide config for multi-tenant.
- `CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload>`
- `CreatePreAuthDownloadUrl(objectName: string): Promise<string>`
- `MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean>`
- `DeleteObject(objectName: string): Promise<boolean>`
- `ListObjects(prefix: string, delimiter?: string): Promise<StorageListResult>`
- `CreateDirectory(directoryPath: string): Promise<boolean>`
- `DeleteDirectory(directoryPath: string, recursive?: boolean): Promise<boolean>`
- `GetObjectMetadata(objectName: string): Promise<StorageObjectMetadata>`
- `GetObject(objectName: string): Promise<Buffer>`
- `PutObject(objectName: string, data: Buffer, contentType?: string, metadata?: Record<string, string>): Promise<boolean>`
- `CopyObject(sourceObjectName: string, destinationObjectName: string): Promise<boolean>`
- `ObjectExists(objectName: string): Promise<boolean>`
- `DirectoryExists(directoryPath: string): Promise<boolean>`
- `SearchFiles(query: string, options?: FileSearchOptions): Promise<FileSearchResultSet>` (throws `UnsupportedOperationError` for providers without native search)

### Utility Functions

- `createUploadUrl<T>(provider: FileStorageProviderEntity, input: T): Promise<{ updatedInput: T & { Status: string; ContentType: string }, UploadUrl: string }>`
- `createDownloadUrl(provider: FileStorageProviderEntity, providerKeyOrName: string): Promise<string>`
- `moveObject(provider: FileStorageProviderEntity, oldProviderKeyOrName: string, newProviderKeyOrName: string): Promise<boolean>`
- `deleteObject(provider: FileStorageProviderEntity, providerKeyOrName: string): Promise<boolean>`

## Architecture

The library uses a class hierarchy with `FileStorageBase` as the abstract base class that defines the common interface. Each storage provider implements this interface:

```
FileStorageBase (Abstract Base Class)
├── AWSFileStorage (@RegisterClass: 'AWS S3')
├── AzureFileStorage (@RegisterClass: 'Azure Blob Storage')
├── GoogleFileStorage (@RegisterClass: 'Google Cloud Storage')
├── GoogleDriveFileStorage (@RegisterClass: 'Google Drive')
├── SharePointFileStorage (@RegisterClass: 'SharePoint')
├── DropboxFileStorage (@RegisterClass: 'Dropbox')
└── BoxFileStorage (@RegisterClass: 'Box')
```

Classes are registered with the MemberJunction global class factory using the `@RegisterClass` decorator, enabling dynamic instantiation based on provider keys.

### Integration with MemberJunction

This library integrates seamlessly with the MemberJunction platform:

1. **Entity System**: Works with `FileStorageProviderEntity` from `@memberjunction/core-entities`
2. **Class Factory**: Uses `@memberjunction/global` for dynamic provider instantiation
3. **Configuration**: Provider settings are stored in the MemberJunction database
4. **Type Safety**: Fully typed interfaces ensure compile-time safety

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

The library is designed to be extensible. To add a new storage provider:

### 1. Create a New Provider Class

```typescript
import { FileStorageBase, StorageObjectMetadata, StorageListResult } from '@memberjunction/storage';
import { RegisterClass } from '@memberjunction/global';

@RegisterClass(FileStorageBase, 'My Custom Storage')
export class MyCustomStorage extends FileStorageBase {
  protected readonly providerName = 'My Custom Storage';
  
  constructor() {
    super();
    // Initialize your storage client here
  }
  
  public async initialize(): Promise<void> {
    // Optional: Perform async initialization
    // e.g., authenticate, verify permissions
  }
  
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    // Implement upload URL generation
    // Return { UploadUrl: string, ProviderKey?: string }
  }
  
  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    // Implement download URL generation
  }
  
  // Implement all other abstract methods...
}
```

### 2. Handle Unsupported Operations

If your provider doesn't support certain operations:

```typescript
public async CreateDirectory(directoryPath: string): Promise<boolean> {
  // If directories aren't supported
  this.throwUnsupportedOperationError('CreateDirectory');
}
```

### 3. Register Environment Variables

Document required environment variables:

```typescript
import * as env from 'env-var';

constructor() {
  super();
  const apiKey = env.get('STORAGE_MYCUSTOM_API_KEY').required().asString();
  const endpoint = env.get('STORAGE_MYCUSTOM_ENDPOINT').required().asString();
  // Use these to initialize your client
}
```

### 4. Export from Index

Add to `src/index.ts`:

```typescript
export * from './drivers/MyCustomStorage';
```

### 5. Add to Documentation

Update this README with configuration requirements and any provider-specific notes.

## Error Handling

The library provides consistent error handling across all providers:

### UnsupportedOperationError

Thrown when a provider doesn't support a specific operation:

```typescript
try {
  await storage.CreateDirectory('/some/path/');
} catch (error) {
  if (error instanceof UnsupportedOperationError) {
    console.log(`Provider doesn't support directories: ${error.message}`);
  }
}
```

### Provider-Specific Errors

Each provider may throw errors specific to its underlying SDK. These are not wrapped, allowing you to handle provider-specific error conditions:

```typescript
try {
  await storage.GetObject('non-existent-file.txt');
} catch (error) {
  // Handle provider-specific errors
  if (error.code === 'NoSuchKey') { // AWS S3
    console.log('File not found');
  } else if (error.code === 'BlobNotFound') { // Azure
    console.log('Blob not found');
  }
}
```

## Best Practices

1. **Use ProviderKey**: Always check for and use `ProviderKey` if returned by `CreatePreAuthUploadUrl`
2. **Error Handling**: Implement proper error handling for both generic and provider-specific errors
3. **Environment Variables**: Store sensitive credentials securely and never commit them to version control
4. **Content Types**: Always specify content types for better browser handling and security
5. **Metadata**: Use custom metadata to store additional information without modifying file content
6. **Directory Paths**: Always use trailing slashes for directory paths (e.g., `documents/` not `documents`)
7. **Initialize Providers**: Call `initialize()` on providers that require async setup

## Performance Considerations

- **Pre-authenticated URLs**: Use these for client uploads/downloads to reduce server load
- **Buffering**: The `GetObject` and `PutObject` methods load entire files into memory; for large files, consider streaming approaches
- **List Operations**: Use appropriate prefixes and delimiters to limit results
- **Caching**: Utilize ETags and cache control headers when available

## Contributing

Contributions are welcome! To add a new storage provider:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-provider`)
3. Create your provider class in `src/drivers/`
4. Implement all required methods from `FileStorageBase`
5. Add comprehensive tests
6. Update documentation
7. Submit a pull request

## License

ISC

---

Part of the [MemberJunction](https://memberjunction.com) platform.