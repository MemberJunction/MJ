/**
 * Unit tests for the FileStorageBase class.
 * These tests focus on the initialize() method and account information handling.
 */

import {
  FileStorageBase,
  StorageProviderConfig,
  StorageListResult,
  CreatePreAuthUploadUrlPayload,
  StorageObjectMetadata,
  GetObjectParams,
  GetObjectMetadataParams,
  FileSearchResultSet,
  FileSearchOptions,
  UnsupportedOperationError,
} from '../generic/FileStorageBase';

/**
 * Concrete implementation of FileStorageBase for testing purposes.
 * This class implements all abstract methods with minimal functionality
 * to allow testing the base class behavior.
 */
class TestableFileStorageDriver extends FileStorageBase {
  protected readonly providerName = 'TestableProvider';

  private _isConfigured = false;
  public configPassedToInitialize: StorageProviderConfig | null = null;

  public async initialize(config: StorageProviderConfig): Promise<void> {
    // Call the base implementation
    await super.initialize(config);
    // Store the config for test verification
    this.configPassedToInitialize = config;
    this._isConfigured = true;
  }

  public get IsConfigured(): boolean {
    return this._isConfigured;
  }

  // Minimal implementations of abstract methods
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    return { UploadUrl: `https://test.url/${objectName}` };
  }

  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    return `https://test.url/${objectName}`;
  }

  public async MoveObject(oldObjectName: string, newObjectName: string): Promise<boolean> {
    return true;
  }

  public async DeleteObject(objectName: string): Promise<boolean> {
    return true;
  }

  public async ListObjects(prefix: string, delimiter?: string): Promise<StorageListResult> {
    return { objects: [], prefixes: [] };
  }

  public async CreateDirectory(directoryPath: string): Promise<boolean> {
    return true;
  }

  public async DeleteDirectory(directoryPath: string, recursive?: boolean): Promise<boolean> {
    return true;
  }

  public async GetObjectMetadata(params: GetObjectMetadataParams): Promise<StorageObjectMetadata> {
    return {
      name: 'test.txt',
      path: '/',
      fullPath: '/test.txt',
      size: 0,
      contentType: 'text/plain',
      lastModified: new Date(),
      isDirectory: false,
    };
  }

  public async GetObject(params: GetObjectParams): Promise<Buffer> {
    return Buffer.from('');
  }

  public async PutObject(objectName: string, data: Buffer, contentType?: string, metadata?: Record<string, string>): Promise<boolean> {
    return true;
  }

  public async CopyObject(sourceObjectName: string, destinationObjectName: string): Promise<boolean> {
    return true;
  }

  public async ObjectExists(objectName: string): Promise<boolean> {
    return false;
  }

  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    return false;
  }

  public async SearchFiles(query: string, options?: FileSearchOptions): Promise<FileSearchResultSet> {
    return { results: [], hasMore: false };
  }

  // Expose the protected method for testing
  public testThrowUnsupportedOperationError(methodName: string): never {
    return this.throwUnsupportedOperationError(methodName);
  }
}

describe('FileStorageBase', () => {
  let driver: TestableFileStorageDriver;

  beforeEach(() => {
    driver = new TestableFileStorageDriver();
  });

  describe('initialize()', () => {
    it('should store accountId from config', async () => {
      const config: StorageProviderConfig = {
        accountId: 'test-account-id-123',
      };

      await driver.initialize(config);

      expect(driver.AccountId).toBe('test-account-id-123');
    });

    it('should store accountName from config when provided', async () => {
      const config: StorageProviderConfig = {
        accountId: 'test-account-id-123',
        accountName: 'My Test Storage Account',
      };

      await driver.initialize(config);

      expect(driver.AccountName).toBe('My Test Storage Account');
    });

    it('should handle undefined accountName gracefully', async () => {
      const config: StorageProviderConfig = {
        accountId: 'test-account-id-123',
        // accountName intentionally omitted
      };

      await driver.initialize(config);

      expect(driver.AccountId).toBe('test-account-id-123');
      expect(driver.AccountName).toBeUndefined();
    });

    it('should allow additional provider-specific config values', async () => {
      const config: StorageProviderConfig = {
        accountId: 'account-456',
        accountName: 'S3 Bucket Account',
        bucket: 'my-bucket',
        region: 'us-west-2',
        accessKeyId: 'AKIA...',
      };

      await driver.initialize(config);

      // Verify base properties are set
      expect(driver.AccountId).toBe('account-456');
      expect(driver.AccountName).toBe('S3 Bucket Account');

      // Verify the full config was passed through
      expect(driver.configPassedToInitialize).toEqual({
        accountId: 'account-456',
        accountName: 'S3 Bucket Account',
        bucket: 'my-bucket',
        region: 'us-west-2',
        accessKeyId: 'AKIA...',
      });
    });
  });

  describe('AccountId getter', () => {
    it('should return undefined before initialization', () => {
      expect(driver.AccountId).toBeUndefined();
    });

    it('should return the accountId after initialization', async () => {
      await driver.initialize({ accountId: 'my-account-id' });

      expect(driver.AccountId).toBe('my-account-id');
    });
  });

  describe('AccountName getter', () => {
    it('should return undefined before initialization', () => {
      expect(driver.AccountName).toBeUndefined();
    });

    it('should return the accountName after initialization', async () => {
      await driver.initialize({
        accountId: 'my-account-id',
        accountName: 'Production S3 Account',
      });

      expect(driver.AccountName).toBe('Production S3 Account');
    });
  });

  describe('UnsupportedOperationError', () => {
    it('should create error with correct message format', () => {
      const error = new UnsupportedOperationError('SearchFiles', 'AWS S3');

      expect(error.message).toBe("Operation 'SearchFiles' is not supported by the AWS S3 provider");
      expect(error.name).toBe('UnsupportedOperationError');
    });

    it('should throw UnsupportedOperationError via helper method', () => {
      expect(() => {
        driver.testThrowUnsupportedOperationError('TestMethod');
      }).toThrow(UnsupportedOperationError);

      expect(() => {
        driver.testThrowUnsupportedOperationError('TestMethod');
      }).toThrow("Operation 'TestMethod' is not supported by the TestableProvider provider");
    });
  });

  describe('IsConfigured', () => {
    it('should return false before initialization', () => {
      expect(driver.IsConfigured).toBe(false);
    });

    it('should return true after initialization', async () => {
      await driver.initialize({ accountId: 'test' });

      expect(driver.IsConfigured).toBe(true);
    });
  });
});

describe('StorageProviderConfig interface', () => {
  it('should require accountId property', () => {
    // This is a compile-time check - if the type is wrong, TypeScript will error
    const validConfig: StorageProviderConfig = {
      accountId: 'required-account-id',
    };

    expect(validConfig.accountId).toBe('required-account-id');
  });

  it('should allow optional accountName property', () => {
    const configWithName: StorageProviderConfig = {
      accountId: 'account-1',
      accountName: 'Optional Name',
    };

    const configWithoutName: StorageProviderConfig = {
      accountId: 'account-2',
    };

    expect(configWithName.accountName).toBe('Optional Name');
    expect(configWithoutName.accountName).toBeUndefined();
  });

  it('should allow additional provider-specific properties', () => {
    const s3Config: StorageProviderConfig = {
      accountId: 'aws-account',
      accountName: 'AWS S3 Account',
      bucket: 'my-bucket',
      region: 'us-east-1',
      accessKeyId: 'AKIA...',
      secretAccessKey: 'secret...',
    };

    expect(s3Config.bucket).toBe('my-bucket');
    expect(s3Config.region).toBe('us-east-1');
  });
});
