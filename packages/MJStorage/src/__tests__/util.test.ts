/**
 * Unit tests for the MJStorage utility functions.
 * These tests focus on the initializeDriverWithAccountCredentials function
 * which is the core enterprise model for initializing storage drivers.
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
} from '../generic/FileStorageBase';
import { MJGlobal, ClassFactory } from '@memberjunction/global';
import { RegisterClass } from '@memberjunction/global';

// Mock the external dependencies
jest.mock('@memberjunction/global', () => {
  const actualGlobal = jest.requireActual('@memberjunction/global');
  return {
    ...actualGlobal,
    MJGlobal: {
      Instance: {
        ClassFactory: {
          CreateInstance: jest.fn(),
        },
      },
    },
  };
});

jest.mock('@memberjunction/credentials', () => ({
  CredentialEngine: {
    Instance: {
      Config: jest.fn().mockResolvedValue(undefined),
      getCredentialById: jest.fn(),
      getCredential: jest.fn(),
    },
  },
}));

jest.mock('@memberjunction/core', () => ({
  LogStatus: jest.fn(),
  UserInfo: class MockUserInfo {
    ID = 'test-user-id';
    Name = 'Test User';
  },
}));

// Create a concrete implementation of FileStorageBase for testing
class MockFileStorageDriver extends FileStorageBase {
  protected readonly providerName = 'MockProvider';

  public initializeCalledWith: StorageProviderConfig | null = null;
  private _isConfigured = false;

  public async initialize(config: StorageProviderConfig): Promise<void> {
    await super.initialize(config);
    this.initializeCalledWith = config;
    this._isConfigured = true;
  }

  public get IsConfigured(): boolean {
    return this._isConfigured;
  }

  // Implement all abstract methods with minimal implementations
  public async CreatePreAuthUploadUrl(objectName: string): Promise<CreatePreAuthUploadUrlPayload> {
    return { UploadUrl: `https://mock.upload.url/${objectName}` };
  }

  public async CreatePreAuthDownloadUrl(objectName: string): Promise<string> {
    return `https://mock.download.url/${objectName}`;
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
      size: 100,
      contentType: 'text/plain',
      lastModified: new Date(),
      isDirectory: false,
    };
  }

  public async GetObject(params: GetObjectParams): Promise<Buffer> {
    return Buffer.from('test content');
  }

  public async PutObject(objectName: string, data: Buffer, contentType?: string, metadata?: Record<string, string>): Promise<boolean> {
    return true;
  }

  public async CopyObject(sourceObjectName: string, destinationObjectName: string): Promise<boolean> {
    return true;
  }

  public async ObjectExists(objectName: string): Promise<boolean> {
    return true;
  }

  public async DirectoryExists(directoryPath: string): Promise<boolean> {
    return true;
  }

  public async SearchFiles(query: string, options?: FileSearchOptions): Promise<FileSearchResultSet> {
    return { results: [], hasMore: false };
  }
}

describe('initializeDriverWithAccountCredentials', () => {
  let mockDriver: MockFileStorageDriver;
  let mockAccountEntity: {
    ID: string;
    Name: string;
    CredentialID: string | null;
  };
  let mockProviderEntity: {
    Name: string;
    ServerDriverKey: string;
    Configuration: string | null;
  };
  let mockContextUser: { ID: string; Name: string };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create fresh mock instances
    mockDriver = new MockFileStorageDriver();

    // Setup the ClassFactory to return our mock driver
    (MJGlobal.Instance.ClassFactory.CreateInstance as jest.Mock).mockReturnValue(mockDriver);

    mockAccountEntity = {
      ID: 'account-123',
      Name: 'Test Storage Account',
      CredentialID: null,
    };

    mockProviderEntity = {
      Name: 'Test Provider',
      ServerDriverKey: 'TestDriver',
      Configuration: null,
    };

    mockContextUser = {
      ID: 'user-123',
      Name: 'Test User',
    };
  });

  describe('driver creation', () => {
    it('should create a driver instance using the provider ServerDriverKey', async () => {
      // Import the function we're testing
      const { initializeDriverWithAccountCredentials } = await import('../util');

      await initializeDriverWithAccountCredentials({
        accountEntity: mockAccountEntity as any,
        providerEntity: mockProviderEntity as any,
        contextUser: mockContextUser as any,
      });

      expect(MJGlobal.Instance.ClassFactory.CreateInstance).toHaveBeenCalledWith(FileStorageBase, 'TestDriver');
    });

    it('should throw an error if driver creation fails', async () => {
      (MJGlobal.Instance.ClassFactory.CreateInstance as jest.Mock).mockReturnValue(null);

      const { initializeDriverWithAccountCredentials } = await import('../util');

      await expect(
        initializeDriverWithAccountCredentials({
          accountEntity: mockAccountEntity as any,
          providerEntity: mockProviderEntity as any,
          contextUser: mockContextUser as any,
        }),
      ).rejects.toThrow(/Failed to create storage driver/);
    });
  });

  describe('account information', () => {
    it('should pass accountId from the account entity to the driver', async () => {
      const { initializeDriverWithAccountCredentials } = await import('../util');

      await initializeDriverWithAccountCredentials({
        accountEntity: mockAccountEntity as any,
        providerEntity: mockProviderEntity as any,
        contextUser: mockContextUser as any,
      });

      expect(mockDriver.initializeCalledWith).toBeDefined();
      expect(mockDriver.initializeCalledWith!.accountId).toBe('account-123');
    });

    it('should pass accountName from the account entity to the driver', async () => {
      const { initializeDriverWithAccountCredentials } = await import('../util');

      await initializeDriverWithAccountCredentials({
        accountEntity: mockAccountEntity as any,
        providerEntity: mockProviderEntity as any,
        contextUser: mockContextUser as any,
      });

      expect(mockDriver.initializeCalledWith).toBeDefined();
      expect(mockDriver.initializeCalledWith!.accountName).toBe('Test Storage Account');
    });
  });

  describe('credential handling', () => {
    it('should use Credential Engine when account has a CredentialID', async () => {
      const { CredentialEngine } = await import('@memberjunction/credentials');

      mockAccountEntity.CredentialID = 'credential-456';

      // Setup credential engine mocks
      (CredentialEngine.Instance.getCredentialById as jest.Mock).mockReturnValue({
        ID: 'credential-456',
        Name: 'Test Credential',
      });

      (CredentialEngine.Instance.getCredential as jest.Mock).mockResolvedValue({
        values: {
          accessKey: 'test-access-key',
          secretKey: 'test-secret-key',
          bucket: 'test-bucket',
        },
      });

      const { initializeDriverWithAccountCredentials } = await import('../util');

      await initializeDriverWithAccountCredentials({
        accountEntity: mockAccountEntity as any,
        providerEntity: mockProviderEntity as any,
        contextUser: mockContextUser as any,
      });

      // Verify Credential Engine was configured
      expect(CredentialEngine.Instance.Config).toHaveBeenCalledWith(false, mockContextUser);

      // Verify credential was looked up by ID
      expect(CredentialEngine.Instance.getCredentialById).toHaveBeenCalledWith('credential-456');

      // Verify getCredential was called with correct parameters
      expect(CredentialEngine.Instance.getCredential).toHaveBeenCalledWith(
        'Test Credential',
        expect.objectContaining({
          credentialId: 'credential-456',
          contextUser: mockContextUser,
          subsystem: 'FileStorage',
        }),
      );
    });

    it('should merge credential values with account info in driver config', async () => {
      const { CredentialEngine } = await import('@memberjunction/credentials');

      mockAccountEntity.CredentialID = 'credential-456';

      (CredentialEngine.Instance.getCredentialById as jest.Mock).mockReturnValue({
        ID: 'credential-456',
        Name: 'Test Credential',
      });

      (CredentialEngine.Instance.getCredential as jest.Mock).mockResolvedValue({
        values: {
          accessKey: 'decrypted-access-key',
          secretKey: 'decrypted-secret-key',
          region: 'us-west-2',
        },
      });

      const { initializeDriverWithAccountCredentials } = await import('../util');

      await initializeDriverWithAccountCredentials({
        accountEntity: mockAccountEntity as any,
        providerEntity: mockProviderEntity as any,
        contextUser: mockContextUser as any,
      });

      // Verify driver was initialized with merged config
      expect(mockDriver.initializeCalledWith).toMatchObject({
        accountId: 'account-123',
        accountName: 'Test Storage Account',
        accessKey: 'decrypted-access-key',
        secretKey: 'decrypted-secret-key',
        region: 'us-west-2',
      });

      // Verify that onTokenRefresh callback was added
      expect(mockDriver.initializeCalledWith.onTokenRefresh).toBeDefined();
      expect(typeof mockDriver.initializeCalledWith.onTokenRefresh).toBe('function');
    });

    it('should throw error if credential lookup fails', async () => {
      const { CredentialEngine } = await import('@memberjunction/credentials');

      mockAccountEntity.CredentialID = 'credential-456';

      // Return null to simulate credential not found
      (CredentialEngine.Instance.getCredentialById as jest.Mock).mockReturnValue(null);

      const { initializeDriverWithAccountCredentials } = await import('../util');

      await expect(
        initializeDriverWithAccountCredentials({
          accountEntity: mockAccountEntity as any,
          providerEntity: mockProviderEntity as any,
          contextUser: mockContextUser as any,
        }),
      ).rejects.toThrow(/Credential with ID credential-456 not found/);
    });
  });

  describe('fallback to provider configuration', () => {
    it('should use provider Configuration when no CredentialID', async () => {
      mockAccountEntity.CredentialID = null;
      mockProviderEntity.Configuration = JSON.stringify({
        defaultBucket: 'provider-default-bucket',
        defaultRegion: 'us-east-1',
      });

      const { initializeDriverWithAccountCredentials } = await import('../util');

      await initializeDriverWithAccountCredentials({
        accountEntity: mockAccountEntity as any,
        providerEntity: mockProviderEntity as any,
        contextUser: mockContextUser as any,
      });

      // Verify driver was initialized with provider config merged with account info
      expect(mockDriver.initializeCalledWith).toEqual({
        accountId: 'account-123',
        accountName: 'Test Storage Account',
        defaultBucket: 'provider-default-bucket',
        defaultRegion: 'us-east-1',
      });
    });

    it('should initialize with just account info when no credential or provider config', async () => {
      mockAccountEntity.CredentialID = null;
      mockProviderEntity.Configuration = null;

      const { initializeDriverWithAccountCredentials } = await import('../util');

      await initializeDriverWithAccountCredentials({
        accountEntity: mockAccountEntity as any,
        providerEntity: mockProviderEntity as any,
        contextUser: mockContextUser as any,
      });

      // Verify driver was initialized with only account info
      expect(mockDriver.initializeCalledWith).toEqual({
        accountId: 'account-123',
        accountName: 'Test Storage Account',
      });
    });
  });

  describe('return value', () => {
    it('should return the initialized driver', async () => {
      const { initializeDriverWithAccountCredentials } = await import('../util');

      const result = await initializeDriverWithAccountCredentials({
        accountEntity: mockAccountEntity as any,
        providerEntity: mockProviderEntity as any,
        contextUser: mockContextUser as any,
      });

      expect(result).toBe(mockDriver);
      expect(mockDriver.IsConfigured).toBe(true);
    });
  });
});
